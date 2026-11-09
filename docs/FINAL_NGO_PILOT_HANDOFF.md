# Final NGO pilot handoff — 2026-11-09

## Session and release boundary

- Workspace: `C:\Users\desig\Projects\aaharaconnect-ngo-recovery`.
- Branch: `integration/ngo-recovery`; starting HEAD: `b7b321c`.
- Write probe succeeded; Git works in this session. Existing untracked `docs/STAGING_CHECKPOINT.md` belongs to earlier work and is preserved.
- No push, hosted deployment, hosted migration, merge, APK build or public artifact publication authorized or performed.
- Integration-maintainer and affected-module review required before merging shared contracts, auth, configuration, migrations and cross-module interfaces.

## Driver-only pickup implementation

- Shared assignment input accepts an empty explicit `volunteerIds` array. Driver stays required; vehicle is derived from the fixed driver link and existing vehicle/capacity/container/reservation checks remain.
- Wizard allows no Volunteers and explains driver-only dispatch; review names it explicitly.
- Driver ACCEPT advances a crew-free pending assignment to ACCEPTED, retaining independent driver acceptance. START also handles crew-free historical pending jobs; crew-assisted jobs retain their acceptance requirement.
- Mobile next-step helper supports a crew-free pending job after driver acceptance.
- Changed files: shared `contracts/pickups.ts`; pickup `service.ts`; web `AssignWizard.tsx`; mobile `api/driver.ts`; contract/mobile tests.
- Focused contract, pickup HTTP and mobile driver helper tests: 131 passed. Initial sandbox HTTP run hit loopback EACCES; the same suite passed with approved sandbox escalation. The final suite also covers the real PostgreSQL Driver-only journey; physical Android verification remains pending.

## GPS implementation checkpoint

- Replaced Volunteer-based uploads with DRIVER role, ACTIVE fixed Driver/vehicle and accepted nonterminal assignment checks. Added Module 3 read/lock port, explicit start/withdrawal, two-minute reading freshness, ordering/throttling, 12-hour consent expiry, latest-point retention and bounded expired-point deletion on upload.
- Added private ADMIN fleet read, polling vehicle selector and Leaflet/OpenStreetMap marker updates without map recreation. Coordinates, optional cached locality, speed/accuracy, sharing and timestamp-based Recent/Stale/Offline are implemented. Uploads bind to the server-issued session start and allow bounded clock skew.
- Added module-scope Expo TaskManager job, foreground service notification, foreground/background permission flow, 30/90-second pacing, freshest-only offline recovery, visible sharing/stop controls, and GPS gate before Driver START/Maps. Stops collection on logout, terminal duty detection and authorization loss.
- `DRIVER_TRACKING_REQUIRED=true` enables the server START gate; keep it off until staging + physical Android tests pass, then enable for the final release. Mobile already gates START/Maps.
- New native modules: SDK-compatible `expo-task-manager` and `expo-crypto` (SDK 57). A new approved APK build is needed. No build started.
- Initial hosted ledger reads were denied by the Supabase connector (`You do not have permission to perform this action`). Docker was subsequently available for isolated local tests. No hosted migrations executed.

## Outstanding work

The five requested code paths are implemented locally. Hosted ledgers/buckets, environment rollout, staging E2E/load tests, dependency-risk disposition, actual provider setup, HTTPS domain association, physical Android behavior and the final APK remain release blockers. Do not equate local/mock-provider test success with hosted or device verification.

## Integrated implementation checkpoint

