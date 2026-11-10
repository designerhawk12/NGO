# Owned SMTP sender migration plan — 2026-11-10

**Production NO-GO. Approved user-entered SMTP save is recorded below; delivery untested.**

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

## Historical preparation (before approval)

The user states they do not control/use the previously identified Gmail accounts and
have no custom domain/DNS access. Those addresses, prior proposed aliases and earlier
test-recipient discussions must not be reused for sending. No SMTP credential was read,
no message/account created and no setting changed in this pass.

## Current read-only inspection

Project NGO / `pyzyxgpcfwpcqyqrihuo` positively identified, ACTIVE_HEALTHY. Dashboard:
custom SMTP enabled, host smtp.gmail.com, port 587, display name AahaaraConnect NGO.
Sender email tool-redacted; username/password not extracted. Save remained disabled.
Enabled configuration is not delivery proof or authority to use the configured account.
See [sanitized inspection](release/smtp-sender-migration-readonly.json).

## Email-dependent application flows

Trace is from the accepted recovery source; no live workflow was replayed. Production
still uses the existing b7b321c deployment; a mail-provider change does not deploy recovery code.

| Flow | Source / mechanism | Email and landing dependency |
| --- | --- | --- |
| Volunteer invitation/registration | `server/src/modules/volunteers/service.ts`, `identity.ts` → shared `server/src/auth/supabase.ts` → admin.inviteUserByEmail |Supabase invitation; explicit VOLUNTEER_INVITE_REDIRECT_URL when configured; canonical accept-invite required. Full identity-proof flow still waits for 015/private Storage/release gates |
| Employee Driver invitation | `server/src/modules/vehicles/employeeDrivers.ts` → same shared invite helper |Same SMTP and accept-invite flow; preserve canonical person/Driver/fixed vehicle and existing UUIDs |
| Donor email confirmation | `apps/mobile/src/api/auth.ts` → auth.signUp; email confirmation required |Uses Supabase default Site URL, now canonical homepage. Server assigns normal DONOR only after verified session; no client role grant |
| First password setup | `apps/web/src/pages/AcceptInvite.tsx`, `api/invite.ts` |Consumes invitation session and calls auth.updateUser; password entered by recipient. Page does not itself issue another invitation |
| Forgot-password request | Mobile LoginScreen opens canonical forgot-password; web `api/recovery.ts` calls resetPasswordForEmail |Supabase reset email with explicit canonical reset-password callback; generic UI acknowledgement does not prove delivery |
| Password reset completion | `apps/web/src/pages/ResetPassword.tsx` → auth.updateUser |Requires the valid recovery session; recipient supplies password privately |

