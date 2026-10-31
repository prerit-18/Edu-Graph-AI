const crypto = require('crypto');
const db = require('../database/db');

/**
 * Dual-Tier Response Cache (In-Memory LRU + SQLite)
 * 
 * Caches static, syllabus-grounded concept explanations and PYQ analyses.
 * Prevents redundant LLM calls for identical or semantically identical queries.
 */

const MAX_MEM_ENTRIES = 200;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

// In-memory LRU cache Map: cache_key -> { value, agent, topicId, createdAt }
const memCache = new Map();

// Initialize SQLite table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS response_cache (
      cache_key TEXT PRIMARY KEY,
      agent TEXT,
      topic_id TEXT,
      response_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      hits INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_response_cache_agent ON response_cache(agent);
  `);
} catch (err) {
  console.warn('[ResponseCache] Failed to ensure response_cache table:', err.message);
}

const PERSONAL_PRONOUNS = new Set([
  'i', 'me', 'my', 'myself', 'mine', 'we', 'our', 'ours', 'us'
]);

/**
 * Check if the query contains personal or learner-specific references
 * @param {string} query 
 * @returns {boolean}
 */
function hasPersonalReference(query) {
  if (!query || typeof query !== 'string') return false;
  const words = query.toLowerCase().split(/[^a-z0-9]+/);
  return words.some(w => PERSONAL_PRONOUNS.has(w));
}

/**
 * Normalize query by lowercasing, removing punctuation, and sorting tokens alphabetically
 * E.g., "Explain SJF algorithm" and "SJF algorithm explain" produce the same normalized string.
 * @param {string} query 
 * @returns {string}
 */
function normalizeQuery(query) {
  if (!query || typeof query !== 'string') return '';
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Generate a deterministic SHA-256 cache key
 * @param {string} agent 
 * @param {string} topicId 
 * @param {string} query 
 * @param {string|null} userId 
 * @returns {string|null} Key or null if query should not be cached
 */
function makeKey(agent, topicId, query, userId = null) {
  // Do NOT cache personalized results
  if (userId && hasPersonalReference(query)) {
    return null;
  }

  const normQuery = normalizeQuery(query);
  if (!normQuery) return null;

  const raw = `${agent || 'general'}:${topicId || 'general'}:${normQuery}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Retrieve cached response by key (checking in-memory first, then SQLite)
 * @param {string} key 
 * @returns {object|null}
 */
function get(key) {
  if (!key) return null;

  const now = Date.now();

  // 1. In-memory check
  if (memCache.has(key)) {
    const entry = memCache.get(key);
    if (now - entry.createdAt <= TTL_MS) {
      // LRU refresh: move to end
      memCache.delete(key);
      memCache.set(key, entry);

      // Async hit increment in SQLite
      try {
        db.prepare('UPDATE response_cache SET hits = hits + 1 WHERE cache_key = ?').run(key);
      } catch (e) {
        // non-blocking
      }

      return entry.value;
    } else {
      memCache.delete(key);
    }
  }

  // 2. SQLite check
  try {
    const row = db.prepare('SELECT * FROM response_cache WHERE cache_key = ?').get(key);
    if (row) {
      const rowTime = new Date(row.created_at).getTime();
      if (now - rowTime <= TTL_MS) {
        const val = JSON.parse(row.response_json);

        // Populate in-memory LRU
        if (memCache.size >= MAX_MEM_ENTRIES) {
          const oldestKey = memCache.keys().next().value;
          memCache.delete(oldestKey);
        }
        memCache.set(key, {
          value: val,
          agent: row.agent,
          topicId: row.topic_id,
          createdAt: rowTime
        });

        // Increment hit counter
        db.prepare('UPDATE response_cache SET hits = hits + 1 WHERE cache_key = ?').run(key);

        return val;
      } else {
        // Expired from SQLite
        db.prepare('DELETE FROM response_cache WHERE cache_key = ?').run(key);
      }
    }
  } catch (err) {
    console.warn('[ResponseCache] Error reading from SQLite:', err.message);
  }

  return null;
}

/**
 * Store response in both in-memory LRU and SQLite
 * @param {string} key 
 * @param {string} agent 
 * @param {string} topicId 
 * @param {object} value 
 */
function set(key, agent, topicId, value) {
  if (!key || !value) return;

  const now = Date.now();

  // 1. Save in-memory LRU
  if (memCache.has(key)) {
    memCache.delete(key);
  } else if (memCache.size >= MAX_MEM_ENTRIES) {
    const oldestKey = memCache.keys().next().value;
    memCache.delete(oldestKey);
  }

  memCache.set(key, {
    value,
    agent,
    topicId,
    createdAt: now
  });

  // 2. Persist to SQLite
  try {
    const insertStmt = db.prepare(`
      INSERT INTO response_cache (cache_key, agent, topic_id, response_json, created_at, hits)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
      ON CONFLICT(cache_key) DO UPDATE SET
        response_json = excluded.response_json,
        created_at = CURRENT_TIMESTAMP,
        hits = 0
    `);
    insertStmt.run(key, agent, topicId, JSON.stringify(value));
  } catch (err) {
    console.warn('[ResponseCache] Error saving to SQLite:', err.message);
  }
}

module.exports = {
  get,
  set,
  makeKey,
  normalizeQuery,
  hasPersonalReference
};
