# Local setup: clone, configure, run

This guide assumes a Mac or Linux development machine. Windows users can follow the same Node and pnpm commands from WSL2. Run commands from the repository root unless a step says otherwise.

## 1. Install the tools

You need:

- Git
- Node.js 22.9 or newer (or Node 24)
- Corepack, which is included with recent Node distributions
- Docker Desktop or another Docker Engine with Docker Compose

Check what is installed:

```sh
node --version
corepack --version
docker --version
docker compose version
```

Enable Corepack and activate the pnpm version pinned by this repository:

```sh
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm --version
```

The last command should print `10.33.0` (or another pnpm 10 release if the repository pin is updated later).

## 2. Clone the code

```sh
git clone https://github.com/santhoshkumarsettu/sanuikit.git
cd sanuikit
```

Confirm you are at the repository root. It contains `package.json`, `pnpm-workspace.yaml`, `apps/`, `packages/`, and `database/`.

## 3. Install JavaScript dependencies

```sh
pnpm install
```

If pnpm reports that it skipped dependency build scripts, run:

```sh
pnpm approve-builds
```

Review and approve the install scripts needed by this repository's native/runtime dependencies (Prisma, `argon2`, `esbuild`, and `sharp` appear in the install warning). Then run `pnpm install` again. This is pnpm's install-script security control; do not approve unfamiliar packages without checking them.

## 4. Create local environment settings

Make your own ignored `.env` file from the safe template:

```sh
cp .env.example .env
```

Open `.env` in an editor. At minimum, replace `JWT_SECRET` with a long random string (32 characters or more). Generate a value with:

```sh
openssl rand -base64 32
```

Set `VSTUDIO_SEED_ADMIN_EMAIL` and `VSTUDIO_SEED_ADMIN_PASSWORD` to the local login you want. The password must be at least 12 characters. The example credentials are for local development only. Never commit `.env` or use its example passwords for a public deployment.

The other values in `.env.example` match the checked-in Docker Compose services. The main local addresses are:

| Setting | Default | Used by |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL on `localhost:5433` | API and Prisma |
| `REDIS_URL` | Redis on `localhost:6379` | Jobs and realtime events |
| `STORAGE_ENDPOINT` | MinIO on `localhost:9000` | Layout image objects |
| `STORAGE_BUCKET` | `vstudio-assets` | Image bucket in MinIO |
| `ADMIN_ORIGIN` | `http://localhost:3000` | API CORS allowlist |
| `PUBLIC_ORIGIN` | `http://localhost:3001` | API CORS allowlist and public links |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | Browser API client |

When changing a port, update both the app and the matching URL in `.env`.

## 5. Start the local infrastructure

Start Docker Desktop first. Then, from the repository root:

```sh
docker compose -f infrastructure/docker/compose.yaml up -d
docker compose -f infrastructure/docker/compose.yaml ps
```

Wait for `postgres` and `redis` to show `healthy`. MinIO provides local S3-compatible storage for uploaded plans.

Create the MinIO bucket once:

1. Open <http://localhost:9001>.
2. Sign in with `STORAGE_ACCESS_KEY` and `STORAGE_SECRET_KEY` from `.env` (the example values are `vstudio` and `vstudio_dev_storage_password`).
3. Open **Buckets**, create a bucket named exactly as `STORAGE_BUCKET` (default `vstudio-assets`).

If you skip MinIO setup, most screens can still run, but layout uploads and layout image retrieval will not work.

Useful Docker commands:

```sh
docker compose -f infrastructure/docker/compose.yaml ps
docker compose -f infrastructure/docker/compose.yaml logs -f postgres
docker compose -f infrastructure/docker/compose.yaml logs -f redis
docker compose -f infrastructure/docker/compose.yaml logs -f minio
```

## 6. Create the database and sample account

Generate the Prisma client, apply committed migrations, then seed local sample data:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

The seed script reads the admin email/password from `.env`. It creates or updates a local owner account, the `Acme Properties` organization, a public `Green Valley` project, a sample layout record, and six sample inventory units. Seeding can be repeated; it upserts these sample records.

The seed refers to a sample layout asset key. For real uploaded images, MinIO must be running and the bucket must exist.

## 7. Build workspace packages and start the apps

From the root:

```sh
pnpm dev
```

`pnpm dev` runs the root `predev` script first, which builds the workspace packages, then Turbo starts the admin site, public site, and API. Leave the terminal open while you work.

Open these URLs:

| App | URL | Try this |
| --- | --- | --- |
| Admin workspace | <http://localhost:3000> | Sign in with the seed credentials; open Projects, Inventory, or Map Studio |
| Public map | <http://localhost:3001/p/green-valley> | View the seeded public project |
| Embedded map | <http://localhost:3001/embed/green-valley> | See the embeddable map route |
| API readiness | <http://localhost:4000/health/ready> | Expect `{"status":"ready"}` when the API can reach PostgreSQL |
| MinIO console | <http://localhost:9001> | Inspect local image storage |

If you registered an account instead of using the seed account, sign in with the email and password used on `/register`.

## 8. Stop and restart

Stop all three app processes with `Ctrl+C` in the `pnpm dev` terminal. Stop Docker containers while preserving their data volumes with:

```sh
docker compose -f infrastructure/docker/compose.yaml stop
```

Start the same containers again with:

```sh
docker compose -f infrastructure/docker/compose.yaml up -d
```

To remove the local containers **and their stored database, Redis, and MinIO data**, use `down -v`. This is destructive; do not run it if you need to keep local data.

## 9. If `pnpm dev` cannot start all apps

First make sure step 6 has succeeded. If the API watcher exits with `EMFILE: too many open files, watch`, run the API without watch mode and the frontends in separate terminals:

**Terminal 1 — API (compile, then start):**

```sh
pnpm --filter @vstudio/api build
pnpm --filter @vstudio/api start
```

**Terminal 2 — admin web:**

```sh
pnpm --filter @vstudio/admin-web dev
```

**Terminal 3 — public web:**

```sh
pnpm --filter @vstudio/public-web dev
```

This keeps the API process stable but does not automatically reload API source changes. Re-run the API build and restart the API after editing API code. If `pnpm dev` reports a port already in use, stop the older app process before retrying.

For additional fixes, see [Development workflow and troubleshooting](DEVELOPMENT.md).
