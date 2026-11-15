-- A verified invitation token grants read access to its own invitation only.
-- The API sets this transaction-local value from the hashed token before lookup.
CREATE POLICY "invitation_token_lookup" ON "invitations" FOR SELECT
  USING ("token_hash" = NULLIF(current_setting('app.invitation_token_hash', true), ''));
