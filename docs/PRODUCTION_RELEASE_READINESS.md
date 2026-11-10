# Production release preparation — 2026-11-10

Latest authorized Auth change: default Site URL is now `https://ngo-eight-umber.vercel.app/`;
all seven redirects and account/session/role/ledger state preserved. Hosted checks passed,
no deployment/email. See [correction and SMTP test plan](PRODUCTION_AUTH_SITE_URL_CORRECTION.md).
Any old Site URL404 statements below describe the pre-correction finding; legacy redirect
review and mail delivery/ownership remain gated. No database or release approval inferred.

Latest authorized change: [Vercel isolation correction](PRODUCTION_PREVIEW_ISOLATION_CORRECTION.md)
completed2026-11-10. Git disconnected, seven shared bindings narrowed to Production,
Preview API entry removed; values/types/current deployment/aliases and staging unchanged.
Historical preview risk and all database/Auth/Storage/release gates remain open. Older
shared-scope findings below describe the before-state, superseded by the linked evidence.

**NO-GO for release. No Production database writes or deployments performed.** The approved encrypted Production
logical backup and isolated local restore now pass45/45 checks; see
[backup/recovery verification](PRODUCTION_BACKUP_RECOVERY_VERIFICATION.md).
Off-device key custody and the configuration/runtime/Auth gates remain open.
Migration, Storage, credentials, hosting, native
builds and public release remain unapproved. Preparation is on `integration/ngo-recovery`.

## A. Verified inventory

Read-only Supabase MCP, authenticated Vercel CLI GETs, Git metadata and public static
assets established these identities before application metadata was inspected:

| Resource | Verified state |
| --- | --- |
| Production Supabase | `pyzyxgpcfwpcqyqrihuo`, NGO, ACTIVE_HEALTHY, eu-west-2, PostgreSQL 17.11.0.011 |
| Supabase organization | `rynrdbiznsjualsuxzwp`, Free plan |
| Production Vercel | `ngo`, `prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`, team `equinox10` / `team_lRAI0kP7NNOxCUPBitJQ3d95` |
| Production web AND Express | `https://ngo-eight-umber.vercel.app`; existing `api/index` function; no second backend needed |
| Active deployment | `dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR`, READY, source `b7b321cca94b318e29e0ae8ced1e136db1ebfd3e`, source branch `integration/ngo-recovery` |
| Configured Git Production branch | `main`; repository default `develop`. This differs from the current deployment source. |
| Framework/build | Vite, Node 22.x, root directory unset, `npm run build:web`, `apps/web/dist` |
| Staging | `tughgqggsndtraaymtvf`, separate `aaharaconnect-ngo-staging` and `aaharaconnect-ngo-staging-api` projects |

Production counts: Auth **14**; app users **11** (Admin1, Donor5, Volunteer4,
Driver1); donors6; people5; volunteers4; applications3 (all APPROVED); drivers1;
vehicles3; food requests8/items9; pickups8; assignments5/members5; vessels4,
issuances5, reservations15; distribution centers3. Teams/members0, locations0,
tracking consents0. Storage buckets0/objects0; profile object references0.

Metadata evidence: [baseline](release/production-readonly-baseline.json). This contains
catalog definitions and counts, not record payloads, passwords or documents.
Current public readiness returned200; anonymous `/api/v1/me` returned401.
No Production login, invitation, reset or business mutation was attempted.

## B. Schema compatibility

Production and staging ledger001–014 match repository names, order and every SHA256.
Production has32 application tables,256 columns,177 validated constraints,69 indexes,
6 enabled user triggers and6 invoker functions. Fresh001–014 reconstruction matches
all inspected columns/constraints/indexes/functions/triggers. No catalog drift was found.

Only **`015_final_pilot.sql`** is pending in Production. Immutable SHA256:
`28d70f15fc4e45e18f85130fbb76abdbc0a2a1d881a8aeb2fca9f1c8ab0788e1`.
Use the existing `server/src/db/migrationRunner.ts`, ledger `app.schema_migrations`;
do not rename/edit historical migrations or create another runner. `up` executes in
a transaction under its advisory lock. Stop on any checksum drift; never force it.

