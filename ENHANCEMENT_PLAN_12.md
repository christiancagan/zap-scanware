# MalwareShield Enhancement Plan 12
## Activity logging, settings-password integrity, centralized web dashboard

**Date:** October 13, 2026
**Baseline:** v1.45.0 (versionCode 57), Room database v6
**Status:** Implemented as v1.46.0 (versionCode 58, Room v7). Phases 1–4 are
done and verified; Phase 5 (iPhone) is not started. See "Implementation status"
below.
**Scope order:** Option 1 (Android MalwareShield) first. iPhone companion (option 2, limited scope) in Phase 5.

---

## Implementation status (as built)

| Phase | Item | Status |
|---|---|---|
| 1 | Tamper-evident activity log (`EventChain`, batching, rate limits, encrypted chain head) | Done |
| 1 | Logging call sites (downloads, device scans, cloud, feeds, VPN/guard, prompts, settings, password, VT upload, gated clears) | Done |
| 1 | Settings-password integrity (persistent lockout, 600k PBKDF2 + Keystore pepper, `PasswordPolicy`, fail-closed marker, `changePassword`) | Done |
| 1 | Protected-policy seal (`PolicySeal` + `PolicySnapshot`) | Done |
| 1 | Room v6 → v7 migration; removed dead `BackgroundScanWorker`; WARN "Continue" pass fix; `LogRedactor` hash exemption | Done |
| 2 | Dashboard client (`TelemetryStore`/`TelemetryClient`/`TelemetrySync`/`TelemetryWorker`, Settings → Activity reporting) | Done |
| 3 | Server + web dashboard | Done as a **dependency-free Node.js reference** (`server/`) instead of TypeScript/Fastify/PostgreSQL (the build environment has no npm registry access). Wire contract unchanged (`DASHBOARD_API.md`). |
| 4 | Policy sync + command handling (device applies administrator-locked fields; `DISCONNECT`) | Done (poll-based via heartbeat). |
| 4 | Per-device ECDSA signed batches / admin one-time unlock codes / OIDC admin login / Device Admin anti-uninstall | Not implemented (server accepts batch signatures if a public key is enrolled; the app enrolls without one). |
| 5 | iPhone companion (Safari content blocker, Web Risk, imported-file scan) | Not started — requires macOS + Xcode. |

Verification for v1.46.0: 335 JVM unit tests pass; 7 instrumented tests pass on
an Android 14 emulator (4 of them exercise the scanner pipeline on-device with
an EICAR sample); 19 server tests pass; the server passes a live end-to-end
smoke test; and a real device scan (`4 apps hashed · 0 files · 54s`) completed
on-device with correctly hash-chained `app_start`/`scan_start`/`scan_finish`
records in `files/logs/events.jsonl` and no errors.

---

## 1. Current-state audit (verified in source)

### 1.1 Activity logging

The logger is `core/logging/EventLogger`: JSON Lines in `files/logs/events.jsonl`, rotation at 512 KB with 3 backups, 14-day retention, and every field passes through `LogRedactor`. The mechanism works, but coverage is partial.

| Area | Logged today | Gap |
|---|---|---|
| Manual APK scan (`MalwareRepository`) | SCAN_START, SCAN_FINISH, DETECTION | None |
| Scheduled full scan (`ScheduledScanWorker`) | SCHEDULE_TRIGGER, SCAN_FINISH, DETECTION, PROVIDER_ERROR | None |
| Schedule configuration (`ScanScheduler`) | SCHEDULE_CONFIG | None |
| URL check (`UrlScanViewModel`) | URL_CHECK | None |
| Provider keys (`ProviderKeyManager`, `ProviderValidator`) | PROVIDER_KEY, PROVIDER_ERROR | None (key values redacted) |
| Download scanning (`DownloadMonitor`, `DownloadScanWorker`) | Nothing | Background scans are invisible |
| Manual full device scan (`DeviceScanViewModel`, `FullDeviceScanner`) | Nothing (logcat only) | Not in the log |
| Cloud lookup queue (`CloudLookupWorker`) | Nothing | Not in the log |
| Feed refresh (`SignatureFeedWorker`, `SignatureFeedManager`) | Nothing. `SIGNATURE_UPDATE` is defined but never emitted | Not in the log |
| Safe Browse VPN (`SafeBrowseVpnService`) | Nothing persisted. `BlockedDomainLog` is in memory and lost on process death | Start, stop, revoke, and block/warn events are missing |
| Accessibility guard (`UrlGuardAccessibilityService`) | Nothing | Block/warn events are missing |
| Notification actions (Continue once / Block always) | Nothing | User decisions are missing |
| Settings changes, password events, theme | Nothing. `THEME_CHANGE`, `USER_ACTION`, `PERMISSION_CHANGE` are defined but never emitted | Settings history is missing |
| Remove / Allow / Uninstall actions | Nothing | User actions are missing |
| VirusTotal upload | Nothing. `UPLOAD_ATTEMPT` is defined but never emitted | Uploads leave the device with no record |
| Clear logs, clear history, clear cache | No password gate and no record | An audit trail can be erased without a trace |

