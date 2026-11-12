-- PROPOSAL ONLY. Not a migration; do not execute without explicit Production approval.
-- Requires psql with verified Production TLS and separate migration-admin credentials.
-- Owner must verify project pyzyxgpcfwpcqyqrihuo OUTSIDE SQL; database name alone is insufficient.
-- Run only AFTER exact approved 015 via the existing runner. No old roles/passwords changed.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.schema_migrations
    WHERE name='015_final_pilot.sql' AND checksum='28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1') THEN
    RAISE EXCEPTION 'Verified 015 ledger prerequisite missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aaharaconnect_runtime') THEN
    RAISE EXCEPTION 'Runtime role already exists: preserve and review, do not overwrite';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aaharaconnect_api'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Expected restricted permission group missing or unsafe';
  END IF;
END $guard$;
CREATE ROLE aaharaconnect_runtime NOLOGIN INHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT aaharaconnect_api TO aaharaconnect_runtime;
GRANT CONNECT ON DATABASE postgres TO aaharaconnect_runtime;
COMMIT;
-- Interactive psql password prompt; no literal password in SQL, shell args or logs.
-- A failure leaves NOLOGIN; stop and review rather than rerun/overwrite this script.
\password aaharaconnect_runtime
ALTER ROLE aaharaconnect_runtime LOGIN;

-- Inspect with the NEW actual connection, not migration-admin / SET ROLE alone:
-- SELECT current_user,session_user;
-- SELECT has_schema_privilege(current_user,'app','USAGE') AS usage,
--        has_schema_privilege(current_user,'app','CREATE') AS ddl,
--        has_table_privilege(current_user,'app.schema_migrations','SELECT') AS ledger,
--        has_table_privilege(current_user,'app.identity_review_events','UPDATE') AS rewrite_audit,
--        has_table_privilege(current_user,'auth.users','SELECT') AS auth_read;
-- Expected: usage true; all remaining flags false. Verify no owned app objects,
-- no grant options, no role-admin membership and no TRUNCATE rights. Verify required
-- app SELECTs/RLS reads; controlled write probes require separately approved synthetic
-- Production records or an isolated rehearsal, not writes to real account records.
-- No app sequences currently exist; UUID defaults do not need blanket sequence grants.
-- Public database CONNECT/TEMP defaults may still apply; do not revoke PUBLIC grants
-- globally or claim the login lacks every database-level privilege.
-- 015 owns finite table grants and 17 trusted Express RLS policies. Do not duplicate
-- them here, grant app access to end-user roles, add BYPASSRLS, or grant ledger/auth access.
