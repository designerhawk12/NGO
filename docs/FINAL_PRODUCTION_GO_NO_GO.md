# Final Production release gates — 2026-11-10

## Bounded maintenance verification — PASS, 2026-11-10

Authorized scope was verification only; no015, backup, runtime role, bucket or deployment.
Migration015 review: alters vehicle_locations accuracy/speed and volunteer_applications
identity_required/backfill/default; creates tracking_geocode_cache/rate,
volunteer_identity_documents, identity_review_events, identity_registration_attempts,
identity_storage_objects, whatsapp_preferences, food_request_submissions,
notification_outbox/webhook_events/dispatch_rate (11 tables), two indexes, two singleton
rows, enforce_identity_verification function and volunteer_identity_approval trigger.
It applies private-table RLS/revokes, finite app grants/policies and the NOLOGIN API group.
Existing function dependencies: guard_driver_identity, guard_fixed_driver_vehicle,
assert_employee_driver_has_vehicle, assert_vehicle_reservable,
assert_vehicle_downtime_available, assert_vehicle_status_change; gen_random_uuid default.
FK dependencies include volunteers, app_users and food_requests; all existing app tables
(including ledger, dependent history/role/profiles) are protected by the tested lock set.
Auth is not directly altered by015 but its UUIDs/identities/passwords/sessions must remain
consistent for preservation comparisons. All existing Auth tables except its provider
schema_migrations are locked; no need to permit/reconcile Auth user writes during pause.

Executed scripts/verify-production-maintenance.cjs with actual verified Production TLS
admin connection and a second independent probe connection. One transaction obtained
SHARE locks on **32 app +26 Auth tables** and runner advisory lock29017/1. pg_locks
confirmed58 granted locks. Probe attempted ROW EXCLUSIVE NOWAIT (the lock needed for
INSERT/UPDATE/DELETE), NOT DML, on EACH table: **58/58 denied with expected55P03**.
Protected table counts/full-row digests before/after matched; zero row writes attempted.
Both sessions rolled back/closed. Timeout/connection loss releases locks; verification
passed only for the bounded window, not a continuously maintained current pause.

Excluded storage.* and auth.schema_migrations have no015 SQL reference or app FK
relationship (catalog count0). Provider migrations needing to alter locked user/app
tables conflict with the held locks; changes solely to independent provider metadata
are outside the consistency baseline and must not be mistaken for Auth/app data loss.
Storage metadata is not part of015; buckets remain absent and storage-dependent release
steps happen later. Do not claim a whole-database freeze or a fully quiescent provider
metadata snapshot. Require table/dependency inventory drift checks at actual execution.

Vercel named rule re-enabled/published for test, exact /api DENY except health/ready;
canonical /me and food-requests GET403 firewall deny. Both alternative origins302 to
Vercel login; authenticated operator curl on deployment /me403. No method condition:
web/mobile API mutations and side-effecting GET provisioning share same blocked prefix.
Direct DB/Auth/background DML cannot bypass table locks during the held transaction;
no privileged test writes or real account operations were needed. Operator dashboard,
DB session and health remain accessible. No unblocked relevant row writer was identified
inside the window; active administrators must not terminate locks/change grants during
release. Out-of-band DBA schema/role changes are a coordinated maintenance exclusion,
not something table locks magically prevent.

After test, disabled/published ONLY named rule back to original inactive state; no draft.
Homepage/health/readiness200, anonymous /me401. All database locks released. Normal
Production service restored; it is NOT presently write-paused. Existing expired jobs
untouched. Existing deployment retained; Production release remains NO-GO.

Next execution checkpoint: approved fresh snapshot/current baseline AFTER reacquiring
this exact gate. Important orchestration prerequisite: retain app/Auth locks from backup
through015 on the SAME migration-owning transaction/session. The current runner opens
its own transaction; do not leave holder locks on a separate connection then invoke it,
which would self-block DDL. Integrate a tested same-session hook into the existing runner
(no second migration system), or another reviewed atomic handover before execution.
A snapshot-only dump can read SHARE-locked tables from a separate connection. On missing
lock, timeout, inventory drift or failure stop migration; snapshot consistency covers
protected app/Auth rows, not uncontrolled provider metadata. Latest user authorization
ends at maintenance verification: obtain explicit resume authorization for fresh backup,
same-session orchestration and the previously reviewed rollout. No migration was applied.

## Actual maintenance execution — 2026-11-10

Supported Vercel CLI (not failing config GET) verified named rule
rule_aahaara_connect_approved_production_maintenance_RiIt1s live/active/valid, no drafts:
/api prefix DENY except exact health/ready. Canonical anonymous /me403 with
x-vercel-mitigated=deny; health200. Both protected origins returned Vercel302 (earlier
followed-login200 was not an application response). Operator-authenticated vercel curl
on actual deployment /me also returned403. Thus Vercel ingress gate was verified.

Database inspections: anon/authenticated/service_role lack app USAGE/CREATE; no direct
app DML grants for these roles, no exposed public security-definers or custom Auth
triggers, no pg_cron/pg_net, no other open transactions at observation. Only idle managed
clients observed. These observations do not guarantee future writes are impossible.
Direct Auth settings200 still disable_signup=false/email provider enabled. No Auth
settings changed. An Auth users SHARE-lock probe succeeded and was immediately rolled
back. A bounded lock gate covering all auth/storage tables then failed, transaction
released. Permission diagnosis with actual postgres connection found no owner/write
privilege for auth.schema_migrations, storage.migrations, storage.buckets_vectors and
storage.vector_indexes. Exact lock SQL error was suppressed by the helper; permissions
are diagnosed evidence, not a claim of a captured PostgreSQL error message. No retry,
managed grant change or bypass attempted. Full database pause remains UNVERIFIED.

With no migration/deployment applied, used explicit outage-recovery authority to disable
ONLY the named temporary rule. Inspected diff contained exactly one active=false change;
published and verified live/inactive/no draft. Canonical homepage200, health200,
readiness200, anonymous /me401 afterwards. Existing deployment/aliases unchanged by
these operations. No new snapshot,015,runtime,buckets or deployment attempted.

