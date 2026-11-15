-- Migration 013: sign-in accounts for NGO employee drivers and the driver's own job acknowledgement.
--
-- Backward compatible and forward only:
--   * app.app_users.role gains 'DRIVER'. Only the Admin "Assign Driver" API provisions this role, after
--     sending a Supabase invitation; public registration and client metadata can never select it.
--     A driver's login is linked through the existing people.app_user_id column (person -> app user),
--     so no driver is represented as a Volunteer.
--   * app.drivers.login_email records the invited address for Admin display and duplicate checks.
--   * app.assignments.driver_acceptance records the driver's response separately from the shared
--     crew status machine, so a driver accepting never impersonates the Volunteers. Existing rows
--     become 'NOT_REQUIRED' and behave exactly as before.
--
-- Rollback (only before any DRIVER login or driver response exists):
--   ALTER TABLE app.assignments DROP COLUMN driver_responded_at, DROP COLUMN driver_acceptance;
--   DROP INDEX app.drivers_login_email_unique; ALTER TABLE app.drivers DROP COLUMN login_email;
--   ALTER TABLE app.app_users DROP CONSTRAINT app_users_role_check;
--   ALTER TABLE app.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN', 'VOLUNTEER', 'DONOR'));

SET search_path TO app, public, extensions;

-- 1. DRIVER application role.
DO $roles$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid = 'app.app_users'::regclass AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE app.app_users DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$roles$;
ALTER TABLE app.app_users
  ADD CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN', 'VOLUNTEER', 'DONOR', 'DRIVER'));

-- 2. Invited sign-in address for employee drivers.
ALTER TABLE app.drivers
  ADD COLUMN login_email text CHECK (login_email IS NULL OR (login_email = lower(trim(login_email)) AND length(login_email) BETWEEN 3 AND 254));
CREATE UNIQUE INDEX drivers_login_email_unique ON app.drivers (login_email) WHERE login_email IS NOT NULL;

-- 3. Driver acknowledgement, kept separate from the crew status.
ALTER TABLE app.assignments
  ADD COLUMN driver_acceptance text NOT NULL DEFAULT 'PENDING'
    CHECK (driver_acceptance IN ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'DECLINED')),
  ADD COLUMN driver_responded_at timestamptz;
UPDATE app.assignments SET driver_acceptance = 'NOT_REQUIRED';
ALTER TABLE app.assignments
  ADD CONSTRAINT assignments_driver_response_time CHECK (
    (driver_acceptance IN ('ACCEPTED', 'DECLINED')) = (driver_responded_at IS NOT NULL)
  );
