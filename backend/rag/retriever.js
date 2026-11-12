const vectorStore = require('./vector_store');
const { tokenOverlap } = require('./embeddings');

/**
 * Retrieval strategies. Each task gets its own source mix, K and context budget so agents never
 * receive whole papers/books - only the few chunks that matter.
 */
const STRATEGIES = {
  concept:  { sources: ['syllabus', 'official_syllabus'], topK: 3, maxChars: 500 },
  summary:  { sources: ['syllabus', 'official_syllabus'], topK: 4, maxChars: 500 },
  pyq:      { sources: ['pyq'], topK: 5, maxChars: 450 },
  solution: { sources: ['pyq', 'syllabus'], topK: 2, maxChars: 450 },
  revision: { sources: ['syllabus', 'pyq'], topK: 4, maxChars: 300 },
  default:  { sources: null, topK: 3, maxChars: 300 }
};

// Grounding gate. minScore is the midpoint between the highest out-of-domain score (0.245) and the lowest
// in-domain score (0.308) on evaluation/test_cases.json ONLY, measured with the 8 ingested official papers in the index. The two held-out sets are never used to tune it.
const GROUNDING = { minScore: 0.277, minTopCoverage: 0.2 };

function citationFor(r) {
  const m = r.metadata;
  if (m.source_type === 'pyq') {
    return {
      source: m.origin === 'official_gate' ? `GATE CSE ${m.year}${m.session ? ' ' + m.session : ''} (official)` : 'EduGraph practice set (not an official GATE question)',
      subject: m.subject, question_id: m.question_id, topic_id: m.topic_id, type: m.type, year: m.year,
      origin: m.origin, verification_status: m.verification_status, similarity: r.similarity
    };
  }
  return {
    source: m.source_type === 'official_syllabus' ? 'Official GATE CSE syllabus' : 'GATE CSE syllabus topic',
    subject: m.subject, topic: m.topic_name, topic_id: m.topic_id, chunk_id: r.id, similarity: r.similarity
  };
}

/**
 * retrieve(query, filters)
 * filters: { strategy, subject, topic_id, topK, source_types, year }
 * @returns {{isGrounded, confidence, overlap, coverage, results, citations, refusalReason}}
 */
function retrieve(query, filters = {}) {
  const strat = STRATEGIES[filters.strategy] || STRATEGIES.default;
  const topK = filters.topK || strat.topK;
  const searchFilters = {
    subject: filters.subject, topic_id: filters.topic_id, year: filters.year,
    source_types: filters.source_types || strat.sources
  };
  const cov = vectorStore.vocabCoverage(query);
  const raw = vectorStore.search(query, searchFilters, Math.max(topK * 2, 6));

  if (!raw.length) {
    return { isGrounded: false, confidence: 0, overlap: 0, coverage: cov.coverage, results: [], citations: [],
      refusalReason: 'No matching records in the GATE CSE syllabus or question bank.' };
  }

  // de-duplicate near-identical chunks
  const picked = [];
  for (const c of raw) {
    if (!picked.some(s => tokenOverlap(c.text, s.text) > 0.85)) picked.push(c);
    if (picked.length >= topK) break;
  }
  const top = picked[0];
  // A topic filter already narrows scope, so coverage gating applies only to open-domain queries.
  const scoped = !!(filters.topic_id);
  const isGrounded = scoped
    ? top.similarity >= GROUNDING.minScore * 0.6 && top.overlap > 0
    : top.similarity >= GROUNDING.minScore && top.overlap >= GROUNDING.minTopCoverage;

  const results = picked.map(r => ({
    ...r,
    text: r.text.length > strat.maxChars ? r.text.slice(0, strat.maxChars) + '...' : r.text
  }));
  const citations = picked.map(citationFor);

  return {
    isGrounded,
    confidence: Number(top.similarity.toFixed(4)),
    overlap: Number(top.overlap.toFixed(4)),
    coverage: Number(cov.coverage.toFixed(4)),
    results,
    citations,
    refusalReason: isGrounded ? null :
      `This does not look like a GATE CSE syllabus topic I have material for (known terms: ${(cov.coverage * 100).toFixed(0)}%, best chunk match: ${(top.similarity * 100).toFixed(0)}%). Refusing to guess.`
  };
}

/**
 * Semantic-aware retrieval (async). Lexical retrieval runs first; when embeddings exist the query is embedded and
 * results are re-ranked by a lexical+semantic blend. A query that fails the lexical gate can still be accepted when
 * its best chunk is semantically very close (SEMANTIC_GATE, calibrated on evaluation/test_cases.json only).
 * Without embeddings / API access this returns exactly the lexical result.
 */
const SEMANTIC_GATE = Number(process.env.SEMANTIC_GATE || 0.62);
async function retrieveAsync(query, filters = {}) {
  const lexical = retrieve(query, filters);
  const semantic = require('./semantic');
  const strat = STRATEGIES[filters.strategy] || STRATEGIES.default;
  const cov = semantic.coverage(vectorStore.chunks.length ? vectorStore.chunks : (vectorStore.ensureFresh(), vectorStore.chunks));
  if (cov.ratio < 0.5) return { ...lexical, semantic: false };
  const qv = await semantic.embedQuery(query);
  if (!qv) return { ...lexical, semantic: false };
  const topK = filters.topK || strat.topK;
  const raw = vectorStore.search(query, { subject: filters.subject, topic_id: filters.topic_id, year: filters.year, source_types: filters.source_types || strat.sources }, Math.max(topK * 2, 6), { queryVec: qv });
  if (!raw.length) return { ...lexical, semantic: true };
  const picked = [];
  for (const c of raw) { if (!picked.some(s => tokenOverlap(c.text, s.text) > 0.85)) picked.push(c); if (picked.length >= topK) break; }
  const top = picked[0];
  const semTop = Math.max(...picked.map(r => r.semantic ?? 0));
  const isGrounded = lexical.isGrounded || (semTop >= SEMANTIC_GATE && top.overlap > 0) || (!!filters.topic_id && semTop >= SEMANTIC_GATE - 0.1);
  return {
    isGrounded, semantic: true, confidence: Number(top.similarity.toFixed(4)), semanticScore: Number(semTop.toFixed(4)), overlap: Number(top.overlap.toFixed(4)),
    coverage: lexical.coverage,
    results: picked.map(r => ({ ...r, text: r.text.length > strat.maxChars ? r.text.slice(0, strat.maxChars) + '...' : r.text })),
    citations: picked.map(citationFor),
    refusalReason: isGrounded ? null : lexical.refusalReason
  };
}

module.exports = { retrieve, retrieveAsync, STRATEGIES, GROUNDING };
