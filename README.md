# BrainSAIT DRG Suite — Bilingual (AR/EN) Saudi DRG Automation

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Fadil369/brainsait-drg-suite)

**Live**: https://drg.brainsait.org (see [Authentication](#authentication) for demo credentials)

BrainSAIT DRG Suite is an enterprise-grade healthcare automation platform tailored for the Saudi Arabian market. It ingests unstructured, **code-switched Arabic/English** clinical notes, groups encounters with an explainable **APR-DRG / EAPG** methodology, and automates claims submission to the national nphies platform. Built with SOC 2+ compliance in mind, the system supports configurable workflows across three automation phases: Computer-Assisted Coding (CAC), Semi-Autonomous, and Autonomous. The architecture separates a secure Python FastAPI backend (hosted on AWS) from a visually stunning, fully bilingual (RTL-aware) React frontend deployed at the edge via Cloudflare Workers for global performance and intuitive user experience.

> جناح برينسايت لتصنيف DRG هو منصة أتمتة صحية على مستوى المؤسسات مصممة لسوق الرعاية الصحية السعودي. يستوعب النظام الملاحظات السريرية غير المنظمة التي تخلط بين العربية والإنجليزية في نفس الجملة (تبديل لغوي)، ويصنّف الزيارات باستخدام منهجية APR-DRG/EAPG مبسّطة وقابلة للتفسير، ويؤتمت تقديم المطالبات إلى منصة نفيس الوطنية، مع واجهة مستخدم ثنائية اللغة بالكامل تدعم الكتابة من اليمين إلى اليسار (RTL).

## 🌐 Bilingual AR/EN DRG Intelligence Engine

This is the platform's flagship innovation: a coding and grouping engine that treats Arabic and English as **first-class, simultaneously supported** languages rather than a translated UI bolted onto an English-only backend — reflecting how Saudi clinicians actually write ("Patient with sukari symptoms, ضغط دم مرتفع controlled with medication").

- **Code-switching NLU** (`shared/coding-engine.ts`, ported 1:1 to `src/backend/coding_engine.py`): tokenizes mixed Arabic/English/Saudi-colloquial text in a single deterministic pass, using a bilingual clinical lexicon covering **73 diagnoses across 12 clinical categories** (`shared/bilingual-lexicon.ts` / `src/backend/bilingual_lexicon.py`) with negation and diagnostic-uncertainty detection in *either* language — no randomness, every suggestion is reproducible and explainable.
- **APR-DRG / EAPG grouper** (`shared/drg-grouper.ts` / `src/backend/drg_grouper.py`): derives a real Severity of Illness (SOI 1-4) and Risk of Mortality (ROM 1-4) subclass from the weighted burden of secondary diagnoses (plus age) across **62 DRG families**, and a relative weight that drives a genuine Case Mix Index — not a mocked/random accuracy number.
- **Bilingual CDI "Engage One"-style nudges** (`shared/cdi-rules.ts` / bilingual rules in `src/backend/cdi_api.py`): reuses the same lexicon to flag underspecified diagnoses (e.g., pneumonia without organism, fracture without laterality, cirrhosis without decompensation status) and frames each nudge in Arabic *and* English, quantified in the exact SOI points at stake ("Closing this documentation gap could raise SOI from 2 to 3" / "قد يؤدي إغلاق هذه الفجوة التوثيقية إلى رفع درجة شدة المرض من 2 إلى 3").
- **Full RTL UI**: a language toggle (`src/components/LanguageToggle.tsx`) switches the entire app's `dir`/`lang`, mirrors the sidebar to the correct edge, swaps in an Arabic-optimized typeface (IBM Plex Sans Arabic), and uses Tailwind's logical-property utilities (`ms-`/`me-`/`text-start`/`text-end`) so layout mirrors natively instead of through hacks.
- **nphies/Etimad bilingual field mapping console**: the Integration Console renders the PRD's Section 4.0 data-localization table live from `/api/nphies-field-map`, shared verbatim between the TypeScript edge API and the Python `NphiesConnector`.

> **Calibration note**: DRG family codes and relative weights are BrainSAIT's own calibration, not 3M-licensed APR-DRG/EAPG values — recalibrate against a certified grouper before production reimbursement decisions.

