// Retention: drop old events/heartbeats, cap heartbeats per device.
const DAY_MS = 86400000;

export function pruneStore(data, now = Date.now()) {
  const retentionDays = Number(data.settings?.retention_days ?? 90);
  const eventCutoff = now - retentionDays * DAY_MS;
  const hbCutoff = now - 30 * DAY_MS;

  const removedEvents = data.events.length;
  data.events = data.events.filter((e) => (e.received_at ?? 0) >= eventCutoff);

  const byDevice = new Map();
  for (const h of data.heartbeats) {
    if ((h.ts ?? 0) < hbCutoff) continue;
    if (!byDevice.has(h.device_id)) byDevice.set(h.device_id, []);
    byDevice.get(h.device_id).push(h);
  }
  const kept = [];
  for (const list of byDevice.values()) {
    list.sort((a, b) => b.ts - a.ts);
    kept.push(...list.slice(0, 500));
  }
  data.heartbeats = kept;
  return { removedEvents: removedEvents - data.events.length };
}