015 adds GPS accuracy/speed, identity documents/audit/registration leases, geocoder
state, notification outbox/preferences/rate/deduplication and donation idempotency.
It does not delete old business rows or alter Auth accounts. Existing applications
receive `identity_required=false`; future applications defaulttrue and SQL blocks
approval without verified proof. It enables selected sensitive-table RLS and creates
finite grants/policies for the trusted NOLOGIN `aaharaconnect_api` group.
This is **additive with locking and authorization changes**, not risk-free:
ALTER TABLE requires locks; role creation needs administrative rights; an unexpected
existing role aborts; old runtime credentials may lack grants or bypass safeguards.
No destructive down migration is appropriate after documents/audits/new states exist.

Local synthetic rehearsal: **28/28 passed**, including checksums, structural equality,
all31 original business-table row digests unchanged, grandfathered APPROVED/PENDING/
DENIED states, new-proof default/gate, denied ledger/DDL/audit rewrites, and actual
`SET LOCAL ROLE aaharaconnect_api` access through RLS to all42 business tables.
It used no Production data and is **not a Production backup restore test**.
[Results](release/synthetic-migration-rehearsal.json),
[reusable local-only harness](../scripts/rehearse-production-migration.cjs).
Initial harness attempts exposed invalid synthetic fixture ordering/timestamps and
an incorrect expected table count; corrected locally, no application SQL was changed.
Final isolated database: `aahara_prodprep_20261110_06_test`, local port55440.

## C. Account and workflow preservation

`admin_test@gmail.com` exists in original Production Auth, confirmed, not banned or
disabled, and links to the existing ADMIN. **Its password/login has not been tested.**
All11 app users have Auth links; no disabled app users or orphan application identities
were found. Three Auth identities lack application mappings, two Auth emails are
unconfirmed. Owner investigation is required; never auto-assign roles, recreate users,
delete identities, or issue unsolicited invitations/resets.

All3 applications are APPROVED. One legacy Volunteer lacks an application record;
existing server logic preserves legacy access. A donor profile belongs to the Admin
and has one historical food request: supported Admin/Donor behavior, not corruption.
The employee Driver has a canonical person/DRIVER Auth mapping and exactly one fixed
vehicle. No observed driver/vehicle mismatch needs a data repair.

Three nonterminal assignments (PENDING, EN_ROUTE, FOOD_COLLECTED) have expired pickup
windows; two others are DELIVERED. All current assignments are crew-assisted.
Operators must decide the handover for these jobs before dispatch resumes. Preserve
their IDs/states/history; do not automatically cancel, extend windows or assert food safety.
No staging users, test passwords, donations, GPS or identity files may enter Production.

## D. Backup and recovery — unresolved hard gate

Initial owner report: **no backup**. Free plan confirmed; no managed backup timestamp,
retention or PITR established. Under the subsequent explicit backup-only approval,
a new complete encrypted Production archive and isolated local restore were verified.
All73 table digests,319 constraints and14 migrations matched;45/45 checks passed.
See the linked verification report for location, hashes, custody and limitations.
Old restore containers and staging archives were not used as recovery evidence.

