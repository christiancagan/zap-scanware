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

## Module Structure
```
MalwareShield/
├── app/
│   └── src/main/java/com/malwareshield/
│       ├── MalwareShieldApp.kt
│       ├── data/
│       │   ├── db/ (MalwareShieldDatabase, ScanHistoryDao)
│       │   ├── entities/ (ScanHistoryEntity)
│       │   ├── repository/ (MalwareRepository, BackgroundScanWorker)
│       ├── di/ (AppModule, AppComponent)
│       ├── domain/
│       │   └── usecase/ (ScanUseCases)
│       ├── presentation/
│       │   ├── MainActivity.kt
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
│           ├── auth/
│           │   ├── BiometricAuthenticator.kt
│           │   ├── SecureCredentialsManager.kt
│           │   ├── FingerprintManager.kt
│           │   └── AuthManager.kt
│           ├── security/
│           │   ├── APKAnalyzer.kt
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