Independent Android work: EAS Production env read returned all four required public
variable names; expected canonical API/web and Production Supabase URLs appeared and
no staging reference appeared. Masked key values not verified. Package/HTTPS /open/
intent filters match approved configuration. Frozen application diff remains empty;
015 checksum unchanged. Production signer/assetlinks/native build remain unverified;
no build/publication or repetition of accepted staging/SMTP/recovery tests.

Next corrective decision: establish a bounded database pause scoped to application/Auth
user data while explicitly excluding provider-managed metadata that cannot be locked,
or obtain a supported provider maintenance mechanism. Do not pretend this session
established a complete database-wide freeze, and do not broaden managed grants. An
app-only Vercel gate is insufficient under the currently stated full-pause requirement.
Original expired jobs and existing users/history were not modified by this execution.
Production remains NO-GO; existing service has been reopened, not the new release.

## Final release decision scope — 2026-11-10 (supersedes custody preconditions)

User explicitly defers portable key escrow and second-device restore until after initial
release, accepting temporary laptop/Windows-profile and single-operator dependency.
Archive integrity/local 45-check recovery remain PASS; independent recovery remains
UNVERIFIED. Do not require Bitwarden or another custodian to prepare this release.
Before writes, re-confirm original laptop/protected key availability without printing or
exporting it, and obtain explicit residual-risk acceptance in the consolidated approval.

Focused current evidence: application paths apps/server/packages/api and root dependency/
Vercel files have no diff from 580801e9b54937be7ecbc0db592dea6537b95869. No essential
code defect demonstrated; frozen app preserved. 015 checksum unchanged:
28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1.
Production ledger count14; planned aaharaconnect_api/aaharaconnect_runtime absent;
Storage buckets absent. Vercel MCP confirms ngo/prj_6BuwhBiISjTlzgGtqG2arEXqOXGl under
team_lRAI0kP7NNOxCUPBitJQ3d95; latest READY dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR and two
existing domains preserved. All returned environment bindings target Production only;
SUPABASE_SECRET_KEY is present. Secret values NOT decrypted: current effective DB login,
TLS and URL bindings are not independently proven. Those will be explicitly replaced/
verified against approved Production values during rollout; no credential removal/rotation
of existing users is proposed. No remote configuration changed during this preparation.

### One consolidated approval to request

Approve only Production pyzyxgpcfwpcqyqrihuo and Vercel ngo above, using frozen source
580801e9b54937be7ecbc0db592dea6537b95869 and exact 015 checksum above. User is operator.
Accept deferred escrow/second-device risk explicitly and confirm laptop/key available.
Authorize the ordered maintenance, fresh read-only encrypted snapshot/local integrity
verification, 015, new restricted runtime login, two private buckets, finite Production-only
env changes, one combined candidate deployment and bounded acceptance/service resumption.
No main/develop merge, existing-account password reset/recreation, SMTP/Auth redirect
change, WhatsApp, backup transfer, key export, Android build or APK publication included.

Stop-on-failure sequence:
1. Agree maintenance start/end and operator contact. Enforce platform ingress block for
   ALL application API paths on every live/old deployment URL (including GET /me which
   provisions records), except health/ready; separately pause scheduled/direct DB writers
   and coordinate Auth activity. A UI banner alone is insufficient. The candidate has no
   maintenance flag: do not deliberately break server configuration as a pause workaround.
   Use only a supported reviewed Vercel access/firewall mechanism and retain its exact
   before-state; verify external and old-client denials and drained in-flight writes.
   If this cannot be established without broader changes, STOP before backup/migration.
   Do not imply blocking Vercel pauses direct Supabase Auth or direct DB clients.
2. Reconfirm project/TLS, available protected key and baseline role/UUID/ledger/constraints.
   Create fresh encrypted snapshot using reviewed backup tooling under this approval;
   validate archive hash/authentication/integrity against current baseline, preserve old
   archive. No historical snapshot is substituted. Stop on drift/unexplained writes.
3. Run existing migration runner ONLY for reviewed 015. Verify ledger15 exact and account,
   record, role/UUID and relationship preservation; stop before infrastructure/deploy on
   any mismatch. Do not migrate original001–014 or restore over live data automatically.
4. Execute docs/release/production-runtime-after-015.sql with secure owner password entry,
   new aaharaconnect_runtime member of restricted aaharaconnect_api, NOBYPASSRLS/non-owner.
   Test NEW actual TLS connection/finite grants/denials. Never run application as admin.
   Existing role collision or unexpected privilege => STOP, preserve, no overwrite.
5. Create ONLY profile-photos (private,614400,JPEG/PNG/WebP) and volunteer-identity-private
   (private,2097152,JPEG). No blanket anon/authenticated object policies. Verify Express
   ownership, private signed reads/Admin identity authorization and denial behavior.
6. Set Production-only reviewed matrix from PRODUCTION_RELEASE_READINESS.md: verified DB/TLS,
   Production Supabase URL/public/server keys, canonical CORS/origin/invite callback,
   /api/v1 frontend URL. Preserve legacy unrelated variables. Registration false during
   acceptance; identity/idempotency on only after prerequisites; Driver GPS requirement
   false until compatible Production Android handover. WhatsApp/outbox/geocoding/deletion/
   public APK remain off. Preserve current Auth Site URL/seven redirects/SMTP unchanged.
7. Stage exact candidate deployment to ngo from frozen source (no staging project touched,
   no Git reconnection), verify READY and protected smoke before stable-alias switch where
   supported. Keep ingress block until required acceptance is complete. Match web/API.
8. Read-only before/after original-record fingerprints; owner privately verifies existing
   Admin/Donor/Volunteer/Driver credentials without resets. Verify anonymous API401,
   role/ownership denials, private Storage, readiness, callbacks without re-sending SMTP.
   Synthetic /me provisioning is already separately authorized but still awaits private
   user session. Other mutating smoke tests must use a precisely bounded synthetic fixture
   set approved at execution, never real history. Stop for approval if writes exceed it.
