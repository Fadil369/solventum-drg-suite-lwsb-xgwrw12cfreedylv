/**
 * BrainSAIT Bilingual Code-Switching Coding Engine
 * ---------------------------------------------------------------------------
 * Saudi clinical notes routinely mix English and Arabic within a single
 * sentence ("ضغط دم مرتفع controlled with medication"), or use Latin-script
 * Arabic colloquialisms ("sukari" for diabetes). This engine tokenizes and
 * matches *both* languages in a single deterministic pass against the
 * bilingual lexicon, applies negation/uncertainty detection in either
 * language, dedupes to the most specific code, elects a principal diagnosis,
 * and hands the result to the APR-DRG grouper — producing an
 * explainable, reproducible coding decision (no randomness) instead of a
 * black-box guess.
 *
 * This module is the single source of truth shared by the Cloudflare Worker
 * edge API (`worker/user-routes.ts`) and is mirrored in the Python core
 * service (`src/backend/coding_engine.py`) for the AWS backend persona.
 */
import {
  BILINGUAL_LEXICON,
  LexiconEntry,
  NEGATION_TERMS_EN,
  NEGATION_TERMS_AR,
  UNCERTAINTY_TERMS_EN,
  UNCERTAINTY_TERMS_AR,
} from './bilingual-lexicon';
import { PROCEDURE_LEXICON, ProcedureEntry } from './procedure-lexicon';
import { groupEncounter } from './drg-grouper';
import type { CodingJob, SuggestedCode, SuggestedProcedure, DrgResult, Nudge, AiClinicalSummary, RefinementQuestion } from './types';
export type { AiClinicalSummary, RefinementOption, RefinementQuestion } from './types';
export const ENGINE_VERSION = '2.0.0-bilingual';
export function stripArabicDiacritics(text: string): string {
  return text.replace(/[ً-ْٰـ]/g, '');
}
export function detectLanguage(text: string): 'en' | 'ar' | 'mixed' {
  const arabicChars = (text.match(/[؀-ۿ]/g) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  if (arabicChars > 0 && latinChars > 0) return 'mixed';
  if (arabicChars > 0) return 'ar';
  return 'en';
}
/**
 * Normalizes an untrusted `encounter_type` value from request JSON. The
 * grouper selects APR-DRG vs. EAPG methodology by exact string equality
 * against 'OUTPATIENT', so a mis-cased or misspelled value (e.g.
 * "outpatient") would otherwise silently fall through to APR-DRG with the
 * wrong methodology and relative weight. Defaults to 'INPATIENT' for any
 * unrecognized input rather than rejecting the request, consistent with how
 * this API tolerates other optional fields (see visit_complexity).
 */
export function normalizeEncounterType(raw: unknown): 'INPATIENT' | 'OUTPATIENT' | 'ED' {
  const upper = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (upper === 'OUTPATIENT' || upper === 'ED' || upper === 'INPATIENT') return upper;
  return 'INPATIENT';
}
// Cached so each term's regex is compiled once and reused across every note
// analyzed, rather than recompiled on every call — this runs once per
// lexicon synonym/negation/uncertainty/modifier-keyword term per note, which
// adds up fast on CPU-constrained edge runtimes like Cloudflare Workers.
const regexCache = new Map<string, RegExp>();
export function buildRegexForTerm(term: string): RegExp {
  let re = regexCache.get(term);
  if (!re) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Unicode-aware word boundary: JS's \b only understands ASCII word
    // characters, so it fails on Arabic script. This lookaround works for both.
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
    regexCache.set(term, re);
  }
  return re;
}
// Whole-word containment check. A plain `.includes()` would false-positive on
// e.g. "no" inside "known" or "normal" (or "art" inside "heart") — a real bug
// this project hit while testing negation detection ("Patient with known
// cirrhosis" was incorrectly treated as negated because "known" contains "no").
// Exported so cdi-rules.ts can reuse the exact same matching semantics.
export function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => buildRegexForTerm(n).test(haystack));
}
const NEGATION_CONTEXT_WINDOW = 40;
// Clause boundaries a post-term negator must not cross: "Chest pain,
// myocardial infarction ruled out" must negate only "myocardial
// infarction" — if the post-window weren't clause-bounded, "ruled out"
// would fall within 40 raw characters of "chest pain" too and wrongly
// negate an entirely different, earlier clause's diagnosis.
const CLAUSE_BOUNDARY_RE = /[.,;:\n]/;
// Generic short negators are deliberately excluded from the comma-shorthand
// opener check below: "no"/"not"/"without" routinely open an unrelated
// continuation clause that has nothing to do with the preceding term (e.g.
// "pneumonia, no further detail documented" is a documentation-completeness
// remark, not a negation of pneumonia) — unlike "ruled out"/"excluded"/
// "unlikely"/etc., which are specific enough that they only ever appear as
// an actual verdict on the term they follow.
const GENERIC_SHORT_NEGATORS = new Set(['no', 'not', 'without']);
const SHORTHAND_VERDICT_TERMS = [
  ...NEGATION_TERMS_EN, ...NEGATION_TERMS_AR, ...UNCERTAINTY_TERMS_EN, ...UNCERTAINTY_TERMS_AR,
].filter((t) => !GENERIC_SHORT_NEGATORS.has(t.toLowerCase()));
/** Does `text` open (respecting a word boundary, so "no" can't match
 * "normal") with one of `terms`? Used only for the comma-shorthand case
 * below — a plain `.includes()` would reintroduce the cross-clause bug this
 * whole function exists to avoid. */
