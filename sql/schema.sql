-- Solventum DRG Suite: Canonical PostgreSQL Schema
-- This schema defines the core tables for patients, providers, encounters,
-- claims, and auditing, with specific fields for the Saudi Arabian market (nphies).
-- Enable UUID generation extension if not already enabled.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- 1) Patients: Stores patient demographic information.
-- Includes Saudi-specific identifiers: National ID and Iqama ID.
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  national_id VARCHAR(20) UNIQUE,        -- Saudi National ID
  iqama_id VARCHAR(20) UNIQUE,           -- Iqama (residency) ID for non-nationals
  given_name VARCHAR(128) NOT NULL,
  family_name VARCHAR(128),
  date_of_birth DATE,
  sex VARCHAR(16),                       -- e.g., Male, Female, Other
  contact JSONB,                         -- { "phone": "...", "email": "..." }
  address JSONB,                         -- { "street": "...", "city": "...", "country": "SA" }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-- 2) Providers: Stores information about healthcare providers or facilities.
-- Includes CRNumber (Commercial Registration) as a unique vendor identifier.
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  cr_number VARCHAR(64) UNIQUE,          -- Commercial Registration number (Vendor ID for nphies)
  npi VARCHAR(64),                       -- National Provider Identifier (if applicable)
  address JSONB,
  contact JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-- 3) Encounters: Represents a patient visit or admission.
-- Links patients to providers and captures clinical context like CMI and acuity.
CREATE TABLE encounters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  encounter_type VARCHAR(32) NOT NULL,   -- INPATIENT | OUTPATIENT | ED | AMBULATORY
  admission_dt TIMESTAMP WITH TIME ZONE,
  discharge_dt TIMESTAMP WITH TIME ZONE,
  case_mix_index NUMERIC(5,3) DEFAULT 0,  -- Case Mix Index, calculated post-coding
  acuity_score NUMERIC(5,2) DEFAULT 0,   -- Patient acuity score (e.g., on a 1-5 scale)
  visit_complexity VARCHAR(64) NULL,     -- e.g., 'low-complexity outpatient', used for automation rules
  clinical_note JSONB DEFAULT '{}'::jsonb, -- Store for original and revised notes
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(patient_id, admission_dt)       -- Heuristic to prevent duplicate encounters
);
CREATE INDEX idx_encounters_patient ON encounters(patient_id);
-- 4) Claims: Manages the lifecycle of a claim submitted to nphies.
-- Status field is designed to map directly to nphies status codes.
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id),
  claim_payload JSONB NOT NULL,           -- The canonical JSON payload sent to nphies
  claim_number VARCHAR(128) UNIQUE,       -- Local or nphies-returned claim identifier
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- e.g., DRAFT, SENT, FC_3 (Approved), REJECTED
  status_reason JSONB NULL,               -- Stores reasons for rejection or other states
  nphies_response JSONB NULL,             -- Stores the last raw response from nphies
  submitted_at TIMESTAMP WITH TIME ZONE,
  last_status_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-- 5) Claim History: Provides an audit trail for claim status transitions.
CREATE TABLE claim_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  prev_status VARCHAR(32),
  new_status VARCHAR(32) NOT NULL,
  actor VARCHAR(128),                     -- e.g., "system", "user:uuid"
  reason TEXT,
  metadata JSONB,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX idx_claim_history_claim_id ON claim_history(claim_id);
-- 6) Coding Jobs: Tracks the AI-assisted coding process for each encounter.
CREATE TABLE coding_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  engine_version VARCHAR(64),
  source_text TEXT,
  suggested_codes JSONB,    -- e.g., [{ "code": "J18.9", "desc": "Pneumonia...", "confidence": 0.82 }]
  final_codes JSONB,        -- Codes accepted after human review or autonomous decision
  status VARCHAR(32) DEFAULT 'NEEDS_REVIEW', -- NEEDS_REVIEW | AUTO_DROP | SENT_TO_NPHIES | REJECTED
  confidence_score NUMERIC(5,2) DEFAULT 0,
  phase VARCHAR(32) DEFAULT 'CAC', -- CAC | SEMI_AUTONOMOUS | AUTONOMOUS
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX idx_coding_jobs_encounter_id ON coding_jobs(encounter_id);
-- 7) Payments: For reconciling payments received against submitted claims.
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID REFERENCES claims(id),
  amount NUMERIC(12,2),
  currency VARCHAR(8) DEFAULT 'SAR',
  payment_payload JSONB,                  -- Raw payment data from nphies/bank
  reconciled BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-- 8) Audit Logs: General-purpose audit trail for SOC2 compliance.
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor VARCHAR(128),
  action VARCHAR(128),
  object_type VARCHAR(64),
  object_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);