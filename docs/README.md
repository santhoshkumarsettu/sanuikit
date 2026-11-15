# VStudio documentation

Welcome! This folder explains what VStudio does, how its parts fit together, and how to run and change it locally. Read the guides in order if this is your first time in the repository.

## Start here

1. [Local setup, step by step](LOCAL_SETUP.md) — install tools, configure `.env`, start Docker, prepare the database, and run the apps.
2. [Product and application walkthrough](APPLICATION_GUIDE.md) — what each screen is for, what is connected to live APIs, and what is still a demo or planned feature.
3. [System architecture](ARCHITECTURE.md) — how the admin site, public site, API, packages, storage, and database work together.
4. [API guide](API_GUIDE.md) — endpoint groups, authentication, validation, permissions, and tenant isolation.
5. [Database guide](DATABASE_GUIDE.md) — the Prisma models, migrations, tenant context, and map geometry.
6. [Shared packages and UI kit](PACKAGES.md) — the purpose of each workspace package and where source files belong.
7. [Development workflow and troubleshooting](DEVELOPMENT.md) — commands for everyday work and fixes for common local setup errors.

## The project in one minute

VStudio lets a property company create projects, upload one or more plans, draw visual shapes over a plan, and associate each shape with a real inventory unit. Staff manage price, area, and availability in the admin app. A published project can be viewed by customers on the public site.

The plan is **not** the inventory database. PostgreSQL stores projects, layouts, units, status, and bookings. Unit geometry is stored as JSON in the layout's own coordinate space. The map engine only renders and edits that geometry.

## Where to look in the repository

```text
apps/admin-web/        Staff workspace: projects, Map Studio, inventory, bookings
apps/public-web/       Customer-facing published maps and iframe route
apps/api/              Fastify REST API and feature modules
database/              Prisma schema, SQL migrations, tenant context, seed data
packages/              Shared UI, map engine, validation, types, and utilities
infrastructure/docker/ PostgreSQL, Redis, and MinIO for local development
docs/                  Onboarding and implementation guides (this folder)
```

## Important distinction: implemented versus planned

This repository is an active product foundation, not a finished production SaaS. Some flows are connected end to end, such as projects, inventory, bookings, layout uploads, and public map reads. Other screens still use sample values or placeholder actions. The [application guide](APPLICATION_GUIDE.md) calls these out so a new developer can distinguish a working backend path from a visual prototype.

## Making documentation changes

Keep setup steps aligned with the root `package.json`, `.env.example`, `pnpm-workspace.yaml`, Prisma schema, and Docker Compose file. When a command or environment variable changes, update the corresponding guide in the same change.
