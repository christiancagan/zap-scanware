# Enhancement Plan 8 — Durable hash index, MalwareBazaar per-hash, offline feeds (v1.18.0)

Follow-up to `ENHANCEMENT_PLAN_7.md`. This plan closes the persistence gaps
found in the hash-lifecycle review **and** fixes three real defects in the
MalwareBazaar and offline-feed paths.

## Verified defects this plan fixes

| # | Defect | Evidence | Impact |
|---|--------|----------|--------|
| D1 | Per-hash lookup conflates every non-`ok` status | `MalwareBazaarClient.kt:106` returns `null` for `hash_not_found`, `unauthorized`, and transport errors alike | A revoked Auth-Key looks identical to "clean"; MalwareBazaar coverage silently disappears |
| D2 | Offline mirror **replaces** instead of merges | `MalwareBazaarFeed.kt:86` `byHash = entries.associateBy { … }` | Each sync drops hashes older than the 168 h window, so the mirror decays to only recent detections and older known-malicious hashes are forgotten |
| D3 | No MalwareBazaar rate limiting | Only `vtLimiter` exists in `ReputationService.kt:50` | A deep scan can issue ~500 sequential POSTs (`ApkFinder` `MAX_FILES`) to abuse.ch per run — fair-use/ban risk |
| D4 | Per-app audit stores no hash | `AppScanAudit.kt:59` has only `hashAvailable: Boolean` | The "complete" audit cannot be used to re-run a lookup without re-hashing |
| D5 | Clean-app hashes are not durably stored | Only malicious findings reach Room (`DeviceScanViewModel.kt:70`) | After "Clear cache" every clean app is re-hashed and re-queried, re-spending quota |

## Phase 1 — Durable hash index (fixes D4, D5)

- Extend `AppScanAudit` with `sha256: String` and `hashedMillis: Long`; populate
  in `FullDeviceScanner` where the hash is already computed
  (`FullDeviceScanner.kt:168`, `:248`, `:106`).
- New `core/security/HashIndex.kt` — durable, bounded store in
  `filesDir/hash_index.json`:
  - key: lowercase SHA-256; value: `{packageName, label, path, kind, sizeBytes,
    lastSeenMillis, verdict summary (malicious/positives/total/family/sources),
    bazaarCheckedMillis, vtCheckedMillis}`.
  - Bounded (default 5 000 entries) with LRU-by-`lastSeenMillis` pruning and
    atomic temp-file writes; failures never break a scan.
- Populate on every scan (quick and deep), including clean apps/files, so a
  later recheck needs **no re-hash and no new quota spend** for known hashes.
- `proguard-rules.pro`: keep the new DTO fields for Gson.

**Acceptance:** after a cache clear, a recheck of previously seen apps resolves
from the hash index and issues zero new MalwareBazaar/VirusTotal calls for
hashes already carrying a terminal verdict.

## Phase 2 — MalwareBazaar per-hash (fixes D1, D3)

- Replace the nullable return with a typed outcome in
  `core/network/MalwareBazaarClient.kt`:
  `BazaarOutcome.Found(hash, family, tags)` / `NotFound` / `Unauthorized` /
  `RateLimited` / `Error(message)`.
- Map abuse.ch `query_status` explicitly: `hash_not_found` → `NotFound`,
  `unauthorized` → `Unauthorized`, `quota_exceeded` → `RateLimited`.
- Add a dedicated `RateLimiter` for MalwareBazaar in `ReputationService`
  (conservative default, e.g. 1 request/second sustained) and a per-scan request
  budget; when the budget is exhausted return `RateLimited` instead of issuing
  more calls.
- **Negative cache** for `NotFound` (short TTL, e.g. 7 days) so repeated scans
  do not re-query known-clean hashes.
- Map outcomes into the existing vocabulary: `Unauthorized`/`RateLimited`/`Error`
  become `AppCloudDisposition.FAILED` (or a new `UNAVAILABLE`) with a
  human-readable reason, never silent `null`.
- Surface the last MalwareBazaar outcome in `ReputationReadiness.blockingIssues`
  so a broken key is visible in the UI rather than looking like "no threats".

