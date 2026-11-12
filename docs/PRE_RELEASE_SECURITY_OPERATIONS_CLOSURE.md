# Final security and operations preparation — 2026-11-10

Subsequent explicit retirement approval was executed successfully; see
[HISTORICAL_PREVIEW_RETIREMENT.md](HISTORICAL_PREVIEW_RETIREMENT.md). Exactly42 IDs and
5 aliases retired,47 URLs404,32 others/Production/staging unchanged. Proposal/read-only
wording below is preserved as the earlier preparation checkpoint; it grants no further
deletion or release authority. Remaining Auth/SMTP/custody/release gates still apply.

**Production release NO-GO.** This pass used read-only Vercel/GitHub/HTTP/Dashboard
inspection and local documentation only. No deletion, credential read/decryption/rotation,
Auth/email/configuration change, database write, build/deploy, backup transfer or key export.
The45/45 isolated restore and staging acceptance were not repeated.

## Historical Preview exposure

Exact42 previously inventoried READY Previews were positively matched to projectngo /
`prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`, teamequinox10 /
`team_lRAI0kP7NNOxCUPBitJQ3d95`. Active Production remains
`dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR`; Git remains disconnected.

| Read-only check | Verified result |
| --- | --- |
| Deployment roots |42/42 redirect unauthenticated clients to Vercel authentication |
| Roots + readiness paths + current aliases |89 cookie-free GETs; all302 to the Vercel authentication gate;0 public responses |
| Current Preview aliases |5, allprotected; none a custom domain |
| Project domains |Only verifiedngo-eight-umber.vercel.app, attached to Production; no custom domain bound to the42 Previews |
| DATABASE_URL / SUPABASE_URL binding names |Present on22/42; treat as potentially Production-bound credential-bearing artifacts |
| DATABASE_SSL_CA / VITE config names |21/42; full per-deployment inventory retained |
| SUPABASE_SECRET_KEY / SERVICE_ROLE / JWT_SECRET names |Not present on any of the42 deployments' environment-name lists |
| Other20 Previews |No listed DATABASE_URL/SUPABASE_URL names; compiled/hard-coded client bindings cannot be ruled out from names alone |
| Protection |Project policyall_except_custom_domains unchanged; no bypass token or authenticated Preview access used |

The public deployment API exposes environment **names**, which were validated as names
before use. No environment-value/decryption endpoint, artifact secret scan or application
data endpoint was used. Exact historic values/targets are not inferred from names alone.
The22 relevant artifacts predate scope correction and could retain Production bindings;
the other20 are not certified free of embedded configuration. No unauthorized access or
secret leak is demonstrated. Authorized Vercel users/existing bypass mechanisms can still
have access; unauthenticated protection is not proof of zero historical exposure.

Live `/aliases` assignments were inspected separately from deployment.alias metadata:
historical alias strings can remain after an alias moves. Cleanup must use current mapping,
not delete the Production branch alias because an old Preview metadata array mentions it.
No Preview currently owns either stable Production alias.

**Active-use status: NOT VERIFIED.** Open PR25 (tracking) and PR26 (recovery) still exist.
Protection, old build age and lack of a custom domain do not establish that a reviewer,
operator or bookmark no longer depends on a Preview. Owner/reviewer retirement attestation
is mandatory. No traffic/user telemetry was extracted to guess business necessity.

### Exact proposed cleanup action set — not executed

Scope is [proposed-preview-retirement.json](release/proposed-preview-retirement.json):
**42 exact deployment IDs and5 explicitly mapped Preview aliases**. It is a closed list,
not a project-wide deletion or a query whose future results are automatically deleted.

1. Obtain explicit deletion approval and owner/reviewer confirmation that all42 URLs and
   the5 aliases are no longer required, including PR25/26 reviews. If any must remain,
   stop and revise the manifest for review; do not infer approval for a smaller/new set.
2. Revalidate team/project/target/state and each alias's current deployment mapping. Abort
   if a target was promoted, adopted for live use, or an alias moved. Preserve active
   Production deployment and bothaliases, all other32 inventoried deployments, staging
   projects, Git repository/history, database records, credentials and protection.