- Added optional Driver accuracy/speed reports and optional locality cache (rounded to ~1 km; global DB geocoder throttle, one-day cache). Coordinate fallback always remains. `TRACKING_GEOCODING_ENABLED` stays off until NGO approves sharing approximate coordinates with Nominatim; contact User-Agent required.
- Added identity image selector/preview/remove and explicit processing/masked-Aadhaar acknowledgements; server decodes JPEG/PNG with Sharp, strips metadata, limits size/pixels, and stores only in a preconfigured private bucket. Admin previews expire in 120 seconds, manual review is audited, and a proposed DB trigger blocks unverified approval. Existing applications are grandfathered by migration; approved accounts are preserved.
- Added recoverable registration submissions with durable request hash, lease and stored Auth identity. Ambiguous invitation outcomes fail closed for maintainer reconciliation. New pending accounts can re-upload their own proof; donor/driver access is forbidden. Retention utility defaults to dry-run; actual deletion requires separate approval.
- Added four transaction-bound notification outbox hooks, preference API/profile controls, official Meta template adapter, singleton rate gate, bounded explicit-failure retries, HMAC webhook validation/deduplication and opt-out. Ambiguous sends become UNKNOWN, requiring reconciliation before resend. Sending and enqueueing default OFF.
- Added allowlisted object deep links, role-aware return after login and exact Driver/Volunteer job screens; Vercel HTTPS fallback and signing-certificate-dependent assetlinks endpoint. App Link association is not yet verified.
- Homepage removes public donor joining links, promotes Admin workflow and includes Android installation section. Stable download endpoint remains unavailable until an approved NGO-controlled Supabase APK URL, version, build ID and checksum are configured. No APK has been verified/published.
- Proposed SQL: `server/db/proposed/015_final_pilot.sql`, intentionally outside the runner pending hosted ledger verification and review. Number 015 is provisional, not an assertion of actual hosted state. New private identity/outbox tables, approval gate, GPS metadata and locality cache are additive. No existing migration edited.
- Local Docker Desktop started; a new isolated container `aaharaconnect-final-pilot-test-20261109` hosted throwaway `_test` databases. No existing container/database was edited. Baseline 001–014 and final proposed schema loaded on fresh local databases. The existing runner applied 15 ledger entries from temporary SQL copies, then accepted a second `up` and `status` run without reapplying DDL.

## Infrastructure evidence

Repository migration files 001–014 exist. Actual hosted ledgers/checksums, PR state, deployments, backups and bucket policies have not been reverified in this session. Earlier notes are historical evidence only. Production project link is `ngo`; never use it for staging deployment.

## Readiness

NO-GO: requested privacy/security workflows and release verification remain incomplete.

## Verified after integration

- Shared, server, mobile and web no-emit TypeScript checks passed before the latest test additions. Web production build passed (main bundle size warning remains).
- Web smoke and Kannada translation audit passed after replacing obsolete donor-CTA expectations with Admin-first/download-gate assertions. Desktop and narrow-layout homepage screenshots captured outside Git in the session visualization directory. Admin CTA opens the existing workspace; Vehicle Tracking still requires Admin authentication.
- Initial full regression run: 536 passed, 2 failed, 18 skipped, 1 todo; two suites also had fixture setup failures. Causes: legacy approved fixtures needed explicit grandfathering under the new SQL identity gate, and an env-example test assumed invocation from `server/`. These were corrected without relaxing approval or security assertions. Focused rerun: 32 passed.
- New feature tests: 7 PostgreSQL-backed identity/outbox tests passed with Storage/Meta mocked. Includes private proof persistence, duplicate submission, missing consent/proof, Admin-only preview, API+SQL approval gate, rejected-proof replacement, audit, dry-run/approved orphan cleanup, transaction rollback/deduplication and signed/replayed webhooks. No real messages or real identity documents used.
- Found and fixed the existing pending-Volunteer middleware blocking own proof replacement. Exception is only authenticated pending `PUT /volunteers/me/identity`; assignment and other operational access stay denied.
- Compatible dependency updates patched server Zod to 4.6.7, body-parser to 1.20.9 and shell-quote to 1.12.0. Remaining production-dependency audit: 20 findings (0 critical, 7 high, 10 moderate, 3 low), including Expo/router/tooling and transitive Zod 3. They require security disposition before release; no forced/major Expo upgrade was attempted.

## Final local evidence

