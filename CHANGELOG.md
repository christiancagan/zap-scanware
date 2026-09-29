# Changelog

All notable changes to MalwareShield are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.25.3] - 2026-09-28

### Fixed
- **App crashed on every launch ("not opening").** Real crash captured on an
  emulator (via the new crash logger):
  `NullPointerException: Attempt to invoke … MutableStateFlow.setValue(…) on a
  null object reference` at
  `SettingsViewModel.refreshLockState(SettingsViewModel.kt:114)`.
  `SettingsViewModel`'s `init {}` block ran `refreshLockState()` before
  `_hasPassword`/`_unlocked` were initialized; because `viewModelScope` uses
  `Dispatchers.Main.immediate`, the launched coroutine executed synchronously
  during construction and wrote to the still-null field. `MainActivity` creates
  `SettingsViewModel` at startup (for the theme), so this aborted the process
  before the UI appeared. The `init` block now runs **last**, after all property
  initializers.

### Changed
- `versionCode`: 34 → 35
- `versionName`: "1.25.2" → "1.25.3"

## [1.25.2] - 2026-09-28

### Fixed
- **Startup hardened against a bad/corrupt preference store** (a likely cause
  of "app not opening"). `preferencesDataStore` now uses a
  `ReplaceFileCorruptionHandler` so an unreadable prefs file resets instead of
  throwing, and every read in `PreferenceManager` is guarded: the startup reads
  (`themeMode`, `editableSettings`) return defaults on a missing/wrong-typed
  value instead of throwing during `MainActivity` composition.
- **Removed broken certificate pins.** The `network_security_config.xml`
  contained placeholder pins (`AAAA…`/`BBBB…`) that never matched the real
  servers, silently breaking every VirusTotal/MalwareBazaar request. Pinning
  removed (base config + debug override kept).

### Added
- **Crash logger**: uncaught exceptions are written to
  `Android/data/<pkg>/files/last-crash.txt` (retrievable without root) and to
  logcat under the `ZapScanware` tag, so an on-device launch crash can be
  diagnosed without a cable.

### Changed
- `Application.onCreate` startup work is wrapped in `runCatching` — no single
  failure there may stop the app opening.
- `versionCode`: 33 → 34
- `versionName`: "1.25.1" → "1.25.2"

## [1.25.1] - 2026-09-28

### Fixed
- **App unresponsive / UI not loading when the accessibility guard was on.**
  The v1.25.0 change that let the URL guard match bare domains turned every
  accessibility event (`TYPE_WINDOW_CONTENT_CHANGED` / `TYPE_VIEW_TEXT_CHANGED`,
  which fire many times per second) into a full node-tree traversal plus
  `runBlocking` DataStore lookups for every host — on the UI process, with an
  unbounded worker queue. That saturated the CPU and froze the app.
  `UrlGuardAccessibilityService` now throttles scans (≥ 800 ms apart), runs one
  scan at a time (coalescing/`AtomicBoolean`), skips Zap Scanware's own window,
  caps hosts per pass (12), caches each host's verdict for 60 s, catches stale
  nodes, and only calls `rootInActiveWindow` once per throttled scan.
- **`ContentFilter`** now caches the user policy (enabled / categories /
  custom list / action) for 5 s so the DNS proxy and accessibility guard stop
  reading DataStore on every domain.
- **Settings** renders immediately even before its snapshot loads (no
  indefinite spinner).

### Changed
- `versionCode`: 32 → 33
- `versionName`: "1.25.0" → "1.25.1"

## [1.25.0] - 2026-09-28

### Fixed
- **Safe Browse no longer breaks connectivity.** The DNS proxy used a single
  shared upstream socket with no transaction-id matching, silently dropped any
  query whose upstream timed out, and handled only IPv4/UDP. A single stalled
  lookup could freeze the whole device's DNS (apps like Google reporting "not
  responding"). Every query is now resolved on its own protected socket, matched
  by DNS id, retried across three resolvers, and **always answered** (SERVFAIL
  on failure) so clients fail over instead of hanging. A small worker pool keeps
  DNS responsive under load.
