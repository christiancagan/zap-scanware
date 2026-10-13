# MalwareShield Dashboard API

Contract between the MalwareShield Android app (device role) and the central
web dashboard (`server/`). See `ENHANCEMENT_PLAN_12.md` section 4 for the design
and `/server/README.md` for how to run the reference implementation.

Base URL is configured on the device (Settings → Activity reporting). All bodies
are JSON (`application/json; charset=utf-8`). Errors use
`{"error": "<code>", "message": "<text>"}` with an appropriate HTTP status.

## Trust and transport

- Use HTTPS in production. The reference server does not terminate TLS itself.
- Device requests authenticate with `Authorization: Bearer <device_token>`.
- Every device POST carries `X-Content-SHA256: <base64 sha256 of the raw request
  bytes as received>` (before gzip decompression). Mismatch → `400 hash_mismatch`.
- Bodies may be gzip-compressed (`Content-Encoding: gzip`). Caps: 512 KB on the
  wire, 256 KB uncompressed for `/events`, at most 200 events per batch.
- A device enrolled with a public key must also send
  `X-Batch-Signature: <base64 DER ECDSA P-256/SHA-256 signature over the raw
  received bytes>` on every `POST /events`. Missing/invalid → `401 bad_signature`
  and a chain alert.
- Per device token rate limit: 10 requests/minute → `429` with `Retry-After`.
- Admin requests use a session cookie (`ms_session`, HttpOnly, SameSite=Strict)
  plus `X-CSRF-Token` on every POST/PUT/DELETE.

## Device endpoints

### POST /v1/enroll  (no auth)

```json
{ "code": "<enrollment code>", "platform": "android", "model": "Pixel 6",
  "os_version": "14", "app_version": "1.46.0", "public_key": "<base64 SPKI DER EC P-256 or \"\">" }
```

`200`:

```json
{ "device_id": "<uuid>", "device_token": "<base64url 32 bytes>",
  "policy": <policy>, "policy_etag": "<etag>" }
```

Codes are single-use, expire after 24 h, and are stored only as SHA-256.
Unknown/used/expired → `401 invalid_code`.

### POST /v1/devices/{id}/heartbeat

```json
{ "sent_at": 1760000000000, "app_version": "1.46.0",
  "flags": { "safe_browse_running": true, "accessibility_enabled": false,
             "overlay_granted": true, "all_files_access": false,
             "notifications_enabled": true, "vt_key_configured": false,
             "password_configured": true },
  "feed_age_hours": 5, "outbox_depth": 12, "chain_status": "verified",
  "integrity_status": "ok", "last_scan_at": 1759990000000 }
```

`200`:

```json
{ "policy_changed": false,
  "commands": [ { "id": "<uuid>", "type": "SCAN_NOW", "args": {} } ] }
```

Queued commands are returned once and marked sent. Types: `SCAN_NOW`,
`SYNC_FEEDS`, `CHECK_PROTECTION`, `DISCONNECT`.

### POST /v1/devices/{id}/events

Event object keys (exactly): `timestamp` (int ms), `event_type`, `severity`
(`DEBUG|INFO|WARN|ERROR|CRITICAL`), `component`, `correlation_id`, `context`
(object of strings), `schema` (int, 2 for chained), `seq` (int), `prev`,
`mac`.

`200`: `{ "accepted": n, "duplicates": n, "last_seq": n, "alerts": n }`.
Idempotent on `(device_id, seq)`: same seq + same `mac` = duplicate; same seq +
different `mac` = tamper alert (the conflicting record is not stored).

### GET /v1/devices/{id}/policy

`200` with `ETag`, or `304` when `If-None-Match` matches.

### POST /v1/devices/{id}/commands/{cid}/ack

```json
{ "status": "DONE", "detail": "optional" }
```
`204`.

### POST /v1/devices/{id}/disconnect

`204`. The device token stops working; status becomes `disconnected`.

## Policy object

```json
{ "version": 3, "locked_fields": ["scan_mode", "content_filter_enabled"],
  "values": { "safe_browse_required": true, "content_filter_enabled": true,
    "category_actions": { "GAMBLING": "BLOCK" }, "custom_blocklist": ["bad.example"],
    "background_scan_enabled": true, "download_scan_enabled": true,
    "scan_mode": "DEEP", "vt_upload_allowed": false,
    "domain_reporting": false, "telemetry_required": false } }
```

`ETag = sha256(canonical JSON of the policy)`. The device enforces only the
fields listed in `locked_fields`.

## Event-chain verification rules

The device hash-chains each record. Canonical form (identical on device and
server):

```
canonical(e) = f(seq) f(timestamp) f(event_type) f(severity) f(component)
               f(correlation_id) f(prev) f(contextSize)
               ( f(key) f(value) for each key in ascending UTF-16 order )
f(x)         = `${x.length}:${x}|`
digest(c)    = base64( sha256( utf8(c) ) )
```

Golden vector: `seq=1, timestamp=1000, event_type="url_block", severity="WARN",
component="Test", correlation_id="c1", prev="GENESIS",
context={"domain":"site1.test","action":"BLOCK"}` →

```
1:1|4:1000|9:url_block|4:WARN|4:Test|2:c1|7:GENESIS|1:2|6:action|5:BLOCK|6:domain|10:site1.test|
```

The server cannot verify the per-record `mac` (the key is device-only). It
verifies: sequence continuity within the device stream; each record's `prev`
equals `digest(canonical(previous record))` using the stored last digest; a gap
is an `alert` unless a `log_cleared` record's `context.cleared_through_seq`
covers it (then `info`); the device's first accepted record sets the chain start
(any `seq`/`prev`). Alerts are visible under Integrity.

## Admin endpoints

Session + CSRF required. Roles: `viewer` (read), `admin` (manage, except
settings/admins), `owner` (all).

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/login` | `{email,password}` → `{admin, csrf}` + session cookie |
| POST | `/v1/auth/logout` | End the session |
| GET | `/v1/auth/me` | Current admin |
| GET | `/v1/devices` | Fleet list with `health` |
| GET | `/v1/devices/{id}` | Device + last heartbeat |
| GET | `/v1/devices/{id}/events?type=&since_seq=&limit=` | Timeline (seq cursor) |
| GET | `/v1/alerts` | Chain alerts (newest first) |
| GET | `/v1/threats` | Detection/download findings |
| GET | `/v1/web-protection` | Block/warn counts by category |
| GET | `/v1/policies` | Policy list |
| PUT | `/v1/policies/{id}` | `{values, locked_fields}`; bumps version |
| POST | `/v1/enrollment-tokens` | `{policy_id?}` → `{code, expires_at}` (shown once) |
| POST | `/v1/devices/{id}/commands` | `{type, args}` |
| GET | `/v1/audit` | Admin audit log |
| GET/PUT | `/v1/settings` | `{retention_days}` (PUT owner only) |
| POST | `/v1/admins` | `{email, password, role}` (owner only) |

`health` ∈ `protected | degraded | integrity_alert | offline | disconnected`.
Every mutating admin action is written to the admin audit log.
