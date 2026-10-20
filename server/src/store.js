// Tiny JSON-file-backed store. A reference implementation: swap for Postgres
// in production (see README). All collections are plain arrays.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function empty() {
  return {
    orgs: [],
    admins: [],
    sessions: [],
    enrollment_tokens: [],
    devices: [],
    events: [],
    chain_alerts: [],
    heartbeats: [],
    policies: [],
    device_policy: [],
    commands: [],
    admin_audit: [],
    settings: { retention_days: 90 },
  };
}

export class Store {
  constructor(path) {
    this.path = path;
    this.data = empty();
    if (path && existsSync(path)) {
      try {
        this.data = { ...empty(), ...JSON.parse(readFileSync(path, 'utf8')) };
      } catch {
        this.data = empty();
      }
    }
  }

  save() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data), 'utf8');
  }

  audit(action, target, detail, adminId = null) {
    this.data.admin_audit.push({ id: this.data.admin_audit.length + 1, admin_id: adminId, action, target, detail: detail ?? null, at: Date.now() });
  }
}
