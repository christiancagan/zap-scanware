# MalwareShield - Mobile Malware Endpoint Protection

## Overview
Lightweight Android malware detection and prevention application built with Kotlin and modern Android architecture. Supports manual scanning, background scanning, APK static analysis, SHA-256 hashing, VirusTotal integration, URL/site validation, local scan history, and privacy-first operation.

## Logo
- **Logo path**: `C:\Users\Administrator\Documents\Default Project\MalwareShield\logo\zap logo.jpg`
- **Installed to**: All `mipmap-*` directories and `drawable/` as `ic_launcher.webp`
- **Adaptive icons**: `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_foreground.xml`, `ic_launcher_background.xml`

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

## Features

### 1. Manual Malware Scanning
File picker → SHA-256 → APK analysis → VirusTotal lookup → Threat classification

### 2. Background Scanning
WorkManager with battery/network constraints

### 3. APK Static Analysis
Package metadata, permissions, certificate fingerprint, DEX pattern detection,
and the bundled + feed YARA rule engine. Verdicts use unified threat scoring
(`ThreatScoring`): malicious primitives (dynamic loaders, `Runtime.exec`, root
shell, silent install, accessibility/device-admin abuse), sensitive APIs, and
generic capabilities are weighted so a single WebView/socket is not reported
malicious.

### 4. SHA-256 File Hashing
Streaming 8KB buffer, no full file loading into RAM

### 5. VirusTotal Integration
Retrofit-based API, hash-based report lookup, and **opt-in** file upload for
unknown samples (Settings → *Upload unknown files to VirusTotal*, default OFF,
requires a VT API key). Only hashes leave the device unless upload is enabled.

### 6. URL/Site Validation
- **URLValidator**: Validates URL integrity, SSL certificates, domain reputation
- **SuspiciousURLChecker**: Phishing detection, safety scoring (0-100)
- **SafeBrowsing API**: Google Safe Browsing integration
- **SSL Certificate Verification**: Issuer, validity dates, self-signed detection
- **Phishing Indicators**: IP-based URLs, obfuscation, excessive redirects
- **Homograph Attack Detection**: Unicode character detection
- **Deep Link Support**: Automatic URL validation on intent

### 7. Local Scan History
Room database with Flow, encrypted with Android Keystore

### 8. Minimal Resource Consumption
CPU: Coroutines on Dispatchers.IO, Compose lazy rendering
RAM: 8KB streaming buffers, Compose minimal composition
Battery: WorkManager constraints, efficient coroutines
Network: Minimal API calls, caching, batched requests

### 9. Privacy-First Operation
All scan data stored locally only, no telemetry, no external data collection

### 10. Clean Material Design 3 UI
Dark/Light theme, bottom navigation (Scan + Validate + History), threat badges

### 11. Detection Hardening (v1.14.0)
- Unified `ThreatScoring` across APK/DEX/JAR/AAB analyzers (no more
  "everything is CRITICAL" false positives).
- YARA rules now run on the manual APK scan path (previously skipped).
- Deep device scan runs full code analysis on installed (non-system) apps.
- Expanded bundled Android/PE detection rules.
- Opt-in VirusTotal upload for unknown hashes.
- Wider bounded coverage (32 MB rule scan, 100 MB / 500-file device scan).

### 12. Cloud Queue & Signed Feeds (v1.15.0)
- **Prioritized cloud-lookup queue** (`CloudLookupQueue`): the device scan
  spends the limited VirusTotal quota on the highest-risk candidates and defers
  the rest, instead of silently skipping them.
- **Background continuation** (`CloudLookupWorker`): a WorkManager job drains the
  queue in rate-limited batches, records threats to History, and notifies you.
- **Signed threat feeds**: when `FEED_PUBLIC_KEY` is configured, remote feeds
  must carry a valid ECDSA-P256 signature (`SignatureVerifier`) or are rejected.
- **Broader offline baseline**: bundled DEX patterns include high-signal
  primitives; abused free-DNS/tunneling/paste domains are flagged suspicious.
- Settings shows VirusTotal slots free, queued lookups, and feed-signature
  status.

### 13. MalwareBazaar Integration (v1.16.0)
- **Auth-Key** support (abuse.ch now requires it): entered in Settings, stored
  encrypted with the Android Keystore.
