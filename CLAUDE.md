@AGENTS.md

# AahaaraConnect — Claude Code notes

This is an NGO food-donation platform. Donors and Volunteers use an Android app (Expo). Admins use a web dashboard (Vite). Both talk to one Express API at `/api/v1`, which is backed by one Supabase PostgreSQL database (schema `app`) and Supabase Auth.

## Where to work
- **The active checkout is `C:\Users\desig\Projects\aaharaconnect-ngo-recovery`**, on branch `integration/ngo-recovery`. Its last release is `3c7eb14`.
- PR 26 (`integration/ngo-recovery` → **`develop`**) is open. Do not merge it without the owner's approval.
- `C:\Users\desig\OneDrive\Desktop\5TH SEM\NGO` is an OLD checkout on `demo/backend-hosting-2026-10-29`. It has uncommitted Codex work, and its local `.env` files point at **Production** Supabase. Do not touch it, and do not run dev servers from it.
- The `C:\Users\desig\AppData\Local\Temp\aaharaconnect-*` folders are other Codex worktrees. Ignore them.

## Layout (npm workspaces)
- `apps/web` is the Admin dashboard (React 18, Vite, TypeScript). Pages live in `src/pages`, the API client is `src/api/client.ts`, and auth is `src/api/auth.ts`. It has its own i18n audit.
- `apps/mobile` is the Expo Router app for Donors and Volunteers. Read `apps/mobile/AGENTS.md`. `eas.json` lives here.
- `server` is Express with TypeScript. `src/modules/{volunteers,food,pickups,tracking,vehicles,vessels}` uses route → controller → service → repository. Tests use vitest in `src/test`. Migrations are in `db/migrations` (001–011).
- `packages/shared` holds the Zod/TS wire contracts. Build it before web, server or mobile.
- `api/index.ts` is the Vercel serverless entry. `vercel.json` routes `/api/v1/*` to it and serves `apps/web/dist`.
- `docs/` has the architecture, contracts, data model, ownership and deployment docs. Parts of `ARCHITECTURE.md` "Current state" are outdated: many modules are live now. Check the code.

## Commands (run from repo root)
- Build: `npm run build:shared`, `npm run build:web`, `npm run build:server`
- Test: `npm run test:server` (vitest; DB integration tests run only with a dedicated `_test` DB), `npm run test:web` (smoke + i18n)
- Mobile: `npm run check:mobile` (typecheck), `npm run lint:mobile`
- Dev: `npm run web`, `npm run server`, `npm run mobile`. Local `.env` files must NOT point at Production.

## Environments
| | Production | Staging |
|---|---|---|
| Web/API | https://ngo-eight-umber.vercel.app (Vercel team `equinox10`, project `ngo`) | Vercel `aaharaconnect-ngo-staging` (prj_W1MrwAqFsWTFohHs6UXR2fo1EEIL), `aaharaconnect-ngo-staging-api`. Deployment Protection stays ON |
| Supabase | ref `pyzyxgpcfwpcqyqrihuo` (ledger 001–011) | ref `tughgqggsndtraaymtvf` "aaharaconnect-staging" (ledger 001–012) |
- **This worktree's `.vercel/project.json` links to Production `ngo`.** Never run `vercel deploy`/`--prod` without explicit approval. Check the target with `vercel project ls` / `vercel inspect`.
- Health checks: `GET /api/v1/health` (liveness) and `/api/v1/health/ready` (DB).
- Expo/EAS: project `6406b528-a2ba-4abb-a356-6bfb405c3957`, Android package `com.rajashishpatil10.aaharaconnect`, profile `production-apk`. Do not run `eas init`, change credentials, or start builds without approval.

## Hard rules
- No Production DB writes, migrations, Auth-user deletions or cleanup scripts without explicit approval. Production holds real accounts.
- Protected Admin: Auth UUID `ef236ebf-b38f-478e-94c1-478fb5599f4b`, app user UUID `f2e2c2e6-9edf-457a-9785-69f866040449`. Never modify or delete them.
- Migrations are forward-only and applied files are immutable (the runner checks checksums). 001–011 are applied in Production; 012 (employee drivers, pickup edit/cancel) is applied on staging only. Never edit `012_employee_drivers_and_pickup_admin.sql` now: staging records its checksum. Stage first, and follow `docs/DEPLOYMENT.md` "Migration procedure".
- Drivers are NGO employees (`drivers.driver_type = 'EMPLOYEE'`), registered only from Assign Driver (`POST /drivers`) with one permanent vehicle (`vehicles.assigned_driver_id`, guarded by DB triggers). Volunteers never become drivers. Admin "Add Volunteer" is retired (`POST /volunteers` → 410).
- Local DB tests: run a throwaway `postgres:17` Docker container whose database name ends in `_test`, and set `TEST_DATABASE_URL` = `DATABASE_URL`, `ALLOW_TEST_DATABASE_MUTATION=true`, `DATABASE_SSL=false`. `npm run migrate:up` is denied in `.claude/settings.json`, so load the SQL files with `psql` into that container only.
- Web code may import only *types* from `@aaharaconnect/shared` (its CommonJS build breaks the Vite SSR smoke test). Server-only logic lives in `packages/shared/src/contracts/logistics.ts`.
- Never commit `.env*` (except `.env.example`), tokens or keys. Never put `DATABASE_URL`/secret keys in `VITE_`/`EXPO_PUBLIC_` vars.
- Do not force-push, reset or rewrite `integration/ngo-recovery`.
- Roles come from `app.app_users` on the server, never from client state.
- Vehicle GPS tracking from driver phones is NOT implemented. Do not build it unless asked.

## Web change workflow
Inspect the existing components and API client, reuse the design in `styles.css`/`polish.css`, and change only what's needed. Then run `build:web` and `test:web` (plus `test:server` if the API changes), review the diff, check visually with the Vite dev server against staging or mocks, and ask before any Production deploy.

## Known open items
- APK build `c93aa889` (commit 3c7eb14): the `sb_secret_` hit was checked on 2026-11-05. It is the 10-char supabase-js prefix literal used in a `startsWith` check. Its byte neighbourhood is identical to the earlier APK, whose Hermes string table shows it as a standalone entry. No other secret markers were found. The only Supabase host in it is Production.
- `gh` CLI is not installed.
- The mobile registration form still offers a "Driver" skill. It is harmless metadata now; remove it in the next approved APK build.
- Vehicle temperature, equipment, cargo volume and insurance dates are stored only in browser localStorage, not the database, so the server cannot enforce them. Food temperature needs are free text and shown to Admins as warnings.