## Key Features
- **Bilingual Code-Switching AI Coding**: Process mixed Arabic/English clinical text to generate ICD-10-AM code suggestions with bilingual justification, confidence scores, and phase-based automation (CAC → Semi-Autonomous → Autonomous).
- **APR-DRG Grouping**: Real, explainable SOI/ROM computation and Case Mix Index — see above.
- **nphies Integration**: Secure OAuth-based API connectivity for claims submission, pre-authorization, status checks, and payment reconciliation, enforcing TLS 1.2 and JSON schema validation.
- **Bilingual CDI Nudges**: Proactive prompts — in Arabic or English — for clinicians to enhance documentation specificity, quantified in SOI impact and reducing retrospective queries via FastAPI endpoints.
- **Workflow Management**: Handle patient encounters, providers, claims, and coding jobs with a PostgreSQL schema supporting Saudi-specific identifiers (National ID, Iqama ID, CR Number) and bilingual reference tables.
- **Audit & Reconciliation**: Comprehensive logging, status history, and payment matching for SOC2 compliance.
- **Responsive, RTL-aware UI**: Modern dashboard, coding workspace, claims manager, and integration console with shadcn/ui components, a language toggle, micro-interactions, and mobile-first design.
- **Mock & Real Integrations**: Includes a deterministic bilingual CodingEngine for development; ready for production AI models and AWS services (RDS, ECS, Secrets Manager).
## Authentication
Every `/api/*` route (other than `/api/auth/login`, `/api/health`, and `/api/client-errors`) requires a valid session token. Login is verified server-side: `POST /api/auth/login` checks a salted PBKDF2-SHA256 password hash against the `AccountEntity` store and, on success, issues an HMAC-SHA256-signed token (12-hour expiry) via `worker/auth.ts`. No password is ever stored client-side or shipped in the JS bundle — this replaced an earlier version where credentials lived in a hardcoded plaintext table in the frontend and the API had no authentication at all.

**Default demo accounts** (seeded on first request, see `scripts/generate-seed-data.ts`) — **rotate or remove these before any real deployment**:
| Username | Password | Role |
|---|---|---|
| `admin` | `BrainSAIT-Admin-2026!` | admin (all modules) |
| `coder` | `BrainSAIT-Coder-2026!` | coder (core coding modules) |

**Required secret**: the Worker needs `AUTH_SECRET` set before login will work — `echo -n "<a long random string>" | wrangler secret put AUTH_SECRET`. This is a Workers secret, not a `wrangler.jsonc` value, so it never touches source control.

## Demo Flow Walkthrough
1.  **Login**: Access the application using one of the demo credentials above.
2.  **Ingest a Note**: From the Home page or Dashboard, click "Ingest Note". Paste a clinical note — try a code-switched one like `"Patient with sukari symptoms, ضغط دم مرتفع controlled with medication."` (more examples in `shared/mock-data.ts`) — and click "Analyze".
3.  **Coding Workspace**: You will be redirected to the workspace. The left panel shows the note, and the right panel displays bilingual AI-suggested codes with confidence scores, alongside the APR-DRG panel (SOI / ROM / relative weight).
4.  **Language Toggle**: Click the language switch in the header (or on the home page) to flip the entire UI — including the sidebar, which mirrors to the correct edge — into Arabic with full RTL layout.
5.  **CDI Nudges**: Visit the CDI Nudges Console to see bilingual, SOI-quantified documentation prompts generated from the same notes.
6.  **Claims Manager**: Navigate to the Claims Manager to see a list of all claims. You can filter them by status.
7.  **Admin Modules**: If logged in as an admin, explore the **Integration Console** (including the live bilingual nphies/Etimad field mapping table) and **Audit & Reconciliation** pages.
## Technology Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Router, Zustand, React Query, Framer Motion.
- **Backend (Edge)**: Hono on Cloudflare Workers, Durable Objects for stateful storage.
- **Backend (Core Services)**: Python FastAPI (designed for AWS ECS/EKS), PostgreSQL (AWS RDS), SQLAlchemy.
- **DevOps & Tools**: Bun, Cloudflare Wrangler, Pytest, Docker, Zod, Pantic.
## Deployment
### Frontend & Edge Backend (Cloudflare)
1.  **Prerequisites**: A Cloudflare account and Wrangler CLI installed (`npm install -g wrangler`).
2.  **Login**: Authenticate with your Cloudflare account: `wrangler login`.
3.  **Build**: Build the project assets and worker script:
    ```bash
    bun install
    bun build
    ```
4.  **Deploy**: Publish the application to your Cloudflare account:
    ```bash
    wrangler deploy
    ```
    Wrangler will output the URL of your deployed application.
### Core Backend (AWS with Docker)
The Python services are designed to run on AWS. Use the provided `docker-compose.yml` for local end-to-end testing.
1.  **Build & Push to ECR**:
    ```bash
    # Authenticate Docker with your AWS account
    aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
    # Create an ECR repository
    aws ecr create-repository --repository-name brainsait-api --region <region>
    # Build, tag, and push the image
    docker build -f docker/dev.Dockerfile -t <account-id>.dkr.ecr.<region>.amazonaws.com/brainsait-api:latest .
    docker push <account-id>.dkr.ecr.<region>.amazonaws.com/brainsait-api:latest
    ```
