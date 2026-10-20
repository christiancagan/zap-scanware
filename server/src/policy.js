// Central policy model: defaults, canonical JSON, ETag, and the lock merge.
import { createHash } from 'node:crypto';

export function defaultPolicyValues() {
  return {
    safe_browse_required: true,
    content_filter_enabled: true,
    category_actions: {},
    custom_blocklist: [],
    background_scan_enabled: true,
    download_scan_enabled: true,
    scan_mode: 'DEEP',
    vt_upload_allowed: false,
    domain_reporting: false,
    telemetry_required: false,
  };
}

export function defaultPolicy() {
  return { version: 1, locked_fields: [], values: defaultPolicyValues() };
}

/** Deterministic JSON with recursively sorted keys. */
export function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function etagFor(policy) {
  return 'W/"' + createHash('sha256').update(canonicalJson(policy), 'utf8').digest('base64') + '"';
}

/**
 * Applies a policy edit: replaces the editable fields and bumps the version.
 * Locked fields are advisory to the device; the server stores them verbatim.
 */
export function applyPolicyEdit(current, edit) {
  const values = { ...current.values, ...(edit.values || {}) };
  const locked = Array.isArray(edit.locked_fields) ? [...new Set(edit.locked_fields)] : current.locked_fields;
  return {
    version: (current.version || 1) + 1,
    locked_fields: locked,
    values: { ...defaultPolicyValues(), ...values },
  };
}

/** Validation of a policy edit body. Returns an error string or null. */
const CATEGORY_ACTIONS = ['OFF', 'WARN', 'BLOCK'];

export function validatePolicyEdit(edit) {
  if (typeof edit !== 'object' || edit === null) return 'body must be an object';
  if (edit.values && typeof edit.values !== 'object') return 'values must be an object';
  if (edit.locked_fields && !Array.isArray(edit.locked_fields)) return 'locked_fields must be an array';
  const v = edit.values || {};
  if (v.scan_mode !== undefined && !['QUICK', 'DEEP'].includes(v.scan_mode)) return 'invalid scan_mode';
  if (v.category_actions && typeof v.category_actions === 'object') {
    for (const [k, action] of Object.entries(v.category_actions)) {
      if (!CATEGORY_ACTIONS.includes(action)) return `invalid action for ${k}`;
    }
  }
  if (v.custom_blocklist !== undefined && !Array.isArray(v.custom_blocklist)) return 'custom_blocklist must be an array';
  return null;
}