- **Recent-detections offline mirror** (`MalwareBazaarFeed`): pulls recent
  family-labelled samples from MalwareBazaar and keeps their SHA-256 hashes +
  family/tags locally (`filesDir/mb_signatures.json`), refreshed daily. Every
  scan path (manual, device, download, Safe Browse) can then flag those hashes
  **offline**.
- Settings → Threat intelligence: masked key field, Save/Sync, and live mirror
  count.

### 14. Auditable Deep Scan Results (v1.17.0)
- Every installed app ends with an explicit state: malicious, suspicious, clean,
  unverified, queued, deferred, or skipped — with the reason.
- Device-scan results now show how many apps were fully analyzed vs
  permission-only, hashed, checked, queued, deferred, or failed, plus any
  reputation limitations (missing API keys, exhausted VirusTotal quota, stale
  MalwareBazaar mirror).
- A per-scan JSON audit of every app is stored on the device, and cloud results
  are merged into findings instead of silently dropping apps.

## Module Structure
```
MalwareShield/
├── app/
│   └── src/main/java/com/malwareshield/
│       ├── MalwareShieldApp.kt
│       ├── data/
│       │   ├── db/ (MalwareShieldDatabase, ScanHistoryDao)
│       │   ├── entities/ (ScanHistoryEntity)
│       │   ├── dao/
│       │   ├── repository/ (MalwareRepository, BackgroundScanWorker)
│       ├── domain/
│       │   └── usecase/ (ScanUseCases)
│       ├── di/ (AppModule, AppComponent)
│       ├── presentation/
│       │   ├── MainActivity.kt
│       │   ├── screens/
│       │   │   ├── ScanScreen.kt
│       │   │   ├── HistoryScreen.kt
│       │   │   └── URLValidatorScreen.kt
│       │   ├── viewmodel/ (MalwareScannerViewModel, HistoryViewModel)
│       │   └── ui/
│       │       ├── components/ (UIComponents, SafetyScoreIndicator)
│       │       └── theme/ (Theme)
│       └── core/
│           ├── security/
│           │   ├── APKAnalyzer.kt
│           │   ├── PrivacyCrypto.kt
│           │   └── URLValidator.kt (NEW)
│           ├── network/
│           │   ├── VirusTotalApiService.kt
│           │   ├── VirusTotalApiModels.kt
│           │   ├── VirusTotalClient.kt
│           │   └── SafeBrowsingApiService.kt (NEW)
│           ├── scanning/
│           │   ├── ScanEngine.kt
│           │   └── ScanResult.kt
│           ├── storage/ (PreferenceManager.kt)
│           └── utils/ (HashUtils.kt)
├── core/signatures/ (MalwareSignatures.kt)
├── core/utils/ (HashUtils.kt)
├── logo/ (zap logo.jpg)
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── AGENTS.md
└── README.md
```

## URL Validation Features (NEW)

### What it validates:
1. **SSL/TLS Certificate Integrity** - Issuer, validity, self-signed detection, fingerprint
2. **Phishing Detection** - IP-based URLs, obfuscation patterns, excessive redirects
3. **Domain Reputation** - Known malicious/suspicious domain database
4. **Malware Distribution Check** - Suspicious file extensions in URLs
5. **URL Integrity** - Null injection, Unicode homograph attacks, excessive length
6. **Safety Score** - 0-100 scoring based on all checks
7. **Google Safe Browsing** - Integration with Google's threat intelligence

### Usage:
```kotlin
// Validate a URL
val result = URLValidator.validateURL("https://example.com")
if (result.isValid && result.hasValidSSL) {
    // Safe to proceed
} else {
    // Block or warn user
}

// Get safety score
val score = SuspiciousURLChecker.getSafetyScore(url)
```

## Build & Install
```bash
# Build debug APK
./gradlew assembleDebug

# Build release APK
./gradlew assembleRelease

# Run tests
./gradlew test

# Install on device
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Key Optimization Techniques
- **CPU**: Coroutines on `Dispatchers.IO`, Compose minimal recomposition
- **RAM**: 8KB streaming hash buffers, Compose lazy rendering
- **Battery**: WorkManager `@RequiresBatteryNotLow` constraint
- **Network**: Minimal API calls, batching, HTTP logging disabled in prod
- **Security**: Android Keystore AES-GCM encryption, cleartext traffic blocked