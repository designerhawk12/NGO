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

Current finalized migration: `server/db/migrations/015_final_pilot.sql`, SHA-256 `28D70F15FC4E45E18F85130FBB76ABDBC0A2A1D881A8AEB2FCA9F1C8AB0788E1`. This supersedes the proposal checksums. Staging runner applied only pending015 after verified recovery/isolation gates; all15 ledger entries/checksums passed. Earlier proposal/unapplied statements below are historical checkpoints.

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

## Interrupted staging recovery — 2026-11-09

This section supersedes earlier environment assumptions; prior checkpoints are retained. The accessible Codex chat contains the implementation and local-review sessions, but no intervening successful final staging release. Local branch remains `integration/ngo-recovery`. Preserved commits are `4cc7430` and `92728dc`; read-only remote `ls-remote` and PR26 metadata confirm the remote integration head is still `b7b321cca94b318e29e0ae8ced1e136db1ebfd3e`. PR26 remains open/draft/unmerged. No duplicate deployments were started.

### Recovered actual staging state

| Resource/check | Current result |
| --- | --- |
| Web stable alias | `aaharaconnect-ngo-staging.vercel.app` → READY `dpl_245LXpXkK6GmeLw18cgAq6wAuGeB`, verified project `prj_W1MrwAqFsWTFohHs6UXR2fo1EEIL`, commit `eb966632b58c2ac3f9a2aee6e8f43351b6c29a46`. Root/API GETs redirect to **vercel.com login**. The resulting HTML200 is not public homepage/API success. Earlier public-root assumption is superseded. Deployment Protection was not changed. |
| API stable alias | `aaharaconnect-ngo-staging-api.vercel.app` → READY `dpl_bHe4YQABt5BUT6rJPxt5kjm7ScPW`, verified project `prj_Nd3YLsJkOYjlZMPLmFZw9MFG88Ul`, commit `0d6e1d0ebdaf01ec2e7136c4b7376fa538e32224`. Correct separate staging project; latest implementation not deployed. |
| Hosted negative probes | Staging API `/api/v1/health/ready` →200 JSON ready; `/me`, `/assignments/driver`, `/vehicles/tracking` →401 UNAUTHENTICATED; `/releases/android` and `/releases/android/download` →404 NOT_FOUND. These validate only the old deployment's readiness/negative auth, not the final features or download gate. No synthetic hosted writes/authenticated journeys occurred. |
| API env metadata | Missing `SUPABASE_SECRET_KEY` remains confirmed. No new final-feature flags or provider secrets appeared. Web staging lists a hidden secret but its value was not retrieved/transferred; its correct staging provenance cannot be assumed. |
| EAS preview | API/Auth/web URLs again verified as staging. Four EXPO_PUBLIC variables listed; key contents withheld by CLI, so actual key type cannot be certified from this check. No build or native change made. |
| Supabase within Codex | Read-only ledger/bucket SQL and project-details calls still return `MCP error -32600: You do not have permission to perform this action`. User explicitly approved changing only Supabase plugin to **Allow read actions** (`ask_before_writes`); setting update succeeded, but subsequent reads still denied. No further retries or alternate credential/database route used. Codex access remains unconfirmed. |
| Independently reported by user | ChatGPT read-only access confirms intended staging project ACTIVE_HEALTHY, custom ledger001–014, readable application schema, **no Storage buckets**, RLS warnings, and sampled anon/authenticated schema access denied. This is user-supplied evidence, not a Codex ledger/checksum/policy verification. Do not apply DDL or create a bucket until Codex's own access is confirmed and ledger checksums are compared. |

### Safe work completed and security follow-up