The completed backup-only approval permitted a sensitive private backup and isolated
restore. For a future approved refresh, use this destination pattern outside Git:
`C:\Users\desig\AppData\Local\AahaaraConnect-Production\pre-015-YYYYMMDD-HHMMSS\`.
Before extracting anything, restrict directory ACLs to the owner/system and establish
encrypted storage and recovery-key custody. Use a dedicated private Production
connection file; never reuse staging.env or credentials from an old checkout.

Procedure retained for a future separately approved refresh (completed results are in
the verification report; do not repeat automatically):

1. Dashboard NGO / `pyzyxgpcfwpcqyqrihuo` → Connect: obtain the exact supported
   direct/session connection and CA privately. Verify project, database, TLS certificate
   and `current_user`; use PostgreSQL17 tooling and verified TLS. No guessed pooler host.
2. In a controlled write-quiesced snapshot window, `pg_dump` custom-format a consistent
   full logical database archive, including `app`, ledger, `auth`, `storage`, public
   objects and required extensions. Inventory included/excluded managed objects;
   a selective app-only dump is insufficient. Never print Auth hashes or archive rows.
   Capture owners/grants/role membership separately without exporting role passwords.
   Supabase-managed roles/extensions require compatible restore bootstrap; retain the
   original archive and produce a reviewed restore manifest rather than silently skip errors.
3. Record tool/server versions, UTC start/end, SHA256, TOC, schema/table counts,
   constraints, migration checksums and exclusions. Verify `pg_restore --list`.
4. Restore only into a fresh isolated local matching Supabase PostgreSQL environment
   with no network egress, never over Production/staging. Reconcile managed extension
   bootstrap; require an error-free reviewed restore and compare every backed-up table,
   UUID/role link, constraint and ledger. Apply015 to this restored copy and rerun access
   and preservation checks. Synthetic success alone does not satisfy this step.
5. Establish encrypted retention, off-device recovery copy and owner access, and record
   demonstrated recovery duration. RPO is the snapshot; post-snapshot changes need a
   separate forward-recovery plan. Never assume PITR or a successful test guarantees no loss.

Database archives do **not** contain Storage object bytes. Currently objects0, but
recheck at the snapshot; separately copy/checksum any objects privately with permissions.
Recover Auth Site URL/allowlist, SMTP/templates/providers, Vercel settings, secret-vault
references and Android keystore separately. Never put credentials or Auth hashes in Git.
See [Supabase backups](https://supabase.com/docs/guides/platform/backups) and
[logical recovery guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

Dashboard follow-up completed read-only: actual Site URL and all seven redirects are now
recorded in [final gates](FINAL_PRODUCTION_GO_NO_GO.md); custom SMTP is enabled, sender
name AahaaraConnect NGO. Sender email was tool-redacted and remains a manual confirmation,
along with provider/domain ownership and approved test-recipient readiness. No Production
delivery is verified; staging SMTP success does not establish Production delivery. Broad
redirect patterns/legacy Site URL need owner reconciliation before any approved change.

## E. Security and Production configuration plan

Actual exposure differs from blanket RLS warnings. Anon/authenticated/authenticator/
service_role lack app schema USAGE/CREATE and sampled app SELECT privileges. Four014
tables have RLS/no policy, other legacy tables RLSoff; no demonstrated direct anonymous
app-table access. Do not indiscriminately enable RLS. Six invoker functions have mutable
search_path (defense-in-depth warning); denied schemaCREATE reduces the observed risk.
Leaked-password protection is disabled; plan an independently reviewed policy change.

Express uses pg Pool(max4), verified TLS, server-side Supabase getUser verification and
database role mapping. Application data goes through Express. Existing Production
DATABASE_URL/server secret/CORS/redirect/CA values are opaque; **actual runtime login,
server project binding and effective values remain unproven**. Do not infer the runtime
role from a management postgres session. After approval, use an owner-verified connection
and test `current_user`, NOOWNER/NOBYPASSRLS, membership, all required RLS SELECT/write
permissions, denied ledger/auth/DDL/TRUNCATE/audit rewrites. Migration login stays separate.

| Setting | Approved-release requirement (no values changed now) |
| --- | --- |
| DATABASE_URL | Verified Production-only separate INHERIT LOGIN, e.g. `aaharaconnect_runtime`, member only of015 server group; not owner/admin/BYPASSRLS |
| DATABASE_SSL / DATABASE_SSL_CA | true / correct Production trust chain; do not disable certificate checking |
| SUPABASE_URL | `https://pyzyxgpcfwpcqyqrihuo.supabase.co` |
| SUPABASE_PUBLISHABLE_KEY | Owner-verified Production public key for server token validation |
| SUPABASE_SECRET_KEY | Production server only for private Storage/invitations; combined project needs it in function env, never VITE_/EXPO_PUBLIC_ |
| VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY | Same Production public project; main AND donor entry |
| VITE_API_BASE_URL | `/api/v1` on the single combined Production project |
| CORS_ORIGIN / PUBLIC_APP_ORIGIN | `https://ngo-eight-umber.vercel.app` only unless separately reviewed origins |
| VOLUNTEER_INVITE_REDIRECT_URL | `https://ngo-eight-umber.vercel.app/accept-invite` |
| Auth Site URL / allowlist | Production origin; exact `/accept-invite`, `/reset-password`; no staging/wildcard redirects |
| PUBLIC_VOLUNTEER_REGISTRATION_ENABLED | Currently **true**; pausefalse in approved maintenance release; re-enable only after Production SMTP/callback/proof/rate-limit/idempotency checks |
| VOLUNTEER_IDENTITY_REQUIRED | true only with015 and verified private identity bucket/API; preserves legacy rows |
| FOOD_REQUEST_IDEMPOTENCY_ENABLED | true after015 and matching server deployment |
| DRIVER_TRACKING_REQUIRED | Activate only with Production-configured Android app and operator handover; stage APK cannot report to Production |
| NOTIFICATION_OUTBOX_ENABLED / WHATSAPP_SENDING_ENABLED | false / false; no provider setup/live sending authorized |
| TRACKING_GEOCODING_ENABLED / IDENTITY_DELETION_APPROVED | false / false |
| ANDROID_RELEASE_APPROVED | false; no public download until a separate Production APK approval |
| ANDROID_SIGNING_CERT_SHA256 | Independently verify intended Production signer before assetlinks/native release; never assume staging certificate |

