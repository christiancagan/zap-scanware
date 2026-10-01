# MalwareShield - Mobile Malware Endpoint Protection

## Overview
Lightweight Android malware detection and prevention application built with Kotlin and modern Android architecture. Supports manual scanning, background scanning, APK static analysis, SHA-256 hashing, VirusTotal integration, URL/site validation, local scan history, and privacy-first operation. There is no login: the app opens straight to the dashboard (see §27).

## Technology Stack
| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Language** | Kotlin 1.9+ | Official Android, null-safe, coroutines |
| **UI** | Jetpack Compose | Declarative, minimal CPU/GPU overhead |
| **Architecture** | MVVM + Clean Architecture | Separation of concerns, testable |
| **Database** | Room (SQLite) | Lightweight, local-first, encrypted |
| **Background** | WorkManager | Battery-efficient constraints |
| **Networking** | Retrofit + OkHttp | Lightweight HTTP client |
| **DI** | Hilt (Dagger) | Minimal overhead dependency injection |
| **Security** | Android Keystore | Hardware-backed encryption |
| **Coroutines** | Kotlin Coroutines + Flow | Async without thread overhead |
| **API** | VirusTotal v3 + Google Safe Browsing | Industry-standard threat intelligence |
| **Crypto** | Android Keystore AES-GCM (`PrivacyCrypto`) | Encrypt local secrets at rest; no login gate |

## Features

### 1. Manual Malware Scanning
File picker → SHA-256 → APK analysis → VirusTotal lookup → Threat classification

### 2. Background Scanning
WorkManager with battery/network constraints

### 3. APK Static Analysis
Package metadata, permissions, certificate fingerprint, DEX pattern detection

### 4. SHA-256 File Hashing
Streaming 8KB buffer, no full file loading into RAM

### 5. VirusTotal Integration
Retrofit-based API, file upload and hash-based report lookup

### 6. URL/Site Validation
SSL/TLS verification, phishing detection, domain reputation, homograph attack detection, safety scoring (0-100), Google Safe Browsing integration

### 7. Authentication — removed (v1.24.1)
There is no login, password or biometric unlock gate. The app opens straight to
the dashboard. `BiometricGateScreen`, `AuthViewModel`, `AuthManager` and
`BiometricAuthenticator` were deleted; the `USE_BIOMETRIC` permission was
dropped. `PrivacyCrypto` still encrypts local secrets with an Android Keystore
AES-GCM key, but that key no longer requires user authentication or StrongBox
(those flags crashed startup on many devices — see §27).

### 8. Local Scan History
Room database with Flow, encrypted with Android Keystore

### 9. Minimal Resource Consumption
CPU, RAM, Battery, Network optimization

### 10. Privacy-First Operation
All data stored locally only, no telemetry

### 11. Clean Material Design 3 UI
Dark/Light theme, navigation drawer (Dashboard + Scan + Validate + History), threat badges

### 12. Multi-Format Static Analysis
Format-aware scanning beyond APKs (see `ENHANCEMENT_PLAN.md`):
- **Identification**: magic-byte sniffing overrides disguised extensions
  (`FileTypeIdentifier`).
- **Analyzers** (`core/analysis/analyzers/`): APK, `.apks`/`.xapk`, `.aab`,
  `.dex`/`.odex`, `.jar`/`.class`, Windows PE, scripts, archives (recursive,
  bomb-guarded), macro/active-content documents.
- **Rule engine**: YARA-compatible subset (bundled + feed rules) run on every
  file (`RuleEngine`); feed schema v2 adds `yara_rules`.
- **PE**: header/section parse, packer + writable/executable sections,
  per-section entropy, keylogger/injection/downloader imports.
- **Archives**: recursive ZIP/GZIP/TAR member analysis with `BombGuard` and
  double-extension disguise detection.
- No execution; streaming, bounded, fail-safe.

### 13. Hash Reputation & Content Filter
- **Reputation pipeline** (`core/reputation/ReputationService`): feeds →
  cache → MalwareBazaar → VirusTotal (rate-limited, 24h cache). Used by the
  manual scan path and the full device scan.
- **Apps**: every installed app's APK is hashed and reputation-checked
  (`InstalledAppScanner.apps` → `FullDeviceScanner`), alongside permission
  scoring. Malicious findings are persisted to scan history.
- **Files**: every storage target is hashed and reputation-checked during the
  device scan.
- **Content filter** (`core/content/`): category classifier (adult, gambling,
  violence, drugs, piracy, malware) + custom blocklist; user chooses
  **Notify** or **Block**. Enforced by `UrlGuardAccessibilityService`, which
  launches `BlockActivity` on a blocked category.
- **Scan modes** (`ScanMode`): Device scan offers **Quick** (local: app
  permission/signature scoring + offline APK hash feed, no network) and
  **Deep** (default: full multi-format analysis + cloud reputation). Persisted
  via `PreferenceManager.scanMode`.
- Configured in Settings → *Content filter*; requires the accessibility service
  to be enabled. See `ENHANCEMENT_PLAN_2.md`.

### 14. Link Protection, Download Scanning & UI
- **Safe Browse** (`core/safebrowse/SafeBrowseVpnService`): a DNS-filtering
  `VpnService` that classifies each queried domain with `ContentFilter` and
  returns NXDOMAIN for blocked/malware names — a real "scan before open"
  (domain granularity; DoH/DoT can bypass). Enabled in Settings → Safe Browse.
- **Download scanning** (`core/downloads/`): `DownloadMonitor` observes new
  downloads and `DownloadScanWorker` analyzes + reputation-checks them, then
  notifies and records to history. Toggle: Settings → Scan downloaded files.
- **UI**: APK scanner trimmed (no "any file"); History/Schedule/Guide modernized
  (gradient heroes, live countdown, searchable guide); URL Validator redesigned
  with an off-main safety score. See `ENHANCEMENT_PLAN_3.md`.

### 15. Performance & Storage Hygiene
- **`core/perf/CacheManager`**: reports cache/temp size, clears temporary files,
  clears the whole cache, and removes stale scratch files (24h) on startup.
- Temp artifacts use recognized prefixes (`scan-`, `file-`, `dl_scan_`,
  `ms_pkg_`, `ms_arc_`) and are deleted in `finally` / after use.
- `MalwareShieldApp.onTrimMemory` drops rebuildable in-memory caches under
  pressure; user data is never touched.
- Settings → *Storage & performance* shows sizes and offers manual clear.
- See `PERFORMANCE.md` for the rules and runbook.

### 16. Detection hardening (QC remediation)
A malware-detection QC review (see `ENHANCEMENT_PLAN_4.md`) found the scanner
was a heuristic + cloud-hash triage tool rather than a virus scanner. The
following were implemented in v1.14.0:

- **Unified threat scoring** (`core/security/ThreatScoring`): DEX/API
  indicators are now split into *malicious primitives* (dynamic loaders,
  `Runtime.exec`, root shell, silent install, accessibility/device-admin abuse),
  *sensitive APIs* (SMS, IMEI/IMSI, contacts, location, camera/mic) and
  *capabilities* (WebView, sockets, crypto). A single capability is no longer
  reported CRITICAL — the old logic flagged almost every real app. All DEX
  analyzers (APK, DEX, JAR, AAB) share this scoring so verdicts are consistent.
- **YARA rules on the manual APK scan**: `MalwareRepository.scanAPK` now runs
  `SignatureRuleAnalyzer` (bundled + feed rules), which previously only ran on
  the generic/device-scan paths. The main "Select APK" flow now matches rules
  (including EICAR).
