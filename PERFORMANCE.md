# Performance & Memory Best Practices

This document records the mobile performance/memory work in Zap Scanware and the
best practices the codebase follows. It is a living reference — update it when a
rule changes.

## 1. Storage model

The app keeps two very different kinds of data in `cacheDir`:

| Kind | Examples | Safe to delete? |
|---|---|---|
| **Scratch / temporary** | picked-APK copies (`scan-*`), generic file copies (`file-*`), download-scan copies (`dl_scan_*`), archive/package extraction dirs (`ms_arc_*`, `ms_pkg_*`) | Yes, any time |
| **Rebuildable cache** | `reputation_cache.json` (24h TTL), `threat_feeds_cache.json` | Yes, rebuilt on next use |
| **Persistent user data** | scan history (Room DB), preferences (DataStore), logs | **Never** put in `cacheDir` |

Rule: **user data never lives in the cache directory.** The OS may clear
`cacheDir` at any time, so anything important goes to `filesDir`/Room/DataStore.

## 2. What was implemented

- **`core/perf/CacheManager`** — reports cache size, clears temporary files,
  clears the whole cache, and removes stale temp files older than 24h.
- **Temp lifecycle fixes** — the picker copy is deleted after scanning
  (`MalwareScannerViewModel`), archive/package extraction dirs are deleted in
  `finally`, and download-scan copies are removed after analysis.
- **Startup hygiene** — `MalwareShieldApp.onCreate` clears stale scratch files on
  a background scope.
- **`ComponentCallbacks2.onTrimMemory`** — drops rebuildable in-memory caches
  (reputation verdict cache) when the system reports memory pressure or the UI is
  hidden. Persistent data is never touched.
- **Settings → Storage & performance** — shows cache/temp size and lets the user
  clear temporary files or the whole cache on demand.

## 3. Best practices applied

1. **Explicit temp-file lifecycle.** Every scratch file/dir is created, used and
   deleted in a `finally` (or immediately after use). Nothing is left to chance.
2. **Bounded, streaming I/O.** Hashing uses an 8 KB buffer; multi-pattern
   scanning uses a 64 KB window; analyzers cap reads (PE 32 MB, rules 16 MB, DEX
   100 MB, archive members 80 MB / 200 MB total). No whole-file slurping.
3. **Caches have a TTL and a cap.** `ReputationCache` expires after 24h and is
   capped at 5,000 entries; signature feeds cap hashes/domains/patterns/rules.
4. **Clean stale data on startup** rather than only when the user asks.
5. **Honor `onTrimMemory`.** Release *rebuildable* caches under pressure; never
   release user data or in-flight state.
6. **All I/O off the main thread.** `Dispatchers.IO` for scans/hashing, a
   background `CoroutineScope` for startup cleanup, `WorkManager` (with battery
   constraints) for deferrable work like downloads and feed refresh.
7. **No leaks.** No static `Context`; scopes are cancelled (`worker.shutdown()`,
   `onDestroy`); streams and `ParcelFileDescriptor`s are closed; `runCatching`
   guards optional resources.
8. **Don't do heavy work in composition.** Network/validation runs in the
   ViewModel (the URL safety score was moved off the main thread for this
   reason).
9. **Report and let the user clear.** Surface cache size and provide a manual
   clear button — respect user control.
10. **Privacy-preserving diagnostics.** Telemetry is off by default; logs have a
     size cap and retention window.
11. **Shrink the release build.** R8 minify + resource shrinking keeps the
     release APK ~3.3 MB (debug is much larger), which also reduces memory
     footprint and startup work.

## 4. Operational process (runbook)

1. Measure before changing: use the Storage & performance panel, Android Studio
   profiler, and `dumpsys meminfo`.
2. For any new temporary artifact: give it a recognized prefix
   (`scan-`, `file-`, `dl_scan_`, `ms_pkg_`, `ms_arc_`) so `CacheManager` can
   find it, and delete it in a `finally`.
3. For any new cache: add a TTL + entry cap, and register an in-memory release
   path for `onTrimMemory`.
4. Verify: `./gradlew testDebugUnitTest assembleDebug`; spot-check the Settings
   panel reflects the new files.

## 5. Verification

- `CacheManagerTest` covers reporting, temp-only clearing, full clearing and
  age-based stale cleanup.
- Manual: pick an APK, scan, confirm no `scan-*.apk` remains; open Settings →
  Storage & performance and clear.

## 6. Future ideas (not yet implemented)

- Auto-trim the cache when it exceeds a size threshold (e.g. 50 MB).
- Use an OkHttp disk cache for feed downloads instead of a bespoke JSON file.
- Downsample the logo/watermark bitmap on low-memory devices.
- Expose a "clear history older than N days" option.
