// Tamper-evident event-chain verification for the MalwareShield dashboard.
//
// This MUST match the Android EventChain canonical form byte for byte:
//   canonical(e) = field(seq) field(timestamp) field(event_type) field(severity)
//                  field(component) field(correlation_id) field(prev)
//                  field(contextSize) ( field(key) field(value) for each key
//                  in ascending UTF-16 code-unit order )
//   field(x)     = `${x.length}:${x}|`   (JS string length = UTF-16 units)
//   digest(c)    = base64( sha256( utf8(c) ) )
//
// The server cannot verify the per-record MAC (it has no device key); it
// verifies sequence continuity and the prev-link chain instead.

import { createHash } from 'node:crypto';

/** Golden canonical string used by both the Android and server tests. */
export const GOLDEN = {
  event: {
    seq: 1,
    timestamp: 1000,
    event_type: 'url_block',
    severity: 'WARN',
    component: 'Test',
    correlation_id: 'c1',
    prev: 'GENESIS',
    context: { domain: 'site1.test', action: 'BLOCK' },
  },
  canonical:
    '1:1|4:1000|9:url_block|4:WARN|4:Test|2:c1|7:GENESIS|1:2|6:action|5:BLOCK|6:domain|10:site1.test|',
};

function field(x) {
  const s = String(x);
  return `${s.length}:${s}|`;
}

export function canonical(e) {
  const ctx = e.context || {};
  const keys = Object.keys(ctx).sort();
  let out = ''
    + field(e.seq)
    + field(e.timestamp)
    + field(e.event_type)
    + field(e.severity)
    + field(e.component)
    + field(e.correlation_id ?? '')
    + field(e.prev ?? '')
    + field(keys.length);
  for (const k of keys) {
    out += field(k) + field(ctx[k]);
  }
  return out;
}

export function digest(canonicalStr) {
  return createHash('sha256').update(canonicalStr, 'utf8').digest('base64');
}

export function digestEvent(e) {
  return digest(canonical(e));
}

/**
 * Verifies a batch of chained records against the stored device state.
 * @param {Array} records - schema>=2 records, in submission order.
 * @param {{lastSeq:number,lastDigest:string}} prior - stored state (lastSeq 0 = new device).
 * @returns {{alerts:Array<{seq:number,reason:string,kind:string}>, lastSeq:number, lastDigest:string}}
 */
export function verifySequence(records, prior) {
  const alerts = [];
  let lastSeq = Number(prior?.lastSeq ?? 0);
  let lastDigest = prior?.lastDigest ?? 'GENESIS';
  const chained = records.filter((e) => Number(e.schema) >= 2);

  // A LOG_CLEARED record explains a jump in sequence numbers.
  const clearedThrough = chained
    .filter((c) => c.event_type === 'log_cleared')
    .map((c) => Number(c.context?.cleared_through_seq ?? -1))
    .reduce((a, b) => Math.max(a, b), -1);

  for (const e of chained) {
    if (lastSeq !== 0 && Number(e.seq) !== lastSeq + 1) {
      const covered = clearedThrough >= Number(e.seq) - 1;
      alerts.push({
        seq: Number(e.seq),
        reason: `sequence gap: expected ${lastSeq + 1}, got ${e.seq}`,
        kind: covered ? 'info' : 'alert',
      });
    } else if (lastSeq !== 0 && e.prev !== lastDigest) {
      alerts.push({ seq: Number(e.seq), reason: 'prev link mismatch', kind: 'alert' });
    }
    lastDigest = digestEvent(e);
    lastSeq = Number(e.seq);
  }
  return { alerts, lastSeq, lastDigest };
}