**Acceptance:** a revoked Auth-Key produces a visible blocking issue and an
explicit failed/unavailable disposition, not a clean verdict; a full deep scan
issues at most the configured MalwareBazaar budget.

## Phase 3 — MalwareBazaar offline mirror (fixes D2)

- Change `MalwareBazaarFeed.refresh` from full replace to **merge with retention**:
  union new detections into `byHash`, keep entries up to `RETENTION_DAYS`
  (default 30), prune by age, enforce `MAX_ENTRIES`.
- Persist `firstSeen`/age so retention is real rather than window-bound.
- Add conditional refresh: send `If-Modified-Since`/ETag when supported and skip
  re-parsing on `304`; track `lastSuccessfulSyncMillis` separately from
  `updatedAt`.
- On `Unauthorized`, keep the previous mirror intact and record the reason
  (never clear good data on failure).
- Add a bounded incremental window (`hours = min(24, sinceLastSync)`) so routine
  syncs are cheap, with a full 168 h backfill on first run or after a gap.
- Expose `retentionDays`, `prunedCount`, and `lastOutcome` in
  `MalwareBazaarFeed.Status` and in the Settings feed-status card.

**Acceptance:** three consecutive syncs never shrink the mirror below the
retention set; a failed sync leaves the previous mirror intact and reports why.

## Phase 4 — Offline URL feeds (signature feeds)

Already solid (HTTPS-only, ETag/304, 5 MB cap, entry caps, optional ECDSA
signature enforcement). Improvements:

- Add a **staleness indicator** to `FeedStatus` (age of last successful sync)
  and surface it in Settings, consistent with the MalwareBazaar mirror.
- Record per-source last-sync/last-error instead of a single aggregate
  `lastError`, so one bad feed does not mask a healthy one.
- Merge `DEFAULT_FEED_URLS` with user-configured URLs (operator feed first,
  user feeds additive) so a project can ship a curated signed feed with no
  configuration.
- Keep failing feeds serving the last good snapshot (already true) — add a test.

## Phase 5 — Recheck UX

- "Recheck" action on a finding and a bulk "Recheck known hashes" action that
  resolves from the hash index (no re-hash) and reports
  *hashes reused / lookups spent / quota saved*.
- Show, per finding, the stored hash and last verdict time so the user can see
  what was checked and when.

## Tests (new)

- `MalwareBazaarOutcomeTest` — `query_status` → outcome mapping, including
  `unauthorized`, `quota_exceeded`, transport error.
- `MalwareBazaarMirrorPolicyTest` — merge, retention pruning, cap, monotonic
  growth across syncs, failure preserves data.
- `HashIndexTest` — insert/lookup/update, LRU pruning, atomic save, recheck
  resolves without network.
- `MalwareBazaarRateLimitTest` — budget respected, `RateLimited` outcome,
  negative cache hit avoids a call.
- `FeedFreshnessTest` — staleness computation and per-source error tracking.

## Risks / non-goals

- Raising retention increases on-device storage for the mirror; keep the 30-day
  default and the 20 000-entry cap, both user-visible in Settings.
- A per-hash MalwareBazaar rate limit will slow large deep scans slightly; the
  budget is configurable and the offline mirror reduces the need for per-hash
  calls over time.
- Non-goals: no file-content upload, no dynamic execution, no claims of complete
  protection.

## Verification

- `./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.
- Unit tests: **148 total, 0 failures**. New suites: `MalwareBazaarOutcomeTest`
  (7), `MalwareBazaarMirrorPolicyTest` (7), `HashIndexTest` (8),
  `MalwareBazaarPacerTest` + `MalwareBazaarNegativeCacheTest` (7),
  `FeedFreshnessTest` (6).
- Bugs caught and fixed during test authoring: org.json throws in JVM unit
  tests (switched the hash index and negative cache to Gson), and date-only
  abuse.ch `first_seen` values failed to parse (added a `LocalDate` path).
- Debug APK: `zap-scanware-debug.apk`, v1.18.0 (build 22), copied to `docs/`.
