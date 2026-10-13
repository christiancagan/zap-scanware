# Privacy

MalwareShield is privacy-first and local-first. It has **no telemetry by
default**. Nothing leaves the device unless you explicitly enable a network
feature (feeds, VirusTotal, MalwareBazaar) or enroll the device in a central
dashboard.

## What stays on the device

- Scan history, findings, app inventory, hash index, allow list, and the
  activity log (`files/logs/events.jsonl`), all under the app's private storage.
- The settings password verifier and lockout state, in encrypted Room storage.
- API keys (VirusTotal, MalwareBazaar), encrypted with an Android Keystore
  AES-GCM key.

## Outbound network calls

| Feature | What is sent | Default |
|---|---|---|
| Signature feeds | HTTPS GET of the feed URL | On |
| VirusTotal | File hash (never the file) | On when a key is set |
| VirusTotal upload | File contents for unknown hashes | **Off**, opt-in |
| MalwareBazaar | File hash + Auth-Key | On when a key is set |
| Safe Browse | DNS queries to the upstream resolver (not us) | On |
| Activity reporting | See below | **Off**, opt-in |
| MalwareBazaar mirror | HTTPS GET of recent detections | On when a key is set |

## Activity reporting (central dashboard)

Reporting is **off until the user enrolls** (Settings → Activity reporting) with
a one-time code issued by an organization administrator. When enabled, the app
uploads:

- Event records: timestamp, event type, severity, component, correlation id, and
  a context map containing **counts, verdicts, categories, and SHA-256 hashes
  only**. File names, file paths, full URLs, browsing history, API keys, and
  passwords are never included (enforced by `LogRedactor`).
- A heartbeat: app version, device model/OS, protection flags (VPN running,
  accessibility enabled, overlay granted, all-files access, notifications,
  password configured), feed age, pending count, and chain status.

Reported `URL_BLOCK`/`URL_WARN` events contain the domain only when the
organization enables `domain_reporting`; otherwise they carry the category only.

Turning reporting off (the toggle, `Disconnect`) clears the enrollment token and
stops future uploads. Locally retained logs can be cleared in Settings (this is
password-gated and itself recorded).

## Tamper-evident logging

Activity records are hash-chained and MAC-signed with a non-exportable Keystore
key. Editing, deleting, or reordering records breaks the chain, and clearing the
log writes a `LOG_CLEARED` record that references the cleared sequence number.
The central dashboard verifies chain continuity server-side. This is detection,
not prevention: a rooted device can still erase local data.

## Retention and deletion

- On device: the activity log rotates at 512 KB × 4 files and is purged after 14
  days. The dashboard's default retention is 90 days for events and 30 days for
  heartbeats (configurable per organization).
- Clearing app data removes everything on the device. Organization
  administrators can delete a device's data from the dashboard.

## Contact

Report privacy issues via the repository issue tracker.