function opensWithTerm(text: string, terms: string[]): boolean {
  return terms.some((t) => {
    const lower = t.toLowerCase();
    if (!text.startsWith(lower)) return false;
    const nextChar = text[lower.length];
    return nextChar === undefined || !/[\p{L}\p{N}]/u.test(nextChar);
  });
}
/**
 * Text surrounding a match, used to detect negation/uncertainty. Clinical
 * notes phrase a negative or uncertain finding either BEFORE the diagnosis
 * term ("no fever", "denies chest pain", "suspected pneumonia") or AFTER it
 * ("myocardial infarction ruled out", "sepsis excluded", "pneumonia
 * unlikely") — checking only the text before the match (the previous
 * behavior) silently coded conditions the note explicitly excluded, e.g.
 * "Chest pain, myocardial infarction ruled out" was coded as a positive MI.
 * The post-side is truncated at the next clause boundary (comma, period,
 * semicolon, colon, newline) since a post-position negator normally applies
 * within the same clause as the term it modifies; the pre-side keeps its
 * original raw-window behavior to avoid changing already-tested matches.
 * One shorthand is special-cased: "<term>, ruled out" / "<term>, rule out"
 * — extremely common ED/radiology dictation ("chest pain, MI rule out") —
 * where the verdict sits just past a single leading comma. That's allowed
 * ONLY when the negator/uncertainty word is the very first token after the
 * comma (not merely present somewhere in that clause), so an unrelated next
 * item in a list ("chest pain, myocardial infarction ruled out" — from
 * chest pain's point of view) still can't be swept in.
 */
function getSurroundingContext(normalized: string, matchStart: number, matchEnd: number): string {
  const preStart = Math.max(0, matchStart - NEGATION_CONTEXT_WINDOW);
  const pre = normalized.slice(preStart, matchStart).toLowerCase();
  const postRaw = normalized.slice(matchEnd, Math.min(normalized.length, matchEnd + NEGATION_CONTEXT_WINDOW)).toLowerCase();
  const boundaryIdx = postRaw.search(CLAUSE_BOUNDARY_RE);
  const directPost = boundaryIdx === -1 ? postRaw : postRaw.slice(0, boundaryIdx);
  const afterLeadingComma = postRaw.replace(/^[,،؛\s]+/, '');
  const shorthandPost = opensWithTerm(afterLeadingComma, SHORTHAND_VERDICT_TERMS) ? afterLeadingComma : '';
  return `${pre} ${directPost} ${shorthandPost}`;
}
export interface MatchedTermInfo {
  entry: LexiconEntry;
  matched_text: string;
  synonym_language: 'en' | 'ar';
  confidence: number;
  uncertain: boolean;
}
/**
 * Scans normalized clinical text against every lexicon entry in both
 * languages, applying negation/uncertainty context checks and specificity
 * deduplication (e.g. "left tibia fracture" supersedes generic "fracture").
 */
