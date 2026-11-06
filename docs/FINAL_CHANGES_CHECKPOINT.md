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
