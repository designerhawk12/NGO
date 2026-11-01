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
| Pickup | `GET/POST /pickups`, `GET /pickups/:id`, `POST /pickups/:id/assignments`, `GET /assignments/me`, `PATCH /assignments/:id/status` | ADMIN schedules; assigned VOLUNTEER may accept/reject/progress allowed states. Use `CreatePickup`, `CreateAssignment`, `AssignmentTransition`, `Pickup`, `Assignment`. |
| Module 5 — Vehicle Details Maintenance | `GET/POST /vehicles`, `GET/PATCH /vehicles/:id`, `GET/POST /drivers`, `GET/POST /vehicles/:id/maintenance`, `GET/POST /vehicles/:id/unavailability` | ADMIN manages the canonical registry, vehicle specifications, drivers and maintenance. `Vehicle` adds optional `sizeCategory` and `indicativeMaxVessels`; `VehicleMaintenanceRecord` captures service date/condition. Assigned people come from Module 3's implemented projection above. |
| Module 4 — Vehicle Tracking and Management | `POST /pickups/:id/tracking-consent`, `POST /vehicles/:id/locations`, future authorized active-trip reads | A verified, assigned reporter explicitly grants consent before submitting locations during an active pickup. The server checks consent and assignment state. Use `TrackingConsentInput` and `VehicleLocationInput`; existing shared exports remain compatible. |

Example planned dispatch request:

```json
{
  "teamId": null,
  "volunteerIds": ["7b6e0f4e-1ed9-466a-97a9-314eb6f64aa5"],
  "driverId": "d9de49d3-b7ab-4b95-b2be-dc39e5f93094",
  "vehicleId": "3c597e69-6be5-4d29-97fc-a946fa8a5300",
  "role": "Pickup Volunteer",
  "windowStartsAt": "2026-10-10T12:00:00Z",
  "windowEndsAt": "2026-10-10T14:00:00Z",
  "containers": [{ "containerType": "insulated crate", "count": 3, "estimatedLoadKg": 45 }]
}
```

`POST /pickups/:id/assignments` will require `Idempotency-Key`. It must create the assignment, reservations and status event atomically; reject overlap as `409 RESOURCE_CONFLICT`. `PATCH /assignments/:id/status` accepts `{ action, expectedVersion, reason? }`. Wrong version returns `409 VERSION_CONFLICT`; invalid state/action returns `409 INVALID_TRANSITION`. The server returns an updated version after every accepted change. Team assignments list the actual participating volunteer IDs. Food safety review, availability, driver licence and weight/capacity are dispatch preconditions. No direct table writes from frontend clients are permitted.

Module 3's vehicle-assignment projection is read-only and ADMIN-only. A Module 5 admin screen may call it to obtain current driver and volunteer IDs, then resolve permitted contact/profile data through Module 5 and Module 1 APIs. Module 4 may read assignment/active-trip status only through a reviewed Module 3 service interface. Module 5's indicative vessel capacity is a vehicle specification; the actual vessel count remains in Module 3's `container_plans`. No EMPLOYEE authentication role is defined. The projection currently returns all nonterminal matches with `nextCursor: null`; add reviewed pagination before using it for large fleets.

Errors: `400 VALIDATION_ERROR` or `INVALID_JSON`; `401 UNAUTHENTICATED`; `403 FORBIDDEN`, `VOLUNTEER_PENDING_APPROVAL`, or `VOLUNTEER_APPLICATION_DENIED`; `404 NOT_FOUND`; `409 RESOURCE_CONFLICT`, `VOLUNTEER_REGISTRATION_CONFLICT`, `INVALID_TRANSITION`, or `VERSION_CONFLICT`; `503 SERVICE_UNAVAILABLE`; `500 INTERNAL_ERROR`. Do not return SQL details or stack traces. Document any new code in `packages/shared` before using it in clients.

Volunteer registration accepts only `email`, `name`, optional `phoneE164`, `registrationCode`, and optional `skills`. The server sends the existing Supabase invitation, creates canonical app-user/person/volunteer records (new Volunteer operational status `INACTIVE`), and inserts a separate `volunteer_applications` row in `PENDING`; callers cannot submit identity, role, or application status fields. `GET /volunteers/applications` is ADMIN-only and returns paginated pending application records with their details joined from canonical user/person/volunteer rows. `PATCH /volunteers/:id/approval` is ADMIN-only and accepts `{ "status": "APPROVED" | "DENIED" }`; it records the reviewing application user and timestamp, and atomically activates or deactivates the linked Volunteer profile. A denied Auth account and application remain stored, the linked Volunteer is inactive, and Volunteer-protected routes reject it. Existing Admin-created Volunteers without an application keep their existing operational status and access.
