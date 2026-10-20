# MalwareShield Dashboard (server)

Centralized web dashboard backend for the MalwareShield Android app: it receives
redacted, hash-chained activity from enrolled devices, verifies chain integrity,
stores policy, and serves an admin UI.

See `../DASHBOARD_API.md` for the full API contract and `../ENHANCEMENT_PLAN_12.md`
(section 4) for the design.

## Implementation note

`ENHANCEMENT_PLAN_12.md` proposed TypeScript + Fastify + PostgreSQL. This build
environment is offline, so this is a **dependency-free reference implementation**:
Node.js built-in modules only (`node:http`, `node:crypto`, `node:zlib`), a JSON
file store, and the built-in `node --test` runner. The pure logic (chain,
policy, rate limit, auth, signature) is isolated in small modules so it can be
ported to Fastify + PostgreSQL without changing behaviour. The wire contract in
`DASHBOARD_API.md` is identical either way.

## Requirements

- Node.js 20+ (developed on 26). No `npm install` needed.

## Run

```
cd server
cp .env.example .env        # then edit
node src/index.js
```

Then open http://localhost:8080 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(created on first start when no admins exist).

Environment variables: `PORT`, `DATA_FILE`, `ORG_NAME`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `NODE_ENV` (set to `production` to mark the session cookie
Secure behind HTTPS).

## Test

```
cd server
npm test          # or: node --test
```

## Layout

```
server/
  src/
    chain.js       canonical form + digest + chain verification (golden vector)
    policy.js      policy defaults, canonical JSON, ETag, edit validation
    rateLimit.js   sliding-window limiter
    auth.js        scrypt admin passwords, session tokens, hashing helpers
    signature.js   ECDSA P-256 batch signature verification
    rawBody.js     body capture, gzip decode, X-Content-SHA256
    retention.js   event/heartbeat retention
    store.js       JSON-file store
    app.js         HTTP router (device + admin endpoints, static UI)
    index.js       bootstrap + start
  web/             dashboard SPA (vanilla JS, no build step)
  test/            node --test suites
```

## Security notes

- Device tokens and enrollment codes are stored only as SHA-256 hashes.
- Admin passwords use scrypt (N=16384, r=8, p=1) with a per-password salt.
- Device POST bodies are checked against `X-Content-SHA256`; devices enrolled
  with a public key must sign every batch (`X-Batch-Signature`).
- The server verifies the event-chain shape (sequence continuity and prev links)
  but not the per-record MAC, which is device-key-only.
- Serve behind HTTPS and set `NODE_ENV=production`. Put a reverse proxy in front
  and restrict network access; there is no built-in TLS.
- Replace the JSON store with PostgreSQL for real deployments (see the data
  model in `ENHANCEMENT_PLAN_12.md`, section 4.7).
