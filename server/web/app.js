// MalwareShield dashboard SPA (no build step). Talks to the API on the same origin.
const app = document.getElementById('app');
const state = { admin: null, csrf: null, view: 'overview', deviceId: null };

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && state.csrf) headers['x-csrf-token'] = state.csrf;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  if (res.status === 401) { state.admin = null; render(); throw new Error('unauthorized'); }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast(msg) { const t = el(`<div class="toast">${esc(msg)}</div>`); document.body.appendChild(t); setTimeout(() => t.remove(), 2500); }

async function boot() {
  try { const me = await api('/v1/auth/me'); state.admin = me.admin; } catch { state.admin = null; }
  render();
}

function renderLogin(error) {
  app.innerHTML = '';
  const box = el(`<div style="max-width:360px;margin:80px auto">
    <div class="card">
      <h2 style="margin-top:0">MalwareShield Dashboard</h2>
      <label>Email</label><input id="email" type="email" autocomplete="username" />
      <label>Password</label><input id="pw" type="password" autocomplete="current-password" />
      <p class="error" id="err">${esc(error || '')}</p>
      <button class="primary" id="go" style="width:100%">Sign in</button>
    </div>
  </div>`);
  box.querySelector('#go').onclick = async () => {
    try {
      const out = await api('/v1/auth/login', { method: 'POST', body: { email: box.querySelector('#email').value, password: box.querySelector('#pw').value } });
      state.admin = out.admin; state.csrf = out.csrf; state.view = 'overview'; render();
    } catch (e) { box.querySelector('#err').textContent = e.message; }
  };
  app.appendChild(box);
}

const VIEWS = ['overview', 'devices', 'threats', 'web', 'integrity', 'policies', 'enrollment', 'audit', 'settings'];

function renderShell() {
  app.innerHTML = '';
  const header = el(`<header>
    <h1>MalwareShield</h1>
    <nav>${VIEWS.map((v) => `<button data-v="${v}" class="${state.view === v ? 'active' : ''}">${v}</button>`).join('')}</nav>
    <span style="flex:1"></span>
    <span class="muted">${esc(state.admin?.email || '')} · ${esc(state.admin?.role || '')}</span>
    <button id="logout" style="border:1px solid var(--border);background:none;color:inherit;padding:6px 10px;border-radius:8px;cursor:pointer">Sign out</button>
  </header>`);
  header.querySelectorAll('nav button').forEach((b) => {
    b.onclick = () => { state.view = b.dataset.v; state.deviceId = null; render(); };
  });
  header.querySelector('#logout').onclick = async () => { await api('/v1/auth/logout', { method: 'POST' }); state.admin = null; state.csrf = null; render(); };
  const main = el('<main id="main">Loading…</main>');
  app.append(header, main);
  return main;
}

async function render() {
  if (!state.admin) return renderLogin();
  const main = renderShell();
  try {
    if (state.view === 'overview') await viewOverview(main);
    else if (state.view === 'devices') await viewDevices(main);
    else if (state.view === 'threats') await viewThreats(main);
    else if (state.view === 'web') await viewWeb(main);
    else if (state.view === 'integrity') await viewIntegrity(main);
    else if (state.view === 'policies') await viewPolicies(main);
    else if (state.view === 'enrollment') await viewEnrollment(main);
    else if (state.view === 'audit') await viewAudit(main);
    else if (state.view === 'settings') await viewSettings(main);
  } catch (e) {
    main.innerHTML = `<div class="card error">${esc(e.message)}</div>`;
  }
}

function set(main, html) { main.innerHTML = html; }

async function viewOverview(main) {
  const [{ devices }, { alerts }] = await Promise.all([api('/v1/devices'), api('/v1/alerts')]);
  const counts = devices.reduce((a, d) => (a[d.health] = (a[d.health] || 0) + 1, a), {});
  set(main, `
    <div class="grid">
      ${['protected', 'degraded', 'integrity_alert', 'offline', 'disconnected'].map((h) => `
        <div class="card"><div class="muted">${h}</div><div class="stat">${counts[h] || 0}</div></div>`).join('')}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Recent integrity alerts</h3>
      ${alerts.slice(0, 8).map((a) => `<div>${esc(new Date(a.detected_at).toLocaleString())} · ${esc(a.kind)} · seq ${esc(a.seq ?? '-')} · ${esc(a.reason)}</div>`).join('') || '<div class="muted">None</div>'}
    </div>`);
}