- **Installed-app code analysis**: the deep device scan now runs the full
  `ScanDispatcher` pipeline on each non-system installed APK, not just
  permission scoring + hash reputation.
- **Expanded bundled rules**: `BundledRules` adds Android dropper, premium-SMS,
  accessibility-abuse, overlay-phishing, device-admin ransomware and silent
  installer families plus keylogger/ransomware PE heuristics.
- **Opt-in VirusTotal upload**: unknown files (hash not in feeds/VT) can be
  submitted for multi-engine analysis via Settings → *Upload unknown files to
  VirusTotal* (default OFF; requires a VT API key). Fixes the previous gap where
  novel samples were never submitted and read as "clean".
- **Wider bounded coverage**: rule scan cap 16 → 32 MB; device-scan file cap
  50 → 100 MB and 300 → 500 files.
- **Tests**: `ThreatScoringTest` locks the scoring thresholds (10 cases).

A follow-up (v1.15.0, see `ENHANCEMENT_PLAN_5.md`) closed the remaining open
items:

- **Prioritized cloud-lookup queue** (`core/reputation/CloudLookupQueue` +
  `CloudQueuePolicy`): the device scan scores everything with the free sources,
  then spends the limited VirusTotal quota on the highest-risk candidates and
  defers the rest. `ReputationService.check(hash, includeVirusTotal)` and the
  `vtChecked` cache flag keep local-only verdicts from masking cloud lookups.
- **Background continuation** (`data/repository/CloudLookupWorker`): a
  WorkManager worker drains the queue in rate-limited batches, records malicious
  results to history, notifies, and reschedules while items remain. Shares the
  singleton queue via `core/reputation/CloudLookupGraph`.
- **Signed feeds** (`core/signatures/SignatureVerifier`): when
  `BuildConfig.FEED_PUBLIC_KEY` is set, remote feeds must carry a valid
  `X-Zap-Signature` ECDSA-P256/SHA-256 header or are rejected. `FeedStatus`
  exposes `signatureRequired`/`verifiedSources`; `DEFAULT_FEED_URLS` is the
  operator feed hook.
- **Broader baseline**: bundled DEX patterns now use
  `ThreatScoring.ALL_DEX_PATTERNS`; suspicious-domain list adds abused
  free-DNS/tunneling/paste services.
- **UI**: device-scan summary shows cloud checked/queued; Settings → Threat
  intelligence shows VT slots, queue depth, and a clear-queue action.
- **Tests**: `CloudQueuePolicyTest` (6) and `SignatureVerifierTest` (4).

### 17. MalwareBazaar integration (v1.16.0)
abuse.ch now requires an `Auth-Key` header on every request, so the old keyless
lookup was broken. See `ENHANCEMENT_PLAN_6.md`.

- **Auth-Key**: `PreferenceManager.malwareBazaarAuthKey` (stored encrypted via
  `PrivacyCrypto`); `MalwareBazaarClient.lookupHash(api, sha256, authKey)` sends
  the header and returns null when no key is set. Settings has a masked key field.
- **Recent-detections mirror** (`core/signatures/MalwareBazaarFeed`): pulls
  `recent_detections` (≤168 h), validates/lowercases SHA-256, persists
  `{sha256, family, tags, first_seen}` to `filesDir/mb_signatures.json`.
  `SignatureFeedManager.isKnownMaliciousHash` now also matches this mirror, so
  the whole app gets real offline hashes. `MalwareBazaarFeedParser` is pure and
  tested.
- **Scheduling**: the daily `SignatureFeedWorker` refreshes the mirror when a key
  is configured; Settings → Threat intelligence has Save/Sync and a live count.
- **Tests**: `MalwareBazaarFeedParserTest` (5).

### 18. Deep app-scan completeness (v1.17.0)
See `ENHANCEMENT_PLAN_7.md`. The pipeline is now auditable end to end.

- **Terminal per-app coverage** (`core/security/AppScanAudit.kt`):
  `AppAnalysisCoverage` = `FULL` / `PERMISSION_ONLY` / `ANALYSIS_FAILED` /
  `NOT_ANALYZED`; `AppCloudDisposition` = `NOT_APPLICABLE` / `CHECKED` /
  `QUEUED` / `DEFERRED` / `FAILED` / `UNAVAILABLE`; `AppScanOutcome` =
  `MALICIOUS` / `SUSPICIOUS` / `CLEAN` / `UNKNOWN` / `QUEUED` / `DEFERRED` /
  `SKIPPED`. Every enumerated app gets exactly one audit record.
- **No silent drops**: `InstalledAppScanner` records packages without
  `applicationInfo` in `DeviceScanResult.skippedPackages`.
- **Reputation health** (`core/reputation/ReputationReadiness`): network,
  VirusTotal key/quota, MalwareBazaar key, and mirror freshness produce
  `blockingIssues` shown on the device-scan summary.
- **Honest cloud verdicts**: `ReputationVerdict.vtChecked` now means VirusTotal
  answered; new `vtLookupFailed` distinguishes failures; both persist through
  `ReputationCache`. `CloudLookupQueue.DrainReport` reports `failed` /
  `rateLimited`.
- **Bounded retries**: `CloudContinuationPolicy.MAX_ATTEMPTS = 10`.
- **Audit report** (`core/security/AppScanAuditReport.kt`): per-scan JSON in
  `filesDir/scan-audits/` (newest 20), path exposed via
  `FullScanResult.auditReportPath`.
- **Tests**: `AppScanAuditTest`, `ReputationReadinessTest`,
  `CloudContinuationPolicyTest`, `AppScanAuditPersistenceTest` (112 total).

### 19. Durable hash index, MalwareBazaar per-hash, offline feeds (v1.18.0)
See `ENHANCEMENT_PLAN_8.md`.

- **Durable hash index** (`core/security/HashIndex`): SHA-256 → package/path/
  verdict/last-seen stored in `filesDir/hash_index.json` (survives cache clears).
  `AppScanAudit` now carries `sha256` so a recheck needs no re-hash.
- **Recheck** (`core/security/RecheckService` + "Recheck known hashes" in the
  device-scan UI): resolves from the index and skips the network for hashes that
  already have a terminal verdict; reports reused/looked-up/quota-saved.
- **MalwareBazaar per-hash**: typed `BazaarOutcome` (Found/NotFound/Unauthorized/
  RateLimited/Error) — an invalid key is no longer indistinguishable from a
  clean hash. Added `MalwareBazaarPacer` (fair-use limiter + per-scan budget)
  and `MalwareBazaarNegativeCache` (7-day negative cache for NotFound).
- **MalwareBazaar mirror**: merge-with-retention (`MalwareBazaarMirrorPolicy`,
  30 days / 20k cap) replaces the old full-replace that forgot older hashes;
  incremental lookback, ETag persistence, failures preserve good data, richer
  `Status`.
- **Offline URL feeds**: per-source status (one bad feed no longer masks healthy
  ones), staleness indicator, and `DEFAULT_FEED_URLS` merged with user feeds.
- **Tests**: `MalwareBazaarOutcomeTest`, `MalwareBazaarMirrorPolicyTest`,
  `HashIndexTest`, `MalwareBazaarPacerTest`, `FeedFreshnessTest` (148 total).

### 20. Finding actions, Gson migration, coverage honesty, cleanup (v1.19.0)
See `ENHANCEMENT_PLAN_9.md`.

- **Remove / Allow on every finding** (`DeviceScanScreen.FindingCard`):
  `Remove` deletes the file (and forgets its hash in `HashIndex`) or fires the
  uninstall intent for apps; `Allow` persists a `FindingAllowlist` entry
  (`filesDir/allowlist.json`, hash primary + package/path fallback) that
  suppresses the item in future scans, cloud-queue candidates, and rechecks.
  Audits keep an "allowed" reason; nothing is falsified.
