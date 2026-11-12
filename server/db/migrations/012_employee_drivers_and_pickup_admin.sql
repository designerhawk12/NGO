-- Migration 012: NGO employee drivers with one fixed vehicle, and safe Admin pickup edits/cancellation.
--
-- Backward compatible and forward only:
--   * Existing app.drivers rows become driver_type 'LEGACY_VOLUNTEER'. Nothing is deleted or converted,
--     so historical assignments keep their driver_id/vehicle_id references and stay readable.
--   * New NGO employee drivers are app.people rows with no login (app_user_id NULL) and no Volunteer
--     record, plus an app.drivers row with driver_type 'EMPLOYEE'. They are linked to exactly one
--     registered vehicle through the existing app.vehicles.assigned_driver_id column (migration 005).
--   * Vehicles are still created with no driver (assigned_driver_id NULL), which removes the old
--     vehicle-requires-driver / driver-requires-vehicle circular dependency.
--   * A pickup can be cancelled by an Admin without deleting it; the food request is untouched and may
--     receive a new pickup afterwards. Schedule edits are audited in app.pickup_schedule_changes.
--
-- Rollback (only before any EMPLOYEE driver or rescheduled food request exists):
--   DROP TRIGGER employee_driver_requires_vehicle ON app.drivers;
--   DROP TRIGGER drivers_identity_guard ON app.drivers;
--   DROP TRIGGER vehicles_fixed_driver_guard ON app.vehicles;
--   DROP FUNCTION app.assert_employee_driver_has_vehicle(), app.guard_driver_identity(), app.guard_fixed_driver_vehicle();
--   DROP TABLE app.pickup_schedule_changes;
--   DROP INDEX app.pickups_one_open_pickup_per_food_request;
--   ALTER TABLE app.pickups ADD CONSTRAINT pickups_food_request_id_key UNIQUE (food_request_id);
--   ALTER TABLE app.pickups DROP COLUMN operational_notes;
--   DROP INDEX app.vehicles_one_vehicle_per_driver, app.drivers_employee_code_unique;
--   ALTER TABLE app.drivers DROP COLUMN created_by, DROP COLUMN updated_at, DROP COLUMN created_at,
--     DROP COLUMN employee_code, DROP COLUMN driver_type;

SET search_path TO app, public, extensions;

-- 1. Driver classification and employee details --------------------------------------------------
ALTER TABLE app.drivers
  ADD COLUMN driver_type text NOT NULL DEFAULT 'LEGACY_VOLUNTEER'
    CHECK (driver_type IN ('LEGACY_VOLUNTEER', 'EMPLOYEE')),
  ADD COLUMN employee_code text
    CHECK (employee_code IS NULL OR length(trim(employee_code)) BETWEEN 1 AND 40),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by uuid REFERENCES app.app_users(id);

CREATE UNIQUE INDEX drivers_employee_code_unique
  ON app.drivers (upper(trim(employee_code))) WHERE employee_code IS NOT NULL;

-- 2. One vehicle per driver (the single assigned_driver_id column already gives one driver per vehicle).
-- Stop with an explicit message instead of silently unlinking legacy data that violates the rule.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app.vehicles WHERE assigned_driver_id IS NOT NULL
    GROUP BY assigned_driver_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 012 stopped: at least one driver is linked to more than one vehicle. Reconcile app.vehicles.assigned_driver_id with an administrator before applying.';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX vehicles_one_vehicle_per_driver
  ON app.vehicles (assigned_driver_id) WHERE assigned_driver_id IS NOT NULL;

-- 3. Driver identity guard: type and person are permanent; employees are not Volunteers or app users.
CREATE FUNCTION app.guard_driver_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.driver_type IS DISTINCT FROM OLD.driver_type THEN
      RAISE EXCEPTION 'Driver type cannot be changed.' USING ERRCODE = '23514';
    END IF;
    IF NEW.person_id IS DISTINCT FROM OLD.person_id THEN
      RAISE EXCEPTION 'Driver person cannot be changed.' USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := now();
  END IF;
  IF TG_OP = 'INSERT' AND NEW.driver_type = 'EMPLOYEE' THEN
    IF EXISTS (SELECT 1 FROM app.volunteers WHERE person_id = NEW.person_id)
       OR EXISTS (SELECT 1 FROM app.people WHERE id = NEW.person_id AND app_user_id IS NOT NULL) THEN
      RAISE EXCEPTION 'An NGO employee driver must be a separate person without a Volunteer record or login.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER drivers_identity_guard
  BEFORE INSERT OR UPDATE ON app.drivers
  FOR EACH ROW EXECUTE FUNCTION app.guard_driver_identity();

