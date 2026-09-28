# MalwareShield Enhancement & Fix Plan

**Date:** September 28, 2026
**Version:** 1.22.0
**Bumps versionCode:** 26

## Overview

This plan addresses all 14 QA findings from the production readiness assessment.

## Must Fix (8 items)

### MF-1: Add Release Signing Configuration
**File:** `app/build.gradle.kts`
- Add `signingConfigs.release` block reading from `local.properties`
- Apply to `buildTypes.release`
- Add `local.properties` to `.gitignore` (already there)

### MF-2: Fix BiometricAuthenticator Encryption Gating
**File:** `app/src/main/java/com/malwareshield/core/auth/BiometricAuthenticator.kt`
- Remove `encryptWithBiometric()` and `decryptWithBiometric()` which bypass biometric
- Update `SecureCredentialsManager` if it calls these methods
- All encryption/decryption must use `authenticateWithCrypto()` or `encryptWithPrompt()`

### MF-3: Fix PrivacyCrypto to Require Authentication
**File:** `app/src/main/java/com/malwareshield/core/security/PrivacyCrypto.kt`
- Change `setUserAuthenticationRequired(false)` to `setUserAuthenticationRequired(true)`
- This ensures encrypted credentials require biometric to decrypt

### MF-4: Add Network Security Configuration
**File:** `app/src/main/res/xml/network_security_config.xml` (new)
- Certificate pinning for VirusTotal and MalwareBazaar domains
- Debug override
- Already referenced in `AndroidManifest.xml` (`@xml/network_security_config`)

### MF-5: Fix System App Code Analysis
**File:** `app/src/main/java/com/malwareshield/core/security/FullDeviceScanner.kt`
- Line 316: Change `!app.isSystem` to always run code analysis
- Remove the "trusted by default" assumption
- Add `isSystem` flag to the audit record

### MF-6: Fix Cancellation to Stop CloudLookupWorker
**File:** `app/src/main/java/com/malwareshield/presentation/viewmodel/DeviceScanViewModel.kt`
- Add `cancelUniqueWork("cloud_lookup")` to `cancelScan()` method
- Add `ensureActive()` checks in scan loops

### MF-7: Add Android Instrumented Tests
**File:** `app/src/androidTest/` (new directory)
- Basic activity/fragment test
- Compose UI test for scan screen
- Add `androidTestImplementation` dependencies

### MF-8: Add CHANGELOG.md and CONTRIBUTING.md
**Files:** `CHANGELOG.md`, `CONTRIBUTING.md` (new)

## Should Fix (6 items)

### SF-1: Add ProGuard Rules for Reflection and Gson
**File:** `app/proguard-rules.pro`
- Add keeps for `ThreatScoring` patterns, `BiometricAuthenticator`, `PrivacyCrypto`
- Add keeps for `URL_REGEX`, `IP_REGEX` and `suspiciousPackageName`

### SF-2: Add Privacy Disclaimer to Accessibility Service
**File:** `app/src/main/java/com/malwareshield/core/security/UrlGuardAccessibilityService.kt`
- Add comment/documentation about data handling
- Already has "Nothing is stored or sent" in the class doc

### SF-3: Add Network Logging for Debug
**File:** `app/src/main/java/com/malwareshield/core/network/VirusTotalClient.kt`
- Already has `BuildConfig.DEBUG` check for logging level — OK

### SF-4: Add QueryAllPackages Declaration
**File:** `app/src/main/AndroidManifest.xml`
- Already present (line 15) — confirmed ✅

### SF-5: Add PrivacyPolicy to Settings Screen
**File:** `app/src/main/java/com/malwareshield/presentation/screens/SettingsScreen.kt`
- Add privacy policy link
- Add data safety disclosure

### SF-6: Add Release Build Variant Documentation
**File:** `docs/README.md`
- Document how to build signed release APK
- Add release build instructions

## Nice to Have (4 items)

### NTH-1: Add Benchmark/Performance Tests
### NTH-2: Add Dark/Light Theme Tests
### NTH-3: Add Localization
### NTH-4: Add Crash Analytics (opt-in)

## Version Bump
- `versionCode`: 25 → 26
- `versionName`: "1.21.0" → "1.22.0"