async function viewDevices(main) {
  const { devices } = await api('/v1/devices');
  if (state.deviceId) return viewDeviceDetail(main, state.deviceId);
  set(main, `<div class="card"><h3 style="margin-top:0">Devices (${devices.length})</h3>
    <table><thead><tr><th>Model</th><th>Platform</th><th>App</th><th>Health</th><th>Chain</th><th>Last seen</th></tr></thead><tbody>
    ${devices.map((d) => `<tr data-id="${d.id}" style="cursor:pointer">
      <td>${esc(d.model || '—')}</td><td>${esc(d.platform)} ${esc(d.os_version)}</td><td>${esc(d.app_version)}</td>
      <td><span class="badge ${d.health}">${d.health}</span></td><td>${esc(d.chain_status)}</td>
      <td>${d.last_seen_at ? esc(new Date(d.last_seen_at).toLocaleString()) : 'never'}</td></tr>`).join('')}
    </tbody></table></div>`);
  main.querySelectorAll('tr[data-id]').forEach((r) => { r.onclick = () => { state.deviceId = r.dataset.id; render(); }; });
}

async function viewDeviceDetail(main, id) {
  const d = await api(`/v1/devices/${id}`);
  const { events } = await api(`/v1/devices/${id}/events?limit=200`);
  const f = d.last_heartbeat?.flags || {};
  set(main, `
    <div class="card"><button id="back" style="border:1px solid var(--border);background:none;color:inherit;border-radius:8px;padding:4px 10px;cursor:pointer">← Devices</button>
      <h3 style="margin:12px 0 4px">${esc(d.model || d.id)}</h3>
      <div class="muted">${esc(d.platform)} ${esc(d.os_version)} · app ${esc(d.app_version)} · <span class="badge ${d.health}">${d.health}</span></div>
      <div class="row" style="margin-top:12px">
        ${['safe_browse_running', 'accessibility_enabled', 'overlay_granted', 'notifications_enabled', 'all_files_access', 'password_configured'].map((k) => `<div class="card" style="flex:1;min-width:130px"><div class="muted">${k}</div><div>${f[k] ? 'yes' : 'no'}</div></div>`).join('')}
      </div>
    </div>
    <div class="card"><h3 style="margin-top:0">Event timeline (${events.length})</h3>
      <table><thead><tr><th>Seq</th><th>Time</th><th>Type</th><th>Sev</th><th>Context</th></tr></thead><tbody>
      ${events.slice().reverse().map((e) => `<tr><td>${e.seq}</td><td>${esc(new Date(e.received_at).toLocaleTimeString())}</td><td>${esc(e.event_type)}</td><td>${esc(e.severity)}</td><td>${esc(JSON.stringify(e.context))}</td></tr>`).join('')}
      </tbody></table></div>`);
  main.querySelector('#back').onclick = () => { state.deviceId = null; render(); };
}

