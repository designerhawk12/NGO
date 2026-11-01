-- Module 5: link the registry's default driver to the canonical driver record.
-- Existing vehicles remain valid with no default driver; assignments remain owned by Module 3.
ALTER TABLE app.vehicles
  ADD COLUMN assigned_driver_id uuid REFERENCES app.drivers(id);
CREATE INDEX vehicles_assigned_driver ON app.vehicles(assigned_driver_id);
-- Rollback (loses default-driver links): DROP INDEX app.vehicles_assigned_driver;
-- ALTER TABLE app.vehicles DROP COLUMN assigned_driver_id;
