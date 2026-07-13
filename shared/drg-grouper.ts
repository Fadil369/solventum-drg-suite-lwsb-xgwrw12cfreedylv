/**
 * BrainSAIT APR-DRG / EAPG Grouper
 * ---------------------------------------------------------------------------
 * BrainSAIT's own implementation of the two grouping methodologies described
 * in the DRG-SA PRD (Pillar 1): APR-DRGs for inpatient/ED encounters, EAPGs
 * for outpatient encounters, covering 60+ clinical categories spanning
 * cardiovascular, respiratory, endocrine, renal, GI, neuro, musculoskeletal,
 * infectious, heme/onc, OB/GYN, psychiatric, and pediatric medicine. Given a
 * principal diagnosis and a list of secondary diagnoses, it derives:
 *   - the DRG family (from the principal diagnosis's clinical category)
 *   - Severity of Illness (SOI, 1-4) from the weighted secondary diagnosis burden
 *   - Risk of Mortality (ROM, 1-4) from mortality-risk weights + age
 *   - a relative weight (drives Case Mix Index) that increases with SOI
 *
 * Every number is transparent and traces back to a lexicon weight, so coders
 * and CDI specialists can see *why* a case grouped the way it did — unlike a
 * black-box classifier. Family codes and relative weights are BrainSAIT's own
 * calibration (not 3M-licensed APR-DRG/EAPG values) and should be recalibrated
 * against a certified grouper before production reimbursement decisions.
 */
