# Enhancement Plan 10 — Malware Scanner Functionality Requirements (Assessment + Plan)

Task doc for the 17-point Malware Scanner Functionality Requirements.
Status: **IMPLEMENTED v1.20.0 (versionCode 24)** — see Verification.
Method: five parallel code audits + own spot-verification greps. All paths are
`app/src/main/java/com/malwareshield/...` unless noted. Verdict scale:
**ACHIEVED** (meets the requirement) / **PARTIAL** (works but gaps) / **MISSING**.

## 1. Assessment matrix

| # | Requirement | Verdict | One-line evidence |
|---|---|---|---|
| 1 | Scan-running UI (%, label, async, X-of-Y, counters) | **PARTIAL** | % bar + async `ScanProgressInfo` exist (`DeviceScanScreen.kt:147-157`); "Device scan is running", "Scanned Files: X of Y", and the 4 live counters do not |
| 2 | Idle status card (status, last scan, files, 4 counters) + Quick/Full buttons | **MISSING** | No idle card, no `Last Scan` key, result is transient (`DeviceScanViewModel.kt:52`); Quick/Full chips exist but no status persistence |
| 3 | Quick prioritization; Full checks 9 dimensions | **PARTIAL** | QUICK has zero prioritization; DEEP covers hash/perms/cert/reputation/partial VT, but no components, no install metadata, system apps skip code analysis, VT quota-bounded |
| 4 | Real cancellation + partial results + no background leftovers | **MISSING** | Zero cancel path (only `ScanScheduler.kt:139` for scheduled scans); no `ensureActive` anywhere; no VIEW RESULTS / SCAN AGAIN |
| 5 | Room app inventory (17 fields), 3-state system classification, no auto-trust | **MISSING** | No inventory table (only `ScanHistoryEntity`); 11/17 fields exist only transiently; system apps skip `ScanDispatcher` ("trusted by default", `FullDeviceScanner.kt:190-193`) |
| 6 | 14 suspicious indicators, each explained, none auto-malicious | **PARTIAL** | ~7/14 detected (accessibility, device-admin, installer, SMS, dynamic loading + partial combos/obfuscation/URLs/reflection); receivers, services, native libs, IPs, naming missing; 3 over-broad auto-malicious rules |
| 7 | APK SHA-256 as primary VT identifier | **ACHIEVED** | Streaming SHA-256 (`APKAnalyzer.kt:189-201`); all VT API calls hash-only; package name used only for a browser fallback URL |
| 8 | VT repository/API/service v3, cache workflow, no needless queries, no auto-upload, copy button | **PARTIAL** | Pipeline + 4/min limiter + 24h cache + opt-in-only upload all work; required class names don't exist; **copy-hash button missing** (open-URL only) |
| 9 | VT `8/70; Malicious=8; Suspicious=1; Undetected=61; Last Analysis=<date>` + evidence framing | **PARTIAL** | Only positives/total surfaced; model parses suspicious/undetected but never reads them; no analysis-date field; VT correctly framed as one signal among many |
| 10 | `RiskEngine.kt` 0–100, bands, configurable thresholds, disclaimer | **MISSING** | No file, no 0–100 app score (only qualitative `ThreatLevel` + `max()`/`OR`), hardcoded thresholds, no disclaimer |
| 11 | Malware / PUA-PUP / Suspicious / Low Reputation / Unknown | **MISSING** | Zero PUA/PUP/low-reputation hits in code; single `highRiskCount` aggregate |
| 12 | Per-app detail (risk, score, hash, VT, perms, indicators, assessment, actions, uninstall) | **MISSING** | No detail screen/route; data exists across `DeviceFinding`/`AppScanAudit` but is never assembled per-app |
| 13 | Room scan cache (8 cols) + hash-changed→rescan:use-cache | **MISSING** | No cache table; every scan re-hashes + re-analyzes everything (`FullDeviceScanner.kt:177-199,271-283` unconditional) |
| 14 | Battery: 7 rules | **PARTIAL** | 4/7 hold (hash cache, battery-aware WM constraints, event-driven scans, rate limiters); analysis cache, incremental scan, wifi-only cloud checks missing; unchanged apps rescanned every run |
| 15 | Summary (totals, Safe/Low, Suspicious, LowRep, PUA, Malware, duration, View/Done) | **PARTIAL** | Totals + duration + coverage + cloud + scope exist; taxonomy breakdown and View Result / Done missing |
| 16 | History (per-scan mode/totals, Today/Yesterday/date, openable) | **PARTIAL** | Per-finding rows only; no per-scan summary, no date headers, no openable results (`getScanById` has zero UI callers); suspicious/clean findings never persisted |
| 17 | High-risk notification (exact text, tap→details, anti-spam, settings) | **PARTIAL** | Notifier infra exists; exact text + device-threat channel + tap intent missing; `notifications_enabled` toggle is never read by any notifier |