9. Return only approved workflows to service, restore maintenance controls to before-state,
   monitor failures; keep registration/GPS requirements gated by their verified prerequisites.

### Non-destructive expired-job handover

Current read-only IDs/statuses:
- 05c69748-c749-4ff9-9da3-0b8b955ce6d3: PENDING / pickup ASSIGNED.
- 366992ed-f7e8-44c1-8204-734c71506921: FOOD_COLLECTED.
- 51269901-47f1-45fc-9f32-e838767bf77d: EN_ROUTE.
User/operator confirms actual crew/vehicle/container/food disposition before dispatch
resumes. Preserve IDs, versions, reservations and history. Do not cancel/extend/complete
or assert food safety automatically. Keep these jobs operationally on hold; any later
transition follows existing authorized workflow and factual operator decision.

### Android after hosted Production checks (separate build approval)

Existing production-apk EAS profile uses production environment/internal APK; no changes
needed to app source. Required public config: API https://ngo-eight-umber.vercel.app/api/v1,
Supabase https://pyzyxgpcfwpcqyqrihuo.supabase.co + its public publishable key, WEB_BASE_URL
https://ngo-eight-umber.vercel.app. Package com.rajashishpatil10.aaharaconnect; /open/
HTTPS intent filter derives canonical host. Confirm actual Production signing certificate
and continuity with installed Production app; configure matching assetlinks fingerprint
only after private credential review. EAS effective env/signer remain UNVERIFIED; do not
claim build ready merely from eas.json. Then approve one Production-configured internal
APK, inspect signature/config/permissions and perform physical role/GPS/background/Maps,
identity upload and authenticated-link tests. No public publication under rollout approval.

Rollback: retain old READY deployment and original alias mappings; on failure keep pause,
use schema-compatible code rollback only after compatibility review. Never drop015 or
blindly restore old snapshot over post-snapshot writes. DB restoration/reconciliation
requires separate approval. Stop if safe old-code compatibility cannot be established.
Production remains NO-GO until explicit rollout approval and required checkpoints pass.

## Consolidated closure checkpoint — 2026-11-10

The user elects to be backup custodian, key custodian and recovery operator on the same
laptop. Accept this as the interim operating model; no additional person/device is a
prerequisite to preparation. Residual single-operator/laptop-loss risk remains. Independent
person custody and second-device restoration are UNVERIFIED, not PASS. Off-device archive
integrity and SMTP acceptance remain PASS without repetition.

### Completed implementation and evidence reuse

Portable restore support is implemented in scripts/production-restore-verify.cjs:
`--portable <package-directory>` validates encrypted package hashes and pinned image,
then reads exactly 32 binary key bytes from a protected stdin pipe. It never calls DPAPI
in portable mode, does not load Production database config, and leaves the input manifest
unchanged. No raw key command argument/environment variable or persistent plaintext
archive is accepted. Authenticated plaintext exists in process memory and isolated
container tmpfs only; best-effort buffer clearing cannot attest host pagefile erasure.
Existing local restore behavior remains available. Do NOT run either real restore mode
before sensitive-operation approval. Portable end-to-end restore is not yet tested.

scripts/portable-recovery.cjs inventories encrypted files and creates a manifest view
with an explicit allowlist, stripping key locators/unknown fields. It does not decrypt,
read key files, copy or upload anything. scripts/portable-recovery.test.cjs verifies
companion tampering rejection, private-field stripping, exact key pipe length and crypto
loading without LOCALAPPDATA. Combined focused recovery tests: **7/7 PASS**, including
synthetic DPAPI regression only; restore syntax and whitespace checks PASS. No accepted
application code changed; no justification to repeat staging/device/SMTP/full recovery tests.
Tooling is central integration-owned and needs review before real key handling.

Required package inventory (read-only hash comparisons all PASS):

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| database.dump.gcm | 584722 | 63efae09259219a9dca0d8844ce0ded581b0bd8c83f020b141656623db25316f |
| snapshot-metadata.json.gcm | 84463 | 657998254b71cb4b1693ab4e9d8302e20358e3b826049c76159ec7aeed3b2a6e |
| cluster-settings.json.gcm | 1145 | f945501fbf05eee7496317a55999d1c51da0312d9025edf5d40cccf086165ec6 |

Use sanitized portable manifest plus these three scripts: production-recovery.cjs,
production-restore-verify.cjs, portable-recovery.cjs. Pinned image ID remains
sha256:c141fd17ac6a76c4323e90b3aee8ff1a23d2e89e547c2b963cfadc309c079cc2.
Original diagnostic ciphertext/TOC/old script copies are not required for restoration;
do not upload them or the raw original manifest/key locator. Preserve originals locally.
The two metadata companions and portable manifest/tooling have NOT been uploaded.

### One practical vault and the one consolidated sensitive approval

Recommend **Bitwarden Free**, in a dedicated account controlled by the elected custodian,
with unique master password and free authenticator-based MFA. Keep its recovery code
and master-password recovery instructions somewhere accessible without this laptop;
never place the sole MFA/recovery copy inside the vault it unlocks. Drive remains the
archive service; Bitwarden holds only the exact existing key, snapshot identifier and
archive checksum in a secure note. No attachment subscription is needed for 32 bytes.
Sources: https://bitwarden.com/help/setup-two-step-login-authenticator/ and
https://bitwarden.com/help/cli/ . No vault account created or secret handled here.

User actions needed once: create/unlock the selected Bitwarden vault privately; confirm
account/server region, exact secure-note destination name/ID, MFA/recovery readiness and
custodian authorization. Do not send master password, MFA seed, recovery code, session
key or database key. Then review the vault-specific entry/retrieval mechanism: ordinary
CLI commands exposing session keys via argv/environment/output are NOT approved. The
current tooling accepts a protected binary pipe, but the vault bridge still needs a
reviewed memory-only implementation; do not improvise clipboard or plaintext exports.

