-- Tenant-owned tables enforce isolation even if an application query omits its organization filter.
-- The API connection must not be a PostgreSQL superuser or table owner in production.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "organizations_member_read" ON "organizations" FOR SELECT
  USING ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR EXISTS (SELECT 1 FROM "organization_members" m WHERE m."organization_id" = "organizations"."id" AND m."user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid AND m."active"));
CREATE POLICY "organizations_registration" ON "organizations" FOR INSERT WITH CHECK (true);
CREATE POLICY "organizations_tenant_update" ON "organizations" FOR UPDATE
  USING ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY "members_read_tenant_or_self" ON "organization_members" FOR SELECT
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
    OR "user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY "members_write_tenant" ON "organization_members" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessions_user_scope" ON "sessions" FOR ALL
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "invitations_tenant_scope" ON "invitations" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "projects_tenant_scope" ON "projects" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "projects_public_read" ON "projects" FOR SELECT
  USING ("public_enabled" AND "status" = 'ACTIVE');

ALTER TABLE "layouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "layouts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "layouts_tenant_scope" ON "layouts" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "layouts_public_read" ON "layouts" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = "layouts"."project_id" AND p."public_enabled" AND p."status" = 'ACTIVE'));

ALTER TABLE "layout_upload_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "layout_upload_intents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "upload_intents_tenant_scope" ON "layout_upload_intents" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
CREATE POLICY "units_tenant_scope" ON "units" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY "units_public_read" ON "units" FOR SELECT USING (
  EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = "units"."project_id" AND p."public_enabled" AND p."status" = 'ACTIVE'));

ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bookings_tenant_scope" ON "bookings" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_tenant_scope" ON "api_keys" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant_scope" ON "audit_logs" FOR ALL
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
