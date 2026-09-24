# Enhancement Plan 5 — Cloud queue & signed feeds (v1.15.0)

Follow-up to the QC remediation in `ENHANCEMENT_PLAN_4.md`. This closes the two
items that were documented as open: the VirusTotal quota bottleneck (F5) and
feed integrity / real-signature sourcing (F1/F8).

## 1. Prioritized cloud-lookup queue (F5)

**Problem:** the deep device scan called VirusTotal once per app and per file
while the free tier allows only ~4 requests/minute. Everything after the first
few lookups was silently skipped (`vtSkipped`), so cloud detection effectively
disappeared on large scans.

**Solution:**

- `core/reputation/CloudLookupQueue` — a persistent, prioritized queue of hashes
  awaiting a VirusTotal lookup, stored as JSON in the cache dir (atomic writes).
  - `CloudQueuePolicy` holds the pure merge/dedupe/order/overflow rules
    (`MAX_ITEMS = 500`).
  - `enqueue()` dedupes by hash and keeps the highest priority.
  - `drain()` processes most-urgent first and **stops at the first rate-limited
    request**, leaving the rest queued.
- `core/reputation/ReputationService.check(hash, includeVirusTotal)` — the free
  sources (feeds → cache → MalwareBazaar) run for every item; VirusTotal is only
  spent by the queue. `ReputationVerdict.vtChecked` and the matching
  `ReputationCache` field ensure a local-only verdict never masks a later cloud
  lookup, while still caching local results so MalwareBazaar is not re-queried
  every scan.
- `core/security/FullDeviceScanner` — runs local analysis for all apps/files,
  then enqueues candidates by risk (local MEDIUM+ = 90/80, APKs = 70, apps = 40,
  other files = 20) and drains up to `VT_IN_SCAN_CHECKS` inline. Malicious cloud
  verdicts become findings.
- `data/repository/CloudLookupWorker` — a WorkManager worker (network +
  battery-not-low) that continues the queue in the background in 4-item batches,
  waiting out the rate-limit window within an 8-minute budget, recording
  malicious results to scan history and notifying the user. It reschedules
  itself while items remain.
- `core/reputation/CloudLookupGraph` — process-wide access so the
  framework-constructed worker shares the singleton queue/reputation instances.
- UI: the device-scan summary shows “checked vs queued”; Settings → Threat
  intelligence shows free VT slots and queued lookups with a *Clear cloud queue*
  action.

## 2. Signed feeds & broader bundled baseline (F1/F8)

**Problem:** remote feeds were applied without integrity checks, and the bundled
baseline was tiny, so offline detection was near-zero.

**Solution:**

- `core/signatures/SignatureVerifier` — verifies a detached ECDSA P-256 /
  SHA-256 signature (fixed algorithm, no algorithm-confusion) over the raw feed
  body. Never throws.
- `SignatureFeedManager` — when `BuildConfig.FEED_PUBLIC_KEY` is configured,
  every remote feed **must** carry a valid `X-Zap-Signature` header or it is
  rejected. `FeedStatus` reports `signatureRequired` / `verifiedSources`, shown
  in Settings. Build config wires `FEED_PUBLIC_KEY` from a Gradle property or
  env var (blank ⇒ signatures optional).
- `DEFAULT_FEED_URLS` — single source of truth for an operator-hosted feed
  (empty by default; a project can ship a curated signed feed without code
  changes).
- Expanded `BUNDLED_FEED`: the DEX pattern baseline now uses
  `ThreatScoring.ALL_DEX_PATTERNS` (high-signal primitives included) and the
  suspicious-domain list adds free-DNS/tunneling/paste services frequently
  abused for C2 and payload staging.

## Honest limitations

- The bundled baseline is still a conservative floor, **not** a full signature
  database. Real, frequently-updated intelligence requires an operator to host a
  signed feed and set `FEED_PUBLIC_KEY`. No real malware hashes are fabricated
  into the app.
- The background worker uses its own rate limiter instance when the app graph is
  not installed; VirusTotal still enforces quotas server-side (HTTP 429).
- Deferred lookups make progress over time (~4/min); a very large device may take
  many background runs to fully cover.

## Verification

- `gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.
- Unit tests: **87 total, 0 failures**, including new
  `CloudQueuePolicyTest` (6) and `SignatureVerifierTest` (4).
- Debug APK: `zap-scanware-debug.apk`, v1.15.0, copied to `docs/`.
