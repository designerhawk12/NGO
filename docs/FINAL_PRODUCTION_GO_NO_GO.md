# Final Production release gates — 2026-11-10

**Decision: NO-GO for Production release.** Read-only checks and local preparation
are complete. No015, permission/Auth/SMTP/hosting change, email, deployment, build,
backup transfer or key export occurred. Existing backup was hashed, not restored again.

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
| Preview isolation | **FAIL**: Production DB/public Supabase/CA/CORS entries share Production+Preview scopes | Prevent Git Preview builds, remove Preview bindings under approval, review existing protected previews; old artifacts keep frozen bindings | Vercel/Git owner + integration maintainer | No; correction is hosted configuration |
| Recovery-branch push safety | **PASS**: existing `git.deploymentEnabled["integration/ngo-recovery"]=false` preserved; CI pushes only main/develop | Keep guard; never merge or manually deploy by inference | Integration maintainer | Yes |
| Production deploy governance | **BLOCKED**: configured Production branch main, repo default develop, active source integration/b7b321c | Owner approves immutable manual release and project-scoped automatic-deploy freeze; do not merge just to align names | Git/Vercel owner, unconfirmed | Planning yes; hosted controls need approval |
| Actual current API runtime identity | **NOT VERIFIED**: Vercel DATABASE_URL opaque; dedicated backup connection is postgres, not proof of deployed API role | Privately establish effective deployed DB/server Supabase binding; current backup login is overprivileged for runtime | Integration maintainer + secret owner | Read-only evidence yes; any replacement needs approval |
| Restricted Production runtime | **BLOCKED**: Production has no aaharaconnect_api/runtime roles; postgres has CREATE/CREATEROLE/CREATEDB/BYPASSRLS | After015, provision separate non-owner/NOBYPASSRLS login with finite group grants; test actual login | Database owner + integration maintainer | SQL prepared; execution changes Production |
| Anonymous app schema access | **PASS**, limited scope: anon/authenticated/authenticator lack app USAGE/CREATE and SELECT;32 tables;0 app sequences | RLSoff warnings alone do not demonstrate anonymous data access. Keep client roles out of app; review future grants | Integration/security owner | Yes |
|015 and private Storage readiness | **BLOCKED**: only015 pending; Production buckets/policies0 | Approve015 exact checksum, restricted runtime and two private buckets; never publish proof/photo storage | Integration + Volunteer owners | No for provisioning |
| Admin/account mappings | **PASS**: requested original Admin exists/confirmed/linkedADMIN/not disabled;14 Auth,11 app users,0 orphan app links | Password not tested; preserve every UUID/password/role/approval/history. Owner triage3 unmapped Auth identities | NGO Admin + integration maintainer | Read-only evidence yes |
| Production Auth policy inspection | **PASS**, partial: public settings200, email provider enabled, disable_signup=false, mailer_autoconfirm=false | Email confirmation required. This does not prove SMTP or URLs | Auth owner | Yes |
| Production Auth URLs | **BLOCKED** for release reconciliation: Dashboard Site URL is ngo-equinox10.vercel.app, not the frozen release origin; seven redirects include preview-host wildcards. Exact invite/reset callbacks are present; no broken login is inferred | Owner confirms legacy-alias requirements; approve canonical Site URL and narrowed allowlist without breaking outstanding legitimate links | Supabase/Auth owner, unconfirmed | Inspection complete; correction needs Production configuration approval |
| Custom SMTP presence | **PASS** for configuration only: Dashboard Enable custom SMTP switch is on; sender name AahaaraConnect NGO | Sender email was tool-redacted: owner must manually confirm address/domain/provider ownership. Delivery remains untested | Auth/mail owner, unconfirmed | Yes; no credential reveal or email needed |
| Production email delivery | **NOT VERIFIED**: no Production email sent | Separate authorized recipient/fixture/invite/reset test and confirmed receipts/callbacks | Auth owner + recipient | Delivery can create Auth/app records; explicit approval required |
| Public Volunteer registration | **BLOCKED**: current Production flagtrue; new proof/Storage prerequisites absent | Pause during approved cutover; re-enable only with proof/rate/deduplication and confirmed Production SMTP | Integration + NGO operator | No flag change authorized now |
| Current Donor web routing | **FAIL**: old Production donor artifact references foreign Auth project oneiwcfdnqzcyfvxufhc | Candidate fixes env substitution; never test credentials on old page or access foreign project | Food/Donor + integration owner | Local fix already present; deploy requires approval |
| Operator handover | **BLOCKED**:3 expired nonterminal assignments; named owners/contacts not supplied | Decide safe handover through normal approved workflow; never auto-extend food windows/cancel history | NGO dispatch/food-safety lead | Planning yes; business actions need owner authorization |
| Production Android/App Links | **BLOCKED**: current assetlinks404; existing validated APK targets staging | Confirm Production package/signer/config, separately approve internal native build and physical checks; never publish staging APK | Android/signing owner | Preparation yes; hosted/build actions need approval |
| Accepted source and checks | **PASS**: prior85 focused tests+28 synthetic migration checks/builds; prior owner-reported staging physical acceptance; new4/4 local crypto/key-preservation tests | No new app code change or broad regression needed; residual dependency risks require owner disposition | Integration/security owner | Yes |

## Verified environment relationships and isolation correction