**Dead code:** `data/repository/BackgroundScanWorker` has no callers (`schedule()` is never invoked) and uses the legacy `APKAnalyzer` path. Remove it in Phase 1.

**Outbound network today:** only VirusTotal, MalwareBazaar, user feed URLs, and the Safe Browse DNS resolvers. No telemetry upload path exists. `telemetryEnabled` exists in preferences but controls nothing.

### 1.2 Settings password (`ConfigLockManager`, `PasswordHasher`, `SettingsViewModel`)

| ID | Finding | Risk |
|---|---|---|
| G1 | 5-attempt lockout and the failed-attempt counter are in memory only. Force-stop or relaunch resets both. | Unlimited guessing through repeated app restarts |
| G2 | PBKDF2-HMAC-SHA256 at 120,000 iterations. The current OWASP recommendation for this algorithm is 600,000. | Weaker offline resistance |
| G3 | The verifier is a plain PBKDF2 output in Room `config_lock` with no device-bound secret. | If the database is extracted (root, backup, rooted device), offline guessing has no device-side barrier |
| G4 | Minimum length 6, no common-password check. | Weak passwords accepted |
| G5 | `verify()` returns `true` when no row exists. Deleting or corrupting the row silently disables the gate, and the UI then offers "Set password". | Fail-open |
| G6 | `createPassword()` overwrites an existing hash without verifying the old password. Only the UI prevents this. | Fail-open at the domain layer |
| G7 | Protected policy (Safe Browse, category actions, custom blocklist, VT key, risk thresholds) is stored as plain DataStore values with no integrity check. | Editing the preferences file changes policy undetected |
| G8 | `LogViewModel.clearLogs()` and `HistoryViewModel.clearHistory()` have no password gate. | The user can erase the audit trail of the actions they took |
| G9 | No record of password events (created, failed, locked out, changed). | Tampering attempts are invisible |
| G10 | `ConfigLockManager.clearPassword()` exists with no UI path. | Future reset path must require verification |

**Android limits (cannot be fixed inside the app):** uninstalling the app, force-stopping it, and disabling the accessibility service or VPN in system Settings. Mitigations are detection, logging, and a dashboard alert (Part C). Device Admin is an option with trade-offs (see section 4.6).

---

## 2. Part A: Activity logging and audit trail

### 2.1 Goals
- Record every background scan, download scan, scheduled scan, manual device scan, cloud lookup, feed refresh, protection-state change, and user action.
- Make the log tamper-evident on the device and verifiable on the dashboard.
- Add no measurable CPU, IO, or battery cost: no per-DNS-query writes, batched disk writes, no main-thread IO.

### 2.2 Event taxonomy

Keep the existing `EventType` constants (the dashboard depends on them). Start emitting the unused ones and add the following.

