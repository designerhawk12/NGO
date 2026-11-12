-- Private Expo push devices, per-user inbox, and durable per-device delivery.
-- The Express server resolves every recipient and owns all authorization.
CREATE TABLE app.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id uuid NOT NULL REFERENCES app.app_users(id),
  expo_token text NOT NULL UNIQUE CHECK (expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$'),
  device_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(app_user_id,device_id)
);
CREATE INDEX push_devices_user_enabled ON app.push_devices(app_user_id) WHERE enabled;
CREATE TABLE app.push_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES app.app_users(id),
  kind text NOT NULL CHECK(kind IN ('VOLUNTEER_APPLICATION','FOOD_REQUEST','PICKUP_SCHEDULED','DRIVER_ASSIGNED','VOLUNTEER_ASSIGNED','CREW_DECLINED','PICKUP_CANCELLED','ASSIGNMENT_CLOSED','PICKUP_RESCHEDULED','PICKUP_STATUS')),
  entity_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_key,recipient_user_id)
);
CREATE INDEX push_notifications_inbox ON app.push_notifications(recipient_user_id,created_at DESC);
CREATE TABLE app.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES app.push_notifications(id),
  device_id uuid NOT NULL REFERENCES app.push_devices(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','TICKET','DELIVERED','FAILED','UNKNOWN')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  expo_ticket_id text UNIQUE,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id,device_id)
);
CREATE INDEX push_deliveries_due ON app.push_deliveries(next_attempt_at) WHERE state='PENDING';
CREATE INDEX push_deliveries_receipt ON app.push_deliveries(updated_at) WHERE state='TICKET';
CREATE INDEX push_notifications_event_key ON app.push_notifications(event_key);
ALTER TABLE app.assignment_members ADD COLUMN response text NOT NULL DEFAULT 'PENDING'
  CHECK (response IN ('PENDING','ACCEPTED','DECLINED','CANCELLED'));
ALTER TABLE app.assignment_members ADD COLUMN responded_at timestamptz;
ALTER TABLE app.assignment_members ADD COLUMN response_reason text;
CREATE INDEX assignment_members_response ON app.assignment_members(assignment_id,response);
DO $security$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['push_devices','push_notifications','push_deliveries'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC',t);
    EXECUTE format('REVOKE ALL ON app.%I FROM anon, authenticated',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON app.%I TO aaharaconnect_api',t);
    EXECUTE format('CREATE POLICY express_api_access ON app.%I FOR ALL TO aaharaconnect_api USING (true) WITH CHECK (true)',t);
  END LOOP;
  GRANT DELETE ON app.push_devices TO aaharaconnect_api;
END $security$;
-- Rollback: stop push dispatch and registration, keep inbox/delivery history.
