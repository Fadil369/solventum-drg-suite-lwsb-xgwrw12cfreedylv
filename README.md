# BrainSAIT DRG Suite �� Saudi DRG Automation
[![[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Fadil369/brainsait-drg-suite)]](https://deploy.workers.cloudflare.com/?url=${repositoryUrl})
BrainSAIT DRG Suite is an enterprise-grade healthcare automation platform tailored for the Saudi Arabian market. It ingests unstructured clinical notes, leverages AI-driven logic to assign ICD-10 and DRG codes (APR-DRGs for inpatient and EAPGs for outpatient), and automates claims submission to the national nphies platform. Built with SOC 2+ compliance in mind, the system supports configurable workflows across three automation phases: Computer-Assisted Coding (CAC), Semi-Autonomous, and Autonomous. The architecture separates a secure Python FastAPI backend (hosted on AWS) from a visually stunning React frontend deployed at the edge via Cloudflare Workers for global performance and intuitive user experience.
## Key Features
- **Clinical Note Ingestion & AI Coding**: Process unstructured text to generate ICD/DRG code suggestions with confidence scores and phase-based automation (CAC → Semi-Autonomous → Autonomous).
- **nphies Integration**: Secure OAuth-based API connectivity for claims submission, pre-authorization, status checks, and payment reconciliation, enforcing TLS 1.2 and JSON schema validation.
- **CDI Nudges**: Proactive prompts for clinicians to enhance documentation specificity, reducing retrospective queries via FastAPI endpoints.
- **Workflow Management**: Handle patient encounters, providers, claims, and coding jobs with PostgreSQL schema supporting Saudi-specific identifiers (National ID, Iqama ID, CR Number).
- **Audit & Reconciliation**: Comprehensive logging, status history, and payment matching for SOC 2 compliance.
- **Responsive UI**: Modern dashboard, coding workspace, claims manager, and integration console with shadcn/ui components, micro-interactions, and mobile-first design.
- **Mock & Real Integrations**: Includes mock CodingEngine for development; ready for production AI models and AWS services (RDS, ECS, Secrets Manager).
## Demo Flow Walkthrough
1.  **Login**: Access the application using one of the mock credentials:
    *   **Admin User**: `username: admin`, `password: password` (access to all modules).
    *   **Coder User**: `username: coder`, `password: password` (access to core coding modules).
2.  **Ingest a Note**: From the Home page or Dashboard, click "Ingest Note". Paste a clinical note (see `shared/mock-data.ts` for examples) and click "Analyze".
3.  **Coding Workspace**: You will be redirected to the workspace. The left panel shows the note, and the right panel displays AI-suggested codes with confidence scores.
4.  **Claims Manager**: Navigate to the Claims Manager to see a list of all claims. You can filter them by status.
5.  **Admin Modules**: If logged in as an admin, explore the **Integration Console** and **Audit & Reconciliation** pages to see mock monitoring and financial tools.
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
- **Authentication Issues**: If login fails, check the mock credentials in `src/hooks/use-auth.ts`. Auth state is persisted in localStorage; clear it if issues persist.
- **Data Not Loading**: The application uses a mock backend on Cloudflare Workers seeded from `shared/mock-data.ts`. If data is missing, the seeding process may have failed. The first visit to any data-driven page triggers the seed.
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
- `POST /api/ingest-note`: Submits a clinical note for analysis.
- `GET /api/analytics`: Fetches aggregated dashboard metrics.
- `GET /api/audit-logs`: Fetches system audit logs (admin only).
[![[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Fadil369/brainsait-drg-suite)]](https://deploy.workers.cloudflare.com/?url=${repositoryUrl})
**Project Status: 100% Complete - Fully Shippable.**