| Group | Types | Notes |
|---|---|---|
| Scanning | `SCAN_START`, `SCAN_FINISH`, `SCAN_CANCEL`, `DETECTION`, `DOWNLOAD_SCAN`, `CLOUD_DRAIN`, `SCHEDULE_TRIGGER` | Counts and verdicts only. Never file names or paths |
| Protection | `PROTECTION_STATE`, `URL_BLOCK`, `URL_WARN`, `DNS_STATS` | `PROTECTION_STATE` covers Safe Browse start/stop/revoke/boot, accessibility on/off, overlay and all-files grant changes |
| Intelligence | `SIGNATURE_UPDATE`, `UPLOAD_ATTEMPT`, `PROVIDER_ERROR` | `UPLOAD_ATTEMPT` records the hash and decision only; never content or file name |
| User actions | `USER_ACTION` with `action` = `REMOVE_FILE`, `UNINSTALL_REQUEST`, `ALLOW_FINDING`, `RECHECK`, `CLEAR_HISTORY`, `CLEAR_LOGS`, `CLEAR_CACHE`, `BLOCKLIST_ADD`, `BLOCKLIST_REMOVE`, `FEED_URL_ADD`, `FEED_URL_REMOVE`, `THEME_CHANGE`, `PROMPT_CONTINUE_ONCE`, `PROMPT_BLOCK_ALWAYS` | One record per action |
| Settings | `SETTINGS_CHANGE` | Lists changed key names. Shows new values for non-secret keys only; secret keys are `[REDACTED]` |
| Password | `PASSWORD` with `action` = `CREATED`, `VERIFY_OK`, `VERIFY_FAIL`, `LOCKOUT`, `CHANGED`, `CLEARED` | Never the password or hash |
| Integrity | `INTEGRITY_ALERT`, `LOG_CLEARED`, `LOG_DROPPED` | See sections 2.3 and 2.4 |

Each record gets a `schema` field (value 2). The existing v1 lines remain readable.

### 2.3 Tamper-evident record format (schema v2)

Each JSON line adds:
- `seq`: monotonic per-device sequence number.
- `prev`: SHA-256 of the previous record's canonical form (chain link).
- `mac`: HMAC-SHA256 of the canonical form, keyed by a non-exportable Android Keystore key `ms_log_mac`.

The chain head (last `seq` and `mac`) is stored in Keystore-protected preferences. On startup the tail is verified. A mismatch raises `INTEGRITY_ALERT`.

**Clearing logs (gated, see G8):** requires the settings password (`runProtectedStrict`). It writes a `LOG_CLEARED` record containing the last `seq` and `mac`, then starts a new file whose first record links to that `mac`. The removed range is therefore provable: the first record in the new file references a head that is no longer in the file.

**Residual risk (stated honestly):** a root user can delete the whole file and the preferences, and the device can no longer prove what was deleted. Detection depends on the head being stored in Keystore-protected preferences and on the dashboard keeping its own copy of the chain (Part C). On-device logs are detection, not prevention.

### 2.4 Write path (performance)
- One writer coroutine reads from a bounded `Channel<SecurityEvent>(capacity = 512, onBufferOverflow = DROP_OLDEST)`. It flushes every 5 seconds or every 32 events, whichever comes first.
- Callers use a non-suspending `EventLogger.record(...)` (channel `trySend`), so UI and VPN threads never block.
- Dropped events are counted and emitted as one `LOG_DROPPED` record per flush window.
- Rate limiting via `EventRateLimiter` (per type and key, fixed window): `URL_BLOCK` at most once per domain per 60 s; `PROTECTION_STATE` unthrottled.
- VPN per-query events are never logged. The VPN emits one `DNS_STATS` count record every 5 minutes.
- Retention stays at 512 KB x 4 files and 14 days.

### 2.5 Logging points (file-level work list)