- Added branch-specific `git.deploymentEnabled["integration/ngo-recovery"]=false` to `vercel.json`, validated JSON and its shape against the published Vercel schema. It prevents Git-triggered deployments for this branch across linked projects; explicit reviewed staging CLI deployments remain the intended path. Other branches and provider settings are unchanged. This avoids a push launching an unwanted Preview in repository-linked Production project `ngo`.
- The combined local commit/push command was rejected **before process creation** by automatic approval review: it considered the push an external shared-repository mutation conflicting with retained user restrictions. Subsequent Git check confirms no commit/push executed; HEAD stayed92728dc and the guard remained an unstaged worktree edit. No workaround was attempted. Explicit renewed push approval requested; saving a local checkpoint is independent of pushing.
- `npm explain tinypool` confirms tinypool1.1.1 only through server devDependency Vitest3.2.7. No application/phone import path identified; Vercel install includes dev tools for compilation, but the test runner is not a request handler or an Android runtime dependency. Registry lists3.2.7 as latest Vitest3. Patched tinypool2.1.2 is outside Vitest3's ^1.1.1 contract: no safe same-range upgrade identified, no forced major override applied. Critical prototype-pollution/RCE prerequisites and untrusted test-runner restrictions remain in the runbook. The build/test supply-chain risk remains; absence from runtime does not resolve the advisories.
- Tracked text scan found no literal long `sb_secret_` credentials, service-role JWTs or private-key headers. Prefix mentions occur only in CLAUDE.md and handoff/release guidance and were inspected as documentation text. Three existing local built-web JS files had no secret-prefix/DB-URL/private-key markers. This was not a fresh hosted bundle or APK scan and cannot certify secret absence in a future artifact. No credential values printed or committed.
- No full regression rerun: only Vercel configuration JSON/schema assertions and the read-only hosted probes above were needed for the new guard; implementation files and native code were not changed in this recovery. Historical566/51 counts remain historical.

### Remaining execution gates

Restore/reconnect the Supabase connection **for Codex**, reload its tools, then confirm this exact staging project and compare immutable001–014 checksums. Only then promote the reviewed next migration (015 provisional), prepare the private bucket/policies, configure the missing staging service credential securely, and deploy to the two verified staging project IDs. The original staging-only authorization covers those operations after access/target verification; Production, live WhatsApp, APK publication and EAS build remain forbidden. Separate renewed approval is pending for the push rejected by automatic review. Do not reapply the migration based only on a stale or independently reported ledger.

Before public staging App Link/download tests, resolve staging-web Deployment Protection through a reviewed project-specific arrangement; do not count a login redirect as an association response or disable protection globally. No hosted five-feature test, approved artifact publication, new Android build or phone verification has occurred. Exact eventual preview command remains `eas build --platform android --profile preview` from `apps/mobile`; **do not run** until hosted gates pass and explicit build-credit approval arrives. Physical checklist remains in the runbook. Final staging verdict: **PARTIAL**; Pilot NO-GO.

### Confirmed integration push after renewed approval — 2026-11-09

The user explicitly approved the integration-branch push and confirmed reconnection in Codex. The previously rejected combined command had made no Git changes; local recovery/guard was saved separately as `9b6b48ee7d7f313ff32a38b5976495099f8a7253`. A newly approved, push-only command succeeded: remote `integration/ngo-recovery` advanced `b7b321c..9b6b48e`, including implementation `4cc7430`, documentation `92728dc`, and the branch-specific Vercel automatic-deployment guard. No force-push, PR merge or explicit deployment occurred. This supersedes earlier unpushed/pending-push statements.

After the user's reconnection confirmation, Codex project-details read for **staging `tughgqggsndtraaymtvf`** still returned `MCP error -32600: You do not have permission to perform this action`. No further SQL retry or alternate credentials were used. Codex staging access therefore remains unconfirmed; migration, bucket/policy changes and staging deployment remain blocked by the user's access gate. No hosted synthetic writes, real WhatsApp, EAS build, APK publication or Production operation occurred. Next prerequisite is fixing this Codex connection's authorization; push permission is no longer the blocker. Build approval remains deferred until hosted verification passes.

### Continued independent Android configuration review — 2026-11-09

On the user's continuation, the staging project-details read remained denied with the same -32600 permission error; no SQL, Storage or deployment mutation was attempted. Independently inspected the **EAS preview** environment with sensitive values captured only in memory and sanitized before output: `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is an actual **`sb_publishable_` key**, not a server secret or masked value. API, Auth project and web origin all remain the exact staging URLs listed above. This supersedes the earlier unverified-key-type limitation. No key bytes were logged or saved; no EAS build started. It confirms configured key type, not key functionality or the contents of an unbuilt APK. No source implementation changed and no tests were rerun. The outstanding prerequisite remains repairing Codex connector authorization; repeated reconnection alone has not resolved it. Local checkpoint824e4ce records the prior confirmed integration push; this continuation preserves the independent configuration finding for the next session.

