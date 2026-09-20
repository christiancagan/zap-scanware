# Enhancement Plan 3 — Scanner Cleanup, URL Guard, UI Modernization & Download Scanning

Status: **implemented** (see §9 Implementation log)
Owner: Zap Scanware engineering
Related: `ENHANCEMENT_PLAN.md`, `ENHANCEMENT_PLAN_2.md`, `AGENTS.md`

## 1. Objective

Four workstreams:

1. **Remove "Scan any file"** from the APK scanner (redundant with APK + device
   scan).
2. **Modernize the URL Validator** and add **pre-open link protection** (check a
   site before it loads, to catch accidental clicks on malicious links).
3. **Modernize History, Scheduled Scans and User Guide** pages.
4. **Auto-scan downloaded files** so a freshly downloaded file is checked before
   the user opens it.

---

## 2. Item 1 — Remove "Scan any file"

### Current state
`ScanScreen` has two paths: APK scanning (picker + "Find APKs on this device")
and a redundant **"Scan any file"** section with a "Select any file" button.
`MainActivity` wires `anyFilePicker` → `handlePickedAnyFile` →
`MalwareScannerViewModel.startFileScan` → `MalwareRepository.scanGenericFile`.

### Change
- `ScanScreen`: delete the "Scan any file" section, the `onPickAnyFile`
  parameter, and the `FileResultCard`/`fileScanResult` UI usage.
- `MainActivity`: remove `anyFilePicker`, `handlePickedAnyFile`, and the
  `onPickAnyFile = { anyFilePicker.launch("*/*") }` argument.
- **Keep** `MalwareScannerViewModel.startFileScan` / `fileScanResult` and
  `MalwareRepository.scanGenericFile` — they are reused by Item 4 (download
  scanning).
- Keep the Scan screen focused: APK picker + on-device APK finder + result card.

### Files
`presentation/screens/ScanScreen.kt`, `presentation/MainActivity.kt`.

---

## 3. Item 2 — URL Validator redesign + pre-open link protection

### 3a. Modern design
`URLValidatorScreen` is currently plain. Redesign with the shared components
(`GradientCard`, `IconBadge`, `ModernButton`, `SectionHeader`, `ThreatBadge`):
- Gradient hero with the shield icon and a one-line purpose.
- Large **safety-score ring/gauge** (0–100) with colour band (safe/warn/danger).
- Result cards: SSL/TLS, domain reputation, active-content/malware warnings,
  and a "What was checked" list.
- Inline quick actions: **Open safely** (after validation), **Copy**, **Scan a
  shared link**.
- Move the safety-score computation off the main thread (currently
  `SuspiciousURLChecker.getSafetyScore` runs `URLValidator.validateURL` during
  composition — see the audit in `ENHANCEMENT_PLAN.md`).

### 3b. Browser control — reality check

**Does the project already have browser control? Partially.**

| Capability | Exists? | Where |
|---|---|---|
| Read the URL of the page you're viewing | Yes (best-effort) | `UrlGuardAccessibilityService` reads on-screen text |
| Notify on risky site | Yes | same service |
| Block a category / risky site | Yes (soft) | same service → `BlockActivity` |
| Category filter (adult/gambling/piracy/…) | Yes | `core/content/ContentFilter` |
| **Intercept every link *before* it opens in any app** | **No** | — |

Android does **not** let a normal app intercept links opened in another browser
unless it is (a) the **default browser** (role), (b) a **VpnService** filtering
network/DNS, or (c) an **accessibility overlay**. Registering `ACTION_VIEW`
only applies when the user chooses our app to open the link.

### 3c. Recommended approach for "scan before open"

Implement a **Safe Browse DNS filter via `VpnService`** (system-wide, no root):

```
core/safebrowse/
├── SafeBrowseVpnService.kt   // VpnService + foreground notification
├── DnsFilter.kt              // parse DNS queries, classify domain
└── SafeBrowseController.kt   // start/stop, settings, status
```

- The VPN captures **DNS queries**, classifies the domain via `ContentFilter`
  (categories + malware feeds + custom blocklist), and returns NXDOMAIN/block
  for blocked domains → the browser/app never connects. This is the realistic
  "scan before open".
- Granularity: **domain/SNI**, not full URL path (no MITM — privacy preserved).
- Requires `BIND_VPN_SERVICE` permission and one-time user consent; runs as a
  foreground service (persistent notification).
