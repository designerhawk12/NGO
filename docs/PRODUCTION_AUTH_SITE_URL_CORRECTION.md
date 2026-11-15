# Controlled Production Auth Site URL correction — 2026-11-10

**PASS for the authorized single-field correction. Production release remains NO-GO.**
Only Supabase NGO / `pyzyxgpcfwpcqyqrihuo` Auth default Site URL changed:

| Setting | Before | Saved and reloaded |
| --- | --- | --- |
| Site URL | `https://ngo-equinox10.vercel.app/` | `https://ngo-eight-umber.vercel.app/` |

Project identity/status were confirmed through Supabase MCP and the exact authenticated
Dashboard project URL. Before editing, the old URL still returned404/DEPLOYMENT_NOT_FOUND;
canonical returned200 and was a verified project domain assigned to active Production
deployment`dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR`. All prerequisites matched reviewed evidence.

The canonical public application homepage is a suitable generic confirmation/default
landing: it belongs to the existing Production application, returns200 without a session
and does not grant Admin/API access. Explicit invitation/reset callbacks remain separate.
Mobile Donor registration uses the default Site URL; this corrects that future default
landing. It does not repair already-issued links that embed the old destination or prove
SMTP delivery, callback token handling or an existing user's password login.

The Dashboard Site URL field alone was edited and saved once. Persistence was verified
after page reload at2026-11-10 11:06:18 IST (`05:36:18.416Z`). An initial readback occurred
before Dashboard data finished loading; the subsequent full readback passed. There was
no save retry, redirect edit or failed configuration mutation. No unresolved blocker in
the approved correction itself.

## All seven allowed redirects preserved, unchanged

1. `https://ngo-eight-umber.vercel.app/accept-invite`
2. `https://ngo-eight-umber.vercel.app/reset-password`
3. `https://ngo-equinox10.vercel.app/`
4. `https://ngo-equinox10.vercel.app/**`
5. `https://ngo-*-equinox10.vercel.app`
6. `https://ngo-*-equinox10.vercel.app/**`
7. `https://ngo-eight-umber.vercel.app/**`

The before/after ordered arrays matched exactly. Legacy/wildcard entries remain pending
separate dependency/outstanding-link review; this approval did not narrow them.

## Hosted and account preservation verification

Final hosted verification at2026-11-10 11:07:22 IST (`05:37:22.360Z`):

| Check | Result |
| --- | --- |
| Canonical homepage |200 |
| `/api/v1/health` |200 |
| `/api/v1/health/ready` |200 |
| `/api/v1/me` without a token |401, expected |
| Active Production deployment / both aliases |Unchanged |
| Complete32-deployment inventory |Unchanged; no deployment/promotion |
| Deployment protection / Git disconnect |Unchanged |
| Auth users / app users |14 /11, unchanged |
| App roles |ADMIN1, DONOR5, DRIVER1, VOLUNTEER4, unchanged |
| Auth identities, sessions, refresh-token rows, user/app records |Read-only before/after aggregate fingerprints matched |
| Orphan app-to-Auth links / migration ledger |0 /14 entries, unchanged;015 not applied |

Comparison fingerprints were computed inside PostgreSQL and compared privately in tool
memory. No record payload, password hash, token or fingerprint was persisted in Git;
sanitized evidence stores only counts, role totals and equality booleans. No existing
session was signed out/refreshed or live user password tested. This proves unchanged
stored session/identity/account state, not a token-by-token live login test.

No database record/grant/credential, Auth user/password/signing key, SMTP setting, Vercel
setting/deployment/alias, Android artifact, backup/key or notification change was performed.
No invitation/reset email was sent. Existing data, accounts and sessions were preserved.

## Exact next SMTP acceptance test — requires new approval/mailbox

Manual NGO confirmations required before asking to send:

- Actual Production sender email and sender display name. Last read-only inspection
  showed custom SMTPon/nameAahaaraConnect NGO; sender email was tool-redacted, not bypassed.
- Organization owns or is authorized to use the sender domain/address and the provider
  account; identify service/recovery custodian, not merely a personal developer login.
- Provider domain/sender verification, SPF/DKIM/DMARC status, rate limits and relevant
  invitation/reset templates/link destinations. No SMTP username/password/API key needed.
- One specific Production-authorized synthetic mailbox controlled by the tester and
  absent from existing Auth/application accounts. Prior staging-recipient approval is
  not Production approval. Do not send an address or token-bearing email link to Git.

Proposed authorization must cover **one invitation and one subsequent password-reset
email**, creation of the synthetic Auth identity, and any app/donor rows created by an
intentional `/me` check. It does not include Admin/Volunteer promotion, existing account
changes, broad resends or cleanup. Recipient and intended record side effects must be
approved concretely before execution.

1. Reconfirm project, saved Site URL, exact callbacks, sender ownership and recipient
   absence read-only. Record a private unique test identifier. Stop if already present;
   never overwrite an existing identity.
2. Send one Auth-admin invitation with explicit
   `https://ngo-eight-umber.vercel.app/accept-invite`. This checks SMTP/Auth transport
   without requiring015/private proof. Recipient confirms sender/receipt/domain and
   completes password setup themselves, reporting outcomes only, no password or link token.
3. After receipt/setup confirmation, send one reset with explicit
   `https://ngo-eight-umber.vercel.app/reset-password`. Recipient confirms receipt,
   correct callback and successful reset. Any optional private login/me test must be
   approved; expected new generic identity role is DONOR, never Admin.
4. Record sanitized timestamps/result, reconcile ambiguity without automatic resending
   and preserve the synthetic identity unless separately authorized cleanup is approved.
   Do not reset the original Admin or reuse any real account for acceptance.

This test checks invitation/reset transport and web callbacks, not the Express Volunteer
registration pipeline. Its opaque `VOLUNTEER_INVITE_REDIRECT_URL` still needs private
configuration evidence; an explicit canonical Auth-admin redirect does not prove that
runtime value. Full Volunteer/proof/approval acceptance requires015/private buckets/
matching app plus its own controlled records and authorization.

## Evidence and remaining release gates

[UI before/after redirect readback](release/auth-site-url-ui-verification.json),
[hosting baseline](release/auth-site-url-hosting-before.json),
[hosted results](release/auth-site-url-verification.json),
[account/session preservation](release/auth-site-url-account-preservation.json).
Local proof screenshot is retained outside the repository; no generated image/secret
or user data was committed.

Remaining: recipient-authorized SMTP delivery and sender/provider ownership; separate
legacy redirect review; off-device backup/independent key custody/formal NGO ownership;
actual runtime binding and approved015/restricted-role/private-bucket rollout; operator
handover and expired jobs; matching web/API deployment, Production Android/signing/App
Links/physical checks and residual security signoff. No release or further change is
authorized by this completed correction. See [final gates](FINAL_PRODUCTION_GO_NO_GO.md).
