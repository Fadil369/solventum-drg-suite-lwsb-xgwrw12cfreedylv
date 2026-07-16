/**
 * BrainSAIT Bilingual CDI "Engage One"-style Nudge Engine
 * ---------------------------------------------------------------------------
 * Turns the same bilingual lexicon used for coding into proactive,
 * point-of-documentation nudges (Pillar 3 of the PRD): rather than a generic
 * "please be more specific" prompt, each nudge is framed in the clinician's
 * own language (Arabic, English, or both) and quantifies *why it matters* —
 * the Severity of Illness (SOI) points left on the table by an underspecified
 * diagnosis — using the same APR-DRG grouper that will ultimately code
 * the encounter.
 */
import { matchClinicalText, matchProcedures, containsAny, stripArabicDiacritics, electPrincipal } from './coding-engine';
import type { RefinementQuestion, RefinementOption } from './coding-engine';
import { groupEncounter } from './drg-grouper';
import type { Nudge } from './types';
export interface CdiOptions {
  age?: number;
  encounterType?: 'INPATIENT' | 'OUTPATIENT' | 'ED';
}
export function generateCdiNudges(text: string, encounterId: string, options: CdiOptions = {}): Nudge[] {
  const matches = matchClinicalText(text);
  if (matches.length === 0) return [];
  // Use the same acuity-weighted ranking as the main coding engine (not raw
  // lexicon/insertion order) so the SOI-impact baseline is anchored on the
  // actual principal diagnosis for multi-diagnosis notes.
  const ranked = electPrincipal(matches);
  const principalCode = ranked[0].entry.code;
  const secondaryCodes = ranked.slice(1).map((m) => m.entry.code);
  const procedureCodes = matchProcedures(text).map((p) => p.entry.code);
  const baseline = groupEncounter({
    principalCode,
    secondaryCodes,
    procedureCodes,
    age: options.age,
    encounterType: options.encounterType,
  });
  // Normalized (diacritic-stripped) so a modifier keyword still resolves even
  // if the clinician wrote the note with Arabic diacritics (tashkeel) —
  // matches the normalization already applied in matchClinicalText.
  const normalizedText = stripArabicDiacritics(text);
  const nudges: Nudge[] = [];
  for (const { entry } of matches) {
    for (const modifier of entry.specificity_modifiers ?? []) {
      // Whole-word matching (not `.includes()`) so a keyword like "art" can't
      // false-positive-resolve a gap by matching inside an unrelated word
      // like "heart".
      const resolvedEn = containsAny(normalizedText, modifier.keywords_en);
      const resolvedAr = containsAny(normalizedText, modifier.keywords_ar);
      if (resolvedEn || resolvedAr) continue; // documentation already closes this gap
      const targetSoi = Math.min(4, baseline.soi + modifier.soi_gain) as 1 | 2 | 3 | 4;
      const hasImpact = modifier.soi_gain > 0 && targetSoi > baseline.soi;
      nudges.push({
        id: `${entry.code}_${modifier.id}_${encounterId}`,
        encounter_id: encounterId,
        severity: modifier.severity,
        prompt: modifier.prompt_en,
        prompt_ar: modifier.prompt_ar,
        soi_impact: hasImpact
          ? `Closing this documentation gap could raise SOI from ${baseline.soi} to ${targetSoi}.`
          : undefined,
        soi_impact_ar: hasImpact
          ? `قد يؤدي إغلاق هذه الفجوة التوثيقية إلى رفع درجة شدة المرض (SOI) من ${baseline.soi} إلى ${targetSoi}.`
          : undefined,
        status: 'active',
        created_at: new Date().toISOString(),
      });
    }
  }
  return nudges;
}
/**
 * Builds the sequenced clarifying-question set for the interactive
 * refinement flow (public demo "Refine This Coding" wizard). Two sources of
 * questions, both derived from the same deterministic engine used for the
 * actual coding — no separate free-form question-generation model, so every
 * question is guaranteed to correspond to a real, resolvable gap:
 *
 * 1. Diagnosis specificity gaps — the same lexicon `specificity_modifiers`
 *    that drive generateCdiNudges(), reframed with concrete answer options
 *    instead of a passive documentation prompt.
 * 2. Procedure laterality gaps — a detected procedure whose SBS code
 *    differs by unilateral vs. bilateral, where the note doesn't say which.
 */
export function generateRefinementQuestions(text: string, options: CdiOptions = {}): RefinementQuestion[] {
  const matches = matchClinicalText(text);
  const normalizedText = stripArabicDiacritics(text);
  const questions: RefinementQuestion[] = [];
  for (const { entry } of matches) {
    for (const modifier of entry.specificity_modifiers ?? []) {
      const resolvedEn = containsAny(normalizedText, modifier.keywords_en);
      const resolvedAr = containsAny(normalizedText, modifier.keywords_ar);
      if (resolvedEn || resolvedAr) continue;
      const optionCount = Math.min(4, modifier.keywords_en.length);
      const opts: RefinementOption[] = [];
      for (let i = 0; i < optionCount; i++) {
        opts.push({
          label_en: modifier.keywords_en[i].replace(/\b\w/g, (c) => c.toUpperCase()),
          label_ar: modifier.keywords_ar[i] ?? modifier.keywords_en[i],
          answer_text: modifier.keywords_en[i],
        });
      }
      questions.push({
        id: `${entry.code}_${modifier.id}`,
        prompt_en: modifier.prompt_en,
        prompt_ar: modifier.prompt_ar,
        severity: modifier.severity,
        options: opts,
      });
    }
  }
  for (const { entry, laterality } of matchProcedures(text)) {
    if (!entry.sbs_laterality || laterality !== 'unspecified') continue;
    questions.push({
      id: `${entry.code}_laterality`,
      prompt_en: `Was "${entry.desc_en}" performed on one side (unilateral) or both sides (bilateral)? SBS assigns a different billing code to each.`,
      prompt_ar: `هل تم إجراء "${entry.desc_ar}" من جانب واحد (أحادي) أم من كلا الجانبين (ثنائي)؟ يخصص نظام SBS رمز فوترة مختلف لكل حالة.`,
      severity: 'warning',
      options: [
        { label_en: 'Unilateral (one side)', label_ar: 'أحادي (جانب واحد)', answer_text: 'unilateral' },
        { label_en: 'Bilateral (both sides)', label_ar: 'ثنائي (كلا الجانبين)', answer_text: 'bilateral' },
      ],
    });
  }
  return questions;
}