- Play policy: allowed for security/antivirus apps; must be clearly disclosed.
- Keep the existing accessibility guard as a **fallback/second layer** (it can
  catch on-screen URLs the VPN cannot, and vice-versa).
- Add a **"Check links on share"** flow (already partly present via the
  `ACTION_SEND` share target) so shared links are validated before opening.

### 3d. Settings/UI
- New **Safe Browse** card in Settings: enable, status, blocked-domain counter,
  and a link to grant VPN consent.
- URL Validator gains a "Protect all links (Safe Browse)" shortcut.

### Files (new + touched)
New: `core/safebrowse/*`, settings UI additions.
Touched: `presentation/screens/URLValidatorScreen.kt`,
`presentation/viewmodel/UrlScanViewModel.kt`, `AndroidManifest.xml`,
`presentation/screens/SettingsScreen.kt`, `presentation/viewmodel/SettingsViewModel.kt`.

### Risks
- VpnService is the most complex addition; must handle lifecycle, IPv4/IPv6,
  and avoid breaking the user's connectivity.
- Play review requires justification for `VpnService`.
- DNS-only blocking can be bypassed by DoH/DoT-enabled browsers (document).

---

## 4. Item 3 — Modernize History, Scheduled Scans, User Guide

### 4a. History
Already has filter chips. Add:
- Gradient hero with total/malicious/clean stats and an icon.
- Redesigned `HistoryItem` cards: threat badge, file-type chip, signature name,
  timestamp, and a delete action; empty state illustration/text.
- Optional: group by date.

### 4b. Scheduled Scans
Already uses a gradient hero + section headers. Add:
- Status hero with a **live "next run" countdown** and active/paused pill.
- Recurrence as a **segmented control**; clearer time picker card.
- Constraint rows as icon cards; explanatory footnote card.

### 4c. User Guide
- **Fix outdated content**: it still describes username/password accounts
  (auth is biometric-only) and a "bottom bar" (navigation is now a drawer).
- Modern layout: gradient header, **searchable** sections, an icon per section,
  and a "quick links" row (Scan, Validate, History).
- Add sections for the new features: multi-format scanning, Quick/Deep modes,
  reputation pipeline, content filter, download scanning.

### Files
`presentation/screens/HistoryScreen.kt`, `ScheduleScreen.kt`, `GuideScreen.kt`,
shared components in `presentation/ui/components/`.

---

## 5. Item 4 — Auto-scan downloaded files

### Goal
When a file finishes downloading, scan it automatically (format analysis +
reputation) and notify if malicious — before the user opens it.

### Recommended design
```
core/downloads/
├── DownloadMonitor.kt        // observes new files
├── DownloadScanWorker.kt     // WorkManager job: analyze + reputation
└── DownloadScanNotifier.kt   // "Downloaded file is safe/malicious" notification
```

- **Detection sources** (belt-and-braces):
  1. `ContentObserver` on `MediaStore.Downloads.EXTERNAL_CONTENT_URI`
     (API 29+) — most reliable for modern Android.
  2. `DownloadManager.ACTION_DOWNLOAD_COMPLETE` broadcast (dynamically
     registered) — catches DownloadManager downloads.
  3. Fallback: periodic WorkManager scan of the Downloads folder (reuses
     `ApkFinder`), for devices/APIs where observation misses.
- On a new file → enqueue a unique `DownloadScanWorker` with the URI/path.
- Worker runs `ScanDispatcher.dispatch` + `ReputationService.check`, persists a
  history row, and posts a notification (safe / suspicious / malicious).
- Deduplicate by (path, size, mtime) and cap file size (reuse analyzer caps).

### Permissions/storage
- `POST_NOTIFICATIONS` (already declared).
- Reading other apps' downloads on API 30+ needs `MANAGE_EXTERNAL_STORAGE`
  (already declared) or SAF; MediaStore observation itself is unrestricted.
  Document graceful degradation when the permission is absent.

### Settings/UI
- Toggle **"Scan downloaded files"** (default ON) and reuse the notifications
  toggle.
- Show download-scan results in History (scanType `download`).

### Files (new + touched)
New: `core/downloads/*`.
Touched: `MalwareShieldApp.kt` (register monitor), `AndroidManifest.xml`,
`core/storage/PreferenceManager.kt` (toggle), `presentation/screens/SettingsScreen.kt`,
`presentation/viewmodel/SettingsViewModel.kt`.

---

## 6. Phases

