-- Distribution Centers (delivery destinations) and profile photo references.
-- Backward compatible: every change is additive and nullable, so the live API and the
-- previous Android build keep working while this migration is rolled out.

CREATE TABLE app.distribution_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text CHECK (name IS NULL OR length(trim(name)) BETWEEN 1 AND 120),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 5 AND 500),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES app.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX distribution_centers_active ON app.distribution_centers (is_active, created_at DESC);
ALTER TABLE app.distribution_centers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.distribution_centers FROM PUBLIC;
DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.distribution_centers FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.distribution_centers FROM authenticated';
  END IF;
END
$roles$;

-- Pickups keep their own delivery_address snapshot (historical rows and edits to a center
-- never rewrite past deliveries); the optional link records which center was chosen.
ALTER TABLE app.pickups
  ADD COLUMN distribution_center_id uuid REFERENCES app.distribution_centers(id);

-- Profile photos live in a private Supabase Storage bucket; only the object path and
-- metadata are stored here (never image bytes).
ALTER TABLE app.app_users
  ADD COLUMN photo_path text CHECK (photo_path IS NULL OR length(photo_path) BETWEEN 5 AND 300),
  ADD COLUMN photo_content_type text CHECK (photo_content_type IS NULL OR photo_content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD COLUMN photo_updated_at timestamptz;

-- Rollback (loses distribution centers, destination links and photo references only):
--   ALTER TABLE app.app_users DROP COLUMN photo_path, DROP COLUMN photo_content_type, DROP COLUMN photo_updated_at;
--   ALTER TABLE app.pickups DROP COLUMN distribution_center_id;
--   DROP TABLE app.distribution_centers;