import { findLexiconEntry } from './bilingual-lexicon';
import type { DrgResult } from './types';
interface DrgFamilyMeta {
  title_en: string;
  title_ar: string;
  /** Relative weight indexed by SOI tier 1-4. */
  base_weight: [number, number, number, number];
}
export const DRG_FAMILY_TABLE: Record<string, DrgFamilyMeta> = {
  '194': { title_en: 'Cardiopulmonary Medical Management', title_ar: 'الإدارة الطبية لأمراض القلب والرئة', base_weight: [0.65, 0.95, 1.35, 1.9] },
  '190': { title_en: 'Acute Myocardial Infarction', title_ar: 'احتشاء عضلة القلب الحاد', base_weight: [1.1, 1.6, 2.2, 3.0] },
  '261': { title_en: 'Appendectomy & Appendiceal Conditions', title_ar: 'استئصال الزائدة الدودية وحالاتها', base_weight: [0.55, 0.8, 1.1, 1.5] },
  '302': { title_en: 'Fractures & Musculoskeletal Trauma', title_ar: 'الكسور وإصابات الجهاز العضلي الهيكلي', base_weight: [0.5, 0.75, 1.05, 1.4] },
  '466': { title_en: 'Urinary Tract Infection', title_ar: 'التهاب المسالك البولية', base_weight: [0.45, 0.65, 0.95, 1.3] },
  '420': { title_en: 'Diabetes', title_ar: 'داء السكري', base_weight: [0.5, 0.7, 1.0, 1.4] },
  '201': { title_en: 'Hypertension', title_ar: 'ارتفاع ضغط الدم', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '140': { title_en: 'Chronic Obstructive Pulmonary Disease', title_ar: 'مرض الانسداد الرئوي المزمن', base_weight: [0.55, 0.8, 1.15, 1.55] },
  '720': { title_en: 'Septicemia & Sepsis', title_ar: 'تعفن الدم والإنتان', base_weight: [1.3, 1.9, 2.7, 3.8] },
  '460': { title_en: 'Renal Failure', title_ar: 'الفشل الكلوي', base_weight: [0.6, 0.9, 1.3, 1.8] },
  '141': { title_en: 'Asthma', title_ar: 'الربو', base_weight: [0.4, 0.55, 0.75, 1.0] },
  '045': { title_en: 'Cerebrovascular Disorders', title_ar: 'الاضطرابات الدماغية الوعائية', base_weight: [0.9, 1.3, 1.85, 2.5] },
  // --- Cardiovascular ---
  '138': { title_en: 'Cardiac Arrhythmia', title_ar: 'اضطراب نظم القلب', base_weight: [0.5, 0.7, 0.95, 1.25] },
  '129': { title_en: 'Cardiac Arrest & Resuscitation', title_ar: 'توقف القلب والإنعاش', base_weight: [1.5, 2.2, 3.0, 4.0] },
  '175': { title_en: 'Pulmonary Embolism', title_ar: 'الانصمام الرئوي', base_weight: [1.0, 1.5, 2.1, 2.9] },
  '128': { title_en: 'Venous Thrombosis', title_ar: 'الخثار الوريدي', base_weight: [0.5, 0.7, 0.95, 1.25] },
  '056': { title_en: 'Syncope & Dizziness', title_ar: 'الإغماء والدوخة', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '143': { title_en: 'Chest Pain, Unspecified', title_ar: 'ألم الصدر غير المحدد', base_weight: [0.2, 0.3, 0.4, 0.55] },
  // --- Respiratory ---
  '131': { title_en: 'Respiratory Failure', title_ar: 'الفشل التنفسي', base_weight: [1.2, 1.75, 2.4, 3.2] },
  '780': { title_en: 'COVID-19 & Viral Respiratory Infection', title_ar: 'كوفيد-19 وعدوى الجهاز التنفسي الفيروسية', base_weight: [0.55, 0.8, 1.15, 1.55] },
  '790': { title_en: 'Tuberculosis', title_ar: 'السل', base_weight: [0.6, 0.9, 1.25, 1.7] },
  // --- Endocrine & Metabolic ---
  '468': { title_en: 'Diabetic Ketoacidosis', title_ar: 'الحماض الكيتوني السكري', base_weight: [1.1, 1.6, 2.2, 3.0] },
  '890': { title_en: 'Endocrine & Thyroid Disorders', title_ar: 'اضطرابات الغدد الصماء والدرقية', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '447': { title_en: 'Obesity', title_ar: 'السمنة', base_weight: [0.15, 0.15, 0.15, 0.15] },
  '895': { title_en: 'Electrolyte Imbalance', title_ar: 'اختلال توازن الشوارد', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '448': { title_en: 'Dehydration & Fluid Disorders', title_ar: 'الجفاف واضطرابات السوائل', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '449': { title_en: 'Malnutrition', title_ar: 'سوء التغذية', base_weight: [0.4, 0.6, 0.85, 1.15] },
  // --- Renal & Urinary ---
  '461': { title_en: 'Acute Kidney Injury', title_ar: 'الإصابة الكلوية الحادة', base_weight: [0.9, 1.3, 1.85, 2.5] },
  '465': { title_en: 'Kidney Stones', title_ar: 'حصوات الكلى', base_weight: [0.3, 0.4, 0.55, 0.75] },
  // --- Gastrointestinal ---
  '220': { title_en: 'Cholecystitis & Biliary Disease', title_ar: 'التهاب المرارة وأمراض القنوات الصفراوية', base_weight: [0.55, 0.8, 1.1, 1.5] },
  '221': { title_en: 'Pancreatitis', title_ar: 'التهاب البنكرياس', base_weight: [0.6, 0.9, 1.25, 1.7] },
  '280': { title_en: 'Gastrointestinal Hemorrhage', title_ar: 'نزيف الجهاز الهضمي', base_weight: [0.9, 1.3, 1.85, 2.5] },
  '282': { title_en: 'Peptic Ulcer & Gastritis', title_ar: 'القرحة الهضمية والتهاب المعدة', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '254': { title_en: 'Bowel Obstruction', title_ar: 'الانسداد المعوي', base_weight: [0.7, 1.0, 1.4, 1.9] },
  '249': { title_en: 'Gastroenteritis', title_ar: 'التهاب المعدة والأمعاء', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '246': { title_en: 'Abdominal Pain, Unspecified', title_ar: 'ألم البطن غير المحدد', base_weight: [0.2, 0.3, 0.4, 0.55] },
  '200': { title_en: 'Hepatitis & Liver Inflammation', title_ar: 'التهاب الكبد', base_weight: [0.5, 0.75, 1.05, 1.4] },
  '205': { title_en: 'Cirrhosis & Chronic Liver Disease', title_ar: 'تليف الكبد ومرض الكبد المزمن', base_weight: [0.8, 1.2, 1.7, 2.3] },
  // --- Neurological ---
  '065': { title_en: 'Seizure & Epilepsy', title_ar: 'الصرع والنوبات التشنجية', base_weight: [0.45, 0.65, 0.9, 1.2] },
  '070': { title_en: 'Central Nervous System Infections', title_ar: 'عدوى الجهاز العصبي المركزي', base_weight: [1.0, 1.5, 2.1, 2.9] },
  '024': { title_en: 'Transient Ischemic Attack', title_ar: 'نوبة إقفارية دماغية عابرة', base_weight: [0.6, 0.85, 1.15, 1.5] },
  '050': { title_en: 'Headache & Migraine', title_ar: 'الصداع والشقيقة', base_weight: [0.2, 0.3, 0.4, 0.55] },
  // --- Musculoskeletal ---
  '300': { title_en: 'Osteoarthritis & Joint Disease', title_ar: 'الفصال العظمي وأمراض المفاصل', base_weight: [0.3, 0.4, 0.55, 0.75] },
  '301': { title_en: 'Back Pain & Spine Disorders', title_ar: 'آلام الظهر واضطرابات العمود الفقري', base_weight: [0.25, 0.35, 0.5, 0.65] },
  '310': { title_en: 'Soft Tissue Injury', title_ar: 'إصابات الأنسجة الرخوة', base_weight: [0.2, 0.3, 0.4, 0.55] },
  '350': { title_en: 'Burns', title_ar: 'الحروق', base_weight: [0.7, 1.1, 1.6, 2.3] },
  // --- Infectious Disease ---
  '383': { title_en: 'Cellulitis & Skin Infections', title_ar: 'التهاب النسيج الخلوي وعدوى الجلد', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '384': { title_en: 'Osteomyelitis', title_ar: 'التهاب العظم والنقي', base_weight: [0.65, 0.95, 1.35, 1.85] },
  // --- Hematology & Oncology ---
  '660': { title_en: 'Anemia', title_ar: 'فقر الدم', base_weight: [0.35, 0.5, 0.7, 0.95] },
  '690': { title_en: 'Malignancy / Oncology', title_ar: 'الأورام الخبيثة', base_weight: [1.2, 1.75, 2.4, 3.2] },
  '691': { title_en: 'Chemotherapy Encounter', title_ar: 'زيارة العلاج الكيميائي', base_weight: [0.5, 0.5, 0.5, 0.5] },
  // --- Obstetrics & Gynecology ---
  '560': { title_en: 'Normal Delivery', title_ar: 'الولادة الطبيعية', base_weight: [0.3, 0.3, 0.3, 0.3] },
  '561': { title_en: 'Cesarean Delivery', title_ar: 'الولادة القيصرية', base_weight: [0.55, 0.7, 0.9, 1.15] },
  '570': { title_en: 'Preeclampsia & Eclampsia', title_ar: 'تسمم الحمل والإرجاج', base_weight: [0.8, 1.2, 1.7, 2.3] },
  '580': { title_en: 'Miscarriage & Spontaneous Abortion', title_ar: 'الإجهاض التلقائي', base_weight: [0.3, 0.45, 0.6, 0.8] },
  // --- Psychiatric ---
  '750': { title_en: 'Depression & Mood Disorders', title_ar: 'الاكتئاب واضطرابات المزاج', base_weight: [0.35, 0.5, 0.7, 0.95] },
  '751': { title_en: 'Anxiety Disorders', title_ar: 'اضطرابات القلق', base_weight: [0.25, 0.35, 0.5, 0.65] },
  '755': { title_en: 'Substance Use Disorder', title_ar: 'اضطراب تعاطي المواد', base_weight: [0.45, 0.65, 0.9, 1.2] },
  // --- Pediatric ---
  '630': { title_en: 'Neonatal Jaundice', title_ar: 'اليرقان الوليدي', base_weight: [0.35, 0.5, 0.7, 0.95] },
  '631': { title_en: 'Febrile Seizure (Pediatric)', title_ar: 'التشنج الحروري', base_weight: [0.3, 0.4, 0.55, 0.75] },
  '632': { title_en: 'Bronchiolitis (Pediatric)', title_ar: 'التهاب القصيبات', base_weight: [0.4, 0.6, 0.85, 1.15] },
  AMB: { title_en: 'Ambulatory / Minor Encounter', title_ar: 'زيارة عيادات خارجية بسيطة', base_weight: [0.15, 0.15, 0.15, 0.15] },
  '999': { title_en: 'Unspecified Medical Encounter', title_ar: 'زيارة طبية غير محددة', base_weight: [0.5, 0.7, 0.95, 1.25] },
};
export interface GroupEncounterParams {
  principalCode: string;
  secondaryCodes?: string[];
  age?: number;
  encounterType?: 'INPATIENT' | 'OUTPATIENT' | 'ED';
}
function tierFromScore(score: number): 1 | 2 | 3 | 4 {
  if (score >= 5) return 4;
  if (score >= 3) return 3;
  if (score >= 1) return 2;
  return 1;
}
export function groupEncounter({ principalCode, secondaryCodes = [], age, encounterType = 'INPATIENT' }: GroupEncounterParams): DrgResult {
  const principalEntry = findLexiconEntry(principalCode);
  const family = principalEntry?.drg_family ?? '999';
  const familyMeta = DRG_FAMILY_TABLE[family] ?? DRG_FAMILY_TABLE['999'];
  const uniqueSecondary = Array.from(new Set(secondaryCodes.filter((c) => c !== principalCode)));
  const secondaryEntries = uniqueSecondary.map((c) => findLexiconEntry(c)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const principalSoiContribution = principalEntry ? Math.round(principalEntry.soi_weight * 0.5) : 0;
  const principalRomContribution = principalEntry ? Math.round(principalEntry.rom_weight * 0.5) : 0;
  let soiScore = principalSoiContribution + secondaryEntries.reduce((sum, e) => sum + e.soi_weight, 0);
  let romScore = principalRomContribution + secondaryEntries.reduce((sum, e) => sum + e.rom_weight, 0);
  if (typeof age === 'number') {
    if (age >= 75) romScore += 2;
    else if (age >= 65) romScore += 1;
    if (age < 1) romScore += 1; // neonatal risk, reflecting APR-DRG's all-ages coverage incl. pediatrics
  }
  const soi = tierFromScore(soiScore);
  const rom = tierFromScore(romScore);
  const methodology: DrgResult['methodology'] = encounterType === 'OUTPATIENT' ? 'BrainSAIT-EAPG' : 'BrainSAIT-APR-DRG';
  const relative_weight = familyMeta.base_weight[soi - 1];
  return {
    code: family,
    title_en: familyMeta.title_en,
    title_ar: familyMeta.title_ar,
    soi,
    rom,
    relative_weight,
    subclass: `${family}-${soi}`,
    methodology,
  };
}
/** Computes the Case Mix Index (mean relative weight) across a set of grouped encounters. */
export function computeCaseMixIndex(results: Pick<DrgResult, 'relative_weight'>[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.relative_weight, 0);
  return Math.round((sum / results.length) * 1000) / 1000;
}