Production: Supabase `pyzyxgpcfwpcqyqrihuo`; Vercel `ngo` /
`prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`, teamequinox10. One existing combined web/Express
deployment, stable `https://ngo-eight-umber.vercel.app`, current
`dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR`, sourceb7b321c. Git link is designerhawk12/NGO,
configured main. Public main artifact targets Production Supabase and `/api/v1`.
The old donor artifact is the demonstrated exception above; no foreign project accessed.

Designated staging web `prj_W1MrwAqFsWTFohHs6UXR2fo1EEIL`, latest
`dpl_5Ya46jG23KCua5tG3gXkA2cKnWHP`; API `prj_Nd3YLsJkOYjlZMPLmFZw9MFG88Ul`,
latest `dpl_9WrBdHU8JP4KD2CVBQpkUbwzJDqi`. They currently have no Git link in returned
project metadata; approved manual staging deployments remain unchanged. Prior hosted
checks established staging projecttughgqggsndtraaymtvf; no need to rerun all workflows.
Environment labelProduction inside those **staging project IDs** is not the live NGO project.
Staging APK776393e8/source3e89c26 binds staging; candidate Production build needs its own
public Supabase/API/web origins. No Production secret belongs in VITE_/EXPO_PUBLIC_.

Current Production shared Production+Preview entries:
`DATABASE_URL`, `DATABASE_SSL_CA`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGIN`.
There is also a separate Preview `VITE_API_BASE_URL` entry; its value is opaque.
Production SUPABASE_SECRET_KEY is Production-only; do not claim it leaks into Preview.
Public project binding identifies the client target; opaque server credentials are not
independent proof of every historical function's connection target.

**Proposed correction, no settings changed:**

1. On Production projectngo only, disconnect its Git repository link to prevent automatic
   Git deployments/Preview creation pending immutable release approval. This does not delete
   the Git repository. Keep staging projects and stable Production alias unchanged.
2. Narrow those seven existing entries to Production only, preserving values/types;
   remove only the separate Preview VITE_API_BASE_URL binding. Do not put staging credentials
   into this Production project; designated staging projects provide test hosting.
3. Verify environment targets and Git behavior with read-only metadata. Existing42 READY
   previews seen in the prior inventory remain protected (`all_except_custom_domains`)
   but retain frozen bindings. Owner reviews access/retirement; no deletion/rotation
   is included. A fresh scope change does not sanitize already built deployments.
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

Read-only authenticated in-app browser inspection on2026-11-10 positively displayed
projectNGO and refpyzyxgpcfwpcqyqrihuo in the Dashboard URL. This resolves the earlier
MCP capability gap; it does not authorize settings changes. No form field was edited,
Save remained disabled and no email was sent. Native Brave URL-verification limitations
were not bypassed; the supported in-app browser exposed the exact project URL.

**Current Site URL:** `https://ngo-equinox10.vercel.app/`.
**Current allowed redirects (all seven, unchanged):**

- `https://ngo-eight-umber.vercel.app/accept-invite`
- `https://ngo-eight-umber.vercel.app/reset-password`
- `https://ngo-equinox10.vercel.app/`
- `https://ngo-equinox10.vercel.app/**`
- `https://ngo-*-equinox10.vercel.app`
- `https://ngo-*-equinox10.vercel.app/**`
- `https://ngo-eight-umber.vercel.app/**`

The default URL differs from the frozen release origin, and matching preview hosts are
allowed Auth callbacks. Combined with Preview bindings, this increases the risk of users
authenticating through a non-approved frontend. No actual token theft or broken legacy
alias is claimed. Owner must establish which old aliases/outstanding callbacks remain
legitimate before approving a narrowed allowlist. Desired future canonical origin remains
`https://ngo-eight-umber.vercel.app` with exact invite/reset callbacks; nothing was substituted.

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

Future delivery test requires explicit approval for one Production-authorized synthetic
recipient not already present in Auth/app users (previous staging recipient authorization
does not carry over). Approve the small synthetic application/proof records created by
the normal invitation workflow. Send one invitation, confirm receipt/domain/callback and
pending sign-in, then send one reset only after recipient confirmation; verify callback
and continued pending state. Capture sanitized timestamps/message status, no passwords
or tokens. Never test by resetting the original Admin. Ambiguous outcomes require
reconciliation, not repeated sending. Any cleanup needs separate reviewed authorization.

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

## Consolidated next approval request

**Approve only the hosted isolation correction** forngo /
`prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`: disconnect only its Git repository link pending release;
narrow the seven named shared bindings to Production, preserving values/types; remove
only the Preview VITE_API_BASE_URL binding; read back targets/controls. Do not deploy,
delete existing previews, rotate credentials or change the stable Production alias.

In the same response, supply the non-secret Dashboard/ownership facts and exact proposed
off-device destination/key-custody identifiers. Transfer/export requires its own concrete
destination-specific approval after those facts are available. **This is not a request
to approve015, roles, buckets, Auth/SMTP edits, email tests, builds or the Production release.**

Owner follow-up: original URL values and SMTP-enable status are now independently read.
Still manual: redacted sender address/provider ownership; formal NGO ownership of backups,
deployments and account recovery; cloud folder/vault custody identifiers. All remain pending
organizational handover, not inferred from personal developer access. The owner did not
approve the proposed isolation correction; it remains a proposal, not an executable task.
