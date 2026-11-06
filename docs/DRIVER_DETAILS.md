# Driver Details — review and rollout

The Admin Volunteer form uses the existing canonical records. A Volunteer and Driver share
`app.people.id`: `app.volunteers.person_id` and the unique `app.drivers.person_id` both
refer to that person. `app.drivers` already stores the licence number, required licence
expiry date, and `ACTIVE`/`INACTIVE` status. The vehicle registration remains canonical
in `app.vehicles.registration_number`; `app.vehicles.assigned_driver_id` is the existing
default-driver link. No schema migration is required or included.

`POST /api/v1/volunteers` accepts `driverDetails` only when `skills` includes `Driver`.
`PATCH /api/v1/volunteers/:id` accepts driver details and an optional `driverStatus`.
Both routes remain Admin-only. The driver and vehicle link are written in the same
PostgreSQL transaction as the Volunteer profile. A missing vehicle or duplicate driver
link is rejected; the API does not create a vehicle from a registration number.
`GET /api/v1/volunteers/:id/driver-details` is Admin-only and returns the full licence,
expiry, linked registration, status, and number of additional default-vehicle links.
The general Volunteer list and profile responses do not include these sensitive fields.

Removing the Driver skill from an active driver requires explicit deactivation. The
Admin form confirms that action; the driver record and vehicle link are retained.
Driver status does not change Volunteer status or application approval. A driver already
linked to multiple default vehicles can edit licence and status, while vehicle-link
changes remain in Vehicle Details to avoid silently unlinking existing vehicles.

Before release, verify the target Production schema and migration ledger read-only.
The locally configured database has the required tables and columns, but this does not
establish that the Production connection uses the same database. Deploy code only after
review; no database migration or Production deployment was performed for this feature.
Rollback is a code rollback: existing driver and vehicle records remain canonical and
no schema needs reversal.
