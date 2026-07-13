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
import { matchClinicalText } from './coding-engine';
import { groupEncounter } from './drg-grouper';
import type { Nudge } from './types';
export interface CdiOptions {
  age?: number;
  encounterType?: 'INPATIENT' | 'OUTPATIENT' | 'ED';
}
export function generateCdiNudges(text: string, encounterId: string, options: CdiOptions = {}): Nudge[] {
  const matches = matchClinicalText(text);
  if (matches.length === 0) return [];
  const principalCode = matches[0].entry.code;
  const secondaryCodes = matches.slice(1).map((m) => m.entry.code);
  const baseline = groupEncounter({
    principalCode,
    secondaryCodes,
    age: options.age,
    encounterType: options.encounterType,
  });
  const lowerText = text.toLowerCase();
  const nudges: Nudge[] = [];
  for (const { entry } of matches) {
    for (const modifier of entry.specificity_modifiers ?? []) {
      const resolvedEn = modifier.keywords_en.some((k) => lowerText.includes(k.toLowerCase()));
      const resolvedAr = modifier.keywords_ar.some((k) => text.includes(k));
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
