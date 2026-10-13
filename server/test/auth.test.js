import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validateAdminPassword, sha256Hex, randomToken } from '../src/auth.js';

test('scrypt round trip', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.ok(verifyPassword('correct horse battery staple', stored));
  assert.ok(!verifyPassword('wrong password', stored));
});

test('weak passwords are rejected', () => {
  assert.ok(validateAdminPassword('short'));
  assert.equal(validateAdminPassword('a-very-long-password'), null);
});

test('tokens are unique and hash deterministically', () => {
  const a = randomToken();
  const b = randomToken();
  assert.notEqual(a, b);
  assert.equal(sha256Hex('x'), sha256Hex('x'));
});
