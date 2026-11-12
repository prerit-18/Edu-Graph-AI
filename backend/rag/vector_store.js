const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateEmbedding, cosineSimilarity, tokenize } = require('./embeddings');
const { chunkText } = require('./chunker');

const INDEX_FILE = path.resolve(__dirname, '../../data/chroma/vector_index.json');
const SYLLABUS_FILE = path.resolve(__dirname, '../../data/syllabus/syllabus.json');
const INDEX_VERSION = 4;

// BM25 parameters
const K1 = 1.4;
const B = 0.75;

/** very light stemmer so "networks"/"network", "scheduling"/"schedule" match */
function stem(t) {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}
function terms(text) { return tokenize(text).map(stem); }

class VectorStore {
  constructor() {
    this.chunks = [];
    this.isLoaded = false;
    this.signature = null;
    this._lastCheck = 0;
    this.df = new Map();
    this.vocab = new Set();
    this.avgLen = 1;
  }

  /** fingerprint of everything the index is built from */
  computeSignature() {
    const h = crypto.createHash('sha1');
    h.update(String(INDEX_VERSION));
    try { const st = fs.statSync(SYLLABUS_FILE); h.update(`${st.size}:${st.mtimeMs}`); } catch (e) { h.update('nosyl'); }
    try {
      const db = require('../database/db');
      const r = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(length(question_text)),0) l, COALESCE(MAX(created_at),'') m, COALESCE(SUM(marks),0) mk FROM questions").get();
      h.update(`${r.c}:${r.l}:${r.m}:${r.mk}`);
    } catch (e) { h.update('nodb'); }
    return h.digest('hex');
  }

  load() {
    if (fs.existsSync(INDEX_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
        if (raw && raw.version === INDEX_VERSION && Array.isArray(raw.chunks)) {
          this.chunks = raw.chunks; this.signature = raw.signature;
          this._prepare(); this.isLoaded = true;
          return true;
        }
      } catch (err) { console.warn('Could not read index file, will re-index:', err.message); }
    }
    return false;
  }

  save() {
    const dir = path.dirname(INDEX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INDEX_FILE, JSON.stringify({ version: INDEX_VERSION, signature: this.signature, chunks: this.chunks }), 'utf8');
  }

  _prepare() {
    this.df = new Map(); this.vocab = new Set(); let total = 0;
    for (const c of this.chunks) {
      c.terms = terms(c.text);
      c.tf = new Map();
      for (const t of c.terms) c.tf.set(t, (c.tf.get(t) || 0) + 1);
      for (const t of c.tf.keys()) { this.df.set(t, (this.df.get(t) || 0) + 1); this.vocab.add(t); }
      total += c.terms.length;
    }
    this.avgLen = this.chunks.length ? total / this.chunks.length : 1;
  }

  /** Index: syllabus topics, official syllabus text (chunked w/ overlap), and every question in the bank */
  buildIndex() {
    const out = [];
    const push = (id, text, metadata) => out.push({ id, text, metadata, embedding: generateEmbedding(text) });

    if (fs.existsSync(SYLLABUS_FILE)) {
      const syllabus = JSON.parse(fs.readFileSync(SYLLABUS_FILE, 'utf8'));
      for (const sub of syllabus) {
        for (const topic of sub.topics) {
          push(`syllabus_${topic.id}`,
            `Subject: ${sub.subject}. Topic: ${topic.name}. ${topic.description}${topic.keywords ? ' Keywords: ' + topic.keywords + '.' : ''}`,
            { source_type: 'syllabus', subject: sub.subject, topic_id: topic.id, topic_name: topic.name, pyq_weight: topic.pyq_weight });
        }
        if (sub.official_syllabus) {
          chunkText(sub.official_syllabus, { size: 60, overlap: 12 }).forEach((c, i) => {
            push(`official_${sub.subject.replace(/\W+/g, '_')}_${i}`, `Official GATE CSE syllabus for ${sub.subject}: ${c}`,
              { source_type: 'official_syllabus', subject: sub.subject, topic_id: null, topic_name: sub.subject, chunk_index: i });
          });
        }
      }
    }

    try {
      const bank = require('../services/question_bank');
      // General Aptitude (verbal/numerical) is not CS domain knowledge; indexing it lets everyday English match.
      for (const q of bank.getAll().filter(x => x.subject !== 'General Aptitude')) {
        const text = `${q.subject} ${q.topic_id} question (${q.type}): ${q.question} ${(q.options || []).join(' ')}`;
        push(`pyq_${q.id}`, text, {
          source_type: 'pyq', subject: q.subject, topic_id: q.topic_id, year: q.year, session: q.session,
          question_id: q.id, type: q.type, origin: q.origin, verification_status: q.verification_status,
          marks: q.marks, has_key: q.answer !== null && q.answer !== undefined && q.answer !== ''
        });
      }
    } catch (err) { console.warn('Could not index question bank:', err.message); }

    this.chunks = out;
    this.signature = this.computeSignature();
    this._prepare();
    this.isLoaded = true;
    try { this.save(); } catch (e) { console.warn('Could not persist index:', e.message); }
    return this.chunks.length;
  }

  ensureFresh() {
    const now = Date.now();
    if (this.isLoaded && now - this._lastCheck < 5000) return;
    this._lastCheck = now;
    const sig = this.computeSignature();
    if (!this.isLoaded) this.load();
    if (!this.isLoaded || this.signature !== sig) this.buildIndex();
  }

  idf(t) {
    const n = this.df.get(t) || 0;
    return Math.log(1 + (this.chunks.length - n + 0.5) / (n + 0.5));
  }

  /** fraction of (stemmed) query terms that exist anywhere in the knowledge base */
  vocabCoverage(query) {
    this.ensureFresh();
    const q = [...new Set(terms(query))];
    if (!q.length) return { coverage: 0, terms: q, known: [] };
    const known = q.filter(t => this.vocab.has(t));
    return { coverage: known.length / q.length, terms: q, known };
  }

  /**
   * Hybrid search: BM25 (lexical, IDF-weighted) + hashed character-n-gram cosine.
   * filters: subject, topic_id, source_type | source_types[]
   */
  search(query, filters = {}, topK = 4, opts = {}) {
    this.ensureFresh();
    const semantic = opts.queryVec ? require('./semantic') : null;
    const vecs = semantic ? semantic.load() : null;
    const qTerms = [...new Set(terms(query))];
    const qVec = generateEmbedding(query);
    const types = filters.source_types || (filters.source_type ? [filters.source_type] : null);
    // Ideal score = every query term matched. Terms absent from the whole knowledge base are charged at half the
    // maximum IDF, so a query that is mostly unknown vocabulary cannot reach a high score off one generic word.
    const maxIdf = this.idf('\u0000unknown-term');
    const maxBm25 = qTerms.reduce((a, t) => a + (this.vocab.has(t) ? this.idf(t) : 0.5 * maxIdf) * (K1 + 1), 0) || 1;
    const scored = [];

    for (const c of this.chunks) {
      const m = c.metadata;
      if (filters.subject && m.subject !== filters.subject) continue;
      if (filters.topic_id && m.topic_id !== filters.topic_id) continue;
      if (types && !types.includes(m.source_type)) continue;
      if (filters.year && m.year !== Number(filters.year)) continue;

      let bm = 0, matched = 0;
      const len = c.terms.length || 1;
      for (const t of qTerms) {
        const f = c.tf.get(t);
        if (!f) continue;
        matched++;
        bm += this.idf(t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * len / this.avgLen));
      }
      const bm25Norm = Math.min(1, bm / maxBm25);
      const cos = cosineSimilarity(qVec, c.embedding);
      const overlap = qTerms.length ? matched / qTerms.length : 0;
      const lexical = 0.75 * bm25Norm + 0.25 * cos;
      let sem = null, similarity = lexical;
      if (vecs && vecs.has(c.id)) {
        sem = semantic.cosine(opts.queryVec, vecs.get(c.id));
        // Gemini embedding cosines of related text sit around 0.55-0.85; rescale to 0-1 before blending
        similarity = 0.55 * lexical + 0.45 * Math.max(0, Math.min(1, (sem - 0.45) / 0.4));
      }
      scored.push({ id: c.id, text: c.text, metadata: m, similarity: Number(similarity.toFixed(4)), lexical: Number(lexical.toFixed(4)), semantic: sem === null ? null : Number(sem.toFixed(4)), bm25: Number(bm25Norm.toFixed(4)), cosSim: cos, overlap });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }
}

module.exports = new VectorStore();
