import { Hono } from "hono";
import type { Env } from './core-utils';
import { UserEntity, ChatBoardEntity, PatientEntity, ClaimEntity, CodingJobEntity, EncounterEntity, NudgeEntity, AuditLogEntity, PaymentEntity, AnalyticsEntity, AccountEntity } from "./entities";
import { ok, bad, notFound, isStr } from './core-utils';
import type { CodingJob, Analytics, NphiesLiveStatus, NphiesBranchStatus, HospitalBranchId } from "@shared/types";
import { runCodingEngine, classifyAutomationPhase, normalizeEncounterType, type DemoAnalysisResult, type AiClinicalSummary } from "@shared/coding-engine";
import { generateCdiNudges, generateRefinementQuestions } from "@shared/cdi-rules";
import { computeCaseMixIndex, computeDepartmentDistribution, groupEncounter } from "@shared/drg-grouper";
import { NPHIES_BILINGUAL_FIELD_MAP } from "@shared/nphies-field-map";
import { HOSPITAL_BRANCHES } from "@shared/hospital-branches";
import { createToken, verifyToken, verifyPassword, generateSalt, hashPassword, type TokenPayload } from "./auth";
import type { Account } from "@shared/types";
// API routes reachable without a valid session token. Every other /api/*
// route requires 'Authorization: Bearer <token>' — this is a clinical
// coding/CDI system handling patient identifiers and diagnosis text, so
// unauthenticated read/write access to any stored record is not acceptable
// even for a demo. /api/demo/analyze-note is the one deliberate exception:
// it is pure computation over the caller's own input with no read or write
// to any stored entity (no patient, encounter, or coding-job record is ever
// touched), so it carries none of the risk that rule guards against.
const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/health', '/api/client-errors', '/api/demo/analyze-note', '/api/demo/refine-note']);
function getAuthSecret(env: Env): string {
  const secret = (env as unknown as { AUTH_SECRET?: string }).AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured on this Worker (wrangler secret put AUTH_SECRET)');
  return secret;
}
// Workers AI, called over the REST API (not a native binding) because
// wrangler.jsonc is locked and can't be edited to add one. CF_AI_TOKEN is a
// Cloudflare API token stored as a Worker secret — it never reaches the
// client and is used for nothing beyond this one call.
const CF_ACCOUNT_ID = 'd7b99530559ab4f2545e9bdc72a7ab9b';
const AI_SUMMARY_MODEL = '@cf/meta/llama-3.1-8b-instruct';
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}
// Best-effort: returns null (never throws) on any failure — missing/invalid
// credential, upstream error, timeout, or a malformed model response — so an
// AI outage never blocks the deterministic coding/DRG result, which is the
// actual, explainable source of truth this system is built on.
async function generateAiClinicalSummary(clinicalNote: string, env: Env): Promise<AiClinicalSummary | null> {
  const token = (env as unknown as { CF_AI_TOKEN?: string }).CF_AI_TOKEN;
  if (!token) return null;
  const systemPrompt = `You are a clinical documentation assistant supporting a medical coder. Given a clinical note (which may mix Arabic and English), extract ONLY what is explicitly stated:
1. "timeline": a short chronological list of the clinical events/findings documented in the note, in the order they're described (use phrases like "on presentation" or "during admission" if no explicit dates/times are given — never invent a specific date or time that isn't in the text).
2. "impression": one concise paragraph giving a plain-language diagnostic impression of the most likely primary condition(s) suggested by the documented findings.
Do not add, infer, or assume any clinical detail that is not stated or directly implied by the text. This is an assistive summary for a human coder to review, not a diagnosis. If the note is too sparse to summarize meaningfully, say so plainly in "impression" and return an empty timeline array.
Respond in the same language(s) as the note (English, Arabic, or a natural mix if the note is code-switched).
Respond with ONLY a single JSON object of the exact shape {"timeline": string[], "impression": string} — no markdown, no code fences, no extra text.`;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${AI_SUMMARY_MODEL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: clinicalNote },
          ],
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) {
      console.error('AI summary request failed', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = (await res.json()) as any;
    // The AI Gateway sometimes pre-parses a JSON-shaped reply into
    // result.response as an object; other times result.response (or
    // result.choices[0].message.content) is the raw string the model wrote.
    // Handle both instead of assuming either shape.
    const rawResponse = json?.result?.response;
    const parsed: any = rawResponse && typeof rawResponse === 'object'
      ? rawResponse
      : JSON.parse(extractJsonObject(
          typeof rawResponse === 'string' ? rawResponse : String(json?.result?.choices?.[0]?.message?.content ?? '')
        ));
    if (!Array.isArray(parsed?.timeline) || typeof parsed?.impression !== 'string') {
      console.error('AI summary response failed schema validation', JSON.stringify(parsed).slice(0, 300));
      return null;
    }
    return {
      timeline: parsed.timeline.filter((line: unknown): line is string => typeof line === 'string').slice(0, 12),
      impression: parsed.impression.slice(0, 1000),
    };
  } catch (err) {
    console.error('AI summary generation failed', err);
    return null;
  }
}
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  app.use('/api/*', async (c, next) => {
    if (PUBLIC_API_PATHS.has(c.req.path)) return next();
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    if (!token) return c.json({ success: false, error: 'Authentication required' }, 401);
    let secret: string;
    try {
      secret = getAuthSecret(c.env);
    } catch (err) {
      console.error(err);
      return c.json({ success: false, error: 'Server misconfigured' }, 500);
    }
    const payload = await verifyToken(token, secret);
    if (!payload) return c.json({ success: false, error: 'Invalid or expired session' }, 401);
    c.set('authUser' as never, payload as never);
    await next();
  });
  // Route-level guard for the admin-only surfaces (Integration Console,
  // Audit & Reconciliation, account management). Previously these pages
  // were only hidden client-side (ProtectedRoute adminOnly) — the API
  // routes behind them had no server-side role check at all, so any
  // authenticated 'coder' account could call them directly.
  const requireAdmin: Parameters<typeof app.use>[1] = async (c, next) => {
    const payload = c.get('authUser' as never) as TokenPayload | undefined;
    if (payload?.role !== 'admin') return c.json({ success: false, error: 'Admin access required' }, 403);
    await next();
  };
  // POST login: verifies a salted PBKDF2 password hash server-side and
  // issues an HMAC-signed session token. No password ever leaves the client
  // in plaintext beyond this single request, and none is ever stored in the
  // frontend bundle (contrast with the previous client-side-only mock auth).
  app.post('/api/auth/login', async (c) => {
    const { username, password } = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string };
    if (!isStr(username) || !isStr(password)) return bad(c, 'username and password are required');
    await AccountEntity.ensureSeed(c.env);
    const account = new AccountEntity(c.env, username.trim().toLowerCase());
    if (!(await account.exists())) return c.json({ success: false, error: 'Invalid username or password' }, 401);
    const state = await account.getState();
    const valid = await verifyPassword(password, state.salt, state.password_hash);
    if (!valid) return c.json({ success: false, error: 'Invalid username or password' }, 401);
    let secret: string;
    try {
      secret = getAuthSecret(c.env);
    } catch (err) {
      console.error(err);
      return c.json({ success: false, error: 'Server misconfigured' }, 500);
    }
    const token = await createToken({ username: state.username, role: state.role }, secret);
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: `user:${state.username}`, action: 'auth.login', object_type: 'account', object_id: state.username, occurred_at: new Date().toISOString() });
    return ok(c, { token, username: state.username, role: state.role });
  });
  // GET current session (already validated by the middleware above).
  app.get('/api/auth/me', (c) => ok(c, c.get('authUser' as never) as TokenPayload));
  // Admin user management: previously accounts could only be seeded, never
  // created, listed, or removed through the running app. These three routes
  // are the real backend for the Admin Accounts page — password_hash/salt
  // are never included in any response.
  const toSafeAccount = (a: Account) => ({ id: a.id, username: a.username, role: a.role });
  app.get('/api/accounts', requireAdmin, async (c) => {
    await AccountEntity.ensureSeed(c.env);
    const { items } = await AccountEntity.list(c.env);
    return ok(c, items.map(toSafeAccount));
  });
  app.post('/api/accounts', requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { username?: string; password?: string; role?: string };
    const { username, password, role } = body;
    if (!isStr(username) || !isStr(password)) return bad(c, 'username and password are required');
    if (role !== 'admin' && role !== 'coder') return bad(c, "role must be 'admin' or 'coder'");
    if (password.length < 8) return bad(c, 'password must be at least 8 characters');
    const id = username.trim().toLowerCase();
    if (!id) return bad(c, 'username is required');
    const existing = new AccountEntity(c.env, id);
    if (await existing.exists()) return c.json({ success: false, error: 'That username is already taken' }, 409);
    const salt = generateSalt();
    const password_hash = await hashPassword(password, salt);
    const account = await AccountEntity.create(c.env, { id, username: id, password_hash, salt, role });
    const actor = c.get('authUser' as never) as TokenPayload;
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: `user:${actor.username}`, action: 'account.create', object_type: 'account', object_id: id, occurred_at: new Date().toISOString() });
    return ok(c, toSafeAccount(account));
  });
  app.delete('/api/accounts/:username', requireAdmin, async (c) => {
    const id = c.req.param('username').trim().toLowerCase();
    const actor = c.get('authUser' as never) as TokenPayload;
    if (id === actor.username.toLowerCase()) return bad(c, 'You cannot delete your own account while signed in');
    const target = new AccountEntity(c.env, id);
    if (!(await target.exists())) return notFound(c, 'account');
    if ((await target.getState()).role === 'admin') {
      const { items } = await AccountEntity.list(c.env);
      const adminCount = items.filter((a) => a.role === 'admin').length;
      if (adminCount <= 1) return bad(c, 'Cannot delete the last remaining admin account');
    }
    await AccountEntity.delete(c.env, id);
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: `user:${actor.username}`, action: 'account.delete', object_type: 'account', object_id: id, occurred_at: new Date().toISOString() });
    return ok(c, { deleted: true });
  });
  // POST reset any account's password (admin-only) — re-salts and re-hashes
  // rather than touching the existing salt, so this is a full credential
  // rotation, not a weaker in-place update.
  app.post('/api/accounts/:username/password', requireAdmin, async (c) => {
    const id = c.req.param('username').trim().toLowerCase();
    const { password } = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (!isStr(password)) return bad(c, 'password is required');
    if (password.length < 8) return bad(c, 'password must be at least 8 characters');
    const target = new AccountEntity(c.env, id);
    if (!(await target.exists())) return notFound(c, 'account');
    const salt = generateSalt();
    const password_hash = await hashPassword(password, salt);
    await target.patch({ salt, password_hash });
    const actor = c.get('authUser' as never) as TokenPayload;
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: `user:${actor.username}`, action: 'account.password_reset', object_type: 'account', object_id: id, occurred_at: new Date().toISOString() });
    return ok(c, { id, reset: true });
  });
  // POST public, unauthenticated demo preview: runs the real bilingual coding
  // engine on the caller's own text and returns the result directly — no
  // patient, encounter, or coding-job record is created or touched. This is
  // what backs the homepage's "Start Demo" flow for visitors who aren't
  // signed in; signed-in users get the full persisted workflow via
  // /api/ingest-note instead. Length-capped since it's unauthenticated.
  const DEMO_NOTE_MAX_LENGTH = 4000;
  // Shared by /api/demo/analyze-note and /api/demo/refine-note: runs the full
  // public-demo pipeline (deterministic coding/DRG, CDI nudges, sequenced
  // clarifying questions, best-effort AI narrative) over whatever text is
  // passed in — the refine flow just calls this again on note text enriched
  // with the physician's question answers, so "answering a question"
  // literally re-runs the same real engine rather than faking an update.
  async function runDemoAnalysis(clinical_note: string, env: Env): Promise<DemoAnalysisResult> {
    const engineResult = runCodingEngine(clinical_note);
    const nudges = generateCdiNudges(clinical_note, 'demo');
    const questions = generateRefinementQuestions(clinical_note);
    const ai_summary = await generateAiClinicalSummary(clinical_note, env);
    return { ...engineResult, nudges, questions, ai_summary };
  }
  app.post('/api/demo/analyze-note', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const clinical_note: string = body?.clinical_note;
    if (!isStr(clinical_note) || !clinical_note.trim()) return bad(c, 'clinical_note is required');
    if (clinical_note.length > DEMO_NOTE_MAX_LENGTH) {
      return bad(c, `clinical_note must be ${DEMO_NOTE_MAX_LENGTH} characters or fewer for the public demo — sign in for the full workspace`);
    }
    try {
      // 'demo' as the encounter id is safe here: nudges/questions are never
      // persisted, it only shapes their (also ephemeral) id strings.
      return ok(c, await runDemoAnalysis(clinical_note, c.env));
    } catch (err) {
      console.error('demo/analyze-note error', err);
      return bad(c, 'failed to analyze note');
    }
  });
  // POST public, unauthenticated refinement step: takes the original note
  // plus free-text answers collected from the sequenced clarifying-question
  // wizard, appends them as an explicit clarification block, and re-runs the
  // exact same real pipeline — this is the "sequenced informed questions...
  // that build the acquired code" flow. No separate answer-interpretation
  // model: the answers are the literal keywords the deterministic engine
  // already looks for, so the effect on the re-coded result is direct and
  // explainable, not a black-box adjustment.
  app.post('/api/demo/refine-note', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const clinical_note: string = body?.clinical_note;
    const answers: unknown = body?.answers;
    if (!isStr(clinical_note) || !clinical_note.trim()) return bad(c, 'clinical_note is required');
    if (clinical_note.length > DEMO_NOTE_MAX_LENGTH) {
      return bad(c, `clinical_note must be ${DEMO_NOTE_MAX_LENGTH} characters or fewer for the public demo — sign in for the full workspace`);
    }
    if (!Array.isArray(answers) || answers.some((a) => typeof a !== 'string')) {
      return bad(c, 'answers must be an array of strings');
    }
    const cleanAnswers = (answers as string[]).map((a) => a.trim()).filter(Boolean).slice(0, 20);
    if (cleanAnswers.length === 0) return bad(c, 'at least one answer is required');
    const enrichedNote = cleanAnswers.length > 0
      ? `${clinical_note}\n\nAdditional clarification: ${cleanAnswers.join('. ')}.`
      : clinical_note;
    if (enrichedNote.length > DEMO_NOTE_MAX_LENGTH * 2) {
      return bad(c, 'combined note and answers are too long for the public demo');
    }
    try {
      return ok(c, await runDemoAnalysis(enrichedNote, c.env));
    } catch (err) {
      console.error('demo/refine-note error', err);
      return bad(c, 'failed to refine analysis');
    }
  });
  // GET the bilingual nphies/Etimad field mapping table (PRD Section 4.0)
  app.get('/api/nphies-field-map', requireAdmin, async (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return ok(c, NPHIES_BILINGUAL_FIELD_MAP);
  });
  // GET live status of the real NPHIES mirror + Oracle Health bridge (server-side
  // proxy to nphies-mirror and oracle-bridge — both already hold the real,
  // properly-secured NPHIES/Oracle credentials, so this Worker never needs to see
  // or store them itself). Best-effort: if either upstream is unreachable, degrade
  // gracefully rather than fail the request.
  //
  // nphies-mirror is fetched via its workers.dev URL rather than
  // api.brainsait.org/nphies-mirror/*: that custom-domain path's DNS is routed
  // through the "hayath-mcp" Cloudflare Tunnel, and Workers subrequests to a
  // Tunnel-routed hostname on the same account fail with edge error 1033 (they
  // don't get intercepted by the Workers Route the way a real browser/client
  // request does). The workers.dev URL reaches the same script directly.
  app.get('/api/nphies-status', requireAdmin, async (c) => {
    c.header('Cache-Control', 'public, max-age=120');
    const withTimeout = (url: string, ms = 8000) => fetch(url, { signal: AbortSignal.timeout(ms) });
    const [summaryResult, oracleResult] = await Promise.allSettled([
      withTimeout('https://nphies-mirror.brainsait-fadil.workers.dev/mirror/summary').then((r) => r.json() as Promise<any>),
      withTimeout('https://oracle-bridge.brainsait.org/health').then((r) => r.json() as Promise<any>),
    ]);
    if (summaryResult.status === 'rejected') console.error('[nphies-status] nphies-mirror fetch failed:', summaryResult.reason);
    if (oracleResult.status === 'rejected') console.error('[nphies-status] oracle-bridge fetch failed:', oracleResult.reason);
    const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
    const oracle = oracleResult.status === 'fulfilled' ? oracleResult.value : null;
    const oraclePortals: Record<string, string> = oracle?.portals ?? {};
    const branches: NphiesBranchStatus[] = HOSPITAL_BRANCHES.map((b) => {
      const branchData = summary?.branches?.[b.id] ?? {};
      return {
        branch: b.id as HospitalBranchId,
        gss: branchData.gss ?? 0,
        pa: branchData.pa ?? 0,
        coc: branchData.coc ?? 0,
        sc: branchData.sc ?? 0,
        synced_at: branchData.synced_at ?? null,
        stale: branchData.stale ?? true,
        oracle_portal_status: (oraclePortals[b.id] as NphiesBranchStatus['oracle_portal_status']) ?? 'unknown',
      };
    });
    const status: NphiesLiveStatus = {
      nphies_auth_healthy: summary?.auth_healthy ?? false,
      last_sync_attempt: summary?.last_sync_attempt ?? null,
      last_good_sync: summary?.last_good_sync ?? null,
      sync_error: summary?.sync_error ?? (summaryResult.status === 'rejected' ? 'nphies-mirror unreachable' : null),
      oracle_bridge_reachable: oracleResult.status === 'fulfilled',
      branches,
    };
    return ok(c, status);
  });
  // --- SEEDING HELPER ---
  // Once this isolate has confirmed seeds exist, skip the 8 parallel index
  // reads on every subsequent request — pure latency with no effect after
  // the first pass, and shaves real time off the hot request path (a cold
  // Durable Object plus this check was measurable overhead on ingest-note).
  let seedsEnsured = false;
  const ensureAllSeeds = async (env: Env) => {
    if (seedsEnsured) return;
    await Promise.all([
      PatientEntity.ensureSeed(env),
      EncounterEntity.ensureSeed(env),
      ClaimEntity.ensureSeed(env),
      CodingJobEntity.ensureSeed(env),
      NudgeEntity.ensureSeed(env),
      AuditLogEntity.ensureSeed(env),
      PaymentEntity.ensureSeed(env),
      AnalyticsEntity.ensureSeed(env),
    ]);
    seedsEnsured = true;
  };
  // --- DEMO ROUTES (can be removed) ---
  app.get('/api/users', async (c) => {
    await UserEntity.ensureSeed(c.env);
    const page = await UserEntity.list(c.env, c.req.query('cursor') ?? null, 10);
    return ok(c, page);
  });
  app.post('/api/users', async (c) => {
    const { name } = (await c.req.json()) as { name?: string };
    if (!name?.trim()) return bad(c, 'name required');
    return ok(c, await UserEntity.create(c.env, { id: crypto.randomUUID(), name: name.trim() }));
  });
  app.get('/api/chats', async (c) => {
    await ChatBoardEntity.ensureSeed(c.env);
    const page = await ChatBoardEntity.list(c.env, c.req.query('cursor') ?? null, 10);
    return ok(c, page);
  });
  app.post('/api/chats', async (c) => {
    const { title } = (await c.req.json()) as { title?: string };
    if (!title?.trim()) return bad(c, 'title required');
    const created = await ChatBoardEntity.create(c.env, { id: crypto.randomUUID(), title: title.trim(), messages: [] });
    return ok(c, { id: created.id, title: created.title });
  });
  app.get('/api/chats/:chatId/messages', async (c) => {
    const chat = new ChatBoardEntity(c.env, c.req.param('chatId'));
    if (!await chat.exists()) return notFound(c, 'chat not found');
    return ok(c, await chat.listMessages());
  });
  app.post('/api/chats/:chatId/messages', async (c) => {
    const chatId = c.req.param('chatId');
    const { userId, text } = (await c.req.json()) as { userId?: string; text?: string };
    if (!isStr(userId) || !text?.trim()) return bad(c, 'userId and text required');
    const chat = new ChatBoardEntity(c.env, chatId);
    if (!await chat.exists()) return notFound(c, 'chat not found');
    return ok(c, await chat.sendMessage(userId, text.trim()));
  });
  // --- SOLVENTUM DRG SUITE ROUTES ---
  // GET Claims (paginated and filterable)
  app.get('/api/claims', async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=60');
    const status = c.req.query('status');
    const limit = Number(c.req.query('limit') ?? 10);
    const cursor = c.req.query('cursor');
    const { items, next } = await ClaimEntity.list(c.env, cursor, limit * 2); // Fetch more to filter
    const filteredItems = status && status !== 'all' ? items.filter(claim => claim.status === status) : items;
    return ok(c, { items: filteredItems.slice(0, limit), next });
  });
  // GET Coding Jobs (paginated)
  app.get('/api/coding-jobs', async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=60');
    const limit = Number(c.req.query('limit') ?? 5);
    const cursor = c.req.query('cursor');
    const page = await CodingJobEntity.list(c.env, cursor, limit);
    return ok(c, page);
  });
  // GET a single encounter with its patient joined — the Coding Workspace uses
  // this to show the real patient tied to a job instead of a placeholder name.
  app.get('/api/encounters/:id', async (c) => {
    await ensureAllSeeds(c.env);
    const id = c.req.param('id');
    const encounter = new EncounterEntity(c.env, id);
    if (!(await encounter.exists())) return notFound(c, 'encounter not found');
    const state = await encounter.getState();
    const patientEntity = new PatientEntity(c.env, state.patient_id);
    const patient = (await patientEntity.exists()) ? await patientEntity.getState() : null;
    return ok(c, { ...state, patient });
  });
  // POST Ingest Note (bilingual AR/EN coding engine + APR-DRG grouper)
  app.post('/api/ingest-note', async (c) => {
    const jobId = crypto.randomUUID();
    try {
      await ensureAllSeeds(c.env);
      const body = await c.req.json();
      const clinical_note: string = body?.clinical_note;
      const visit_complexity: string = body?.visit_complexity || 'standard';
      const age: number | undefined = typeof body?.age === 'number' ? body.age : undefined;
      const encounter_type = normalizeEncounterType(body?.encounter_type);
      const branch = HOSPITAL_BRANCHES.some((b) => b.id === body?.branch) ? (body.branch as HospitalBranchId) : undefined;
      if (!isStr(clinical_note)) {
        await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'note.ingestion_failed', object_type: 'coding_job', object_id: jobId, occurred_at: new Date().toISOString() });
        return bad(c, 'clinical_note is required');
      }
      // Bounded to a clinically plausible human age range so a garbage value
      // (unit-conversion bug, negative offset, accidental day-count) doesn't
      // silently fold into the ROM neonatal/geriatric adjustments below.
      if (age !== undefined && (age < 0 || age > 120)) {
        return bad(c, 'age must be between 0 and 120');
      }
      const engineResult = runCodingEngine(clinical_note, { age, encounterType: encounter_type });
      const { phase, status } = classifyAutomationPhase(engineResult.confidence_score, visit_complexity);
      // Encounter lookup and the AI summary call are independent — run them
      // concurrently rather than paying the AI call's latency (~1-3s) on top
      // of a sequential DB read.
      const [encounters, ai_summary] = await Promise.all([
        EncounterEntity.list(c.env, null, 1),
        generateAiClinicalSummary(clinical_note, c.env),
      ]);
      const encounter_id = encounters.items.length > 0 ? encounters.items[0].id : 'e_mock_fallback';
      const questions = generateRefinementQuestions(clinical_note, { age, encounterType: encounter_type });
      const newJob: CodingJob = {
        id: jobId,
        encounter_id,
        branch,
        suggested_codes: engineResult.suggested_codes,
        suggested_procedures: engineResult.suggested_procedures,
        status,
        confidence_score: engineResult.confidence_score,
        phase,
        created_at: new Date().toISOString(),
        source_text: clinical_note,
        principal_code: engineResult.principal_code,
        secondary_codes: engineResult.secondary_codes,
        drg: engineResult.drg,
        detected_language: engineResult.detected_language,
        ai_summary,
        questions,
      };
      const newAnalytics: Analytics = {
        id: crypto.randomUUID(),
        job_id: newJob.id,
        accuracy: Math.round(engineResult.confidence_score * 100),
        phase: newJob.phase,
        relative_weight: engineResult.drg.relative_weight,
        soi: engineResult.drg.soi,
        rom: engineResult.drg.rom,
        drg_family: engineResult.drg.code,
        department_en: engineResult.drg.department_en,
        department_ar: engineResult.drg.department_ar,
        created_at: new Date().toISOString(),
      };
      // Generate bilingual CDI nudges for this encounter from the same lexicon pass.
      const nudges = generateCdiNudges(clinical_note, encounter_id, { age, encounterType: encounter_type });
      // Every write below is independent of the others (different entities,
      // no shared state), so they're issued concurrently instead of one
      // sequential round trip after another — this was the single biggest
      // contributor to ingest-note's latency (each round trip to the backing
      // Durable Object was ~200-400ms, and up to 4-8 of them were previously
      // chained one at a time).
      const auditWrites = [
        AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: `note.ingested.${engineResult.detected_language}`, object_type: 'coding_job', object_id: newJob.id, occurred_at: new Date().toISOString() }),
      ];
      if (status === 'SENT_TO_NPHIES') {
        // This records the automation *policy* decision (PRD Phase 3: high-confidence,
        // low-complexity outpatient cases are classified for autonomous submission) —
        // it does NOT mean a claim was actually transmitted to NPHIES. No real
        // submission gateway is wired up yet (see /api/coding-jobs/:id/prepare-claim
        // and the Integration Console's live NPHIES status panel).
        auditWrites.push(AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'claim.autonomous_phase_classified', object_type: 'coding_job', object_id: jobId, occurred_at: new Date().toISOString() }));
      }
      await Promise.all([
        CodingJobEntity.create(c.env, newJob),
        AnalyticsEntity.create(c.env, newAnalytics),
        ...nudges.map(async (nudge) => {
          const existing = new NudgeEntity(c.env, nudge.id);
          if (!(await existing.exists())) {
            await NudgeEntity.create(c.env, nudge);
          }
        }),
        ...auditWrites,
      ]);
      return ok(c, newJob);
    } catch (err: any) {
      console.error('ingest-note error', err);
      await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'note.ingestion_failed', object_type: 'coding_job', object_id: jobId, occurred_at: new Date().toISOString() });
      return bad(c, 'failed to ingest note');
    }
  });
  // POST Accept Coding Job Suggestions
  app.post('/api/coding-jobs/:id/accept', async (c) => {
    const id = c.req.param('id');
    const job = new CodingJobEntity(c.env, id);
    if (!await job.exists()) return notFound(c);
    await job.patch({ status: 'AUTO_DROP' });
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'user:coder@hospital.sa', action: 'coding_job.accepted', object_type: 'coding_job', object_id: id, occurred_at: new Date().toISOString() });
    return ok(c, { id, status: 'accepted' });
  });
  // POST confirm a single suggested code on a job — the per-row checkmark in
  // the Coding Workspace previously had no handler at all.
  app.post('/api/coding-jobs/:id/codes/:code/accept', async (c) => {
    const id = c.req.param('id');
    const code = c.req.param('code');
    const job = new CodingJobEntity(c.env, id);
    if (!(await job.exists())) return notFound(c);
    const state = await job.getState();
    if (!state.suggested_codes.some((sc) => sc.code === code)) return notFound(c, 'code not found on this job');
    const suggested_codes = state.suggested_codes.map((sc) => (sc.code === code ? { ...sc, confirmed: true } : sc));
    await job.patch({ suggested_codes });
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'user:coder@hospital.sa', action: 'coding_job.code_confirmed', object_type: 'coding_job', object_id: id, occurred_at: new Date().toISOString() });
    return ok(c, { id, code, confirmed: true });
  });
  // POST reject a single suggested code — removes it from the job and, if it
  // was the principal diagnosis, re-elects a new principal from what's left
  // and re-runs the real DRG grouper (same ranking electPrincipal uses), so
  // rejecting a false-positive code has a real, visible effect on the DRG
  // rather than just hiding a table row.
  app.post('/api/coding-jobs/:id/codes/:code/reject', async (c) => {
    const id = c.req.param('id');
    const code = c.req.param('code');
    const job = new CodingJobEntity(c.env, id);
    if (!(await job.exists())) return notFound(c);
    const state = await job.getState();
    const remaining = state.suggested_codes.filter((sc) => sc.code !== code);
    if (remaining.length === state.suggested_codes.length) return notFound(c, 'code not found on this job');
    if (remaining.length === 0) return bad(c, 'cannot reject the only remaining code on a job');
    let principal_code = state.principal_code;
    let drg = state.drg;
    if (state.principal_code === code) {
      const ranked = [...remaining].sort((a, b) => {
        const scoreA = a.confidence * (1 + (a.soi_weight ?? 0) + (a.rom_weight ?? 0));
        const scoreB = b.confidence * (1 + (b.soi_weight ?? 0) + (b.rom_weight ?? 0));
        return scoreB - scoreA;
      });
      principal_code = ranked[0].code;
    }
    if (principal_code) {
      drg = groupEncounter({
        principalCode: principal_code,
        secondaryCodes: remaining.filter((sc) => sc.code !== principal_code).map((sc) => sc.code),
        procedureCodes: (state.suggested_procedures ?? []).map((p) => p.code),
      });
    }
    const suggested_codes = remaining.map((sc) => ({ ...sc, is_principal: sc.code === principal_code }));
    const secondary_codes = (state.secondary_codes ?? []).filter((sc) => sc !== code);
    await job.patch({ suggested_codes, secondary_codes, principal_code, drg });
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'user:coder@hospital.sa', action: 'coding_job.code_rejected', object_type: 'coding_job', object_id: id, occurred_at: new Date().toISOString() });
    return ok(c, { id, code, rejected: true, principal_code, drg });
  });
  // POST the authenticated, persisted equivalent of the public demo's
  // refine-note: appends the coder's answers to the outstanding
  // RefinementQuestions as clarifying text, re-runs the real engine on the
  // enriched note, and PATCHES the job in place — the persisted record
  // itself gets more specific, not just a throwaway preview.
  app.post('/api/coding-jobs/:id/refine', async (c) => {
    const id = c.req.param('id');
    const job = new CodingJobEntity(c.env, id);
    if (!(await job.exists())) return notFound(c);
    const state = await job.getState();
    if (!isStr(state.source_text) || !state.source_text.trim()) return bad(c, 'this coding job has no source text to refine');
    const body = await c.req.json().catch(() => ({}));
    const answers: unknown = body?.answers;
    if (!Array.isArray(answers) || answers.some((a) => typeof a !== 'string')) return bad(c, 'answers must be an array of strings');
    const cleanAnswers = (answers as string[]).map((a) => a.trim()).filter(Boolean).slice(0, 20);
    if (cleanAnswers.length === 0) return bad(c, 'at least one answer is required');
    const enrichedNote = `${state.source_text}\n\nAdditional clarification: ${cleanAnswers.join('. ')}.`;
    const engineResult = runCodingEngine(enrichedNote);
    const { phase, status } = classifyAutomationPhase(engineResult.confidence_score, 'standard');
    const [nudges, ai_summary] = await Promise.all([
      Promise.resolve(generateCdiNudges(enrichedNote, state.encounter_id)),
      generateAiClinicalSummary(enrichedNote, c.env),
    ]);
    const questions = generateRefinementQuestions(enrichedNote);
    const updated: Partial<CodingJob> = {
      source_text: enrichedNote,
      suggested_codes: engineResult.suggested_codes,
      suggested_procedures: engineResult.suggested_procedures,
      principal_code: engineResult.principal_code,
      secondary_codes: engineResult.secondary_codes,
      drg: engineResult.drg,
      confidence_score: engineResult.confidence_score,
      detected_language: engineResult.detected_language,
      ai_summary,
      questions,
      // A job already accepted/dropped by a coder keeps that status — refining
      // it shouldn't silently revert an explicit human decision.
      ...(state.status === 'AUTO_DROP' ? {} : { status, phase }),
    };
    await job.patch(updated);
    await Promise.all(
      nudges.map(async (nudge) => {
        const existing = new NudgeEntity(c.env, nudge.id);
        if (!(await existing.exists())) await NudgeEntity.create(c.env, nudge);
      })
    );
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'user:coder@hospital.sa', action: 'coding_job.refined', object_type: 'coding_job', object_id: id, occurred_at: new Date().toISOString() });
    const finalState = await job.getState();
    return ok(c, finalState);
  });
  // POST Prepare NPHIES Claim: builds the real claim payload shape and validates
  // readiness, but does NOT fabricate a "submitted" result — no live NPHIES claim-
  // submission gateway is wired up yet (nphies-mirror, the one real, credentialed
  // NPHIES service found in this account, only exposes a read-only viewer/reporting
  // API). This is the honest, intentional stopping point until that gateway exists.
  app.post('/api/coding-jobs/:id/prepare-claim', async (c) => {
    const id = c.req.param('id');
    const job = new CodingJobEntity(c.env, id);
    if (!await job.exists()) return notFound(c);
    const state = await job.getState();
    if (!state.principal_code || !state.drg) {
      return bad(c, 'coding job is missing a principal diagnosis or DRG grouping');
    }
    const claimPayload = {
      encounter_id: state.encounter_id,
      branch: state.branch ?? null,
      principal_code: state.principal_code,
      secondary_codes: state.secondary_codes ?? [],
      procedure_codes: (state.suggested_procedures ?? []).map((p) => p.code),
      drg_subclass: state.drg.subclass,
      relative_weight: state.drg.relative_weight,
      partition: state.drg.partition,
      prepared_at: new Date().toISOString(),
    };
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'user:coder@hospital.sa', action: 'claim.prepared', object_type: 'coding_job', object_id: id, occurred_at: new Date().toISOString() });
    return ok(c, {
      status: 'PREPARED_PENDING_GATEWAY',
      claim_payload: claimPayload,
      message: 'Claim payload prepared. Live NPHIES submission is not yet available — the real nphies-mirror service currently only exposes read-only reporting data, and its sync has been failing (see Integration Console for live status).',
    });
  });
  // GET Nudges
  app.get('/api/nudges', async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=120');
    const limit = Number(c.req.query('limit') ?? 10);
    const cursor = c.req.query('cursor');
    const page = await NudgeEntity.list(c.env, cursor, limit);
    return ok(c, page);
  });
  // POST Apply Nudge (mock)
  app.post('/api/nudges/:id/apply', async (c) => {
    const nudgeId = c.req.param('id');
    const nudge = new NudgeEntity(c.env, nudgeId);
    if (!await nudge.exists()) return notFound(c, 'nudge not found');
    await nudge.patch({ status: 'resolved' });
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'user:mock_user', action: 'nudge.applied', object_type: 'nudge', object_id: nudgeId, occurred_at: new Date().toISOString() });
    return ok(c, { id: nudgeId, status: 'resolved' });
  });
  // GET Audit Logs
  app.get('/api/audit-logs', requireAdmin, async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=30');
    const limit = Number(c.req.query('limit') ?? 10);
    const cursor = c.req.query('cursor');
    const page = await AuditLogEntity.list(c.env, cursor, limit);
    return ok(c, page);
  });
  // GET Payments
  app.get('/api/payments', requireAdmin, async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=120');
    const limit = Number(c.req.query('limit') ?? 10);
    const cursor = c.req.query('cursor');
    const page = await PaymentEntity.list(c.env, cursor, limit);
    return ok(c, page);
  });
  // POST Reconcile Batch (mock)
  app.post('/api/reconcile-batch', requireAdmin, async (c) => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const { items } = await PaymentEntity.list(c.env);
    const unreconciled = items.filter(p => !p.reconciled);
    for (const payment of unreconciled.slice(0, 2)) { // Reconcile up to 2
        const pEntity = new PaymentEntity(c.env, payment.id);
        await pEntity.patch({ reconciled: true });
    }
    await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'payment.batch_reconciled', object_type: 'system_job', object_id: `job_${Date.now()}`, occurred_at: new Date().toISOString() });
    return ok(c, { status: 'completed', reconciled_count: Math.min(2, unreconciled.length) });
  });
  // GET Analytics
  app.get('/api/analytics', async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    try {
      const { items: analyticsItems } = await AnalyticsEntity.list(c.env);
      const { items: claimsItems } = await ClaimEntity.list(c.env);
      const avgAccuracy = analyticsItems.length > 0
        ? analyticsItems.reduce((sum, a) => sum + a.accuracy, 0) / analyticsItems.length
        : 0;
      const approved = claimsItems.filter(cl => cl.status === 'FC_3').length;
      const rejected = claimsItems.filter(cl => cl.status === 'REJECTED').length;
      const totalAmount = claimsItems.reduce((sum, cl) => sum + cl.amount, 0);
      const weighted = analyticsItems.filter(a => typeof a.relative_weight === 'number') as (Analytics & { relative_weight: number })[];
      const caseMixIndex = computeCaseMixIndex(weighted);
      const soiDistribution: Record<string, number> = {};
      for (const a of analyticsItems) {
        if (typeof a.soi === 'number') {
          const key = String(a.soi);
          soiDistribution[key] = (soiDistribution[key] ?? 0) + 1;
        }
      }
      const departmentRows = analyticsItems.filter(
        (a): a is Analytics & { relative_weight: number; department_en: string; department_ar: string } =>
          typeof a.relative_weight === 'number' && typeof a.department_en === 'string' && typeof a.department_ar === 'string'
      );
      const departmentDistribution = computeDepartmentDistribution(departmentRows);
      await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'analytics.queried', object_type: 'system', object_id: 'dashboard', occurred_at: new Date().toISOString() });
      return ok(c, {
        accuracy: Math.round(avgAccuracy),
        claimStats: { approved, rejected, totalAmount },
        caseMixIndex,
        soiDistribution,
        departmentDistribution,
      });
    } catch (error) {
      console.error("Analytics endpoint error:", error);
      return bad(c, "Failed to retrieve analytics data.");
    }
  });
}