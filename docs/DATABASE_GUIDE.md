# Database guide

## Where database code lives

- `database/schema.prisma` — source-of-truth Prisma model and enum declarations.
- `database/migrations/` — committed SQL changes applied in chronological order.
- `database/seed.ts` — repeatable local development sample data.
- `database/src/tenant.mjs` — Prisma client and tenant-aware transaction helper.
- `packages/types/` — application-facing shared domain/status types.
- `packages/validation/` — Zod schemas that validate API input before database writes.

PostgreSQL is the durable system of record. The image bytes are stored in MinIO locally or S3 in a deployment; PostgreSQL stores object keys and image dimensions.

## Main relationships

```text
Organization ──< OrganizationMember >── User ──< Session
      │
      ├──< Project ──< Layout ──< Unit ──< Booking
      │       │             │       │
      │       │             └── LayoutUploadIntent
      │       └──< Booking
      ├──< ApiKey
      ├──< Invitation
      └──< AuditLog
```

`organization_id` is carried on organization-owned records so the API and PostgreSQL can enforce the tenant boundary. A project has layouts and units; units have one layout and can have booking history. The unique project/unit-number constraint prevents duplicate unit numbers within one project.

## Main models

| Model | Stores |
| --- | --- |
| `Organization` | Tenant/workspace identity and settings. |
| `User` | Login identity and password hash (never plaintext). |
| `OrganizationMember` | User's organization membership, active state, and role. |
| `Session` | Hashed session token, expiration, revocation. |
| `Project` | Organization-owned property development, slug, type, lifecycle, public settings. |
| `Layout` | Layout metadata, image object keys, width/height, coordinate system, version. |
| `LayoutUploadIntent` | Short-lived expected object metadata and upload finalization state. |
| `Unit` | Unit number/type, area, price, status, layout-linked JSON geometry, private JSON metadata, public-safe JSON metadata, and optimistic version. |
| `Booking` | Customer contact and reservation lifecycle attached to a project and unit. |
| `AuditLog` | Actor, action, entity, before/after snapshots, and context. |
| `Invitation`, `ApiKey` | Schema foundation for organization invites and API credentials; full management UI/workflow is not complete. |

The schema also defines enums for organization roles, project/layout/unit types, project status, unit status, and booking status. Use enums rather than arbitrary strings when adding these fields.

Optional unit details (for example custom type name, description, block/floor, orientation, room details, parking details, road width, features, and custom attributes) are validated by `unitDetailsSchema` and stored in `metadata`. Only details the user marks public are copied into `publicMetadata`; the public API never selects the private `metadata` column. These optional fields reuse existing JSON columns, so adding a new optional detail does not require a database migration.

## Map geometry data

The `Unit.geometry` column is JSON, validated by `geometrySchema`:

```json
{"kind":"RECTANGLE","x":100,"y":80,"width":120,"height":90}
```

or:

```json
{"kind":"POLYGON","points":[{"x":100,"y":80},{"x":210,"y":90},{"x":180,"y":170}]}
```

Coordinates use the `Layout.width` × `Layout.height` coordinate space. They are not CSS/browser pixels. API validation rejects geometry outside the layout bounds. The map engine transforms between this space and the current viewport.

## Tenant isolation / row-level security

Migration `20261011001000_tenant_row_security` enables and forces row-level security on tenant-owned tables. Policies use PostgreSQL transaction-local settings named `app.organization_id` and `app.user_id`. The API's `withTenant` helper sets these settings inside the transaction that performs the query.

This is defense in depth alongside explicit organization filters in API queries. Do not query another tenant by accepting a client-supplied organization ID. Resolve the organization from the authenticated session and membership.

For a production database, the API connection must not be a superuser or table owner because those roles can bypass row-level security. Use a dedicated least-privilege role and verify how migrations are applied separately.

## Local database commands

From the repository root:

```sh
pnpm db:generate  # regenerate Prisma client after schema changes
pnpm db:migrate   # apply committed migrations (deploy mode)
pnpm db:seed      # create/update the local owner and Green Valley sample data
pnpm db:studio    # open Prisma Studio for inspecting local records
```

For a local schema change during development, create a migration with:

```sh
pnpm --filter @vstudio/database migrate:dev
```

Before changing the schema, check current migrations and all API types that use the model. Commit both the schema and generated migration SQL; do not hand-edit a deployed database without adding a migration.

## Resetting local data

The Compose setup persists data in named Docker volumes. `docker compose ... stop` keeps data. `docker compose ... down -v` deletes the database, Redis queue state, and MinIO files. Treat `down -v` as a destructive reset and only use it when local data can be discarded.
