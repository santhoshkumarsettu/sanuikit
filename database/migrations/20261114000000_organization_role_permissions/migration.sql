CREATE TABLE "organization_role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_role_permissions_organization_id_role_permission_key"
  ON "organization_role_permissions"("organization_id", "role", "permission");
CREATE INDEX "organization_role_permissions_organization_id_role_idx"
  ON "organization_role_permissions"("organization_id", "role");

ALTER TABLE "organization_role_permissions"
  ADD CONSTRAINT "organization_role_permissions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "organization_role_permissions_tenant_scope"
  ON "organization_role_permissions" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
