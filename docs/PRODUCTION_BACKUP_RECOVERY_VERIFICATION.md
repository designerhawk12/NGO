# Production encrypted backup and isolated recovery — 2026-11-10

Latest custody update (2026-11-10): **off-device encrypted archive upload/integrity PASS**.
Drive upload and manually downloaded 584722-byte copy match original SHA-256. This does
not verify independent recovery: DPAPI-independent escrow, approved encrypted metadata
companions/portable tooling, NGO handover and second-device restore are pending. Only
source/docs were inspected in this preparation; no key access/decryption/transfer.
Historical snapshot still requires a fresh approved snapshot and integrity baseline
immediately before 015. Production remains NO-GO. See
[custody procedure and next approval](PRODUCTION_RECOVERY_CUSTODY_PREPARATION.md).
Earlier custody statements below are historical and superseded only as noted here.

**PASS for the approved backup/recovery scope. Production release remains NO-GO.**
Project reidentified through Supabase MCP as NGO, `pyzyxgpcfwpcqyqrihuo`,
ACTIVE_HEALTHY, eu-west-2, PostgreSQL17.11. All Production operations were reads.
No015 migration, account/configuration change, deployment or staging operation occurred.

## Backup artifact and custody

Private directory:
`C:\Users\desig\AppData\Local\AahaaraConnect-Production\pre-015-20261109T203730Z\`

Archive: `database.dump.gcm`, **584722 bytes**.
SHA256 of the encrypted archive:
`63efae09259219a9dca0d8844ce0ded581b0bd8c83f020b141656623db25316f`.

Backup transaction started **2026-11-10 02:07:32 IST**
(`2026-11-09T20:37:32.602Z`); completed **02:09:06 IST**
(`2026-11-09T20:39:06.742Z`). The directory uses UTC in its name.
One exported REPEATABLE READ, READ ONLY snapshot supplied both aggregate/digest
evidence and pg_dump. Explicit `transaction_read_only=on` was checked inside the
transaction. Supabase pooler startup options alone did not establish read-only mode;
the implementation therefore uses the explicit transaction. No database default changed.

PostgreSQL17.11 custom-format **full database** dump, retaining object ownership and
ACL definitions, includes application records/history/ledger, Auth identities/password
hashes/sessions, Storage metadata and extension/configuration objects. Separate encrypted
metadata records30 PostgreSQL roles,24 memberships/grantors,15 role settings and10
role/database setting records. Per-database metadata was read separately after the main
snapshot; it has its own capture time and checksum. It is not presented as snapshot-atomic.

AES-256-GCM: fresh random256-bit key,96-bit nonce per file,128-bit authentication tag.
The key is stored separately in `AahaaraConnect-RecoveryKeys`, encrypted with Windows
DPAPI CurrentUser. Backup and key directories have inheritance disabled and owner/SYSTEM
access only; ACLs were checked. No key/password value is in the repository, logs or chat.
pg_dump output was captured/encrypted in memory; no plaintext dump file was written to
the Windows filesystem. A SHA256 and authenticated decryption were checked before restore.

**Custody limitation:** DPAPI recovery requires this Windows user/profile/master keys.
A backup of only the encrypted archive and `.dpapi` file is not a portable disaster
recovery solution. Owner must establish a separate secure key/profile escrow and an
off-device encrypted backup copy. Never send keys through chat. No paid service needed.
No such off-device custody or second-machine recovery is claimed verified.

## Isolated restoration and preservation

Final rehearsal completed **2026-11-10 02:15:55 IST**
(`2026-11-09T20:45:55.998Z`), **45/45 checks passed**.
Restored with normal pg_restore ownership/ACL handling and exit-on-error into a fresh
Supabase PostgreSQL17.11 image. Image ID:
`sha256:c141fd17ac6a76c4323e90b3aee8ff1a23d2e89e547c2b963cfadc309c079cc2`.

Container safeguards: networknone, no published ports, Unix socket only, read-only root,
all capabilities dropped, no-new-privileges, Docker loggingnone, RAM-backed `/tmp`
for database/WAL/archive,1GiB memory and no additional container swap allowance.
No Auth/Storage HTTP services or background integrations were started.

| Preservation check | Result |
| --- | --- |
| Source/restored tables | All73 counts and full-row MD5 digests matched; zero differences |
| Auth users / identities |14 /14; every Auth field including password hashes matched |
| Application users |11: Admin1,Donor5,Driver1,Volunteer4 |
| Missing app-to-Auth links |0 |
| Volunteers / applications |4 /3; approval records unchanged |
| Donors / Drivers / vehicles |6 /1 /3 |
| Donations / pickups / assignments |8 /8 /5 |
| Constraints |319 across backed-up schemas, definitions and validation states matched |
| Migration history |001–014 names and SHA256 checksums match exactly;015 absent |
| Database roles |30 inventoried; non-bootstrap attributes preserved; all role setting keys/normalized values verified |
| Memberships |24 membership permission sets preserved; original grantor metadata retained separately |
| Storage buckets / objects |0 /0 at snapshot |

SHA256 authenticates archive identity; AES-GCM authenticates ciphertext. MD5 full-row
digests are used only for deterministic restoration comparison, not encryption/security
or a substitute for the archive SHA256. No row contents or password hashes were printed.

The local postgres bootstrap remains superuser so restoration can create managed roles
and objects; this differs intentionally from hosted postgres and does not establish
Production runtime least privilege. Managed database-role login password hashes were
not exported. Auth password hashes **were** preserved. Reprovision database connection
passwords from the owner's secret vault under a separate approved recovery procedure.
Membership grantor provenance is in encrypted metadata; the local test verifies effective
membership options, not a provider-managed role administration service.

Local role-configuration reconstruction needed corrections for list-valued GUCs,
read-only defaults and canonical time-unit spelling. These were restore-tool issues,
not Production mutations or database incompatibilities. The final verification passed.
The original database archive was not regenerated or changed during these rehearsals.

All restore containers created for this verification were removed with their volumes after each attempt.
The final no-container check passed. Plaintext archive/database/WAL existed only in
the removed container's tmpfs. Physical host-memory/pagefile erasure cannot be independently
attested; no persistent plaintext dump or Docker data volume was intentionally created.

## Recovery instructions and exclusions

The private directory retains `manifest.json`, encrypted archive/metadata/TOC,
`restore-report.json`, `RECOVERY_README.md` and self-contained recovery scripts.
The manifest has file hashes/tool versions and the separate protected-key locator.
Use the README to authenticate and rerun only an isolated local rehearsal. Do not
restore over Production/staging. Missing DPAPI identity/key custody stops decryption.

Not covered by a logical database archive:

- Supabase Storage file bytes (none existed at the snapshot; future objects need a separate copy).
- Auth Site URL/redirect allowlist, SMTP/provider/template settings and externally held secrets.
- Supabase platform configuration, JWT signing material not held in database objects,
  network policies, service deployment versions, infrastructure/PITR or physical WAL recovery.
- Vercel settings/secrets/deployments/domains, Android keystore/build credentials and external integrations.
- Database-role login password recovery; do not reset any existing password merely to test the archive.

This is a point-in-time manual backup with RPO at the snapshot. It does not capture
later writes and creates no managed retention/PITR. A separately approved fresh snapshot
and operator write coordination are needed immediately before a future cutover.
Official guidance: [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[Supabase backup limitations](https://supabase.com/docs/guides/platform/backups),
[Windows DPAPI](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata).

## Remaining approval boundary

Backup/isolated recovery gate now passes for local logical recovery; the earlier synthetic
015 compatibility evidence remains valid. **015 was not applied even to this restored copy.**
No Production release is authorized or executed. Still required: off-device key custody,
Preview/Production credential isolation and deploy governance, actual restricted runtime
connection proof, Production Auth/SMTP evidence, expired active-job handover, and native
Production signer/App Links configuration plus residual dependency risk disposition.

Next Production change set for separate review/approval, after configuration evidence:
project-scoped deployment freeze/Preview isolation; maintenance ingress/write pause and
fresh backup; exact015 checksum from the release plan; separate restricted runtime login;
two private buckets; verified Production-only environment mapping/safe flags; immutable
combined web/API deployment; authorized owner login/email/security checks and controlled
workflow resumption. No account recreation/reset/data import, role remapping, WhatsApp
sending, EAS build, main/develop merge or public APK publication is included.

See [Production release plan](PRODUCTION_RELEASE_READINESS.md) and the
[sanitized verification summary](release/production-backup-verification.json).
