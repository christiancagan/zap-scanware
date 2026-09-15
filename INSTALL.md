# HOW TO BUILD AND INSTALL ZAP SCANWARE

## Prerequisites
- Android Studio Hedgehog (2023.1.1) or later
- JDK 17 (e.g. Temurin 17 at `C:\Java\jdk-17.0.20+8`)
- Android SDK: Platform 34, Build-Tools 34.0.0, Platform-Tools
- Android Emulator or physical device (API 26+)
- 4GB+ RAM

## Step 1: Setup Android SDK
This machine's SDK lives at `C:\AndroidSDK` (see `local.properties` → `sdk.dir=C:/AndroidSDK`).
If you use Android Studio's default, edit `local.properties` to match your `sdk.dir`.

Required packages (installed via `sdkmanager`):
- `platforms;android-34`
- `build-tools;34.0.0`
- `platform-tools`

## Step 2: Open the Project
1. Launch Android Studio
2. Select "Open an existing Android Studio project"
3. Navigate to: `C:\Users\Administrator\Documents\Default Project\MalwareShield`
4. Select the project folder and click "Open"
5. Wait for Gradle to sync (may take 2-5 minutes)

## Step 3: Configure Dependencies
1. When Gradle sync completes, Android Studio will download all dependencies
2. If prompted, install missing SDK components
3. Verify all dependencies resolve (check the "Gradle" panel at right)

## Step 4: Configure API Keys (Optional)
1. Open `gradle.properties`
2. Set `VIRUSTOTAL_API_KEY=<your_key>` (or put it in `local.properties` / env var)
3. Get a free key from: https://www.virustotal.com/gui/join-us
4. The key is injected into `BuildConfig.VIRUSTOTAL_API_KEY` at build time

> Note: MalwareBazaar (abuse.ch) needs no key and works out of the box.

## Step 5: Build Debug APK
In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**, or from a terminal:
```
gradlew.bat assembleDebug
```
APK path: `app/build/outputs/apk/debug/zap-scanware-debug.apk`

## Step 6: Install on Device
### Option A: adb (device with USB debugging)
```
C:\AndroidSDK\platform-tools\adb.exe install -r app\build\outputs\apk\debug\zap-scanware-debug.apk
```
### Option B: Android Studio
Connect device / start emulator, click the green ▶ Run button, select your device.

> If you had the old `com.malwareshield` install, uninstall it first — the package id changed to `com.zapscanware`:
> `adb uninstall com.malwareshield`

## Step 7: Build Release APK
1. In Android Studio: **Build → Generate Signed Bundle / APK**
2. Create a new Keystore (or use existing):
   - Key store path: `C:\Users\ADMINI~1\Documents\zap-scanware.jks`
   - Password: set your own
   - Key alias: `zap-scanware-key`
3. Select "release" build type
4. APK path: `app/build/outputs/apk/release/zap-scanware-release.apk`

## First-Time Setup
1. **Launch the app**
2. **Register a new account** (username + password)
   - Password is hashed with PBKDF2-HMAC-SHA256 (210k iterations) + salt locally
   - No data sent to servers
3. **Enable fingerprint** (optional): Settings → Use Fingerprint
4. **App opens to Scan screen** (bottom navigation: Scan, Validate, History, Settings)

## Usage Guide
### Scan Tab
1. Tap **Select** (or the FAB)
2. Pick an APK file
3. App performs:
   - SHA-256 hashing (8KB streaming buffer)
   - APK static analysis (permissions, signatures, DEX patterns)
   - Signature-feed hash check (offline)
   - MalwareBazaar lookup (keyless) + VirusTotal lookup (if key set)
   - Threat classification (Safe → Critical)
4. View results with threat badge and detection sources

### Validate Tab
1. Enter any URL to validate
2. App checks SSL/TLS validity, phishing indicators, domain reputation,
   malware-distribution patterns, homograph attacks
3. Get a safety score (0-100)

### History Tab
1. View all previous scan results
2. Review threat levels and detection sources
3. Delete individual scans or clear all history

### Settings Tab
1. Toggle signature feeds (bundled baseline always on) and MalwareBazaar
2. Add/remove HTTPS feed sources
3. Sync feeds now; view last-sync status and known-hash counts
4. Toggle background scan and notifications

### Guide (? icon)
Bundled, offline user guide covering all the above.

## Uninstall
```
adb uninstall com.zapscanware
```

## Troubleshooting
| Issue | Solution |
|-------|----------|
| Gradle sync fails | Check `sdk.dir` in `local.properties` |
| `KSP MissingType` / Room error | Room uses KAPT; run `gradlew clean` |
| Build errors | Invalidate caches: File → Invalidate Caches |
| Missing dependencies | File → Sync Project with Gradle Files |
| Biometric not working | Check device has fingerprint enrolled |
| VirusTotal returns null | Add valid API key in `gradle.properties` |
| App crashes on launch | Check AndroidManifest.xml permissions |
| Install blocked | Enable "Unknown sources" in device settings |

## File Locations
- **Project root**: `C:\Users\Administrator\Documents\Default Project\MalwareShield`
- **Logo**: `C:\Users\Administrator\Documents\Default Project\MalwareShield\logo\zap logo.jpg`
- **Gradle cache**: `C:\Users\ADMINI~1\.gradle\caches\`
- **APK output**: `app\build\outputs\apk\debug\`
- **Database**: `/data/data/com.zapscanware/databases/malware_shield_db`
- **Keystore**: `/data/data/com.zapscanware/shared_prefs/auth_credentials`

## Technical Details
- Architecture: MVVM + Clean Architecture, Jetpack Compose Material 3
- Build tools: AGP 8.2.0, Kotlin 1.9.21, Compose Compiler 1.5.7, Compose BOM 2024.01.00
- Annotation processing: Hilt + Room via KSP; Room via KAPT (KSP + KAPT coexist)
- Runtime: minSdk 26, targetSdk 34, compileSdk 34
- Libraries: Retrofit, OkHttp, Room, Hilt, WorkManager, Biometric, DataStore, Compose
- No third-party runtime SDKs added beyond the above

## Quick Commands
```bash
# Clean project
gradlew.bat clean

# Build debug APK
gradlew.bat assembleDebug

# Build release APK
gradlew.bat assembleRelease

# Run unit tests
gradlew.bat test

# Run instrumentation tests
gradlew.bat connectedDebugAndroidTest

# Install debug APK
adb install -r app/build/outputs/apk/debug/zap-scanware-debug.apk

# Uninstall
adb uninstall com.zapscanware

# Check connected devices
adb devices
```

## Security Reminders
- All scan data stored ONLY on the device
- No telemetry or external data collection
- Credentials hashed with PBKDF2 and encrypted via Android Keystore (AES-GCM)
- Network traffic uses HTTPS only; cleartext blocked
- VirusTotal key injected at build time (never hardcoded in source)
- Biometric keys require hardware authentication and are invalidated on
  fingerprint-enrollment changes
- Account locks after 5 failed attempts
- Signature feeds validated (HTTPS-only, 5MB cap, entry caps) and cached offline
