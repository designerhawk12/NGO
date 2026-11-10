# Recovery custody and role-mapping preparation — 2026-11-10

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