## Execution recovery checkpoint — 2026-11-09, implementation6ac84fc

Latest user authorizes staging repair/deployment and one preview APK only after isolation/recovery/security gates pass. They subsequently **declined creation/restoration of a backup**; that decision controls recovery operations. No remote write, deployment or build has occurred. Earlier Codex connector-denial statements are historical: the new Supabase MCP is functional and staging ledger001–014 names/checksums and actual schema were verified read-only.

### Newly completed

- Used the exact user-supplied private file `C:/Users/desig/AppData/Local/AahaaraConnect-Staging/staging.env`. Its DB endpoint and pooler username explicitly identify staging `tughgqggsndtraaymtvf`. A real TLS-verified read using that file returned database/user/session_user `postgres`, schema usage/create true, bypassRLS true, ledger count14. This establishes the supplied migration connection, not the opaque deployed Vercel connection.
- User added a server secret to that private file. Read-only staging `/storage/v1/bucket` and `/auth/v1/admin/users` returned200; bucket inventory remains empty. Secret bytes and user records were neither printed nor committed. User confirms **SMTP unavailable**; no email was sent.
- Existing old-checkout credentials identified Production and were not used for a connection. No Production API/database was contacted.
- Docker engine was started. Created only `aahara-recovery-final-20261109`, PostgreSQL17 on `127.0.0.1:55440`, with synthetic `_test` databases. Baseline001–014 ran through the established runner; full proposed015 applied locally, including a second fresh-schema validation. No staging snapshot was created or restored; the local `aahara_restore` database is empty and was created with the container before backup refusal.
- Proposal015 now creates `aaharaconnect_api`, a **NOLOGIN** permission group with no administrative attributes or BYPASSRLS. Finite application-table grants exclude the migration ledger and schema creation; audit histories do not receive UPDATE/DELETE; DELETE is limited to existing API cleanup/resource operations. Policies explicitly target this trusted Express group on protected tables. No membership or policy is granted to public Auth client roles. A separate securely provisioned runtime LOGIN with INHERIT must receive this group before Vercel cutover; the migration login remains separate. Actual hosted `postgres` has CREATEROLE, so role provisioning is technically available after the gate. No remote runtime role exists yet.
- Private-photo bug fixed: an existing public bucket is rejected on upload, privacy is rechecked, creation races are verified, and signed previews are withheld if bucket privacy is unknown/public. Added3 regression tests. Existing photo formats, routes and one-hour preview lifetime remain.

Implementation commit: `6ac84fc104a9a8c1af7aaca86a7595a3146edeb8`. Changed files: proposed015, profilePhotos/service.ts, new profilePhotoPrivacy.test.ts and runtimePermissions.integration.test.ts. No unrelated interface redesign or feature rewrite.

### Actual verification this execution

| Check | Result |
| --- | --- |
| Mobile lint, mobile TypeScript, shared/server build, web TypeScript/build | PASS; web retains main-bundle size warning |
| Integrated suite before the new permission/photo repairs | **65 files passed, 578 tests passed, 1 existing TODO**,25.09s, local synthetic PostgreSQL + mocked Auth/Storage/Meta |
| Fresh revised015 + runtime/identity/Driver/private-photo suite | **4 files,25 tests passed**; actual PostgreSQL RLS and denied ledger/DDL/TRUNCATE/audit modification tested |
| Focused mock/mobile/API suite |48 passed +1 sandbox loopback EACCES; rerunning the affected file with loopback permission passed all6 tests (no application assertion failure) |
| Server typecheck after photo fix | PASS |
| Web smoke and Kannada translation audit | PASS, command exit0; existing Vite shutdown build-cancel message remains |
| Fresh built web credential-marker scan |3 JS assets scanned; no literal long server-secret/DB-URL/private-key candidates; not an APK or comprehensive secret audit |
| Git whitespace | PASS |

