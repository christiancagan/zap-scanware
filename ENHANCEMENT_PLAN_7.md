# Enhancement Plan 7 — Deep app-scan completeness (v1.17.0)

This plan closes the gaps found when reviewing whether the pipeline
**scan all apps → SHA-256 → MalwareBazaar/VirusTotal → risk flag → result**
is actually achieved end to end. Phase 1 (v1.17.0) is implemented here;
Phases 2–4 are staged below.

## What was incomplete

- Packages the platform exposes without `applicationInfo` were silently dropped,
  so "scanned count" did not equal "enumerated count".
- An app with an unreadable APK path, a failed static report, an unconfigured
  API key, an empty MalwareBazaar mirror, or exhausted quota was all
  indistinguishable from "clean".
- `vtChecked` meant "a slot was consumed", so a network failure looked like a
  completed check.
- Deferred queue retries were unbounded.
- Deep-scan file level merging used `maxOf`, which ranked `UNKNOWN` above
  `CRITICAL`.

## Implemented in v1.17.0

### 1. Deterministic per-app coverage

- `InstalledAppScanner` now records packages without `applicationInfo` in
  `DeviceScanResult.skippedPackages` instead of dropping them.
- `AppAnalysisCoverage` records inspection depth per app:
  `FULL`, `PERMISSION_ONLY`, `ANALYSIS_FAILED`, `NOT_ANALYZED`.
- `FullDeviceScanner` builds a `LocalAppAssessment` for every enumerated app and
  emits one `AppScanAudit` per app, including skipped packages. A deep scan now
  produces exactly `appsEnumerated` audit records.

### 2. Explicit outcome vocabulary

- `AppScanOutcome`: `MALICIOUS`, `SUSPICIOUS`, `CLEAN`, `UNKNOWN`, `QUEUED`,
  `DEFERRED`, `SKIPPED`.
- `AppCloudDisposition`: `NOT_APPLICABLE`, `CHECKED`, `QUEUED`, `DEFERRED`,
  `FAILED`, `UNAVAILABLE`.
- An app is `CLEAN` only when VirusTotal actually answered (`vtChecked`) and no
  local signal fired. Everything else is explicitly `UNKNOWN`/`QUEUED`/
  `DEFERRED`/`SKIPPED`, so results can no longer imply verification that did
  not happen.

### 3. Reputation health (`ReputationReadiness`)

- `ReputationService.readiness()` reports network availability, VirusTotal key
  and remaining quota, MalwareBazaar enablement/key, offline hash counts, and
  mirror freshness/error.
- `blockingIssues` turns those facts into plain-language limitations surfaced on
  the device-scan summary, so quota or credential gaps are visible instead of
  silent.

### 4. Honest cloud verdicts

- `ReputationService.fetchVirusTotalReport` now returns `Found` / `Unknown` /
  `Failed`; `ReputationVerdict.vtChecked` means "VirusTotal answered" and the
  new `vtLookupFailed` distinguishes failures. Both persist through
  `ReputationCache`.
- `CloudLookupQueue.drain` stops the batch on failure, keeps the item queued, and
  reports `failed` / `rateLimited` in `DrainReport`.
- `CloudContinuationPolicy` bounds continuation retries (`MAX_ATTEMPTS = 10`).

### 5. Auditable results

- `AppScanAuditStore` writes a Gson report per scan to
  `filesDir/scan-audits/scan-audit-<ts>.json`, keeping the newest 20.
- `FullScanResult` exposes `appAudits`, `reputationHealth`, `auditReportPath`,
  and coverage/cloud counters; findings now carry the app hash and merge local
  and cloud verdicts before being emitted.
- The device-scan summary reports hashed/full/permission-only/failed/skipped
  counts, per-app cloud state, reputation limitations, and audit persistence.

### 6. Correctness fixes

- Deep-scan file severity uses `ThreatScoring.max` so `UNKNOWN` ranks lowest.
- Findings are emitted only after local and cloud verdicts are merged, so a
  VirusTotal detection for an app is reflected in the result the user sees.
- `ReputationService` documentation no longer claims MalwareBazaar is keyless.

## Tests

New suites: `AppScanAuditTest` (8), `ReputationReadinessTest` (7),
`CloudContinuationPolicyTest` (3), `AppScanAuditPersistenceTest` (2).
Full suite: **112 tests, 0 failures**.

## Staged follow-ups

- **v1.18.0 — calibration and remediation:** benign/malicious regression corpus
  with expected verdicts, recalibrated permission/severity model, shareable
  exportable report, and remediation deep links.
- **Later — resumable/partial scans:** cancel-and-resume for very large devices,
  per-scan duration/network budgets, and operator reporting.

## Limitations

- Cloud coverage still depends on operator configuration (VirusTotal key,
  MalwareBazaar Auth-Key) and free-tier quota; the UI now states this rather
  than implying full coverage.
- System apps remain `PERMISSION_ONLY` by design to bound deep-scan time.
- Per-app audits are local files, not yet surfaced in History UI.

## Verification

- `./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL (112 tests).
- Debug APK: `zap-scanware-debug.apk`, v1.17.0, copied to `docs/`.
