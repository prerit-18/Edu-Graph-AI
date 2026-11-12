const crypto = require('crypto');
const db = require('../database/db');
const llm = require('../agents/llm_client');

/**
 * Semantic layer (Gemini embeddings) on top of the lexical index.
 *  - Chunk vectors are generated offline-ish by `npm run embed` and stored in SQLite (chunk_embeddings, Float32 BLOB);
 *    a chunk is re-embedded only when its text hash changes.
 *  - Query vectors are embedded on demand (small LRU cache). If the embedding API is unavailable everything falls back
 *    to lexical retrieval; nothing is ever fabricated.
 * This is retrieval over embeddings, not model training.
 */
const MODEL = () => llm.embedModel;
let vectors = null;          // Map(chunk_id -> Float32Array)
let loadedFor = null;
const queryCache = new Map();

const textHash = t => crypto.createHash('sha1').update(String(t)).digest('hex');
const toBlob = arr => Buffer.from(Float32Array.from(arr).buffer);
function fromBlob(b) { const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); const v = new Float32Array(ab); return v; }
function normalise(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); }

function load(force = false) {
  const key = `${MODEL()}`;
  if (vectors && loadedFor === key && !force) return vectors;
  vectors = new Map();
  for (const r of db.prepare('SELECT chunk_id, vector FROM chunk_embeddings WHERE model = ?').all(MODEL())) vectors.set(r.chunk_id, fromBlob(r.vector));
  loadedFor = key;
  return vectors;
}

/** share of the current index that has an up-to-date embedding */
function coverage(chunks) {
  const have = new Map(db.prepare('SELECT chunk_id, text_hash FROM chunk_embeddings WHERE model = ?').all(MODEL()).map(r => [r.chunk_id, r.text_hash]));
  const fresh = chunks.filter(c => have.get(c.id) === textHash(c.text)).length;
  return { total: chunks.length, embedded: fresh, ratio: chunks.length ? fresh / chunks.length : 0 };
}

/** Embed every chunk whose vector is missing/outdated. Resumable; stops cleanly on quota errors. */
async function embedIndex(chunks, { onProgress = () => {}, delayMs = 650, limit = Infinity } = {}) {
  const have = new Map(db.prepare('SELECT chunk_id, text_hash FROM chunk_embeddings WHERE model = ?').all(MODEL()).map(r => [r.chunk_id, r.text_hash]));
  const todo = chunks.filter(c => have.get(c.id) !== textHash(c.text)).slice(0, limit);
  const up = db.prepare('INSERT OR REPLACE INTO chunk_embeddings (chunk_id, model, text_hash, vector) VALUES (?, ?, ?, ?)');
  let done = 0, error = null;
  for (const c of todo) {
    try {
      const [v] = await llm.embed([c.text], { taskType: 'RETRIEVAL_DOCUMENT', delayMs: 0, agentLabel: 'Indexer' });
      up.run(c.id, MODEL(), textHash(c.text), toBlob(normalise(v)));
      done++; onProgress(done, todo.length);
      await new Promise(r => setTimeout(r, delayMs));
    } catch (e) { error = e; break; }
  }
  load(true);
  return { embedded: done, remaining: todo.length - done, error: error ? { code: error.code, message: error.message } : null };
}

/** query vector (cached); returns null when embeddings are unavailable */
async function embedQuery(query) {
  const k = String(query).trim().toLowerCase().slice(0, 400);
  if (queryCache.has(k)) return queryCache.get(k);
  if (!llm.isAvailable()) return null;
  try {
    const [v] = await llm.embed([k], { taskType: 'RETRIEVAL_QUERY', delayMs: 0, agentLabel: 'Retriever' });
    const nv = Float32Array.from(normalise(v));
    if (queryCache.size > 300) queryCache.delete(queryCache.keys().next().value);
    queryCache.set(k, nv);
    return nv;
  } catch (e) { return null; }
}

function cosine(a, b) { let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) d += a[i] * b[i]; return d; }

module.exports = { load, coverage, embedIndex, embedQuery, cosine, textHash, _clear() { vectors = null; queryCache.clear(); } };
