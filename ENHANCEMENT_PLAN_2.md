# Enhancement Plan 2 — Reputation Pipeline & Content Category Control

Status: **implemented** (see §9 Implementation log)
Owner: Zap Scanware engineering
Related: `ENHANCEMENT_PLAN.md` (multi-format analysis), `MALWARE_ENGINES.md`,
`AGENTS.md` (release policy)

## 1. Objective

Close the three gaps found in the functionality assessment:

1. **Apps → reputation**: hash *every* installed app and refer the hash to
   the reputation pipeline (feeds → MalwareBazaar → VirusTotal), not just
   permission-score them.
2. **Files → reputation**: refer every scanned file's hash to the same
   pipeline during the full device scan (not only the manual scan path).
3. **Content category control**: detect and (optionally) block/notify on
   categories such as adult, gambling, violence, drugs, piracy — not just
   malware/phishing domains.

## 2. Design

### 2.1 Shared reputation service (`core/reputation/`)
One place for hash reputation, used by both the manual scan path and the
device scan:

```
core/reputation/
├── ReputationVerdict.kt   // hash, malicious, positives/total, sources, family
├── ReputationCache.kt     // JSON cache (cacheDir), 24h TTL, capped, thread-safe
├── RateLimiter.kt         // sliding-window limiter (VirusTotal free tier)
└── ReputationService.kt   // feeds → cache → MalwareBazaar → VirusTotal
```

- Order (cheapest/offline first): bundled/downloaded feeds → cache →
  MalwareBazaar (keyless) → VirusTotal (keyed, rate-limited).
- VirusTotal free tier is ~4 req/min; [RateLimiter] caps calls and marks the
  verdict `vtSkipped` when throttled. Cached verdicts avoid repeat calls.
- No file contents are uploaded for hash lookups (privacy model unchanged).

### 2.2 Apps & files (`core/security`, `data/repository`)
- `InstalledAppScanner` returns **all** installed apps (with `apkPath`), not
  only the suspicious ones.
- `FullDeviceScanner` hashes each app's `sourceDir` and each storage file and
  calls [ReputationService]; findings carry `vtPositives`/`vtTotal`.
- `MalwareRepository` delegates VirusTotal lookups to [ReputationService] so
  there is a single, rate-limited path.
- `DeviceScanViewModel` persists malicious findings to scan history.

### 2.3 Content category control (`core/content/`)
```
core/content/
├── ContentCategory.kt      // ADULT, GAMBLING, VIOLENCE, DRUGS, PIRACY, MALWARE
├── CategoryClassifier.kt   // bundled domain lists + keyword heuristics
└── ContentFilter.kt        // settings + classifier + malware feed → verdict
```
- `ContentFilter.evaluate(domain)` returns `blocked`, matched `categories`,
  and a reason.
- User settings (DataStore): enable, blocked category set, action
  (`NOTIFY`/`BLOCK`), custom domain blocklist.
- Enforcement in `UrlGuardAccessibilityService`:
  - always posts a category notification;
  - when action is `BLOCK`, launches `BlockActivity` (full-screen warning) and
    performs `GLOBAL_ACTION_BACK` to leave the page.

### 2.4 UI
- New `BlockActivity` (Compose) with a warning, matched category, "Go back"
  and "Proceed anyway".
- `SettingsScreen` gains a **Content filter** section: enable toggle, action
  chips, category chips, custom blocklist editor.

## 3. Data / schema
- `DeviceFinding` + `vtPositives`, `vtTotal`.
- No Room schema change (reuses `fileType`/`threatName` from v2).
- DataStore keys: `content_filter_enabled`, `blocked_categories`,
  `content_action`, `custom_blocklist`.
- Optional feed schema v3 (category domains) is **deferred**; bundled lists +
  user blocklist ship now.

## 4. Permissions & policy
- Reuses `BIND_ACCESSIBILITY_SERVICE` (already declared).
- `BlockActivity` is `exported="false"`, `excludeFromRecents`, `noHistory`.
- No VPN service / root required (chosen approach avoids `VpnService` complexity
  and Play policy risk). Documented limitation: enforcement depends on the
  accessibility service being enabled and on the browser exposing the URL.

## 5. Privacy
- Only hashes and domains are processed; no page content is stored.
- Category lists are local; custom blocklist stays on-device.
- VT calls remain opt-in via the build-time API key.

