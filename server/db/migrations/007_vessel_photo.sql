-- Optional vessel photo, preserving existing inventory.
ALTER TABLE app.vessels ADD COLUMN photo_data_url text
  CHECK (photo_data_url IS NULL OR length(photo_data_url) <= 700000);
-- Rollback: ALTER TABLE app.vessels DROP COLUMN photo_data_url;
-- Rollback removes stored vessel photos only.
