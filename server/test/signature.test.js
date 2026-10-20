import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyBatchSignature } from '../src/signature.js';

function keyPair() {
  return generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
}

function sign(privateKey, data) {
  const s = createSign('SHA256');
  s.update(data);
  s.end();
  return s.sign({ key: privateKey, dsaEncoding: 'der' });
}

test('valid signature verifies', () => {
  const { publicKey, privateKey } = keyPair();
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const data = Buffer.from('{"events":[]}');
  const sig = sign(privateKey, data).toString('base64');
  assert.ok(verifyBatchSignature(spki, data, sig));
});

test('tampered data fails', () => {
  const { publicKey, privateKey } = keyPair();
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const data = Buffer.from('{"events":[]}');
  const sig = sign(privateKey, data).toString('base64');
  assert.ok(!verifyBatchSignature(spki, Buffer.from('{"events":[1]}'), sig));
});

test('garbage signature fails without throwing', () => {
  const { publicKey } = keyPair();
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  assert.ok(!verifyBatchSignature(spki, Buffer.from('x'), 'not-base64!!'));
});
