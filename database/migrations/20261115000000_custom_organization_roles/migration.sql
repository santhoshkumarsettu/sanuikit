-- Allow a tenant to define permission bundles without expanding the global role enum.
ALTER TABLE "organization_role_permissions"
  ALTER COLUMN "role" TYPE VARCHAR(64) USING "role"::text;

CREATE TABLE "organization_custom_roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "name_key" VARCHAR(100) NOT NULL,
  "description" VARCHAR(240) NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_custom_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_custom_roles_organization_id_id_key"
  ON "organization_custom_roles"("organization_id", "id");
CREATE UNIQUE INDEX "organization_custom_roles_organization_id_name_key_key"
  ON "organization_custom_roles"("organization_id", "name_key");

ALTER TABLE "organization_custom_roles"
  ADD CONSTRAINT "organization_custom_roles_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_members" ADD COLUMN "custom_role_id" UUID;
ALTER TABLE "invitations" ADD COLUMN "custom_role_id" UUID;

ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_organization_id_custom_role_id_fkey"
  FOREIGN KEY ("organization_id", "custom_role_id")
  REFERENCES "organization_custom_roles"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_organization_id_custom_role_id_fkey"
  FOREIGN KEY ("organization_id", "custom_role_id")
  REFERENCES "organization_custom_roles"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "organization_members_organization_id_custom_role_id_idx"
  ON "organization_members"("organization_id", "custom_role_id");
CREATE INDEX "invitations_organization_id_custom_role_id_idx"
  ON "invitations"("organization_id", "custom_role_id");

ALTER TABLE "organization_custom_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_custom_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "organization_custom_roles_tenant_scope"
  ON "organization_custom_roles" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
