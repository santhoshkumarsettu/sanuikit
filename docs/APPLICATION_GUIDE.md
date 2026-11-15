# Product and application walkthrough

## What VStudio is for

VStudio turns a property plan into a visual inventory tool:

```text
Organization → Project → Layout → Visual shape ↔ Inventory unit → Booking
                                                 ↓
                                       Published customer map
```

Examples of a project are a plotted development, apartment tower, commercial building, or warehouse. A project can have multiple named layouts in the administration data model, such as Phase 1, Tower A, Ground Floor, or Parking. Each unit belongs to a project and one layout.

## Admin app (`apps/admin-web`, port 3000)

The admin app is the workspace for company staff. Its Next.js routes are under `apps/admin-web/src/app/`.

| URL | Purpose | Implementation note |
| --- | --- | --- |
| `/login` | Sign in | Calls the API and receives an HTTP-only session cookie. |
| `/register` | Create an organization and its first owner | Registration creates the account, organization, and owner membership through the API. |
| `/` | Workspace overview | Currently uses sample/demo values from `@vstudio/utils`; it is not a live portfolio analytics dashboard yet. |
| `/projects` | Find and manage projects | Loads project data from the API; includes project status, archive, publish, and delete actions. |
| `/projects/new` | Create a project | Sends a validated project form to the API. |
| `/projects/[slug]` | Inspect project and its layouts/units | Uses API data where available, with demo fallback behavior for the seeded sample project. |
| `/studio?project=<project-id>` | Add or replace layout images, delete unused layouts, and draw/edit units | Uses API-backed project, layout, and unit data; layout drawing state and undo/redo history are held locally until saved. Replacing an image preserves the layout record and proportionally scales mapped geometry if dimensions change. |
| `/inventory` | Search, filter, and update units | Reads API units and supports status changes, bulk operations, and CSV workflows where wired. |
| `/bookings` | Reserve/confirm/cancel units for customers | Reads and writes API bookings. A new booking places a 48-hour hold; confirming changes the unit from Reserved to Booked. |
| `/reports` | Reporting page | Currently a visual prototype with hard-coded sample metrics, not an API-backed report. |
| `/settings` | Organization settings and workspace options | Organization name/slug editing is API-backed. Members, public defaults, and API-key sections contain placeholder UI/actions and are not complete management flows. |
| `/components` | SanUI component gallery | Shows reusable component previews; it is a developer/design-system page. |

### Typical staff workflow

1. Create an organization by registering, or sign in with the seed account.
2. Create a project under **Projects**.
3. Open **Map Studio**, select that project, and upload a PNG, JPG, or WebP plan.
   - Use **Add layout** for another floor/phase plan.
   - Use **Replace layout** when the selected plan image is incorrect. Existing unit shapes stay attached and scale proportionally if the replacement dimensions differ; review them afterward.
   - **Delete layout** is available only when no units are mapped to that layout, to prevent accidental inventory loss.
4. Draw a rectangle or polygon on the selected layout. In **Create inventory unit**, enter its unique unit number and type, area and price, and any relevant location/property details such as block, floor, facing, bedrooms, parking type/coverage, or road width. Add a description, features, and custom label/value details when needed. The selected project, layout, coordinate space, and shape are shown in the form so the inventory record stays attached to the correct place on the plan.
5. Choose **Show these details on the public map** only for information customers may see. Custom type names such as “Parking” or “Road” are shown as the type label (subject to the project’s unit-type visibility setting); other optional fields are stored privately unless this checkbox is enabled. Staff can later choose **Edit unit details** in Map Studio to update these fields without redrawing the shape.
6. Save geometry edits. Use **Inventory** to search units, change status, or work with CSV import/export.
7. Create a booking for an available unit under **Bookings**. Confirm the pending reservation to move the unit to Booked.
8. Publish the project after it has a layout and at least one unit; share its public `/p/<slug>` URL.

The booking workflow is intentionally two steps: **Create booking** reserves a unit for 48 hours (unit status `RESERVED`, booking status `PENDING`); **Confirm** marks it as booked (unit `BOOKED`, booking `CONFIRMED`). Canceling a pending or confirmed booking releases the unit to Available.

## Public app (`apps/public-web`, port 3001)

Public routes do not require a staff login:

- `/p/[slug]` — customer-facing project map.
- `/embed/[slug]` — map view intended to be placed in another website using an iframe.

The public page requests the project by slug from the API. It displays layout-specific unit shapes, status legend/filtering, customer-approved unit details, and an enquiry affordance. For projects with multiple layouts, customers can switch layouts; the map and inventory list then show units attached to that layout. The actual public fields and which statuses are shown are controlled by the project's public configuration in the API.

Current boundaries to know about:

- The enquiry form prepares an email using `mailto:`; it does not create a lead in a VStudio CRM or store the enquiry in the API.
- When `showSoldUnits` is false, the public API currently returns only Available and Reserved units. When enabled, it includes all unit statuses.

## API app (`apps/api`, port 4000)

The API is a Fastify modular monolith. Feature routes live under `apps/api/src/modules/` and are mounted under `/api/v1`. It handles session authentication, authorization, validation, tenant-scoped database work, upload intents, public map responses, booking rules, and audit records.

Useful endpoints while learning:

- `GET /health/live` — process is alive.
- `GET /health/ready` — API can query PostgreSQL.
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` — account/session flows.
- `/api/v1/projects` — project listing/creation and project lifecycle.
- `/api/v1/projects/:projectId/units` — inventory operations.
- `/api/v1/projects/:projectId/layouts` — layout metadata and upload flow.
- `/api/v1/projects/:projectId/bookings` and `/api/v1/bookings` — booking operations.
- `GET /api/v1/public/projects/:slug` — public map response.

See the [API guide](API_GUIDE.md) for more detail.

## Database and visual map

PostgreSQL via Prisma is the source of truth for organizations, users, projects, layouts, unit data, bookings, and audit events. Layout image files live in MinIO locally (S3-compatible object storage), not in PostgreSQL.

Unit custom fields use the existing JSON `metadata` and `publicMetadata` columns. No migration is needed when adding optional unit detail fields. The API validates and sanitizes these values, and the public endpoint returns only the approved public metadata.

Every layout has `width`, `height`, and a coordinate system. A rectangle is stored as `x`, `y`, `width`, and `height`; a polygon is stored as points (`x`, `y`). These coordinates use the uploaded image's dimensions. The map engine converts screen positions to/from that coordinate space as users zoom, pan, resize the window, or open full-screen. The data flow is detailed in the [architecture guide](ARCHITECTURE.md).

## Unit statuses

The status transition rules are shared in `packages/types/src/status.ts`; presentation colors are in `packages/types/src/status-presentation.ts`.

| Status | Common meaning | Next step examples |
| --- | --- | --- |
| Available | Can be offered to a customer | Reserve, sell, block, or take off market |
| Reserved | Temporarily held while a customer decides | Release to Available, confirm as Booked, sell, or block |
| Booked | Reservation has been confirmed | Release to Available or mark Sold |
| Sold | Transaction is complete | Terminal in the current transition rules |
| Blocked | Not available for normal sale (for example, internal hold) | Release to Available or take Off Market |
| Off market | Temporarily removed from public/active offering | Return to Available or mark Blocked |

## What is not complete yet

Do not mistake the product vision for a promise that every flow is finished. For example, reports and overview metrics are currently sample UI; organization member invitation/role management and API-key lifecycle screens are placeholders; public enquiries are email links rather than stored leads. These are natural next steps for product development.
