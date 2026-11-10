# Production SMTP acceptance — 2026-11-10

## Approved SMTP save and read-back — 2026-11-10

The user explicitly confirmed control/authorization of the selected Gmail mailbox,
2-Step Verification and a privately generated app password, then approved the exact
SMTP-only change. This supersedes the earlier sender-ownership uncertainty for that
selected mailbox only; it grants no permission to use earlier test recipients.
The user reported a successful Dashboard save after entering the secret privately.
Codex did not read, enter, persist or retrieve the app password and did not submit it.

Read-back after Dashboard reload on Production project `pyzyxgpcfwpcqyqrihuo`:

- Custom SMTP enabled; host `smtp.gmail.com`; port `587`.
- Sender display name `AahaaraConnect NGO`; Save changes disabled.
- Sender address and username remain tool-redacted. Their exact values and credential
  replacement are user-attested, not independently verified by this inspection.
- Site URL remains `https://ngo-eight-umber.vercel.app/`.
- All seven redirect entries match the pre-save baseline exactly.
- No invitation, reset or other test email was sent; no identity was created.
- No database SQL, migration, deployment or other configuration edit was performed
  by Codex in this verification. Existing account/data/deployment equality was not
  re-audited; this read-only check does not claim a new full preservation comparison.

**Configuration read-back complete; delivery gate remains BLOCKED/untested.** Next is
separate authorization of one unused controlled recipient and its synthetic identity,
followed by one invitation and, only after confirmed success, one reset. Optional
security-notification flags must be checked before fixing the total email budget.
Do not send anything under the SMTP-save approval. Production release remains NO-GO.

## Historical preflight (before sender approval)

Subsequent owner correction: they do not control/use the previous Gmail accounts and
have no domain/DNS. Those accounts and proposed old-account plus-aliases must not be
used. See [new owned-sender migration plan](PRODUCTION_SMTP_SENDER_MIGRATION_PLAN.md).
No SMTP change or test mail is authorized until a new sender and explicit approval are
provided; earlier recipient checks below are history, not valid sending authority.

**SMTP delivery gate: BLOCKED.** Read-only preflight completed. The latest user decision
was **“No—keep sending blocked.”** No email was sent, no synthetic identity was created,
and no existing Auth/application account, password or record was modified. No delivery
claim is based on staging acceptance or an enabled SMTP switch.

## Verified preflight

| Check | Result |
| --- | --- |
| Production identity |NGO / pyzyxgpcfwpcqyqrihuo, ACTIVE_HEALTHY, eu-west-2, positively confirmed through MCP and Dashboard URL |
| Saved Site URL |https://ngo-eight-umber.vercel.app/ |
| Invitation callback allowlisted |https://ngo-eight-umber.vercel.app/accept-invite |
| Reset callback allowlisted |https://ngo-eight-umber.vercel.app/reset-password |
| Seven redirect entries |Still present; no entry changed |
| Custom SMTP |Enabled; host smtp.gmail.com, port587; sender display name AahaaraConnect NGO |
| Sender email |Dashboard value tool-redacted; no bypass/reconstruction attempted. User supplied an address privately in chat; no personal email stored in Git |
| Sender/provider authorization |Not sufficiently confirmed; no ownership inferred from developer-account access or display name |
| Account baseline |14 Auth users,11 app users; ADMIN1,DONOR5,DRIVER1,VOLUNTEER4;0 orphan app links;14 ledger entries |
| Token-free HTTP |Homepage, accept-invite, reset-password and readiness200; anonymousme401 |

SMTP host identifies configured Google/Gmail submission, not account authorization,
successful SMTP authentication, inbox delivery or NGO ownership. Port587 alone is not
a verified TLS/mail transport test. No SMTP username, password, app password or API key
was retrieved/exposed. The sender name is not a DNS domain: the supplied sender address
has domain gmail.com, while AahaaraConnect NGO is its display name.

## Recipient checks and sending decision

The initial reply contained unfilled template placeholders and could not be used as a
recipient/sender confirmation. Subsequent concrete recipients were checked read-only:

| Candidate | Auth matches | Linked app accounts | Decision |
| --- | --- | --- | --- |
| First supplied address |1 |1, DONOR |Existing account preserved; no invite/reset |
| Second supplied address |1 |1 |Existing account preserved; no invite/reset |
| Proposed unused Gmail plus-address |0 |0 |Only proposed; explicit sending authorization was declined |

No address was substituted or guessed for sending. The proposed plus-address did not
create a mailbox/account or trigger any message; it was only an exact absence query.
Google documents that [plus-address variations reach the same inbox](https://support.google.com/a/users/answer/9282734).
That routing capability does not authorize a new recipient or testing an existing account.
Personal recipient/sender addresses and existing user IDs are excluded from the repository.

Current eligible, explicitly authorized **new** synthetic recipient: **none**.
Original provided accounts, including the linked Donor, have not been reset, reinvited,
renamed, deleted or otherwise modified.

## Actual delivery/callback results

- Invitations sent: **0**.
- Reset emails sent: **0**.
- Synthetic identities created: **0**.
- Existing accounts modified: **0**.
- Inbox receipt, sender identity and invitation/reset token callbacks: **NOT TESTED**.
- New-identity authentication/default role: **NOT TESTED**; no new identity exists.

HTTP200 at callback routes proves availability only. It does not verify an emailed link,
password setup/reset, token acceptance, email confirmation or a default application role.

## Manual facts needed before a future specifically approved test

1. A new exact mailbox the user controls, absent from Production Auth/app accounts, with
   explicit authorization for one invitation and one reset after successful invitation
   confirmation. Neither rejected existing account may be used.
2. Actual configured sender email confirmed against Dashboard without sharing credentials.
   Plain confirmation of authority to use that sending Google account/address, including
   any Send As/delegation requirement and the responsible account/service owner.
3. Whether the sender is an organization-managed Workspace account or a personal Gmail
   account authorized for this limited test. Formal NGO service ownership is a separate
   handover gate. For Gmail-owned domains, verify mailbox/use authorization; do not claim
   the NGO owns gmail.com. For a custom domain, confirm authorized control and provider
   sender/domain verification, SPF/DKIM/DMARC status and applicable limits.

Do not ask for SMTP credentials, mailbox passwords, recovery codes or email-link tokens.
The latest no-send decision remains in force until a new explicit recipient-specific
approval and required sender confirmation arrive. Do not repeatedly prompt/resend or
create a pending identity while waiting.

When newly approved: recheck exact recipient absence; send one Auth-admin invitation
with canonical `/accept-invite`; recipient checks receipt/sender/domain and sets their
password themselves in a private browser session. Record only outcome/timestamps.
Verify sign-in and default unprivileged DONOR mapping through approved synthetic activity,
never grant Admin/Volunteer/Driver. Only after recipient confirms successful invitation,
send one reset to the same synthetic account with canonical `/reset-password` and verify
receipt/reset. No automatic resend after ambiguity. Preserve/document the test account;
cleanup requires separate approval. See the
[exact controlled test plan](PRODUCTION_AUTH_SITE_URL_CORRECTION.md).

## Evidence and boundaries

[Settings](release/production-smtp-preflight-settings.json),
[token-free HTTP](release/production-smtp-preflight-http.json),
[sanitized recipient checks](release/production-smtp-recipient-preflight.json).
No migration015, schema/grant/credential/Auth redirect/SMTP/Vercel setting change,
deployment, build, backup upload, key export or WhatsApp action occurred. Application
code and previously completed staging/backup tests were not repeated. Production release
remains **NO-GO**; other ownership/recovery/runtime/Storage/Android/operator gates remain.