| Check | Actual result |
| --- | --- |
| Combined server, PostgreSQL integration, mobile, web test files | **63 passed; 566 tests passed; 1 existing TODO; no skipped tests** in 23.88 seconds |
| Shared/server production build | Pass |
| Web production build | Pass; main bundle about 661 KB / 182 KB gzip, size warning retained |
| Mobile TypeScript + lint | Pass; no lint warnings |
| Web smoke + Kannada copy audit | Pass. Vite emitted a shutdown-time dependency-scan cancellation message after smoke success; command exit 0. |
| Five simultaneous local vehicle reports + 20 Admin polls | 25 measured successful requests; 5 vehicles; p50 **33 ms**, p95 **70 ms**, max **87 ms**. Local only, not hosted capacity proof. |
| Migration runner | Fresh local apply, second idempotent run and checksum status passed using temporary copies; source proposal not promoted/applied to hosted DBs |
| Android native introspection | Existing package/EAS identity preserved; coarse/fine/background location + foreground service/location permissions present; CAMERA and RECORD_AUDIO explicitly marked for removal |
| Web bundle credential-marker scan | No full `sb_secret_`-shaped credentials, DB URLs or private-key markers matched in built web assets; not a comprehensive secret audit and not an APK scan |
| Browser visual checks | Desktop/narrow homepage; Admin CTA opens existing workspace; Vehicle Tracking still displays Admin sign-in gate |
| Git diff whitespace | Pass |
| GitHub PR 26 read-only inspection | Open draft, unmerged; remote head `b7b321cca94b318e29e0ae8ced1e136db1ebfd3e` |

Reviewed SQL proposal SHA-256: `7FB9A46146C65DEF7C5332D61F0BB1AD1EAD51DC986D370A7D67ACF5032C47F2`. This supersedes the initial implementation checksum after the explicit GPS RLS/revoke hardening below. Version number 015 remains provisional until hosted ledger review.

Tests used loopback PostgreSQL and synthetic records. Supabase Auth/invitations/Storage and Meta sending were mocked where used. Physical GPS, image pickers, signed real Storage previews, real SMTP/WhatsApp delivery, App Link verification, Vercel runtime, backup restore and APK bytes were **not** verified. No actual final APK version/build/checksum is available.

Commands: `npm run build:shared`; `node node_modules/vitest/vitest.mjs run server apps/mobile/src apps/web/src --silent --reporter=dot`; `npm run build:server`; `npm run build:web`; `npm run check:mobile`; `npm run lint:mobile`; `npm run test:web`; SDK 57 `expo config --type introspect --json`; `git diff --check`. Database tests additionally required a dedicated loopback `_test` URL, matching `DATABASE_URL`, `ALLOW_TEST_DATABASE_MUTATION=true`, `DATABASE_SSL=false`; proposed-schema tests explicitly used `FINAL_PILOT_SCHEMA_TEST=true`. Never set these mutation flags for a hosted database.

Screenshot artifacts (outside Git):

- `C:/Users/desig/.codex/visualizations/2026/11/09/01a1beeb-a41f-7cc3-aa2c-2a934e99d407/homepage-desktop.jpg`
- `C:/Users/desig/.codex/visualizations/2026/11/09/01a1beeb-a41f-7cc3-aa2c-2a934e99d407/homepage-mobile.jpg`

## Handover documents

- `docs/NGO_PILOT_OPERATIONS.md`: beginner operator workflows, tracking/offline handling, notifications, installation, issue reporting and account ownership.
- `docs/FINAL_PILOT_RELEASE_RUNBOOK.md`: approval matrix; staging/Production plan; private bucket/policy and retention; Meta templates/secrets/webhooks; disabled bounded dispatcher; certificate/App Links/APK publication and replacement; backup and rollback gates.
- `docs/API_CONTRACTS.md`: final-pilot DTO/permission/transition proposal, error codes and rollout boundaries.

## Existing-system verification scope

| Area | Evidence / limit |
| --- | --- |
| Admin | Local web smoke, role gates and desktop/narrow homepage; hosted Admin workflow not repeated |
| Donor | Existing mobile/HTTP tests plus real local DB submission replay/ownership; phone GPS address, quantity UX and profile photo still need physical/hosted checks |
| Volunteer | Existing approval/availability/team tests; new real local SQL proof gate and audited re-upload; cloud invitation/picker behavior unverified |
| Driver / pickup / delivery | Real local DB Driver-only and assisted journeys, acceptance, history, reservations, isolation, decline and GPS guards |
| Vehicles / centres / containers | Existing integration regression passes; new five-vehicle synthetic tracking check; no real vehicle movements tested |
| Auth | Existing verification/authorization tests and real local server-owned roles; Supabase identity provider mocked for integration tests |
| Database | Fresh local PostgreSQL 17 + existing runner; hosted ledgers, Production-shaped staging and backup restore still unverified |
| Storage / email | Sharp image decoding tested; Storage and invitations mocked; real bucket policy, signed URL expiration and SMTP delivery require staging |
| Notifications | Real local outbox transactions/webhook deduplication with fake provider; no live delivery, billing or approved templates verified |
| Android / release | Native config inspected; no new APK built, signed artifact scanned, installed, upgraded or publicly published |