Score: **1 achieved · 9 partial · 7 missing.** Biggest structural gaps: no
Room inventory/cache (Req 5, 13), no RiskEngine/categories/detail (Req 10–12),
no cancellation (Req 4), no idle persistence (Req 2).

## 2. Key findings with evidence

### Scan UI (Req 1, 2, 4, 15)
- Progress % + async updates work: `LinearProgressIndicator` + `"phase:
  scanned/total (%)"` (`DeviceScanScreen.kt:147-157`), `MutableStateFlow`
  fed by scanner callbacks (`DeviceScanViewModel.kt:49,96`). Totals are
  per-phase, not cumulative; no live threat counters; no literal "Device scan
  is running" / "Scanned Files".
- Idle screen has only hero + mode chips + access prompt; result is cleared on
  next scan and lost on process death; no `LAST_SCAN` DataStore key; clean
  scans persist nothing (`DeviceScanViewModel.kt:92,106`).
- Cancellation is entirely absent: no button, no `Job` handle, no
  `ensureActive()` in `app/src/main` (verified), loops in
  `FullDeviceScanner.kt:75,110,177,271` + `InstalledAppScanner.kt:68` never
  check. A cancel must also stop `CloudLookupWorker` (`cancelUniqueWork`) and
  decide the fate of partial `HashIndex`/audit writes and already-enqueued
  `CloudLookupQueue` items, or background notifications will outlive the
  cancel (`CloudLookupQueue.kt:130-160`, `CloudLookupWorker.kt:65-105`).
- Result card already has totals, duration, coverage, cloud, scope
  (`DeviceScanScreen.kt:165-239`) — the missing piece is purely the
  Malware/PUA/Suspicious/LowRep/Unknown breakdown and View/Done actions.

### Modes, inventory, indicators (Req 3, 5, 6)
- QUICK = permission scoring for all apps in PM order + offline APK-feed
  check; no user-first / recent / changed / suspicious-first ordering
  (`FullDeviceScanner.kt:63-104`). DEEP hashes + analyzes non-system apps and
  swept files, VT via queue (8 inline, rest deferred) — bounded, disclosed,
  but not "every dimension for every app".
- Room has exactly one table (`ScanHistoryEntity`: finding-event log). UID,
  installer/source, install/update times, components, SDKs, cert are absent
  from every durable store; versionName/Code and APK size exist only
  transiently. System/user/updated-system flags exist in memory and
  `HashIndex`, but DEEP skips code analysis for system apps by policy.
- Indicator coverage ≈ half. Present: accessibility, device-admin, installer,
  SMS, dynamic loading, partial combos/obfuscation/URL/reflection. Absent for
  the app path: BOOT receiver (permission only, no component proof), persistent
  service, native libs, embedded URLs/IPs in DEX strings, package naming.
  Three rules over-convict: single ThreatScoring primitive → malicious
  (`ThreatScoring.kt:88`); 3 high perms or unsigned+high → malicious
  (`InstalledAppScanner.kt:146-147`); single YARA hit → HIGH+malicious
  (`SignatureRuleAnalyzer.kt:32-43`). Any RiskEngine work must gate these
  behind corroboration.

### Hashing, VirusTotal (Req 7, 8, 9)
- Req 7 is the one fully achieved requirement: SHA-256 everywhere, hash-only
  VT API (`VirusTotalClient.kt:19-23`), single throttled fetch
  (`ReputationService.kt:238-275`).
