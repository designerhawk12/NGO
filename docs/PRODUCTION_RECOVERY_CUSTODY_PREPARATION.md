# Recovery custody and role-mapping preparation — 2026-11-10

## Current custody status — 2026-11-10

**Off-device encrypted archive upload/integrity: PASS.** Authorized Drive file
`1SBuQmXw1iUybM1EJi1WdFdFbK6VevoGz`, restricted interim personal folder
`1VMVrMTYvda5g1nbLxMNN0Ngk6Ad91jiA`. User manually downloaded the file; Codex hashed
`C:\Users\desig\Downloads\database.dump.gcm`, not the original. Size 584722 and SHA-256
`63efae09259219a9dca0d8844ce0ded581b0bd8c83f020b141656623db25316f` matched.
MFA, non-laptop-only account recovery and interim custody are user-confirmed; permanent
NGO ownership, separate escrow and independent recovery are still pending.

**Independent recovery: NOT VERIFIED. Production: NO-GO.** Archive is historical;
SMTP synthetic activity and later writes are outside its snapshot. Fresh approved
Production snapshot/integrity baseline remains required immediately before 015.

### Read-only implementation findings

Only documentation and source were inspected in this preparation. Neither helper was
executed and no key file was read. `production-recovery.cjs` defines AAH-GCM1 format:
8-byte magic/AAD, 12-byte nonce, ciphertext, final 16-byte GCM tag; encryption key is
32 random bytes. DPAPI CurrentUser protects the key locally, not the archive format.
A separately escrowed copy of that exact key can authenticate/decrypt the same archive
on another machine without the original Windows profile. A new random key cannot
unlock the existing archive; base64 is encoding, not protection.

`production-restore-verify.cjs` currently calls protectedKey(manifest.keyFile) immediately
and enforces the original private-directory layout. **Do not run it for portable testing
as-is.** A separately reviewed local-only adapter must take key bytes from approved
vault recovery in memory, enforce archive identity/project gates, remove dependence on
the old DPAPI path, and retain verification/isolation/cleanup safeguards. No such
adapter was implemented or executed in this pass.

The existing full rehearsal additionally requires manifest, snapshot-metadata.json.gcm
and (where manifest specifies) cluster-settings.json.gcm, plus tooling/image identity.
Encrypted metadata carries role definitions/memberships, counts/digests and settings
needed for faithful reconstruction. Upload approval covered only database.dump.gcm:
**these companions are not claimed off-device**. Before transfer, review manifest and
instructions for private paths, role settings or credentials; never upload an original
manifest blindly. Prepare a portable sanitized manifest with approved relative paths,
file checksums, format and image identity, and keep confidential baseline metadata
in its existing encrypted form. Additional package transfer requires exact approval.

### Proposed escrow and roles (not authorized for execution)

- Backup custodian: manages restricted encrypted archives, versions/checksums and
  retention; does not need decryption-key access.
- Independent key custodian: organization vault administrator/recovery custodian;
  manages escrow access, MFA, emergency recovery and audit history separately from Drive.
- Recovery operator: named person on an independent approved device; receives temporary
  minimum access to both materials for an authorized rehearsal, with custody oversight.
One personal account holding everything does not establish independent NGO recovery.
Document any interim role overlap explicitly and arrange independent access/recovery.

Choose an organization-controlled vault supporting secret insertion/retrieval through a
reviewable secure API/SDK or protected prompt/pipe, MFA and audited restricted membership.
Confirm offline/emergency vault recovery is independent of the original laptop and
personal Google account. Do not put key material in Drive, Git, chat, command arguments,
environment variables, clipboard, terminal output, screenshots or persistent plaintext.
After explicit approval only, a reviewed helper would unwrap once under the original
Windows identity, validate 32-byte length, place the exact key into the specified vault
item through its supported protected channel and clear buffers on best effort. Managed
runtime copies/pagefile cannot be guaranteed erased: use a trusted encrypted device,
no transcript/debug logging/core dumps, and review vault/client telemetry first.
Preserve the existing DPAPI key and archive; do not rotate/re-encrypt them for this test.
Vault confirmation and independent decryptability, not a displayed key, prove escrow.
If the provider cannot safely support this route, stop and revise the method.

