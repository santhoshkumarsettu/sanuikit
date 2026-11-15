# Development workflow and troubleshooting

## Everyday commands

Run from the repository root:

```sh
pnpm dev          # builds dependencies first, then runs apps through Turbo
pnpm build        # production builds for workspaces
pnpm typecheck    # TypeScript checks
pnpm lint         # ESLint checks
pnpm test         # configured Vitest suites
pnpm db:studio    # inspect local database rows in Prisma Studio
```

Use a filtered command when you are focused on one workspace:

```sh
pnpm --filter @vstudio/admin-web typecheck
pnpm --filter @vstudio/public-web build
pnpm --filter @vstudio/api typecheck
pnpm --filter @vstudio/api test
pnpm --filter @vstudio/map-engine test
```

Use source files as the place to make changes. `dist/`, `.next/`, Prisma generated client output, and Turbo cache/log files are build artifacts. For example, edit `packages/ui/src/...`, then rebuild the package; do not hand-edit its generated `.d.ts` declarations.

## Adding or changing a feature

1. Find the closest existing route, API module, type/schema, and UI component.
2. Decide which layer owns the change: screen behavior belongs in an app, reusable UI in `packages/ui`, map interactions in `packages/map-engine`, domain values in `packages/types`, input rules in `packages/validation`, and persistence/API logic in `apps/api` plus `database`.
3. For database changes, update `database/schema.prisma`, create a migration, and regenerate the Prisma client.
4. For API writes, validate input, authenticate, check a central permission, scope to the authenticated tenant, and audit important changes.
5. Use `packages/api-client` from browser code rather than direct ad-hoc fetches to the API.
6. Update documentation for behavior, endpoints, schemas, or setup that changed.
7. Run the relevant build/typecheck/lint/test command for the work you changed.

## Troubleshooting

### Docker says it cannot connect to the Docker API

Start Docker Desktop or the Docker Engine, wait for it to finish starting, then retry:

```sh
docker info
docker compose -f infrastructure/docker/compose.yaml up -d
```

### PostgreSQL connection refused

Check that the `postgres` container is healthy and `.env` uses `localhost:5433`:

```sh
docker compose -f infrastructure/docker/compose.yaml ps
docker compose -f infrastructure/docker/compose.yaml logs postgres
```

### `pnpm install` says build scripts were ignored

pnpm 10 asks before running package lifecycle scripts. Use `pnpm approve-builds`, review/approve the expected native or generated dependencies listed in [Local setup](LOCAL_SETUP.md), then rerun `pnpm install`.

### API reports invalid environment configuration

Check that the root `.env` exists, that `JWT_SECRET` is 32+ characters, and that the database, Redis, and storage URLs match the services/ports in Docker Compose. Restart the API after changing `.env`.

### Map upload says storage is unavailable or fails in the browser

Confirm MinIO is running, create the configured bucket, check `.env` storage values, and verify the bucket's local CORS configuration allows the admin origin. The upload URL is signed and expires after five minutes, so retry with a fresh upload intent.

### `pnpm dev` or the API watcher reports `EMFILE: too many open files, watch`

This is an operating-system file watcher limit, not an API route error. Use the separate process steps in [Local setup, step 9](LOCAL_SETUP.md#9-if-pnpm-dev-cannot-start-all-apps): build and start the API without watch mode, and run each Next.js app in its own terminal. You can restart the API after source edits.

### A port is already in use

The default app ports are `3000`, `3001`, and `4000`; infrastructure ports are `5433`, `6379`, `9000`, and `9001`. Stop the old process/container or deliberately change both the service and its matching environment URL. Don't start a duplicate Next/API process on the same port.

### The API is ready but the admin UI says it is in demo mode

Check browser devtools/network for failed requests, verify the session cookie is present after login, and ensure `NEXT_PUBLIC_API_URL` points to `http://localhost:4000/api/v1`. Some admin pages (overview and reports) are intentionally demo screens even when the API is connected; see [the application guide](APPLICATION_GUIDE.md#admin-app-appsadmin-web-port-3000).
