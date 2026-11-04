CREATE TABLE app.volunteer_registration_rate_limits (
  key_hash bytea PRIMARY KEY CHECK (octet_length(key_hash) = 32),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX volunteer_registration_rate_limits_window_idx
  ON app.volunteer_registration_rate_limits (window_started_at);

ALTER TABLE app.volunteer_registration_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.volunteer_registration_rate_limits FROM PUBLIC;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'authenticator', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE app.volunteer_registration_rate_limits FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;