| File | Events to add |
|---|---|
| `core/downloads/DownloadMonitor.kt`, `DownloadScanWorker.kt` | `DOWNLOAD_SCAN` start/finish with verdict, SHA-256, type, size. No file name or path |
| `presentation/viewmodel/DeviceScanViewModel.kt`, `core/security/FullDeviceScanner.kt` | `SCAN_START`, `SCAN_FINISH`, `SCAN_CANCEL` with category totals |
| `data/repository/CloudLookupWorker.kt` | `CLOUD_DRAIN` with processed, failed, and rate-limited counts |
| `data/repository/SignatureFeedWorker.kt`, `core/signatures/SignatureFeedManager.kt` | `SIGNATURE_UPDATE` with source, status, entry count, signature verified |
| `core/safebrowse/SafeBrowseVpnService.kt` | `PROTECTION_STATE` (start, stop, revoke, `onTaskRemoved`, boot start); `URL_BLOCK`/`URL_WARN` (domain, category, reason); `DNS_STATS` |
| `core/security/UrlGuardAccessibilityService.kt` | `PROTECTION_STATE` (connected, unbound); `URL_BLOCK`/`URL_WARN` |
| `core/content/WarnActivity.kt`, `BlockActivity.kt`, `PromptActionReceiver.kt`, `PromptOverlay.kt` | `PROMPT_CONTINUE_ONCE`, `PROMPT_BLOCK_ALWAYS` |
| `presentation/viewmodel/SettingsViewModel.kt` | `SETTINGS_CHANGE` from a diff on `applySettings`; `USER_ACTION` for VT key and MalwareBazaar key save (key name only) |
| `core/security/ConfigLockManager.kt` | `PASSWORD` events (all actions, including `LOCKOUT`) |
| `LogViewModel.clearLogs`, `HistoryViewModel.clearHistory`, `CacheManager.clearCache` | `USER_ACTION` / `LOG_CLEARED`; logs and history gated (G8) |
| `MainActivity`, `MalwareShieldApp` | App start with version; `PROTECTION_STATE`/permission changes on `ON_RESUME` (all-files, overlay, notifications, accessibility, VPN consent) |
| `core/reputation/` upload path (`VirusTotalRepository.upload`) | `UPLOAD_ATTEMPT` with hash and decision |
| `data/repository/BackgroundScanWorker.kt` | Delete (dead code) |

### 2.6 Log viewer and export
- Filter chips by group: Scanning, Protection, Intelligence, User, Settings, Password, Integrity.
- Integrity status line: "Chain verified" or "Chain broken at seq N".
- Export stays user-initiated and redacted. Export includes `seq`, `prev`, and `mac`, so the dashboard or an auditor can verify it offline.

### 2.7 Tests (JVM unit tests)
- `EventChainTest`: append and verify; detect edit, delete, and reorder; detect truncation against the stored head.
- `EventRateLimiterTest`: window behavior per key.
- `EventWriterTest`: drop-oldest accounting and `LOG_DROPPED` emission.
- `LogRedactorTest` additions: domain-only output for VPN events; no file names or paths.
- `EventJsonTest` updated for schema v2 (and v1 read compatibility).

---

## 3. Part B: Settings password integrity

### 3.1 Principles
- **Fail closed.** Any integrity mismatch tightens policy and never loosens it.
- **Device-bound verifier.** A Keystore-held secret is required to verify the password, so the database alone is not enough for offline guessing.
- **Limits survive process death.** Attempt counters and lockout deadlines are persisted.
- **Every security-relevant action is logged.**

### 3.2 Changes

| ID | Fix |
|---|---|
| G1 | Persist `failed_count` and `locked_until_ms` in `config_lock` (DB v7, non-destructive migration). Backoff: after 5 failures lock 60 s, then double on each further failure, capped at 15 minutes. Reset on success. |
| G2 | PBKDF2-HMAC-SHA256 at 600,000 iterations. Rehash silently on the next successful verify when the stored iteration count is lower. Target under 1 s on a mid-range device; measure before release. |
| G3 | Store `hash = HMAC-SHA256(ms_pw_pepper, PBKDF2_output)`, where `ms_pw_pepper` is a non-exportable Keystore key. Migrate on the first successful verify after the upgrade. |
| G4 | Minimum 8 characters, maximum 128. Reject an embedded list of about 1,000 common passwords and the app name. Show a strength hint. |
| G5 | At creation, set a Keystore-protected marker `pw_configured=true`. If the marker is set but the row is missing or invalid, enter a `HARD_LOCKED` state: all protected actions are denied, `INTEGRITY_ALERT` is logged, and the only reset is clearing app data (current policy). |
| G6 | Split the API. `createPassword` is allowed only when there is no row and no marker. `changePassword(old, new)` requires verification. Add a "Change password" row to Settings. Log `PASSWORD CHANGED`. |
| G7 | `PolicySeal`: HMAC over the canonical JSON of protected settings, keyed by `ms_policy_mac`, stored with the settings snapshot. On mismatch, load strict defaults (Safe Browse on, content filter on, all categories Block), log `INTEGRITY_ALERT`, show a red banner, and require the password to change anything. |
| G8 | Gate `CLEAR_LOGS` and `CLEAR_HISTORY` with `runProtectedStrict`. `CLEAR_CACHE` stays free, because cache is not audit data. |
| G9 | Log all `PASSWORD` actions from `ConfigLockManager`. |
| G10 | Keep `clearPassword()` unused. If it is ever exposed, it must require the current password. |