-- 4. Fixed employee-driver vehicle: set once, never changed or removed through ordinary writes.
CREATE FUNCTION app.guard_fixed_driver_vehicle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_is_employee boolean := false;
  new_is_employee boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.assigned_driver_id IS NOT NULL THEN
    SELECT driver_type = 'EMPLOYEE' INTO old_is_employee FROM app.drivers WHERE id = OLD.assigned_driver_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF coalesce(old_is_employee, false) THEN
      RAISE EXCEPTION 'Vehicle has a fixed NGO employee driver and cannot be deleted. Retire it instead.'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.assigned_driver_id IS NOT NULL THEN
    SELECT driver_type = 'EMPLOYEE' INTO new_is_employee FROM app.drivers WHERE id = NEW.assigned_driver_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(new_is_employee, false) THEN
      RAISE EXCEPTION 'Register the vehicle first, then link its NGO employee driver from Assign Driver.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    IF coalesce(old_is_employee, false) THEN
      RAISE EXCEPTION 'The fixed driver-to-vehicle link cannot be changed.' USING ERRCODE = '23514';
    END IF;
    IF coalesce(new_is_employee, false) AND OLD.assigned_driver_id IS NOT NULL THEN
      RAISE EXCEPTION 'This vehicle already has a driver link.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicles_fixed_driver_guard
  BEFORE INSERT OR UPDATE OF assigned_driver_id OR DELETE ON app.vehicles
  FOR EACH ROW EXECUTE FUNCTION app.guard_fixed_driver_vehicle();

-- 5. An employee driver must be linked to a vehicle by the end of the creating transaction.
CREATE FUNCTION app.assert_employee_driver_has_vehicle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_type = 'EMPLOYEE'
     AND NOT EXISTS (SELECT 1 FROM app.vehicles WHERE assigned_driver_id = NEW.id) THEN
    RAISE EXCEPTION 'An NGO employee driver must be linked to one registered vehicle.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER employee_driver_requires_vehicle
  AFTER INSERT ON app.drivers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.assert_employee_driver_has_vehicle();

-- 6. Pickup administration: one open pickup per food request, notes, and schedule-change audit.
ALTER TABLE app.pickups
  ADD COLUMN operational_notes text CHECK (operational_notes IS NULL OR length(operational_notes) <= 1000);

DO $unique$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'app.pickups'::regclass AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 1 AND a.attname = 'food_request_id';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app.pickups DROP CONSTRAINT %I', constraint_name);
  END IF;
END
$unique$;

CREATE UNIQUE INDEX pickups_one_open_pickup_per_food_request
  ON app.pickups (food_request_id) WHERE status <> 'CANCELLED';

CREATE TABLE app.pickup_schedule_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id uuid NOT NULL REFERENCES app.pickups(id),
  actor_user_id uuid NOT NULL REFERENCES app.app_users(id),
  previous_window_starts_at timestamptz NOT NULL,
  previous_window_ends_at timestamptz NOT NULL,
  new_window_starts_at timestamptz NOT NULL,
  new_window_ends_at timestamptz NOT NULL,
  previous_delivery_address text NOT NULL,
  new_delivery_address text NOT NULL,
  previous_operational_notes text,
  new_operational_notes text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pickup_schedule_changes_pickup ON app.pickup_schedule_changes (pickup_id, changed_at DESC);

-- Keep the new table private to Express, matching migrations 008 and 011.
ALTER TABLE app.pickup_schedule_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.pickup_schedule_changes FROM PUBLIC;
DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.pickup_schedule_changes FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.pickup_schedule_changes FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.pickup_schedule_changes FROM service_role';
  END IF;
END
$roles$;
