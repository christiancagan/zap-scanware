# Changelog

All notable changes to MalwareShield are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