| Phase | Deliverable | Effort |
|---|---|---|
| 1 | Remove "Scan any file" (Item 1) | S |
| 2 | URL Validator modern redesign (Item 2a) | M |
| 3 | Modernize History / Schedule / Guide + fix guide content (Item 3) | M |
| 4 | Download scanning via observer + worker + notification (Item 4) | M–L |
| 5 | Safe Browse VpnService DNS filter + settings + fallback guard (Item 2b) | L–XL |
| 6 | Docs, tests, publish | S |

Suggested order: 1 → 3 → 2a → 4 → 2b (VPN last; highest complexity/policy risk).

---

## 7. Testing
- Unit: `DnsFilter` classification, download dedup/caps, safety-score
  computation extracted to a pure function.
- Manual: pick APK (no any-file UI), validate URLs, scheduled scan UI, simulate
  a download and confirm notification + history row.
- Regression: `./gradlew testDebugUnitTest assembleDebug`.

## 8. Cross-cutting
- **Privacy**: DNS filter sees only hostnames; no content inspection; log
  redaction retained. Document what leaves the device.
- **Battery**: DNS filter is lightweight; download scans are bounded and
  WorkManager-constrained.
- **Play policy**: `VpnService` and `MANAGE_EXTERNAL_STORAGE` both need clear
  core-purpose justification.
- **Publish**: follow `AGENTS.md` release policy (version bump + APK + docs +
  push) once implemented.

## 9. Implementation log

Implemented in the suggested order. Verified with
`./gradlew testDebugUnitTest assembleDebug`.

### Phase 1 — Remove "Scan any file"
- `ScanScreen`: removed the "Scan any file" section, the `onPickAnyFile` param,
  the `fileScanResult` UI and the `FileResultCard`; hero retitled "APK scanner".
- `MainActivity`: removed `anyFilePicker`, `handlePickedAnyFile` and the
  `onPickAnyFile` argument. Backend (`startFileScan`/`scanGenericFile`) kept for
  download scanning.

### Phase 2 — Modern History / Schedule / Guide
- `HistoryScreen`: gradient stats hero, filter chips, richer item cards
  (`ThreatBadge` + type chip + signature + timestamp), empty state.
- `ScheduleScreen`: status hero with a **live next-run countdown**, recurrence
  as filter chips, constraint icon rows, footnote card.
- `GuideScreen`: gradient header, **search field**, per-section icons, and a
  content rewrite — removed the outdated username/password + bottom-bar text,
  added sections for Quick/Deep modes, multi-format analysis, reputation,
  Safe Browse, and download scanning.

### Phase 3 — URL Validator redesign
- `SuspiciousURLChecker.scoreOf(result)` — pure scoring from an existing result
  (no network).
- `UrlScanViewModel` computes the safety score **off the main thread** and
  exposes `safetyScore`; `URLValidatorScreen` redesigned with a gradient hero,
  `SafetyScoreIndicator`, SSL/reputation/warning cards, and no longer calls the
  network during composition.

### Phase 4 — Auto-scan downloads
- `core/downloads/`: `DownloadMonitor` (MediaStore.Downloads observer +
  `DownloadManager.ACTION_DOWNLOAD_COMPLETE`), `DownloadScanWorker` (format
  analysis + reputation, persists to history, notifies), `DownloadScanNotifier`.
- `PreferenceManager.downloadScanEnabled` (default ON); Settings toggle added.
- Registered in `MalwareShieldApp` (with a new notification channel).

### Phase 5 — Safe Browse (link protection)
- `core/safebrowse/DnsPacket` — pure DNS wire helpers (question parse + response
  build), unit-tested.
- `SafeBrowseVpnService` — DNS-filtering `VpnService`: routes only DNS into the
  tunnel, classifies each queried name via `ContentFilter`, returns NXDOMAIN for
  blocked/malware names, forwards the rest upstream. Manifest service entry with
  `BIND_VPN_SERVICE`.
- Settings "Safe Browse" card (VPN consent launcher + live blocked counter).

### Tests
`DnsPacketTest` (4) added; full suite green.

### Known limitations
- Safe Browse is **name/domain granularity** (no TLS interception) and can be
  bypassed by browsers using DoH/DoT.
- The VPN runs without a foreground-service promotion (kept alive by the system
  while active); may be killed under extreme memory pressure.
- Download scanning depends on `MANAGE_EXTERNAL_STORAGE`/MediaStore visibility;
  degrades gracefully.

