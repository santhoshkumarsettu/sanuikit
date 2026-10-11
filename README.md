# VStudio

VStudio is a multi-tenant property inventory platform. The admin workspace manages projects, layouts, units and bookings; the public workspace presents published interactive maps. Layout geometry is stored in layout coordinates and points to inventory records in PostgreSQL; SVG is only the visual layer.

## Workspace

```text
apps/admin-web       Next.js administration and Map Studio
apps/public-web      Public project map and iframe embed
apps/api              Fastify modular-monolith REST API
database              Prisma schema, migrations, seed, tenant context
packages/ui           SanUI reusable React component library
packages/map-engine   Reusable SVG map viewport and drawing engine
packages/types        Shared domain types and status presentation
packages/validation   Shared Zod validation rules
packages/auth         Central role and permission rules
packages/api-client   Typed browser API client
packages/utils        Shared formatting and demo fixtures
infrastructure        Local Docker services and AWS deployment notes
```

## Local development

Requirements: Node.js 22.9+ (or Node.js 24+), pnpm 10, and Docker Compose.

```sh
pnpm install
cp .env.example .env
docker compose -f infrastructure/docker/compose.yaml up -d
```

Create the `vstudio-assets` bucket in the MinIO console at <http://localhost:9001> (credentials are in `.env.example`). Then run:

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Admin: <http://localhost:3000> · public map: <http://localhost:3001/p/green-valley> · API health: <http://localhost:4000/health/ready>.

`pnpm dev` builds workspace packages before starting both web apps and the API. The API reads the root `.env` file. Use the demo pages to explore the UI without signing in; authenticated API actions need the database and a registered account.

## Engineering commands

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Implemented product foundation

- Tenant-aware PostgreSQL schema with row-level security migrations, organization memberships, projects, layouts, inventory, bookings, API keys and audit records.
- Argon2id password authentication, expiring/revocable sessions, secure HTTP-only cookies, origin checks, rate limits and centralized role permissions.
- Tenant-scoped project and inventory endpoints, controlled unit status transitions with optimistic concurrency, CSV preview/atomic commit/export, booking reserve/cancel and audit logging.
- Presigned S3-compatible layout uploads, content-signature validation, image processing and Redis/BullMQ jobs.
- Reusable SVG map engine with custom coordinates, pan/zoom, rectangle and polygon drawing, selection, polygon vertex editing and viewport controls.
- Admin and public Next.js experiences, shared status legend, responsive public route and iframe route.

The UI includes demo data so the interface can be reviewed before services are configured. The production API and database path is implemented separately; remaining product work includes completing organization-member invitation and administration screens, password-reset/email verification delivery, OAuth/SSO, a persistent editor save workflow, richer reporting/CRM integration, API-key management endpoints, automated end-to-end coverage, and production AWS secrets/deployment configuration. Do not expose the app to production traffic until those operational and product integrations are completed and reviewed.

## Security and deployment notes

- Use a dedicated PostgreSQL API role that is not a superuser or table owner. Tenant-owned tables force RLS; the API sets `app.organization_id` and `app.user_id` transaction-locally.
- Replace all example secrets, provision private S3 buckets and least-privilege IAM, and configure an asset-delivery policy before deployment. Public project settings should determine which inventory fields are returned.
- Configure TLS, managed PostgreSQL/Redis, backups, secret rotation, object lifecycle policies, email delivery, error tracking and OpenTelemetry export in the deployment environment.
- The initial AWS deployment should use containers and managed services; Kubernetes is intentionally not part of local development.
