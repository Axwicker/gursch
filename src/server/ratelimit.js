// ratelimit.js - enkla tak för hur ofta något får göras. Räknas per IP eller socket i minnet.

export class RateLimiter {
  constructor(now = Date.now) {
    this.now = now;
    this.hits = new Map();   // nyckel -> tidsstämplar inom fönstret
    this.windowMs = 60_000;
  }

  /** true om det här försöket får göras (och räknar det), annars false. */
  allow(key, maxPerMinute) {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    const ok = recent.length < maxPerMinute;
    if (ok) recent.push(now);
    this.hits.set(key, recent);
    return ok;
  }

  /** Glömmer nycklar utan aktuella försök, så att minnet inte växer. */
  prune() {
    const now = this.now();
    for (const [key, times] of this.hits) if (!times.some((t) => now - t < this.windowMs)) this.hits.delete(key);
  }
}
