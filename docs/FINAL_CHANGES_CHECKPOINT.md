# Final changes checkpoint (2026-11-06)

Branch `integration/ngo-recovery`, local commit `b098d2f` on top of `4099681`. **Nothing pushed, no Production change since the 012+013 release, no EAS build.**

## Done in code (tested locally only)
| Change | Where |
| --- | --- |
| Distribution Center module | `014_*.sql`, `server/src/modules/distribution`, `apps/web/src/pages/DistributionCenters.tsx`, sidebar entry |
| Pickup destination dropdown, server-enforced | `pickups/service.ts` (`DISTRIBUTION_CENTER_REQUIRED/INVALID/INACTIVE`), `DistributionCenterSelect`, edit dialog |
| Profile photos (Donor/Volunteer/Driver) | `server/src/modules/profilePhotos` (private bucket `profile-photos`, created on first upload), `ProfilePhoto.tsx`, `useProfilePhotos`, `Avatar src` |
| GPS address, Food Ready removed, date→time, time-only deadline, +/− quantity | `LiveDonate.tsx`, `donationRules.ts` (rule documented in code) |
| Compact Food Donors table | `apps/web/src/pages/FoodDonor.tsx` |
| Volunteer registration | see root cause below; clearer messages in `LoginScreen.tsx` |

## Volunteer registration: confirmed root cause
`PUBLIC_VOLUNTEER_REGISTRATION_ENABLED` is **not set in the Production Vercel project** (checked with `vercel env ls production`). `POST /api/v1/volunteers/register` therefore answers `403 REGISTRATION_DISABLED` (reproduced with an empty body; this check runs before the rate limiter, so no attempt was consumed). The app had no message for that code and showed the generic text. The Donor-email theory is not the cause of the reported message (that case returns `409 VOLUNTEER_REGISTRATION_CONFLICT`). Separately: the limiter allows 1 attempt per email per 24 h and is consumed before the Auth invite, so a *later* failure still burns it.
**Manual action (needs approval):** add `PUBLIC_VOLUNTEER_REGISTRATION_ENABLED=true` to the Production environment, then redeploy.

## Database
- Production ledger: 001–013 (unchanged). **014 not applied to Production.**
- Staging (`tughgqggsndtraaymtvf`): 014 applied 2026-11-06, ledger 001–014, checksum `d65df3c4…fa7d`.

## Tests actually run
Server with Postgres 17 (all migrations): 460 passed, 1 todo (44 files). Mobile: 51 passed; typecheck and lint clean. Web: smoke + translation audit pass; web and server production builds succeed.

## Not done / not verified
- Hosted staging deploy (needs a push) and every hosted workflow in the request, including real Supabase Storage upload, signed-URL display, volunteer registration on staging and the end-to-end Donor/Admin journeys.
- On-device checks: GPS, native pickers, photo picker, restart persistence.
- Not built: DB integration test for center CRUD, upload/replace against real storage.
- Per-item quantity: item count uses the labelled −/+ selector; meals per item keep a typed field with −/+ (step 5). Weight stays typed.
- A new Android APK is **required** (new native modules `expo-location`, `expo-image-picker`).

## Update 2026-11-07 (after push of 0d6e1d0)
- Staging website `dpl_7WXo9CybWE3YdjLtUGy2EaHp48AH` READY on commit `0d6e1d0`; staging API READY (`/distribution-centers` and `/profile-photos/me` answer 401 without sign-in).
- New `server/test/distributionCenters.integration.test.ts` (PostgreSQL 17, migrations 001–014): 4 tests pass (unauthorized rejected, add/edit/archive, snapshot kept after edits, missing/unknown/archived centers blocked, legacy typed-address pickup readable).
- Photo SQL (replace and read previous path) verified against real Postgres. Storage calls still untested against real Supabase: needs a signed-in staging session.
- EAS `production` env (read-only check): API `https://ngo-eight-umber.vercel.app/api/v1`, Supabase `pyzyxgpcfwpcqyqrihuo`, only a publishable key; no secrets in the mobile source.
- Hosted workflow tests are waiting for a staging Admin sign-in (see the report).

## Hosted staging results (2026-11-07, staging website `dpl_7WXo9CybWE3YdjLtUGy2EaHp48AH`, Admin signed in by the user)
Passed on staging, verified in the browser and in the staging database:
- Distribution Center add, edit and archive (UI + DB). Edit changed the center but the existing pickup kept its original address; archived center no longer in the dropdown.
- Pickup & Logistics: dropdown lists active centers; scheduling stored `distribution_center_id` and the address snapshot; the pickup still showed its original address after the center was edited and archived.
- Pickup edit (notes, version 1) and cancel ("Delete"): pickup CANCELLED, food request stays SUBMITTED.
- Food & Donors compact table renders (initials avatar when no photo).
Not tested on staging: Volunteer approve/deny (no pending applications on staging), driver/vehicle/container assignment (no staging drivers or vessels; covered only by local PostgreSQL integration tests), real profile-photo upload (needs a signed-in session token; reading it was blocked), donor-app flows (need a new APK).
Synthetic staging records left in place: center `ZZ-TEST Indiranagar Centre` (archived), donor `ZZ-TEST Donor`, food request `ZZ-TEST Royal Hall`, one CANCELLED pickup.