The remaining TODO is `server/src/test/volunteerEligibility.test.ts`: pre-existing coverage for excluding unapproved Volunteers. It was not removed or converted into a passing assertion. New required-proof approval is separately tested through service and SQL enforcement.

No live email, WhatsApp message, hosted data write, push, deployment, PR merge or EAS build was performed. All release switches remain disabled in examples. Actual environments were not changed. Local preservation commits are recorded in the final-review checkpoint below.

Cleanup completed: the session-created PostgreSQL container was stopped and removed (its `_test` databases were disposable), and the local Vite process was stopped. Existing containers and work were left alone. Temporary audit/native-config JSON files were removed from the worktree; screenshots remain outside Git. Recreate an isolated local test database before rerunning DB tests.

## Exact next action

Restore authorized read access to the two Supabase ledgers; review new code/SQL with affected owners; resolve dependency findings; finalize the actual migration number/checksum and NGO privacy policy. Then obtain explicit staging push/migration/deployment approval using the concrete release runbook. Complete hosted E2E/storage/provider checks before requesting the minimum staging APK build. Do not deploy to Production or enable the public APK download based on local results alone.

## Changed files for review

- `.github/workflows/whatsapp-dispatch.yml`
- `apps/mobile/.env.example`
- `apps/mobile/app.json`
- `apps/mobile/package.json`
- `apps/mobile/src/api/auth.ts`
- `apps/mobile/src/api/deepLinks.test.ts`
- `apps/mobile/src/api/deepLinks.ts`
- `apps/mobile/src/api/driver.test.ts`
- `apps/mobile/src/api/driver.ts`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/app/driver/job/[id].tsx`
- `apps/mobile/src/app/open/[kind]/[id].tsx`
- `apps/mobile/src/app/volunteer/assignment/[id].tsx`
- `apps/mobile/src/components/common/IdentityProofPicker.tsx`
- `apps/mobile/src/components/common/LoginScreen.test.tsx`
- `apps/mobile/src/components/common/LoginScreen.tsx`
- `apps/mobile/src/components/common/ReplaceIdentity.tsx`
- `apps/mobile/src/components/common/ResumeDeepLink.tsx`
- `apps/mobile/src/components/common/WhatsAppPreferences.tsx`
- `apps/mobile/src/components/donor/DonateFood.test.tsx`
- `apps/mobile/src/components/donor/LiveDonate.tsx`
- `apps/mobile/src/components/donor/LiveDonorProfile.tsx`
- `apps/mobile/src/components/driver/DriverJobs.tsx`
- `apps/mobile/src/components/driver/DriverProfile.tsx`
- `apps/mobile/src/components/tracking/driverTracking.ts`
- `apps/mobile/src/components/volunteer/LiveAssignments.tsx`
- `apps/mobile/src/components/volunteer/LiveProfileScreen.tsx`
- `apps/web/package.json`
- `apps/web/scripts/smoke-ui.mjs`
- `apps/web/src/Root.tsx`
- `apps/web/src/components/common/AndroidDownload.tsx`
- `apps/web/src/components/common/NotificationOutbox.tsx`
- `apps/web/src/components/volunteers/IdentityReview.tsx`
- `apps/web/src/components/volunteers/LiveVolunteers.tsx`
- `apps/web/src/features/pickups/AssignWizard.tsx`
- `apps/web/src/features/volunteers/api.ts`
- `apps/web/src/lib/i18n.ts`
- `apps/web/src/pages/AppLinkLanding.tsx`
- `apps/web/src/pages/Landing.tsx`
- `apps/web/src/pages/Settings.tsx`
- `apps/web/src/pages/VehicleTracking.tsx`
- `docs/API_CONTRACTS.md`
- `docs/FINAL_NGO_PILOT_HANDOFF.md`
- `docs/FINAL_PILOT_RELEASE_RUNBOOK.md`
- `docs/NGO_PILOT_OPERATIONS.md`
- `package-lock.json`
- `packages/shared/src/contracts/food.ts`
- `packages/shared/src/contracts/pickups.ts`
- `packages/shared/src/contracts/tracking.ts`
- `packages/shared/src/contracts/volunteers.ts`
- `packages/shared/src/index.ts`
- `server/.env.example`
- `server/db/proposed/015_final_pilot.sql`
- `server/package.json`
- `server/src/app.ts`
- `server/src/db/pruneIdentity.ts`
- `server/src/middleware/authenticate.ts`
- `server/src/modules/food/service.ts`
- `server/src/modules/notifications/routes.ts`
- `server/src/modules/notifications/service.ts`
- `server/src/modules/pickups/service.ts`
- `server/src/modules/pickups/trackingPort.ts`
- `server/src/modules/releases/routes.ts`
- `server/src/modules/tracking/geocoding.ts`
- `server/src/modules/tracking/routes.ts`
- `server/src/modules/tracking/service.ts`
- `server/src/modules/vehicles/service.ts`
- `server/src/modules/volunteers/identity.ts`
- `server/src/modules/volunteers/identityMaintenance.ts`
- `server/src/modules/volunteers/routes.ts`
- `server/src/modules/volunteers/service.ts`
- `server/src/routes/index.ts`
- `server/src/test/contracts.test.ts`
- `server/src/test/envExamples.test.ts`
- `server/src/test/finalPilot.test.ts`
- `server/src/test/trackingTerminalAssignments.test.ts`
- `server/test/driverApp.integration.test.ts`
- `server/test/employeeDriversAndPickupAdmin.integration.test.ts`
- `server/test/finalPilot.integration.test.ts`
- `server/test/legacyVolunteerApplication.ts`
- `server/test/volunteerAdminWrites.integration.test.ts`
- `vercel.json`

## Final local review and release-preparation checkpoint — 2026-11-09

Implementation commit: `4cc7430f8b4c0af6634a13df8966fc9d61246926` (`feat: implement secure NGO pilot workflows and review hardening`). A subsequent documentation commit records this evidence; obtain its hash with `git log -- docs/FINAL_NGO_PILOT_HANDOFF.md`. Both are local only. Starting history and the pre-existing checkpoint are preserved; no push/reset/merge/deployment occurred.

**Local review: PASS for a controlled staging candidate after the fixes below. Pilot: NO-GO.** Hosted storage/database authorization and physical Android behavior are still unverified; dependency residuals require the documented remediation/risk decision. This is not a security clearance for Production.

Reviewed uncommitted code, proposed DDL, API role gates, middleware, private proof storage, GPS and notifications/release gates. Genuine blockers fixed:

- Identity replacement: post-commit superseded-object cleanup failure no longer removes the newly committed proof. Failed DB transactions still remove only uncommitted uploads; orphan manifest supports later approved cleanup.
- GPS START now binds consent to the exact current assignment, preventing consent reuse after reject/reassignment; accepts the same bounded 30-second device clock tolerance as reporting.
- Proposed migration explicitly enables RLS and revokes public/anon/authenticated access on the existing GPS point/consent tables as well as new private tables. Local test starts from broad synthetic grants and proves they are removed. Hosted service role/Storage policy review remains mandatory.
- Native external link hook bounds/rejects percent-encoded, control and oversized inputs before SDK57 standalone routing, mitigating the known decoder DoS chain. Dependency remains vulnerable; Expo Go/Web and real OS dispatch are not verified. App Link host now follows the verified EAS preview/Production web origin, preserving package/native permissions.
- Release URL approval rejects embedded password credentials too. A configured approved public download is an unauthenticated 302 to the allowlisted immutable Supabase artifact; no verified bytes have been published.
- Compatible source-map-js/node-forge/qs updates reduce remaining omit-dev findings to 17 (zero critical). Including-dev audit exposes two Critical test-tool packages; each original and additional finding has severity/exploitability/remediation in the release runbook. No incompatible decoder override, forced SDK or test-runner major upgrade.

Additional review files: `apps/mobile/app.config.ts`, `apps/mobile/src/app/+native-intent.tsx`, `apps/mobile/src/api/systemLinks.ts`, `apps/mobile/src/api/systemLinks.test.ts`, `server/src/test/finalReview.test.ts`; other fixes are within the changed-file list above.

Authorization findings: proof preview/review requires verified server ADMIN; own replacement verifies pending ownership; public bucket fails closed. GPS consent/report requires verified DRIVER with active canonical Driver/fixed vehicle/accepted current duty, fresh consent and ordered readings; fleet read is ADMIN-only/no-store. SQL tests prohibit direct anon/authenticated identity/GPS reads. Actual Storage URLs/policies require hosted negative tests. WhatsApp dispatcher returns disabled before DB/provider access when sending is false or configuration is incomplete; workflow variable is opt-in, with no credentials/flags enabled here. API approval gate/additive legacy defaults preserve existing approved accounts; no role, canonical registry or historical assignment rewrite. Existing grandfathered pending applications retain the documented policy. Pause public registration during schema/API rollout.

Actual new verification: **7 focused files, 51 tests passed**, including isolated PostgreSQL17 privacy grants, five Driver vehicles/reassignment/skew, mocked private Storage/Meta and release without Auth. Fresh local baseline 001–014 plus reviewed proposal applied. Server TypeScript, mobile TypeScript/lint, native manifest introspection and `git diff --check` passed. Full 566-test suite was **not rerun**. Focused files: `server/src/test/finalReview.test.ts`, `server/src/test/finalPilot.test.ts`, `server/test/finalPilot.integration.test.ts`, `server/test/driverApp.integration.test.ts`, `apps/mobile/src/api/systemLinks.test.ts`, `apps/mobile/src/api/deepLinks.test.ts`, `apps/mobile/src/api/driver.test.ts`. The full-suite result above remains historical integration evidence.

Infrastructure: read-only Vercel project/env/deployment and EAS environment checks completed; exact IDs/targets/limits are in the runbook. Staging Supabase query denied again (`MCP error -32600`), no Production database queried. Intended staging ref `tughgqggsndtraaymtvf` is confirmed in EAS Auth config; actual server DB connection, ledger and private bucket/policies remain unconfirmed. Stable staging web alias points to an older Nov3 deployment. Separate staging API is ready but lacks `SUPABASE_SECRET_KEY` metadata. These block staging execution; no settings were changed.

Next: restore authorized staging read/owner confirmation → resolve DB/bucket/secret and dependency dispositions → integration review → explicit staging push/migration/private-storage/env/deployment approval → hosted synthetic checks → explicit single `preview` EAS APK approval → physical phone/security checks. Meta setup/live sending, public APK publication and all Production operations each remain separately gated. Exact manual provider/templates/webhook, optional geocoder, APK and Android association steps are in the runbook. No subscriptions created and no live message sent.

Final-review cleanup: only the disposable `aaharaconnect-final-review-20261109` PostgreSQL17 container was created for this review. At cleanup its inspection failed because `//./pipe/dockerDesktopLinuxEngine` was unavailable (`The system cannot find the file specified`). No restart or repeated Docker attempts were made; removal cannot be confirmed. Once Docker is available, inspect that exact container and, if still present with the expected postgres:17 image/127.0.0.1:55439 binding and disposable test databases, stop it with `docker stop aaharaconnect-final-review-20261109` (created with `--rm`). Do not stop other containers. Existing `docs/STAGING_CHECKPOINT.md` was excluded from commits and remains byte-identical (SHA-256 `CB300B9532670548A5D6A289702CFB0233DEC0870D791A93F3E45736C1A7EB82`). Workflow YAML parsed successfully using the mobile workspace's installed parser; the initial root-parser lookup failed because that dependency is not root-hoisted. No repository dependency was added for the check. The final App Link configuration test rerun passed all five tests after the TypeScript fallback adjustment.
