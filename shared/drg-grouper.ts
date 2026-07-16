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
import { findProcedureEntry } from './procedure-lexicon';
import type { DrgResult, DepartmentCaseMixRow } from './types';
interface DrgFamilyMeta {
  title_en: string;
  title_ar: string;
  /** The clinical department that owns this DRG family, for cross-department routing/reporting. */
  department_en: string;
  department_ar: string;
  /** Relative weight indexed by SOI tier 1-4. */
  base_weight: [number, number, number, number];
}
export const DRG_FAMILY_TABLE: Record<string, DrgFamilyMeta> = {
  '194': { title_en: 'Cardiopulmonary Medical Management', title_ar: 'الإدارة الطبية لأمراض القلب والرئة', department_en: 'Internal Medicine', department_ar: 'الطب الباطني', base_weight: [0.65, 0.95, 1.35, 1.9] },
  '190': { title_en: 'Acute Myocardial Infarction', title_ar: 'احتشاء عضلة القلب الحاد', department_en: 'Cardiology', department_ar: 'أمراض القلب', base_weight: [1.1, 1.6, 2.2, 3.0] },
  '261': { title_en: 'Appendectomy & Appendiceal Conditions', title_ar: 'استئصال الزائدة الدودية وحالاتها', department_en: 'General Surgery', department_ar: 'الجراحة العامة', base_weight: [0.55, 0.8, 1.1, 1.5] },
  '302': { title_en: 'Fractures & Musculoskeletal Trauma', title_ar: 'الكسور وإصابات الجهاز العضلي الهيكلي', department_en: 'Orthopedics', department_ar: 'جراحة العظام', base_weight: [0.5, 0.75, 1.05, 1.4] },
  '466': { title_en: 'Urinary Tract Infection', title_ar: 'التهاب المسالك البولية', department_en: 'Urology', department_ar: 'المسالك البولية', base_weight: [0.45, 0.65, 0.95, 1.3] },
  '420': { title_en: 'Diabetes', title_ar: 'داء السكري', department_en: 'Endocrinology', department_ar: 'الغدد الصماء', base_weight: [0.5, 0.7, 1.0, 1.4] },
  '201': { title_en: 'Hypertension', title_ar: 'ارتفاع ضغط الدم', department_en: 'Cardiology', department_ar: 'أمراض القلب', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '140': { title_en: 'Chronic Obstructive Pulmonary Disease', title_ar: 'مرض الانسداد الرئوي المزمن', department_en: 'Pulmonology', department_ar: 'أمراض الرئة', base_weight: [0.55, 0.8, 1.15, 1.55] },
  '720': { title_en: 'Septicemia & Sepsis', title_ar: 'تعفن الدم والإنتان', department_en: 'Critical Care', department_ar: 'العناية المركزة', base_weight: [1.3, 1.9, 2.7, 3.8] },
  '460': { title_en: 'Renal Failure', title_ar: 'الفشل الكلوي', department_en: 'Nephrology', department_ar: 'أمراض الكلى', base_weight: [0.6, 0.9, 1.3, 1.8] },
  '141': { title_en: 'Asthma', title_ar: 'الربو', department_en: 'Pulmonology', department_ar: 'أمراض الرئة', base_weight: [0.4, 0.55, 0.75, 1.0] },
  '045': { title_en: 'Cerebrovascular Disorders', title_ar: 'الاضطرابات الدماغية الوعائية', department_en: 'Neurology', department_ar: 'الأعصاب', base_weight: [0.9, 1.3, 1.85, 2.5] },
  // --- Cardiovascular ---
  '138': { title_en: 'Cardiac Arrhythmia', title_ar: 'اضطراب نظم القلب', department_en: 'Cardiology', department_ar: 'أمراض القلب', base_weight: [0.5, 0.7, 0.95, 1.25] },
  '129': { title_en: 'Cardiac Arrest & Resuscitation', title_ar: 'توقف القلب والإنعاش', department_en: 'Critical Care', department_ar: 'العناية المركزة', base_weight: [1.5, 2.2, 3.0, 4.0] },
  '175': { title_en: 'Pulmonary Embolism', title_ar: 'الانصمام الرئوي', department_en: 'Pulmonology', department_ar: 'أمراض الرئة', base_weight: [1.0, 1.5, 2.1, 2.9] },
  '128': { title_en: 'Venous Thrombosis', title_ar: 'الخثار الوريدي', department_en: 'Internal Medicine', department_ar: 'الطب الباطني', base_weight: [0.5, 0.7, 0.95, 1.25] },
  '056': { title_en: 'Syncope & Dizziness', title_ar: 'الإغماء والدوخة', department_en: 'Emergency Medicine', department_ar: 'طب الطوارئ', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '143': { title_en: 'Chest Pain, Unspecified', title_ar: 'ألم الصدر غير المحدد', department_en: 'Emergency Medicine', department_ar: 'طب الطوارئ', base_weight: [0.2, 0.3, 0.4, 0.55] },
  // --- Respiratory ---
  '131': { title_en: 'Respiratory Failure', title_ar: 'الفشل التنفسي', department_en: 'Critical Care', department_ar: 'العناية المركزة', base_weight: [1.2, 1.75, 2.4, 3.2] },
  '780': { title_en: 'COVID-19 & Viral Respiratory Infection', title_ar: 'كوفيد-19 وعدوى الجهاز التنفسي الفيروسية', department_en: 'Infectious Disease', department_ar: 'الأمراض المعدية', base_weight: [0.55, 0.8, 1.15, 1.55] },
  '790': { title_en: 'Tuberculosis', title_ar: 'السل', department_en: 'Infectious Disease', department_ar: 'الأمراض المعدية', base_weight: [0.6, 0.9, 1.25, 1.7] },
  // --- Endocrine & Metabolic ---
  '468': { title_en: 'Diabetic Ketoacidosis', title_ar: 'الحماض الكيتوني السكري', department_en: 'Endocrinology', department_ar: 'الغدد الصماء', base_weight: [1.1, 1.6, 2.2, 3.0] },
  '890': { title_en: 'Endocrine & Thyroid Disorders', title_ar: 'اضطرابات الغدد الصماء والدرقية', department_en: 'Endocrinology', department_ar: 'الغدد الصماء', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '447': { title_en: 'Obesity', title_ar: 'السمنة', department_en: 'Endocrinology', department_ar: 'الغدد الصماء', base_weight: [0.15, 0.15, 0.15, 0.15] },
  '895': { title_en: 'Electrolyte Imbalance', title_ar: 'اختلال توازن الشوارد', department_en: 'Nephrology', department_ar: 'أمراض الكلى', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '448': { title_en: 'Dehydration & Fluid Disorders', title_ar: 'الجفاف واضطرابات السوائل', department_en: 'Internal Medicine', department_ar: 'الطب الباطني', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '449': { title_en: 'Malnutrition', title_ar: 'سوء التغذية', department_en: 'Internal Medicine', department_ar: 'الطب الباطني', base_weight: [0.4, 0.6, 0.85, 1.15] },
  // --- Renal & Urinary ---
  '461': { title_en: 'Acute Kidney Injury', title_ar: 'الإصابة الكلوية الحادة', department_en: 'Nephrology', department_ar: 'أمراض الكلى', base_weight: [0.9, 1.3, 1.85, 2.5] },
  '465': { title_en: 'Kidney Stones', title_ar: 'حصوات الكلى', department_en: 'Urology', department_ar: 'المسالك البولية', base_weight: [0.3, 0.4, 0.55, 0.75] },
  // --- Gastrointestinal ---
  '220': { title_en: 'Cholecystitis & Biliary Disease', title_ar: 'التهاب المرارة وأمراض القنوات الصفراوية', department_en: 'General Surgery', department_ar: 'الجراحة العامة', base_weight: [0.55, 0.8, 1.1, 1.5] },
  '221': { title_en: 'Pancreatitis', title_ar: 'التهاب البنكرياس', department_en: 'Gastroenterology', department_ar: 'أمراض الجهاز الهضمي', base_weight: [0.6, 0.9, 1.25, 1.7] },
  '280': { title_en: 'Gastrointestinal Hemorrhage', title_ar: 'نزيف الجهاز الهضمي', department_en: 'Gastroenterology', department_ar: 'أمراض الجهاز الهضمي', base_weight: [0.9, 1.3, 1.85, 2.5] },
  '282': { title_en: 'Peptic Ulcer & Gastritis', title_ar: 'القرحة الهضمية والتهاب المعدة', department_en: 'Gastroenterology', department_ar: 'أمراض الجهاز الهضمي', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '254': { title_en: 'Bowel Obstruction', title_ar: 'الانسداد المعوي', department_en: 'General Surgery', department_ar: 'الجراحة العامة', base_weight: [0.7, 1.0, 1.4, 1.9] },
  '249': { title_en: 'Gastroenteritis', title_ar: 'التهاب المعدة والأمعاء', department_en: 'Gastroenterology', department_ar: 'أمراض الجهاز الهضمي', base_weight: [0.3, 0.45, 0.6, 0.8] },
  '246': { title_en: 'Abdominal Pain, Unspecified', title_ar: 'ألم البطن غير المحدد', department_en: 'Gastroenterology', department_ar: 'أمراض الجهاز الهضمي', base_weight: [0.2, 0.3, 0.4, 0.55] },
  '200': { title_en: 'Hepatitis & Liver Inflammation', title_ar: 'التهاب الكبد', department_en: 'Gastroenterology', department_ar: 'أمراض الجهاز الهضمي', base_weight: [0.5, 0.75, 1.05, 1.4] },
  '205': { title_en: 'Cirrhosis & Chronic Liver Disease', title_ar: 'تليف الكبد ومرض الكبد المزمن', department_en: 'Gastroenterology', department_ar: 'أمراض الجهاز الهضمي', base_weight: [0.8, 1.2, 1.7, 2.3] },
  // --- Neurological ---
  '065': { title_en: 'Seizure & Epilepsy', title_ar: 'الصرع والنوبات التشنجية', department_en: 'Neurology', department_ar: 'الأعصاب', base_weight: [0.45, 0.65, 0.9, 1.2] },
  '070': { title_en: 'Central Nervous System Infections', title_ar: 'عدوى الجهاز العصبي المركزي', department_en: 'Neurology', department_ar: 'الأعصاب', base_weight: [1.0, 1.5, 2.1, 2.9] },
  '024': { title_en: 'Transient Ischemic Attack', title_ar: 'نوبة إقفارية دماغية عابرة', department_en: 'Neurology', department_ar: 'الأعصاب', base_weight: [0.6, 0.85, 1.15, 1.5] },
  '050': { title_en: 'Headache & Migraine', title_ar: 'الصداع والشقيقة', department_en: 'Neurology', department_ar: 'الأعصاب', base_weight: [0.2, 0.3, 0.4, 0.55] },
  // --- Musculoskeletal ---
  '300': { title_en: 'Osteoarthritis & Joint Disease', title_ar: 'الفصال العظمي وأمراض المفاصل', department_en: 'Orthopedics', department_ar: 'جراحة العظام', base_weight: [0.3, 0.4, 0.55, 0.75] },
  '301': { title_en: 'Back Pain & Spine Disorders', title_ar: 'آلام الظهر واضطرابات العمود الفقري', department_en: 'Orthopedics', department_ar: 'جراحة العظام', base_weight: [0.25, 0.35, 0.5, 0.65] },
  '310': { title_en: 'Soft Tissue Injury', title_ar: 'إصابات الأنسجة الرخوة', department_en: 'Orthopedics', department_ar: 'جراحة العظام', base_weight: [0.2, 0.3, 0.4, 0.55] },
  '350': { title_en: 'Burns', title_ar: 'الحروق', department_en: 'General Surgery', department_ar: 'الجراحة العامة', base_weight: [0.7, 1.1, 1.6, 2.3] },
  // --- Infectious Disease ---
  '383': { title_en: 'Cellulitis & Skin Infections', title_ar: 'التهاب النسيج الخلوي وعدوى الجلد', department_en: 'Infectious Disease', department_ar: 'الأمراض المعدية', base_weight: [0.4, 0.6, 0.85, 1.15] },
  '384': { title_en: 'Osteomyelitis', title_ar: 'التهاب العظم والنقي', department_en: 'Infectious Disease', department_ar: 'الأمراض المعدية', base_weight: [0.65, 0.95, 1.35, 1.85] },
  // --- Hematology & Oncology ---
  '660': { title_en: 'Anemia', title_ar: 'فقر الدم', department_en: 'Hematology & Oncology', department_ar: 'أمراض الدم والأورام', base_weight: [0.35, 0.5, 0.7, 0.95] },
  '690': { title_en: 'Malignancy / Oncology', title_ar: 'الأورام الخبيثة', department_en: 'Hematology & Oncology', department_ar: 'أمراض الدم والأورام', base_weight: [1.2, 1.75, 2.4, 3.2] },
  '691': { title_en: 'Chemotherapy Encounter', title_ar: 'زيارة العلاج الكيميائي', department_en: 'Hematology & Oncology', department_ar: 'أمراض الدم والأورام', base_weight: [0.5, 0.5, 0.5, 0.5] },
  // --- Obstetrics & Gynecology ---
  '560': { title_en: 'Normal Delivery', title_ar: 'الولادة الطبيعية', department_en: 'Obstetrics & Gynecology', department_ar: 'النساء والولادة', base_weight: [0.3, 0.3, 0.3, 0.3] },
  '561': { title_en: 'Cesarean Delivery', title_ar: 'الولادة القيصرية', department_en: 'Obstetrics & Gynecology', department_ar: 'النساء والولادة', base_weight: [0.55, 0.7, 0.9, 1.15] },
  '570': { title_en: 'Preeclampsia & Eclampsia', title_ar: 'تسمم الحمل والإرجاج', department_en: 'Obstetrics & Gynecology', department_ar: 'النساء والولادة', base_weight: [0.8, 1.2, 1.7, 2.3] },
  '580': { title_en: 'Miscarriage & Spontaneous Abortion', title_ar: 'الإجهاض التلقائي', department_en: 'Obstetrics & Gynecology', department_ar: 'النساء والولادة', base_weight: [0.3, 0.45, 0.6, 0.8] },
  // --- Psychiatric ---
  '750': { title_en: 'Depression & Mood Disorders', title_ar: 'الاكتئاب واضطرابات المزاج', department_en: 'Psychiatry', department_ar: 'الطب النفسي', base_weight: [0.35, 0.5, 0.7, 0.95] },
  '751': { title_en: 'Anxiety Disorders', title_ar: 'اضطرابات القلق', department_en: 'Psychiatry', department_ar: 'الطب النفسي', base_weight: [0.25, 0.35, 0.5, 0.65] },
  '755': { title_en: 'Substance Use Disorder', title_ar: 'اضطراب تعاطي المواد', department_en: 'Psychiatry', department_ar: 'الطب النفسي', base_weight: [0.45, 0.65, 0.9, 1.2] },
  // --- Pediatric ---
  '630': { title_en: 'Neonatal Jaundice', title_ar: 'اليرقان الوليدي', department_en: 'Pediatrics', department_ar: 'طب الأطفال', base_weight: [0.35, 0.5, 0.7, 0.95] },
  '631': { title_en: 'Febrile Seizure (Pediatric)', title_ar: 'التشنج الحروري', department_en: 'Pediatrics', department_ar: 'طب الأطفال', base_weight: [0.3, 0.4, 0.55, 0.75] },
  '632': { title_en: 'Bronchiolitis (Pediatric)', title_ar: 'التهاب القصيبات', department_en: 'Pediatrics', department_ar: 'طب الأطفال', base_weight: [0.4, 0.6, 0.85, 1.15] },
  AMB: { title_en: 'Ambulatory / Minor Encounter', title_ar: 'زيارة عيادات خارجية بسيطة', department_en: 'General Medicine', department_ar: 'الطب العام', base_weight: [0.15, 0.15, 0.15, 0.15] },
  '999': { title_en: 'Unspecified Medical Encounter', title_ar: 'زيارة طبية غير محددة', department_en: 'General Medicine', department_ar: 'الطب العام', base_weight: [0.5, 0.7, 0.95, 1.25] },
};
export interface GroupEncounterParams {
  principalCode: string;
  secondaryCodes?: string[];
  procedureCodes?: string[];
  age?: number;
  encounterType?: 'INPATIENT' | 'OUTPATIENT' | 'ED';
  /** Secondary diagnosis codes confirmed (via the refinement wizard's POA
   * questions) to have developed *during* this stay rather than being
   * present at admission. These are still listed among the secondary
   * diagnoses for documentation completeness, but excluded from the
   * SOI/ROM contribution — a hospital-acquired complication shouldn't
   * retroactively justify how severe the case looked on admission. */
  poaExclusions?: string[];
}
function tierFromScore(score: number): 1 | 2 | 3 | 4 {
  if (score >= 5) return 4;
  if (score >= 3) return 3;
  if (score >= 1) return 2;
  return 1;
}
export function groupEncounter({
  principalCode,
  secondaryCodes = [],
  procedureCodes = [],
  age,
  encounterType = 'INPATIENT',
  poaExclusions = [],
}: GroupEncounterParams): DrgResult {
  const principalEntry = findLexiconEntry(principalCode);
  const family = principalEntry?.drg_family ?? '999';
  const familyMeta = DRG_FAMILY_TABLE[family] ?? DRG_FAMILY_TABLE['999'];
  const uniqueSecondary = Array.from(new Set(secondaryCodes.filter((c) => c !== principalCode)));
  const secondaryEntries = uniqueSecondary.map((c) => findLexiconEntry(c)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  const poaExclusionSet = new Set(poaExclusions);
  const creditedEntries = secondaryEntries.filter((e) => !poaExclusionSet.has(e.code));
  const excludedEntries = secondaryEntries.filter((e) => poaExclusionSet.has(e.code));
  const explanationEn: string[] = [];
  const explanationAr: string[] = [];
  const principalSoiContribution = principalEntry ? Math.round(principalEntry.soi_weight * 0.5) : 0;
  const principalRomContribution = principalEntry ? Math.round(principalEntry.rom_weight * 0.5) : 0;
  if (principalEntry) {
    explanationEn.push(`Principal diagnosis "${principalEntry.desc_en}" (${principalCode}) anchors DRG family ${family} and contributes ${principalSoiContribution} SOI / ${principalRomContribution} ROM point(s).`);
    explanationAr.push(`التشخيص الأساسي "${principalEntry.desc_ar}" (${principalCode}) يحدد فئة DRG رقم ${family} ويساهم بـ ${principalSoiContribution} نقطة شدة و ${principalRomContribution} نقطة خطر وفاة.`);
  } else {
    explanationEn.push(`No lexicon match for principal code ${principalCode}; falling back to family ${family}.`);
    explanationAr.push(`لا توجد مطابقة في المعجم للرمز الأساسي ${principalCode}؛ تم استخدام الفئة الافتراضية ${family}.`);
  }
  let soiScore = principalSoiContribution + creditedEntries.reduce((sum, e) => sum + e.soi_weight, 0);
  let romScore = principalRomContribution + creditedEntries.reduce((sum, e) => sum + e.rom_weight, 0);
  if (creditedEntries.length > 0) {
    const soiSum = creditedEntries.reduce((sum, e) => sum + e.soi_weight, 0);
    const romSum = creditedEntries.reduce((sum, e) => sum + e.rom_weight, 0);
    explanationEn.push(`${creditedEntries.length} secondary diagnosis(es) (${creditedEntries.map((e) => e.code).join(', ')}) add ${soiSum} SOI / ${romSum} ROM point(s).`);
    explanationAr.push(`${creditedEntries.length} تشخيص(ات) ثانوية (${creditedEntries.map((e) => e.code).join(', ')}) تضيف ${soiSum} نقطة شدة و ${romSum} نقطة خطر وفاة.`);
  }
  if (excludedEntries.length > 0) {
    explanationEn.push(`${excludedEntries.length} secondary diagnosis(es) (${excludedEntries.map((e) => e.code).join(', ')}) were confirmed as not present on admission — excluded from the admission-severity score and flagged for hospital-acquired complication review.`);
    explanationAr.push(`${excludedEntries.length} تشخيص(ات) ثانوية (${excludedEntries.map((e) => e.code).join(', ')}) تم تأكيد عدم وجودها عند الدخول — استُبعدت من درجة شدة الحالة عند الدخول وتم وضع علامة عليها لمراجعة المضاعفات المكتسبة داخل المستشفى.`);
  }
  if (typeof age === 'number') {
    if (age >= 75) {
      romScore += 2;
      explanationEn.push(`Age ${age} (≥75) adds 2 ROM points.`);
      explanationAr.push(`العمر ${age} (≥75) يضيف نقطتي خطر وفاة.`);
    } else if (age >= 65) {
      romScore += 1;
      explanationEn.push(`Age ${age} (≥65) adds 1 ROM point.`);
      explanationAr.push(`العمر ${age} (≥65) يضيف نقطة خطر وفاة واحدة.`);
    }
    if (age < 1) {
      romScore += 1; // neonatal risk, reflecting APR-DRG's all-ages coverage incl. pediatrics
      explanationEn.push('Neonatal age (<1 year) adds 1 ROM point.');
      explanationAr.push('عمر حديثي الولادة (أقل من سنة) يضيف نقطة خطر وفاة واحدة.');
    }
  }
  const soi = tierFromScore(soiScore);
  const rom = tierFromScore(romScore);
  explanationEn.push(`Severity score ${soiScore} → SOI tier ${soi}; mortality score ${romScore} → ROM tier ${rom}.`);
  explanationAr.push(`درجة الشدة ${soiScore} ← المستوى ${soi}؛ درجة خطر الوفاة ${romScore} ← المستوى ${rom}.`);
  const methodology: DrgResult['methodology'] = encounterType === 'OUTPATIENT' ? 'BrainSAIT-EAPG' : 'BrainSAIT-APR-DRG';
  // Medical vs. Surgical partition: a matching OR procedure materially
  // upgrades resource consumption within the same clinical category, exactly
  // as real APR-DRG methodology partitions each DRG into Medical/Surgical.
  const matchingProcedures = Array.from(new Set(procedureCodes))
    .map((c) => findProcedureEntry(c))
    .filter((p): p is NonNullable<typeof p> => p !== undefined && p.surgical_families.includes(family));
  const chosenProcedure = matchingProcedures.sort((a, b) => b.weight_multiplier - a.weight_multiplier)[0];
  const partition: DrgResult['partition'] = chosenProcedure ? 'Surgical' : 'Medical';
  const baseWeight = familyMeta.base_weight[soi - 1];
  const relative_weight = chosenProcedure ? Math.round(baseWeight * chosenProcedure.weight_multiplier * 1000) / 1000 : baseWeight;
  if (chosenProcedure) {
    explanationEn.push(`Procedure "${chosenProcedure.desc_en}" detected → Surgical partition, relative weight ×${chosenProcedure.weight_multiplier} (${baseWeight} → ${relative_weight}).`);
    explanationAr.push(`تم رصد إجراء "${chosenProcedure.desc_ar}" ← القسم الجراحي، الوزن النسبي ×${chosenProcedure.weight_multiplier} (${baseWeight} ← ${relative_weight}).`);
  } else {
    explanationEn.push(`No matching OR procedure detected → Medical partition, relative weight ${relative_weight}.`);
    explanationAr.push(`لم يتم رصد إجراء جراحي مطابق ← القسم الطبي، الوزن النسبي ${relative_weight}.`);
  }
  return {
    code: family,
    title_en: familyMeta.title_en,
    title_ar: familyMeta.title_ar,
    department_en: familyMeta.department_en,
    department_ar: familyMeta.department_ar,
    soi,
    rom,
    relative_weight,
    subclass: `${family}-${partition === 'Surgical' ? 'S' : 'M'}-${soi}`,
    methodology,
    partition,
    procedure: chosenProcedure
      ? { code: chosenProcedure.code, desc_en: chosenProcedure.desc_en, desc_ar: chosenProcedure.desc_ar }
      : undefined,
    explanation: { en: explanationEn, ar: explanationAr },
  };
}
/** Computes the Case Mix Index (mean relative weight) across a set of grouped encounters. */
export function computeCaseMixIndex(results: Pick<DrgResult, 'relative_weight'>[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + r.relative_weight, 0);
  return Math.round((sum / results.length) * 1000) / 1000;
}
/** The full set of clinical departments a DRG family can route to, derived from DRG_FAMILY_TABLE. */
export const DEPARTMENTS: { en: string; ar: string }[] = Array.from(
  new Map(Object.values(DRG_FAMILY_TABLE).map((f) => [f.department_en, { en: f.department_en, ar: f.department_ar }])).values()
).sort((a, b) => a.en.localeCompare(b.en));
/** Breaks a set of grouped encounters down by owning clinical department, each with its own Case Mix Index. */
export function computeDepartmentDistribution(
  results: Pick<DrgResult, 'department_en' | 'department_ar' | 'relative_weight'>[]
): DepartmentCaseMixRow[] {
  const byDept = new Map<string, { department_ar: string; weights: number[] }>();
  for (const r of results) {
    const bucket = byDept.get(r.department_en) ?? { department_ar: r.department_ar, weights: [] };
    bucket.weights.push(r.relative_weight);
    byDept.set(r.department_en, bucket);
  }
  return Array.from(byDept.entries())
    .map(([department_en, { department_ar, weights }]) => ({
      department_en,
      department_ar,
      encounter_count: weights.length,
      case_mix_index: Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 1000) / 1000,
    }))
    .sort((a, b) => b.encounter_count - a.encounter_count);
}