- **Gson migration**: `ReputationCache`, `CloudLookupQueue`, `MalwareBazaarFeed`,
  `EventLogger`, `ProviderKeyManager` moved off `org.json` (untestable stubs on
  JVM) to Gson with pure codecs; 6 new test suites. `SignatureFeedManager`
  remote parsing stays on org.json (follow-up).
- **Coverage honesty**: device-scan hero/guide/mode strings now state the
  bounded truth (QUICK scores apps without hashing; DEEP hashes non-system
  APKs; storage sweep covers download/media dirs, ≤500 files / ≤100 MB;
  system/private partitions unreachable without root). `ApkFinder` adds DCIM /
  WhatsApp / Bluetooth / Movies / Music dirs and reports `truncated`; the
  result card shows a scope line (walk vs MediaStore-only, cap warning).
- **Cleanup** (every removal reference-checked): deleted dead `ScanUseCases`,
  `SafeBrowsingApiService`, `FilePicker` composable, `ScanProgressIndicator`,
  legacy v2 VT models, orphan `core/`, `activity_main.xml`, 2 drawable icons,
  placeholder `google-services.json`, `PAGES.md`/`INSTALL.md`; pruned
  strings/colors; moved the feed fixture to `src/test/resources`; removed 13
  unused Gradle deps (navigation, compose-tooling, lifecycle-compose, mockito,
  truth, coroutines-test, androidTest set). APK shrank 21.3 → 19.3 MB.
- **Tests**: 180 total, 0 failures.

### 21. Scanner requirements: RiskEngine, categories, incremental Room cache (v1.20.0)
See `ENHANCEMENT_PLAN_10.md` (assessment: 1 achieved / 9 partial / 7 missing).

- **Room inventory + scan cache + sessions** (DB v3, non-destructive
  migration): `AppInventoryEntity` (17 fields incl. UID, installer, times,
  components, cert, SDKs, USER/SYSTEM/UPDATED_SYSTEM), `ScanCacheEntity`
  (apkHash, version, score, level, VT JSON, analysis version, category),
  `ScanSessionEntity` (mode, totals per category, COMPLETED/CANCELLED).
  `AppInventoryCollector` gathers everything Android permits per scan.
- **Incremental scanning**: unchanged APK + current `ANALYSIS_VERSION` reuses
  the cached verdict (no analysis, no reputation, no quota). QUICK orders
  user-installed → previously suspicious → recently updated.
- **Real cancellation**: retained scan `Job`, Cancel button, `yield()` in all
  loops, `cancelUniqueWork("cloud_lookup")`, CANCELLED session with partial
  counts + VIEW RESULTS / SCAN AGAIN.
- **RiskEngine** (`core/security/RiskEngine`): weighted 0–100 (static 30,
  perms 15, cert 10, indicators 15, reputation 15, VT 15) with a
  corroboration cap (one lone signal never reaches High) and configurable
  bands (Settings, defaults 40/60/80) + disclaimer. `DetectionClassifier`:
  MALWARE needs feed/Bazaar/VT-quorum/corroborated-Critical; PUA-PUP via
  adware/tracker/installer hints; SUSPICIOUS/LOW_REPUTATION/UNKNOWN/CLEAN.
- **VT depth**: suspicious/undetected counts + `last_analysis_date` plumbed
  through verdict → cache → findings; `VtSummary.display()` renders the
  required `VirusTotal: 8/70; Malicious=8; Suspicious=1; Undetected=61; Last
  Analysis=<date>` line; copy-hash button on every finding (ClipboardManager).
  Thin `VirusTotalRepository` facade over the existing pipeline.
- **New indicators**: BOOT receivers (single system query + explanation),
  native-lib inventory + suspicious names, embedded URL/IP mining (2 MB cap),
  standalone reflection scoring, package-naming (impersonation/entropy),
  SMS+accessibility+installer combo rule — all explanations, none
  auto-malicious (categories govern user-visible labels).
- **UI**: idle Device Status card (persisted session), "Device scan is
  running" + "Scanned files: X of Y", category summary table + View
  Result/Done, per-app detail screen (score, hash+copy, VT line, permissions,
  indicators, assessment, recommended actions, uninstall/remove/allow),
  history sessions grouped Today/Yesterday/date and openable, notification
  tap → detail.
- **Notifications**: `device_threat` channel with the exact high-risk text,
  shared `NotificationGate` (master toggle now actually enforced + per-key
  cooldown, default 60 min), tap intents on all notifiers.
- **Battery**: wifi-only cloud gate (default ON) in `ReputationService`,
  UNMETERED worker constraints, feed-worker metered retry; analysis cache via
  the Room gate.
- **Tests**: 211 total, 0 failures.

### 22. History detail, feed-codec migration, tree refresh (v1.21.0)
- **History → detail**: every history row (finding list + session views) opens
  the full app detail screen (`selectHistoryFinding` maps the row back to a
  `DeviceFinding` + inventory lookup); detail back-navigation returns to the
  originating tab. `scan_history` gains `riskScore` (DB v4, non-destructive)
  so old rows render scores too.
- **org.json fully eliminated** from production: `SignatureFeedManager`
  remote parsing + cache now use the pure `ThreatFeedJson` Gson codec
  (identical format behavior incl. legacy v1 acceptance), tested against the
  real `sample-threat-feed.json` fixture (`ThreatFeedJsonTest`, 6 cases).
- **Module tree refreshed** from disk (was listing long-removed auth screens).
- **Tests**: 217 total, 0 failures.

### 23. Production readiness fixes (v1.22.0)
- **Release signing**: `signingConfigs["release"]` added to
  `app/build.gradle.kts`, reading `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`,
  `KEY_ALIAS`, `KEY_PASSWORD` from environment variables first, then
  `local.properties` (fallback keystore path `release-key.jks`).
- **Network security**: `res/xml/network_security_config.xml` added with
  certificate pinning for VirusTotal and MalwareBazaar.
- **Biometric security**: `PrivacyCrypto` now uses `setUserAuthenticationRequired(true)`
  and `setIsStrongBoxBacked(true)`. `BiometricAuthenticator` removed
  `encryptWithBiometric()` and `decryptWithBiometric()` — all encryption
  must be gated by a biometric ceremony via `authenticateWithCrypto()`
  or `encryptWithPrompt()`.
- **System app scanning**: `FullDeviceScanner` no longer skips code analysis
  for system apps. All apps are analyzed equally.
- **Cancellation fix**: `cancelScan()` now calls `cancelUniqueWork("cloud_lookup")`
  to stop the background cloud lookup worker.
- **ProGuard rules**: Added keeps for `ThreatScoring` patterns,
  `BiometricAuthenticator`, `PrivacyCrypto`, and `APKAnalyzer` regex fields.
- **Instrumented tests**: `app/src/androidTest/` restored with basic
  activity and Compose UI tests.
- **Documentation**: `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/README.md`
  updated with release build instructions.
- **Version**: versionCode 26, versionName "1.22.0".
- **Build script (Kotlin DSL)**: `lint {}` replaces the Groovy `lintOptions`
  block; use `buildTypes { named("release") { ... } }` (a bare `release {}`
  clashes with the `KotlinSourceSet.release` receiver). JUnit4 logging lives in
  a top-level `tasks.withType<Test> { testLogging { ... } }`; do **not** call
  `useJUnitPlatform()` — the unit tests are JUnit4.
