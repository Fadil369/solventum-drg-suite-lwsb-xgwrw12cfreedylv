/**
 * Bilingual nphies/Etimad data mapping table (PRD Section 4.0), mirrored from
 * `src/backend/nphies_connector.py::NPHIES_BILINGUAL_FIELD_MAP` so the
 * Integration Console can render the exact same mapping the AWS backend
 * enforces.
 */
export interface NphiesFieldMapping {
  brainsait_concept_en: string;
  brainsait_concept_ar: string;
  nphies_field_en: string;
  nphies_field_ar: string;
  source: string;
}
export const NPHIES_BILINGUAL_FIELD_MAP: NphiesFieldMapping[] = [
  {
    brainsait_concept_en: 'Patient Identifiers',
    brainsait_concept_ar: 'معرفات المريض',
    nphies_field_en: 'Patient Identifier (National ID, Iqama ID)',
    nphies_field_ar: 'معرف المريض (الهوية الوطنية، الإقامة)',
    source: 'nphies User Manual',
  },
  {
    brainsait_concept_en: 'Claim Status',
    brainsait_concept_ar: 'حالة المطالبة',
    nphies_field_en: 'status (e.g., FC_3 for approved claim)',
    nphies_field_ar: 'الحالة (مثل FC_3 للمطالبة المعتمدة)',
    source: 'nphies/Etimad API Guides',
  },
  {
    brainsait_concept_en: 'Vendor/Provider ID',
    brainsait_concept_ar: 'معرف المورد/مقدم الخدمة',
    nphies_field_en: 'CRNumber',
    nphies_field_ar: 'رقم السجل التجاري (CRNumber)',
    source: 'Etimad API Guides',
  },
];