3. Delete only those42 Preview deployment IDs. Remove only the5 listed aliases if still
   present and still mapped as expected; never follow historical alias metadata blindly.
4. Verify retired URLs unavailable, Production homepage/health/readiness and aliases intact,
   anonymousme401, no deployment/promotion and staging unchanged. Record sanitized evidence.

Impact: Preview bookmarks/PR review links and rollback access to those42 artifacts stop
working. No Production downtime is expected from a correctly gated deletion, but this
depends on the owner confirming no real users rely on a Preview. Historical credential
copies outside Vercel would not be revoked by deletion. Rotation is a separate procedure
only after evidence/consumer review and explicit approval. No controls are weakened.

## Auth redirects and SMTP proposal

Production Dashboard was reconfirmed read-only: Site URL
`https://ngo-equinox10.vercel.app/`; seven redirects unchanged in finalGO/NO-GO.
Custom SMTPon, sender nameAahaaraConnect NGO, Save disabled; sender email tool-redacted.
No SMTP credential was viewed or reconstructed and no email was sent.

Legacy Site URL returned404 /DEPLOYMENT_NOT_FOUND; canonical
`https://ngo-eight-umber.vercel.app/` returned200. Mobile Donor signup supplies no
emailRedirectTo and relies on Site URL, so its default confirmation landing is at risk
of404 (source/HTTP inference, not an email-delivery test). Password logins are not proven
broken by this finding. The old donor-page foreign-Auth defect is separately documented.

**Minimal proposed final configuration, pending separate approval:**

- Site URL: `https://ngo-eight-umber.vercel.app/`.
- Allowed redirects: exactly `https://ngo-eight-umber.vercel.app/accept-invite` and
  `https://ngo-eight-umber.vercel.app/reset-password`.
- Do not add staging URLs, Preview hosts, custom schemes, or `/open/**` to Auth callbacks.
  Donor confirmation uses Site URL; object App Links are not email Auth redirects.