The initial synthetic database setup used CREATE DATABASE in a multi-statement batch, which PostgreSQL rejected; issuing database creation separately corrected the local harness. No hosted operation was involved. Tests are not evidence of hosted Storage, SMTP, Auth delivery, background GPS or phone success.

### Gates still closed

The supported Vercel decrypted read still returns opaque values for both designated staging projects. Therefore do not infer that deployed hosting matches the supplied private file. After recovery readiness is established, use a verified staging-only replacement procedure: separate restricted runtime DB credential, verified CA, staging Supabase URL/public key/server secret, staging CORS and exact `/accept-invite` redirect, with correct target assignments. Keep the branch no-auto-deploy guard and explicitly select the two reviewed staging project IDs.

Automatic approval review rejected the proposed private app-schema dump/local restore command before process creation because it retained the earlier prohibition. The user was asked explicitly and chose **Do not create or restore the backup**. No backup exists from this task and restore readiness is not proven. Existing Dashboard backup inventory/recovery evidence and Auth URL Configuration are the only pending manual evidence request; do not repeat credential requests or attempt browser automation (its URL-safety verification is unavailable). Keep every affected staging mutation blocked until an acceptable existing recovery checkpoint is established. The private app-only recovery proposal would not have included Auth or Storage bytes even if approved; never describe it as a full-project backup.

Next safe execution after evidence: approve the current015 checksum/runtime permission plan → promote015 into the existing migration stream → provision separate restricted runtime login securely → apply once with the verified migration connection → replace only staging hosting variables → configure private photo/identity buckets → deploy both staging targets → hosted synthetic positive/negative/security journeys → one preview APK only after hosted/security pass. Sending, deletion, geocoding and public APK publication remain off. SMTP delivery and physical Android verification remain incomplete, not passed. No live WhatsApp/external notification sent and no paid service enabled.

## Recovery gates closed and staging rollout started — 2026-11-09

The user corrected earlier backup claims: Free plan, no managed backups/PITR/retention. They explicitly authorized a fresh local logical backup and isolated restoration, superseding their earlier refusal, and subsequently approved the exact015/runtime/hosting rollout. Auth Site URL and exact `/accept-invite` and `/reset-password` redirects are user-verified staging URLs. SMTP remains unavailable.

- Backup: `C:/Users/desig/AppData/Local/AahaaraConnect-Staging/recovery-2026-11-09T12-15-26-115Z/staging-logical-before-015.dump`, completed `2026-11-09T12:16:03.484Z` (17:46:03 IST),350767 bytes, SHA256 `86ce1f2c738188ca493281a12556ddd66bc8c8cd0a2d2af2b421a518ec245234`. Private manifest records scope/validation. Covers app/Auth/Storage metadata/public/extensions logical objects/data and migration ledger; excludes unrelated managed-service schemas, ownership/ACL, actual Storage bytes and Auth service settings. At snapshot Storage had zero buckets/objects; Auth service settings are recorded separately from user evidence. No managed retention is implied; preserve this local checkpoint under NGO-controlled restricted access.
- Full unfiltered dump first failed with SSL EOF and was not marked valid. Scoped relevant-schema dump passed. Its checksum and569 archive entries were verified. Restoration to network-none local container `aahara-staging-restore-20261109`, database `aahara_restore_verified_v2`, passed. Required installed extensions were bootstrapped; only duplicate public/extensions schema creation entries were skipped. First rehearsal stopped on duplicate public schema; no existing database was reset. All69 backed-up table counts match staging; all14 ledger/checksums match; zero unvalidated app constraints or disabled app triggers. Backup bytes/password hashes never entered Git or tool output.
- Migration015 rehearsed on the restored staging copy, preserving every old application with identity_required=false and new default=true. Finalized as `server/db/migrations/015_final_pilot.sql` (proposal moved, applied001–014 unchanged). **Approved/current SHA256 `28D70F15FC4E45E18F85130FBB76ABDBC0A2A1D881A8AEB2FCA9F1C8AB0788E1`.** Existing runner status/up/status succeeded against staging; only015 was pending/applied; all15 entries verified.
- Created staging-only `aaharaconnect_runtime` LOGIN with no ownership/admin attributes/BYPASSRLS and membership in the finite `aaharaconnect_api` group. Password was generated privately and a SCRAM verifier supplied; private runtime URL remains outside Git in `staging-runtime.env`. Actual pooler/TLS connection resolves to this login, can access the protected application tables, and cannot create app tables, read ledger or bypass RLS. Migration credential remains separate. No public Auth role gained membership.
- Created/verified only private `profile-photos` (614400 bytes,JPEG/PNG/WebP) and `volunteer-identity-private` (2097152 bytes,JPEG). No public policies or mobile-releases bucket created. Real hosted upload/security cases remain to be run.
- After explicit renewed approval, replaced22 configuration values in the exact staging web Preview/Production targets and staging-api Production target using the verified runtime connection, CA, staging public/server keys and URLs. Opaque previous values were not reused. Private `hosting-isolation-receipt.json` records names/targets only. Broad initial configuration command was auto-review rejected before execution due to an unprovisioned role; explicit approval and role provisioning resolved that risk. Bulk API request then failed without changes; supported single-variable upserts preserving sensitivity/target assignments succeeded. Registration/sending/Admin opt-in/deletion/geocoding/APK publication/tracking START enforcement remain off; identity requirement/idempotency/outbox are on after schema readiness.
- Existing EAS preview signing identity was read, not modified: package `com.rajashishpatil10.aaharaconnect`, certificate SHA256 `A9:E0:71:14:66:DD:CE:D4:91:BA:3B:9B:B4:88:75:60:46:84:53:1F:25:0D:D4:85:58:15:B8:FE:3D:81:55:3E`. This public fingerprint was configured on both staging projects for assetlinks. No keystore/password downloaded, rotated or generated; credentials menu exited without a change.