Consolidated approval proposal (NOT EXECUTED; fill exact vault destination first):
1. Under the elected custodian, unwrap the existing snapshot's DPAPI key once locally
   using reviewed protected-memory handling and place the SAME key into the exact named
   Bitwarden secure note; preserve DPAPI original and archive. No chat/log/file export.
2. Upload only the two encrypted companions above, sanitized portable manifest and
   reviewed public tooling/instructions into Drive folder 1VMVrMTYvda5g1nbLxMNN0Ngk6Ad91jiA;
   do not reupload/replace the verified archive or change permissions. Download/checksum
   new files and verify manifest/tool identities.
3. Retrieve key through that vault into the protected pipe and perform one isolated local
   portable rehearsal, without DPAPI/original profile dependency or live DB connection,
   then remove disposable restored data. Record same-device test accurately; a later
   second-device test remains unverified unless actually performed.
No Production operation, credential rotation, migration, email or deployment is included.
If a safe vault bridge cannot be established, stop key handling, preserve originals and
report that exact limitation. Vault selection alone is not escrow completion.

### Synthetic /me: exact browser-based user procedure

Still pending: zero authorized /me calls made by this session; no session fabricated.
On a private browser window with no existing Admin session, open the canonical site's
Admin sign-in. Open developer tools Network, filter `/api/v1/me`, keep Response visible
without copying headers/tokens. Enter ONLY the existing synthetic recipient credentials
privately and submit ONCE. The reviewed Admin login calls /me once then rejects DONOR
with Administrator access required; that rejection is expected, not an invitation to retry.
Do not refresh, reopen/restore the session, use the old Donor portal, export HAR or send
passwords/tokens. Record the one request's HTTP status and sanitized role/auth UUID fields.
If the deployed form differs or makes unexpected requests, stop. After user result,
read-only DB verification must confirm one DONOR app_users row and one donors row linked
to the same synthetic Auth UUID, with no elevated roles/existing-record changes.
This is the already approved provisioning test; no further permission for that exact
request is needed, but private user interaction is required.

### Actual Production release sequence and approval boundaries

Frozen application source: 580801e9b54937be7ecbc0db592dea6537b95869. Tooling/docs commits
are separate; deploy the frozen application tree unless an essential tested fix changes it.
Only pending migration: server/db/migrations/015_final_pilot.sql, SHA-256
28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1 (rechecked unchanged).
Keep original 001–014 immutable. Reuse accepted Admin/Volunteer/Donor/Driver, donation/
pickup, GPS, Storage/auth security, web/mobile and staging evidence; Production parity
and original-account login checks remain release acceptance, not presumed from staging.

Separate maintenance/release approval must name exact Production Supabase/Vercel IDs,
operator (user), window and write-pause/active-job plan. Pause all write ingress including
old clients/jobs; verify pause rather than relying only on UI. Obtain a fresh encrypted
read-only snapshot and contemporaneous UUID/role/record/ledger/constraint baseline;
retain historical snapshot. Validate exact 015 SQL then apply ONLY that checksum.
Provision reviewed non-owner/NOBYPASSRLS runtime login/group and prove actual access;
never run application with migration-admin credentials. Provision two private buckets
(profile-photos 614400 bytes JPEG/PNG/WebP; volunteer identity policy per reviewed plan),
verify private ownership/role denials, configure reviewed Production-only env/disabled
flags, deploy combined web/Express candidate to ngo only. Preserve original identities,
passwords/roles/history; run bounded approved synthetic and owner-performed role checks
and workflow acceptance. Keep WhatsApp/public APK/deletion/geocoding off as planned.

Rollback: retain current live deployment/aliases for code rollback; coordinate write pause
and schema-compatible old-code behavior. Do not blindly down-migrate/drop 015 objects or
restore historical data over new writes. Reconcile post-snapshot writes; database restore
requires separate explicit approval. Do not reconnect automatic Git deploys or merge
main/develop. Production Android is a later explicitly approved build using Production
API, verified signing fingerprint and App Links; staging APK is never the release APK.
Final GO requires hosted Production, physical Android acceptance and explicit disposition
of residual custody/security/ownership risks. Same-device rehearsal is not second-device
proof, and this historical archive is not a current migration rollback snapshot.

Latest custody update (2026-11-10): **off-device encrypted archive upload/integrity PASS**.
Drive upload and manually downloaded 584722-byte copy match original SHA-256. This does
not verify independent recovery: DPAPI-independent escrow, approved encrypted metadata
companions/portable tooling, NGO handover and second-device restore are pending. Only
source/docs were inspected in this preparation; no key access/decryption/transfer.
Historical snapshot still requires a fresh approved snapshot and integrity baseline
immediately before 015. Production remains NO-GO. See
[custody procedure and next approval](PRODUCTION_RECOVERY_CUSTODY_PREPARATION.md).
Earlier custody statements below are historical and superseded only as noted here.

Approved single-request test checkpoint (2026-11-10): user authorized exactly one
synthetic authenticated /me and normal DONOR app-user/profile provisioning. Read-only
inspection confirms the same confirmed Auth identity, Auth role authenticated, no
application mapping and no role metadata. No /me request has been made: a legitimately
authenticated synthetic session is not available to the agent. No password/token was
requested or extracted, and no admin-generated session was substituted. Private user
sign-in handoff is required before executing the one-shot request. Approval remains
limited to this identity; no retries, emails, migrations or other writes authorized.

Latest recovery/role checkpoint (2026-11-10): SMTP PASS remains accepted. Read-only
synthetic identity inspection found no app mapping or privileged role. Deployed /me
would provision DONOR app-user/profile rows, so it was NOT called pending specific
approval. Off-device destination/key-custody/operator facts and second-device rehearsal
remain pending. See [exact custody procedure and migration gate distinctions](PRODUCTION_RECOVERY_CUSTODY_PREPARATION.md).
No Production write or repeated delivery/recovery test performed in this checkpoint.