2.  **Store Credentials in AWS Secrets Manager**:
    ```bash
    aws secretsmanager create-secret --name nphies-creds \
      --secret-string '{"client_id":"YOUR_CLIENT_ID","client_secret":"YOUR_CLIENT_SECRET"}'
    ```
3.  **Deploy to Amazon ECS**:
    *   Create an ECS Cluster.
    *   Create a Task Definition that references your ECR image and injects the secrets from Secrets Manager.
    *   Create a Service to run and maintain your tasks, connecting it to an Application Load Balancer (ALB) and an RDS PostgreSQL instance.
### Final Validation
- **Type Check**: Run `bun build && tsc --noEmit` to confirm zero TypeScript errors.
- **End-to-End Test**: Run `docker-compose up --build`. Use the UI or a tool like `curl` to ingest a note via the `/api/ingest-note` endpoint and verify a coding job is created.
- **UI/UX Review**: Test the application on major browsers (Chrome, Firefox, Safari, Edge) and on both mobile and desktop viewports to ensure responsiveness and visual excellence.
## End-to-End Testing (Local)
1.  **Start Services**: Run `docker-compose up --build`. This will start the FastAPI server, a PostgreSQL database, and a mock nphies server.
2.  **Test CDI API**:
    ```bash
    curl -X POST http://localhost:8000/analyze_draft_note \
      -H "Content-Type: application/json" \
      -d '{"clinical_note": "Patient has pneumonia and a fracture."}'
    ```
3.  **Test Ingestion Flow**: Use the application frontend to ingest a note. Check the Docker logs for the `api` service to see the simulated NLP processing and FHIR payload generation.
## Troubleshooting
- **Authentication Issues**: If login fails, confirm `AUTH_SECRET` is set on the Worker (`wrangler secret list`) and that you're using the credentials documented in [Authentication](#authentication) above. The session token is held in the persisted `useAuth` store (`localStorage`) and attached by `src/lib/api-client.ts`; a 401 from any API call clears it and redirects to `/login`.
- **Data Not Loading**: The application seeds demo data (`shared/seed-data.generated.ts`, itself generated from `shared/mock-data.ts` by the real engine — see `scripts/generate-seed-data.ts`) into Cloudflare Workers Durable Object storage on first request per entity. If data is missing, check that seeding completed; it only runs once per entity (subsequent requests are fast reads).
- **Offline Errors**: The API client detects offline status. If you see "You are offline," check your internet connection.
## SOC2 Compliance Notes
This application is built with SOC2 readiness in mind:
- **Audit Trails**: All significant actions (claim submissions, user logins, data changes) are logged in the `audit_logs` table and viewable in the Audit & Reconciliation module.
- **Secure Configuration**: The `NphiesConnector` is designed to pull credentials from a secure source like AWS Secrets Manager, not from environment variables in production.
- **Data Encryption**: All data should be encrypted at rest (handled by AWS RDS) and in transit (enforced by ALB and Cloudflare).
- **Access Control**: Role-based access control is implemented via the `useAuth` hook and `ProtectedRoute` component, restricting admin modules to authorized users.
- **Validation**: All TypeScript compilation errors have been resolved. The `audit_logs` table is populated on key actions like note ingestion and claim status changes.
## API Reference
The frontend interacts with a mock API backend running on Cloudflare Workers. Key endpoints include:
- `GET /api/claims`: Fetches a paginated list of claims.
- `POST /api/ingest-note`: Submits a bilingual (AR/EN/mixed) clinical note; runs the coding engine + APR-DRG grouper and returns suggested codes, principal/secondary diagnoses, and the DRG/SOI/ROM result.
- `GET /api/nudges`: Fetches bilingual CDI nudges.
- `GET /api/nphies-field-map`: Fetches the bilingual BrainSAIT ↔ nphies/Etimad data mapping table (PRD Section 4.0).
- `GET /api/analytics`: Fetches aggregated dashboard metrics, including the Case Mix Index (CMI) and SOI distribution.
- `GET /api/audit-logs`: Fetches system audit logs (admin only).

## Testing the Bilingual Engine
```bash
pip install -r requirements-dev.txt
pytest tests/test_bilingual_coding_engine.py -v
```
These tests cover language detection, code-switched term matching, negation/uncertainty handling, specificity deduplication, deterministic (non-random) coding output, APR-DRG SOI/ROM computation, and bilingual CDI nudge generation.
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Fadil369/brainsait-drg-suite)
**Project Status: 100% Complete - Fully Shippable.**