**UX:** the lockout message shows the remaining seconds. The "Forgot password?" text states that the only reset is clearing app data, which also erases logs and history. Telemetry-enabled devices (Part C) may optionally use an admin-issued unlock code (section 4.6).

**Parameter summary:** minimum 8 characters; PBKDF2-HMAC-SHA256 with 600,000 iterations; 16-byte salt (raise to 32 bytes if the migration is done anyway); Keystore pepper; lockout backoff as above; unlock window stays at 5 minutes.

### 3.3 Tests
- `PasswordHasherTest` extended: 600k iterations, pepper binding (wrong pepper fails), rehash-on-upgrade path.
- `LockoutPolicyTest` (pure): backoff schedule, reset on success, state restored after simulated restart.
- `PolicySealTest`: tampered snapshot loads strict defaults.
- `ConfigLockIntegrityTest`: marker set and row missing yields `HARD_LOCKED`.
- `CommonPasswordTest`: list rejection and length bounds.

---

## 4. Part C: Centralized web dashboard

### 4.1 Architecture

```
Android device (MalwareShield)                        Dashboard service
+----------------------------------+   HTTPS/TLS     +------------------------------+
| EventLogger (hash-chained)        | -- batches -->  | Ingest API   /v1/devices/... |
| Outbox table (Room)               |                 | Chain check, dedupe          |
| Heartbeat worker (60 min)         | -- heartbeat -> | PostgreSQL                   |
| Policy sync (ETag, on connect)    | <-- policy ----  | Policy service, commands     |
+----------------------------------+                 +--------------^---------------+
                                                                     | OIDC login
                                                     Web dashboard (admins, RBAC)
```

### 4.2 Consent and privacy (must change before Phase 2 ships)
- The project currently states "No telemetry" (AGENTS.md section 10, README). Dashboard reporting is a privacy change and must be **opt-in per device**, with:
  - an in-app disclosure listing exactly what is sent,
  - a switch to turn reporting off (the device then deletes its outbox),
  - an enrollment step that the user completes.
- Publish `PRIVACY.md` at the repo root before enabling reporting.
- **Data minimization defaults:**
  - Sent: device model, Android version, app version, protection-state flags, event records (type, severity, timestamps, verdict, category, SHA-256), scan counts, feed status, chain status.
  - Not sent: file names, file paths, full URLs, app contents, API keys, passwords, secret setting values.
  - Domain reporting for `URL_BLOCK`/`URL_WARN` is off by default and is controlled per organization.

### 4.3 Enrollment and identity
- An admin creates an enrollment token in the dashboard: single use, expires after 24 hours, shown as a QR code.
- The app scans the QR code (or the user pastes the code) and calls `POST /v1/enroll`. The server returns `device_id` and a 256-bit `device_token`. The server stores only a hash of the token.
- The token is stored in the app through the existing `PrivacyCrypto` Keystore encryption.
- Requests use `Authorization: Bearer <token>` and a `X-Content-SHA256` header with the body hash.
- Revoking a device in the dashboard disconnects it. The app shows "Disconnected by administrator". Local protection keeps running.
- Phase 4 adds an optional per-device Keystore EC key. The server stores its public key at enrollment and verifies a signature on each batch (section 4.7).

