# AaharaConnect architecture

## Current state

`apps/web` is the existing Vite administrator prototype and `apps/mobile` is the existing Expo volunteer/donor prototype. Both still use local mock business data. The Express API has health, readiness, application-user, and one read-only vehicle-assignment projection endpoint; the five domain modules are otherwise unimplemented. A passing build does not mean the business modules are live.

## Approved shape

```text
React/Vite admin UI ─┐
                     ├─ Express /api/v1 ─ pg ─ one Supabase PostgreSQL database
Expo volunteer/donor ─┘         │
         Supabase Auth ─ verified token + server-owned role
                     shared Zod/TypeScript wire contracts
```

Supabase Auth issues email-login sessions. Express verifies bearer tokens through Supabase Auth (`getUser(token)`) and reads the authoritative `app.app_users.role`. The frontends may use Supabase's client SDK only for authentication. All application-data reads and writes go through Express. Do not expose the `app` schema in the Supabase Data API. No service-role key is needed in web or mobile.

The backend is a modular monolith. `server/src/modules/{volunteers,food,pickups,tracking,vehicles}` are ownership boundaries inside the same process. `tracking` is Module 4; the existing `vehicles` folder is Module 5 and remains the sole registry owner. Routes/controllers validate HTTP input, services implement rules and cross-module coordination, and repositories own SQL. Unimplemented endpoints correctly return 404. Authentication, database, migrations, shared contracts, configuration and CI are maintained centrally.

The API clients at `apps/web/src/api/client.ts` and `apps/mobile/src/api/client.ts` remain the single application-data HTTP entry points. Their `api/auth.ts` adapters use one Supabase Auth client per app, pass access tokens to `/me`, and trust the server-owned role. The web Settings page exposes optional administrator sign-in; the mobile sign-in screen has a separately labeled shared-API sign-in when public settings exist. Its original demo sign-in and explicit demo-account path remain available. Business-data mocks stay in place until domain APIs and integration tests exist.

## Dependency direction

- Food owns food facts, donor identity and safety review. It requests a Pickup cancellation through a Pickup service interface when necessary.
- Volunteer owns people availability and team membership, never assignment persistence.
- Vehicle Details Maintenance owns canonical vehicle/driver inventory, specifications, maintenance and availability. It reads current assigned-person IDs through Pickup's projection and does not persist that roster.
- Vehicle Tracking owns consent, active-trip observations, location authorization and retention. It reads canonical vehicles from Module 5 and active assignment/pickup state from Module 3 through reviewed interfaces.
- Pickup owns the shared dispatch, assignment, reservation, vessel/container plan and status workflow. It reads Volunteer, Food, and Vehicle Details capabilities through documented service interfaces and writes only its own tables. `GET /vehicles/:id/assignments` is its read-only projection from canonical assignment records.
- A cross-module operation that must be atomic shares a `pg` transaction client. Modules do not import another module's repository or write its tables directly.

See `DATA_MODEL.md`, `API_CONTRACTS.md`, `WORKFLOW_STATES.md`, `TEAM_OWNERSHIP.md` and `DEPLOYMENT.md`. Root `AGENTS.md` is mandatory for Codex collaborators.

## Expo push notifications (migration 016)

The same Expo app now accepts the database-owned ADMIN role. Mobile obtains an Expo token only after explicit notification permission and an authenticated session. Express owns device registration, inbox authorization and Expo Push Service requests. Business services insert idempotent recipient notifications and delivery rows in their existing transactions; controllers attempt dispatch only after commit. A secret-protected Vercel Cron endpoint processes due retries and Expo receipts. Expo tickets and receipts establish provider processing, never human receipt. The Hobby cron schedule is daily, so transient retries are not guaranteed promptly without an external scheduler or a higher-frequency plan. WhatsApp remains a separate disabled integration. The new `app` tables are private to the restricted Express runtime role; client roles have no table grants or RLS policies.