**Decision: NO-GO for Production release.** The separately approved Vercel isolation
correction is complete: Git disconnected, seven shared variables now Production-only,
separate Preview API binding removed. Values/types, live deployment/aliases and staging
preserved. See [correction evidence](PRODUCTION_PREVIEW_ISOLATION_CORRECTION.md).
During that earlier isolation checkpoint, no015, database permission/SMTP change, email, deployment, build, backup transfer
or key export occurred. Existing backup was hashed, not restored again. The subsequent
single-field Auth Site URL correction is separately approved and complete as recorded below.

**Latest SMTP delivery acceptance: PASS (2026-11-10).** Exactly one invitation and,
after confirmed invitation/password setup, exactly one reset returned HTTP 200. User
confirmed both receipts, correct sender, canonical callbacks and completed password
setup/reset. Synthetic Auth identity is authenticated/unprivileged, with no application
mapping or elevated metadata. Express /me/DONOR mapping remains untested. Existing
aggregate account/role counts and 14-entry ledger match prior evidence. No further mail,
migration or deployment authorized. See [acceptance evidence/limitations](PRODUCTION_SMTP_DELIVERY_ACCEPTANCE.md).

**Latest authorized Auth correction:** default Site URL is now
`https://ngo-eight-umber.vercel.app/`, verified after Dashboard reload. All seven allowed
redirects remain exactly unchanged.14 Auth users/11 app users, identities, stored sessions,
refresh-token rows, roles and ledger matched the before-state; hosted checks passed and
the same32 deployments/active Production/bothaliases remain. No emails were sent. See
[single-field correction and next SMTP plan](PRODUCTION_AUTH_SITE_URL_CORRECTION.md).

**Latest authorized retirement completed2026-11-10:** the exact42 historical Preview
deployments and5 aliases are retired. All47 URLs404; all32 other deployments, both live
Production aliases/settings and staging unchanged. Production health200, anonymousme401;
no deployment/promotion. One hostname-form alias request failed, was stopped/investigated,
then resolved with freshly validated UID-based removals. See
[retirement report](HISTORICAL_PREVIEW_RETIREMENT.md). Earlier proposed-retirement text
below describes the prior checkpoint and must not be used to delete anything further.

Read-only evidence before retirement: [security and operations closure](PRE_RELEASE_SECURITY_OPERATIONS_CLOSURE.md).
All42 then-existing Previews were Vercel-auth protected;89 checks returned302, including
readiness and5 aliases. No custom-domain bypass was observed;22 listed DB/Supabase binding
names without a value/decryption read. The owner subsequently confirmed all operator and
PR25/26 review dependencies were cleared and approved the exact42-ID/5-alias retirement,
now complete. Open PRs remain untouched; their old Preview links now404.

The old default URL returned404 and has now been replaced by the approved canonical200
origin. All seven redirects were preserved as required; narrowing remains a separate
dependency review. A transport-only invitation/reset plan, operator custody checklist
and second-device procedure are prepared. No Production recipient, cloud folder or key
vault has been authorized. Staging/recovery tests were not repeated.

Application release candidate: **`580801e9b54937be7ecbc0db592dea6537b95869`**.
This is the frozen application source; preparation commits add documentation/tooling
only. Starting preparation checkpoint: `ba0c7c4e2ceb8adb33c10d062fea3f5d7596addf`.
The final preparation checkpoint is the integration-branch commit containing this file.
No main/develop merge is proposed. Integration maintainers and affected module owners
must review central runtime/schema/auth/deployment artifacts before execution.

## Release-gate checklist

PASS = evidence complete for the stated scope. BLOCKED = action/approval required.
FAIL = demonstrated defect. NOT VERIFIED = evidence insufficient, not a proven defect.

