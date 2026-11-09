# AaharaConnect NGO pilot operator guide

This guide describes the implemented workflows. Use it on the approved staging/pilot environment only after the release gates in `FINAL_PILOT_RELEASE_RUNBOOK.md` pass. Final pilot clearance has not been granted.

## Acceptance fixes and replacement Android — 2026-11-10

The photo-picker fix requires replacement preview build **776393e8-c33f-48c8-8a0c-fc1a25f65cbc**, source `3e89c26`: [build status](https://expo.dev/accounts/rajashishpatil10/projects/aaharaconnect-mobile/builds/776393e8-c33f-48c8-8a0c-fc1a25f65cbc). It is currently queued; do not start another build. The validated baseline APK below remains preserved, but cannot demonstrate the new photo fix. Wait for the replacement artifact and its inspection result, install it as an update with the same package/signing identity, and record the build ID (version number alone may match the baseline).

Public staging Volunteer registration is now enabled **after** the authorized recipient confirmed both invitation/reset receipt, correct staging callbacks, password setup/reset and pending login. New applicants still require private proof and manual Admin identity verification; a live unverified-proof approval was denied409. Delivery is verified for that controlled recipient, not every email provider. Never send unsolicited bulk tests or treat a submitted proof as approved identity. No real WhatsApp or public APK distribution is enabled.

For the replacement photo test, use `donor`, `volunteer` and `driver0` synthetic credentials from the private fixture described below. For each role choose JPEG, PNG/screenshot, WebP and HEIC/HEIF if the phone's decoder supports it; crop a recognisable corner and confirm orientation in preview, save, restart/sign in again, then replace. The app must submit normalized JPEG <=600KB. Unsupported/corrupt images must produce a handled conversion error; cancellation must leave the old photo intact. Record phone/Android version and format outcomes, without credentials or real identity documents. Backend upload/preview/replacement/persistence/private-access tests already passed; native gallery conversion remains to be verified on this binary.

For map testing, use a current authorized synthetic Driver duty. If old fixture food/pickup windows expired, create a fresh synthetic food request and Driver-only pickup through the normal Admin flow rather than changing the phone clock, extending expired real food, or overwriting history. With a valid report, the initial selected vehicle should center at zoom17; selecting another vehicle with GPS should refocus. Manually pan/zoom and wait through two15-second refreshes: marker/status may update, viewport must remain where you put it. Switching through a no-GPS vehicle must safely hide its marker and returning to a valid one must refocus. Keep timestamp/accuracy/offline observations separate from mere sharing ON. Repeat background reporting with Maps open after the native dependency addition. No physical pass is claimed yet.

## Baseline staging and physical Android checklist — 2026-11-09

This section supersedes the older final-review checkpoint below. Staging web is https://aaharaconnect-ngo-staging.vercel.app; API is https://aaharaconnect-ngo-staging-api.vercel.app. Hosted API/security verification passed; physical Android and SMTP delivery have NOT passed. No Production or live WhatsApp use is authorized.

1. Use the existing internal [EAS preview build](https://expo.dev/accounts/rajashishpatil10/projects/aaharaconnect-mobile/builds/69224e2c-8e03-4ca0-836e-90108f6061b6), version 1.0.0/code 7, source `c6eea23`. Local APK: `C:/Users/desig/AppData/Local/AahaaraConnect-Staging/aaharaconnect-staging-69224e2c.apk`. SHA256: `10985ef371d41995c837db90cfe6682f7555019a316af672ddab942b4eaa8bb8`. Transfer only the APK and synthetic proof PNG to the phone. Install/update the existing matching package; stop and report a signature conflict instead of uninstalling existing data. Revoke the file manager/browser's unknown-app installation permission afterwards.
2. Read credentials locally from private `C:/Users/desig/AppData/Local/AahaaraConnect-Staging/hosted-pilot-fixture.json`: `accounts.driver0`, `accounts.phone-pending` and `accounts.admin`. Use their email/password fields; never paste credentials, tokens or the entire fixture into chat. Legacy staging test credentials were rotated and are privately updated in `staging.env`; do not use remembered weak passwords. On the web, Settings provides Admin sign-in. Confirm the staging URL before entering credentials.
3. Sign into the APK as `driver0`; use the existing active assignment identified by `phoneFixtures.activeAssignment`. Confirm Driver/vehicle, then explicitly choose Turn On GPS. Test denial first (no reports), then precise/foreground and background location permissions when requested; verify the persistent location-service notification. Open Google Maps for 2–3 minutes while the app is backgrounded. On web Vehicle Tracking select `KA4BD22D700` / Synthetic Driver 4bd22d70 0. Require a recent timestamp, readable coordinates/marker and correct selected Driver. Record battery/Android restrictions. Toggle airplane mode and verify offline/stale status; reconnect and verify a fresh update. Stop sharing and sign out; verify reporting stops. Do not claim a point is current merely because sharing is ON.
4. Complete the synthetic Driver-only job through accept/start/arrive/collect/deliver without any Volunteer acceptance, using only app-permitted transitions and synthetic food. Do GPS testing before completing the duty. Existing fixture windows may expire: if the app reports an expired window or unavailable job, record the blocker and have the maintainer reschedule that synthetic job; never change the phone clock or bypass validation. Check mobile job ID against the private fixture, not a guessed job.
5. Sign in as `phone-pending`. Use `C:/Users/desig/AppData/Local/AahaaraConnect-Staging/synthetic-identity-test-only.png` with the identity picker. It is a blank test image; never upload real identity proof for this rehearsal. Verify pending operations remain blocked. As synthetic Admin, review/reject with a test reason; re-upload from the applicant; verify proof and approve only the synthetic account. Confirm image preview expiry and expected status in both clients. These manual actions consume the pending fixture: record results rather than rerunning blindly.
6. Construct `https://aaharaconnect-ngo-staging.vercel.app/open/driver/<assignment UUID>` using the exact `phoneFixtures.activeAssignment.id` UUID (or the stored assignment UUID if that field is already a string); do not include passwords/tokens. Tap it from a phone note/message with the app closed and already open. Correct job should open after sign-in; a different Driver's job and malformed links must deny access safely. Android Settings → Apps → AaharaConnect → Open by default should show the staging host verified. Assetlinks/signature HTTP checks passed; actual Android resolution is still unverified. Do not send invitation/reset emails as proof of SMTP: SMTP is unavailable and delivery remains unverified.
7. Record phone model, Android version, APK/build ID, timestamp/time zone and PASS/FAIL for install/upgrade, permissions, background Maps GPS, offline/reconnect/stop, Driver-only delivery, proof picker/review, and cold/warm/unauthorized links. Share sanitized errors/screenshots only. One phone verifies one device; five concurrent backend reports have already passed and need not be repeated. Do not enable wider pilot/public registration until physical checks and authorized SMTP setup/delivery checks pass.

## Admin access and people

Open the approved website and choose **Open Admin Dashboard**. Sign in through **Settings** with the NGO Admin account. The button never grants a role; the server verifies access. Keep accounts individual and sign out on shared computers.

In **Vehicle Details**, register the vehicle first without a Driver. In **Assign Driver**, create the employee Driver with their own email, phone, licence and that unassigned vehicle. The Driver follows the existing email invitation/password setup. Their vehicle relationship is fixed; contact the maintainer for exceptional corrections. A Volunteer licence document never creates a Driver account.

In **Volunteers → Volunteer Applications**, choose **Review identity proof**. Check the applicant and document manually; Aadhaar must be masked, with the first eight digits obscured. PAN and driving licence are alternatives. Choose **Mark identity Verified** only after checking it, then **Approve**. A file upload alone is not verification. Use **Reject identity proof** with a clear reason if a replacement is needed; a signed-in pending applicant can submit it from the pending application screen. Use **Deny** with an appropriate reason if the application should not proceed. Do not copy document numbers into review notes, chat or WhatsApp. Private previews expire after two minutes.

Existing approved accounts retain access. Older pending applications follow the documented transition policy; the NGO must decide whether to request proof from them. Never delete an existing account to restart onboarding.

## Distribution and dispatch

In **Distribution Center**, add/edit active destinations or archive an unused one. Existing pickups keep their original destination address even if the centre is later edited.

In **Pickup & Logistics**, schedule a safety-reviewed donor request within the food's valid pickup window and choose a destination. The platform does not automatically declare food safe.

Choose **Assign Crew**:

1. For a Driver-only pickup, leave Volunteers empty and Continue. For an assisted pickup, choose the eligible crew.
2. Select the authorized employee Driver. Their fixed vehicle is selected automatically. Resolve capacity or availability errors before continuing.
3. Select the recommended clean compatible containers, checking the food load and vehicle limit.
4. Review the Driver, vehicle, containers, window and either crew names or **Driver-only pickup — no Volunteers assigned.** Confirm once; refresh after an uncertain network response before creating another dispatch.

Use pickup editing/cancellation only where the current status allows it. Cancellation preserves history and releases eligible resources. If a Driver/Volunteer declines or a resource conflicts, review the pickup before reassigning it. Do not mark a delivery complete until food has actually been handed over.

## Driver and Volunteer app

Drivers sign in through **Login as Volunteer / Driver**; the verified account role opens **My Jobs**. Accept or decline the specific job. Before starting or opening Maps, tap **Turn On GPS / Start Location Sharing**, read the notice and allow the official Android foreground/background permission flows. Confirm the displayed registration number and foreground notification. Start the journey, check in, confirm collection and finally delivery. Completed/closed jobs appear in History.

Use **Stop Sharing** at any time. Sharing also stops on logout, detected completion/cancellation, revoked authorization or interrupted permissions. Offline stop may reach the server later; the Admin should use the position timestamp, not assume an enabled consent means a currently connected phone. Do not change Android permissions silently or tell a Driver that their phone number enables tracking.

Volunteers sign in after approval, keep profile/availability current, open their assigned pickup and accept/reject it. A secure link never authorizes acting for another person. Crew-assisted trips retain their crew/Driver acceptance checks.

## Tracking and failures

In **Vehicle Tracking**, choose the registered vehicle number; check its fixed Driver, sharing state, coordinates, locality fallback and last-report time. Recent means under two minutes; Stale means two to five minutes; Offline means no recent position, an older report or sharing off. Positions older than the read-retention window are hidden. The map shows the Driver phone's reported position, which is not independent proof of the vehicle's location.

If stale/offline, contact the Driver through normal NGO communication. Ask them to check internet, Location services, the permission settings, foreground notification and whether Android/battery management stopped the app. They may need to reopen it and explicitly restart sharing. Android force-stop/reboot behavior varies; tracking after forced termination is not guaranteed. Do not treat missing GPS as proof that a Driver stopped work.

If a save fails, keep the error/request reference and retry safely once connected. Do not repeatedly tap a submit button or create duplicate pickup records. For an ambiguous email invitation, contact the maintainer to reconcile Auth/application state rather than making another account.

## Donors, installation and notifications

Donors keep using the mobile app to register/sign in, upload a profile picture, enter a donation, detect/correct the pickup address, set preparation/deadline information and review quantities. **My Donations** and the specific request page show donation status. This does not provide public fleet GPS. Removing public website donor promotion does not remove these app functions.

Install/update only from the approved website's **Install the Mobile App** section. If it says **Awaiting the verified Android release**, the public artifact is not approved yet. After download, open the APK and permit installation from that browser when Android asks. An existing installation should offer **Update**; report an unexpected duplicate app or signing error. Do not uninstall real user data as the first troubleshooting step.

WhatsApp is optional. In Profile, enter your own E.164 WhatsApp number and explicitly enable operational alerts; disable them there or reply STOP. Core app/email functions continue without WhatsApp. Until business/template/billing setup is approved, the app reports that messaging is awaiting setup.

Admins can inspect **Settings → WhatsApp delivery status → Load notification status**. PENDING is queued/retryable, SENT is provider-accepted, DELIVERED/READ come from signed provider updates, FAILED needs operations attention, SKIPPED has no current opt-in, and UNKNOWN must be reconciled before retrying because a send may already have succeeded. Never manually blast all recipients to resolve a queue issue.

## Problems, ownership and recovery

Report the screen, approximate time (including time zone), short request/job reference and error/request ID to the designated NGO operator/maintainer. Do not send passwords, tokens, identity images, signed document links or full Aadhaar numbers. Escalate potential location/document exposure immediately through the NGO's approved privacy incident process.

The NGO must own or control the GitHub repository/reviews, Vercel web/API projects and deployment access, Supabase database/Auth/Storage/backups/SMTP settings, EAS project and Android signing credentials, domains/DNS, Meta business portfolio/WhatsApp sender/templates and approved billing. Use organizational accounts, documented recovery contacts and least-privilege staff access; avoid sole dependence on one developer's personal account.

Backups, object recovery, deletion schedules, alerting and deployment rollback are maintainer duties. Operators should know the named recovery contact and the time of the last successful restore exercise. No restore, deletion or Production release should be improvised during a pickup.

## Final-review checkpoint — 2026-11-09

Implementation commit: `4cc7430f8b4c0af6634a13df8966fc9d61246926`. The separate documentation commit is discoverable through `git log -- docs/NGO_PILOT_OPERATIONS.md`; no remote release is authorized by a local commit.

Local review and 51 focused tests passed; prior full-suite evidence remains 566 passing tests. Staging and physical phone verification have not passed. The staging website still serves older code. Do not direct applicants or Drivers to try the new workflows yet. The maintainer must confirm the staging database/private bucket and configure the missing staging API service secret; see `FINAL_PILOT_RELEASE_RUNBOOK.md` for exact resources, dependency risks, setup and approved test order.

Staging tests must use synthetic applicants, proof images, contacts and vehicles. Live WhatsApp, APK publication and Production operations remain disabled/unapproved. After an approved phone build, also test malformed links and the location timestamp while Google Maps is open; coordinates must not be treated as current merely because sharing was enabled. Existing approved accounts remain approved; migration rollback must preserve the proof approval gate and audit records.