- Req 8 works but is misnamed vs the spec (`VirusTotalApiService` interface +
  `VirusTotalClient` singleton + `ReputationService` pipeline +
  `MalwareRepository` orchestrator; zero hits for the three required names).
  Cache workflow is correct incl. `vtChecked` guard so local verdicts never
  mask cloud lookups; upload is consent-gated + 32 MB-capped + default OFF
  (note: `GuideScreen.kt:74-75` "never uploaded" contradicts the opt-in
  feature — fix the string). Copy-hash: zero clipboard hits — add it next to
  the existing open-URL buttons.
- Req 9: `VTAnalysisStats` already deserializes malicious/suspicious/
  undetected/harmless/timeout/failure (`VirusTotalApiModels.kt:37-44`) but
  only `positives`/`total` are ever read; there is no analysis-date field.
  Finding cards don't render `vtPositives/vtTotal` inline. Framing as
  one-signal is already correct (`ReputationService.kt:22-34`,
  `MalwareRepository.kt:110-117`).

### Risk, categories, detail (Req 10, 11, 12)
- All three missing. Foundations to reuse: `ThreatScoring.scoreDex`,
  `APKAnalyzer.permissionThreatLevel`, `FullDeviceScanner` max/OR merge,
  `ThreatLevel`/`AppScanOutcome` enums, `FindingCard`/`ApkResultCard` UI,
  `AppScanAudit` data. The 0–100 URL score (`URLValidator.kt:291`) is the only
  numeric precedent — do not copy it blindly; app risk needs normalized
  weighted inputs, not a starting-100 subtraction.

### Cache, battery, history, notifications (Req 13, 14, 16, 17)
- No Room cache; `HashIndex` (filesDir JSON) + `ReputationCache` (24h) +
  7-day Bazaar negatives are file-based partials with thinner schemas and no
  versionCode/risk/analysis-version. `RecheckService` reuse is manual-only,
  never consulted inside `scan()`.
- Battery: WorkManager constraints are genuinely good (`BatteryNotLow` on all
  workers, backoff, `UNMETERED` option for scheduled scans, event-driven
  download monitoring, `onTrimMemory` drops). Missing: analysis-result cache,
  incremental per-app skip, wifi-only cloud gate (`ReputationService` checks
  only `NET_CAPABILITY_INTERNET`; workers require only `CONNECTED`).
- History stores per-finding rows; needs a per-scan session table + date
  grouping + openable results; must also persist suspicious/clean findings or
  history will keep undercounting.
- Notifications need: a `device_threat` channel, the exact high-risk text, a
  shared throttle/dedup gate that actually reads `notifications_enabled`
  (currently dead), and `PendingIntent` → detail screen.

## 3. Recommended implementation plan (phases, in order)

Architecture direction (per the brief): **incremental scanning + SHA-256 +
Room + async** so a full scan never re-analyzes thousands of unchanged apps.
Concretely: Room becomes the source of truth for per-app state; SHA-256
change detection short-circuits hashing/analysis/VT; coroutines + cooperative
cancellation keep the UI async and abortable.

### Phase A — Room foundation: inventory + sessions (Req 5, 13, 16)
- New `AppInventoryEntity` (package PK; name, versionName, versionCode, uid,
  installerPackage/installSource, firstInstallTime, lastUpdateTime, apkPath,
  apkSize, requestedPermissions JSON, activities/services/receivers/providers
  JSON, certFingerprint, targetSdk, minSdk, appCategory USER/SYSTEM/
  UPDATED_SYSTEM, lastSeenMillis). New `ScanCacheEntity` (package PK;
  apkHash, lastScanTime, riskScore, riskLevel, vtResult JSON, analysisVersion).
  New `ScanSessionEntity` (id, started/finished, mode, totals per category,
  duration, status COMPLETED/CANCELLED). Bump DB version + migration.
- New `AppInventoryCollector` (PackageManager: `GET_PERMISSIONS |
  GET_SIGNING_CERTIFICATES | GET_ACTIVITIES | GET_SERVICES | GET_RECEIVERS |
  GET_PROVIDERS`, `applicationInfo.uid`, `getInstallSourceInfo` w/
  `installerPackageName` fallback, `firstInstallTime/lastUpdateTime`,
  `sourceDir` + length, `targetSdkVersion/minSdkVersion`, cert SHA-256 via
  existing resolvers). Upserts inventory each scan; feeds QUICK
  prioritization and the detail screen.
