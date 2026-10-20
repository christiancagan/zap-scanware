# Enhancement Plan 9 — Finding Actions, Gson Migration, Coverage Honesty, Cleanup (v1.19.0)

Task doc for: per-finding **Remove/Allow** buttons, org.json → Gson migration,
scan-coverage assessment fixes, and verified-unused file/config cleanup.
Status: **IMPLEMENTED v1.19.0 (versionCode 23)** — see Verification.

## 1. Assessment: what the scanner actually covers

Verified against source (see paths/lines):

- **Installed apps ARE hashed in DEEP**: `FullDeviceScanner.kt:169-251` hashes
  each non-system app's `sourceDir` APK (`/data/app/*.apk` is world-readable)
  and runs the full `ScanDispatcher` pipeline on it. System apps
  (`FLAG_SYSTEM`) get permission scoring + hash reputation only (`:182-191`).
- **QUICK does not hash apps**: `quickScan (:62-148)` scores permissions only
  (`hashAvailable=false`); it hashes only sideloaded `*.apk` files on storage
  via the offline feed.
- **File scan is bounded by design**: `ApkFinder.kt:50-55` walks 4 dirs
  (Downloads, Documents, Downloads/Telegram, Download), depth ≤ 4, ≤ 500
  files, ≤ 100 MB each, extension allowlist (~60 exts). It misses DCIM,
  WhatsApp/Media, Bluetooth, Music/Movies, SD cards, extensionless files, and
  anything past the caps — with no truncation warning.
- **Hard platform limits (no root)**: `/data/data`, `/data/system`,
  other apps' private dirs (SELinux sandbox); full `/system` walks
  (per-APK `sourceDir` reads are allowed); package visibility without
  `QUERY_ALL_PACKAGES` (declared in the manifest); scoped storage without
  All-files-access (app degrades to MediaStore, prompts correctly).
- **Strings overstated coverage**: `DeviceScanScreen.kt:57-60` ("Scans every
  installed app plus APKs, archives, executables and documents on this
  device"), `GuideScreen.kt:80-84` ("every app and file is hashed … full
  analysis pipeline"), stale `InstalledAppScanner.kt:20-22` KDoc (claims no
  `QUERY_ALL_PACKAGES`, but the manifest declares it).

## 2. Design

### A. org.json → Gson (5 persistence-only stores)

`org.json` throws in JVM unit tests, so every store using it is untestable.
All five use it only for local file persistence (load/save); public behavior
is unchanged. Pattern (as in v1.18.0 `HashIndex`): Gson wrapper data class,
atomic tmp+rename writes preserved, pure codec object where the class needs
Android, round-trip unit tests.

| File | Change | Test |
|---|---|---|
| `core/reputation/ReputationCache.kt` | load/save → Gson `ReputationCacheFile` | `ReputationCacheTest` (round-trip, TTL expiry, cap) |
| `core/reputation/CloudLookupQueue.kt` | load/save → `CloudQueueJson` codec + Gson | `CloudQueueJsonTest` (round-trip, bad-kind fallback) |
| `core/signatures/MalwareBazaarFeed.kt` | load/save → `MalwareBazaarMirrorFile` codec + Gson | `MalwareBazaarMirrorFileTest` |
| `core/logging/EventLogger.kt` | toJson/fromJson → `EventJson` codec + Gson | `EventJsonTest` |
| `core/providers/ProviderKeyManager.kt` | load/save → `ProviderKeysFile` codec + Gson | `ProviderKeysFileTest` |

Out of scope (documented follow-up): `SignatureFeedManager` remote-feed
*parsing* (network schema, different risk profile).

### B. Remove / Allow on every finding

- New `core/security/FindingAllowlist.kt` (`@Singleton @Inject`,
  `filesDir/allowlist.json`, Gson): entries `{sha256, packageName, path,
  label, millis}`; `isAllowed(hash, packageName, path)` (hash primary,
  package/path fallback for hash-less QUICK app findings); `allow(entry)`,
  `remove(sha256|package|path)`, `all()`, capped (500). `FindingAllowlistTest`.
- Suppression checkpoints in `FullDeviceScanner`: skip finding emission for
  allowlisted items (quick-app, quick-apk, deep-file, deep-app); skip
  cloud-queue candidates for allowed hashes (no quota wasted); allowed apps
  keep their audit record + reason "Allowed by user (finding suppressed)".
- `RecheckService`: skips allowlisted hashes, counted as `suppressed`.
- `HashIndex.remove(sha256)`: invalidates the index entry on file delete so
  recheck stops reporting a removed file.
- `DeviceScanViewModel`: `removeFinding(f)` — FILE/APK_FILE: delete +
  index-invalidate + drop from list (error when `apkPath` blank or delete
  fails); APP: drop from list (uninstall intent still fired from UI).
  `allowFinding(f)` — persist entry + drop from list. Replaces `deleteFinding`
  (callers updated).
- `DeviceScanScreen.FindingCard`: every card gets **Remove** (primary,
  red-on-white) + **Allow** (outlined) + VirusTotal — including FILE findings
  with blank `apkPath`, which previously had no action at all.

### C. Coverage honesty + modest widening

- `ApkFinder.SEARCH_DIRS` += `DCIM`, `WhatsApp/Media`, `Bluetooth`, `Movies`,
  `Music` (same depth/file/size caps).
- `findScanTargets()` returns `ScanTargetResult(files, truncated)`; `truncated`
  is true when a cap cut the walk short. `FullScanResult` gains
  `targetsTruncated` + `hadAllFilesAccess`; the result card shows a scope line
  (dirs, caps, all-files-access, truncated warning).