Existing legacy JWT/service-role/POSTGRES_* variables must not be removed/rotated merely
because the candidate no longer uses them; first inventory consumers under approved change control.
No secret literal was found in the sampled current main browser bundle. Candidate
configured main+donor artifact scan passed; this is not a proof of every historical bundle.

**Hosting isolation blocker:** DATABASE_URL, SUPABASE_URL/public client bindings and CA
currently have shared Production+Preview assignments. Main public client references the
Production project, so shared Preview client bindings also target Production. There
are42 READY Preview deployments; protection `all_except_custom_domains` reduces public
reach, but does not isolate credentials/builds. Do not test Preview against real data.
Before any push that can auto-deploy or Production rollout, owner must approve and
verify project-scoped Git deploy freeze/ignore controls, narrow Production credentials
to Production target, and use the two designated staging projects for testing.
The recovery branch already has a validated `vercel.json` guard:
`git.deploymentEnabled["integration/ngo-recovery"]=false`. Preserve it for the authorized
preparation push; this is not authority to deploy. Existing previews retain frozen configuration: owner must review access and retirement;
do not silently delete deployments or rotate credentials. Current main/develop/source
branch mismatch must be resolved in release governance without an automatic merge.
An ignored-build command is only one guard and can be bypassed by redeploy/promotion;
require an explicit immutable artifact/project/target check too.

Private buckets to create **only after approval**:

| Bucket | Privacy and limits | Authorization |
| --- | --- | --- |
| `profile-photos` | private,614400 bytes, JPEG/PNG/WebP | Express authenticated own-profile upload/replace; server decodes/validates; short signed previews; no broad client object policies |
| `volunteer-identity-private` | private,2097152 bytes,JPEG; API input cap500000 and JPEG re-encode | Consent/masked Aadhaar or alternatives, leased anonymous registration path with rate/deduplication controls; authenticated owner replacement; Admin-only review/short signed reads; manual verification before approval |

Buckets/policies currently absent; no client anon/authenticated direct object policies
should be added. API rejects public/unverifiable buckets. Signed links are bearer access
until expiry: keep short, never log/share document URLs. Test both cross-owner and role
denials. Server secret deliberately bypasses Storage RLS; Express boundary is mandatory.

Production `/donor/` currently hard-codes another project's Auth endpoint
`oneiwcfdnqzcyfvxufhc`; that project was not accessed. Candidate already fixes this via
Vite environment substitution. Do not ask users to retry credentials on the old page.
Production assetlinks currently404. Future Production native build needs public API
origin `https://ngo-eight-umber.vercel.app/api/v1`, matching public Supabase project,
web origin, Android package, HTTPS `/open/` association and independently verified signing
fingerprint. No secret in EXPO_PUBLIC_ variables. APK build/publication require separate
approval; do not publish the staging APK.

## F. Ordered gated release and recovery runbook

All following Production actions are **proposed, not executed**. Integration maintainers
and Volunteer, Food/Donor, Logistics, Tracking and Vehicle Details owners review cross-module
auth/schema/runtime/deployment changes. No merge to main/develop or PR26 is included.

1. Freeze candidate application source `580801e9b54937be7ecbc0db592dea6537b95869` and
   lockfile hash below; approve the preparation checkpoint and exact immutable release
   archive. Confirm Production project ID, target and domain again, independent of cwd
   `.vercel/project.json`. Establish approved deploy freeze/Preview isolation before pushes
   that could cause builds. Never `vercel --prod` from an unchecked linked checkout.