Legacy review: the two ngo-equinox10 entries refer to the unavailable old origin; the
two ngo-*-equinox10 wildcard entries allow Preview-host callbacks; ngo-eight-umber/**
is broader than known callback needs. Keep both exact canonical callbacks. Before removing
the other5 entries, owner confirms no undocumented OAuth/integration or outstanding
legitimate callback requires them. Already-issued links may retain an old destination:
changing Site URL does not repair them. Do not bulk resend/reset accounts; reconcile
affected owners and request any necessary targeted mail separately. No URL was changed.

Manual SMTP confirmation still required: actual sender email/domain, provider account
and billing/service ownership, domain verification/SPF/DKIM/DMARC status, rate limits and
link/template settings. Share only non-secret facts or redacted screenshots. Neither
an enabled SMTP switch nor staging receipt proves Production delivery/domain control.

### Controlled SMTP acceptance plan — no recipient authorized yet

1. Owner names a Production-authorized synthetic mailbox they control, absent from Auth
   and app accounts. Earlier staging-recipient approval is not Production approval.
   Approve one Auth invitation, one reset, and any synthetic app/donor records produced
   by intentional `/me`/login. No Admin/Volunteer role promotion or real-account reset.
2. Verify current exact callback allowlist, effective invite redirect and sender ownership
   before sending. Prefer the approved canonical configuration; do not fall back to the
   missing old Site URL or use Preview links. Record a private unique test identifier.
3. Send one Auth-admin invitation with explicit canonical `/accept-invite`. Recipient
   confirms receipt, sender, domain and password setup privately. If testing login/me,
   expect defaultDONOR mapping for a new generic Auth identity, not Volunteer approval.
   This transport/callback test does not require015 or fake private proof records.
4. Only after confirmation, send one reset with exact `/reset-password`; recipient
   confirms receipt/callback/reset. Record sanitized timestamps and outcome only; never
   ask for a password, link token or mailbox credentials in chat. No automated resend loop.
5. Reconcile ambiguous delivery without duplicates. Keep synthetic identities documented;
   cleanup needs separate authorization. Full Volunteer identity/approval acceptance in
   Production is a later controlled test after015/private Storage/matching application.

## NGO off-device recovery handover — operator checklist

- [ ] Organization/tenant name and approved Google Shared Drive or OneDrive/SharePoint
      library/folder identifier, access list, public-link prohibition and retention/audit policy.
- [ ] Separate organization-controlled password manager/vault or public-key escrow,
      named recovery item/access group and emergency-recovery method independent of laptop.
- [ ] Named backup custodian and independent key custodian; personal developer accounts
      are not accepted as permanent NGO ownership.
- [ ] Named authorized recovery operators and service/account ownership for Supabase,
      Vercel/Git, SMTP, Android signing and account recovery; secure contact channels.
- [ ] MFA enrollment and recovery access verified for cloud, vault and backup operators;
      a second authorized custodian can recover access if the first/laptop is unavailable.
- [ ] Exact destinations/custodians and a second-device rehearsal destination separately
      approved before any upload, sensitive copy or encryption-key export.

After approval: rehash existing encrypted archive, retain sidecars/manifest/tools; grant
only the approved custodians access to the restricted cloud folder, then upload encrypted
bytes and compare the downloaded copy's SHA256. Recover the AES key from developer DPAPI
only in trusted memory and import it directly into the separately approved organization
vault or wrap with its approved public key; no chat/clipboard/plaintext file. Verify
independent vault recovery. The `.dpapi` file alone does not survive laptop/profile loss.

On the approved second device, obtain the encrypted archive and escrowed key independently,
authenticate hashes/GCM, protect any local key under that device's secure identity,
update only the private key locator and run the network-none/tmpfs local restore helper.
Compare Auth/account/table digests, constraints, roles and ledger, remove disposable
plaintext/container data and document custody/recovery time. Never restore over a live
database. No such transfer/export or second-device test occurred in this pass.

## Remaining prerequisites and next approval

| Future action | Required before execution |
| --- | --- |
| Migration015 | Explicit exact-checksum approval, integration review, owner handover/write coordination, fresh approved encrypted snapshot+verified recovery, drift/ledger checks and actual administrative connection proof |
| Runtime role |015/group present, separate non-owner/NOBYPASSRLS login proposal approved, private secret handling, actual connection/RLS/grant-denial verification; no end-user role changes |
| Private buckets | Approved profile-photos and volunteer-identity-private configurations and server ownership/Admin review tests; no public document storage or broad client policies |
| Combined Production web/API | Frozen580801e source/lock, restricted runtime, buckets, verified Production-only env/TLS/CORS/flags, corrected callbacks/authorized delivery, current account-preservation snapshots and explicit deploy approval |
| Production Android | Hosted release checks, Production API/Supabase/web binding, signing/package ownership, assetlinks configuration, separate one-build approval and physical Maps/GPS/photo/auth/deep-link verification; stage APK never published |
| Operator handover | Named NGO owners/custodians/escalation, three expired active jobs reconciled through approved operations, backup/off-device custody and maintenance/incident signoff |

No completed staging or local45-check restore needs repetition merely to produce this
plan. A new snapshot and recovery check immediately before an eventual migration is a
freshness requirement, not a claim that the existing backup failed. Dependency/security
risk disposition and legacy Donor artifact deployment remain separately gated.

**Exact next approval request:** approve retirement of only the42 IDs and5 aliases in
the linked closed manifest **after** owner/reviewer confirmation they are not required.
This approval would include no Auth edits, emails, rotations, database writes, builds,
deployment or backup/key transfer. The canonical Auth configuration proposal is separate
and ready for review; recipient and custody identifiers must be supplied before any
concrete mail/transfer approval can be requested. No Production release is authorized.

Evidence: [historical assessment](release/historical-preview-assessment.json),
[final gates](FINAL_PRODUCTION_GO_NO_GO.md). Guidance:
[Vercel protection](https://vercel.com/docs/deployment-protection),
[Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls).
