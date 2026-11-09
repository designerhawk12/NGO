-- PROPOSAL ONLY: confirm both hosted ledgers/checksums and final sequence number
-- with the integration maintainer before moving into db/migrations. Not auto-applied.
-- Additive; existing approved/pending applications are grandfathered explicitly.
ALTER TABLE app.vehicle_locations ADD COLUMN accuracy_meters double precision CHECK(accuracy_meters BETWEEN 0 AND 200), ADD COLUMN speed_mps double precision CHECK(speed_mps BETWEEN 0 AND 100);
CREATE TABLE app.tracking_geocode_cache(cell text PRIMARY KEY,locality text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE app.tracking_geocode_rate(id integer PRIMARY KEY CHECK(id=1),next_lookup_at timestamptz NOT NULL DEFAULT now());
INSERT INTO app.tracking_geocode_rate(id) VALUES(1);
ALTER TABLE app.volunteer_applications ADD COLUMN identity_required boolean NOT NULL DEFAULT false;
ALTER TABLE app.volunteer_applications ALTER COLUMN identity_required SET DEFAULT true;

CREATE TABLE app.volunteer_identity_documents (
  volunteer_id uuid PRIMARY KEY REFERENCES app.volunteers(id),
  document_type text NOT NULL CHECK (document_type IN ('MASKED_AADHAAR','PAN','DRIVING_LICENCE')),
  object_path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','VERIFIED','REJECTED','DELETED')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES app.app_users(id), reviewed_at timestamptz, reason text,
  consent_version text NOT NULL DEFAULT 'identity-v1'
);
CREATE TABLE app.identity_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), volunteer_id uuid NOT NULL REFERENCES app.volunteers(id),
  actor_user_id uuid REFERENCES app.app_users(id), action text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.identity_registration_attempts (
  id uuid PRIMARY KEY, request_hash text NOT NULL, object_path text NOT NULL,
  auth_user_id uuid, volunteer_id uuid REFERENCES app.volunteers(id), lease_id uuid, locked_until timestamptz, invite_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
CREATE INDEX identity_attempt_expiry ON app.identity_registration_attempts(expires_at);
CREATE TABLE app.identity_storage_objects(object_path text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());

CREATE FUNCTION app.enforce_identity_verification() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, app AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND NEW.identity_required AND NOT EXISTS (
    SELECT 1 FROM app.volunteer_identity_documents WHERE volunteer_id = NEW.volunteer_id AND status = 'VERIFIED'
  ) THEN RAISE EXCEPTION 'IDENTITY_VERIFICATION_REQUIRED' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER volunteer_identity_approval BEFORE INSERT OR UPDATE OF status ON app.volunteer_applications
  FOR EACH ROW EXECUTE FUNCTION app.enforce_identity_verification();

CREATE TABLE app.whatsapp_preferences (
  app_user_id uuid PRIMARY KEY REFERENCES app.app_users(id), phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  opted_in boolean NOT NULL DEFAULT false, consent_version text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.food_request_submissions(app_user_id uuid NOT NULL REFERENCES app.app_users(id),submission_id uuid NOT NULL,request_hash text NOT NULL,food_request_id uuid NOT NULL REFERENCES app.food_requests(id),PRIMARY KEY(app_user_id,submission_id));
CREATE TABLE app.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_key text NOT NULL UNIQUE,
  recipient_user_id uuid REFERENCES app.app_users(id), admin_recipient boolean NOT NULL DEFAULT false,
  template_key text NOT NULL, parameters jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','DELIVERED','READ','FAILED','SKIPPED','UNKNOWN')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz, provider_message_id text UNIQUE, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_dispatch ON app.notification_outbox(next_attempt_at) WHERE status = 'PENDING';
CREATE TABLE app.notification_webhook_events (event_hash text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app.notification_dispatch_rate (id integer PRIMARY KEY CHECK(id=1),next_send_at timestamptz NOT NULL DEFAULT now());
INSERT INTO app.notification_dispatch_rate(id) VALUES(1);

DO $private$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicle_locations','vehicle_tracking_consents','volunteer_identity_documents','identity_review_events','identity_registration_attempts','identity_storage_objects','whatsapp_preferences','notification_outbox','notification_webhook_events','notification_dispatch_rate','tracking_geocode_cache','tracking_geocode_rate','food_request_submissions'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE app.%I FROM PUBLIC', t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON TABLE app.%I FROM %I', t, r); END IF;
    END LOOP;
  END LOOP;
END $private$;
REVOKE ALL ON FUNCTION app.enforce_identity_verification() FROM PUBLIC;

-- Rollback: roll back application deployment and disable new feature flags; keep
-- additive tables and proof gate. Do not drop documents/audit/outbox or disable
-- the approval gate to make old code approve unverified new applications.
