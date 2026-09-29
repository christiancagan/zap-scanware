# Zap Scanware — Download

This folder is served by **GitHub Pages** as the app's public download page.

- Open the site at: `https://<your-username>.github.io/<your-repo>/`
- The download button serves `zap-scanware-debug.apk` (v1.24.1, 18.5 MB, signed).

## Files
- `index.html` — the landing page with the download button/icon
- `zap-scanware-debug.apk` — the Android app (debug build)
- `.nojekyll` — disables Jekyll so the `.apk` is served as-is

## To update the APK
Replace `zap-scanware-debug.apk` with a new build, commit, and push. GitHub Pages
re-deploys automatically.

## Building a Signed Release APK
For a production/Play-ready download, build a signed release APK:

1. Configure `local.properties` with your signing keys:
   ```
   KEYSTORE_PATH=/path/to/your/release-key.jks
   KEYSTORE_PASSWORD=your_password
   KEY_ALIAS=your_alias
   KEY_PASSWORD=your_key_password
   ```
2. Build: `./gradlew assembleRelease`
3. The signed APK is at `app/build/outputs/apk/release/app-release.apk`
4. Copy it to this folder as `zap-scanware-release.apk` and commit.

## Release Process
1. Bump `versionCode` and `versionName` in `app/build.gradle.kts`
2. Build and run tests: `./gradlew testDebugUnitTest assembleDebug`
3. Copy the debug APK over `docs/zap-scanware-debug.apk`
4. Update `docs/index.html` with the new version, SHA-256, and size
5. Commit and push to `origin main` — GitHub Pages re-deploys automatically
