# Changelog

All notable changes to MalwareShield are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.43.0] - 2026-10-01

### Changed
- **Warn prompt now Blocks.** The Warn card's Cancel is now **Block**: it
  exits the page AND permanently blocks the site (custom blocklist, which
  always blocks once filtering is on) — from the overlay card, and from the
  full-screen Warn screen (which blocks directly, so it works even with the
  accessibility guard off). Continue stays and leaves the page open.
- **Prompt notifications peek as heads-up banners** (sound + vibration on
  the HIGH prompt channel), so they show over the browser even where
  full-screen intents are suppressed.
- **Settings tidy-up:** "Display over other apps" + Test prompt moved to a
  new **Prompts over browser** section directly below Safe Browse; the
  Prompt diagnostics card is removed.

## [1.42.0] - 2026-10-01

### Fixed
- **Prompts pop over the browser with NO overlay permission.** Like
  Sophos-style apps, the fallback path needs no "Display over other apps":
  both prompt paths now post to a fresh guaranteed-HIGH `url_guard_alert`
  channel (Android never upgrades an existing channel, so a lowered
  `url_guard` could silently neuter pop-ups), and the diagnostics card
  gains a "Notification pop-up" line reading Android 14+
  `canUseFullScreenIntent()` with re-allow guidance when blocked.

## [1.41.0] - 2026-10-01

### Fixed
- **Display-over-apps made obvious and failure-proof.** A red dashboard
  banner now appears until "Display over other apps" is granted, with a
  one-tap allow button; the moment it is granted, a test prompt card pops
  immediately as proof. If an overlay ever fails to attach, the notification
  fallback now fires instead of failing silently (`onFailed` plumbed
  through both prompt paths).

## [1.40.0] - 2026-10-01

### Fixed
- **Prompt diagnostics card (Settings → Prompt diagnostics).** When no
  prompt appears over Chrome, the card checks the chain top to bottom — VPN
  active, DNS queries actually seen, Private DNS mode, content-filter state
  + Gambling action, overlay grant, last prompt fired — with the first red
  line naming the reason. Includes a **Test prompt** button (fires a test
  overlay card, proving display works) and a Refresh button. New
  `PromptDiagnostics` records every overlay prompt + attach failures; the
  VPN counts DNS queries seen per session.
