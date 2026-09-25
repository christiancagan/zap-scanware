# MalwareShield - Mobile Malware Endpoint Protection

## Overview
Lightweight Android malware detection and prevention application built with Kotlin and modern Android architecture. Supports manual scanning, background scanning, APK static analysis, SHA-256 hashing, VirusTotal integration, URL/site validation, fingerprint biometric authentication, local scan history, and privacy-first operation.

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
| **Biometric** | Android BiometricPrompt + FingerprintManager | Hardware-backed fingerprint auth |
| **Auth** | SecureCredentialsManager + SHA-256 | Encrypted username/password storage |

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

### 7. Fingerprint Authentication
- **BiometricAuthenticator**: Android BiometricPrompt wrapper with AES-GCM encryption
- **FingerprintManager**: Hardware detection, enrolled fingerprints check
- **SecureCredentialsManager**: SHA-256 hashed passwords with salt, encrypted storage
- **AuthManager**: Central auth state management
- **LoginScreen/RegisterScreen**: Material Design 3 UI with biometric toggle
- Account lockout after 5 failed attempts
- Biometric key invalidated on enrollment changes

### 8. Local Scan History
Room database with Flow, encrypted with Android Keystore

### 9. Minimal Resource Consumption
CPU, RAM, Battery, Network optimization

### 10. Privacy-First Operation
All data stored locally only, no telemetry

### 11. Clean Material Design 3 UI
Dark/Light theme, bottom navigation (Auth + Scan + Validate + History), threat badges

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

## Module Structure
```
MalwareShield/
├── app/
│   └── src/main/java/com/malwareshield/
│       ├── MalwareShieldApp.kt
│       ├── data/
│       │   ├── db/ (MalwareShieldDatabase, ScanHistoryDao)
│       │   ├── entities/ (ScanHistoryEntity)
│       │   ├── repository/ (MalwareRepository, BackgroundScanWorker,
│       │   │                CloudLookupWorker)
│       ├── di/ (AppModule, AppComponent)
│       ├── domain/
│       │   └── usecase/ (ScanUseCases)
│       ├── presentation/
│       │   ├── MainActivity.kt
│       │   ├── BlockActivity.kt
│       │   ├── screens/
│       │   │   ├── ScanScreen.kt
│       │   │   ├── HistoryScreen.kt
│       │   │   └── URLValidatorScreen.kt
│       │   ├── ui/
│       │   │   ├── auth/
│       │   │   │   ├── LoginScreen.kt
│       │   │   │   ├── RegisterScreen.kt
│       │   │   │   └── BiometricIndicator.kt
│       │   │   ├── components/ (UIComponents)
│       │   │   └── theme/ (Theme)
│       │   └── viewmodel/
│       │       ├── AuthViewModel.kt
│       │       ├── MalwareScannerViewModel.kt
│       │       └── HistoryViewModel.kt
│       └── core/
│           ├── analysis/
│           │   ├── FileType.kt
│           │   ├── FileTypeIdentifier.kt
│           │   ├── AnalysisReport.kt
│           │   ├── FileAnalyzer.kt
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
│           │                ReputationVerdict, CloudLookupQueue,
│           │                CloudLookupGraph, CloudLookupNotifier)
│           ├── downloads/ (DownloadMonitor, DownloadScanWorker, DownloadScanNotifier)
│           ├── safebrowse/ (SafeBrowseVpnService, DnsPacket)
│           ├── perf/ (CacheManager)
│           ├── auth/
│           │   ├── BiometricAuthenticator.kt
│           │   ├── SecureCredentialsManager.kt
│           │   ├── FingerprintManager.kt
│           │   └── AuthManager.kt
│           ├── security/
│           │   ├── APKAnalyzer.kt
│           │   ├── ThreatScoring.kt
│           │   ├── PrivacyCrypto.kt
│           │   └── URLValidator.kt
│           ├── network/
│           │   ├── VirusTotalApiService.kt
│           │   ├── VirusTotalApiModels.kt
│           │   ├── VirusTotalClient.kt
│           │   └── SafeBrowsingApiService.kt
│           ├── scanning/
│           │   ├── ScanEngine.kt
│           │   └── ScanResult.kt
│           ├── signatures/ (SignatureFeedManager, SignatureFeedModels,
│           │                 SignatureVerifier, MalwareBazaarFeed)
│           ├── storage/ (PreferenceManager.kt)
│           └── utils/ (HashUtils.kt)
├── core/signatures/ (MalwareSignatures.kt)
├── core/utils/ (HashUtils.kt)
├── logo/ (zap logo.jpg) → All mipmap/drawable as ic_launcher.webp
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── AGENTS.md
└── README.md
```

## Fingerprint Authentication Flow
1. User registers with username + password (SHA-256 + salt)
2. Credentials encrypted with Android Keystore AES-GCM
3. Login requires password OR biometric
4. Biometric key invalidated on enrollment change
5. Account locks after 5 failed attempts
6. All auth state stored in encrypted DataStore

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
2. **Build**: `./gradlew testDebugUnitTest assembleDebug` — tests must pass.
3. **Stage the APK for the download page**: copy
   `app/build/outputs/apk/debug/zap-scanware-debug.apk` over
   `docs/zap-scanware-debug.apk` (GitHub Pages serves this file).
4. **Update the GitHub Pages landing page** `docs/index.html` — it hardcodes the
   values, so refresh all three (compute with
   `(Get-FileHash docs/zap-scanware-debug.apk -Algorithm SHA256).Hash` and the
   file length):
   - the `.version` line (`Version X.Y.Z (build N) · Android 8.0+`),
   - the `.meta` line (`<size> MB · APK · Signed · vX.Y.Z (N)`),
   - the `#sha256` checksum, and
   - add/refresh feature bullets when capabilities change.
   Also update `docs/README.md` if the APK size/version is mentioned.
5. **Commit and push** to `origin main` with a descriptive message
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
- Biometric keys require hardware authentication
- Account lockout after 5 failed attempts