- **Content filter now actually blocks.** The default action was `NOTIFY`
  (only a notification) and the accessibility service required a
  `http(s://)`-prefixed URL, so bare browser domains (`pornhub.com`) never
  matched — nothing was blocked. The default action is now `BLOCK`, the
  accessibility service matches bare domains, and the custom blocklist always
  blocks once filtering is on (no chip needed). Category selections now default
  to all categories so enabling the filter is immediately effective.

### Added
- **Settings password + Save (config lock).** Settings changes are now staged;
  a Save button enables only when something changed. The first save creates a
  password (PBKDF2-HMAC-SHA256, 120k iterations, random salt) stored in the new
  `config_lock` Room table (DB v4 → v5, non-destructive). Later saves and
  destructive actions require it. A correct entry unlocks for 5 minutes
  in-memory; 5 wrong attempts lock out for a minute. **No recovery** — forgetting
  the password requires clearing app data (stated in the dialog). App
  **Uninstall** and file **Delete** now prompt for the password when locked.
- `PasswordHasher`, `ConfigLockManager`, `ConfigLockDao`, `ConfigLockEntity`.
- Settings UI: blue-tinted section panels and blue action buttons.

### Changed
- `versionCode`: 31 → 32
- `versionName`: "1.24.1" → "1.25.0"

### Tests
- `PasswordHasherTest` (6) and `ConfigLockManagerTest` (5).

## [1.24.1] - 2026-09-28

### Fixed
- **App crashed on launch / could not open.** `PrivacyCrypto.initKeyStore()`
  ran in `Application.onCreate()` and generated its Keystore key with
  `setIsStrongBoxBacked(true)` and `setUserAuthenticationRequired(true)`.
  On devices without a StrongBox, or without an enrolled lock screen, key
  generation throws — crashing the process before any UI appeared. Both flags
  are removed, init is now fail-safe (`runCatching`), and encrypt/decrypt retry
  key creation lazily. Local data stays encrypted at rest.

### Removed
- **Authentication / unlock gate.** The biometric lock screen
  (`BiometricGateScreen`, `AuthViewModel`, `AuthManager`,
  `BiometricAuthenticator`) and the fingerprint prompt in `MainActivity` are
  gone. The app now opens straight to the dashboard when tapped; there is no
  login, password or fingerprint gate. The `USE_BIOMETRIC` permission and the
  now-unused DI provider/ProGuard keep rule were dropped too.

### Changed
- `versionCode`: 30 → 31
- `versionName`: "1.24.0" → "1.24.1"

## [1.24.0] - 2026-09-28

### Changed
- **One-pass file reads across the scan pipeline.** New `FileDigestReader`
  computes a file's SHA-256 and its YARA head (≤ 32 MB) in a single streaming
  pass. `ScanDispatcher` accepts the digest and `SignatureRuleAnalyzer` matches
  the in-memory head instead of re-reading the file, so the device scan
  (apps + storage sweep), the manual APK scan and download scanning no longer
  read each file once to hash it and again for the signature scan.
- **Merged the two APKAnalyzer zip walks.** `collectThreats` (DEX signature
  patterns) and `collectPackageSignals` (native libs + embedded URL/IP mining)
  were two separate `ZipFile` passes over the same `.dex` entries; they are now
  one pass, halving DEX I/O per APK.
- `MalwareRepository.scanAPK` runs static analysis concurrently with the
  in-memory rule scan (the file itself is read once).
- `versionCode`: 29 → 30
- `versionName`: "1.23.2" → "1.24.0"

### Tests
- `FileDigestReaderTest` locks the single-pass contract: SHA-256 equals the
  existing hash function, the head is correctly bounded, and unreadable files
  fail closed.

## [1.23.2] - 2026-09-28