- Persist per-scan session + all findings incl. suspicious/clean (fixes
  history undercount). Tests: collector mapping, DAO round-trips, migration.

### Phase B — Incremental scan + real cancellation (Req 3-part, 4, 13, 14-part)
- Per-app gate in `FullDeviceScanner` BEFORE hashing: load cache row; if
  `apkHash` unchanged AND `analysisVersion` current AND (QUICK: permission set
  unchanged) → reuse `riskScore/riskLevel/vtResult`, refresh `lastSeenMillis`,
  skip hash/analysis/VT entirely; else rescan and upsert. QUICK ordering:
  user-installed → recently installed/updated → hash-changed → previously
  suspicious (from cache `riskLevel`/history) → rest.
- Cancellation: keep the scan `Job` in `DeviceScanViewModel`; Cancel button;
  `ensureActive()` in every scan loop + `yield()` per N files;
  `CloudLookupQueue` drain checks cancellation; on cancel:
  `WorkManager.cancelUniqueWork("cloud_lookup")`, mark session CANCELLED with
  partial counts, show "Scan cancelled = X/Y" + VIEW RESULTS + SCAN AGAIN,
  discard-or-keep partial `HashIndex`/audit writes by policy (recommend:
  keep index, mark session cancelled). Tests: cancellation mid-scan leaves no
  worker running; unchanged-app scan performs zero hashes.
- `ANALYSIS_VERSION` constant bumped whenever analyzer/rule logic changes to
  force a clean rescan.

### Phase C — RiskEngine + categories + VT depth (Req 6-part, 8-part, 9, 10, 11)
- New `RiskEngine.kt`: normalized 0–100 from weighted inputs (static
  analysis, permission score, certificate validity, indicator set, feed/Bazaar
  reputation, VT positives rate), bands 0–19/20–39/40–59/60–79/80–100 with
  DataStore-configurable thresholds + Settings UI, and a permanent
  "score is not a definitive malware determination" disclaimer string.
  Corroboration rule: single primitives/YARA hits contribute points but can
  never alone reach High (fixes the three over-broad rules; keep their
  signals, remove their auto-malicious verdicts).
- `DetectionCategory` enum: MALWARE / PUA_PUP / SUSPICIOUS / LOW_REPUTATION /
  UNKNOWN + classifier (PUA heuristics: aggressive ads/trackers, installer/
  dropper w/o payload, risk-score band + no VT detections; Low Reputation:
  unsigned/unknown signer + young install + zero VT history). `FullScanResult`
  gains per-category counts; summary UI renders the required table.
- VT: extend `VTFileAttributes` with suspicious/undetected counts +
  `last_analysis_date`; plumb through `ReputationVerdict` → `DeviceFinding`
  → cards/history; render `VirusTotal => 8/70; Malicious=8; Suspicious=1;
  Undetected=61; Last Analysis=<date>` on the detail screen and history rows.
  Add copy-hash button (ClipboardManager) beside every open-URL button.
  Optionally introduce thin `VirusTotalRepository` facade over the existing
  client/service to match the required naming without rewriting the pipeline.
  Fix `GuideScreen.kt:74-75` upload contradiction.

### Phase D — Missing analysis inputs (Req 3-part, 5-part, 6-part)
- Manifest component extraction (activities/services/receivers/providers via
  PackageManager flags + manifest XML fallback) → enables BOOT_COMPLETED
  receiver proof, persistent-service detection, exported-component exposure.