- **Tests**: 217+ total, 0 failures.

### 24. Device Scan UX: coverage honesty, single control, destructive actions (v1.23.0)
- **Coverage diagnosis**: a device scan showing a low file count (e.g. "28
  files") is almost always because **"All files access" is off**. With scoped
  storage, `ApkFinder.findScanTargets()` skips the filesystem walk and falls
  back to MediaStore, which exposes only app-visible files. Installed apps are
  enumerated separately (e.g. 93 apps + 28 visible files), so the totals are
  correct but were mislabeled.
- **Honest UI**: `DeviceScanScreen` shows a prominent red "File scanning is
  limited" callout before the scan and a post-scan warning that names the
  visible file count; the Device Status card now shows "Apps scanned: X · Files
  scanned: Y · Mode: …" instead of a summed "Files scanned".
- **Single control**: the "Scan mode" Quick/Deep chips set the mode and the hero
  "Scan this device" button is the only trigger. The duplicate Quick Scan / Full
  Scan buttons on the Device Status card were removed.
- **Permission refresh**: a `LifecycleEventObserver` on `ON_RESUME` calls
  `refreshAccess()`, so returning from system Settings updates the prompt.
- **Destructive actions**: finding cards and `AppDetailScreen` label the action
  **Uninstall** (apps) or **Delete** (files) and require an `AlertDialog`
  confirmation. File delete in `DeviceScanViewModel.removeFinding` treats an
  already-missing file as success, best-effort deletes the MediaStore row, drops
  the hash from `HashIndex`, and reports clear failure guidance (grant All files
  access) when the OS refuses.
- **Version**: versionCode 27, versionName "1.23.0".

### 24b. Scrollable screens fix (v1.23.1)
- **Root cause**: several screens placed a `LazyColumn(modifier = fillMaxSize())`
  *after* other content inside a plain `Column`. The lazy list was measured at the
  full parent height, so it ran off the bottom of the non-scrolling column and
  could not be scrolled.
- **Fix**: `DeviceScanScreen` (results), `HistoryScreen`, `LogViewerScreen` and
  `ApkFinderScreen` now use a **single top-level `LazyColumn`**, with header
  sections as `item {}` and lists as `items(...)`. `HistoryScreen` computes its
  grouped sessions outside the (non-composable) `LazyListScope` and keys items by
  id. Dialogs remain outside the list.
- **Rule**: never nest a `LazyColumn(fillMaxSize())` under non-weighted content in
  a `Column`. Either use one root `LazyColumn`, or give the list `Modifier.weight(1f)`.
- **Version**: versionCode 28, versionName "1.23.1".

### 25. Performance & hot-path hardening (v1.23.2)
- **Batched durable writes**: `HashIndex.record`/`updateVerdict` and
  `ReputationCache.put` take `persist: Boolean = true`. Bulk callers
  (`FullDeviceScanner`, `CloudLookupQueue.drain`, `RecheckService`) pass
  `false` and call `flush()` once. Never serialize the whole JSON file per item.
- **Bulk history insert**: `ScanHistoryDao.insertScans` +
  `MalwareRepository.recordDeviceFindings`; `DeviceScanViewModel.persistSession`
  writes all findings in one Room transaction.
- **Preference snapshot**: `ReputationService.prefs()` TTL-caches the DataStore
  reads used per hash on the scan hot path.
- **Lazy screens**: `ScanScreen` now uses a single root `LazyColumn`.
- **Removed dead code**: `ApkFinderScreen.kt` (never navigated to; `ScanScreen`
  already provides find-and-scan).
- **Tests**: added batched-persistence cases to `HashIndexTest` and
  `ReputationCacheTest`.
- **Version**: versionCode 29, versionName "1.23.2".

### 26. Single-pass file reads (v1.24.0)
- **`core/analysis/FileDigest.kt`**: `FileDigest(sha256, head)` and
  `FileDigestReader.read(file, headLimitBytes)` — one 64 KB-chunk streaming pass
  that computes SHA-256 and retains the first `headLimitBytes` for rule
  matching. Fail-closed (`FileDigest.EMPTY`).
- **`ScanDispatcher.dispatch(..., digest)` / `dispatchMember(..., digest)`**:
  when a digest is supplied, `SignatureRuleAnalyzer.analyzeHead(head, size, type)`
  runs on the already-read head instead of re-reading the file. Callers that do
  not pass a digest behave exactly as before.
- **`APKAnalyzer.collectSignals`**: one `ZipFile` pass collecting DEX signature
  matches, `.so` names, and embedded URLs/IPs (caps: 100 MB DEX/entry for
  patterns, 2 MB DEX total for strings). Replaces the old two-pass
  `collectThreats` + `collectPackageSignals`.
- **Call sites using one digest per file**: `FullDeviceScanner` (app + file
  loops), `MalwareRepository.scanAPK` / `scanGenericFile`, `DownloadScanWorker`.
  The cached-app gate still hashes first (required) and now reuses that digest
  for analysis.
- **Tests**: `FileDigestReaderTest` (6).
- **Version**: versionCode 30, versionName "1.24.0".

### 27. Remove login gate + fix startup crash (v1.24.1)
- **Launch crash root cause**: `PrivacyCrypto.initKeyStore()` ran in
  `Application.onCreate()` and built its Keystore key with
  `.setIsStrongBoxBacked(true)` and `.setUserAuthenticationRequired(true)`.
  StrongBox-unavailable devices, and devices without an enrolled lock screen,
  throw during key generation → the process crashed before any UI, so the app
  "would not open at all". (Introduced in v1.22.0.)
- **Fix**: both flags removed. `initKeyStore()` is wrapped in `runCatching`,
  `encrypt`/`decrypt` lazily retry via `requireKey()`, and existing callers
  already guard with `runCatching`. Data remains encrypted at rest.
- **Authentication removed**: deleted `BiometricGateScreen.kt`,
  `AuthViewModel.kt`, `AuthManager.kt`, `BiometricAuthenticator.kt`;
  `MainActivity` no longer imports BiometricPrompt/BiometricManager and renders
  `LogoBackground { … }` directly (no `if (!isAuthenticated)` branch).
  Removed `provideBiometricAuthenticator` from `AppModule`, the
  `USE_BIOMETRIC` manifest permission, and the ProGuard keep for
  `BiometricAuthenticator`. Guide text updated ("opens straight to the
  dashboard").
- **No tests changed** (auth had no unit tests); full suite still green.
- **Version**: versionCode 31, versionName "1.24.1".

### 28. Safe Browse reliability, content-filter enforcement, settings password (v1.25.0)
- **Safe Browse DNS proxy** (`core/safebrowse/SafeBrowseVpnService.kt`): each
  query gets its own `protect()`ed `DatagramSocket`, replies are matched by DNS
  transaction id, three resolvers are tried, and a query is **always answered**
  (NXDOMAIN blocked / SERVFAIL on upstream failure) so a slow resolver can never
  stall the device's DNS. A 4-thread pool handles packets; `setUnderlyingNetworks(null)`
  follows the default network. Only IPv4/UDP:53 is proxied (documented).
- **Content filter** (`core/content/ContentFilter.kt`): custom-blocklist domains
  always block when filtering is on. `PreferenceManager` defaults `contentAction`
  to `BLOCK` and `blockedCategories` to **all** categories.
- **Accessibility guard** (`core/security/UrlGuardAccessibilityService.kt`):
  `HOST_REGEX` matches bare domains (browsers show `pornhub.com`, not a full
  URL), so categories are enforced even without Safe Browse.
- **Config lock / settings password** (`core/security/ConfigLockManager.kt`,
  `PasswordHasher.kt`): PBKDF2-HMAC-SHA256 (120k iters, 16-byte salt),
  constant-time verify, 5-minute in-memory unlock, 5-attempt lockout (60 s).
  Room `config_lock` (single row) via `ConfigLockDao`/`ConfigLockEntity`; **DB v5**
  (`MIGRATION_4_5`, non-destructive). No recovery — clearing app data is the only
  reset.
- **Settings staging** (`PreferenceManager.EditableSettings` +
  `editableSettings`/`applySettings`, `SettingsViewModel`): edits update an
  in-memory draft; `isDirty` gates the Save button; Save verifies (or first
  creates) the password and writes all settings in one DataStore transaction.
  Safe Browse **disable** and app Uninstall / file Delete prompt for the password
  (via `DeviceScanViewModel.lockRequired`/`verifyLock`).
- **Settings UI**: `SettingsSectionCard` blue tint + blue `BlueButton`/
  `StepButton`, blue section titles, bottom Save/Discard bar.
- **Tests**: `PasswordHasherTest` (6), `ConfigLockManagerTest` (5).
- **Version**: versionCode 32, versionName "1.25.0".

### 29. Fix accessibility-guard UI freeze (v1.25.1)
- **Bug**: v1.25.0 made `UrlGuardAccessibilityService` match bare domains, so
  every content/text-change event (dozens/sec) triggered a full
  `AccessibilityNodeInfo` traversal + `runBlocking` DataStore evaluation per
  host on the UI process with an unbounded `Executors.newSingleThreadExecutor`
  queue → CPU saturation, app unresponsive.
- **Fix**: throttle to `MIN_SCAN_INTERVAL_MS = 800`, coalesce with an
  `AtomicBoolean` (drop events while a scan is queued), skip our own package,
  cap `MAX_HOSTS_PER_SCAN = 12`, cache per-host verdicts for
  `HOST_CACHE_TTL_MS = 60s`, wrap `inspect` in try/catch, and move
  `rootInActiveWindow` after the throttle check (one binder call per scan).
- **`ContentFilter`** caches the user policy for 5 s (`POLICY_TTL_MS`) so hot
  callers no longer read DataStore per domain.
- **Settings** uses `EditableSettings()` as a fallback so it never shows an
  indefinite spinner.
- **Version**: versionCode 33, versionName "1.25.1".

### 30. Startup robustness + crash log (v1.25.2)
- **DataStore fail-safe** (`PreferenceManager`): `preferencesDataStore` uses
  `ReplaceFileCorruptionHandler { emptyPreferences() }`; `themeMode` and the
  `editableSettings` snapshot use `.catch { emit(emptyPreferences()) }` and a
  private `Preferences.safe(key, default)` (per-key `runCatching`) so a missing
  or wrong-typed value can never throw during startup. This matters because
  `SettingsViewModel` (created at launch for the theme) reads the whole
  preference store eagerly.
- **Crash logger** (`MalwareShieldApp.installCrashLogger`): a
  `Thread.setDefaultUncaughtExceptionHandler` writes the stack trace to
  `getExternalFilesDir(null)/last-crash.txt` and `Log.e("ZapScanware", …)`, then
  delegates to the platform handler. Read it via a file manager or
  `adb pull /sdcard/Android/data/com.zapscanware.debug/files/last-crash.txt`.
- **Defensive startup**: `Application.onCreate` work is in `runCatching`.
- **Network security config**: placeholder certificate pins removed (they broke
  all VT/Bazaar TLS); base config + debug override retained.
- **Version**: versionCode 34, versionName "1.25.2".

### 31. Fix launch crash: SettingsViewModel init order (v1.25.3)
- **Symptom**: app installed but never opened (crashed instantly).
- **Captured crash** (emulator + the v1.25.2 crash logger):
  `NullPointerException: Attempt to invoke interface method
  'void kotlinx.coroutines.flow.MutableStateFlow.setValue(Object)' on a null
  object reference` at `SettingsViewModel$refreshLockState$1.invokeSuspend`
  (`SettingsViewModel.kt:114`).
- **Cause**: the `init {}` block called `refreshLockState()` while
  `_hasPassword`/`_unlocked` were still uninitialized (declared later in the
  class). `viewModelScope` = `Dispatchers.Main.immediate`, so the launched body
  ran synchronously during construction and read the null field as the
  assignment receiver, then NPE'd on `setValue`. `MainActivity` creates
  `SettingsViewModel` at launch for the theme → process died before any UI.
- **Fix**: moved the `init {}` block to the **end** of the class body so every
  property initializer runs first. (Rule: never call a method that writes a
  StateFlow from `init` before that field is declared.)
- **Rule/best practice**: `viewModelScope.launch` on `Main.immediate` executes
  synchronously up to the first suspension — do not rely on it to defer work
  past property initialization.
- **Verified**: installed and launched on an x86_64 API 34 emulator; dashboard
  renders ("You're protected", Quick actions) and stays resumed; no crash file.
- **Version**: versionCode 35, versionName "1.25.3".

### 32. File-scan scope + scanned-item categorisation (v1.26.0)
- **Why the file count was low**: `ApkFinder` only walked `SEARCH_DIRS`
  (downloads/documents/DCIM/Movies/Music/WhatsApp/Bluetooth) and only kept
  `SCAN_EXTENSIONS` (apk/zip/exe/doc/…); media and other files were excluded.
  Without "All files access" it fell back to MediaStore (app-visible files
  only). QUICK counted only APKs as "files" (`filesScanned = apks.size`).
- **`ScannedFileCategory`** (in `ApkFinder.kt`): ANDROID_PACKAGE / ARCHIVE /
  EXECUTABLE / SCRIPT / DOCUMENT / MEDIA / OTHER, classified by extension via
  `FileType.fromExtension`; `MEDIA_EXTENSIONS` covers image/video/audio.
- **`ApkFinder.findScanTargets(allFileTypes, fullStorage)`**: `fullStorage`
  walks the whole shared storage (skips `Android/` and hidden dirs, depth ≤ 8,
  cap `MAX_FILES_ALL = 2000`); `allFileTypes` includes media/other. Targeted
  default unchanged (cap 500, depth 4).
- **`FullScanResult`** now carries the per-category counts + `scannedAllFileTypes`
  (apps system/user; files apk/archive/executable/script/document/media/other),
  computed in `FullDeviceScanner.fullResult(...)` from `targets.files` and
  `appResult.apps`.
- **Setting**: `PreferenceManager.scanAllFiles` (default off) → Settings →
  Scanning → "Scan all files (whole storage)"; DEEP scan passes it to the sweep.
- **UI**: `DeviceScanScreen` result card shows the breakdown.
- **Tests**: `ScannedFileCategoryTest` (7). Verified on an emulator: DEEP scan
  reported "224 apps (223 system · 1 user) · 3 files (1 APK · 1 archive · 1
  executable)".
- **Version**: versionCode 36, versionName "1.26.0".

### 33. Safe Browse outage, filter enforcement, save-gating (v1.27.0)
- **Safe Browse total-outage root cause**: `u16`/`putU16` in
  `SafeBrowseVpnService` and `DnsPacket` used **little-endian**; the wire is
  **big-endian**. Port 53 (`00 35`) misread as 13568 → `dstPort != 53`
  dropped every DNS packet, never answered → no site reachable. The old
  `DnsPacketTest` passed by accident (QDCOUNT=1 misread as 256, still ≥ 1).
- **Fix**: new pure `core/safebrowse/VpnPacket.kt` (`u16be`/`putU16be`,
  `parseDnsQuery`, `buildUdpPacket`, `checksum`); the service delegates to it.
  Removed `.setBlocking(false)` on the TUN fd (blocking reads on the
  dedicated thread; non-blocking would spin). `VpnPacketTest` (7) uses real
  wire-format packets, incl. the port-53 regression.
- **Content filter / blocklist "not working"**: filter logic was correct;
  failures were (1) draft-vs-saved confusion (toggles stage a draft, only
  Save enforces), (2) no enforcement path on (Safe Browse broken + system
  accessibility guard off), (3) no status shown. Settings now shows a live
  enforcement line (Safe Browse state + `ENABLED_ACCESSIBILITY_SERVICES`
  check for `UrlGuardAccessibilityService`) and the hero text states Save is
  required. Adult list widened modestly.
- **Save-gating**: `EditableSettings.protectionRelevantDiffers(other)` (pure,
  in `PreferenceManager.kt`, tested by `EditableSettingsTest` (5)) covers
  Threat intel / Scanning / Content filter / Custom blocklist. `requestSave()`
  forces the verify dialog when those are dirty, bypassing the 5-min unlock
  window; cosmetic changes keep it. Safe Browse enable + MalwareBazaar Save
  key are `runProtected`-gated. Protected sections show a lock hint.
- **Layout**: Storage & performance item moved directly below Appearance.
- **Version**: versionCode 37, versionName "1.27.0".

### 34. Per-category Notify/Block, Notify prompt, VirusTotal panel (v1.28.0)
- **Per-category actions**: `EditableSettings.contentAction` (global) +
  `blockedCategories` (set) replaced by `categoryActions: Map<String,String>`
  (name → OFF/NOTIFY/BLOCK, default all BLOCK). Persisted as
  `category_actions` (`NAME=ACTION,…`); migrates once from the legacy keys via
  pure `migrateCategoryActions` (blocked set keeps old global action, rest
  OFF). Pure `parse/serializeCategoryActions` + `resolveVerdict` in
  `PreferenceManager.kt` / `ContentFilter.kt`: BLOCK wins over NOTIFY, CUSTOM
  + MALWARE (user blocklist + threat intel) always BLOCK, missing entries
  default BLOCK. `CategoryMatch` gains `notify` + effective `action`.
- **Notify prompt**: new non-exported `WarnActivity` (warning icon, matched
  reasons, OK = dismiss + stay, Cancel = `ACTION_GO_BACK` to
  `UrlGuardAccessibilityService.onStartCommand` → `GLOBAL_ACTION_BACK`).
  Guard snoozes re-prompts per host (`WARN_SNOOZE_MS` = 30 min); notification
  still posted under the existing throttle.
- **DNS path**: `classify()` only NXDOMAINs BLOCK verdicts; NOTIFY domains
  resolve normally + throttled (60 s) notification on a new
  `safe_browse_warn` channel (`WARN_NOTIFICATION_ID` 9002). Previously NOTIFY
  hard-blocked over DNS (verdict ignored the action).
- **VirusTotal key fix**: the key was build-time-only (`BuildConfig`), so keyless
  builds silently skipped VT with no UI recourse. New `PreferenceManager`
  `virusTotalApiKey` (Keystore-encrypted, like the MB key) + `setVirusTotalApiKey`;
  `ReputationService.virusTotalApiKey()` (user key → BuildConfig fallback) feeds
  `check()`, `virusTotalReport()`, `fetchVirusTotalReport()`, and
  `VirusTotalRepository.upload()`; `virusTotalEnabled()` is now suspend.
  Settings → VirusTotal panel: masked field with show/hide, password-gated Save
  (`runProtected`), source status (App setting/Built-in/Not set), ••••last4
  display, quota/queue lines moved here from Threat intelligence.
- **Settings UI**: content-filter section renders one Off/Notify/Block row per
  `ContentCategory` (`CategoryActionRow`); `setContentAction`/
  `setCategoryBlocked` replaced by `setCategoryAction`.
- **Scan progress ring**: device-scan running state uses a segmented
  `ScanProgressRing` (24 rounded arcs, centered %) with pure `segmentsFilled`.
- **Tests**: `CategoryActionPolicyTest` (12), updated `EditableSettingsTest`;
  `ScanProgressRingTest` (5).
- **Version**: versionCode 38, versionName "1.28.0".

### 35. Notify-prompt reliability, Safe Browse default-ON + strict gate (v1.28.1)
- **Prompt root cause**: Android 10+ blocks background activity starts, so the
  guard's direct `startActivity` (Warn + Block) was silently dropped. New
  `launchPrompt()`: keeps the direct launch as a fast path AND posts a
  tap-to-open notification (`url_guard` channel, IDs 9003/9004, immutable
  `PendingIntent`s) — tap always opens the prompt.
- **Strict gate**: `runProtected` runs free with no password / inside the
  unlock window. Safe Browse toggle now uses `runProtectedStrict` (always
  verify; `pendingCreateAction` + new `createPassword()` forces creation when
  none exists). Both directions covered.
- **Default-ON**: persisted `safe_browse_enabled` (default true);
  `safeBrowseDesired` flow + `isSafeBrowseDesired()`; auto-start in
  `MainActivity` launch and Settings when `prepareIntent() == null`; "Waiting
  for VPN permission" + grant button until consent; declining consent flips
  desired off.
- **Version**: versionCode 39, versionName "1.28.1".

### 36. Safe Browse persistence: foreground + boot restart (v1.29.0)
- **Foreground**: `onStartCommand` calls `promoteToForeground()` — ongoing
  `safe_browse_status` channel notification ("Safe Browse active", tap opens
  the app, blocked-count refresh throttled 10 s); `stopForeground(REMOVE)` in
  `onDestroy`. Manifest: `FOREGROUND_SERVICE` +
  `FOREGROUND_SERVICE_SPECIAL_USE` permissions, `foregroundServiceType=
  "specialUse"` + the API-34 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` property;
  API 29+ uses the 3-arg `startForeground`, older use the 2-arg call.
- **Boot**: new `core/safebrowse/BootReceiver.kt` (`RECEIVE_BOOT_COMPLETED`,
  non-exported, BOOT_COMPLETED + QUICKBOOT_POWERON) — `goAsync` + IO read of
  `safeBrowseEnabled` (default true); starts via `startForegroundService`
  (O+) only when desired, not running, and `prepare() == null` (consent
  survives reboot; never-granted/ revoked consent starts nothing).
- **Version**: versionCode 40, versionName "1.29.0".

### 37. Notify→Warn rename, dashboard blocked-domains card (v1.30.0)
- **Rename**: `CategoryAction.WARN = "WARN"` replaces NOTIFY as the warn
  verdict; `NOTIFY` kept as a legacy alias accepted in `parse/migrate/
  resolveVerdict` (all map to WARN — existing installs lose nothing).
  Guard branch accepts WARN (+legacy NOTIFY belt-and-braces); Settings chips
  read Off/Warn/Block; `resolveVerdict`/evaluate/comments updated.
- **BlockedDomainLog** (`core/safebrowse/`, pure + `BlockedDomainLogTest`
  (5)): `record(domain, action, reason)` (newest-first, 100-cap, consecutive
  duplicates collapse), `snapshot()`, `blockedCount()`, `warnedCount()`,
  `clear()`. Recorded on fresh DNS evaluations (BLOCK + WARN) and at guard
  prompt launches (both paths).
- **Dashboard**: new "Safe Browse" section + `BlockedDomainsCard` (status,
  session summary, latest 8 entries with BLOCK(red)/WARN(amber) badges,
  reason + time, "+N more"); refreshes on ON_RESUME. In-memory session scope
  (resets on process death) — stated in the empty state.
- **Version**: versionCode 41, versionName "1.30.0".

### 38. Finding-button fit, VPN swipe-away survival, incremental file cache (v1.31.0)
- **Finding buttons**: `DeviceScanScreen.FindingCard` actions use single-line
  12sp ellipsis labels + tight padding, so Uninstall/Delete, Allow and
  VirusTotal fit on narrow phones; "Recheck known hashes" is single-line too.
- **VPN app-close survival**: `SafeBrowseVpnService.start()` helper (O+
  `startForegroundService`, older `startService`) used by MainActivity,
  Settings and `BootReceiver`; new `onTaskRemoved` re-issues a start when
  protection is still desired and consent holds (covers OEM swipe-away
  kills); receiver also handles `MY_PACKAGE_REPLACED` (manifest added) so
  updates restart protection like reboots do.
- **File scan cache** (DB v6, `MIGRATION_5_6`, non-destructive): new
  `FileScanCacheEntity` (`file_scan_cache`, path PK) + `FileScanCacheDao`
  (`getByPath`/`upsert`/`pruneOlderThan(30d)`/`count`), provided by
  `AppModule`. Deep-scan file loop hashes every file, then reuses the cached
  verdict via pure `shouldReuseFileCache` (hash match + current
  `ANALYSIS_VERSION`; size/mtime stored but not gated) — skipping analysis,
  reputation and quota; every fresh file upserts its verdict. Covered by
  `FileScanCachePolicyTest` (5).
- **Version**: versionCode 42, versionName "1.31.0".

### 39. Fast repeat scans, no system apps, APK-screen simplification (v1.32.0)
- **Why scans were slow**: every storage file was re-hashed each scan and
  200+ system apps were hashed + analyzed each time. Fixed with a stat
  fast-path + system exclusion (below).
- **Never re-scan unchanged items**: deep-scan file loop pre-loads the whole
  `file_scan_cache` in one query (`FileScanCacheDao.getAll`), then per file:
  unchanged size+mtime → pure `shouldReuseFileCacheByStat` reuses with zero
  I/O; stat changed → hash, and a matching hash still reuses via
  `shouldReuseFileCache`; only new/changed content runs analysis +
  reputation + quota. Fresh verdicts persist via one batched `upsertAll`;
  per-scan reuse counts go to logcat (`FullDeviceScanner`). Accepted
  trade-off (documented in code): a size+mtime-preserving modification is
  missed until the next `ANALYSIS_VERSION` bump.
- **System excluded**: Quick + Deep partition out `isSystem` apps before
  scoring/hashing; each gets a terminal NOT_ANALYZED audit
  (`excludedSystemAudits`) with a visible reason. Counts, sessions and the
  result card ("0 system · N user-installed (system apps excluded)") use
  user apps only. Storage sweep already never touched system partitions.
  `ScanMode` descriptions + KDoc, DeviceScan hero and Guide updated.
- **APK screen**: "Select APK file" picker removed; hero button is now "Scan
  and Search APK Files" (`finderViewModel.search()`); duplicate lower search
  button removed. Deleted now-unused `MalwareScannerViewModel` + MainActivity
  file-picker plumbing (`filePicker`, `handlePickedApk`, dead imports);
  `ScanScreen(finderViewModel)` only. Guide §2 updated.
- **Tests**: 5 new stat-gate cases in `FileScanCachePolicyTest` (10 total).
- **Version**: versionCode 43, versionName "1.32.0".

### 40. Smaller scan ring + looping sweep animation (v1.33.0)
- **`DeviceScanScreen.ScanProgressRing`**: default size 176dp → 120dp (new
  `size: Dp` param), 14dp → 10dp stroke, headlineMedium → headlineSmall %
  label. A translucent primary sweep arc (70°, rounded cap) rotates via
  `rememberInfiniteTransition` (360° / 1.6s linear, Restart) over the static
  segments, so motion continues even when progress stalls. Lit segments
  still report the true percentage; `segmentsFilled` untouched
  (`ScanProgressRingTest` still green).
- **Version**: versionCode 44, versionName "1.33.0".

### 41. Content-filter warnings that actually appear (v1.34.0)
- **Assessment**: the Warn feature existed (classifier → verdict → guard →
  `WarnActivity`) but "no warning" was the common outcome: (1) BAL blocked
  the background activity start so the prompt sat unseen in the shade;
  (2) a global 30s throttle + same-host dedup above the prompt branches
  killed prompts for any second risky site within 30s; (3) bundled
  adult/gambling lists missed popular sites (stake, unibet, livejasmin).
- **Full-screen prompt**: `launchPrompt` notifications now
  `setFullScreenIntent(tap, true)` + `CATEGORY_ALARM` on the HIGH
  `url_guard` channel, so Warn/Block pops over the browser immediately;
  new `USE_FULL_SCREEN_INTENT` manifest permission (API 34 install-time).
- **Throttle scoping**: 30s/lastUrl gates now wrap only the generic
  notification; BLOCK prompts get a per-host `PROMPT_COOLDOWN_MS` (60s,
  new `promptedAt` map), WARN keeps its 30-min `warnedAt` snooze.
- **Wider detection**: +8 adult / +10 gambling exact domains, +5 gambling
  keywords; 3 new `CategoryClassifierTest` cases incl. FP guards.
- **Version**: versionCode 45, versionName "1.34.0".

### 42. Device-scan screen structure fix (v1.34.1)
- **Fatal brace**: a stray `}` closed the results `LazyColumn` early, so all
  following `item`/`items` calls were outside list scope (would not
  compile). Removed; restored the single root-`LazyColumn` rule (§24b).
- **Gradient cards**: scan-mode + running-state sections moved onto the hero
  gradient with white/light text and white unselected chip labels, since
  the default dark `onSurface` text is unreadable on the dark gradient.
- **Version**: versionCode 46, versionName "1.34.1".

## Module Structure
```
MalwareShield/
├── app/
│   └── src/main/java/com/malwareshield/
│       ├── MalwareShieldApp.kt
│       ├── data/
│       │   ├── db/ (MalwareShieldDatabase v6)
│       │   ├── dao/ (ScanHistoryDao, AppInventoryDao, ScanCacheDao, FileScanCacheDao,
│       │   │         ScanSessionDao, ConfigLockDao)
│       │   ├── entities/ (ScanHistoryEntity, AppInventoryEntity, ScanCacheEntity,
│       │   │              FileScanCacheEntity, ScanSessionEntity, ConfigLockEntity)
│       │   ├── repository/ (MalwareRepository, VirusTotalRepository,
│       │   │                BackgroundScanWorker, CloudLookupWorker,
│       │   │                ScheduledScanWorker, SignatureFeedWorker)
│       ├── di/ (AppModule, AppComponent)
│       ├── presentation/
│       │   ├── MainActivity.kt
│       │   ├── BlockActivity.kt
│       │   ├── screens/ (ScanScreen, DeviceScanScreen, AppDetailScreen,
│       │   │            HistoryScreen, URLValidatorScreen, DashboardScreen,
│       │   │            SettingsScreen, ScheduleScreen, GuideScreen,
│       │   │            ProviderKeyScreen, LogViewerScreen, ApkFinderScreen)
│       │   ├── ui/
│       │   │   ├── components/ (UIComponents, ModernComponents, LogoBackground)
│       │   │   └── theme/ (Theme)
│       │   └── viewmodel/ (History, Settings, Dashboard,
│       │       │            Provider, Schedule, Log, UrlScan, ApkFinder, DeviceScan)
│       └── core/
│           ├── analysis/
│           │   ├── FileType.kt
│           │   ├── FileTypeIdentifier.kt
│           │   ├── AnalysisReport.kt
│           │   ├── FileAnalyzer.kt
│           │   ├── FileDigest.kt (FileDigest + FileDigestReader)
│           │   ├── ScanDispatcher.kt
│           │   ├── analyzers/ (AndroidPackage, ArchivePackage, Aab, Dex, Jar,
│           │   │               Pe, Script, Archive, Document, SignatureRule,
│           │   │               Generic)
│           │   ├── archive/ (BombGuard.kt)
│           │   ├── pe/ (PeParser.kt)
│           │   ├── rules/ (ThreatSignatures, YaraRule, RuleParser,
│           │   │            RuleCondition, RuleEngine, BundledRules)
│           │   └── util/ (BytePatternScanner, Entropy, StringExtractor, AnalysisIo)
│           ├── content/ (ContentCategory, CategoryClassifier, ContentFilter)
│           ├── reputation/ (ReputationService, ReputationCache, RateLimiter,
│           │                ReputationVerdict + VtSummary, CloudLookupQueue,
│           │                CloudLookupGraph, CloudLookupNotifier,
│           │                CloudContinuationPolicy, MalwareBazaarPacer,
│           │                MalwareBazaarNegativeCache, ReputationReadiness)
│           ├── downloads/ (DownloadMonitor, DownloadScanWorker, DownloadScanNotifier)
│           ├── logging/ (EventLogger, SecurityEvent + EventJson, LogRedactor)
│           ├── notifications/ (NotificationGate, DeviceThreatNotifier)
│           ├── providers/ (ProviderKeyManager, SignatureProvider + ProviderKeysFile)
│           ├── safebrowse/ (SafeBrowseVpnService, DnsPacket)
│           ├── scheduling/ (ScanScheduler, ScheduledScanWorker)
│           ├── perf/ (CacheManager)
│           ├── security/
│           │   ├── APKAnalyzer.kt
│           │   ├── ApkFinder.kt
│           │   ├── AppInventoryCollector.kt
│           │   ├── AppScanAudit.kt (+ Report, Store)
│           │   ├── ConfigLockManager.kt
│           │   ├── PasswordHasher.kt
│           │   ├── DetectionCategory.kt (+ Classifier)
│           │   ├── DeviceFinding.kt (+ ScanProgressInfo, FullScanResult)
│           │   ├── FindingAllowlist.kt
│           │   ├── FullDeviceScanner.kt
│           │   ├── HashIndex.kt
│           │   ├── InstalledAppScan.kt
│           │   ├── InstalledAppScanner.kt
│           │   ├── PrivacyCrypto.kt
│           │   ├── RecheckService.kt
│           │   ├── RiskEngine.kt
│           │   ├── ScanMode.kt
│           │   ├── ThreatScoring.kt
│           │   ├── UrlGuardAccessibilityService.kt
│           │   └── URLValidator.kt
│           ├── network/
│           │   ├── VirusTotalApiModels.kt
│           │   ├── VirusTotalClient.kt (+ VirusTotalApiService)
│           │   └── MalwareBazaarClient.kt (+ ApiService, BazaarOutcome)
│           ├── scanning/
│           │   ├── ScanEngine.kt
│           │   └── ScanResult.kt
│           ├── signatures/ (SignatureFeedManager, SignatureFeedModels
│           │                 (+ ThreatFeedJson), SignatureVerifier,
│           │                 MalwareBazaarFeed (+ Parser, MirrorPolicy))
│           └── storage/ (PreferenceManager.kt)
│       └── androidTest/java/com/malwareshield/core/
│               (AppInstrumentedTest, ScanScreenInstrumentedTest)
├── logo/ (zap logo.jpg) → All mipmap/drawable as ic_launcher.webp
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── docs/ (index.html, README.md, zap-scanware-debug.apk)
```

## Startup / Crypto Flow
1. `MalwareShieldApp.onCreate` calls `PrivacyCrypto.initKeyStore()` (fail-safe).
2. The Keystore AES-GCM key is created on first launch **without** user-auth or
   StrongBox requirements, so key generation never crashes startup.
3. `MainActivity` renders `DashboardScreen` immediately — no unlock gate.
4. Encrypt/decrypt retry key creation lazily and surface failures to callers,
   which already wrap them in `runCatching`.

## Build Configuration
- **minSdk**: 26
- **targetSdk**: 34
- **compileSdk**: 34
- **AGP**: 8.2.0, Kotlin 1.9.20, Compose BOM 2024.01.00
- **Biometric**: androidx.biometric:biometric:1.2.0-alpha04
- **Room**: 2.6.1, **WorkManager**: 2.9.0
- **Retrofit**: 2.9.0, **OkHttp**: 4.12.0
- **Hilt**: 2.50

## Logo
- **Source**: `C:\Users\Administrator\Documents\Default Project\MalwareShield\logo\zap logo.jpg`
- **Installed to**: All `mipmap-*` directories + `drawable/` as `ic_launcher.webp`
- **Adaptive icons**: `mipmap-anydpi-v26/`

## Build & Install
```bash
./gradlew assembleDebug
./gradlew assembleRelease
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Release & Publishing (REQUIRED for every enhancement/change)