### Fixed
- **O(n²) durable writes on the device-scan hot path.** `HashIndex` and
  `ReputationCache` serialized and rewrote their entire JSON file on **every**
  recorded hash (hundreds of full rewrites per scan). Both now support batched
  writes (`persist = false`) with a single `flush()` at the end of a scan /
  recheck / cloud drain. Immediate persistence remains the default.
- `ReputationCache.clearMemory()` can no longer overwrite the on-disk cache with
  an empty map if a memory-pressure trim happens mid-scan before `flush()`.

### Changed
- Device-scan findings are saved to history with one batched Room insert
  (`insertScans`) instead of one insert per finding.
- `ReputationService` TTL-caches the preferences read per hashed file
  (wifi-only cloud, MalwareBazaar toggle/key) instead of collecting DataStore
  flows for every hash.
- `ScanScreen` uses a lazy list, so only visible APK cards compose (previously
  every found APK composed inside a scroll column).
- Removed the unreachable `ApkFinderScreen` (duplicate of `ScanScreen`) and
  unused locals.
- `versionCode`: 28 → 29
- `versionName`: "1.23.1" → "1.23.2"

## [1.23.1] - 2026-09-28

### Fixed
- **Result and History screens not scrollable**: a `LazyColumn` was nested below
  other content inside a non-scrolling `Column`, so the list overflowed past the
  bottom of the screen with no way to scroll. `DeviceScanScreen`, `HistoryScreen`,
  `LogViewerScreen` and `ApkFinderScreen` now each use a single top-level
  `LazyColumn` so the whole page scrolls and the lists stay lazy.

### Changed
- `versionCode`: 27 → 28
- `versionName`: "1.23.0" → "1.23.1"

## [1.23.0] - 2026-09-28

### Added
- Confirmation dialog before destructive finding actions (Delete file /
  Uninstall app) on the Device Scan result list and the app detail screen.
- Explicit finding action labels: **Uninstall** for apps, **Delete** for files
  (previously a single "Remove").
- Prominent "File scanning is limited" warning and a post-scan coverage warning
  when "All files access" is not granted.
- Successful-delete confirmation and clearer failure guidance on the file
  delete path.

### Changed
- Device Scan controls consolidated: the "Scan mode" chips (Quick/Deep) are the
  single mode selector and the hero button is the single scan trigger. The
  duplicate "Quick Scan / Full Scan" buttons on the Device Status card are gone.
- Device Status / result labels now separate **apps** from **files** instead of
  summing them under "Files scanned".
- Progress text uses "Scanned X of Y" (phase-aware) rather than "Scanned files".
- "All files access" state refreshes on screen resume, so granting it in system
  Settings updates the UI without a restart.
- File deletion also removes the MediaStore row (best-effort) and treats an
  already-deleted file as success.
- `versionCode`: 26 → 27
- `versionName`: "1.22.0" → "1.23.0"

### Fixed
- Device scan appearing stuck at a low file count (e.g. "28 files"): the storage
  sweep only sees app-visible files when "All files access" is off. The UI now
  explains this and prompts for the permission; installed apps were always
  counted separately (e.g. 93 apps + N files).

## [1.22.0] - 2026-09-28

### Added
- Release signing configuration for production builds (`app/build.gradle.kts`)
- Network security configuration with certificate pinning (`network_security_config.xml`)
- Android instrumented test infrastructure (`app/src/androidTest/`)
- CHANGELOG.md and CONTRIBUTING.md documentation
- Privacy disclaimer to `UrlGuardAccessibilityService`
- ProGuard rules for `ThreatScoring`, `BiometricAuthenticator`, `PrivacyCrypto`, and `APKAnalyzer`
- System apps now fully analyzed (no longer skipped) — `FullDeviceScanner`
- `cancelUniqueWork("cloud_lookup")` in scan cancellation path

