import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPolicy, canonicalJson, etagFor, applyPolicyEdit, validatePolicyEdit } from '../src/policy.js';

test('canonicalJson sorts keys recursively', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});

test('etag is stable and changes with content', () => {
  const p = defaultPolicy();
  assert.equal(etagFor(p), etagFor(defaultPolicy()));
  assert.notEqual(etagFor(p), etagFor(applyPolicyEdit(p, { values: { scan_mode: 'QUICK' } })));
});

test('applyPolicyEdit bumps version and merges values', () => {
  const p = defaultPolicy();
  const next = applyPolicyEdit(p, { values: { scan_mode: 'QUICK' }, locked_fields: ['scan_mode'] });
  assert.equal(next.version, p.version + 1);
  assert.equal(next.values.scan_mode, 'QUICK');
  assert.deepEqual(next.locked_fields, ['scan_mode']);
});

test('validatePolicyEdit rejects bad input', () => {
  assert.ok(validatePolicyEdit({ values: { scan_mode: 'SIDEWAYS' } }));
  assert.ok(validatePolicyEdit({ values: { category_actions: { ADULT: 'MAYBE' } } }));
  assert.equal(validatePolicyEdit({ values: { scan_mode: 'QUICK' }, locked_fields: ['scan_mode'] }), null);
});