- **Likeliest real cause surfaced, not just logged:** Android Private DNS
  (or Chrome's own Secure DNS) hides ALL browser DNS from link protection,
  so no prompt can ever fire — the card warns when Private DNS isn't off
  and tells where to turn it off.

## [1.39.0] - 2026-10-01

### Fixed
- **Warn/Block prompt now appears OVER the browser.** The notification
  full-screen path only works when channel/permission state cooperates, so
  prompts sat in the shade needing a tap to reach. New `PromptOverlay`
  draws the Warn/Block card as a system overlay window
  (`TYPE_APPLICATION_OVERLAY`) directly over the browser the moment a risky
  domain is visited — no navigation needed. Cancel exits the page (the
  accessibility guard navigates back; the VPN path dismisses), Continue
  stays. Both the guard and the VPN prefer the overlay and keep the
  notification path as fallback (now with unique ids per prompt, since
  reusing one id only updates the shade entry and never re-fires
  full-screen). Needs one user grant: Settings → Content filter →
  "Display over other apps" (new status row + deep link, refreshed on
  resume; new `SYSTEM_ALERT_WINDOW` manifest permission).

## [1.38.0] - 2026-10-01

### Fixed
- **Dashboard Clean now matches the Total.** Two compounding bugs: (1) every
  clean APK on storage was emitted as a "finding" (Quick logged all APKs,
  Deep kept `|| f.isApk` in the finding gate and the cache-reuse twin), so
  findings/history were inflated with CLEAN rows — CLEAN is explicitly not a
  finding. Only real detections (malicious or ≥MEDIUM) become findings now.
  (2) The Threats/Clean tiles counted all-time `scan_history` rows while the
  Total counts the latest COMPLETED session, so they could never agree. Both
  tiles now derive from the latest COMPLETED `scan_session`: Threats =
  malware+pua+suspicious+low+unknown, Clean = Total − Threats (≥0), so
  Clean + Threats always equals the Total.
- **Scan progress ring is red.** The segmented ring + motion sweep used the
  blue theme primary; both now use signal red (`#E53935`), track unchanged.
- **Warn now pops up over the browser.** The VPN saw every WARN domain (hence
  the WARN log entries) but only posted a quiet DEFAULT-importance
  notification with no tap action on a `safe_browse_warn` channel — and a
  single global 60s gate suppressed different sites too. It now fires the
  same prompt as the accessibility guard at verdict time (before page content
  loads): direct launch fast path + tap-to-open full-screen notification on
  the HIGH `url_guard` channel (`CATEGORY_ALARM`), opening `WarnActivity`
  (OK stays, Cancel goes back), with a per-host 60s cooldown so a second
  risky site always prompts while staying on one page doesn't nag. Note: if
  system notifications are denied AND background starts are blocked, Android
  leaves no path to show anything — allow notifications for prompts.

## [1.37.0] - 2026-10-01

### Fixed
- **Scheduled scans never ran and left no trace.** Rebuilt the pipeline:
  - Exact-time one-off chain replaces periodic work: Daily fires today at
    the chosen time when still ahead (else tomorrow), Weekly on the same
    7-day grid, Custom interval from now — the "Next run" countdown is now
    honest, and each completion enqueues the next link (stale
    periodic/one-off work from older versions is cancelled on re-enqueue).
    The pending link persists across reboots in WorkManager.
  - `update()` logs the enqueue outcome, so a failed enqueue can never
    again leave the toggle ON with no work and no trace
    (`outcome=enqueue_failed:<reason>` in the event log).
  - App startup re-enqueues the chain link when desired-but-missing
    (`resyncOnStartup`; never touches a healthy pending link).
  - The worker now runs the SAME full device scan as a manual run
    (previously: quick permission scoring only, recorded nowhere): scan
    session persisted, every finding recorded to history, high-risk apps
    notify — so scheduled runs appear in History, the dashboard and the
    event log (`schedule_trigger` + `scan_finish` with app/file counts).
    Dependencies come from a Hilt entry point, keeping the other plain
    workers untouched.
- **"Restricted" background bucket is now visible.** The Schedule screen
  detects `isBackgroundRestricted()` (the most common reason scans never
  run on real phones) and shows a red card with a deep link to app
  settings. A **Run now** button enqueues an immediate one-shot scan
  outside the chain to verify the whole pipeline end to end.
- Pure `computeNextRunAt` covered by `ScanScheduleTimingTest` (8).

## [1.36.0] - 2026-10-01

### Fixed
- **Dashboard "Total scans" showed 33 instead of 1381.** That tile counted
  `scan_history` rows — one row per *finding* — while the real scan covered
  1381 apps + files. The dashboard now reads the latest COMPLETED
  `scan_session` (`totalScanned = apps + files`) via a new
  `DashboardViewModel.lastScanItems` flow, and the tile is relabeled
  "Items scanned" so the number matches the device-scan result.
  Threats/Clean tiles still count finding rows, which is what they mean.

### Changed
- **No more password on Delete/Uninstall.** Tapping Delete (file) or
  Uninstall (app) on a scan finding — on the result list or the detail
  screen — now only asks the "are you sure?" confirmation. The settings
  password still guards protection-setting changes and the Safe Browse
  toggle. Removed the now-unused `lockRequired` / `verifyLock` /
  `refreshLockRequired` plumbing and the `ConfigLockManager` injection
  from `DeviceScanViewModel` (Settings keeps its own).

## [1.35.0] - 2026-10-01

### Added
- **Keep Safe Browse alive after the app is closed.** Verified our side
  never stops the VPN (only the Settings toggle calls `stopService`;
  `stopSelf` runs solely on system revoke). Stops come from the
  system/OEM side: swipe-away force-stop, battery optimization, or memory
  pressure — and on Android 12+ a background `startForegroundService`
  retry can be refused outright. The platform-sanctioned answer is now in
  the app: the Safe Browse section (while desired) explains the two
  system switches and deep-links to them — system **VPN settings** (turn
  on Always-on VPN for Zap Scanware so Android itself keeps it up until
  it is switched off here) and **battery settings** (set to Unrestricted).
  Both intents fall back to the main Settings screen on makers without
  those pages.

## [1.34.1] - 2026-10-01

### Fixed
- **Device scan screen structure + gradient cards.** A stray closing brace
  ended the results list early (fatal compile error); the scan-mode and
  running-state cards were switched to the hero gradient with light text
  and light chip labels so they stay readable on the dark background.

## [1.34.0] - 2026-10-01

### Fixed
- **Gambling/adult visits now actually warn on screen.** Three compounding
  gaps meant "no warning" was the common outcome:
  1. The prompt relied on a background activity start, which Android 10+
     silently drops — the warning sat unseen in the notification shade.
     Prompt notifications now carry a **full-screen intent** (HIGH
     `url_guard` channel + `USE_FULL_SCREEN_INTENT` manifest permission),
     so the Warn/Block screen pops up over the browser immediately.
  2. A global 30s throttle + same-host dedup sat above the prompt
     branches, so opening a second risky site within 30s produced NO
     prompt at all. Those gates now apply to the generic "risky site"
     notification only; prompts use their own per-host cooldown
     (`PROMPT_COOLDOWN_MS` 60s for BLOCK, 30-min snooze for WARN).
  3. The bundled adult/gambling lists missed many real sites (stake,
     unibet, livejasmin, …). Added 8 adult + 10 gambling domains and 5
     gambling keywords (sportsbook, roulette, blackjack, …), with
     false-positive guards (`mistake.com`, `sportsnews.com` stay clean).
- Setup reminder (unchanged behavior, now actually effective): warnings
  need Content filter ON with categories set to Warn (Settings → Save +
  password) AND the accessibility guard enabled (system Settings →
  Accessibility); Safe Browse alone can only send notifications.

## [1.33.0] - 2026-10-01

### Changed
- **Smaller scan progress ring with a looping animation.** The device-scan
  ring shrinks from 176dp to 120dp (10dp stroke, smaller centered label)
  and gains a translucent sweep arc that rotates once every 1.6s while a
  scan runs, so the ring reads as alive even when the percentage stalls
  (e.g. while a large file hashes). The lit segments still report the real
  percentage; segment math (`segmentsFilled`) is unchanged and still tested.

## [1.32.0] - 2026-10-01

### Fixed
- **Why device scans were slow.** Two costs dominated: (1) every storage
  file was re-hashed on every scan even when unchanged, and (2) 200+
  system apps were hashed and analyzed each time. Repeat scans now skip
  both: unchanged files reuse their saved verdicts without re-hashing
  (size/mtime fast-path) and system apps are excluded entirely.

### Changed
- **Scans save everything; only new or updated items are re-scanned.**
  The deep scan pre-loads the whole file cache in one query, then per
  file: unchanged size+mtime → reuse with zero I/O (`shouldReuseFileCacheByStat`);
  stat changed → hash, and a matching hash still reuses the verdict
  (`shouldReuseFileCache`); only genuinely new/changed content runs the
  analyzer pipeline, reputation and cloud quota. Fresh verdicts are
  written in one batched `upsertAll` instead of one transaction per file,
  and reuse counts are logged per scan. Accepted trade-off, documented in
  code: a modification that preserves both size and mtime is missed until
  the next analysis-version bump — any size or mtime change falls through
  to the content-hash gate, which always re-reads bytes.
- **System apps/files excluded from device scans.** Both Quick and Deep
  now cover user-installed apps plus the malware-capable files from the
  storage sweep (APKs, archives, executables, scripts, documents —
  system partitions were already unreachable without root). Each excluded
  system app keeps one terminal `NOT_ANALYZED` audit record with the
  reason "System app excluded from scan (user-installed apps only)", so
  the per-app audit stays complete and the exclusion is visible. Result
  cards read "0 system · N user-installed (system apps excluded)".
- **APK scanner simplified.** The "Select APK file" picker button is gone;
  the hero button is now "Scan and Search APK Files" and searches storage
  for APKs to scan one by one (the per-APK Scan buttons are unchanged).
  The now-unused `MalwareScannerViewModel` and its MainActivity file-picker
  plumbing were deleted; `ScanScreen` takes only the finder ViewModel.
  Guide text updated to match.

### Added
- `FileScanCacheDao.getAll()` / `upsertAll()` for single-query preload and
  single-transaction writes; 5 new `FileScanCachePolicyTest` stat-gate
  cases (10 total in the suite).

## [1.31.0] - 2026-10-01

### Fixed
- **Device-scan finding buttons fit their labels.** The Uninstall/Delete,
  Allow and VirusTotal actions now use single-line 12sp ellipsis labels with
  tight padding, so "Uninstall" and "VirusTotal" no longer clip on narrow
  phones.

### Changed
- **Safe Browse stays up when the app is closed.** The VPN already ran as a
  foreground service; it now also re-issues an explicit start on task
  swipe-away (when protection is still desired and VPN consent holds),
  restarts after app updates (`MY_PACKAGE_REPLACED`, not just reboot), and
  every start path uses the O+ `startForegroundService` helper — the old
  `startService` calls could throw while the app was in the background.
  Settings states that protection stays on when the app is closed.

### Added
- **Incremental file scans (deep).** New Room `file_scan_cache` table (DB
  v6, non-destructive migration): every analyzed storage file persists its
  content hash + verdict (score, level, category, threat name, VT summary,
  analysis version). The next deep scan still hashes each file (cheap
  streaming I/O, so modified files are never skipped) but reuses the cached
  verdict for unchanged hashes — skipping the analyzer pipeline, reputation
  lookups and cloud quota. Size/mtime are stored for diagnostics only and
  are deliberately not part of the reuse gate (mtime can be forged; a
  changed byte always changes the hash). Rows unseen for 30 days are
  pruned. Pure `shouldReuseFileCache` gate covered by
  `FileScanCachePolicyTest` (5).

## [1.30.0] - 2026-09-30

### Changed
- **Notify is now Warn.** Every Content Filter category offers Off / Warn /
  Block. WARN shows the on-screen prompt (OK stays on the page, Cancel goes
  back) via the accessibility guard, or a tap-to-open warning notification;
  over Safe Browse DNS the site resolves with a throttled warning
  notification. Previously saved NOTIFY values are read as WARN — no setting
  is lost.

### Added
- **Dashboard Safe Browse card.** New "Safe Browse" section shows live link
  protection (Active/Off), the session summary (X blocked · Y warned), and
  the latest enforcement events with domain, BLOCK/WARN badge, reason, and
  time. Fed by a new bounded in-memory `BlockedDomainLog` (100 entries,
  newest-first, duplicate-collapsed) recorded by both the DNS filter and the
  accessibility guard; refreshes every time the dashboard resumes.

## [1.29.0] - 2026-09-30

### Added
- **Safe Browse survives app-close and reboot.** The VPN now runs as a
  foreground service (`specialUse`: local DNS filtering) with an ongoing
  "Safe Browse active" notification (tap opens the app, count refreshes at
  most every 10 s), so the system keeps link protection up when the app is
  closed. A new `BootReceiver` (`BOOT_COMPLETED` + `QUICKBOOT_POWERON`)
  restarts it after a reboot when protection is desired and the VPN consent
  still holds — otherwise Settings keeps showing the grant button. Requires
  the one-time system VPN consent as before; stopping the toggle removes
  both the VPN and the notification.

## [1.28.1] - 2026-09-30

### Fixed
- **Notify prompt never appeared (root cause).** Android 10+ silently blocks
  background activity starts, so the guard's direct `startActivity` for
  `WarnActivity` (and `BlockActivity`) was dropped on most devices. Both
  screens are now ALSO posted as tap-to-open notifications ("Site warning —
  tap to review" / "Blocked site — tap to view"); tapping always opens the
  prompt. The direct launch is kept as a fast path where allowed.
- **Safe Browse enabling skipped the password.** `runProtected` ran the
  toggle freely when no password existed yet or the 5-minute unlock window
  was active. The toggle now uses a strict gate: EVERY change (on and off)
  verifies the password, and first-time use forces password creation before
  the change applies.

### Added
- **Safe Browse ON by default.** New persisted `safeBrowseEnabled`
  preference (default true); the app auto-starts the VPN on launch and in
  Settings once the one-time system consent is granted, and Settings shows a
  "Waiting for VPN permission" state with a grant button until then.
  Declining consent switches protection back off.

## [1.28.0] - 2026-09-30

### Added
- **Per-category Off / Notify / Block.** Every content category now has its
  own action instead of one global Notify/Block switch. NOTIFY shows a new
  on-screen `WarnActivity` ("this site may be risky", matched categories,
  **OK** stays on the page, **Cancel** navigates back via the guard) with a
  30-minute per-host snooze; BLOCK keeps the existing full-screen block page.
  Old settings migrate once (global action + blocked set → per-category map).
- **VirusTotal panel (fixes the key).** The VT key was build-time only, so
  installs built without the env var silently had no cloud lookups and no way
  to add one. Settings → VirusTotal now has a masked paste field with
  show/hide, a password-gated Save (Keystore-encrypted, like the MalwareBazaar
  key), key-source status (App setting / Built-in / Not set), masked display
  (••••last4), and the quota/queue lines moved here. The user key takes
  precedence over the baked-in build key everywhere (reports, uploads, queue).
- **Scan progress ring.** The device-scan running state shows a segmented
  radial ring with a centered percentage instead of a linear bar.

### Fixed
- **NOTIFY no longer hard-blocks over Safe Browse.** The DNS path blocked on
  the verdict regardless of action; NOTIFY domains now resolve normally with
  a throttled (60 s) notification — the on-screen prompt needs the
  accessibility guard, and Settings says so.

### Changed
- `EditableSettings.contentAction`/`blockedCategories` replaced by
  `categoryActions` map; `ContentFilter.CategoryMatch` gains `notify` and an
  effective `action` (BLOCK/NOTIFY/OFF); custom blocklist and threat-intel
  hits always BLOCK. `ReputationService.virusTotalEnabled()` is now suspend
  and honors the user key.

## [1.27.0] - 2026-09-28

### Fixed
- **Safe Browse took the whole device offline (root cause).** The VPN's
  packet helpers read/wrote multi-byte fields **little-endian**, but the
  IP/UDP/DNS wire format is **big-endian (network order)**. Port 53
  (`00 35`) misread as 13568, so the `dstPort != 53` check dropped *every*
  DNS packet and never answered — all sites became unreachable. Fixed in
  `VpnPacket` (new pure, unit-tested helpers) and `DnsPacket`; the service
  now answers every query and non-DNS traffic was never affected (split
  tunnel). Also removed `setBlocking(false)` on the TUN fd, which would have
  made the reader thread spin while idle.
- **Content filter / custom blocklist appeared to do nothing.** Three causes:
  (1) toggles only stage a draft — nothing is enforced until **Save**;
  (2) blocking needs an enforcement path (Safe Browse VPN *or* the system
  accessibility service switched on) and Safe Browse itself was broken
  (above); (3) no on-screen state showed this. The Content filter section now
  shows a live enforcement status line, and the hero text states that Save is
  required. Adult-domain coverage also widened (8 more domains + keywords).

### Added
- **Password always required to save protected sections.** Saving Threat
  intelligence, Scanning, Content filter, Custom blocklist or Safe Browse
  now **always** prompts for the settings password, even within the 5-minute
  unlock window (`EditableSettings.protectionRelevantDiffers`, unit-tested).
  Cosmetic changes (theme, diagnostics) keep the unlock-window convenience.
- Safe Browse **enable** and the MalwareBazaar **Save key** button are now
  password-gated like disable/Save (protected sections marked with a lock
  hint in their titles).
- **Storage & performance** panel moved directly below **Appearance**.

### Changed
- `versionCode`: 36 → 37
- `versionName`: "1.26.0" → "1.27.0"

### Tests
- `VpnPacketTest` (7, incl. real wire-format port-53 regression), 
  `EditableSettingsTest` (5). Full suite green.

## [1.26.0] - 2026-09-28

### Added
- **Scanned-item categorisation.** Every device-scan result now breaks down
  what was scanned: apps split into **system** vs **user-installed**, and files
  split into **APK / archives / executables / scripts / documents / media /
  other** (`ScannedFileCategory`, classified from the extension; magic bytes are
  still verified by the analyzers). Shown in the Device Scan result card.
- **"Scan all files (whole storage)"** setting (Settings → Scanning). When on,
  the DEEP scan walks the **entire shared storage** (skipping the OS-restricted
  `Android/data` & `Android/obb`), includes media and other file types, and uses
  a higher cap (2000 files vs 500). Off by default (targeted sweep is faster).

### Changed
- `ApkFinder.findScanTargets(allFileTypes, fullStorage)` — new scope parameters;
  `FoundFile` now carries a `ScannedFileCategory`.
- `FullScanResult` gains `systemAppsScanned`, `userAppsScanned`,
  `apkFilesScanned`, `archiveFilesScanned`, `executableFilesScanned`,
  `scriptFilesScanned`, `documentFilesScanned`, `mediaFilesScanned`,
  `otherFilesScanned`, `scannedAllFileTypes`.
- `versionCode`: 35 → 36
- `versionName`: "1.25.3" → "1.26.0"

### Tests
- `ScannedFileCategoryTest` (7).

### Notes
- Why a scan could previously show "76 apps, 33 files": the sweep only walked a
  handful of folders and only counted malware-capable extensions, and QUICK mode
  counted only APKs as files. System partitions (`/system`, `/vendor`) and
  app-private data (`/data/data`) remain unreachable without root and are never
  claimed as scanned.

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
