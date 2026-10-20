// Dependency-free sliding-window limiter, keyed by device token id.
export class SlidingWindowLimiter {
  /**
   * @param {number} limit - max requests per window.
   * @param {number} windowMs - window length.
   * @param {() => number} [clock] - injectable clock (ms).
   */
  constructor(limit, windowMs, clock = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.clock = clock;
    this.hits = new Map();
  }

  /** @returns {{allowed:boolean, retryAfterSec:number}} */
  hit(key) {
    const now = this.clock();
    const cutoff = now - this.windowMs;
    const list = (this.hits.get(key) || []).filter((t) => t > cutoff);
    if (list.length >= this.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000));
      this.hits.set(key, list);
      return { allowed: false, retryAfterSec };
    }
    list.push(now);
    this.hits.set(key, list);
    return { allowed: true, retryAfterSec: 0 };
  }

  reset(key) {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }
}