### Second-device procedure — after separate authorization

1. Name operator/device, encrypted temporary directory, time window and cleanup owner.
   Provision trusted reviewed tools and matching pinned Supabase PG17 image before
   handling secrets; scan/review restore adapter using synthetic keys/data first.
2. Download exact authorized archive and approved encrypted companions. Verify all
   checksums against the approved portable manifest; retain immutable originals.
3. Operator obtains the key through separate vault MFA, without access to the original
   Windows user/profile. Load only into protected process memory; never print or save it.
4. Verify format, project and AES-GCM tag before supplying any plaintext to pg_restore.
   Do not stream unauthenticated GCM plaintext into a database before tag validation.
5. Start fresh local container with network none, no ports, Unix socket only, read-only
   root, dropped capabilities, no-new-privileges, disabled Docker logging, RAM-backed
   database/archive/WAL and bounded memory/swap settings. No host DB/service sockets,
   Production environment files/credentials or network/database URLs may be supplied.
   Start PostgreSQL only: no Supabase Auth, workers, email, webhooks or integrations.
6. Restore roles/memberships/settings and dump only in this isolated database. Retain
   exit-on-error behavior and validate counts/full-row digests, Auth identities/password
   hash preservation, role attributes, constraints, app/Auth links and all 001–014
   ledger names/checksums against the historical encrypted baseline. Never compare this
   historical snapshot to current Production by opening a live connection.
7. Record sanitized checks, image identity, checksum, operator/time, limitations and
   failures. No rows, password hashes or key values in evidence. Remove container and
   disposable decrypted material; verify cleanup. Keep only authorized encrypted package,
   escrow and sanitized instructions/results. Stop on any failed check; do not repair
   Production or run migrations as part of rehearsal.

### NGO ownership handover and exact next approval

Supply NGO legal/operating owner and authorization record; long-term Drive tenant/folder
or documented personal interim ownership/exit arrangement; vault provider/organization/
vault and exact item destination; named backup/key custodians, independent operator and
second device; MFA/recovery membership evidence, access-review and retention owners.
Define loss/incapacity recovery, revocation, eventual personal-to-NGO handover and routine
backup scheduling. Storage file bytes, external configuration/secrets and database-role
passwords remain separate recovery components, not covered by this database archive.

Next approval must name: exact existing DPAPI key locator (identified securely locally,
not key contents), vault organization/item/custodians, reviewed memory-only escrow helper,
exact approved encrypted companion files and Drive folder, portable-manifest scope,
independent operator/device and isolated rehearsal/cleanup boundaries. Approval may be
split into (A) helper/package preparation using synthetic data, (B) one-time key escrow
and specified companion transfer, (C) second-device restoration. No blanket approval,
key action or sensitive transfer is implied by this plan. Destination facts are still
missing, so B/C cannot yet be finalized or executed.

Approved single-request test checkpoint (2026-11-10): user authorized exactly one
synthetic authenticated /me and normal DONOR app-user/profile provisioning. Read-only
inspection confirms the same confirmed Auth identity, Auth role authenticated, no
application mapping and no role metadata. No /me request has been made: a legitimately
authenticated synthetic session is not available to the agent. No password/token was
requested or extracted, and no admin-generated session was substituted. Private user
sign-in handoff is required before executing the one-shot request. Approval remains
limited to this identity; no retries, emails, migrations or other writes authorized.

Production remains NO-GO. SMTP acceptance is PASS; no repeated delivery tests.

## Synthetic identity: read-only result