export function matchClinicalText(rawText: string): MatchedTermInfo[] {
  const normalized = stripArabicDiacritics(rawText);
  const matches = new Map<string, MatchedTermInfo>();
  for (const entry of BILINGUAL_LEXICON) {
    const synonymGroups: { list: string[]; lang: 'en' | 'ar' }[] = [
      { list: entry.synonyms_en, lang: 'en' },
      { list: entry.synonyms_ar, lang: 'ar' },
      { list: entry.synonyms_colloquial ?? [], lang: 'ar' },
    ];
    for (const group of synonymGroups) {
      if (matches.has(entry.code)) break;
      for (const syn of group.list) {
        const re = buildRegexForTerm(syn);
        const m = re.exec(normalized);
        if (!m) continue;
        const context = getSurroundingContext(normalized, m.index, m.index + m[0].length);
        // Check both languages' negation/uncertainty terms regardless of the
        // matched synonym's language: code-switched notes routinely negate a
        // term in one language right next to the diagnosis term in the other
        // (e.g. Arabic "لا" preceding an English diagnosis name).
        const negated = containsAny(context, NEGATION_TERMS_EN) || containsAny(context, NEGATION_TERMS_AR);
        if (negated) continue;
        const uncertain = containsAny(context, UNCERTAINTY_TERMS_EN) || containsAny(context, UNCERTAINTY_TERMS_AR);
        matches.set(entry.code, {
          entry,
          matched_text: syn,
          synonym_language: group.lang,
          confidence: uncertain ? Math.max(0.4, entry.base_confidence - 0.15) : entry.base_confidence,
          uncertain,
        });
        break;
      }
    }
  }
  // A more specific match (e.g. "left tibia fracture") supersedes the
  // generic concept it was matched alongside (e.g. "fracture").
  for (const info of matches.values()) {
    for (const supersededCode of info.entry.supersedes ?? []) {
      matches.delete(supersededCode);
    }
  }
  return Array.from(matches.values());
}
export interface MatchedProcedureInfo {
  entry: ProcedureEntry;
  matched_text: string;
  /** Only meaningful when entry.sbs_laterality is set. */
  laterality: 'unilateral' | 'bilateral' | 'unspecified';
}
const BILATERAL_TERMS_EN = ['bilateral', 'both sides', 'both'];
const BILATERAL_TERMS_AR = ['ثنائي', 'كلا الجانبين', 'كلا الجهتين'];
const UNILATERAL_TERMS_EN = ['unilateral', 'one side', 'single side'];
const UNILATERAL_TERMS_AR = ['أحادي', 'جانب واحد'];
/** Scans normalized clinical text for mentions of OR procedures (drives the Medical/Surgical DRG partition). */
export function matchProcedures(rawText: string): MatchedProcedureInfo[] {
  const normalized = stripArabicDiacritics(rawText);
  const matches = new Map<string, MatchedProcedureInfo>();
  for (const entry of PROCEDURE_LEXICON) {
    const synonymGroups = [entry.synonyms_en, entry.synonyms_ar];
    for (const list of synonymGroups) {
      if (matches.has(entry.code)) break;
      for (const syn of list) {
        const re = buildRegexForTerm(syn);
        const m = re.exec(normalized);
        if (!m) continue;
        const context = getSurroundingContext(normalized, m.index, m.index + m[0].length);
        if (containsAny(context, NEGATION_TERMS_EN) || containsAny(context, NEGATION_TERMS_AR)) continue;
        let laterality: MatchedProcedureInfo['laterality'] = 'unspecified';
        if (entry.sbs_laterality) {
          const lowerNormalized = normalized.toLowerCase();
          if (containsAny(lowerNormalized, BILATERAL_TERMS_EN) || containsAny(lowerNormalized, BILATERAL_TERMS_AR)) {
            laterality = 'bilateral';
          } else if (containsAny(lowerNormalized, UNILATERAL_TERMS_EN) || containsAny(lowerNormalized, UNILATERAL_TERMS_AR)) {
            laterality = 'unilateral';
          }
        }
        matches.set(entry.code, { entry, matched_text: syn, laterality });
        break;
      }
    }
  }
  return Array.from(matches.values());
}
export interface CodingEngineOptions {
  age?: number;
  encounterType?: 'INPATIENT' | 'OUTPATIENT' | 'ED';
  /** Secondary diagnosis codes confirmed not present on admission — see
   * GroupEncounterParams.poaExclusions. */
  poaExclusions?: string[];
  /** When set (from the refinement wizard's 'principal' question), forces
   * this code to be the principal diagnosis instead of the automatic
   * acuity-weighted ranking — used when a coder has explicitly confirmed
   * which of two closely-ranked candidates is the true reason for the
   * encounter. Ignored if the code isn't among the matched diagnoses. */
  principalOverride?: string;
}
export interface CodingEngineResult {
  suggested_codes: SuggestedCode[];
  suggested_procedures: SuggestedProcedure[];
  principal_code: string;
  secondary_codes: string[];
  drg: DrgResult;
  detected_language: 'en' | 'ar' | 'mixed';
  confidence_score: number;
}
/** The public, unauthenticated demo preview additionally surfaces CDI nudges
 * (documentation-gap detection, PRD Pillar 3), an AI-generated narrative
 * summary, and a sequenced clarifying-question set alongside the
 * coding/grouping result, so the preview demonstrates all three pillars —
 * coding, DRG grouping, and CDI — not just the first two. */
export interface DemoAnalysisResult extends CodingEngineResult {
  nudges: Nudge[];
  ai_summary: AiClinicalSummary | null;
  questions: RefinementQuestion[];
}
/**
 * Elects the clinically dominant diagnosis (weighted by acuity, not just
 * confidence) as principal. Exported so any caller that needs a
 * principal/secondary split (e.g. cdi-rules.ts) uses the exact same ranking
 * as the main engine, rather than relying on the lexicon's insertion order.
 */