async function viewThreats(main) {
  const { threats } = await api('/v1/threats');
  set(main, `<div class="card"><h3 style="margin-top:0">Threats (${threats.length})</h3>
    <table><thead><tr><th>Time</th><th>Type</th><th>Hash</th><th>Verdict</th></tr></thead><tbody>
    ${threats.map((t) => `<tr><td>${esc(new Date(t.received_at).toLocaleString())}</td><td>${esc(t.event_type)}</td><td>${esc(t.context?.sha256 || '—')}</td><td>${esc(t.context?.verdict || t.context?.threat || '—')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None</td></tr>'}
    </tbody></table></div>`);
}

async function viewWeb(main) {
  const w = await api('/v1/web-protection');
  set(main, `<div class="grid">
      <div class="card"><div class="muted">Blocked</div><div class="stat">${w.blocks}</div></div>
      <div class="card"><div class="muted">Warned</div><div class="stat">${w.warns}</div></div>
    </div>
    <div class="card"><h3 style="margin-top:0">By category</h3>
      <table><thead><tr><th>Category</th><th>Blocked</th><th>Warned</th></tr></thead><tbody>
      ${[...new Set([...Object.keys(w.by_category.block), ...Object.keys(w.by_category.warn)])].map((c) => `<tr><td>${esc(c)}</td><td>${w.by_category.block[c] || 0}</td><td>${w.by_category.warn[c] || 0}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No data</td></tr>'}
      </tbody></table></div>`);
}

async function viewIntegrity(main) {
  const { alerts } = await api('/v1/alerts');
  set(main, `<div class="card"><h3 style="margin-top:0">Integrity alerts (${alerts.length})</h3>
    <table><thead><tr><th>Time</th><th>Device</th><th>Seq</th><th>Kind</th><th>Reason</th></tr></thead><tbody>
    ${alerts.map((a) => `<tr><td>${esc(new Date(a.detected_at).toLocaleString())}</td><td>${esc(a.device_id)}</td><td>${esc(a.seq ?? '—')}</td><td>${esc(a.kind)}</td><td>${esc(a.reason)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">None</td></tr>'}
    </tbody></table></div>`);
}

async function viewPolicies(main) {
  const { policies } = await api('/v1/policies');
  set(main, policies.map((p) => `<div class="card" data-id="${p.id}">
      <h3 style="margin-top:0">${esc(p.name)} <span class="muted">v${esc(p.version)}</span></h3>
      <div class="muted">Locked: ${esc((p.locked_fields || []).join(', ') || 'none')}</div>
      <pre>${esc(JSON.stringify(p.body, null, 2))}</pre>
      <label>Edit values JSON</label>
      <textarea id="edit-${p.id}" rows="6" style="width:100%;font-family:monospace">${esc(JSON.stringify(p.body, null, 2))}</textarea>
      <label>Locked fields (comma separated)</label>
      <input id="lock-${p.id}" value="${esc((p.locked_fields || []).join(','))}" />
      <button class="primary" data-save="${p.id}" style="margin-top:8px">Save policy</button>
    </div>`).join('') || '<div class="card muted">No policies</div>');
  main.querySelectorAll('button[data-save]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.save;
      try {
        const values = JSON.parse(main.querySelector(`#edit-${id}`).value);
        const locked_fields = main.querySelector(`#lock-${id}`).value.split(',').map((s) => s.trim()).filter(Boolean);
        await api(`/v1/policies/${id}`, { method: 'PUT', body: { values, locked_fields } });
        toast('Policy saved'); render();
      } catch (e) { toast(e.message); }
    };
  });
}

async function viewEnrollment(main) {
  set(main, `<div class="card"><h3 style="margin-top:0">Enroll a device</h3>
    <label>Policy (optional)</label><input id="pol" placeholder="policy id" />
    <button class="primary" id="gen" style="margin-top:8px">Create enrollment code</button>
    <div id="out" style="margin-top:12px"></div>
    <p class="muted">The code is shown once, expires in 24 hours, and can be enrolled by one device.</p>
  </div>`);
  main.querySelector('#gen').onclick = async () => {
    try {
      const out = await api('/v1/enrollment-tokens', { method: 'POST', body: { policy_id: main.querySelector('#pol').value || undefined } });
      main.querySelector('#out').innerHTML = `<div class="card"><div class="muted">Enrollment code</div><pre>${esc(out.code)}</pre><div class="muted">Expires ${esc(new Date(out.expires_at).toLocaleString())}</div></div>`;
    } catch (e) { toast(e.message); }
  };
}

async function viewAudit(main) {
  const { audit } = await api('/v1/audit');
  set(main, `<div class="card"><h3 style="margin-top:0">Admin audit</h3>
    <table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>
    ${audit.map((a) => `<tr><td>${esc(new Date(a.at).toLocaleString())}</td><td>${esc(a.action)}</td><td>${esc(a.target)}</td><td>${esc(JSON.stringify(a.detail))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None</td></tr>'}
    </tbody></table></div>`);
}

async function viewSettings(main) {
  const s = await api('/v1/settings');
  set(main, `<div class="card"><h3 style="margin-top:0">Organization settings</h3>
    <label>Event retention (days)</label><input id="ret" type="number" value="${esc(s.retention_days)}" />
    <button class="primary" id="save" style="margin-top:8px">Save</button>
  </div>`);
  main.querySelector('#save').onclick = async () => {
    try { await api('/v1/settings', { method: 'PUT', body: { retention_days: Number(main.querySelector('#ret').value) } }); toast('Saved'); }
    catch (e) { toast(e.message); }
  };
}

boot();
