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
  confidence: number;
}
export interface CodingJob {
  id: string;
  encounter_id: string;
  suggested_codes: SuggestedCode[];
  status: 'NEEDS_REVIEW' | 'AUTO_DROP' | 'SENT_TO_NPHIES' | 'REJECTED';
  confidence_score: number;
  phase: 'CAC' | 'SEMI_AUTONOMOUS' | 'AUTONOMOUS';
  created_at: string; // ISO string
  source_text?: string;
}
export interface Nudge {
    id: string;
    encounter_id: string;
    severity: 'info' | 'warning' | 'critical';
    prompt: string;
    suggested_text?: string;
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
    created_at: string; // ISO string
}