| Gate | Status and exact evidence/issue | Risk / required action | Responsible party | Without modifying Production? |
| --- | --- | --- | --- | --- |
| Encrypted backup integrity | **PASS**: SHA256 still `63efae09259219a9dca0d8844ce0ded581b0bd8c83f020b141656623db25316f` | Retain immutable archive, manifest, sidecars, tools and separate protected key | Backup custodian, name unconfirmed | Yes; verified locally |
| Isolated logical restore | **PASS**: prior45/45;73 table digests,319 constraints,14 migrations,14 Auth/11 app users; disposable tmpfs container removed | No need to repeat absent new evidence | Integration maintainer | Yes; completed |
| Off-device recovery | **BLOCKED**: only development-computer copy; DPAPI key depends on original Windows profile. Owner proposes organization-managed Drive/OneDrive plus separate organization password manager; no destination approved | Identify tenant/folder/access list and independent vault recovery ownership, then approve transfer/key escrow; test replacement-machine recovery | NGO backup owner + independent key custodian, both unconfirmed | Yes, but external transfer/key export requires approval |
| New Preview configuration isolation | **PASS**: approved seven entries now Production-only; Preview API entry removed; no Preview env bindings remain; values/types preserved | Preserve disconnect and scope controls; no deployment authorized | Vercel/Git owner + integration maintainer | Completed under exact approval |
| Approved historical Preview retirement | **PASS**: owner/reviewers confirmed no required use; exact42 deployments/5 aliases removed;47 URLs404;32 others and Production/staging preserved | Closed for this approved set. No new targets, rotations or broader release action authorized | Vercel/security owner + reviewers | Authorized retirement complete; full evidence linked |
| Recovery-branch push safety | **PASS**: existing `git.deploymentEnabled["integration/ngo-recovery"]=false` preserved; CI pushes only main/develop | Keep guard; never merge or manually deploy by inference | Integration maintainer | Yes |
| Automatic Git deployment freeze | **PASS**: Production project's Git link removed; original GitHub repository/history untouched; active deploymentb7b321c retained | Immutable manual deploy/redeploy/promote still needs separate release approval; do not reconnect Git or merge by inference | Git/Vercel owner, formal NGO ownership unconfirmed | Completed under exact approval |
| Actual current API runtime identity | **NOT VERIFIED**: Vercel DATABASE_URL opaque; dedicated backup connection is postgres, not proof of deployed API role | Privately establish effective deployed DB/server Supabase binding; current backup login is overprivileged for runtime | Integration maintainer + secret owner | Read-only evidence yes; any replacement needs approval |
| Restricted Production runtime | **BLOCKED**: Production has no aaharaconnect_api/runtime roles; postgres has CREATE/CREATEROLE/CREATEDB/BYPASSRLS | After015, provision separate non-owner/NOBYPASSRLS login with finite group grants; test actual login | Database owner + integration maintainer | SQL prepared; execution changes Production |
| Anonymous app schema access | **PASS**, limited scope: anon/authenticated/authenticator lack app USAGE/CREATE and SELECT;32 tables;0 app sequences | RLSoff warnings alone do not demonstrate anonymous data access. Keep client roles out of app; review future grants | Integration/security owner | Yes |
|015 and private Storage readiness | **BLOCKED**: only015 pending; Production buckets/policies0 | Approve015 exact checksum, restricted runtime and two private buckets; never publish proof/photo storage | Integration + Volunteer owners | No for provisioning |
| Admin/account mappings | **PASS**: requested original Admin exists/confirmed/linkedADMIN/not disabled;14 Auth,11 app users,0 orphan app links | Password not tested; preserve every UUID/password/role/approval/history. Owner triage3 unmapped Auth identities | NGO Admin + integration maintainer | Read-only evidence yes |
| Production Auth policy inspection | **PASS**, partial: public settings200, email provider enabled, disable_signup=false, mailer_autoconfirm=false | Email confirmation required. This does not prove SMTP or URLs | Auth owner | Yes |
| Production Auth default Site URL | **PASS**: exact approved canonical URL saved/reloaded, homepage200, seven redirects and account/session state preserved | Default landing fixed; actual invitation/reset delivery still needs authorized mailbox test | Supabase/Auth owner, formal NGO ownership unconfirmed | Approved single-field correction complete |
| Legacy Auth redirect allowlist | **BLOCKED** for narrowing: all seven entries intentionally unchanged, including old-origin and wildcard entries | Operator dependency/outstanding-link review and separate approval required before any removal | Supabase/Auth owner + operators | Review yes; no redirect edits authorized |
| SMTP sender configuration | **READ-BACK COMPLETE**: user approved and privately saved replacement; enabled smtp.gmail.com:587 and sender name retained | Sender/username exact values and new password are user-attested due to tool masking; no delivery proof. Site URL/seven redirects unchanged | User-confirmed mail custodian; organizational handover still pending | SMTP-only approval complete; no test email authorized |
| Production SMTP delivery | **PASS**: one authorized invite and one subsequent reset accepted HTTP200; actual sender/receipts/callbacks/setup/reset confirmed by recipient | Synthetic Auth identity retained without privileges; Express /me/application mapping remains untested. No further mail authorized | User-confirmed mail custodian; NGO handover pending | Controlled two-message acceptance completed |
| Public Volunteer registration | **BLOCKED**: current Production flagtrue; new proof/Storage prerequisites absent | Pause during approved cutover; re-enable only with proof/rate/deduplication and confirmed Production SMTP | Integration + NGO operator | No flag change authorized now |
| Current Donor web routing | **FAIL**: old Production donor artifact references foreign Auth project oneiwcfdnqzcyfvxufhc | Candidate fixes env substitution; never test credentials on old page or access foreign project | Food/Donor + integration owner | Local fix already present; deploy requires approval |
| Operator handover | **BLOCKED**:3 expired nonterminal assignments; named owners/contacts not supplied | Decide safe handover through normal approved workflow; never auto-extend food windows/cancel history | NGO dispatch/food-safety lead | Planning yes; business actions need owner authorization |
| Production Android/App Links | **BLOCKED**: current assetlinks404; existing validated APK targets staging | Confirm Production package/signer/config, separately approve internal native build and physical checks; never publish staging APK | Android/signing owner | Preparation yes; hosted/build actions need approval |
| Accepted source and checks | **PASS**: prior85 focused tests+28 synthetic migration checks/builds; prior owner-reported staging physical acceptance; new4/4 local crypto/key-preservation tests | No new app code change or broad regression needed; residual dependency risks require owner disposition | Integration/security owner | Yes |

## Verified environment relationships and isolation correction

Production: Supabase `pyzyxgpcfwpcqyqrihuo`; Vercel `ngo` /
`prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`, teamequinox10. One existing combined web/Express
deployment, stable `https://ngo-eight-umber.vercel.app`, current
`dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR`, sourceb7b321c. Former Git link was designerhawk12/NGO,
configured main; it is now disconnected under exact approval. Public main artifact targets Production Supabase and `/api/v1`.
The old donor artifact is the demonstrated exception above; no foreign project accessed.

Designated staging web `prj_W1MrwAqFsWTFohHs6UXR2fo1EEIL`, latest
`dpl_5Ya46jG23KCua5tG3gXkA2cKnWHP`; API `prj_Nd3YLsJkOYjlZMPLmFZw9MFG88Ul`,
latest `dpl_9WrBdHU8JP4KD2CVBQpkUbwzJDqi`. They currently have no Git link in returned
project metadata; approved manual staging deployments remain unchanged. Prior hosted
checks established staging projecttughgqggsndtraaymtvf; no need to rerun all workflows.
Environment labelProduction inside those **staging project IDs** is not the live NGO project.
Staging APK776393e8/source3e89c26 binds staging; candidate Production build needs its own
public Supabase/API/web origins. No Production secret belongs in VITE_/EXPO_PUBLIC_.

