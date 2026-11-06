# Version 1 REST contracts

All paths begin `/api/v1`. Successful JSON responses are `{ "success": true, "data": ... }`; failures are `{ "success": false, "error": { "code": "...", "message": "...", "requestId": "...", "details": [] } }`. The `X-Request-ID` response header correlates logs and errors. Bodyless `204` responses have no envelope. Collection data uses `{ items, nextCursor }`. Shared request/response DTOs and Zod schemas live in `packages/shared/src/contracts`. UUIDs are internal IDs; UI display codes and existing mock IDs are not interchangeable. Timestamps include offsets and are normalized to UTC for storage. Numeric quantities carry explicit units.

## Implemented foundation endpoints

| Method/path | Authentication | Response |
| --- | --- | --- |
| `GET /health` | Public | Liveness `{ status, timestamp }`, even when DB is unavailable |
| `GET /health/ready` | Public | `200` if the database responds; otherwise `503` |
| `GET /me` | Verified Supabase email bearer token | Server-owned `AppUser`; first verified request creates a DONOR app user |
| `PATCH /admin/users/:id/role` | ADMIN | Body `{ "role": "VOLUNTEER" }` (or ADMIN/DONOR); returns `AppUser`, audits change |
| `GET /vehicles/:id/assignments` | ADMIN; Module 3 | `{ items: VehicleAssignmentSummary[], nextCursor: null }`, projected from nonterminal canonical assignments and membership. Each item has `assignmentId`, `pickupId`, `status`, pickup window, `driverId`, and `volunteerIds`. No contact details or second roster are stored. |

The server calls Supabase Auth `getUser(token)` for verified identity and then reads the application role from PostgreSQL. Neither a client role choice nor a token's `role` claim grants ADMIN/VOLUNTEER. `AppUser.volunteerApplicationStatus` is included for Volunteer accounts. `PENDING` and `DENIED` applications are blocked; legacy Admin-created Volunteer profiles with no application remain authorized. Missing/invalid auth returns `401`; missing central configuration returns `503`. Administrator bootstrap is a controlled database operation documented in `DEPLOYMENT.md`.
The initial application roles are ADMIN, VOLUNTEER and DONOR; there is no standalone DRIVER login role. A driver who reports a location must have an authorized account and assignment under the approved reporter policy.

## Approved domain endpoints for teams to implement

The following paths are **contracts and ownership reservations**, not working endpoints. Empty module routers currently return 404.

