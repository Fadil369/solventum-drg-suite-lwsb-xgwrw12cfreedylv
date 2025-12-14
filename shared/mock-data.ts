import type { User, Chat, ChatMessage, Patient, Claim, CodingJob, Encounter, Nudge, AuditLog, Payment, Analytics } from './types';
export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'User A' },
  { id: 'u2', name: 'User B' }
];
export const MOCK_CHATS: Chat[] = [
  { id: 'c1', title: 'General' },
];
export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  { id: 'm1', chatId: 'c1', userId: 'u1', text: 'Hello', ts: Date.now() },
];
// --- SOLVENTUM MOCK DATA ---
export const MOCK_CLINICAL_NOTES: string[] = [
    "Patient with sukari symptoms, no complications noted.",
    "High blood pressure diagnosed, ضغط دم مرتفع controlled with medication.",
    "Appendix pain and inflammation, suspected appendicitis.",
    "Left leg fracture after fall, كسر in tibia.",
    "Low-complexity outpatient visit for fever and cough.",
    "Pneumonia with bacterial organism suspected. سعال شديد reported.",
    "UTI with catheter association.",
    "Myocardial infarction STEMI confirmed.",
    "Hypertension crisis, I10 code needed.",
    "Diabetes type 2, E11.9 unspecified.",
    "Patient presents with classic signs of acute myocardial infarction. EKG confirms.",
    "Diagnosis of appendicitis confirmed by imaging. ألم الزائدة is severe.",
    "Patient complains of cough and fever. Suspected pneumonia.",
    "Patient is a known diabetic and presents for routine checkup.",
    "Routine check for high blood pressure."
];
export const MOCK_PATIENTS: Patient[] = [
  { id: 'p1', national_id: '1012345678', given_name: 'Fatima', family_name: 'Al-Fahad' },
  { id: 'p2', national_id: '1023456789', given_name: 'Mohammed', family_name: 'Al-Ghamdi' },
  { id: 'p3', national_id: '1034567890', given_name: 'Aisha', family_name: 'Al-Qahtani' },
  { id: 'p4', national_id: '1045678901', given_name: 'Khaled', family_name: 'Al-Mutairi' },
  { id: 'p5', national_id: '1056789012', given_name: 'Noura', family_name: 'Al-Dosari' },
];
export const MOCK_ENCOUNTERS: Encounter[] = [
    { id: 'e1', patient_id: 'p1', encounter_type: 'INPATIENT', admission_dt: new Date('2024-08-01T10:00:00Z').toISOString() },
    { id: 'e2', patient_id: 'p2', encounter_type: 'OUTPATIENT', admission_dt: new Date('2024-08-02T11:30:00Z').toISOString() },
    { id: 'e3', patient_id: 'p3', encounter_type: 'ED', admission_dt: new Date('2024-08-03T14:00:00Z').toISOString() },
    { id: 'e4', patient_id: 'p4', encounter_type: 'INPATIENT', admission_dt: new Date('2024-08-04T09:00:00Z').toISOString() },
    { id: 'e5', patient_id: 'p5', encounter_type: 'INPATIENT', admission_dt: new Date('2024-08-05T18:00:00Z').toISOString() },
];
export const MOCK_CLAIMS: Claim[] = [
  { id: 'cl1', encounter_id: 'e1', claim_number: 'CLM-2024-001', status: 'FC_3', submitted_at: new Date('2024-08-02T10:00:00Z').toISOString(), amount: 12500.50 },
  { id: 'cl2', encounter_id: 'e2', claim_number: 'CLM-2024-002', status: 'SENT', submitted_at: new Date('2024-08-03T11:30:00Z').toISOString(), amount: 850.00 },
  { id: 'cl3', encounter_id: 'e3', claim_number: 'CLM-2024-003', status: 'REJECTED', submitted_at: new Date('2024-08-04T14:00:00Z').toISOString(), amount: 1200.75 },
  { id: 'cl4', encounter_id: 'e4', claim_number: 'CLM-2024-004', status: 'NEEDS_REVIEW', submitted_at: null, amount: 25000.00 },
  { id: 'cl5', encounter_id: 'e5', claim_number: 'CLM-2024-005', status: 'DRAFT', submitted_at: null, amount: 18000.00 },
  { id: 'cl6', encounter_id: 'e1', claim_number: 'CLM-2024-006', status: 'DRAFT', submitted_at: null, amount: 9500.00 },
  { id: 'cl7', encounter_id: 'e2', claim_number: 'CLM-2024-007', status: 'FC_3', submitted_at: new Date('2024-08-05T12:00:00Z').toISOString(), amount: 450.25 },
  { id: 'cl8', encounter_id: 'e3', claim_number: 'CLM-2024-008', status: 'SENT', submitted_at: new Date('2024-08-06T15:00:00Z').toISOString(), amount: 1500.00 },
  { id: 'cl9', encounter_id: 'e4', claim_number: 'CLM-2024-009', status: 'NEEDS_REVIEW', submitted_at: null, amount: 32000.00 },
  { id: 'cl10', encounter_id: 'e5', claim_number: 'CLM-2024-010', status: 'DRAFT', submitted_at: null, amount: 21000.00 },
];
export const MOCK_CODING_JOBS: CodingJob[] = [
  { id: 'job1', encounter_id: 'e1', suggested_codes: [{ code: 'J18.9', desc: 'Pneumonia, unspecified', confidence: 0.85 }], status: 'NEEDS_REVIEW', confidence_score: 0.85, phase: 'CAC', created_at: new Date().toISOString() },
  { id: 'job2', encounter_id: 'e2', suggested_codes: [{ code: 'I21.9', desc: 'Acute MI, unspecified', confidence: 0.99 }], status: 'SENT_TO_NPHIES', confidence_score: 0.99, phase: 'AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job3', encounter_id: 'e3', suggested_codes: [{ code: 'K37', desc: 'Unspecified appendicitis', confidence: 0.92 }], status: 'AUTO_DROP', confidence_score: 0.92, phase: 'SEMI_AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job4', encounter_id: 'e4', suggested_codes: [{ code: 'S82.90XA', desc: 'Unspecified fracture of lower leg', confidence: 0.78 }], status: 'NEEDS_REVIEW', confidence_score: 0.78, phase: 'CAC', created_at: new Date().toISOString() },
  { id: 'job5', encounter_id: 'e5', suggested_codes: [{ code: 'N39.0', desc: 'UTI, site not specified', confidence: 0.81 }], status: 'NEEDS_REVIEW', confidence_score: 0.81, phase: 'CAC', created_at: new Date().toISOString() },
  { id: 'job6', encounter_id: 'e1', suggested_codes: [], status: 'NEEDS_REVIEW', confidence_score: 0, phase: 'CAC', created_at: new Date().toISOString() },
  { id: 'job7', encounter_id: 'e2', suggested_codes: [{ code: 'R05', desc: 'Cough', confidence: 0.95 }], status: 'AUTO_DROP', confidence_score: 0.95, phase: 'SEMI_AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job8', encounter_id: 'e3', suggested_codes: [{ code: 'R50.9', desc: 'Fever, unspecified', confidence: 0.98 }], status: 'AUTO_DROP', confidence_score: 0.98, phase: 'SEMI_AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job9', encounter_id: 'e1', suggested_codes: [{code: 'E11.9', desc: 'Type 2 diabetes mellitus without complications', confidence: 0.92}], status: 'AUTO_DROP', confidence_score: 0.92, phase: 'SEMI_AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job10', encounter_id: 'e2', suggested_codes: [{code: 'I10', desc: 'Essential hypertension', confidence: 0.99}], status: 'SENT_TO_NPHIES', confidence_score: 0.99, phase: 'AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job11', encounter_id: 'e3', suggested_codes: [{code: 'K37', desc: 'Unspecified appendicitis', confidence: 0.94}], status: 'AUTO_DROP', confidence_score: 0.94, phase: 'SEMI_AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job12', encounter_id: 'e4', suggested_codes: [{code: 'S82.90XA', desc: 'Unspecified fracture of lower leg, check laterality', confidence: 0.75}], status: 'NEEDS_REVIEW', confidence_score: 0.75, phase: 'CAC', created_at: new Date().toISOString() },
  { id: 'job13', encounter_id: 'e5', suggested_codes: [{code: 'E11.9', desc: 'Type 2 diabetes mellitus without complications', confidence: 0.88}, {code: 'I10', desc: 'Essential (primary) hypertension', confidence: 0.91}], status: 'AUTO_DROP', confidence_score: 0.90, phase: 'SEMI_AUTONOMOUS', created_at: new Date().toISOString() },
  { id: 'job14', encounter_id: 'e1', suggested_codes: [{code: 'J18.9', desc: 'Pneumonia, unspecified organism', confidence: 0.82}], status: 'NEEDS_REVIEW', confidence_score: 0.82, phase: 'CAC', created_at: new Date().toISOString() },
  { id: 'job15', encounter_id: 'e2', suggested_codes: [{code: 'N39.0', desc: 'Urinary tract infection, site not specified', confidence: 0.84}], status: 'NEEDS_REVIEW', confidence_score: 0.84, phase: 'CAC', created_at: new Date().toISOString() },
];
export const MOCK_NUDGES: Nudge[] = [
    { id: 'n1', encounter_id: 'e1', severity: 'warning', prompt: "Specify the causative organism for 'pneumonia' if known.", status: 'active', created_at: new Date().toISOString() },
    { id: 'n2', encounter_id: 'e4', severity: 'critical', prompt: "Specify laterality (left, right) for the diagnosed 'fracture'.", status: 'active', created_at: new Date().toISOString() },
    { id: 'n3', encounter_id: 'e5', severity: 'info', prompt: "Consider documenting if UTI is catheter-associated.", status: 'active', created_at: new Date().toISOString() },
    { id: 'n4', encounter_id: 'e2', severity: 'warning', prompt: "Specify type of Myocardial Infarction (e.g., STEMI, NSTEMI).", status: 'resolved', created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'n5', encounter_id: 'e3', severity: 'warning', prompt: "Clarify if appendicitis is with or without perforation.", status: 'dismissed', created_at: new Date(Date.now() - 172800000).toISOString() },
];
export const MOCK_AUDIT_LOGS: AuditLog[] = [
    { id: 'al1', actor: 'system', action: 'claim.submitted', object_type: 'claim', object_id: 'cl2', occurred_at: new Date().toISOString() },
    { id: 'al2', actor: 'user:coder@hospital.sa', action: 'coding_job.reviewed', object_type: 'coding_job', object_id: 'job1', occurred_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'al3', actor: 'system', action: 'nphies.token_refreshed', object_type: 'integration', object_id: 'nphies', occurred_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 'al4', actor: 'system', action: 'claim.status_updated', object_type: 'claim', object_id: 'cl3', occurred_at: new Date(Date.now() - 10800000).toISOString() },
    { id: 'al5', actor: 'user:admin@solventum.sa', action: 'user.login', object_type: 'user', object_id: 'admin@solventum.sa', occurred_at: new Date(Date.now() - 14400000).toISOString() },
];
export const MOCK_PAYMENTS: Payment[] = [
    { id: 'pay1', claim_id: 'cl1', amount: 12500.50, currency: 'SAR', reconciled: true, received_at: new Date().toISOString() },
    { id: 'pay2', claim_id: 'cl7', amount: 450.25, currency: 'SAR', reconciled: true, received_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'pay3', claim_id: 'cl2', amount: 850.00, currency: 'SAR', reconciled: false, received_at: new Date(Date.now() - 172800000).toISOString() },
    { id: 'pay4', claim_id: 'cl8', amount: 1500.00, currency: 'SAR', reconciled: false, received_at: new Date(Date.now() - 259200000).toISOString() },
];
export const MOCK_ANALYTICS: Analytics[] = [
    { id: 'a1', job_id: 'job1', accuracy: 85, phase: 'CAC', created_at: new Date().toISOString() },
    { id: 'a2', job_id: 'job2', accuracy: 99, phase: 'AUTONOMOUS', created_at: new Date().toISOString() },
    { id: 'a3', job_id: 'job3', accuracy: 92, phase: 'SEMI_AUTONOMOUS', created_at: new Date().toISOString() },
    { id: 'a4', job_id: 'job4', accuracy: 78, phase: 'CAC', created_at: new Date().toISOString() },
    { id: 'a5', job_id: 'job5', accuracy: 81, phase: 'CAC', created_at: new Date().toISOString() },
];