### 4.4 Transport and delivery
- TLS 1.2 or higher with certificate pinning, following the existing `network_security_config` pattern. Pin the dashboard CA or intermediate with a backup pin.
- Batches: at most 200 events or 256 KB, gzip-compressed.
- **At-least-once delivery.** Each event carries `(device_id, seq)`. The server deduplicates on the primary key `(device_id, seq)`. The app deletes outbox rows only after a 2xx response.
- Outbox: Room table `outbox_events` (`seq` primary key, serialized JSON, `created_at`). Capacity 5,000 rows. When full, the oldest non-integrity rows are dropped first. `INTEGRITY_ALERT` and `PASSWORD` rows are dropped last.
- Scheduling: WorkManager periodic work every 60 minutes while events are pending, with a `CONNECTED` constraint. A one-off request is sent immediately on `INTEGRITY_ALERT`. Reuse the existing wifi-only setting as an option.
- Backoff: exponential, capped at 6 hours.
- **Heartbeat (every 60 minutes, or piggybacked on a batch):** app version; flags for Safe Browse running, accessibility enabled, overlay granted, all-files access, notifications allowed, VT key configured; feed age; outbox depth; chain status; password configured; integrity status.

### 4.5 Central policy and commands
- **Policy sync:** `GET /v1/devices/{id}/policy` with `If-None-Match`. Most responses are 304. Sync runs every 6 hours, or when a heartbeat response carries `policy_changed=true`.
- **Policy fields** (mapped onto `EditableSettings`): `safe_browse_required`, `content_filter_enabled`, `category_actions`, `custom_blocklist` (merged with the local list), `background_scan_enabled`, `download_scan_enabled`, `scan_mode`, `vt_upload_allowed` (default false), `domain_reporting`, `telemetry_required`.
- **Precedence:** organization-locked fields cannot be changed on the device. The UI shows "Managed by your administrator". The local password still gates all other settings.
- **Commands** (server to device, delivered in the heartbeat response, acknowledged by `POST .../commands/{id}/ack`): `SCAN_NOW`, `SYNC_FEEDS`, `CHECK_PROTECTION`, `DISCONNECT`.
- **Not supported:** remote uninstall or remote wipe. Android does not allow silent uninstall.

### 4.6 Password and central control interaction
- **Option A (default):** the local password stays. Locked policy fields can only be changed by the administrator.
- **Option B (decision needed):** an admin-issued one-time unlock code (signed, 15-minute expiry, logged on both sides) to reset the password without wiping data. Requires the device to be enrolled and reachable.
- **Device Admin for anti-uninstall (decision needed):** not recommended for consumer use. It adds Play review friction and a stronger user-facing permission.

### 4.7 Dashboard server

**Recommended stack (decision needed):**
- Backend: Node.js 22, TypeScript, Fastify, Zod schemas, PostgreSQL 16, Drizzle ORM. Alternative: Kotlin with Ktor, if one language across the stack is preferred.
- Dashboard UI: Next.js (or Vite and React), TanStack Query, shadcn/ui, Recharts. Light and dark themes to match the app. Responsive layout.
- Auth: OIDC (Google, Microsoft, or Auth0) for admins. RBAC roles: owner, admin, viewer. Every admin action is written to an audit table.
- Deployment: Docker Compose (api, web, postgres, reverse proxy with TLS). Nightly database backups.

**Data model (outline):**
```
orgs(id, name, created_at)
admins(id, org_id, subject, role)
devices(id, org_id, platform, model, os_version, app_version, token_hash,
        signing_pubkey NULL, status, enrolled_at, last_seen_at, telemetry_enabled)
device_events(device_id, seq, ts, type, severity, component, correlation_id,
              context JSONB, prev_mac, mac, received_at,
              PRIMARY KEY(device_id, seq))            -- partitioned by month
heartbeats(device_id, ts, state JSONB)
chain_alerts(id, device_id, seq, reason, detected_at)
policies(id, org_id, version, body JSONB, updated_at)
device_policy(device_id, policy_id, etag)
commands(id, device_id, type, status, created_at, acked_at)
enrollment_tokens(id, org_id, token_hash, expires_at, used_at)
admin_audit(id, admin_id, action, target, at)
```

**Server-side chain check:** on ingest, verify that `prev_mac` matches the stored `mac` of the previous `seq` for that device. A gap or mismatch creates a `chain_alerts` row and a red badge. The server does not hold the device's MAC key, so it checks chain shape, not MAC validity. Phase 4 signed batches add origin authenticity.

