-- Record the first server-side cancellation time for the 24-hour active-list window.
-- Existing cancelled rows intentionally retain NULL because their timestamp is unknown.
ALTER TABLE app.food_requests
  ADD COLUMN cancelled_at timestamptz;

CREATE INDEX food_requests_recent_cancellations_idx
  ON app.food_requests (cancelled_at DESC, created_at DESC)
  WHERE status = 'CANCELLED';

-- Rollback: DROP INDEX app.food_requests_recent_cancellations_idx;
--           ALTER TABLE app.food_requests DROP COLUMN cancelled_at;
-- Rolling back removes timestamps collected after this migration.
