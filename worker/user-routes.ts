import { Hono } from "hono";
import type { Env } from './core-utils';
import { UserEntity, ChatBoardEntity, PatientEntity, ClaimEntity, CodingJobEntity, EncounterEntity, NudgeEntity, AuditLogEntity, PaymentEntity, AnalyticsEntity } from "./entities";
import { ok, bad, notFound, isStr } from './core-utils';
import type { CodingJob, SuggestedCode, Analytics } from "@shared/types";
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  // --- SEEDING HELPER ---
  const ensureAllSeeds = async (env: Env) => {
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
  // POST Ingest Note (enhanced mock coding engine)
  app.post('/api/ingest-note', async (c) => {
    const jobId = crypto.randomUUID();
    try {
      await ensureAllSeeds(c.env);
      const body = await c.req.json();
      const clinical_note: string = body?.clinical_note;
      const use_real_nlp: boolean = body?.real_nlp === true;
      const visit_complexity: string = body?.visit_complexity || 'standard';
      if (!isStr(clinical_note)) {
        await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'note.ingestion_failed', object_type: 'coding_job', object_id: jobId, occurred_at: new Date().toISOString() });
        return bad(c, 'clinical_note is required');
      }
      const TERM_MAP = [
        { synonyms: ['pneumonia', 'pneumonitis', 'سعال شديد'], code: 'J18.9', desc: 'Pneumonia, unspecified organism', confidence: 0.85 },
        { synonyms: ['myocardial infarction', 'mi', 'heart attack', 'myocardial infarct'], code: 'I21.9', desc: 'Acute MI, unspecified', confidence: 0.99 },
        { synonyms: ['appendicitis', 'appendix pain', 'appendix inflammation', 'ألم الزائدة'], code: 'K37', desc: 'Unspecified appendicitis', confidence: 0.95 },
        { synonyms: ['uti', 'urinary tract infection'], code: 'N39.0', desc: 'Urinary tract infection, site not specified', confidence: 0.80 },
        { synonyms: ['left leg fracture', 'left tibia fracture'], code: 'S82.202A', desc: 'Unspecified fracture of shaft of left tibia, initial encounter', confidence: 0.88 },
        { synonyms: ['right leg fracture', 'right tibia fracture'], code: 'S82.201A', desc: 'Unspecified fracture of shaft of right tibia, initial encounter', confidence: 0.88 },
        { synonyms: ['fracture', 'broken bone', 'كسر'], code: 'S82.90XA', desc: 'Unspecified fracture of lower leg, check laterality', confidence: 0.75 },
        { synonyms: ['diabetes', 'sukari', 'diabetic'], code: 'E11.9', desc: 'Type 2 diabetes mellitus without complications', confidence: 0.92 },
        { synonyms: ['hypertension', 'high blood pressure', 'ضغط دم مرتفع'], code: 'I10', desc: 'Essential (primary) hypertension', confidence: 0.98 },
        { synonyms: ['cough'], code: 'R05', desc: 'Cough', confidence: 0.95 },
      ];
      let suggested_codes: SuggestedCode[] = [];
      let auditAction = 'note.ingested.keyword_fallback';
      if (use_real_nlp) {
        // Simulate a call to an external NLP service like OpenAI
        await new Promise(res => setTimeout(res, 500)); // Mock network latency
        auditAction = 'note.ingested.nlp_integrated';
      }
      const seenCodes = new Set<string>();
      for (const entry of TERM_MAP) {
        for (const syn of entry.synonyms) {
          const re = new RegExp(`\\b${syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (re.test(clinical_note)) {
            if (!seenCodes.has(entry.code)) {
              const confidenceWithVariance = Math.min(0.99, entry.confidence + (Math.random() * 0.10 - 0.05));
              suggested_codes.push({ code: entry.code, desc: entry.desc, confidence: parseFloat(confidenceWithVariance.toFixed(2)) });
              seenCodes.add(entry.code);
            }
            break;
          }
        }
      }
      if (suggested_codes.length === 0) {
        suggested_codes.push({ code: 'Z00.00', desc: 'General medical examination, unspecified', confidence: 0.50 });
      }
      const confidence_score = parseFloat((suggested_codes.reduce((acc, code) => acc + code.confidence, 0) / suggested_codes.length).toFixed(2));
      let phase: CodingJob['phase'] = 'CAC';
      let status: CodingJob['status'] = 'NEEDS_REVIEW';
      if (confidence_score > 0.98 && visit_complexity === 'low-complexity outpatient') {
        phase = 'AUTONOMOUS';
        status = 'SENT_TO_NPHIES';
      } else if (confidence_score > 0.90) {
        phase = 'SEMI_AUTONOMOUS';
        status = 'AUTO_DROP';
      }
      const encounters = await EncounterEntity.list(c.env, null, 1);
      const encounter_id = encounters.items.length > 0 ? encounters.items[0].id : 'e_mock_fallback';
      const newJob: CodingJob = {
        id: jobId,
        encounter_id,
        suggested_codes,
        status,
        confidence_score,
        phase,
        created_at: new Date().toISOString(),
        source_text: clinical_note,
      };
      await CodingJobEntity.create(c.env, newJob);
      const accuracy = Math.round(confidence_score * 100);
      const newAnalytics: Analytics = {
        id: crypto.randomUUID(),
        job_id: newJob.id,
        accuracy: accuracy,
        phase: newJob.phase,
        created_at: new Date().toISOString(),
      };
      await AnalyticsEntity.create(c.env, newAnalytics);
      await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: auditAction, object_type: 'coding_job', object_id: newJob.id, occurred_at: new Date().toISOString() });
      if (status === 'SENT_TO_NPHIES') {
        await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'claim.submitted_to_nphies', object_type: 'coding_job', object_id: jobId, occurred_at: new Date().toISOString() });
      }
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
  app.get('/api/audit-logs', async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=30');
    const limit = Number(c.req.query('limit') ?? 10);
    const cursor = c.req.query('cursor');
    const page = await AuditLogEntity.list(c.env, cursor, limit);
    return ok(c, page);
  });
  // GET Payments
  app.get('/api/payments', async (c) => {
    await ensureAllSeeds(c.env);
    c.header('Cache-Control', 'public, max-age=120');
    const limit = Number(c.req.query('limit') ?? 10);
    const cursor = c.req.query('cursor');
    const page = await PaymentEntity.list(c.env, cursor, limit);
    return ok(c, page);
  });
  // POST Reconcile Batch (mock)
  app.post('/api/reconcile-batch', async (c) => {
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
      await AuditLogEntity.create(c.env, { id: crypto.randomUUID(), actor: 'system', action: 'analytics.queried', object_type: 'system', object_id: 'dashboard', occurred_at: new Date().toISOString() });
      return ok(c, {
        accuracy: Math.round(avgAccuracy),
        claimStats: { approved, rejected, totalAmount }
      });
    } catch (error) {
      console.error("Analytics endpoint error:", error);
      return bad(c, "Failed to retrieve analytics data.");
    }
  });
}