2. Obtain separate sensitive backup/rehearsal approval, complete sectionD, record evidence.
   Missing archive/restore proof stops here. Verify owner-supplied effective server bindings,
   runtime privileges, Auth URLs/SMTP, secrets and signing ownership privately.
3. Notify operators; approve a maintenance window and pause registration/dispatch/business
   writes (including old mobile clients) through an explicit ingress/application gate.
   A UI pause alone is insufficient. Reconcile the3 expired active jobs operationally.
   Snapshot again after quiescence if the prior backup is stale. Preserve accepted work.
4. Run [SELECT-only preflight](release/production-preflight-readonly.sql) plus full table
   counts/catalog checks. Retain private before/after UUID-role fingerprints. Stop on drift,
   concurrent writes, new incompatibilities or checksum mismatch. No password extraction.
5. Using the separate verified Production migration-admin connection with TLS, run existing
   `npm run migrate:up --workspace server` from the frozen source. It must skip001–014 and
   apply **only015**; verify ledger15/exact checksum and original table contents/UUID-role
   sets unchanged. On error rollback transaction, investigate; do not reapply by force.
6. Provision separate restricted runtime login/group membership without changing existing
   user credentials. Verify real login permissions including RLS; do not test as postgres.
   Create only the two private buckets above; verify privacy/MIME/size/no client policies.
7. Set reviewed Production-only environment mapping and safe flags; validate bindings
   without echoing secrets. Deploy matching combined Express+web immutable archive to
   **ngo** only with explicit approval. Do not create another backend or point staging at it.
   Verify function/static source and alias atomically where supported; keep ingress paused.
8. Check readiness, anonymous denial, API errors/log redaction, donor/main config, exact
   Auth callbacks, Storage privacy and role/ownership restrictions. Have owners test their
   existing Admin/Donor/Volunteer/Driver accounts privately; no reset/recreation. Verify
   existing approvals/driver/vehicles/jobs/donations and legacy Volunteer/Admin donor profile.
   Do not claim old passwords work until owner-confirmed. No synthetic staging import.
9. Test email only with separately authorized recipient and nonconflicting records; confirm
   actual invitation/reset receipt, callback, pending login and identity/manual approval,
   rate limits/duplicate handling. Test private object denials. No unsolicited real mail.
10. After separate native-build approval, build ONE Production-configured internal Android
    artifact from matching source, inspect signature/permissions/config, configure public
    assetlinks with verified cert, and perform physical background GPS/Maps/photo/deep-link
    tests against authorized Production workflows. No staging APK publication. Keep GPS
    requirement off until the compatible client rollout/handover is complete.
11. Re-enable registration/dispatch only after their gates pass. Monitor login/5xx/errors,
    pool/role failures, uploads/approval, reservation integrity and GPS timestamp/accuracy.
    Record tests and operator sign-off; live WhatsApp/geocoding/deletion/public APK stayoff.

**Rollback:** first pause incompatible writes/registration/dispatch and preserve logs plus
post-snapshot changes. Prefer forward fixes retaining015/proof/audit protections. Old
`b7b321c` code cannot be assumed compatible with newly created driver-only jobs/proof-required
applications; reverting binaries alone is unsafe. A binary rollback is permitted only
after checking all new states and keeping registration/unsupported transitions disabled.
Never drop015 tables or disable the proof gate to make old approvals succeed. A database
restore requires new explicit approval, isolated rehearsal and reconciliation of every
post-snapshot account/business/Storage change; never overwrite Production by default.

## G. Release verification and residual dependency risk

Frozen application candidate `580801e` has the same web/server/shared/lock application
content as web release `42b112f0433afd3f197e7cddfff9c38f4682570e` and the same mobile
content as build source `3e89c26735aa130154268b5928e24178b3448f3d`. Preparation adds only
docs/test tooling. No demonstrated application defect required another feature change.
Lockfile SHA256: `1e64bb18bdf9f2203d562d2b7136928127cad726a6df1f2ea543b688d5d8e2e8`.

