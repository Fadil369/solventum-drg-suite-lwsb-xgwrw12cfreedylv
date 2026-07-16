/**
 * BrainSAIT Bilingual Procedure Lexicon — Medical/Surgical DRG Partition
 * ---------------------------------------------------------------------------
 * Real APR-DRG methodology doesn't stop at diagnoses: within a clinical
 * category, encounters split into a Medical partition (managed without an
 * operating-room procedure) and a Surgical partition (an OR procedure was
 * performed), and the surgical partition carries a materially higher
 * relative weight because it reflects greater resource consumption. A
 * diagnosis-only grouper — which is all this engine had before this file —
 * cannot make that distinction; "appendicitis managed medically" and
 * "appendicitis with appendectomy" would group identically.
 *
 * This lexicon recognizes bilingual mentions of common OR procedures and
 * tells the grouper (`drg-grouper.ts`) which DRG families they upgrade, and
 * by how much. Like the diagnosis lexicon, weights here are BrainSAIT's own
 * calibration, not 3M-licensed values.
 */
export interface ProcedureEntry {
  code: string;
  desc_en: string;
  desc_ar: string;
  synonyms_en: string[];
  synonyms_ar: string[];
  /** DRG families this procedure moves into the Surgical partition when present. */
  surgical_families: string[];
  /** Multiplier applied to the Medical-partition relative weight. */
  weight_multiplier: number;
  /**
   * Real Saudi Billing System (SBS v3.4, official electronic code list)
   * code + short description for this procedure, where a single-code
   * mapping exists. SBS requires organ/site specificity for some procedure
   * families (tumor excision is coded per-organ — mastectomy, lymph node
   * excision, etc. — with no single generic "tumor resection" code), so
   * sbs_code is deliberately left undefined there rather than mapped to a
   * misleading code.
   */
  sbs_code?: string;
  sbs_desc_en?: string;
  /**
   * When SBS assigns different codes to the unilateral vs. bilateral variant
   * of this exact procedure, both are listed here so the engine can ask a
   * clarifying laterality question when the note doesn't already specify
   * one — see `generateRefinementQuestions` in cdi-rules.ts. sbs_code above
   * is the unilateral variant by default.
   */
  sbs_laterality?: { unilateral: string; bilateral: string };
}
export const PROCEDURE_LEXICON: ProcedureEntry[] = [
  {
    code: 'PR-APPY',
    desc_en: 'Appendectomy',
    desc_ar: 'استئصال الزائدة الدودية',
    synonyms_en: ['appendectomy', 'appendix removed', 'appendix removal'],
    synonyms_ar: ['استئصال الزائدة الدودية', 'إزالة الزائدة'],
    surgical_families: ['261'],
    weight_multiplier: 1.6,
    sbs_code: '30571-00-00',
    sbs_desc_en: 'Appendicectomy',
  },
  {
    code: 'PR-CHOLE',
    desc_en: 'Cholecystectomy',
    desc_ar: 'استئصال المرارة',
    synonyms_en: ['cholecystectomy', 'gallbladder removed', 'gallbladder removal'],
    synonyms_ar: ['استئصال المرارة', 'إزالة المرارة'],
    surgical_families: ['220'],
    weight_multiplier: 1.5,
    sbs_code: '30443-00-00',
    sbs_desc_en: 'Cholecystectomy',
  },
  {
    code: 'PR-ORIF',
    desc_en: 'Open Reduction Internal Fixation',
    desc_ar: 'التثبيت الداخلي المفتوح للكسر',
    synonyms_en: ['orif', 'open reduction internal fixation', 'surgical fixation', 'fracture surgery'],
    synonyms_ar: ['تثبيت داخلي مفتوح', 'جراحة الكسر', 'تثبيت جراحي للكسر'],
    surgical_families: ['302'],
    weight_multiplier: 1.7,
    sbs_code: '47528-01-01',
    sbs_desc_en: 'Open reduction of fracture of femur with internal fixation, unilateral',
    sbs_laterality: { unilateral: '47528-01-01', bilateral: '47528-01-02' },
  },
  {
    code: 'PR-PCI',
    desc_en: 'Percutaneous Coronary Intervention',
    desc_ar: 'قسطرة قلبية تداخلية',
    synonyms_en: ['pci', 'percutaneous coronary intervention', 'coronary stent', 'angioplasty'],
    synonyms_ar: ['قسطرة قلبية مع دعامة', 'رأب الأوعية التاجية', 'دعامة تاجية'],
    surgical_families: ['190'],
    weight_multiplier: 1.8,
    sbs_code: '38306-00-00',
    sbs_desc_en: 'Percutaneous insertion of 1 transluminal stent into single coronary artery',
  },
  {
    code: 'PR-CABG',
    desc_en: 'Coronary Artery Bypass Graft',
    desc_ar: 'مجازة الشريان التاجي',
    synonyms_en: ['cabg', 'coronary artery bypass', 'bypass surgery'],
    synonyms_ar: ['مجازة الشريان التاجي', 'جراحة القلب المفتوح'],
    surgical_families: ['190'],
    weight_multiplier: 2.3,
    sbs_code: '38497-00-00',
    sbs_desc_en: 'Coronary artery bypass, using 1 saphenous vein graft',
  },
  {
    code: 'PR-ARTHRO',
    desc_en: 'Total Joint Arthroplasty',
    desc_ar: 'استبدال المفصل الكلي',
    synonyms_en: ['joint replacement', 'hip replacement', 'knee replacement', 'arthroplasty'],
    synonyms_ar: ['استبدال المفصل', 'تبديل مفصل الورك', 'تبديل مفصل الركبة'],
    surgical_families: ['300'],
    weight_multiplier: 2.0,
    // Default is hip; SBS codes knee arthroplasty separately (49518-00-00 /
    // 49519-00-00) — a coder should confirm the joint from the note context.
    sbs_code: '49318-00-00',
    sbs_desc_en: 'Total arthroplasty of hip, unilateral',
    sbs_laterality: { unilateral: '49318-00-00', bilateral: '49319-00-00' },
  },
  {
    code: 'PR-DIALYSIS-ACCESS',
    desc_en: 'Dialysis Access Placement',
    desc_ar: 'إنشاء مدخل للغسيل الكلوي',
    synonyms_en: ['dialysis catheter', 'av fistula', 'dialysis access placement'],
    synonyms_ar: ['قسطرة الغسيل الكلوي', 'ناسور شرياني وريدي', 'مدخل الغسيل الكلوي'],
    surgical_families: ['461', '460'],
    weight_multiplier: 1.5,
    sbs_code: '34528-02-00',
    sbs_desc_en: 'Insertion of vascular access device',
  },
  {
    code: 'PR-CRANI',
    desc_en: 'Craniotomy',
    desc_ar: 'فتح الجمجمة الجراحي',
    synonyms_en: ['craniotomy', 'brain surgery', 'neurosurgery'],
    synonyms_ar: ['فتح الجمجمة', 'جراحة الدماغ', 'جراحة الأعصاب'],
    surgical_families: ['045', '070'],
    weight_multiplier: 2.2,
    sbs_code: '39706-01-00',
    sbs_desc_en: 'Decompression of intracranial tumour via osteoplastic craniotomy',
  },
  {
    code: 'PR-TUMOR-RESECT',
    desc_en: 'Tumor Resection',
    desc_ar: 'استئصال الورم',
    synonyms_en: ['tumor resection', 'mastectomy', 'oncologic surgery', 'tumor removed'],
    synonyms_ar: ['استئصال الورم', 'استئصال الثدي', 'جراحة استئصال ورم'],
    surgical_families: ['690'],
    weight_multiplier: 1.8,
    // No sbs_code: SBS has no generic tumor-excision code — it's organ-
    // specific (e.g. 31518-00-00 simple mastectomy, 31435-00-00 radical
    // lymph node excision of neck). This is exactly the kind of gap
    // generateRefinementQuestions() surfaces as a clarifying question.
  },
  {
    code: 'PR-BOWEL-RESECT',
    desc_en: 'Bowel Resection',
    desc_ar: 'استئصال جزء من الأمعاء',
    synonyms_en: ['bowel resection', 'intestinal resection', 'colectomy'],
    synonyms_ar: ['استئصال الأمعاء', 'استئصال القولون'],
    surgical_families: ['254'],
    weight_multiplier: 1.7,
    sbs_code: '30566-00-00',
    sbs_desc_en: 'Resection of small intestine with anastomosis',
  },
  {
    code: 'PR-DEBRIDE',
    desc_en: 'Surgical Wound Debridement',
    desc_ar: 'تنضير الجرح الجراحي',
    synonyms_en: ['debridement', 'surgical debridement', 'wound debridement'],
    synonyms_ar: ['تنضير الجرح', 'تنظيف الجرح جراحيًا'],
    surgical_families: ['350', '384'],
    weight_multiplier: 1.4,
    sbs_code: '90665-00-20',
    sbs_desc_en: 'Excisional debridement of skin and subcutaneous tissue, medium',
  },
];
export function findProcedureEntry(code: string): ProcedureEntry | undefined {
  return PROCEDURE_LEXICON.find((p) => p.code === code);
}
