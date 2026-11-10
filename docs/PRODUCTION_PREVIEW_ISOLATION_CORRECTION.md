# Approved Production / Preview isolation correction — 2026-11-10

**PASS for the approved correction. Production release remains NO-GO.**
Only Vercel project `ngo` / `prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`, teamequinox10 /
`team_lRAI0kP7NNOxCUPBitJQ3d95`, was changed. No staging, database, Auth/SMTP,
Storage, account, backup/key, application build/deployment, alias or notification change.
All preflight metadata matched the reviewed release report before mutation.

Preflight captured2026-11-10 10:06:43 IST (`04:36:43.190Z`). Environment changes and
final checks ran10:10:26–10:11:01 IST (`04:40:26.301Z`–`04:41:01.058Z`).
Git disconnection was completed through the authenticated Dashboard between those phases.

## Exact environment changes

| Key | Existing identifier | Type unchanged | Before | After |
| --- | --- | --- | --- | --- |
| DATABASE_URL | XEaUlJAI1QvOSjdQ | sensitive | Production+Preview | Production |
| DATABASE_SSL_CA | unbnh6CbXWAQL2Y8 | sensitive | Production+Preview | Production |
| SUPABASE_URL | T1ZjRkakWsbhvO0V | encrypted | Production+Preview | Production |
| SUPABASE_PUBLISHABLE_KEY | ZVukaEfCjuKeWFSx | encrypted | Production+Preview | Production |
| VITE_SUPABASE_URL | tVKo9LotOTshCACb | encrypted | Production+Preview | Production |
| VITE_SUPABASE_PUBLISHABLE_KEY | psm91a4WWEMXgQO1 | encrypted | Production+Preview | Production |
| CORS_ORIGIN | eWjHd1Aky7vpT0bN | sensitive | Production+Preview | Production |
| VITE_API_BASE_URL | tJ2TDxYr24T5ywMX | encrypted | Preview only | Only this entry removed |
| VITE_API_BASE_URL | noi9qOYMarVxDRTJ | encrypted | Production only | Preserved unchanged |

All seven edits used the official `PATCH /v9/projects/{project}/env/{id}` with **only**
`{"target":["production"]}`. Its [official schema](https://openapi.vercel.sh) makes
value/type optional. No credential replacement, reconstruction, rotation or decryption
was requested. Values were not printed, exported or saved locally. Existing
returned value fields were compared in process memory before/after and matched for all
seven entries and the retained Production API binding. IDs, keys and types also matched.
This verifies the API-returned representation and scope-only operation; no separate
plaintext-secret read was attempted. Unrelated environment entries were also unchanged.
No Preview-target environment bindings remain in this project.

The single removal used the exact Preview-only identifier above. No Production binding,
other variable, route or combined Express API configuration was removed or recreated.
The local preflight/result evidence contains metadata and Boolean comparisons only.

## Git, deployments, aliases and health

Before: GitHub designerhawk12/NGO, repository1392985059, Production branchmain.
After: Git repository link absent in the project API; Dashboard showed project not connected.
Only the project connection was removed. Repository, branches, commits and deployments
were not deleted. No account2FA setting was changed; normal existing GitHub sign-in
was used, and the unrelated optional account-security notice was not configured.

Active deployment before/after: **`dpl_48XvHzKP9tJcFLks5XZHSuVDqxpR`**, READY,
source **`b7b321cca94b318e29e0ae8ced1e136db1ebfd3e`**.
Aliases before/after, unchanged:

- `ngo-eight-umber.vercel.app`
- `ngo-git-integration-ngo-recovery-equinox10.vercel.app`

Full returned inventory:74 deployments, pagination complete. IDs, targets, state and
creation metadata unchanged; **0 new deployments and0 observed promotions**.
Project protection remains `all_except_custom_domains`.

Read-only HTTP checks on the existing stable Production alias:

| Path | Result |
| --- | --- |
| / |200 |
| /api/v1/health |200 |
| /api/v1/health/ready |200 |
| /api/v1/me without credentials |401, expected |

Both designated staging projects were read only for verification. Their project update
timestamps, Git metadata, active deployment IDs, protection and complete environment
ID/key/scope/type inventories were unchanged. No staging writes occurred.

## Residual historical Preview risk

**42 READY historical non-Production deployments remain.** They may retain original
build/function environment bindings; a current scope edit does not rewrite them.
Not every historical deployment's effective private environment was inspected, so this
does not claim all42 hold the same secrets or that unauthorized access occurred.
Their inventory is preserved in the sanitized preflight artifact. No deletion or
credential rotation occurred. A disconnected Git link prevents automatic Git deployments;
it does not prohibit authorized manual deploy/redeploy/promote or deploy hooks.

Separate recommendations requiring owner review/approval:

1. Keep deployment protection and tightly restrict team/bypass access; audit actual access
   and deployment permissions, including MFA ownership. No controls changed here.
2. Decide whether historical previews/branch aliases should be retired or further restricted;
   do not assume newly narrowed env scopes sanitize them. Any deletion is separately gated.
3. Reconcile broad Production Auth Preview redirect wildcards and legitimate old links
   before a separately approved Auth change. No allowlist edit occurred.
4. If investigation establishes unauthorized exposure, approve a scoped credential-rotation
   and consumer update procedure; do not rotate blindly or disrupt the live deployment.

## Remaining release gates and checkpoint

No failures or skipped changes in this approved correction. The official public API
did not expose Git unlinking, so the supported authenticated Dashboard control was used;
this was verified by the API before any environment mutation. Target-only API edits
required no value workaround. No test/build or broad recovery audit was repeated.

Outstanding: off-device encrypted backup/independent key custody and formal NGO service
ownership; actual runtime binding/restricted-role rollout;015/private buckets;
Auth Site URL/redirect reconciliation, sender/provider ownership and authorized email
delivery; operator handover for expired jobs; current Donor artifact repair deployment;
Production-native signing/App Links/physical verification and residual security signoff.
All require their existing separate evidence/approval gates. No Production release is authorized.

Evidence: [before](release/vercel-isolation-before.json),
[verified result](release/vercel-isolation-result.json),
[remaining release gates](FINAL_PRODUCTION_GO_NO_GO.md).