export function electPrincipal(matches: MatchedTermInfo[]): MatchedTermInfo[] {
  return [...matches].sort((a, b) => {
    const scoreA = a.confidence * (1 + a.entry.soi_weight + a.entry.rom_weight);
    const scoreB = b.confidence * (1 + b.entry.soi_weight + b.entry.rom_weight);
    return scoreB - scoreA;
  });
}
export function runCodingEngine(rawText: string, options: CodingEngineOptions = {}): CodingEngineResult {
  const detected_language = detectLanguage(rawText);
  const matches = matchClinicalText(rawText);
  let suggested_codes: SuggestedCode[];
  let principal_code: string;
  let secondary_codes: string[];
  if (matches.length === 0) {
    suggested_codes = [
      {
        code: 'Z00.00',
        desc: 'General medical examination, unspecified',
        desc_ar: 'فحص طبي عام، غير محدد',
        confidence: 0.5,
        is_principal: true,
        soi_weight: 0,
        rom_weight: 0,
      },
    ];
    principal_code = 'Z00.00';
    secondary_codes = [];
  } else {
    let ranked = electPrincipal(matches);
    if (options.principalOverride) {
      const overrideIdx = ranked.findIndex((r) => r.entry.code === options.principalOverride);
      if (overrideIdx > 0) {
        const [chosen] = ranked.splice(overrideIdx, 1);
        ranked = [chosen, ...ranked];
      }
    }
    principal_code = ranked[0].entry.code;
    secondary_codes = ranked.slice(1).map((r) => r.entry.code);
    suggested_codes = ranked.map((m) => ({
      code: m.entry.code,
      desc: m.entry.desc_en,
      desc_ar: m.entry.desc_ar,
      term_en: m.synonym_language === 'en' ? m.matched_text : undefined,
      term_ar: m.synonym_language === 'ar' ? m.matched_text : undefined,
      matched_text: m.matched_text,
      confidence: Math.round(m.confidence * 100) / 100,
      is_principal: m.entry.code === principal_code,
      soi_weight: m.entry.soi_weight,
      rom_weight: m.entry.rom_weight,
    }));
  }
  const procedureMatches = matchProcedures(rawText);
  const suggested_procedures: SuggestedProcedure[] = procedureMatches.map((p) => {
    const sbsCode = p.entry.sbs_laterality
      ? (p.laterality === 'bilateral' ? p.entry.sbs_laterality.bilateral : p.entry.sbs_laterality.unilateral)
      : p.entry.sbs_code;
    // sbs_desc_en is authored ending in ", unilateral" for laterality-variant
    // entries — swap the word when the bilateral code is the one actually
    // selected, so the description never contradicts the code shown next to it.
    const sbsDesc = p.entry.sbs_laterality && p.laterality === 'bilateral' && p.entry.sbs_desc_en
      ? p.entry.sbs_desc_en.replace(/unilateral$/i, 'bilateral')
      : p.entry.sbs_desc_en;
    return {
      code: p.entry.code,
      desc: p.entry.desc_en,
      desc_ar: p.entry.desc_ar,
      matched_text: p.matched_text,
      sbs_code: sbsCode,
      sbs_desc_en: sbsDesc,
      sbs_laterality_unspecified: !!p.entry.sbs_laterality && p.laterality === 'unspecified',
    };
  });
  const drg = groupEncounter({
    principalCode: principal_code,
    secondaryCodes: secondary_codes,
    procedureCodes: suggested_procedures.map((p) => p.code),
    age: options.age,
    encounterType: options.encounterType,
    poaExclusions: options.poaExclusions,
  });
  const confidence_score = Math.round((suggested_codes.reduce((s, c) => s + c.confidence, 0) / suggested_codes.length) * 100) / 100;
  return { suggested_codes, suggested_procedures, principal_code, secondary_codes, drg, detected_language, confidence_score };
}
/** Mirrors the three-phase automation policy from the PRD (CAC -> Semi-Autonomous -> Autonomous). */
export function classifyAutomationPhase(
  confidence_score: number,
  visitComplexity: string,
): { phase: CodingJob['phase']; status: CodingJob['status'] } {
  if (confidence_score > 0.98 && visitComplexity === 'low-complexity outpatient') {
    return { phase: 'AUTONOMOUS', status: 'SENT_TO_NPHIES' };
  }
  if (confidence_score > 0.9) {
    return { phase: 'SEMI_AUTONOMOUS', status: 'AUTO_DROP' };
  }
  return { phase: 'CAC', status: 'NEEDS_REVIEW' };
}
