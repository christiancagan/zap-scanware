// Entry point: bootstrap org/policy/admin, start the API, run retention hourly.
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { Store } from './store.js';
import { defaultPolicy } from './policy.js';
import { hashPassword, validateAdminPassword } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || join(__dirname, '..', 'data', 'store.json');
const PORT = Number(process.env.PORT || 8080);
const secureCookie = process.env.NODE_ENV === 'production';

const store = new Store(DATA_FILE);

if (store.data.orgs.length === 0) {
  const org = { id: randomUUID(), name: process.env.ORG_NAME || 'Default', retention_days: 90, created_at: Date.now() };
  store.data.orgs.push(org);
  store.data.policies.push({
    id: randomUUID(),
    org_id: org.id,
    name: 'Default policy',
    version: 1,
    locked_fields: [],
    body: defaultPolicy().values,
    updated_at: Date.now(),
  });
  store.save();
  console.log(`Created org "${org.name}" with a default policy`);
}

if (store.data.admins.length === 0) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const pwErr = validateAdminPassword(password);
    if (pwErr) {
      console.error(`ADMIN_PASSWORD rejected: ${pwErr}`);
    } else {
      store.data.admins.push({
        id: randomUUID(),
        org_id: store.data.orgs[0].id,
        email: email.toLowerCase(),
        password_hash: hashPassword(password),
        role: 'owner',
        created_at: Date.now(),
      });
      store.save();
      console.log(`Created owner admin ${email}`);
    }
  } else {
    console.warn('No admins exist and ADMIN_EMAIL/ADMIN_PASSWORD are not set. Set them to create an owner.');
  }
}

const app = createApp(store, { webDir: join(__dirname, '..', 'web'), secureCookie });

setInterval(() => {
  try {
    app.prune();
    store.save();
  } catch (e) {
    console.error('retention error', e);
  }
}, 3600000).unref?.();

app.server.listen(PORT, () => {
  console.log(`MalwareShield dashboard API listening on http://localhost:${PORT}`);
});