## 6. Phases
| Phase | Deliverable |
|---|---|
| A | Reputation service + cache + rate limiter |
| B | App/file hashing + reputation in device scan; persist findings |
| C | Content categories + classifier + filter + settings storage |
| D | Accessibility enforcement, BlockActivity, Settings UI |
| E | Docs + tests + publish |

## 7. Testing
- `RateLimiterTest` (window/throttle), `CategoryClassifierTest` (keywords,
  domains, benign), `ReputationVerdictTest`/cache round-trip.
- Regression: `./gradlew testDebugUnitTest assembleDebug`.

## 8. Risks / limitations
- Keyword category classification is heuristic and can false-positive/negative;
  it is a starting point, not a substitute for a curated feed.
- Accessibility URL coverage is best-effort per browser.
- VT rate limits mean not every hash is checked live; cache + feeds cover the
  rest and `vtSkipped` is surfaced.
- Blocking is a soft block (user can proceed) to avoid trapping users.

## 9. Implementation log

Implemented and verified (`./gradlew testDebugUnitTest assembleDebug` →
BUILD SUCCESSFUL, **59 unit tests / 0 failures**).

### Phase A — reputation service (`core/reputation/`)
- `ReputationVerdict.kt`, `RateLimiter.kt` (sliding window),
  `ReputationCache.kt` (JSON cache, 24h TTL, capped 5000, thread-safe),
  `ReputationService.kt` — pipeline: feeds → cache → MalwareBazaar →
  VirusTotal (4/min rate limit; `vtSkipped` when throttled). Single shared path.

### Phase B — apps & files
- `InstalledAppScanner` now returns **all** apps (`DeviceScanResult.apps`) with
  `apkPath`, in addition to the suspicious subset.
- `FullDeviceScanner` hashes each app `sourceDir` and each storage file and runs
  `ReputationService`; findings carry `vtPositives`/`vtTotal` and reputation
  reasons. Progress: apps 0–30%, app reputation 30–50%, files 50–100%.
- `MalwareRepository` delegates VirusTotal to `ReputationService` (single
  rate-limited path) and gained `recordDeviceFinding(...)`.
- `DeviceScanViewModel` persists malicious findings to scan history
  (`device-app` / `device-file`).

### Phase C — content categories (`core/content/`)
- `ContentCategory.kt` (ADULT, GAMBLING, VIOLENCE, DRUGS, PIRACY, MALWARE,
  CUSTOM), `CategoryClassifier.kt` (bundled domain lists + keyword heuristics),
  `ContentFilter.kt` (classifier + malware feeds + custom blocklist + settings).
- `PreferenceManager`: `contentFilterEnabled`, `contentAction`
  (`NOTIFY`/`BLOCK`), `blockedCategories`, `customBlocklist`.

### Phase D — enforcement & UI
- `UrlGuardAccessibilityService` evaluates each visible URL via `ContentFilter`;
  always notifies with the matched category; on `BLOCK` it navigates back and
  launches `BlockActivity`.
- `BlockActivity` (Compose, `exported=false`, `excludeFromRecents`, `noHistory`)
  registered in the manifest.
- `SettingsScreen`: new **Content filter (browsing)** section (enable, action
  chips, category chips) and **Custom blocklist** editor; `SettingsViewModel`
  exposes the flows/setters.
- Updated accessibility service description string.

### Tests
`RateLimiterTest` (3), `CategoryClassifierTest` (5), plus the earlier 51 →
**59 tests, 0 failures**.

### New files
```
core/reputation/  ReputationVerdict.kt, RateLimiter.kt, ReputationCache.kt, ReputationService.kt
core/content/     ContentCategory.kt, CategoryClassifier.kt, ContentFilter.kt
presentation/     BlockActivity.kt
app/src/test/.../core/reputation/RateLimiterTest.kt
app/src/test/.../core/content/CategoryClassifierTest.kt
```

### Known limitations (documented)
- VirusTotal free-tier quota (~4/min) means only the first few hashes per minute
  are checked live; feeds + MalwareBazaar + cache cover the rest and `vtSkipped`
  is surfaced in reasons.
- Category classification is keyword/domain heuristic — a starting point, not a
  curated feed. Feed schema v3 (category domains) remains deferred.
- Blocking depends on the accessibility service being enabled and on the
  browser exposing the URL; it is a soft block (user can dismiss).

