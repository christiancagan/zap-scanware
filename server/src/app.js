// Dependency-free HTTP API for the MalwareShield central dashboard.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

import { canonical, digest, verifySequence, GOLDEN } from './chain.js';
import { defaultPolicy, etagFor, applyPolicyEdit, validatePolicyEdit, defaultPolicyValues } from './policy.js';
import { SlidingWindowLimiter } from './rateLimit.js';
import { hashPassword, verifyPassword, validateAdminPassword, randomToken, sha256Hex, sha256B64 } from './auth.js';
import { verifyBatchSignature } from './signature.js';
import { readRawBody, decodeBody, bodyHashB64, BodyTooLarge } from './rawBody.js';
import { pruneStore } from './retention.js';

const SEVERITIES = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL']);
const DAY_MS = 86400000;

function send(res, status, obj, headers = {}) {
  const body = obj === undefined ? '' : JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}
const sendNoContent = (res) => { res.writeHead(204); res.end(); };
const fail = (res, status, code, message) => send(res, status, { error: code, message });

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  const expected = req.headers['x-content-sha256'];
  if (expected && bodyHashB64(raw) !== expected) {
    const e = new Error('hash mismatch');
    e.status = 400;
    e.code = 'hash_mismatch';
    throw e;
  }
  const decoded = decodeBody(raw, req.headers['content-encoding']);
  const text = decoded.toString('utf8');
  try {
    return { raw, json: text ? JSON.parse(text) : {} };
  } catch {
    const e = new Error('invalid json');
    e.status = 400;
    e.code = 'invalid_json';
    throw e;
  }
}

function validateEvent(e) {
  if (typeof e !== 'object' || e === null) return 'event must be an object';
  if (typeof e.timestamp !== 'number') return 'timestamp must be a number';
  if (typeof e.event_type !== 'string' || !e.event_type) return 'event_type required';
  if (!SEVERITIES.has(e.severity)) return 'invalid severity';
  if (typeof e.component !== 'string') return 'component required';
  if (typeof e.seq !== 'number') return 'seq required';
  if (e.schema !== undefined && typeof e.schema !== 'number') return 'schema must be a number';
  if (e.context !== undefined && (typeof e.context !== 'object' || e.context === null || Array.isArray(e.context))) {
    return 'context must be an object';
  }
  if (e.context) {
    for (const v of Object.values(e.context)) {
      if (typeof v !== 'string') return 'context values must be strings';
    }
  }
  return null;
}

function deviceHealth(d, now) {
  if (d.status === 'disconnected') return 'disconnected';
  if (!d.last_seen_at || now - d.last_seen_at > 48 * 3600000) return 'offline';
  const hb = d.last_heartbeat || {};
  if (d.chain_status === 'broken' || hb.integrity_status === 'alert') return 'integrity_alert';
  const f = hb.flags || {};
  if (!f.safe_browse_running || !f.notifications_enabled || d.chain_status === 'empty') return 'degraded';
  return 'protected';
}

function publicDevice(d, now) {
  return {
    id: d.id,
    platform: d.platform,
    model: d.model,
    os_version: d.os_version,
    app_version: d.app_version,
    status: d.status,
    enrolled_at: d.enrolled_at,
    last_seen_at: d.last_seen_at,
    chain_status: d.chain_status,
    last_seq: d.last_seq,
    online: !!d.last_seen_at && now - d.last_seen_at <= 48 * 3600000,
    health: deviceHealth(d, now),
  };
}

