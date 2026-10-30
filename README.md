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

## Run locally (step by step)

Follow these steps from a fresh clone. The admin site, public site, and API are separate apps in one pnpm workspace. PostgreSQL, Redis, and MinIO run locally in Docker.

### 1. Install the prerequisites

Install the following before continuing:

- Git
- Node.js 22.9+ or Node.js 24+
- pnpm 10 (the repository pins pnpm 10.33.0 in `package.json`)
- Docker Desktop, with Docker Compose available

Check that the tools are available:

```sh
node --version
corepack enable
pnpm --version
docker compose version
```

If `pnpm --version` is not 10.x, activate the version used by this repository:

```sh
corepack prepare pnpm@10.33.0 --activate
pnpm --version
```

### 2. Clone the repository and install dependencies

```sh
git clone https://github.com/santhoshkumarsettu/sanuikit.git
cd sanuikit
pnpm install
```

Run the remaining commands from the repository root (`sanuikit/`).

### 3. Create your local environment file

```sh
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a random value of at least 32 characters. For example, generate one with:

```sh
openssl rand -base64 32
```

The example file also contains local seed-admin credentials. Change `VSTUDIO_SEED_ADMIN_EMAIL` and `VSTUDIO_SEED_ADMIN_PASSWORD` to the account you want to use locally; the password must be at least 12 characters. These example values are only for local development and must not be used in a deployed environment. Keep `.env` on your machine and do not commit it.

The remaining example values match the local Docker services and app ports. If you change a port or credential, update the corresponding values in `.env` as well.

### 4. Start the local backend services

Make sure Docker Desktop is running, then start PostgreSQL, Redis, and MinIO:

```sh
docker compose -f infrastructure/docker/compose.yaml up -d
docker compose -f infrastructure/docker/compose.yaml ps
```

Wait until PostgreSQL and Redis show as healthy. The local service addresses are:

| Service | Local address | Purpose |
| --- | --- | --- |
| PostgreSQL | `localhost:5433` | Application database |
| Redis | `localhost:6379` | Queues and realtime event support |
| MinIO API | <http://localhost:9000> | Local S3-compatible file storage |
| MinIO console | <http://localhost:9001> | Manage local file-storage buckets |

Log in to the MinIO console using the `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` values from `.env`. Create a bucket named exactly as the `STORAGE_BUCKET` value (default: `vstudio-assets`). This is needed for layout/image uploads; the rest of the application can start without uploading files.

### 5. Create the database tables and sample data

Apply the checked-in Prisma migrations:

```sh
pnpm db:migrate
```

Create or update the local seed account and sample Green Valley project:

```sh
pnpm db:seed
```

The seed uses `VSTUDIO_SEED_ADMIN_EMAIL` and `VSTUDIO_SEED_ADMIN_PASSWORD` from `.env`. Re-running the seed updates the seed account password and reuses the sample organization, project, layout, and inventory.

### 6. Start the API and both web apps

```sh
pnpm dev
```

The first run builds the shared workspace packages, then starts all three apps. Keep this terminal open while developing. Open each app in your browser:

| App | URL | What it does |
| --- | --- | --- |
| Admin web | <http://localhost:3000> | Sign in and manage projects, layouts, inventory, and bookings |
| Public web | <http://localhost:3001/p/green-valley> | View the seeded public project map |
| API | <http://localhost:4000> | Backend HTTP API |
| API readiness | <http://localhost:4000/health/ready> | Confirms that the API can reach PostgreSQL |

Sign in to the admin app using the seed-admin email and password from `.env`. The API is also available to explore with the Postman collection at `postman/VStudio-Local.postman_collection.json`; import it into Postman and keep its cookie jar enabled for authenticated requests.

Stop the apps with `Ctrl+C`. To stop the Docker services while keeping their data for next time:

```sh
docker compose -f infrastructure/docker/compose.yaml stop
```

Start them again with `docker compose -f infrastructure/docker/compose.yaml up -d`.

### What runs in each module?

- **`apps/admin-web` — admin frontend:** Next.js app on port `3000`. It calls the API and provides the workspace for signed-in staff.
- **`apps/public-web` — public frontend:** Next.js app on port `3001`. It displays published project maps, including the seeded `/p/green-valley` page.
- **`apps/api` — backend:** Fastify API on port `4000`. It handles authentication, projects, inventory, bookings, file uploads, and realtime events. It reads configuration from the root `.env`.
- **`database` — database tooling:** Prisma schema, migrations, generated client, and seed script. PostgreSQL itself runs in Docker; use the root `pnpm db:*` commands to manage it. These commands read the root `.env` file.
- **`infrastructure/docker` — local dependencies:** Docker Compose configuration for PostgreSQL, Redis, and MinIO. These services need to be running before using database-backed API features.
- **`packages` — shared code:** UI components, map engine, API client, types, validation, and other libraries used by the apps.

### Run an app by itself (optional)

Complete steps 1–5 first, then build the shared packages once:

```sh
pnpm build
```

Run only the module you need from the repository root:

```sh
pnpm --filter @vstudio/admin-web dev
pnpm --filter @vstudio/public-web dev
pnpm --filter @vstudio/api dev
```

Run one command at a time in its own terminal. The admin and public sites need the API for live account and project data. The API needs PostgreSQL; Redis and MinIO are needed for their respective queue/realtime and upload features.

### Common first-run problems

- **Docker command fails or containers are not healthy:** Start Docker Desktop, then check `docker compose -f infrastructure/docker/compose.yaml ps` and `docker compose -f infrastructure/docker/compose.yaml logs`.
- **Database connection refused:** Confirm PostgreSQL is healthy and that `DATABASE_URL` in `.env` uses port `5433`, then rerun `pnpm db:migrate`.
- **Seed says credentials are missing:** Set `VSTUDIO_SEED_ADMIN_EMAIL` and a `VSTUDIO_SEED_ADMIN_PASSWORD` of at least 12 characters in `.env`, then rerun `pnpm db:seed`.
- **API reports invalid environment configuration:** Check that `.env` exists and `JWT_SECRET` is at least 32 characters. Restart `pnpm dev` after changing `.env`.
- **A port is already in use:** Stop the other process using that port or change the service port and its matching `.env` URL/origin setting.

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
