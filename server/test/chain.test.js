import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, digest, digestEvent, verifySequence, GOLDEN } from '../src/chain.js';

test('golden canonical vector matches the Android format', () => {
  assert.equal(canonical(GOLDEN.event), GOLDEN.canonical);
});

test('digest is stable base64 sha256', () => {
  const d1 = digest(GOLDEN.canonical);
  const d2 = digest(GOLDEN.canonical);
  assert.equal(d1, d2);
  assert.equal(d1, digestEvent(GOLDEN.event));
});

function chainOf(n) {
  let prev = 'GENESIS';
  const out = [];
  for (let i = 1; i <= n; i++) {
    const e = {
      seq: i,
      timestamp: 1000 + i,
      event_type: 'url_block',
      severity: 'WARN',
      component: 'Test',
      correlation_id: `c${i}`,
      prev,
      context: { domain: `site${i}.test` },
      schema: 2,
      mac: 'x',
    };
    out.push(e);
    prev = digestEvent(e);
  }
  return out;
}

test('valid chain has no alerts and advances state', () => {
  const records = chainOf(4);
  const state = verifySequence(records, { lastSeq: 0, lastDigest: 'GENESIS' });
  assert.equal(state.alerts.length, 0);
  assert.equal(state.lastSeq, 4);
});

test('prev mismatch is detected', () => {
  const records = chainOf(3);
  records[2].prev = 'BOGUS';
  const state = verifySequence(records, { lastSeq: 0, lastDigest: 'GENESIS' });
  assert.ok(state.alerts.some((a) => a.reason.includes('prev link mismatch')));
});

test('sequence gap is an alert without a covering log_cleared', () => {
  const records = chainOf(3);
  records[1].seq = 5; // gap
  const state = verifySequence(records, { lastSeq: 0, lastDigest: 'GENESIS' });
  assert.ok(state.alerts.some((a) => a.kind === 'alert' && a.reason.includes('sequence gap')));
});

test('sequence gap is informational when a log_cleared covers it', () => {
  const records = chainOf(3);
  records[1].seq = 5;
  records.push({
    seq: 6,
    timestamp: 9999,
    event_type: 'log_cleared',
    severity: 'WARN',
    component: 'EventLogger',
    correlation_id: 'clr',
    prev: 'GENESIS',
    context: { cleared_through_seq: '4' },
    schema: 2,
    mac: 'y',
  });
  const state = verifySequence(records, { lastSeq: 0, lastDigest: 'GENESIS' });
  const gap = state.alerts.find((a) => a.reason.includes('sequence gap'));
  assert.ok(gap);
  assert.equal(gap.kind, 'info');
});

test('legacy schema 1 records are ignored', () => {
  const records = chainOf(2);
  records.push({ seq: 99, schema: 1, timestamp: 1, event_type: 'x', severity: 'INFO', component: 'c', correlation_id: 'd', prev: '', context: {}, mac: '' });
  const state = verifySequence(records, { lastSeq: 0, lastDigest: 'GENESIS' });
  assert.equal(state.lastSeq, 2);
});