- Strings corrected to the bounded truth (device-scan hero, guide,
  `ApkFinder` KDoc, `InstalledAppScanner` KDoc, `ScanMode.QUICK` description):
  installed apps scored in QUICK / hashed+analyzed in DEEP (non-system);
  storage scan covers download/media dirs up to 500 files / 100 MB;
  system/private partitions unreachable without root.

### D. Verified-unused cleanup (all reference-checked, counts in §4)

Delete: `domain/usecase/ScanUseCases.kt` (4 use-cases, 0 refs),
`core/network/SafeBrowsingApiService.kt` (0 refs, no Hilt binding),
`presentation/ui/FilePicker.kt` composable (0 callers; MainActivity's
`filePicker` launcher is a different symbol), `ScanProgressIndicator`
(UIComponents.kt:45, 1 hit), 4 legacy v2 VT symbols
(`VirusTotalApiModels.kt:64-71`), orphan `core/` (`MalwareSignatures.kt`,
`HashUtils.kt` — outside the Gradle source set, 0 refs),
`res/layout/activity_main.xml` (Compose-only, 0 refs), 2 drawable
`ic_launcher.webp` (icon is `@mipmap`, 0 refs), `assets/google-services.json`
(placeholder, no Firebase plugin/imports), `PAGES.md` + `INSTALL.md`
(0 backlinks).
Prune: `values/strings.xml` → `app_name` + `accessibility_service_description`
(0 `R.string` refs in Kotlin); `values-night/strings.xml` → `app_name`;
`colors.xml` → 5 theme-referenced colors.
Move: `assets/sample-threat-feed.json` → `app/src/test/resources/` (fixture
only; stops shipping it in the APK).
Gradle: remove `navigation-compose`, `hilt-navigation-compose`,
`ui-tooling-preview`, `lifecycle-viewmodel-compose`,
`lifecycle-runtime-compose`, `mockito-core`, `kotlinx-coroutines-test`,
`truth`, the `androidTestImplementation` set + `composeBom`
androidTest line, `debugImplementation ui-tooling/ui-test-manifest`
(no `androidTest` dir; zero imports — all `@HiltViewModel` hits are the
`dagger.hilt` annotation). Keeps: junit, room kapt+ksp hilt compilers,
livedata (HistoryScreen), runtime-ktx (`lifecycleScope`), converter-gson.
Kept deliberately: `RetiredAppComponent`, manifest components/permissions,
all Hilt bindings, ProGuard keeps, tracked `docs/*.apk`, untracked
`logo/zap logo.ico` (left alone — not a repo file).

## 3. Files changed (v1.19.0)

Gson: `ReputationCache.kt`, `CloudLookupQueue.kt`, `MalwareBazaarFeed.kt`,
`EventLogger.kt` (+ `core/logging/SecurityEvent.kt` if DTO moved),
`ProviderKeyManager.kt`, 6 new tests.
Actions: `FindingAllowlist.kt` (+test), `FullDeviceScanner.kt`,
`RecheckService.kt`, `HashIndex.kt`, `DeviceScanViewModel.kt`,
`DeviceScanScreen.kt`, `MalwareRepository.kt` (history delete for removed
files — write path only, no schema change).
Coverage: `ApkFinder.kt`, `DeviceFinding.kt` (`FullScanResult` scope fields),
`DeviceScanScreen.kt` (scope line), `GuideScreen.kt`, `ScanMode.kt`,
`InstalledAppScanner.kt` (KDoc).
Cleanup: deletions/prunes/`app/build.gradle.kts` above.
Docs: `AGENTS.md` (§20), `README.md` (§16), `docs/index.html`,
`docs/README.md`, this plan.

## 4. Pre-removal reference check (own greps, distinct-file hits)

`ScanUseCases/*`: 1 (self) · `SafeBrowsing*`: 1 (self), no Hilt/ProGuard/test
refs · `FilePicker(` composable: 1 (self) · `ScanProgressIndicator`: 1 (self) ·
legacy VT symbols: 1 (self) · `MalwareSignatures`/`HashUtils`: 0 in `app/src`
· navigation/lifecycle-compose/preview/mockito/truth/coroutines-test/espresso:
0 real (11 `hiltViewModel` hits all `dagger.hilt` annotation) ·
`R.string` in Kotlin: 0 · `R.layout`/`R.color`/`@drawable/ic_launcher`: 0 ·
Firebase/plugin: 0 · `PAGES.md`/`INSTALL.md` backlinks: 0 ·
`sample-threat-feed` refs: 1 (comment) · no `androidTest` dir.

## Verification

- `./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.
- Unit tests: **180 total, 0 failures** (29 suites). New suites:
  `ReputationCacheTest` (7, incl. legacy org.json file compat),
  `CloudQueueJsonTest` (5), `MalwareBazaarMirrorFileTest` (3), `EventJsonTest`
  (4), `ProviderKeysFileTest` (4), `FindingAllowlistTest` (9).
- The new allowlist test caught a real bug during authoring: an entry allowed
  WITH a hash did not suppress the same package in a hash-less QUICK scan.
  Fixed via field-scan fallback in `FindingAllowlist.isAllowed`.
- Post-cleanup full build + dex confirms no removed symbol was referenced.
- Debug APK: `zap-scanware-debug.apk`, v1.19.0 (build 23), 19.3 MB
  (down from 21.3 MB), copied to `docs/`.
