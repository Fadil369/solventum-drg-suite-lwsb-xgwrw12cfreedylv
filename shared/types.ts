export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
// --- DEMO ENTITIES (can be removed) ---
export interface User {
  id: string;
  name: string;
}
export interface Chat {
  id: string;
  title: string;
}
export interface ChatMessage {
  id: string;
  chatId: string;
  userId: string;
  text: string;
  ts: number; // epoch millis
}
// --- SOLVENTUM DRG SUITE DOMAIN MODELS ---
export interface Patient {
  id: string;
  national_id: string;
  given_name: string;
  family_name: string;
}
export interface Encounter {
  id: string;
  patient_id: string;
  encounter_type: 'INPATIENT' | 'OUTPATIENT' | 'ED';
  admission_dt: string; // ISO string
  clinical_note?: string;
  provider_cr?: string;
}
export interface Claim {
  id: string;
  encounter_id: string;
  claim_number: string;
  status: 'DRAFT' | 'SENT' | 'FC_3' | 'REJECTED' | 'NEEDS_REVIEW';
  submitted_at: string | null; // ISO string
  amount: number;
}
export interface SuggestedCode {
  code: string;
  desc: string;
  desc_ar?: string;
  term_en?: string;
  term_ar?: string;
  matched_text?: string;
  confidence: number;
  is_principal?: boolean;
  soi_weight?: number; // contribution to Severity of Illness (0-3)
  rom_weight?: number; // contribution to Risk of Mortality (0-3)
}
export interface SuggestedProcedure {
  code: string;
  desc: string;
  desc_ar?: string;
  matched_text?: string;
}
// --- BRAINSAIT APR-DRG GROUPER RESULT ---
// A deterministic, explainable implementation of the APR-DRG methodology:
// assigns a base DRG family from the principal diagnosis, then derives
// Severity of Illness (SOI) and Risk of Mortality (ROM) subclasses (1-4)
// from the weighted contribution of secondary diagnoses. When a matching
// OR procedure is detected, the encounter is upgraded from the Medical to
// the Surgical partition, as in real APR-DRG methodology.
export interface DrgResult {
  code: string; // e.g. "194"
  title_en: string;
  title_ar: string;
  /** The clinical department that owns this DRG family (e.g. "Cardiology"), for cross-department routing/reporting. */
  department_en: string;
  department_ar: string;
  soi: 1 | 2 | 3 | 4; // Severity of Illness
  rom: 1 | 2 | 3 | 4; // Risk of Mortality
  relative_weight: number; // drives Case Mix Index (CMI)
  subclass: string; // e.g. "194-M-2" (DRG-Partition-SOI)
  methodology: 'BrainSAIT-APR-DRG' | 'BrainSAIT-EAPG';
  partition: 'Medical' | 'Surgical';
  procedure?: { code: string; desc_en: string; desc_ar: string };
  /** Bilingual, human-readable trace of every factor that produced this result. */
  explanation: { en: string[]; ar: string[] };
}
export interface CodingJob {
  id: string;
  encounter_id: string;
  suggested_codes: SuggestedCode[];
  suggested_procedures?: SuggestedProcedure[];
  status: 'NEEDS_REVIEW' | 'AUTO_DROP' | 'SENT_TO_NPHIES' | 'REJECTED';
  confidence_score: number;
  phase: 'CAC' | 'SEMI_AUTONOMOUS' | 'AUTONOMOUS';
  created_at: string; // ISO string
  source_text?: string;
  principal_code?: string;
  secondary_codes?: string[];
  drg?: DrgResult;
  detected_language?: 'en' | 'ar' | 'mixed';
}
export interface Nudge {
    id: string;
    encounter_id: string;
    severity: 'info' | 'warning' | 'critical';
    prompt: string;
    prompt_ar?: string;
    suggested_text?: string;
    suggested_text_ar?: string;
    soi_impact?: string; // e.g. "Closing this gap may raise SOI from 2 to 3"
    soi_impact_ar?: string;
    status: 'active' | 'resolved' | 'dismissed';
    created_at: string; // ISO string
}
export interface AuditLog {
    id: string;
    actor: string;
    action: string;
    object_type: string;
    object_id: string;
    occurred_at: string; // ISO string
}
export interface Payment {
    id: string;
    claim_id: string;
    amount: number;
    currency: 'SAR';
    reconciled: boolean;
    received_at: string; // ISO string
}
export interface Analytics {
    id: string;
    job_id: string;
    accuracy: number;
    phase: 'CAC' | 'SEMI_AUTONOMOUS' | 'AUTONOMOUS';
    phase_dist?: Record<string, number>;
    relative_weight?: number; // contributes to Case Mix Index
    soi?: number;
    rom?: number;
    drg_family?: string;
    department_en?: string;
    department_ar?: string;
    created_at: string; // ISO string
}
/** Server-side account record: password is never stored or transmitted in plaintext. */
export interface Account {
  id: string; // username, lowercased
  username: string;
  password_hash: string;
  salt: string;
  role: 'admin' | 'coder';
}
export interface DepartmentCaseMixRow {
  department_en: string;
  department_ar: string;
  encounter_count: number;
  case_mix_index: number;
}
export type Language = 'en' | 'ar';