# Enhancement Plan 4 — Malware-detection QC remediation (v1.14.0)

This document records a quality-control review of Zap Scanware's file scanner
(does it detect malicious files with viruses?) and the remediation implemented
in v1.14.0.

## QC verdict (before v1.14.0)

The scanner was a **heuristic + cloud-hash triage tool**, not a virus scanner.
It could detect:

- the EICAR test file (bundled rule), and
- files whose SHA-256 was already known to a configured feed, MalwareBazaar or
  VirusTotal,

but it could not reliably detect real-world malware offline, and several
advertised detection paths were unreachable or bypassed the signature engine.

## Findings and status

| # | Severity | Finding | Status in v1.14.0 |
|---|----------|---------|-------------------|
| F1 | CRITICAL | No real signature database bundled (feeds ship 0 hashes) | **Mitigated** — more bundled rules; still needs a real feed source |
| F2 | CRITICAL | Manual APK scan bypassed the YARA rule engine | **Fixed** — `scanAPK` now runs `SignatureRuleAnalyzer` |
| F3 | HIGH | VirusTotal upload was dead code; novel samples never submitted | **Fixed** — opt-in upload via `uploadForAnalysis`/`submitForAnalysis` |
| F4 | HIGH | Installed apps got no code analysis in the deep scan | **Fixed** — deep scan runs `ScanDispatcher` on non-system apps |
| F5 | HIGH | VT free-tier rate limit (4/min) blinded large device scans | **Documented** — sources still degrade gracefully; queueing deferred |
| F6 | MEDIUM | Verdict thresholds inconsistent; generic APIs flagged CRITICAL | **Fixed** — unified `ThreatScoring` (primitive/sensitive/capability) |
| F7 | MEDIUM | Coverage caps (16 MB rule scan, 50 MB finder) | **Improved** — 32 MB / 100 MB / 500 files |
| F8 | MEDIUM | Feeds unauthenticated and empty by default | **Open** — needs signed public feeds |
| F9 | LOW | MalwareBazaar presence treated as definitive | Accepted (advisory, documented) |
| F10 | LOW | Dead/unreachable code (`ScanEngine.performScan`, `FilePicker`) | `uploadAndScan` replaced by live `uploadForAnalysis`; others left |

## What changed (code)

### 1. Unified threat scoring — `core/security/ThreatScoring.kt` (new)

DEX/API indicators are split into three evidence tiers:

- **Malicious primitives** (any one is malicious): `DexClassLoader`,
  `PathClassLoader`, `InMemoryDexClassLoader`, `Runtime.exec`, `su -c`,
  `/system/bin/su`, `setComponentEnabledSetting`, `abortBroadcast`,
  `createPackageContext`, `PackageInstaller`, `AccessibilityService`,
  `DevicePolicyManager`.
- **Sensitive APIs** (two or more are malicious): `sendTextMessage`,
  `getSubscriberId`, `getLine1Number`, `SmsManager`, `PhoneStateListener`,
  `MediaRecorder`, `CameraManager`, `ContactsContract`, `LocationManager`.
- **Capabilities** (three or more are malicious): `WindowManager`, `WebView`,
  `Cipher`, `Socket`, `ServerSocket`, `URL`, `getDeviceId`.

`scoreDex()` is the single source of truth; `max()` orders levels with
`UNKNOWN` treated as lowest (its enum ordinal previously ranked it highest).

Consumers refactored: `APKAnalyzer`, `DexAnalyzer`, `JarAnalyzer`,
`AabAnalyzer`, `ThreatSignatures.DEX_API_PATTERNS`.

### 2. YARA on the manual APK path — `MalwareRepository.scanAPK`

Runs `SignatureRuleAnalyzer.analyze(context, apkFile, FileType.APK)` concurrently
with hashing and APK analysis; merges rule hits into the verdict, sources
(`yara:<names>`), and scan history.

### 3. Installed-app code analysis — `FullDeviceScanner.deepScan`

For each non-system installed app, runs `ScanDispatcher.dispatch(...)` and
merges its threat level, reasons and matched signatures with permission scoring
and hash reputation.

### 4. Expanded bundled rules — `core/analysis/rules/BundledRules.kt`

Adds `Android_Dropper_Stager`, `Android_Premium_Sms`,
`Android_Accessibility_Abuse`, `Android_Overlay_Phishing`,
`Android_DeviceAdmin_Ransomware`, `Android_Silent_Installer`,
`Keylogger_Generic`, `Windows_Ransomware_Behavior` (in addition to EICAR, SMS
fraud, dynamic loader, script downloader, keylogger, injection, ransomware note,
PDF JS, UPX).

### 5. Opt-in VirusTotal upload

- `PreferenceManager.vtUploadEnabled` (default OFF) + Settings toggle.
- `MalwareRepository.uploadForAnalysis(file, mime)` (replaces dead
  `uploadAndScan`) and `submitForAnalysis()` gated on consent, key and 32 MB cap.
- Called from `scanAPK` and `scanGenericFile` when the hash is unknown; records
  the `virustotal-submitted` source.

### 6. Wider bounded coverage

- `SignatureRuleAnalyzer` head scan 16 → 32 MB.
- `ApkFinder` file cap 50 → 100 MB; file count 300 → 500.

### 7. Tests — `ThreatScoringTest` (10 cases)

Locks the thresholds: single capability LOW, two capabilities MEDIUM, three
malicious; dynamic loader malicious; two primitives CRITICAL; primitive +
sensitive CRITICAL; one/two sensitive APIs; clean SAFE; `max` UNKNOWN ordering.

## Deferred / recommended next

- **Bundle a real signature set** (compiled SHA-256 + YARA, e.g. abuse.ch /
  ClamAV-derived, license permitting) and wire a default signed feed (F1/F8).
- **Cloud-lookup queue** with prioritization/backoff and a visible quota state
  (F5), so deep scans do not silently lose VirusTotal coverage.
- **Integrity-verify feeds** (detached signature) before applying rules.
- **Sandbox / dynamic analysis** for unknown samples (out of scope, privacy).

## Verification

- `gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.
- Unit tests: 77 total, 0 failures (incl. 10 new `ThreatScoringTest`).
- Debug APK: `zap-scanware-debug.apk`, v1.14.0, 21.2 MB, copied to `docs/`.