| Owner | Endpoints | Main DTOs and authorization |
| --- | --- | --- |
| Volunteer | `POST /volunteers/register`, `GET /volunteers/applications`, `PATCH /volunteers/:id/approval`, `GET/POST /volunteers`, `GET/PATCH /volunteers/:id`, `GET/PATCH /volunteers/me`, `GET/POST /volunteers/me/availability`, `GET/POST /teams`, `PATCH /teams/:id` | Public registration sends the existing Supabase invitation and creates canonical app-user/person/volunteer records plus a PENDING `volunteer_applications` row. ADMIN reviews applications and manages the roster/teams. Only VOLUNTEER accounts with an APPROVED application or a legacy linked Volunteer profile without an application can access Volunteer routes. Use `VolunteerRegistrationInput`, `VolunteerApplication`, `Volunteer`, `Availability`, `Team`. |
| Food | `GET/POST /food-requests`, `GET /food-requests/:id`, `POST /food-requests/:id/cancel`, `POST /food-requests/:id/safety-review` | DONOR creates/reads own requests and cancels before travel. ADMIN reviews safety. Use `CreateFoodRequest`, `FoodRequest`; safety defaults PENDING. |
| Pickup | `GET/POST /pickups`, `GET /pickups/:id`, `GET /pickups/:id/eligible-volunteers`, `POST /pickups/:id/assignments`, `GET /assignments/me`, `PATCH /assignments/:id/status` | ADMIN schedules and reads pickup-window volunteer eligibility; assigned VOLUNTEER may accept/reject/progress allowed states. Eligibility returns the persisted pickup window, schedule-eligible `volunteerIds`, `reservationConflictVolunteerIds`, `blockingReason`, `foodPickupDeadline`, and `requiresNewDonorRequest`. A newly created pickup must start strictly in the future and within the Food request's `readyAt`/`pickupDeadline`; the Food request must be SUBMITTED with APPROVED safety review. New assignment windows must also start in the future, remain within the persisted pickup window and Food interval, and pass the existing volunteer, reservation, driver, vehicle and vessel checks. Timing conflicts on new writes return `409 RESOURCE_CONFLICT`. Eligibility is a read-only precheck: a started pickup window or one outside the Food interval returns HTTP 200 with empty candidates and a `blockingReason`; an expired Food deadline additionally sets `requiresNewDonorRequest: true`. Non-PLANNED pickups remain 409. A matching committed idempotency key can replay an assignment after its window has elapsed. Existing assignments may progress through their authorized statuses after the original window has elapsed; no historical rows are changed by these creation rules. Use `CreatePickup`, `CreateAssignment`, `AssignmentTransition`, `Pickup`, `Assignment`. |
| Module 5 — Vehicle Details Maintenance | `GET/POST /vehicles`, `GET/PATCH /vehicles/:id`, `GET/POST /drivers`, `GET/POST /vehicles/:id/maintenance`, `GET/POST /vehicles/:id/unavailability` | ADMIN manages the canonical registry, vehicle specifications, drivers and maintenance. `Vehicle` adds optional `sizeCategory` and `indicativeMaxVessels`; `VehicleMaintenanceRecord` captures service date/condition. Assigned people come from Module 3's implemented projection above. |
| Module 4 — Vehicle Tracking and Management | `POST /pickups/:id/tracking-consent`, `POST /vehicles/:id/locations`, future authorized active-trip reads | A verified, assigned reporter explicitly grants consent before submitting locations during an active pickup. The server checks consent and assignment state. Use `TrackingConsentInput` and `VehicleLocationInput`; existing shared exports remain compatible. |

Example planned dispatch request:

```json
{
  "teamId": null,
  "volunteerIds": ["7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5"],
  "driverId": "d9de49d3-b7ab-4b95-b2be-dc39e5f93094",
  "vehicleId": "3c597e69-6be5-4d29-97fc-a946fa8a5300",
  "vesselIds": [],
  "role": "Pickup Volunteer",
  "windowStartsAt": "2026-10-10T12:00:00Z",
  "windowEndsAt": "2026-10-10T14:00:00Z",
  "containers": [{ "containerType": "insulated crate", "count": 3, "estimatedLoadKg": 45 }]
}
```

`POST /pickups/:id/assignments` will require `Idempotency-Key`. The optional `vesselIds` array identifies physical vessels to issue to the assignment. The assignment, container plan, person/vehicle reservations, vessel issuances and status events must commit or roll back atomically; reject overlap or ineligible vessels as `409 RESOURCE_CONFLICT`. `PATCH /assignments/:id/status` accepts `{ action, expectedVersion, reason? }`. Wrong version returns `409 VERSION_CONFLICT`; invalid state/action returns `409 INVALID_TRANSITION`. The server returns an updated version after every accepted change. Team assignments list the actual participating volunteer IDs. Food safety review, availability, driver licence and weight/capacity are dispatch preconditions. No direct table writes from frontend clients are permitted.

Module 3's vehicle-assignment projection is read-only and ADMIN-only. A Module 5 admin screen may call it to obtain current driver and volunteer IDs, then resolve permitted contact/profile data through Module 5 and Module 1 APIs. Module 4 may read assignment/active-trip status only through a reviewed Module 3 service interface. Module 5's indicative vessel capacity is a vehicle specification; the actual vessel count remains in Module 3's `container_plans`. No EMPLOYEE authentication role is defined. The projection currently returns all nonterminal matches with `nextCursor: null`; add reviewed pagination before using it for large fleets.

Errors: `400 VALIDATION_ERROR` or `INVALID_JSON`; `401 UNAUTHENTICATED`; `403 FORBIDDEN`, `VOLUNTEER_PENDING_APPROVAL`, or `VOLUNTEER_APPLICATION_DENIED`; `404 NOT_FOUND`; `409 RESOURCE_CONFLICT`, `VOLUNTEER_REGISTRATION_CONFLICT`, `INVALID_TRANSITION`, or `VERSION_CONFLICT`; `503 SERVICE_UNAVAILABLE`; `500 INTERNAL_ERROR`. Do not return SQL details or stack traces. Document any new code in `packages/shared` before using it in clients.

