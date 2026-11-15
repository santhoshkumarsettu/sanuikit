# API guide

## Local URLs and versioning

The Fastify server listens on `http://localhost:4000`. Health checks are outside the version prefix:

- `GET /health/live` reports that the process is alive.
- `GET /health/ready` runs a database query and reports ready/not-ready.

REST endpoints are mounted under `/api/v1`, for example `GET http://localhost:4000/api/v1/projects`. Route code is in `apps/api/src/modules/`.

## Route groups

| Route module | Example routes | What it does |
| --- | --- | --- |
| `auth` | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Organization registration, sign-in, session validation, sign-out, organization switch/profile. |
| `projects` | `GET/POST /projects`, `GET/PATCH /projects/:id-or-slug`, `POST /projects/:id/publish`, `POST /projects/:id/archive`, `DELETE /projects/:id` | Project management and public lifecycle. Permanent delete requires the exact project name in the request body. |
| `layouts` | `GET /projects/:id/layouts`, `POST /projects/:id/layouts/upload-intents`, `POST /layouts/:id/confirm-upload`, `GET /layouts/:id/asset-url`, `DELETE /layouts/:id` | Layout metadata, add/replace image uploads, safe object storage access, and deletion when no units are mapped. Pass `layoutId` in the upload-intent body to replace an existing layout image. |
| `inventory` | `GET/POST /projects/:id/units`, `PATCH /units/:id`, `PATCH /units/:id/status`, `PATCH /units/:id/geometry`, `DELETE /units/:id`, import/export routes | Unit creation, filtering, detail edits, geometry, controlled status transitions, and CSV import/export. Detail edits validate the shared unit schema, use optimistic version checks, and write an audit event. |
| `bookings` | `GET /projects/:id/bookings`, `POST /bookings`, `POST /bookings/:id/confirm`, `POST /bookings/:id/cancel` | Reservation and booking lifecycle. |
| `public` | `GET /public/projects/:slug`, `PATCH /projects/:id/public-settings` | Limited customer-facing data and configuration. |
| `realtime` | `GET /events` (WebSocket) | Authenticated organization event stream. |

For precise request schemas and response bodies, follow the route implementation in `apps/api/src/modules/` and shared schemas in `packages/validation/src/index.ts`.

## Authentication from a browser

1. Call `POST /api/v1/auth/login` with JSON such as `{"email":"...","password":"..."}`.
2. The API sets the `vstudio_session` HTTP-only cookie.
3. Subsequent browser calls must use credentials. `VStudioApiClient` does this automatically.
4. Call `GET /api/v1/auth/me` to check the current user, organization, and role.
5. Call `POST /api/v1/auth/logout` to revoke the session and clear the cookie.

The API does not return a session token for JavaScript to store in local storage. Do not add a local-storage token pattern.

## Validation and errors

Request body and query validation uses Zod schemas in `packages/validation` or module-specific schemas. The API returns a JSON error with `code` and `message`, for example:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed."
}
```

Common HTTP outcomes include `400` invalid input, `401` missing/expired session, `403` forbidden or invalid origin, `404` missing resource, `409` invalid transition/conflict/duplicate, and `500` unexpected server failure. The API logs a request ID for server errors; cookies and authorization headers are redacted from request logs.

## Permissions

`packages/auth/src/index.ts` maps roles to granular permissions. API route declarations use `app.requirePermission(...)`. Current roles are `OWNER`, `ADMIN`, `EDITOR`, `SALES`, and `VIEWER`. Example permissions include `CREATE_PROJECT`, `UPLOAD_LAYOUT`, `EDIT_MAP`, `UPDATE_STATUS`, `CREATE_BOOKING`, `MANAGE_USERS`, and `EXPORT_DATA`.

When adding a new write endpoint:

1. Define/extend a Zod schema.
2. Authenticate the request.
3. Require a central permission for the operation.
4. Scope every organization resource lookup to `request.auth.organizationId` and use `withTenant`.
5. Add an audit record for important business changes.
6. Add a status/version conflict response where concurrent changes are possible.
7. Update this guide or an API-specific reference if the route changes.

Never depend on the frontend to enforce authorization or tenant boundaries.

## Booking and status consistency

`POST /bookings` accepts only Available units and atomically changes the unit to Reserved while creating a pending 48-hour booking. `POST /bookings/:id/confirm` changes a valid pending booking to Confirmed and its unit to Booked. Cancellation returns a reserved/booked unit to Available. Unit transition rules are shared by API and clients in `packages/types/src/status.ts`.

## Layout uploads

The browser does not upload a multi-megabyte image through the API request body. It asks the API for a short-lived signed URL, uploads directly to MinIO/S3, then asks the API to confirm. The API checks object size, file signature, MIME type, and image dimensions before marking it finalized and queueing optimization. Locally, the MinIO bucket and bucket CORS/signed-URL configuration must be ready for browser uploads.

For a replacement, the upload uses a new versioned object key. The API switches the layout to the new image only after validation succeeds, then removes the old image assets. If image dimensions changed, the API scales each mapped unit's geometry proportionally inside the same database transaction and audits those geometry updates. Deleting a layout with mapped units returns `409 LAYOUT_HAS_UNITS`; callers must replace its plan or remove its units first.

## API client

Web apps should call methods on `vstudioApi` (`packages/api-client/src/index.ts`) instead of repeating fetch configuration. It provides the base URL, sends credentials, JSON-encodes bodies, parses API errors, and keeps endpoint types shared.
