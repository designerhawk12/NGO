# AaharaConnect NGO pilot operator guide

This guide describes the implemented workflows. Use it on the approved staging/pilot environment only after the release gates in `FINAL_PILOT_RELEASE_RUNBOOK.md` pass. Final pilot clearance has not been granted.

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
