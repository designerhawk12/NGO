-- Optional, size-limited vehicle photo; existing vehicles remain unchanged.
ALTER TABLE app.vehicles ADD COLUMN photo_data_url text
  CHECK (photo_data_url IS NULL OR length(photo_data_url) <= 700000);
-- Rollback: ALTER TABLE app.vehicles DROP COLUMN photo_data_url;
-- Rolling back deletes stored vehicle photos only.