Reviewed former Production+Preview entries, now all Production-only:
`DATABASE_URL`, `DATABASE_SSL_CA`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGIN`.
The separate Preview `VITE_API_BASE_URL` entry is removed; Production API binding preserved.
Production SUPABASE_SECRET_KEY is Production-only; do not claim it leaks into Preview.
Public project binding identifies the client target; opaque server credentials are not
independent proof of every historical function's connection target.

**Approved correction completed2026-11-10:** Git unlink and all scope/removal changes
below are done, independently read back and documented in the correction evidence.
The remaining historical-deployment access review is not executed or authorized.

1. On Production projectngo only, disconnect its Git repository link to prevent automatic
   Git deployments/Preview creation pending immutable release approval. This does not delete
   the Git repository. Keep staging projects and stable Production alias unchanged.
2. Narrow those seven existing entries to Production only, preserving values/types;
   remove only the separate Preview VITE_API_BASE_URL binding. Do not put staging credentials
   into this Production project; designated staging projects provide test hosting.
3. Environment scopes/Git behavior were independently verified. The prior42 READY previews
   retained old bindings until the later exact approved retirement, now complete. A scope
   change alone did not sanitize those artifacts. No credential rotation was included.
4. Reject redeploy/promote/manual deploy without explicit project/target/artifact checks;
   Git guards alone do not govern those actions. Review app dependencies/secret consumers
   before removing any other legacy variables.

## Off-device strategy and laptop-loss recovery

**Owner-proposed destination:** restricted folder in an organization-managed Google Drive
or OneDrive, with key recovery in a separate organization-controlled password manager.
No actual tenant/folder/vault/access list has been approved. Supply the organization/tenant,
Shared Drive or SharePoint/OneDrive library and folder ID, managing account, backup and
key custodians, authorized recovery users, MFA, no-public-link policy, audit/retention and
vault emergency recovery ownership. Personal developer accounts are not accepted as
permanent NGO custody. No connector, upload, subscription or key export is initiated.

Keep key custody independent of both laptop and backup destination. Copying the DPAPI
file alone is insufficient. Under a separate explicit export approval, decrypt the AES
key only in trusted memory and wrap it with an organization-controlled RSA-OAEP-SHA256
public key (3072-bit or stronger), or place it in an approved organization secret vault.
Verify certificate/public-key fingerprint and separate private-key recovery ownership
before export. Never store plaintext key/password beside the archive or send it in chat.
If using the organization password manager, a future approved import must use its supported
CLI/API directly from trusted memory, not chat, clipboard or plaintext temporary files.
The organization's recovery private key/vault recovery method must itself survive laptop
loss and be tested by a second authorized custodian. No key wrapping/export occurred.

Laptop-loss procedure after that setup: acquire approved encrypted archive+sidecars/tools,
verify the independently recorded SHA256; obtain authorized key escrow access separately;
unwrap in memory on the replacement Windows host, protect under that host's DPAPI and
update the **private** key locator; authenticate AES-GCM; run the offline RAM-backed
restore verification. Do not restore over a live database. Record second-machine result.

**Owner action needed now:** identify the cloud tenant/folder, custodian/access list and independent
key escrow public-key fingerprint/vault recovery owner, then explicitly approve transfer
and key export to those exact destinations. Until then this gate remainsBLOCKED.
Original backup/archive/key are unchanged and remain outside Git.

## Runtime, RLS and private authorization

Read-only Production grants: postgres owns/reads32 app tables, can create roles/databases
and bypass RLS; app schema access is denied to normal client roles. Existing four014 RLS
tables have no policies. Do not enable RLS indiscriminately or deploy with an admin login
just to bypass it. A sensitive Vercel DATABASE_URL cannot be identified as postgres by
observing the separate backup connection.

Staging comparison: `aaharaconnect_runtime` LOGIN is non-owner/NOBYPASSRLS with appUSAGE,
no schemaCREATE; `aaharaconnect_api` NOLOGIN has17 trusted Express policies. Membership also
includes migration postgres in staging, which is already an owner; **do not copy that
membership to Production**. Only the separate runtime login needs the new group.
Normal client roles never receive this group. Zero Production app sequences exist;
there is no need for blanket future sequence/table grants.

Exact guarded proposal: [production-runtime-after-015.sql](release/production-runtime-after-015.sql).
It deliberately aborts if the login exists or015/group gates fail; it does not overwrite
existing users/roles. psql prompts privately for a new password; no secret literal in SQL.
Verify actual restricted connection, denied ledger/auth/DDL/TRUNCATE/audit rewrites, finite
grants and non-ownership. PUBLIC database TEMP/CONNECT defaults are not silently revoked.
SQL and central authorization changes require integration-maintainer review.

Private buckets after separate approval: profile-photos private614400,JPEG/PNG/WebP;
volunteer-identity-private private2097152,JPEG, with stricter API500000 input validation.
No broad client Storage policies. Express verifies token via Supabase getUser, derives
role from app_users, enforces ownership and Admin-only proof review; pending/denied
Volunteers are restricted, legacy approvals preserved. GPS reporting is Driver/current
assignment/vehicle/consent bound, Admin location reads protected. Server secret bypasses
Storage RLS intentionally; short signed links are bearer credentials and must not be logged.
No live Production document/upload/GPS mutation tests are authorized in this phase.

## Auth/SMTP evidence and controlled delivery plan

Initial read-only authenticated browser inspection positively identified the exact NGO
project. The subsequent separately approved Site URL-only edit is complete and was read
back after reload. All seven redirects remain unchanged; no other Auth field or email
action was authorized. Native Brave URL-verification limitations were not bypassed;
the supported in-app browser exposed the exact project URL.

**Current saved Site URL:** `https://ngo-eight-umber.vercel.app/`, after separately approved
single-field correction. Previous Site URL was`https://ngo-equinox10.vercel.app/` (404).
**Current allowed redirects (all seven, unchanged):**

- `https://ngo-eight-umber.vercel.app/accept-invite`
- `https://ngo-eight-umber.vercel.app/reset-password`
- `https://ngo-equinox10.vercel.app/`
- `https://ngo-equinox10.vercel.app/**`
- `https://ngo-*-equinox10.vercel.app`
- `https://ngo-*-equinox10.vercel.app/**`
- `https://ngo-eight-umber.vercel.app/**`

The missing old default landing has been corrected. Legacy and Preview-host wildcard
callbacks remain intentionally allowlisted under the exact approval, even though the
old Preview artifacts are now retired. Operator/outstanding-link review and separate
approval are required before narrowing. No token theft or password-login failure is
inferred; no redirect entry was substituted, removed or added.