export function createApp(store, options = {}) {
  const tokenLimiter = new SlidingWindowLimiter(10, 60000);
  const webDir = options.webDir;

  function findDeviceByToken(req) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return null;
    return store.data.devices.find((d) => d.token_hash === sha256Hex(token) && d.status === 'active') || null;
  }

  function toPolicyDto(p) {
    if (!p) return defaultPolicy();
    return { version: p.version || 1, locked_fields: p.locked_fields || [], values: p.body || defaultPolicyValues() };
  }

  function currentPolicyFor(device) {
    const link = store.data.device_policy.find((x) => x.device_id === device.id);
    const linked = link && store.data.policies.find((p) => p.id === link.policy_id);
    const orgPolicy = store.data.policies.find((p) => p.org_id === device.org_id);
    return toPolicyDto(linked || orgPolicy);
  }

  function adminAuth(req, mutating) {
    const token = parseCookies(req).ms_session;
    if (!token) return null;
    const session = store.data.sessions.find((s) => s.id === sha256Hex(token) && s.expires_at > Date.now());
    if (!session) return null;
    const admin = store.data.admins.find((a) => a.id === session.admin_id);
    if (!admin) return null;
    if (mutating) {
      const csrf = req.headers['x-csrf-token'];
      if (!csrf || csrf !== session.csrf_token) return null;
    }
    return { admin, session };
  }

  function requireRole(auth, roles) {
    return auth && roles.includes(auth.admin.role);
  }

  // ---- Device endpoints ----

  async function handleEnroll(req, res) {
    const { json } = await readJsonBody(req);
    const code = String(json.code || '');
    if (!code) return fail(res, 400, 'missing_code', 'code is required');
    const token = store.data.enrollment_tokens.find((t) => t.code_hash === sha256Hex(code));
    if (!token || token.used_at || token.expires_at < Date.now()) return fail(res, 401, 'invalid_code', 'enrollment code is invalid, used, or expired');
    const deviceToken = randomToken(32);
    const device = {
      id: randomUUID(),
      org_id: token.org_id,
      platform: json.platform || 'android',
      model: json.model || '',
      os_version: json.os_version || '',
      app_version: json.app_version || '',
      token_hash: sha256Hex(deviceToken),
      public_key: json.public_key || null,
      status: 'active',
      enrolled_at: Date.now(),
      last_seen_at: null,
      last_heartbeat: null,
      last_seq: 0,
      last_digest: 'GENESIS',
      chain_start_seq: null,
      chain_status: 'empty',
      policy_version_seen: 0,
    };
    store.data.devices.push(device);
    token.used_at = Date.now();
    token.device_id = device.id;
    const storedPolicy = store.data.policies.find((p) => p.id === token.policy_id) || store.data.policies.find((p) => p.org_id === token.org_id) || null;
    const policyDto = toPolicyDto(storedPolicy);
    if (!store.data.device_policy.some((x) => x.device_id === device.id)) {
      store.data.device_policy.push({ device_id: device.id, policy_id: storedPolicy ? storedPolicy.id : null });
    }
    store.save();
    return send(res, 200, { device_id: device.id, device_token: deviceToken, policy: policyDto, policy_etag: etagFor(policyDto) });
  }

  async function handleHeartbeat(req, res, device) {
    const { json } = await readJsonBody(req);
    device.last_seen_at = Date.now();
    device.last_heartbeat = json;
    if (json.app_version) device.app_version = json.app_version;
    if (json.chain_status) device.chain_status = json.chain_status;
    store.data.heartbeats.push({ device_id: device.id, ts: Date.now(), state: json });
    const policy = currentPolicyFor(device);
    const policyChanged = (policy.version || 1) !== device.policy_version_seen;
    const pending = store.data.commands.filter((c) => c.device_id === device.id && c.status === 'queued');
    for (const c of pending) { c.status = 'sent'; c.sent_at = Date.now(); }
    store.save();
    return send(res, 200, {
      policy_changed: policyChanged,
      commands: pending.map((c) => ({ id: c.id, type: c.type, args: c.args || {} })),
    });
  }

  async function handleEvents(req, res, device) {
    if (!device.public_key) {
      // no signature required
    } else {
      const sig = req.headers['x-batch-signature'];
      const raw = await readRawBody(req).catch(() => null);
      if (raw === null) return fail(res, 413, 'too_large', 'body too large');
      const expectedHash = req.headers['x-content-sha256'];
      if (expectedHash && bodyHashB64(raw) !== expectedHash) return fail(res, 400, 'hash_mismatch', 'body hash mismatch');
      if (!sig || !verifyBatchSignature(device.public_key, raw, sig)) {
        store.data.chain_alerts.push({ id: store.data.chain_alerts.length + 1, device_id: device.id, seq: null, reason: 'invalid batch signature', kind: 'alert', detected_at: Date.now() });
        store.save();
        return fail(res, 401, 'bad_signature', 'batch signature missing or invalid');
      }
      const decoded = decodeBody(raw, req.headers['content-encoding']);
      let json; try { json = JSON.parse(decoded.toString('utf8') || '{}'); } catch { return fail(res, 400, 'invalid_json', 'invalid json'); }
      return processEvents(res, device, json);
    }
    const { json } = await readJsonBody(req);
    return processEvents(res, device, json);
  }

  function processEvents(res, device, json) {
    const events = Array.isArray(json.events) ? json.events : null;
    if (!events) return fail(res, 400, 'invalid_body', 'events array required');
    if (events.length > 200) return fail(res, 413, 'too_many_events', 'at most 200 events per batch');
    for (const e of events) {
      const err = validateEvent(e);
      if (err) return fail(res, 400, 'invalid_event', err);
    }
    let accepted = 0;
    let duplicates = 0;
    const alerts = [];
    const acceptedRecords = [];
    for (const e of events) {
      const existing = store.data.events.find((x) => x.device_id === device.id && x.seq === e.seq);
      if (existing) {
        if (existing.mac === e.mac) {
          duplicates += 1;
        } else {
          alerts.push({ seq: Number(e.seq), reason: 'conflicting mac for existing seq', kind: 'alert' });
        }
        continue;
      }
      store.data.events.push({
        device_id: device.id,
        seq: Number(e.seq),
        ts: Number(e.timestamp),
        event_type: e.event_type,
        severity: e.severity,
        component: e.component,
        correlation_id: e.correlation_id ?? '',
        context: e.context ?? {},
        prev: e.prev ?? '',
        mac: e.mac ?? '',
        schema: Number(e.schema ?? 1),
        received_at: Date.now(),
      });
      accepted += 1;
      acceptedRecords.push(e);
    }
    const state = verifySequence(acceptedRecords, { lastSeq: device.last_seq || 0, lastDigest: device.last_digest || 'GENESIS' });
    for (const a of state.alerts) {
      alerts.push(a);
      store.data.chain_alerts.push({ id: store.data.chain_alerts.length + 1, device_id: device.id, seq: a.seq, reason: a.reason, kind: a.kind, detected_at: Date.now() });
    }
    if (state.lastSeq > (device.last_seq || 0)) {
      if (device.chain_start_seq == null && acceptedRecords.length) device.chain_start_seq = acceptedRecords[0].seq;
      device.last_seq = state.lastSeq;
      device.last_digest = state.lastDigest;
      device.chain_status = alerts.some((a) => a.kind === 'alert') ? 'broken' : 'verified';
    }
    device.last_seen_at = Date.now();
    store.save();
    return send(res, 200, { accepted, duplicates, last_seq: device.last_seq, alerts: alerts.length });
  }

  function handleGetPolicy(req, res, device) {
    const policy = currentPolicyFor(device);
    const etag = etagFor(policy);
    if (req.headers['if-none-match'] === etag) return sendNoContent(res);
    device.policy_version_seen = policy.version || 1;
    store.save();
    return send(res, 200, policy, { etag });
  }

  function handleAck(req, res, url, device) {
    const parts = url.pathname.split('/');
    const cid = parts[5];
    const command = store.data.commands.find((c) => c.id === cid && c.device_id === device.id);
    if (!command) return fail(res, 404, 'not_found', 'command not found');
    command.status = 'done';
    command.acked_at = Date.now();
    store.save();
    return sendNoContent(res);
  }

  function handleDisconnect(req, res, device) {
    device.status = 'disconnected';
    store.save();
    return sendNoContent(res);
  }

  // ---- Admin endpoints ----

  function handleLogin(req, res) {
    return readJsonBody(req).then(({ json }) => {
      const admin = store.data.admins.find((a) => a.email === String(json.email || '').toLowerCase());
      if (!admin || !admin.password_hash || !verifyPassword(String(json.password || ''), admin.password_hash)) {
        return fail(res, 401, 'invalid_credentials', 'email or password is incorrect');
      }
      const token = randomToken(32);
      const csrf = randomToken(16);
      store.data.sessions.push({
        id: sha256Hex(token),
        admin_id: admin.id,
        csrf_token: csrf,
        expires_at: Date.now() + 12 * 3600000,
        created_at: Date.now(),
      });
      store.save();
      const secure = options.secureCookie ? '; Secure' : '';
      const cookie = `ms_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`;
      return send(res, 200, { admin: { id: admin.id, email: admin.email, role: admin.role }, csrf }, { 'set-cookie': cookie });
    });
  }

  function handleLogout(req, res) {
    const token = parseCookies(req).ms_session;
    if (token) {
      store.data.sessions = store.data.sessions.filter((s) => s.id !== sha256Hex(token));
      store.save();
    }
    return send(res, 200, { ok: true }, { 'set-cookie': 'ms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  function listDevices(res) {
    const now = Date.now();
    return send(res, 200, { devices: store.data.devices.map((d) => publicDevice(d, now)) });
  }

  function getDevice(res, id) {
    const now = Date.now();
    const d = store.data.devices.find((x) => x.id === id);
    if (!d) return fail(res, 404, 'not_found', 'device not found');
    return send(res, 200, { ...publicDevice(d, now), last_heartbeat: d.last_heartbeat });
  }

  function deviceEvents(res, id, url) {
    const type = url.searchParams.get('type');
    const sinceSeq = Number(url.searchParams.get('since_seq') || 0);
    const limit = Math.min(500, Number(url.searchParams.get('limit') || 200));
    let list = store.data.events.filter((e) => e.device_id === id && e.seq > sinceSeq);
    if (type) list = list.filter((e) => e.event_type === type);
    list.sort((a, b) => a.seq - b.seq);
    return send(res, 200, { events: list.slice(0, limit), count: Math.min(list.length, limit) });
  }

  function approvalsAndAlerts(res, url) {
    const kind = url.searchParams.get('kind');
    let alerts = [...store.data.chain_alerts];
    if (kind) alerts = alerts.filter((a) => a.kind === kind);
    alerts.sort((a, b) => b.detected_at - a.detected_at);
    return send(res, 200, { alerts: alerts.slice(0, 500) });
  }

  function threats(res) {
    const list = store.data.events
      .filter((e) => (e.event_type === 'detection' || e.event_type === 'download_scan'))
      .filter((e) => String(e.context?.verdict || e.context?.is_malicious || '').toLowerCase().includes('malic') || e.context?.is_malicious === 'true')
      .sort((a, b) => b.received_at - a.received_at)
      .slice(0, 500);
    return send(res, 200, { threats: list });
  }

  function webProtection(res) {
    const counts = { block: {}, warn: {} };
    let blocks = 0;
    let warns = 0;
    for (const e of store.data.events) {
      if (e.event_type === 'url_block') { blocks += 1; const c = e.context?.category || 'UNKNOWN'; counts.block[c] = (counts.block[c] || 0) + 1; }
      if (e.event_type === 'url_warn') { warns += 1; const c = e.context?.category || 'UNKNOWN'; counts.warn[c] = (counts.warn[c] || 0) + 1; }
    }
    return send(res, 200, { blocks, warns, by_category: counts });
  }

  function listPolicies(res) {
    return send(res, 200, { policies: store.data.policies });
  }

  function putPolicy(res, id, json, auth) {
    const err = validatePolicyEdit(json);
    if (err) return fail(res, 400, 'invalid_policy', err);
    let policy = store.data.policies.find((p) => p.id === id);
    if (!policy) return fail(res, 404, 'not_found', 'policy not found');
    const updated = applyPolicyEdit(policy, json);
    policy.version = updated.version;
    policy.locked_fields = updated.locked_fields;
    policy.body = updated.values;
    policy.updated_at = Date.now();
    store.audit('policy.update', id, { version: policy.version }, auth.admin.id);
    store.save();
    return send(res, 200, policy);
  }

  function createEnrollmentToken(res, json, auth) {
    const policy = store.data.policies.find((p) => p.id === json.policy_id) || store.data.policies[0];
    const code = randomToken(24);
    const token = {
      id: randomUUID(),
      org_id: auth.admin.org_id,
      code_hash: sha256Hex(code),
      policy_id: policy ? policy.id : null,
      created_at: Date.now(),
      expires_at: Date.now() + 24 * 3600000,
      used_at: null,
      device_id: null,
    };
    store.data.enrollment_tokens.push(token);
    store.audit('enrollment.create', token.id, null, auth.admin.id);
    store.save();
    return send(res, 200, { id: token.id, code, expires_at: token.expires_at });
  }

  function queueCommand(res, id, json, auth) {
    const types = ['SCAN_NOW', 'SYNC_FEEDS', 'CHECK_PROTECTION', 'DISCONNECT'];
    if (!types.includes(json.type)) return fail(res, 400, 'invalid_command', 'unknown command type');
    const device = store.data.devices.find((d) => d.id === id);
    if (!device) return fail(res, 404, 'not_found', 'device not found');
    const command = { id: randomUUID(), device_id: id, type: json.type, args: json.args || {}, status: 'queued', created_at: Date.now(), sent_at: null, acked_at: null, detail: null };
    store.data.commands.push(command);
    store.audit('command.queue', id, { type: json.type }, auth.admin.id);
    store.save();
    return send(res, 200, { id: command.id, status: command.status });
  }

  function listAudit(res) {
    const list = [...store.data.admin_audit].sort((a, b) => b.at - a.at).slice(0, 500);
    return send(res, 200, { audit: list });
  }

  function getSettings(res) {
    return send(res, 200, { retention_days: store.data.settings.retention_days ?? 90 });
  }

  function putSettings(res, json, auth) {
    const days = Number(json.retention_days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) return fail(res, 400, 'invalid_settings', 'retention_days must be 1..3650');
    store.data.settings.retention_days = Math.floor(days);
    store.audit('settings.update', 'retention_days', { days }, auth.admin.id);
    store.save();
    return send(res, 200, { retention_days: store.data.settings.retention_days });
  }

  function createAdmin(res, json, auth) {
    const email = String(json.email || '').toLowerCase();
    if (!email) return fail(res, 400, 'invalid_admin', 'email required');
    const pwErr = validateAdminPassword(json.password);
    if (pwErr) return fail(res, 400, 'weak_password', pwErr);
    if (store.data.admins.some((a) => a.email === email)) return fail(res, 409, 'exists', 'admin already exists');
    const role = ['owner', 'admin', 'viewer'].includes(json.role) ? json.role : 'viewer';
    const admin = { id: randomUUID(), org_id: auth.admin.org_id, email, password_hash: hashPassword(json.password), role, created_at: Date.now() };
    store.data.admins.push(admin);
    store.audit('admin.create', email, { role }, auth.admin.id);
    store.save();
    return send(res, 200, { id: admin.id, email: admin.email, role: admin.role });
  }

  // ---- Static ----

  function serveStatic(req, res, url) {
    if (!webDir) return fail(res, 404, 'not_found', 'not found');
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    rel = rel.replace(/\.\./g, '');
    const file = join(webDir, rel);
    if (!existsSync(file)) return fail(res, 404, 'not_found', 'not found');
    const ext = extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
    res.end(readFileSync(file));
  }

  // ---- Router ----

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const method = req.method;

    try {
      if (method === 'GET' && !p.startsWith('/v1/')) return serveStatic(req, res, url);

      // Auth
      if (p === '/v1/auth/login' && method === 'POST') return handleLogin(req, res);
      if (p === '/v1/auth/logout' && method === 'POST') return handleLogout(req, res);
      if (p === '/v1/auth/me' && method === 'GET') {
        const auth = adminAuth(req, false);
        return auth ? send(res, 200, { admin: { id: auth.admin.id, email: auth.admin.email, role: auth.admin.role } }) : fail(res, 401, 'unauthorized', 'not signed in');
      }

      // Enroll (no auth)
      if (p === '/v1/enroll' && method === 'POST') return handleEnroll(req, res);

      // Device endpoints
      const deviceMatch = p.match(/^\/v1\/devices\/([^/]+)\/(heartbeat|events|policy|disconnect)$/) || p.match(/^\/v1\/devices\/([^/]+)\/commands\/([^/]+)\/ack$/);
      if (deviceMatch) {
        const device = findDeviceByToken(req);
        if (!device) return fail(res, 401, 'unauthorized', 'invalid device token');
        const limited = tokenLimiter.hit(device.id);
        if (!limited.allowed) return send(res, 429, { error: 'rate_limited', message: 'too many requests' }, { 'retry-after': String(limited.retryAfterSec) });
        const id = deviceMatch[1];
        if (id !== device.id) return fail(res, 403, 'forbidden', 'device id mismatch');
        if (p.endsWith('/heartbeat') && method === 'POST') return handleHeartbeat(req, res, device);
        if (p.endsWith('/events') && method === 'POST') return handleEvents(req, res, device);
        if (p.endsWith('/policy') && method === 'GET') return handleGetPolicy(req, res, device);
        if (p.endsWith('/disconnect') && method === 'POST') return handleDisconnect(req, res, device);
        if (p.endsWith('/ack') && method === 'POST') return handleAck(req, res, url, device);
        return fail(res, 405, 'method_not_allowed', 'method not allowed');
      }

      // Admin endpoints (session + CSRF for mutations)
      const mutating = ['POST', 'PUT', 'DELETE'].includes(method);
      const auth = adminAuth(req, mutating);
      if (!auth) return fail(res, 401, 'unauthorized', 'admin session required');

      if (p === '/v1/devices' && method === 'GET') return listDevices(res);
      if (p === '/v1/alerts' && method === 'GET') return approvalsAndAlerts(res, url);
      if (p === '/v1/threats' && method === 'GET') return threats(res);
      if (p === '/v1/web-protection' && method === 'GET') return webProtection(res);
      if (p === '/v1/policies' && method === 'GET') return listPolicies(res);
      if (p === '/v1/audit' && method === 'GET') return listAudit(res);
      if (p === '/v1/settings' && method === 'GET') return getSettings(res);

      const devEvents = p.match(/^\/v1\/devices\/([^/]+)\/events$/);
      if (devEvents && method === 'GET') return deviceEvents(res, devEvents[1], url);
      const devOne = p.match(/^\/v1\/devices\/([^/]+)$/);
      if (devOne && method === 'GET') return getDevice(res, devOne[1]);

      const policyOne = p.match(/^\/v1\/policies\/([^/]+)$/);
      if (policyOne && method === 'PUT') {
        if (!requireRole(auth, ['owner', 'admin'])) return fail(res, 403, 'forbidden', 'insufficient role');
        const { json } = await readJsonBody(req);
        return putPolicy(res, policyOne[1], json, auth);
      }

      if (p === '/v1/enrollment-tokens' && method === 'POST') {
        if (!requireRole(auth, ['owner', 'admin'])) return fail(res, 403, 'forbidden', 'insufficient role');
        const { json } = await readJsonBody(req);
        return createEnrollmentToken(res, json, auth);
      }

      const cmdMatch = p.match(/^\/v1\/devices\/([^/]+)\/commands$/);
      if (cmdMatch && method === 'POST') {
        if (!requireRole(auth, ['owner', 'admin'])) return fail(res, 403, 'forbidden', 'insufficient role');
        const { json } = await readJsonBody(req);
        return queueCommand(res, cmdMatch[1], json, auth);
      }

      if (p === '/v1/settings' && method === 'PUT') {
        if (!requireRole(auth, ['owner'])) return fail(res, 403, 'forbidden', 'owner role required');
        const { json } = await readJsonBody(req);
        return putSettings(res, json, auth);
      }

      if (p === '/v1/admins' && method === 'POST') {
        if (!requireRole(auth, ['owner'])) return fail(res, 403, 'forbidden', 'owner role required');
        const { json } = await readJsonBody(req);
        return createAdmin(res, json, auth);
      }

      return fail(res, 404, 'not_found', 'not found');
    } catch (err) {
      if (err instanceof BodyTooLarge) return fail(res, 413, 'too_large', 'request body too large');
      if (err && err.status) return fail(res, err.status, err.code || 'error', err.message);
      // eslint-disable-next-line no-console
      console.error('request error', err);
      return fail(res, 500, 'internal', 'internal error');
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('unhandled', err);
      fail(res, 500, 'internal', 'internal error');
    });
  });

  return { server, store, prune: () => pruneStore(store.data) };
}

export { GOLDEN, canonical, digest, defaultPolicy, defaultPolicyValues };