Production Auth identity is confirmed, role authenticated, with no app role metadata
and no app.app_users mapping. No ADMIN, VOLUNTEER or DRIVER application grant exists.
The deployed-source b7b321c and current source both authenticate through
findOrCreateAppUser: first authenticated /api/v1/me inserts an app_users DONOR row and
canonical donors row in a transaction. It may update an existing DONOR display name on
conflict. Thus GET is not read-only. **No /me request was made and no session/token was
obtained.** Specific approval required for provisioning only this synthetic identity's
DONOR app-user/profile and verifying its response/privilege denials. Use recipient's
private authenticated session; never request password/token in chat. Existing accounts
must remain untouched; no generated sign-in link or additional email is authorized.

## Destination-specific custody facts required from NGO

Provide non-secret facts only:
- Organization and managed cloud tenant/account; provider and exact restricted folder ID.
- Backup custodian and independent key custodian (names/organization identities).
- Separate organization password-manager vault/escrow and exact item destination ID.
- Named authorized recovery operators, including an independent operator/device owner.
- MFA status, least-privilege membership, recovery-access method and access-review owner.
- Second device OS/PostgreSQL/container capability, encrypted disk and approved private
  working directory; intended test window and evidence retention/disposal policy.
Do not provide keys, passwords, recovery codes or decrypted records in chat.

## Procedure after separate exact transfer/key-export approval

1. Revalidate encrypted archive path and SHA-256 against existing verified evidence.
   Retain laptop original. Check organization ownership, folder membership/MFA and no
   public/link-wide sharing. Independently verify vault membership/recovery access.
2. Current key is Windows DPAPI CurrentUser-bound: copying its protected file to another
   device is insufficient. Approve an explicit secure rewrap/escrow mechanism supported
   by the organization vault, separately from archive upload. Unlock locally, wrap/store
   via secure operator path, never plaintext files/clipboard/logs/chat. Fail closed if
   supported secure custody cannot be established. Do not place key beside archive.
3. Transfer only the encrypted archive and sanitized checksum/scope instructions to the
   approved folder. Verify downloaded SHA-256 from the independent device and authenticate
   AES-GCM before restore. Checksum alone does not prove decryptability.
4. Independent operator recovers key through separate custody with MFA, proving recovery
   without dependency on the original laptop/user. Document access success without key.
5. Restore only into isolated local PostgreSQL matching supported Supabase/PG17 objects,
   network disabled where practical, no service/webhook/email workers and no remote
   database connection. Stream decryption without persistent plaintext archive; restrict
   restored data to encrypted temporary storage. No connection to Production or staging.
6. Run existing recovery verification against saved encrypted baseline: table counts,
   full-row integrity, Auth/password-hash preservation, constraints, relationships,
   roles and migration checksums. Preserve sanitized results only; never publish Auth data.
7. Remove disposable restored data/key material and temporary container; record cleanup,
   operator/time, checksum and outcome. Retain approved encrypted archive/escrow and
   recovery instructions. Logical backup excludes Storage bytes and external settings/
   secrets; inventory/recover those separately under their own approvals.

Existing backup already passed 45/45 locally. Do not repeat that test on the development
laptop. Independent second-device verification is a distinct custody gate.

## Migration 015 gates versus later release gates

Still blocking approval/execution of 015 under the prepared release plan:
- Organization recovery custody and independent recovery evidence above.
- Fresh approved pre-change encrypted snapshot and current integrity/drift baseline;
  existing backup predates synthetic SMTP activity and cannot cover newer records.
- Named migration/rollback operators, controlled write pause including old clients/jobs,
  frozen candidate/checksum, reviewed rollback/reconciliation and explicit SQL approval.
- Confirm permission/prerequisite assumptions and planned restricted runtime handover;
  never execute a release with migration-admin runtime credentials.

SMTP is no longer a blocker. Synthetic /me provisioning is separate acceptance, not a
SQL dependency. Private buckets, restricted runtime login and matching deployment are
ordered follow-on operations requiring separate approval; their absence does not itself
prove 015 SQL cannot run. Physical Production Android acceptance, legacy redirect review,
operator ownership and remaining application/security signoffs still gate pilot GO.
No roles, buckets, migration, deployment, backup transfer/key export or email authorized
by this document. Consult existing release plan for exact 015 checksum and sequence.