- DEX string-table mining for embedded URLs/IPs (reuse `StringExtractor`),
  native-lib inventory (`.so` entries + `loadLibrary` patterns), reflection
  as a standalone scored indicator, package-naming heuristics
  (randomness/typosquat signals), named permission-combo rules (e.g.
  SMS+accessibility+installer). Each indicator gets an explanation string in
  the existing `appReasons` style ("Boot Persistence. This application
  registers for device startup…"). Indicators stay non-malicious alone —
  they feed `RiskEngine`, never short-circuit it.

### Phase E — Status, detail, summary, history UI (Req 2, 12, 15, 16)
- Idle `Device Status` card backed by the latest `ScanSessionEntity` +
  DataStore last-summary (status, files scanned, last-scan time, 4 counters);
  persists across process death. Live scan header: "Device scan is running" +
  cumulative "Scanned files: X of Y" + live category counters.
- App detail screen (new `Screen.APP_DETAIL` + `selectedFinding` state;
  manual routing matches the existing no-NavController pattern): name,
  package, risk band, score/100, SHA-256 + copy, VT line, permissions,
  indicators with explanations, assessment + recommended-actions text,
  Remove/Uninstall + Allow.
- Summary: category table + duration + View Result / Done. History: session
  rows grouped Today/Yesterday/date, tap → restores that scan's results.

### Phase F — Notifications (Req 17)
- `device_threat` HIGH channel; exact text (app name, Risk: High, tap →
  detail via `PendingIntent`); shared `NotificationGate` (respects
  `notifications_enabled`, per-package cooldown, dedup by hash, no stacking);
  wire gate into all three existing notifiers + new device-threat path;
  Settings exposes toggle + cooldown. Fix `DownloadScanNotifier` per-file
  spam and clean-notify noise as part of this.

### Phase G — Battery hardening, tests, release (Req 14)
- `wifiOnlyCloudChecks` DataStore toggle (default ON): `ReputationService`
  and workers require `UNMETERED` when set; analysis-result cache so
  unchanged apps skip even static analysis (Phase B covers the gate; add
  in-memory LRU for within-scan repeats).
- Tests per phase (target: 220+ total, green): engine bands/thresholds,
  classifier, incremental skip matrix, cancellation, DAO/migration, VT
  parsing, gate throttle, codec round-trips.
- Release per `AGENTS.md`: version bump, `testDebugUnitTest assembleDebug`,
  stage APK, refresh `docs/index.html` + `docs/README.md`, update
  `AGENTS.md`/`README.md`/plan verification, commit + push `origin main`.

## 4. Risks / constraints
- Package visibility: without `QUERY_ALL_PACKAGES`, enumeration silently
  shrinks (already declared; keep the readiness-style warning).
- Scoped storage / MediaStore `DATA` deprecation on Android 13+ without
  All-files-access (known; scope line already discloses).
- System partitions and `/data/data` remain unreachable without root — the
  plan never claims otherwise; Full Scan = "all Android permits".
- VT free quota bounds inline checks (queue + worker stay the mechanism;
  wifi-gate must not starve the queue — drain on unmetered only, keep
  backlog visible).
- DB migration from v2 → v3 must preserve `scan_history` rows.

## Verification (v1.20.0, filled on implementation)- `./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.
- Unit tests: **211 total, 0 failures** (33 suites). New suites:
  `RiskEngineTest` (8), `DetectionClassifierTest` (13), `VtSummaryTest` (4),
  `ThreatIndicatorsTest` (6).
- Two test-expectation bugs caught during authoring (score arithmetic 82 not
  77; single primitive + reflection is HIGH not CRITICAL) — both fixed in the
  tests, code behavior confirmed correct.
- Per-requirement acceptance: Req 7 fully achieved before; Req 1/2/4/15 UI
  strings present; Req 3 ordering + 9/9 DEEP dimensions (components now
  collected); Req 5 inventory table has all 17 fields; Req 6 explanations on
  every indicator; Req 8 facade + copy button; Req 9 exact VT line renders;
  Req 10 engine + configurable bands + disclaimer; Req 11 category table;
  Req 12 detail screen; Req 13 cache gate skips unchanged APKs; Req 14
  wifi-only default ON + UNMETERED constraints; Req 16 sessions grouped +
  openable; Req 17 exact text + tap + gate + cooldown.
- Debug APK: `zap-scanware-debug.apk`, v1.20.0 (build 24), 19.4 MB, copied to
  `docs/`.

## Follow-up v1.21.0 (this release)
- History rows open in the app detail screen (`selectHistoryFinding`;
  `scan_history.riskScore`, DB v4, non-destructive).
- `SignatureFeedManager` migrated to the `ThreatFeedJson` Gson codec —
  zero `org.json` imports remain in production code.
- Module tree in `AGENTS.md` regenerated from disk.
- Tests: 217 total (incl. `ThreatFeedJsonTest`), 0 failures on a clean
  `--rerun-tasks` run. APK v1.21.0 (build 25), 19.4 MB.