Final predeployment regression: **67 files,584 tests passed,1 existing TODO**,24.78s on a fresh synthetic database prepared by the canonical001–015 runner. Next: release commit → explicitly linked staging-only deployments → verified stable aliases/new code → staging-only public-alias access arrangement → hosted synthetic API/Auth/private-document/photo/Driver/GPS/outbox tests. Do not call the old opaque deployments as proof of the new settings. No Production project/data was accessed. No new APK or live notification has been sent yet.

## Manual acceptance follow-up — 2026-11-10

See `STAGING_ACCEPTANCE_FIXES.md` for the prioritized registration/photo/map repair. Registration remains deliberately disabled on both deployed staging hosts pending verified email delivery; no flag, SMTP setting or secret changed. Photo normalization uses the SDK57 native JPEG encoder with a600KB output cap; map focus is17 on first fix/selection, not every refresh.169 distinct focused local tests and affected builds/lint/smoke pass. Hosted synthetic photos pass upload/preview/replacement/persistence/private denial for all three roles. Replacement APK/staging-web release details and physical limitations are maintained in that report. Production, existing accounts/migrations, real WhatsApp and public APK distribution remain untouched.

## Staging login follow-up — 2026-11-09

See `STAGING_LOGIN_REPAIR.md` for exact affected-account findings, regression and staging-only repair evidence. `admin_test@gmail.com` is absent from staging Auth; no Admin was created/reset to match it. Existing current credentials pass Auth and `/me`. A separate demonstrated legacy Donor portal bug hard-coded another Auth project; the repair uses Vite environment configuration and isolates cached tokens/service-worker traffic. Production and existing database/account data remain untouched. Discover the repair source commit with `git log -- apps/web/donor/index.html`.

Final login release: source `da427c8`, staging-web deployment `dpl_GJH2P83961Fa9TNwWA3vRGq231o4`, READY on the stable staging alias. Ten existing accounts passed Auth and both `/me` hosts; browser Admin and repaired Donor sign-in passed. Final Donor HTML matches the tested build exactly; final fresh Donor role/Auth-UUID checks pass both hosts. Fourteen focused Auth/recovery tests, full-page Donor mock regression, web smoke/Kannada audit and shared/web build pass. Original missing account and orphan Donor remain unresolved/preserved, not silently provisioned. Separate staging API project, database and Android artifact unchanged. See the repair report for bounded logs, deployment history and eventual data-preserving Production strategy.

## Final recovery checkpoint — 2026-11-09

