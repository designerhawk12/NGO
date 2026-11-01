SET search_path TO app, public, extensions;

-- Application state is separate from the operational Volunteer status.
-- Applicant identity and submitted profile details remain in app_users/people/volunteers.
CREATE TABLE app.volunteer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL UNIQUE REFERENCES app.volunteers(id),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'DENIED')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES app.app_users(id),
  CONSTRAINT volunteer_application_review_fields CHECK (
    (status = 'PENDING' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status IN ('APPROVED', 'DENIED') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

CREATE INDEX volunteer_applications_pending_lookup
  ON app.volunteer_applications (submitted_at DESC, id DESC)
  WHERE status = 'PENDING';

-- Keep the app schema private to Express; no browser/mobile Data API access.
ALTER TABLE app.volunteer_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.volunteer_applications FROM PUBLIC;
DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.volunteer_applications FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.volunteer_applications FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE app.volunteer_applications FROM service_role';
  END IF;
END
$roles$;
