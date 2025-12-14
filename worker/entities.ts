/**
 * Minimal real-world demo: One Durable Object instance per entity (User, ChatBoard), with Indexes for listing.
 */
import { IndexedEntity } from "./core-utils";
import type { User, Chat, ChatMessage, Patient, Claim, CodingJob, Encounter, Nudge, AuditLog, Payment, Analytics } from "@shared/types";
import { MOCK_CHAT_MESSAGES, MOCK_CHATS, MOCK_USERS, MOCK_PATIENTS, MOCK_CLAIMS, MOCK_CODING_JOBS, MOCK_ENCOUNTERS, MOCK_NUDGES, MOCK_AUDIT_LOGS, MOCK_PAYMENTS, MOCK_ANALYTICS } from "@shared/mock-data";
// USER ENTITY: one DO instance per user
export class UserEntity extends IndexedEntity<User> {
  static readonly entityName = "user";
  static readonly indexName = "users";
  static readonly initialState: User = { id: "", name: "" };
  static seedData = MOCK_USERS;
}
// CHAT BOARD ENTITY: one DO instance per chat board, stores its own messages
export type ChatBoardState = Chat & { messages: ChatMessage[] };
const SEED_CHAT_BOARDS: ChatBoardState[] = MOCK_CHATS.map(c => ({
  ...c,
  messages: MOCK_CHAT_MESSAGES.filter(m => m.chatId === c.id),
}));
export class ChatBoardEntity extends IndexedEntity<ChatBoardState> {
  static readonly entityName = "chat";
  static readonly indexName = "chats";
  static readonly initialState: ChatBoardState = { id: "", title: "", messages: [] };
  static seedData = SEED_CHAT_BOARDS;
  async listMessages(): Promise<ChatMessage[]> {
    const { messages } = await this.getState();
    return messages;
  }
  async sendMessage(userId: string, text: string): Promise<ChatMessage> {
    const msg: ChatMessage = { id: crypto.randomUUID(), chatId: this.id, userId, text, ts: Date.now() };
    await this.mutate(s => ({ ...s, messages: [...s.messages, msg] }));
    return msg;
  }
}
// --- SOLVENTUM DRG SUITE ENTITIES ---
export class PatientEntity extends IndexedEntity<Patient> {
  static readonly entityName = "patient";
  static readonly indexName = "patients";
  static readonly initialState: Patient = { id: "", national_id: "", given_name: "", family_name: "" };
  static seedData = MOCK_PATIENTS;
}
export class EncounterEntity extends IndexedEntity<Encounter> {
  static readonly entityName = "encounter";
  static readonly indexName = "encounters";
  static readonly initialState: Encounter = { id: "", patient_id: "", encounter_type: "INPATIENT", admission_dt: "" };
  static seedData = MOCK_ENCOUNTERS;
}
export class ClaimEntity extends IndexedEntity<Claim> {
  static readonly entityName = "claim";
  static readonly indexName = "claims";
  static readonly initialState: Claim = { id: "", encounter_id: "", claim_number: "", status: "DRAFT", submitted_at: null, amount: 0 };
  static seedData = MOCK_CLAIMS;
}
export class CodingJobEntity extends IndexedEntity<CodingJob> {
  static readonly entityName = "coding_job";
  static readonly indexName = "coding_jobs";
  static readonly initialState: CodingJob = { id: "", encounter_id: "", suggested_codes: [], status: "NEEDS_REVIEW", confidence_score: 0, phase: "CAC", created_at: "" };
  static seedData = MOCK_CODING_JOBS;
}
export class NudgeEntity extends IndexedEntity<Nudge> {
    static readonly entityName = "nudge";
    static readonly indexName = "nudges";
    static readonly initialState: Nudge = { id: "", encounter_id: "", severity: "info", prompt: "", status: "active", created_at: "" };
    static seedData = MOCK_NUDGES;
}
export class AuditLogEntity extends IndexedEntity<AuditLog> {
    static readonly entityName = "audit_log";
    static readonly indexName = "audit_logs";
    static readonly initialState: AuditLog = { id: "", actor: "", action: "", object_type: "", object_id: "", occurred_at: "" };
    static seedData = MOCK_AUDIT_LOGS;
}
export class PaymentEntity extends IndexedEntity<Payment> {
    static readonly entityName = "payment";
    static readonly indexName = "payments";
    static readonly initialState: Payment = { id: "", claim_id: "", amount: 0, currency: "SAR", reconciled: false, received_at: "" };
    static seedData = MOCK_PAYMENTS;
}
export class AnalyticsEntity extends IndexedEntity<Analytics> {
    static readonly entityName = "analytics";
    static readonly indexName = "analytics_jobs";
    static readonly initialState: Analytics = { id: "", job_id: "", accuracy: 0, phase: "CAC", created_at: "" };
    static seedData = MOCK_ANALYTICS;
}