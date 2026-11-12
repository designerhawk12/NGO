# Authorized historical Preview retirement — 2026-11-10

**Retirement PASS. Production release remains NO-GO.** Exactly the approved42 Preview
deployment IDs and5 Preview aliases are retired. No other deployment/resource/settings
change was authorized or performed. The owner explicitly confirmed the operators and
PR25/PR26 reviewers no longer needed these links; an open PR was not treated as evidence
contradicting that confirmation.

## Approved scope and preflight

Vercel teamequinox10 / `team_lRAI0kP7NNOxCUPBitJQ3d95`, projectngo /
`prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`.
Original closed [manifest](release/proposed-preview-retirement.json) SHA256:
`5f21b22a766cccda0f7251382aa4684e13061e001a5d89a4d4862a2f29f36ba2`.
Its original proposal-status wording is retained as immutable history; the subsequent
explicit user approval and this execution evidence supersede that status. Do not rerun
retirement from a dynamically generated search or treat new Preview IDs as authorized.

Before the first mutation, all42 IDs matched team/project, READY Preview target, original
source commit/URL and current alias set. All5 alias mappings matched the exact approved
deployment IDs; no extra alias/custom domain was found. The current Production deployment,
both live aliases, all74 deployment metadata records and both staging projects/deployment
inventories were captured. No first delete occurred until every target passed.
Each deployment was checked again immediately before deletion; the alias UID method
also resolved/rechecked the exact hostname/project/target before each removal.

## Successful and failed actions

| Action | Outcome |
| --- | --- |
|42 exact Preview deployment DELETE requests by ID | All42 accepted and independently verified deleted/absent |
| First hostname-form DELETE for ngo-git-fix-ist-donation-times-equinox10.vercel.app | One request failed; mutation sequence stopped and failure retained |
| Read-only post-failure check | Production healthy; all5 aliases still mapped to expected retired IDs; no alias retargeting or scope drift |
| Official UID-form alias removal after fresh mapping validation | All5 explicitly removed and independently verified |
| Final preservation checks | All11 checks PASS; no unresolved action failure or unattempted required target |

The initial hostname-form CLI request returned an error. Its detailed provider response
was not retained, so no unsupported claim about its root cause is made. The documented
alias-UID form succeeded after read-only revalidation. No blind loop or broader deletion
was used. The first stopped workflow remains in the original action log with its failure;
the separate final verification is authoritative for overall completion.

## Final verification

- All42 target IDs absent from the complete remaining inventory.
- All5 aliases absent/deleted, with exact action logs.
- All47 former deployment/alias URLs returned404.
- Exactly32 other deployments remain, with unchanged IDs, targets, states, creation times
  and URLs. No new deployment or promotion was observed.
- Active Production remains **`dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR`**.
- Production aliases remain **ngo-eight-umber.vercel.app** and
  **ngo-git-integration-ngo-recovery-equinox10.vercel.app**, with unchanged mappings/IDs.
- Production build/routing settings and environment ID/key/type/scope metadata are unchanged;
  Git remains disconnected. No environment/secret/settings mutation endpoint was called.
- Both designated staging projects' settings/update timestamps, active deployments and
  complete deployment inventories are unchanged.

| Existing Production read-only HTTP check | Result |
| --- | --- |
| Homepage `/` |200 |
| `/api/v1/health` |200 |
| `/api/v1/health/ready` |200 |
| `/api/v1/me` without credentials |401, expected |

The owner-confirmed Preview/review/bookmark links now stop working, as approved. Git
branches/repositories/history, staging, every other deployment, databases/application
records, credentials, Production Auth/SMTP and Storage were not changed. No015, runtime
role, build/deploy, alias reassignment, backup upload/key export or WhatsApp action occurred.
Deletion does not prove that no historical external credential copies ever existed;
no unauthorized exposure was established or credential rotation performed in this task.

## Evidence and remaining release gates

- [Preflight and preservation baseline](release/preview-retirement-before.json).
- [42 deployment actions and original failed alias request](release/preview-retirement-result.json).
- [Read-only alias/health investigation](release/preview-alias-post-delete-check.json) and
  [alias timestamps](release/preview-alias-deletion-timestamps.json).
- [Five verified UID-form alias removals](release/preview-alias-retirement-result.json).
- [Final11-check verification, remaining32 inventory and47 HTTP results](release/preview-retirement-verification.json).

The historical42-target retirement gate is now closed. Remaining release blockers are
unchanged: legacy Auth Site URL404/minimal-allowlist approval; sender/provider ownership
and authorized SMTP delivery; off-device encrypted backup/independent key custody and
formal NGO owners; actual runtime binding/approved restricted role,015/private buckets;
operator handover and expired jobs; matching Production app release/native signing/App
Links/physical checks and existing security-risk disposition. No broader release authority
is inferred. See [finalGO/NO-GO](FINAL_PRODUCTION_GO_NO_GO.md).
