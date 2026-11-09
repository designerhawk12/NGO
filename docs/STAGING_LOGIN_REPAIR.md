# Staging login diagnosis and repair — 2026-11-09

Scope: recovery branch, staging Supabase `tughgqggsndtraaymtvf`, staging web project `prj_W1MrwAqFsWTFohHs6UXR2fo1EEIL` and staging API `prj_Nd3YLsJkOYjlZMPLmFZw9MFG88Ul`. No Production access or account migration/reset.

## Causes established

- User-reported `admin_test@gmail.com` has **no staging Auth user**. Its original credentials therefore cannot work in staging. Its origin is unknown; absence does not establish that it exists in Production. No replacement Admin was created.
- Main Admin SPA correctly uses staging Auth/API. Website Settings is deliberately Admin-only; Volunteer and Donor credentials do not grant Admin access. Volunteers use the mobile application; Donors can use mobile or the legacy `/donor/` portal.
- **Actual deployed code defect:** `/donor/` and `/donor/index.html` served a legacy static page with a hard-coded different Supabase Auth project and a misleading `admin_test@gmail.com` email suggestion. No requests or credentials were sent to that other project during diagnosis. Its identity/ownership was not investigated.
- Four legacy staging test passwords were previously rotated deliberately. Their current private credentials work; remembered pre-rotation passwords must not be reused. No additional password changes were made by this repair.
- Current inventory: 15 confirmed, non-banned Auth users; linked roles: 2 Admin, 2 Donor, 6 Volunteer, 5 Driver. Three application Donors exist, but one has no matching Auth subject. Orphan application user `b44650dc-ff6e-4227-9093-483613db7bf6`, label `ZZ-TEST Donor`, donor profile `9943d935-174a-43c1-a6b7-22f7b0e5a7f1`, retains one food request. It cannot authenticate as that missing subject; it was preserved unchanged. No other original email identifiers were supplied, so their existence/login cannot be claimed.

## Repair

Moved the same Donor HTML to a Vite HTML entry at `apps/web/donor/index.html`, preserving URLs, screens, local demo flows and assets. The build now substitutes the same public `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_API_BASE_URL` configuration as the Admin SPA. Missing configuration fails closed. No server secret is embedded. Removed the nonexistent email suggestion. Live sign-in verifies `/me` and the server-owned Donor/Admin role before storing a token. Tokens are scoped to the configured Auth URL; foreign/expired tokens are rejected before API use. Donor service-worker v3 updates the shell using network first, clears only this app's old caches, and never intercepts Auth/API/cross-origin traffic. Settings now explains environment/role requirements.

## Actual verification

- Pre-repair hosted sign-in: **10 existing accounts passed Auth and both staging `/api/v1/me` endpoints (20 successful responses)**: synthetic Admin, 2 Donors, approved/denied/pending Volunteers; rotated legacy Admin and 3 Volunteers. Roles/statuses matched the database. Denied/pending authentication is not approval for operational access. Tested no unknown passwords or other-environment accounts.
- Browser: fresh synthetic Admin sign-in reached the live dashboard, protected tracking loaded, and the existing session restored after navigation. No browser failure reproduced in that flow.
- Supabase recent Auth logs contain `invalid_credentials` failures and successful logins, plus earlier refresh/session failures; invalid credentials alone do not distinguish nonexistent account from wrong password ([official behavior](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)). No per-account cause was inferred from aggregate logs.
- Both staging Vercel runtime logs were inspected in available default retention: web 11 and API 24 entries, all info, no error/warning entries in that bounded sample. An initial one-hour query exceeded Hobby retention; it was corrected, not treated as empty successful evidence. Not a complete historical error audit.
- Staging-configured shared/web TypeScript and Vite build passed. Existing large-chunk warning remains. Mock regression passed five login scenarios (Donor, Admin, Volunteer rejection, invalid password, API rejection), cross-environment/expired token checks and four worker isolation cases. Existing Auth/recovery suite: **2 files, 11 tests passed**. No full 584-test rerun or Android build.

Hosted post-repair evidence and exact deployment/commit are appended after deployment. No database, Auth account, migration, role, password, SMTP or WhatsApp configuration changes are part of the repair.

## Preservation and eventual Production strategy

Do not copy real accounts into staging or create `admin_test@gmail.com` as Admin simply to match a displayed name. Use the existing current staging accounts privately for pilot verification; any additional staging identity/role creation needs explicit scope and approval. Keep the orphan Donor and its request intact. Repairing it requires independently verified ownership, the intended Auth subject, a conflict check and an explicitly approved audited transaction preserving its application/donor IDs; email resemblance is insufficient.

For an eventual separately authorized Production release, prefer schema/application upgrades in the existing Production project so Auth UUIDs, existing passwords, application roles, approvals, donor/food history and relationships remain intact. Do not replace Production with the staging database, fixtures or rotated staging passwords. Before any approved cross-project migration, establish restricted backup/restore evidence and an explicit Auth-subject mapping preserving historical foreign keys; rehearse any supported password-hash transfer or verified recovery path without exposing hashes. Revalidate roles and owner access after cutover. Never assign Admin from client metadata or silently promote an email. Keep rollback data-preserving and retain identity-approval gates. This strategy authorizes no Production access or migration now.