**Retention:** events 90 days by default (configurable per organization), heartbeats 30 days. Per-device export and deletion are supported.

**Limits:** request body at most 256 KB compressed; at most 200 events per batch; 10 requests per minute per device token; JSON Schema validation. Unknown event types are stored as `UNKNOWN` with the raw type, not dropped.

### 4.8 API v1

| Method | Path | Caller | Purpose |
|---|---|---|---|
| POST | `/v1/enroll` | app | Exchange enrollment token for `device_id`, `device_token`, policy |
| POST | `/v1/devices/{id}/heartbeat` | app | Protection state; returns commands and `policy_changed` |
| POST | `/v1/devices/{id}/events` | app | Batch of events (gzip), idempotent |
| GET | `/v1/devices/{id}/policy` | app | Policy with ETag |
| POST | `/v1/devices/{id}/commands/{cid}/ack` | app | Command result |
| POST | `/v1/devices/{id}/disconnect` | app | User-initiated unenroll |
| GET | `/v1/devices` | dashboard | Fleet list and health |
| GET | `/v1/devices/{id}/events?type=&since=&cursor=` | dashboard | Timeline |
| GET | `/v1/alerts` | dashboard | Integrity and threat alerts |
| GET/PUT | `/v1/policies/{id}` | admin | Policy editor |
| POST | `/v1/enrollment-tokens` | admin | Create enrollment token and QR |
| POST | `/v1/devices/{id}/commands` | admin | Queue a command |
| GET | `/v1/audit` | admin | Admin audit log |

The API contract moves to `DASHBOARD_API.md` in Phase 3, as the source for the server implementation.

### 4.9 Dashboard pages
1. **Overview:** devices by health (protected, degraded, integrity alert, offline more than 48 hours); threats in the last 24 hours; blocked and warned count; feed freshness.
2. **Devices:** filterable table. Device detail shows the protection checklist, event timeline, scans, heartbeat history, and outbox depth.
3. **Threats:** detections with score, category, SHA-256, and VT summary. File names are hidden by default.
4. **Web protection:** BLOCK and WARN counts by category. Domains shown only if domain reporting is enabled.
5. **Integrity:** chain alerts, lockouts, policy seal mismatches, log clears.
6. **Policies:** editor with per-field lock toggles; assignment per device group.
7. **Enrollment:** create tokens, QR codes, list active tokens.
8. **Admin:** audit log, retention settings, roles, OIDC configuration.

### 4.10 Device performance budget
- Idle: at most one network call per 60 minutes (the heartbeat); none when nothing changed.
- Events are batched in memory and written to disk at most once per 5 seconds.
- Uploads run only on a connected network and respect the wifi-only setting.
- Gzip payloads. No polling. No persistent socket.
- Targets to verify on a test device: under 1 MB per day of idle traffic; under 1% battery per day added; no main-thread IO (StrictMode in debug builds).

---

## 5. Phased delivery

| Phase | Proposed version | Scope | Exit criteria |
|---|---|---|---|
| 1 | 1.46.0 | Part A (logging coverage, hash chain, rate limits, dead-code removal) and Part B (G1-G9) | Unit tests green. Every user action produces a record. Chain verify passes. Forced tamper is detected. Lockout survives force-stop. |
| 2 | 1.47.0 | Telemetry agent: consent UI, outbox, enrollment client, heartbeat, batch upload, `PRIVACY.md` | Enrollment works against staging. Offline queueing and dedupe verified. Telemetry off produces no network traffic. |
| 3 | 2.0.0 (server 0.1) | Dashboard MVP: ingest, chain check, fleet, timeline, integrity alerts | Live events visible in the dashboard within 2 minutes. Injected chain break produces an alert. |
| 4 | 2.1.0 | Central policy with locks, commands, OIDC and RBAC, admin audit, signed batches, optional unlock codes | Policy lock enforced in the app. Command round-trip under 60 minutes on an idle device. |
| 5 | 2.2.0 (iOS companion, limited) | SwiftUI or Kotlin Multiplatform app: URL check via Web Risk, Safari Content Blocker for blocklists, scan of imported files, heartbeat and events via the same API | Runs on iOS 17 and later. Store review notes state the iOS limits. No claim of other-app scanning or app blocking. |