Volunteer registration accepts only `email`, `name`, optional `phoneE164`, `registrationCode`, and optional `skills`. The server sends the existing Supabase invitation, creates canonical app-user/person/volunteer records (new Volunteer operational status `INACTIVE`), and inserts a separate `volunteer_applications` row in `PENDING`; callers cannot submit identity, role, or application status fields. `GET /volunteers/applications` is ADMIN-only and returns paginated pending application records with their details joined from canonical user/person/volunteer rows. `PATCH /volunteers/:id/approval` is ADMIN-only and accepts `{ "status": "APPROVED" | "DENIED" }`; it records the reviewing application user and timestamp, and atomically activates or deactivates the linked Volunteer profile. A denied Auth account and application remain stored, the linked Volunteer is inactive, and Volunteer-protected routes reject it. Existing Admin-created Volunteers without an application keep their existing operational status and access.

## NGO employee drivers, fixed vehicles and pickup administration (migration 012)

Drivers are NGO employees, not Volunteers. Vehicles are registered first, with no driver; an Admin then registers an employee driver and links them to exactly one unassigned vehicle. The link is permanent under normal Admin workflows.

| Method/path | Authentication | Behaviour |
| --- | --- | --- |
| `POST /vehicles`, `PATCH /vehicles/:id` | ADMIN | Unchanged fields, but any `assignedDriverId` is rejected with `400 VALIDATION_ERROR`. Responses add `assignedDriver` (the fixed driver, or `null`). |
| `DELETE /vehicles/:id` | ADMIN | `409 VEHICLE_HAS_FIXED_DRIVER` if a driver is linked; retire the vehicle instead. Historical references still return `409 RESOURCE_CONFLICT`. |
| `GET /drivers` | ADMIN | All driver records with `driverType` (`EMPLOYEE` or historical `LEGACY_VOLUNTEER`), contact, licence, status and fixed `vehicle`. Superset of the earlier response. |
| `GET /drivers/vehicle-options` | ADMIN | Vehicles with `eligible`/`reason` for a new driver (eligible = no driver and not retired). |
| `POST /drivers` | ADMIN | `{ name, phoneE164 (+91 mobile), licenceNumber, licenceExpiresOn, employeeCode?, vehicleId }`. Creates a person with no login or Volunteer record, an `EMPLOYEE` driver, and the vehicle link in one transaction. Errors: `400 LICENCE_EXPIRED`, `404 VEHICLE_NOT_FOUND`, `409 VEHICLE_ALREADY_HAS_DRIVER`, `VEHICLE_RETIRED`, `DRIVER_LICENCE_CONFLICT`, `PHONE_CONFLICT`, `EMPLOYEE_CODE_CONFLICT`. |
| `GET/PATCH /drivers/:id` | ADMIN | PATCH edits name, phone, licence, expiry, employee ID and `ACTIVE`/`INACTIVE` status. Any `vehicleId` returns `409 FIXED_VEHICLE_IMMUTABLE`. Historical Volunteer-linked drivers return `409 LEGACY_DRIVER_READ_ONLY`. Deactivating a driver with upcoming reservations returns `409 DRIVER_HAS_UPCOMING_ASSIGNMENTS`. |
| `GET /pickups/:id/driver-options` | ADMIN | Employee drivers with their fixed vehicle, unit-aware food `load`, capacity assessment (`FITS`/`EXCEEDS`/`VERIFY`), `eligible`, `reasons` and `warnings`. Guidance only. |
| `GET /pickups/:id/container-options?driverId=` | ADMIN | Container inventory with availability and a recommended combination sized to the stored food load and the vehicle's container limit. Litre figures are labelled estimates. |
| `PATCH /pickups/:id` | ADMIN | `{ expectedVersion, windowStartsAt?, windowEndsAt?, deliveryAddress?, operationalNotes? }`. Time and delivery change only while `PLANNED`; while `ASSIGNED` (assignment pending/accepted) only notes change (`409 PICKUP_SCHEDULE_LOCKED`). Writes `pickup_schedule_changes`. `409 VERSION_CONFLICT`, `PICKUP_IN_PROGRESS`, `PICKUP_NOT_EDITABLE`. |
| `POST /pickups/:id/cancel` | ADMIN | The Admin "Delete pickup" action. `{ expectedVersion, reason }`. Cancels a `PLANNED`/`ASSIGNED` pickup and its pending/accepted assignment, releases reservations and containers, keeps the food request (it can be scheduled again) and all history. Repeating returns `200` with `alreadyCancelled: true`. In-progress or delivered pickups return `409 PICKUP_IN_PROGRESS`/`PICKUP_COMPLETED`. |