Password sign-in for an already-confirmed user does not call these email-sending methods.
Changing SMTP does not require changing user emails, UUIDs, roles, password hashes or
signing keys. Optional Supabase security notifications can also send mail on password/
email/factor changes **if enabled**; inspect their flags before promising an exact two-mail
test. Do not silently disable notifications. See [Supabase email types](https://supabase.com/docs/guides/auth/auth-email-templates).

## Recommended no-domain option

Use a **dedicated Gmail mailbox actually controlled by the user/NGO**, with 2-Step
Verification and a separate Google app password for this integration. Use the same
authorized Gmail address as SMTP username and sender; retain AahaaraConnect NGO as the
display name. No domain purchase, DNS access, paid Google Workspace or application-code
change is required for this proposed low-volume path. Availability of app passwords and
successful controlled delivery must still be verified; it is not a guaranteed SMTP PASS.

Cost: ordinary Gmail account has no paid mail-plan requirement for this setup. Google
documents personal-account limits of up to 500 messages per rolling 24 hours, shared
with other clients; anti-abuse restrictions can reduce availability. Supabase rate limits
apply independently and may be lower. Inspect current limits rather than increasing
them automatically. This is an interim low-volume pilot sender, not a bulk-mail service
or an uptime guarantee. Use a dedicated mailbox rather than a primary personal inbox.
[Google SMTP/limits](https://developers.google.com/workspace/gmail/imap/imap-smtp),
[personal Gmail limits](https://support.google.com/mail/answer/22839).

Google prefers OAuth where supported. The existing Supabase SMTP username/password
configuration can use an app password; enabling Google social login is a different
feature and is not an SMTP migration. Never use the main Google password or enable
obsolete less-secure-app access. App passwords require 2-Step Verification and may be
unavailable under account/security policies. Do not weaken Advanced Protection/MFA to
make the option appear. If unavailable, stop and select another approved provider.
Account password changes revoke app passwords, so include sender recovery in operations.
[Google app-password requirements](https://support.google.com/accounts/answer/185833),
[Supabase Google SMTP notes](https://supabase.com/kb/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y).

Future domain option: Resend SMTP requires a domain the NGO controls and verifies, so
it is not the current no-domain choice. Current Free quota 3,000/month and 100/day; Pro
starts US$20/month for 50,000/month, plus any separately acquired domain cost. Registered
nonprofits may apply for a paid-plan discount; none is assumed/activated. No purchase,
subscription or provider account is created by this plan. Pricing checked 2026-11-10:
[Resend pricing](https://resend.com/pricing), [domain requirement](https://resend.com/docs/dashboard/domains/introduction).

## What the user must do manually

1. Choose an existing Gmail account you control or create a dedicated free sender mailbox.
   Record its custodian, recovery contacts and intended NGO use; do not claim a personal
   account is permanent NGO ownership without handover. No account is created by Codex.
2. In that Google account, enable 2-Step Verification. Check that **App passwords** is
   available. Generate one labelled for AahaaraConnect Production Supabase Auth and
   retain it privately in approved custody. The label is not a send-only permission scope.
   **Do not paste the app password/main password/recovery codes into chat or Git.**
3. Supply only the new sender email, display name, custodian/authorization confirmation
   and confirmation that the app password is ready privately. For gmail.com, authorization
   means control of that mailbox; the NGO does not need to own Google's domain or add DNS.
4. Provide a different controlled test mailbox, or explicitly authorize a new plus-address
   of the newly controlled Gmail mailbox. We must first verify the exact recipient is
   absent from Production Auth/app accounts. Do not use any earlier uncontrolled account.
5. Review and explicitly approve the exact SMTP-only cutover below. The owner should enter
   the new secret directly into Supabase's password field during the approved change;
   do not expose it to obtain assistance. Approval to change SMTP is separate from approval
   to send the controlled invitation/reset test.

## Proposed Supabase changes — DO NOT APPLY YET

Dashboard NGO / exact projectref → Authentication → Emails → SMTP Settings:

| Field | Planned value / action |
| --- | --- |
| Enable custom SMTP | Keep enabled |
| Sender email | Replace with the new authorized Gmail address, not an old address or invented domain |
| Sender name | AahaaraConnect NGO, retain unless user chooses another authorized name |
| Host | smtp.gmail.com, unchanged |
| Port | 587, unchanged; Google documents STARTTLS on this port |
| Username | Replace with the exact same new authorized Gmail address |
| Password | Replace with its dedicated Google app password, entered privately by owner after approval |
| Auth Site URL | Preserve https://ngo-eight-umber.vercel.app/ |
| Allowed redirects | Preserve all seven existing entries, including exact accept-invite/reset-password callbacks; no narrowing |
| Email confirmation/password policy/signing keys/user records | Preserve; do not disable email confirmation to make delivery appear successful |
| Templates/rate limits/Auth hooks | No change proposed; inspect only for hard-coded old/staging URLs, tracking or extra notifications before testing |

This is a sender credential replacement, not a Supabase project/account/database migration.
No Vercel environment edit, app deploy, 015 or new backend is needed for SMTP itself.
The runtime invitation redirect remains a separate configuration evidence gate; a direct
Auth-admin invitation with explicit canonical callback does not prove the Express setting.

After a later approved save: reload and verify non-secret fields, Site URL and all seven
redirects; compare existing-account/role/session baselines and live deployment/aliases.
Never reveal the stored password to verify it. Do not send a test automatically on save.
Use Google/Supabase delivery evidence only during the separately approved test.

Failure handling: keep Production NO-GO and stop test/invite/reset attempts. Do not fall
back to the old uncontrolled Gmail account, Supabase default sender or weaker email
confirmation settings. Any pause/disable or alternate-provider change requires its own
approval. The original account owner may later manage their own old app password; Codex
will not retrieve, revoke or log into an account the user does not control.

Current Production forms may still initiate mail using the configured sender if other
users invoke them. No such request is initiated here; preparation does not claim globally
paused mail. Coordinate an approved cutover window and any required email-flow pause
before switching; do not silently change live flags in this read-only task.

## Controlled acceptance after the new sender is approved

1. Verify new sender control, actual configured fields, provider/app-password readiness,
   recipient absence and exact canonical callbacks. Inspect optional security-notification
   flags: if password setup/reset would emit extra messages, obtain explicit approval for
   those side effects or revise the test; do not silently disable protection.
2. Obtain recipient-specific approval for one invitation, one subsequent reset and the
   new synthetic Auth identity/normal unprivileged app rows. Preserve all existing accounts.
3. Send one invitation with explicit canonical accept-invite. Recipient checks receipt,
   actual From address, spam folder, domain/callback and completes password setup privately.
   Provider acceptance alone is not inbox/callback PASS. Do not ask for link tokens/passwords.
4. Verify authentication and normal DONOR mapping only through the authorized synthetic
   identity; never bootstrap Admin/Volunteer/Driver privileges. Confirm original records
   and roles remain unchanged. No fake Volunteer proof workflow is needed for SMTP testing.
5. Only after successful invitation confirmation, send one reset to the same identity with
   canonical reset-password. Recipient confirms receipt/callback/reset; record sanitized
   timestamps and outcomes. Ambiguous failures stop, with no repeated send loop.
6. Preserve the documented synthetic identity; deleting it needs separate authorization.
   SMTP gate becomes PASS only after real receipts/callbacks/authentication/role checks pass.

## Exact next action

**Choose/create a Gmail sender mailbox you actually control, enable 2-Step Verification,
and check App passwords availability. Then provide only its email and custodian and
confirm the dedicated app password is privately ready.** No secret in chat. We can then
present a sender-specific cutover for your explicit approval, followed by a separately
authorized recipient test. Until then current settings remain unchanged and assistant-initiated sending blocked.
