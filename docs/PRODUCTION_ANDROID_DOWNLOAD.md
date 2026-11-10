# Production Android download — 2026-11-10

User requested publishing the completed Production APK through the homepage download button.

## Verified artifact

- EAS build: `36acb049-e0fe-4707-9d1f-aa5557e21cc8`, FINISHED.
- Source: `d7a768926323e503030f47b52e2265572131de5d`.
- Version: `1.0.0`, Android version code `8`.
- Package: `com.rajashishpatil10.aaharaconnect`.
- Artifact: https://expo.dev/artifacts/eas/7cB6W9I3paFVnjHm6JBdSCapTmhOs95zfcRlKrv4kWY.apk
- Size: `100566935` bytes.
- SHA-256: `f3685eb760c3bdf2662f35b1060d0918917c7dda17e89b5e07ff84e291739d64`.
- Official Google apksig verifier: verified, zero errors/warnings. Existing certificate preserved:
  `A9:E0:71:14:66:DD:CE:D4:91:BA:3B:9B:B4:88:75:60:46:84:53:1F:25:0D:D4:85:58:15:B8:FE:3D:81:55:3E`.
- Production Supabase reference present; staging project/API references absent. Hermes98 string boundaries validated; zero actual secret-shaped entries, database URL or private-key candidates. The SDK literal `sb_secret_` is not a credential.
- Production HTTPS App Link intent host present, location foreground/background service declarations preserved. This does not establish website association or physical Android acceptance.

## Prepared homepage publication

Existing homepage fetches `/api/v1/releases/android` and enables its download button only when the server release gate passes. Server redirect currently accepts only its own public Storage release bucket. A minimal update also permits exact HTTPS `expo.dev/artifacts/eas/<artifact>.apk` paths; query strings, credentials, fragments, alternate ports and arbitrary hosts/paths remain rejected. No Storage bucket or database change is required.

Prepared Production-only Vercel settings in project `ngo` / `prj_6BuwhBiISjTlzgGtqG2arEXqOXGl`:

| Key | Value |
| --- | --- |
| ANDROID_RELEASE_URL | Artifact URL above |
| ANDROID_RELEASE_VERSION | `1.0.0 (8)` |
| ANDROID_RELEASE_BUILD_ID | `36acb049-e0fe-4707-9d1f-aa5557e21cc8` |
| ANDROID_RELEASE_SHA256 | SHA-256 above |
| ANDROID_RELEASE_APPROVED | `true` |

Requires one deployment of the minimal server change using all other existing Production configuration unchanged. Verify release metadata, anonymous redirect, artifact HTTP access, homepage button, health/readiness200 and anonymous `/me`401. Roll back this publication by restoring the prior deployment; do not alter accounts or application data.

Local verification: 25/25 focused release/security tests passed; server and web builds passed. Local web build emitted existing missing build-environment placeholders and bundle-size warnings; Production build must use the existing Vercel Production environment.

## Current state

User explicitly approved the five Production-only release settings and one narrow deployment after the first variable creation was rejected due to earlier restrictions. All five settings were then saved successfully using Vercel MCP. No deployment initiated yet. An unspecified deployment request was rejected; execution must explicitly bind reviewed source, Production target, team and project.

No new EAS build. Physical Production Android acceptance remains pending. HTTPS website association remains unverified/previously404; public Volunteer registration remains disabled. Publishing the download is not a claim that those gates passed. The existing web/API GO is unchanged.

Preserve unrelated untracked `docs/STAGING_CHECKPOINT.md`.