Existing APK `776393e8-c33f-48c8-8a0c-fc1a25f65cbc`, version1.0.0/code7,100567019bytes,
SHA256 `9658a6bb55ea18a492c91387e6556a7b7a23a6304c44684ab28f3cef78833c36`.
Prior signature/permissions/credential inspection passed. No new build was requested.
Owner-reported staging acceptance:39 prior manual,170 focused automated,27 hosted and5
replacement APK checks, including physical background GPS/Maps/photos/registration.
These are retained as reported evidence, not independent repeats or Production evidence.

Actual preparation checks: server buildPASS; web TypeScript/Vite buildPASS (unconfigured
build correctly warned missing public vars; separately configured artifact passed all
binding/placeholder/private-literal gates); mobile typecheck/lintPASS; web smoke/i18nPASS;
59 focused server testsPASS across8 files;26 native-link/photo/map testsPASS across4 files;
synthetic migration28/28PASS. The initial frontend invocation used the server workspace
root and discovered no files; the corrected repository-root invocation passed26/26.
The first sandboxed
API run failed19 loopback EACCES tests; rerun with local sockets allowed passed59/59.
Web smoke emitted an esbuild cancellation diagnostic after its pass; command exit0 and
i18n passed. No new hosted Production workflows, native builds or deployments were run.

Current `npm audit`:30 advisories (critical2,high6,moderate19,low3),
[sanitized summary](release/dependency-audit-summary.json). Server production dependencies
audit (`--omit=dev --workspace server`) **0**. This does not mean the whole repository is clean.

| Finding | Actual exposure / disposition |
| --- | --- |
| tinypool/Vitest critical prototype-pollution worker RCE | Test tooling, not deployed Express. Use trusted tests only, no public Vitest API/UI or untrusted code with secrets. Compatible remediation currently involves major tool upgrade; record owner risk acceptance or test upgrade separately. |
| decode-uri-component high via Expo Router/query-string | Native runtime deep-link DoS risk. Existing native-intent guard rejects percent escapes, nonASCII and over512 chars before routing; unit coverage exists. Residual native behavior needs hostile-link physical verification/risk decision; SDK58 major upgrade is not silently applied to tested SDK57 APK. |
| Vite high dev-server/editor/path issues | Build/dev tooling; deploy static output only, never expose Vite dev/preview server publicly. Limit trusted local access; upgrade in separately tested change. |
| zod3 high in Expo/lint tooling | App/shared/server useZod4; remaining tooling chain requires compatible upgrade. No demonstrated public Express exposure. |
| Moderate/low transitive findings | See package-level summary; maintain upgrade backlog and trust boundary, do not run blanket auditfix that invalidates tested native lockfile. |

Advisory references: [tinypool](https://github.com/advisories/GHSA-85c8-ppgw-ccpr),
[decoder](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
CI uses synthetic local PostgreSQL and trusted tooling; never add Production secrets to
untrusted branch/test jobs. Residual security disposition requires integration-owner signoff.

## H–I. Decision and consolidated approval boundary

Verified: environment identities, migration compatibility, existing account mapping,
synthetic preservation/RLS tests, tested staging source/artifact lineage, local builds.
**Blockers:** off-device encrypted backup/key custody; shared Preview Production bindings and
deploy governance; actual runtime/server bindings unknown; Production Auth/SMTP unknown;
operator handover for active expired jobs; Production native/domain/cert verification.
Dependency/native-link residual risks require a documented owner decision. No Production GO.

**Backup-only approval completed:** encrypted logical backup of `pyzyxgpcfwpcqyqrihuo`,
including Auth recovery records, restricted role/configuration metadata and isolated
local restore45/45PASS. No restoration over Production and no schema/configuration/
deployment writes occurred. Next establish off-device key custody and remaining effective
configuration evidence before requesting approval of the release change set below.

The subsequent consolidated Production change set to review after those gates pass is:
project-scoped deployment freeze/Preview credential isolation; approved maintenance ingress
pause;015 with the exact checksum; separate restricted runtime login; two private buckets;
Production-only config/safe flags; combined web/API deployment of the frozen candidate;
authorized existing-account/email/security checks; controlled workflow resumption. No
account reset/role remapping/data replacement/credential rotation/preview deletion, no
main/develop merge, no WhatsApp/geocoder/deletion/public APK, no EAS build is included.
Return the measured restore evidence and immutable release artifact revision before
requesting approval to execute that Production change set.