`POST /pickups/:id/assignments`: `vehicleId` is now optional. The server derives it from the driver's fixed link and returns `409 DRIVER_VEHICLE_MISMATCH` if a different vehicle is sent and `409 DRIVER_NOT_ELIGIBLE` for non-employee drivers. It recalculates the food load from stored items (`409 VEHICLE_CAPACITY_INSUFFICIENT`), rejects overlapping vehicle bookings, and requires at least one clean, available, food-grade container whose capacity covers the known load, fits the vehicle's container limit and holds liquids in sealed containers (`409 CONTAINER_PLAN_INVALID`). All of this runs in the existing assignment transaction.

`POST /volunteers` (Admin "Add Volunteer") is retired and answers `410 ADMIN_VOLUNTEER_CREATION_RETIRED` without contacting Supabase or writing records. Volunteers join through mobile registration and Admin approval. `PATCH /volunteers/:id` no longer accepts `driverDetails` or `driverStatus`; skills never create driver records. `GET /volunteers/:id/driver-details` remains as a read-only view of historical records.

## NGO employee driver sign-in and jobs (migration 013)

`DRIVER` is an application role for NGO employee drivers. Only Admin driver provisioning creates it; registration, client metadata and `PATCH /admin/users/:id/role` cannot (`assignableAppRoleSchema` excludes it, and changing a DRIVER user returns `409 DRIVER_ROLE_MANAGED_BY_ASSIGN_DRIVER`).

| Method/path | Authentication | Behaviour |
| --- | --- | --- |
| `POST /drivers` | ADMIN | Now also requires `email`. After every database check passes, the server sends the Supabase invitation (the same `/accept-invite` password setup used for Volunteers) and, in the same transaction, creates a `DRIVER` app user linked to the driver's person. A failed invitation saves nothing. `409 DRIVER_EMAIL_IN_USE` for an address already used by a driver or any Auth account. If the invitation succeeds but saving fails: `503 DRIVER_INVITE_RECOVERY_REQUIRED` (never reported as success). Invitation provider errors keep their existing `INVITE_*` codes. |
| `POST /drivers/:id/invite` | ADMIN | `{ email }`. Invites an employee driver who has no app sign-in yet; `409 DRIVER_ALREADY_INVITED` otherwise. |
| `GET /drivers/me` | DRIVER | The driver's own profile and fixed vehicle. |
| `GET /assignments/driver` | DRIVER | `{ items: DriverJob[] }`: only this driver's assignments, with donor, pickup address, delivery destination, window, food items, fixed vehicle, crew names, `status`, `driverAcceptance`, `version` and `completedAt`. |
| `PATCH /assignments/:id/status` | VOLUNTEER, DRIVER, ADMIN | The driver must be the assignment's driver (`403` otherwise). Driver `ACCEPT` records `driverAcceptance = ACCEPTED` without changing the crew status. Driver `REJECT` (reason required, before `EN_ROUTE`) sets `driverAcceptance = DECLINED`, rejects the assignment, returns the pickup to `PLANNED` and releases reservations and containers. Drivers may also `START`, `ARRIVE`, `COLLECT` and `DELIVER`. `START` by anyone requires the driver to have accepted (`409 DRIVER_NOT_ACCEPTED`); a driver cannot start before a crew volunteer has accepted (`409 CREW_NOT_ACCEPTED`). `expectedVersion` concurrency applies to every action. |

Assignment DTOs now include `driverAcceptance` (`NOT_REQUIRED` for assignments created before 013, otherwise `PENDING`, `ACCEPTED` or `DECLINED`) and, where known, `deliveryAddress`.