**SMTP:** Enable custom SMTP switchon; sender name`AahaaraConnect NGO`; sender email value
was redacted by the tool and was not bypassed/reconstructed. No SMTP username/password
was displayed or retained. Custom SMTP configuration presence is verified; sender address,
provider/domain ownership and actual delivery remainNOT VERIFIED. Existing Vercel invitation
redirect is still opaque; Dashboard allowlisting alone does not prove that runtime value.
Staging delivery success does not establish Production delivery. Owner must manually
confirm sender address/domain, provider verification/rate limits/template links and mail
service ownership without disclosing credentials. See
[Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

Admin mapping was rechecked read-only; original password remains untested/unmodified.
Email confirmation is required. Existing UUIDs, roles, passwords, approval history and
legacy Volunteer/Admin donor profile are preserved. Three unmapped Auth identities need
owner triage before their first intentional login; never auto-promote/reinvite/recreate them.

The exact next [SMTP transport test](PRODUCTION_AUTH_SITE_URL_CORRECTION.md) needs a new
Production-authorized mailbox, one invitation and one subsequent reset, and approval for
the synthetic Auth identity/optional default-DONOR app rows. It does not need015 or proof
records and does not establish Volunteer approval. Receipt, password setup/reset and
correct callbacks must be recipient-confirmed without sharing passwords/tokens. Never
reset the original Admin or automatically resend ambiguous requests. Full Volunteer
acceptance/any cleanup needs its later prerequisites and separate authorization.

## Frozen candidate, execution sequence and recovery

Candidate580801e contains all accepted fixes: optional volunteers/mandatory Driver+vehicle,
login repair, donor env binding, identity/private storage, photo JPEG normalization, GPS/
zoom/pan behavior, idempotency, secure links and disabled-provider paths. No application
source changed in this gate pass. Existing application builds/tests remain evidence;
new4/4 synthetic crypto/DPAPI tests passed, syntax/JSON/whitespace checks passed.
No backup/credential/Auth payload belongs in Git; only sanitized counts/checksums and tools.
Existing documented dependency advisories remain subject to owner risk disposition.

Pending migration only015, SHA256:
`28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1`.
Original001–014 remain immutable. No migration or restore was repeated for this gate pass.

After separate release approval and all gates:

1. Freeze full candidate/lock hash; verify project IDs, preview/deploy controls, operator
   write pause and active-job decisions. A UI-only pause does not stop old clients.
2. **Fresh backup immediately before015:** run existing `production-recovery.cjs backup`
   only under new snapshot approval and verified TLS/project/private key custody. It uses
   read-only snapshot+full pg_dump, exclusive paths/keys, encrypted role/database settings.
   No plaintext export. Authenticate/checksum, inspect TOC and run the isolated helper;
   preserve old backup. New helper safeguards passed4 local synthetic tests; no new
   Production backup was taken. Copy/escrow the refreshed version only under exact transfer approval.
3. Read-only before snapshot: counts/UUID-role fingerprints, ledger/checksums, constraints,
   memberships and relationship integrity. Stop on drift/concurrent writes/backup failure.
4. Apply only015 with existing runner/admin credential. Confirm original records and
   Auth UUID/role sets unchanged, ledger15 exact. Provision restricted runtime/buckets;
   test actual connection. Never deploy with migration-admin credentials.
5. Set the reviewed Production-only matrix in [release readiness](PRODUCTION_RELEASE_READINESS.md),
   registrationfalse until SMTP/proof pass; identity/idempotency on after prerequisites;
   GPS requirement only after compatible Production mobile handover. WhatsApp/outbox,
   geocoding/deletion/public APK stayfalse. No native build is included in this approval.
6. Build matching combined web+Express candidate once with verified public/server env,
   deploy onlyngoproject, validate readiness before stable alias cutover where supported.
   Web and API must match; no separate Production API project. Keep incompatible writes paused.
7. Post-deploy smoke: readiness200; anonymousme401; owner-confirmed existing role logins;
   callbacks and controlled delivery; private bucket/role/ownership denials; legacy approvals;
   donor submission/idempotency; Driver-only/crew transitions; canonical Driver/vehicle;
   authorized GPS timestamps and Admin reads; redacted logs/5xx/pool failures. Mutating
   tests use separately approved synthetic records, never alter real history for a test.
8. Resume only approved workflows after signoff. Physical Production-configured Android
   checks/build remain separately gated; do not publish the staging APK.

Rollback: pause incompatible writes, retain015/proof/audit/outbox and post-snapshot data;
prefer forward recovery. Oldb7b321c may not handle new driver-only/proof-required states.
Do not drop tables/disable proof gates or restore over Production as an automatic rollback.
Any restore requires separate approval, isolated rehearsal and post-snapshot reconciliation.
See [full runbook](PRODUCTION_RELEASE_READINESS.md) and [operator guide](NGO_PILOT_OPERATIONS.md).

## Approval boundary after completed limited corrections

**Completed:** the owner approved and attested the exact42-ID/5-alias manifest; every
target was revalidated and retired. Current Production deployment/bothaliases,32 other
deployments, staging, Git history, credentials and database records were preserved.
Reviewer/bookmark links to retired previews now404; their artifacts are no longer
available for rollback. The manifest is retained as original scope history, not authority
for another deletion. No additional cleanup or credential rotation is authorized.

The separately approved canonical Site URL correction is complete; all seven redirects
are preserved. Any proposed callback narrowing remains unapproved. SMTP test needs a Production
synthetic recipient; it can precede015 without a Volunteer proof workflow. Later full
Volunteer acceptance requires015/buckets/matching app. Supply formal NGO owners, cloud
tenant/folder, independent vault/key custody and second-device recovery operators before
any concrete transfer/export approval. **Cleanup approval would authorize none of those
actions, Auth edits, email,015/roles/buckets, rotations, builds or deployment.**

Owner follow-up: original URL values and SMTP-enable status are now independently read.
Still manual: redacted sender address/provider ownership; formal NGO ownership of backups,
deployments and account recovery; cloud folder/vault custody identifiers. All remain pending
organizational handover, not inferred from personal developer access. The owner separately
approved the isolation correction, exact historical retirement and Site URL-only correction;
all are complete.
No broader approval is inferred.