Whenever new code is an enhancement or behavior change, the app MUST be
published as part of the same task — do not leave it as an uncommitted local
build. Publishing means:

1. **Bump the version** in `app/build.gradle.kts` (`versionCode` +1,
   `versionName` semver) for any user-visible change.
2. **Configure signing**: Add keys to `local.properties`:
   ```
   KEYSTORE_PATH=/path/to/your/release-key.jks
   KEYSTORE_PASSWORD=your_password
   KEY_ALIAS=your_alias
   KEY_PASSWORD=your_key_password
   ```
3. **Build**: `./gradlew testDebugUnitTest assembleDebug assembleRelease` — tests must pass.
4. **Stage the APK for the download page**: copy
   `app/build/outputs/apk/debug/zap-scanware-debug.apk` over
   `docs/zap-scanware-debug.apk` (GitHub Pages serves this file).
5. **Update the GitHub Pages landing page** `docs/index.html` — it hardcodes the
   values, so refresh all three (compute with
   `(Get-FileHash docs/zap-scanware-debug.apk -Algorithm SHA256).Hash` and the
   file length):
   - the `.version` line (`Version X.Y.Z (build N) · Android 8.0+`),
   - the `.meta` line (`<size> MB · APK · Signed · vX.Y.Z (N)`),
   - the `#sha256` checksum, and
   - add/refresh feature bullets when capabilities change.
   Also update `docs/README.md` if the APK size/version is mentioned.
6. **Commit and push** to `origin main` with a descriptive message
   (e.g. `vX.Y.Z: <summary>`). GitHub Pages re-deploys automatically.

Do not publish on trivial internal-only edits (typos in comments, docs-only
changes) unless the user asks. Never commit secrets (`local.properties`,
keystores, API keys are git-ignored).

## Best Practices
- All network calls use Suspend functions with Coroutines
- Database operations use Room with Flow for reactive updates
- Privacy: All scan data stored locally, encrypted with Android Keystore
- Background work uses WorkManager with battery/network constraints
- SHA-256 hashing uses streaming 8KB buffers
- UI uses Jetpack Compose for efficient rendering
- No telemetry or external data collection
- Local secrets encrypted with an Android Keystore AES-GCM key (`PrivacyCrypto`)
- No login/unlock gate — the app opens directly to the dashboard