This section supersedes historical pending-build, backup-refusal and browser-unavailable statements below. Hosted source remains `f3e98ee6a44dccdccfc97692b9aa6b3f78d3d63e`; Android source is `c6eea2311e3692971e30bde5943b6d38966e982b` (subsequent harness/docs only, same application code). Discover this final evidence commit with `git log -1 -- docs/FINAL_NGO_PILOT_HANDOFF.md`.

- Preserved completed verification: 584 local tests passed, 1 existing TODO; 130/130 primary hosted checks and supplemental five-concurrent-vehicle/security checks passed. Natural retention expired all five coordinates; baseline existing approvals/roles/relationships remained unchanged. No migrations, deployments, builds or full test suites were repeated during final checkpoint recovery.
- Exactly one preview build FINISHED: `69224e2c-8e03-4ca0-836e-90108f6061b6`, completed `2026-11-09T13:47:11.594Z`, version 1.0.0/code 7. An initial CLI decoding error occurred after submission; the existing build was recovered, not resubmitted. [Existing EAS build](https://expo.dev/accounts/rajashishpatil10/projects/aaharaconnect-mobile/builds/69224e2c-8e03-4ca0-836e-90108f6061b6). Internal artifact URL is supplied privately to the user, not published on the homepage.
- APK `C:/Users/desig/AppData/Local/AahaaraConnect-Staging/aaharaconnect-staging-69224e2c.apk`: 100541463 bytes; SHA256 `10985ef371d41995c837db90cfe6682f7555019a316af672ddab942b4eaa8bb8`. Official Google apksig verification passed with zero errors/warnings and the existing signing fingerprint. Actual manifest confirms package, staging HTTPS links, coarse/fine/background location and foreground location service; camera/microphone absent. Actual Hermes bundle staging references and known-credential scan passed. SDK secret-prefix literal and numeric alphabet substring hits were inspected at string boundaries; no embedded credential entries were found. This is artifact inspection, not physical-device success.
- Saved `scripts/inspect-android-artifact.py` and the previously executed `--prepare-phone` harness mode. Private `hosted-pilot-fixture.json` retains strong synthetic account credentials and `phoneFixtures`; synthetic PNG is outside Git. Both scripts passed syntax validation during recovery; previously completed APK inspection was not repeated unnecessarily.
- Rotated all four legacy staging test passwords: Admin, approved Volunteer, invited Volunteer and denied Volunteer. Each new login verified, old password rejected, refresh sessions globally revoked. New random passwords and receipts remain only in private `staging.env` / `legacy-password-rotation.json`. Existing access JWTs may remain valid until expiry. No account roles, confirmation state or Production credentials changed. New hosted synthetic credentials were already strong and remain usable for phone tests.
- Supported URL-verifiable in-app browser now works. Visually checked public homepage/Admin CTA/disabled download, real synthetic Admin sign-in, dashboard, rendered OpenStreetMap fleet selector and selected synthetic Driver's explicit OFFLINE/no-retained-position display, and authorized pickup list. Screenshot: `docs/evidence/staging-fleet-offline.png`. This does not verify fresh physical GPS or all interactive identity/dispatch journeys.
- Final Git scope: two verification scripts, these handoff/runbook/operator documents and synthetic-only visual evidence. Pre-existing untracked `docs/STAGING_CHECKPOINT.md` is preserved unchanged and excluded from commits (SHA256 `CB300B9532670548A5D6A289702CFB0233DEC0870D791A93F3E45736C1A7EB82`). No private environment, backup, fixture credentials or APK is committed.

Additional visual evidence: authorized Assignments tab loaded five accepted synthetic jobs, each explicitly showing Driver accepted and zero Volunteers; saved `docs/evidence/staging-driver-only-assignments.png`. The browser test tab was closed afterwards. No dispatch/status mutation was performed.

Remaining gates: physical Android install/upgrade, GPS consent/background while Maps open/offline/stop, picker and authenticated cold/warm links; SMTP invitation/reset delivery remains UNVERIFIED (SMTP unavailable; no mail test sent). Public onboarding, live WhatsApp, deletion, reverse geocoding, public APK publication and mandatory tracking-start enforcement remain off. Official Meta templates/consent/secrets/webhook verification and any geocoder configuration are external setup, not silently enabled. Five-vehicle backend success is not five-phone certification. Use the exact physical checklist in `NGO_PILOT_OPERATIONS.md`; record device/Android version and outcomes before Pilot GO. Production remains untouched.

## Hosted staging verification — release f3e98ee

- Both projects deployed from isolated `git archive` copies of `f3e98ee6a44dccdccfc97692b9aa6b3f78d3d63e`, using explicit staging-only links; repository `.vercel/project.json` was not used/modified. Web deployment `dpl_FzZ2xfFFhh2CU6AaSywj1rLdPw15`; API deployment `dpl_DT23yU11sZJSEiLGryxhuZbS8kLz`. Stable aliases are `https://aaharaconnect-ngo-staging.vercel.app` and `https://aaharaconnect-ngo-staging-api.vercel.app`; both now answer readiness200, signed-out /me401, release metadata200 available=false, public assetlinks200 with the existing signing fingerprint. Deployment URLs/Previews remain protected.
- The exact web-protection change was auto-review rejected before execution, then explicitly approved by the user and applied: staging web `all` → `prod_deployment_urls_and_all_previews`, matching staging API. Only stable staging alias became public; application authorization remains enforced. No live hosting project was accessed or changed.
- New `scripts/verify-staging-pilot.cjs` is an explicitly gated, exact-target synthetic-only harness. It stores account credentials/tokens and fixture checkpoints privately outside Git in `hosted-pilot-fixture.json`, never in logs/source. Real Supabase Auth admin creates confirmed synthetic accounts without sending invitations; real public-key sign-in, deployed API and private Storage are exercised. Synthetic accounts/data are retained for phone verification; no existing people or historical records were removed.
- Primary run: **130/130 checks passed**. Includes Admin login/roster/resources, donor submission and replay deduplication, cross-donor isolation, private identity submission/ownership/preview/reject/re-upload/verify/approve, pending restrictions, private owner photo, Distribution Center integration, five canonical Driver/vehicle jobs, Driver-only and assisted acceptance/START/ARRIVE/COLLECT/DELIVER, wrong Driver denial, GPS consent revoke, three hosted notification event types queued, outbox Admin restriction, disabled dispatcher authorization, CORS and unpublished APK gate503.
- Security supplement: denied applicant operations/re-upload403; five genuinely concurrent accepted vehicle reports and Admin-only fleet read; stale/future409 STALE_LOCATION; real issued120-second identity preview initially200 then expired400; no synthetic outbox send attempts. Latest five-request batch p50=1559ms,p95/max=1894ms. Earlier batch p50=1561ms,p95/max=3242ms. Small hosted samples, not load certification. Extra two synthetic crew-free jobs restore five active Driver duties for phone testing after completed test journeys.
- Two harness expectations required correction, not application changes: /me must follow canonical Volunteer/Driver profile creation; stale timestamps use the documented409 rather than400. Historical failed assertions remain in the private checkpoint; corrected current runs pass. No test outcomes were rewritten into historical success.
- Actual hosted JS scanned: staging project/API references present, Production project reference absent, Admin CTA/install section present, no literal full server-secret/service-role-JWT/DB-URL/private-key candidates. Public `/accept-invite`, `/reset-password`, and secure object-link fallback each return200 on the same staging host. This is HTTP/static verification, not a hosted browser visual interaction test; browser automation remains unavailable under its URL-safety restriction.
- Preview native introspection: existing package/EAS identity preserved; staging App Link host selected; background location and foreground-service-location present; no private credential candidates in resolved config. Existing remote signing credential was only read, not rotated. No native code changed after the584-test regression.

Limits: public Volunteer registration stays disabled; SMTP/invitation/password-reset email delivery and hosted new-application outbox hook are NOT TESTED. Their local mocked tests pass; manual email/provider setup is still required before enabling public onboarding. Existing user-verified Auth redirects are correctly served publicly. WhatsApp live sending, deletion, geocoding and APK publication remain disabled. Hosted map rendering, background GPS with Google Maps, Android permission/picker/link/install/upgrade behavior remain physical/browser checks, not passed by API success. Pilot GO is not granted. Next: one authorized internal preview APK, artifact/certificate/secret checks, then the user's phone checklist.
