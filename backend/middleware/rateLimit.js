/**
 * Minimal in-memory sliding-window rate limiter (no extra dependency).
 * key = user id when authenticated, otherwise client IP.
 */
function rateLimit({ windowMs = 60_000, max = 60, name = 'api' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const fresh = arr.filter(t => now - t < windowMs);
      if (fresh.length) hits.set(k, fresh); else hits.delete(k);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = `${name}:${req.user?.id || req.ip}`;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Too many requests. Try again in ${retry}s.` });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}
module.exports = { rateLimit };