### Changed
- `PrivacyCrypto`: `setUserAuthenticationRequired(true)` + `setIsStrongBoxBacked(true)`
- `BiometricAuthenticator`: removed `encryptWithBiometric()` and `decryptWithBiometric()` (must use `authenticateWithCrypto()` or `encryptWithPrompt()`)
- `versionCode`: 25 → 26
- `versionName`: "1.21.0" → "1.22.0"

### Security
- All Keystore encryption keys now require user authentication
- StrongBox-backed keys for higher security
- Certificate pinning for VirusTotal and MalwareBazaar domains

## [1.21.0] - 2026-09-28

### Added
- History detail screen for every history row
- Gson migration fully eliminated `org.json` from production
- Durable hash index (`HashIndex`) with `filesDir` persistence
- MalwareBazaar per-hash lookup with `BazaarOutcome` types
- Offline URL feeds with per-source health
- Finding Remove/Allow actions
- Auditable deep scan with `AppScanAudit` per-app records

### Changed
- Version code 25
- APK shrank from 21.3 MB to 19.3 MB (v1.19.0 cleanup)

## [1.20.0] - 2026-09-28

### Added
- `RiskEngine`: weighted 0–100 score with configurable bands
- Room inventory + scan cache + sessions (DB v3, non-destructive migration)
- Incremental scanning with `ANALYSIS_VERSION` cache reuse
- Real scan cancellation with `Job`, `yield()`, `cancelUniqueWork`
- `DetectionClassifier`: Malware / PUA-PUP / Suspicious / Low Reputation / Unknown
- `VtSummary.display()` with full VirusTotal line
- Copy-hash button on every finding
- Notification channel with anti-spam cooldown
- Battery: wifi-only cloud gate

## [1.19.0] - 2026-09-28

### Added
- Remove/Allow on every finding
- Gson migration (6 new test suites)
- Coverage honesty (bounded truth in UI strings)
- Cleanup: removed dead code, 13 unused Gradle deps

### Changed
- APK shrank from 21.3 MB to 19.3 MB
- Tests: 180 total, 0 failures

## [1.18.0] - 2026-09-28

### Added
- Durable hash index (`HashIndex`) in `filesDir`
- Recheck known hashes without re-hashing
- MalwareBazaar per-hash lookup with typed `BazaarOutcome`
- MalwareBazaar mirror with merge-with-retention
- Offline URL feeds with per-source status

## [1.17.0] - 2026-09-28

### Added
- Terminal per-app coverage (`AppAnalysisCoverage`)
- No silent drops — skipped packages recorded
- `ReputationReadiness` for blocking issues
- `AppScanAuditReport` per-scan JSON
- Bounded retries (`CloudContinuationPolicy.MAX_ATTEMPTS = 10`)

## [1.16.0] - 2026-09-28

### Added
- MalwareBazaar Auth-Key support
- Recent-detections offline mirror
- Daily `SignatureFeedWorker` refresh

## [1.15.0] - 2026-09-28

### Added
- Prioritized cloud-lookup queue
- Background continuation worker
- Signed threat feeds (ECDSA P-256)
- Broader offline baseline

## [1.14.0] - 2026-09-28

### Added
- Unified threat scoring (`ThreatScoring`)
- YARA rules on manual APK scan
- Installed-app code analysis
- Expanded bundled rules
- Opt-in VirusTotal upload
- Wider bounded coverage

## [1.13.0] - 2026-09-28

### Added
- RiskEngine, categories, incremental Room cache
- Deep app-scan completeness
- Durable hash index
- MalwareBazaar per-hash
- Offline feeds

## [1.12.0] - 2026-09-28

### Added
- History detail & feed-codec migration
- Module tree refresh
- 217 tests, 0 failures

## [1.11.0] - 2026-09-28

### Added
- Fingerprint authentication flow
- SecureCredentialsManager with SHA-256 + salt
- Account lockout after 5 failed attempts
- Local scan history with Room

## [1.10.0] - 2026-09-28

### Added
- URL/Site validation with phishing detection
- SafeBrowse VPN service
- Download scanning
- Content filter (notify/block)
- Scheduled scans
- Provider key management
