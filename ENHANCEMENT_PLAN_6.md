# Enhancement Plan 6 — Full MalwareBazaar integration (v1.16.0)

## Problem

The previous MalwareBazaar integration was a **keyless** single-hash lookup
(`query=get_info`). abuse.ch has since made the `Auth-Key` header **mandatory**
for every API request (free at https://auth.abuse.ch/), so the lookup was
effectively broken — it returned `query_status = "unauthorized"` on real
devices. There was also no use of MalwareBazaar's richest asset: its labelled
recent-detections stream, which can seed a real offline signature cache.

## What was implemented

### 1. Auth-Key support

- `core/network/MalwareBazaarClient`: `MalwareBazaarApiService` now sends
  `Auth-Key` on `getFileInfo`, and `lookupHash(api, sha256, authKey)` requires a
  non-blank key (returns null otherwise — never throws).
- `core/storage/PreferenceManager`: new `malwareBazaarAuthKey` flow + setter.
  The key is stored **encrypted** (Android Keystore via `PrivacyCrypto`), never
  plaintext, and decrypted only in memory.
- Callers pass the key: `ReputationService.check` and both `MalwareRepository`
  scan paths.

### 2. Recent-detections signature mirror (real offline hashes)

- `core/signatures/MalwareBazaarFeed`: pulls `recent_detections` (up to 168 h
  lookback), validates/lowercases SHA-256, and persists
  `{sha256, signature/family, tags, first_seen}` to `filesDir/mb_signatures.json`
  (survives cache clears). `isKnown(hash)` / `familyOf(hash)` / `status()`.
- `MalwareBazaarFeedParser` — pure, unit-tested conversion with SHA-256
  validation, dedupe and a 20 000-entry cap.
- `SignatureFeedManager` now merges this mirror: `isKnownMaliciousHash` returns
  true for hashes in the URL/bundled feeds **or** the MalwareBazaar mirror, so
  every existing offline check path benefits. Added
  `refreshMalwareBazaar(key)` and `malwareBazaarStatus()`; `FeedStatus` reports
  `malwareBazaarHashCount`.
- Constructors: `SignatureFeedManager` keeps a Hilt primary constructor and adds
  a convenience secondary `constructor(context)` so framework workers are
  unchanged.

### 3. Scheduling & UI

- `SignatureFeedWorker` (daily) now also refreshes the MalwareBazaar mirror when
  a key is configured and Bazaar is enabled.
- Settings → Threat intelligence: masked **Auth-Key** field with *Save key* /
  *Sync now*, plus live mirror count and error line. Feed-status card shows
  MalwareBazaar hash count.
- Saving a key triggers an immediate signature sync.

## Honest limitations

- MalwareBazaar now requires a free Auth-Key; without it, per-scan lookups and
  the mirror are skipped (the UI states this).
- `recent_detections` is a rolling window (max 168 h) of family-labelled
  samples; the mirror is refreshed daily and capped at 20 000 entries — it
  complements, not replaces, a full AV signature database.
- The mirror is advisory community data; it is combined with local analysis and
  other sources, never used as the sole verdict.

## Verification

- `gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.
- Unit tests: **92 total, 0 failures**, including new
  `MalwareBazaarFeedParserTest` (5).
- Debug APK: `zap-scanware-debug.apk`, v1.16.0, copied to `docs/`.