Each release follows the publishing rules in AGENTS.md: bump `versionCode` and `versionName`, run `testDebugUnitTest assembleDebug assembleRelease`, stage the APK in `docs/`, refresh `docs/index.html`, add a CHANGELOG entry, commit. This plan file is not published to `docs/`, because that folder is served publicly by GitHub Pages.

---

## 6. Documentation changes
- `AGENTS.md` section 10 ("No telemetry") changes to describe opt-in reporting, in Phase 2.
- `README.md`: privacy section and dashboard section.
- New `PRIVACY.md`: what is sent, retention, deletion, consent.
- New `DASHBOARD_API.md` in Phase 3: API contract from section 4.8.
- `CHANGELOG.md`: one entry per phase.
- In-app Guide: Activity log, Password (including lockout and reset), Dashboard enrollment.

---

## 7. Risks and constraints
- **Google Play policy:** Accessibility, VPN, overlay (`SYSTEM_ALERT_WINDOW`), full-screen intent, and background work each need declarations. A dashboard that receives browsing-derived data increases review scrutiny. Consider sideload distribution for the dashboard feature, or a separate build flavor.
- **Privacy law:** GDPR and similar laws apply. Monitoring employees needs a legal basis, a data processing agreement, and clear notice. Opt-in per device is required.
- **Safe Browsing API** is non-commercial only. Use **Web Risk** (100,000 lookups per month free, commercially usable) for a commercial deployment.
- **VirusTotal public API** is non-commercial. A fleet product needs a commercial VT license.
- **Rooted or ADB attacker** can still wipe app data. On-device integrity is detection, not prevention. The dashboard's remote chain record is the stronger control.
- **Offline devices** buffer up to 5,000 events. Older low-priority events can be dropped when the buffer is full.
- **iOS limits:** no access to other apps, no app blocking, no background file scanning. Scope is limited to Safari content blocking, URL checks, and scanning of files the user imports.

---

## 8. Decisions needed

1. **Dashboard stack:** TypeScript (Fastify, Next.js) recommended, or Kotlin (Ktor).
2. **Hosting:** self-hosted Docker Compose, or managed cloud.
3. **Tenancy:** single organization first (recommended), or multi-tenant from the start.
4. **Domain reporting default:** off (recommended).
5. **Password reset:** keep no-recovery (current policy), or add admin one-time unlock codes in Phase 4.
6. **Anti-uninstall via Device Admin:** no (recommended), or yes.
7. **Distribution:** sideload through the docs site, or Google Play.

---

## Appendix A: Event record v2 example

```json
{"schema":2,"seq":1042,"ts":1760350000123,"type":"URL_BLOCK","severity":"WARN",
 "component":"SafeBrowseVpnService","corr":"a1b2c3d4",
 "ctx":{"domain":"example-bad.test","category":"GAMBLING","action":"BLOCK","reason":"custom blocklist"},
 "prev":"<base64 sha256 of record 1041>","mac":"<base64 hmac of record 1042>"}
```

## Appendix B: Changes by phase at a glance

- **Phase 1:** `EventLogger` (channel writer, chain, rate limiter), new `EventType` values, logging calls in 15 files, `ConfigLockManager`/`PasswordHasher` (G1-G6, G9), `PolicySeal` (G7), gated clears (G8), DB v7 migration, delete `BackgroundScanWorker`.
- **Phase 2:** `TelemetryConsent`, `OutboxDao`/`outbox_events` (DB v8), `EnrollmentClient`, `HeartbeatWorker`, `OutboxUploadWorker`, Settings "Activity reporting" section, `PRIVACY.md`.
- **Phase 3:** server repository (`api/`, `web/`, `docker-compose.yml`), `DASHBOARD_API.md`.
- **Phase 4:** `PolicySyncWorker`, policy lock UI, command handler, OIDC, RBAC, signed batches.
- **Phase 5:** iOS companion project, Safari Content Blocker extension, Web Risk client, shared API client.
