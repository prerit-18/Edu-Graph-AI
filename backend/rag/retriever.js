const vectorStore = require('./vector_store');
const { tokenOverlap } = require('./embeddings');

const GROUNDING_THRESHOLD = 0.30;
const MIN_OVERLAP_THRESHOLD = 0.20;

/**
 * Phase 3: Provider-independent retrieval function
 * retrieve(query, filters)
 * @param {string} query - Student query or concept
 * @param {object} filters - { subject, topic_id, topK, minScore }
 * @returns {object} { isGrounded, confidence, results, citations, refusalReason }
 */
function retrieve(query, filters = {}) {
  const topK = filters.topK || 4;
  const rawResults = vectorStore.search(query, filters, topK);

  if (!rawResults || rawResults.length === 0) {
    return {
      isGrounded: false,
      confidence: 0,
      results: [],
      citations: [],
      refusalReason: 'No matching records in the GATE CSE syllabus or PYQ repository.'
    };
  }

  const topMatch = rawResults[0];
  const topScore = topMatch.similarity;
  
  // Term overlap against top match
  const overlap = topMatch.overlap !== undefined ? topMatch.overlap : tokenOverlap(query, topMatch.text);
  
  // A query is considered grounded in the GATE CSE knowledge base if:
  // 1. Hybrid retrieval score >= 0.25 with keyword overlap >= 0.20
  // 2. Acronym or specific technical term match with overlap >= 0.40 and score >= 0.14
  const isGrounded = (topScore >= 0.25 && overlap >= 0.20) || (overlap >= 0.40 && topScore >= 0.14);

  const citations = rawResults.map(r => {
    const meta = r.metadata;
    if (meta.source_type === 'syllabus') {
      return {
        source: 'GATE CSE Official Syllabus',
        subject: meta.subject,
        topic: meta.topic_name,
        topic_id: meta.topic_id,
        similarity: r.similarity
      };
    } else {
      return {
        source: `GATE CSE ${meta.year} Exam`,
        subject: meta.subject,
        question_id: meta.question_id,
        topic_id: meta.topic_id,
        type: meta.type,
        similarity: r.similarity
      };
    }
  });

  return {
    isGrounded,
    confidence: Number(topScore.toFixed(4)),
    overlap: Number(overlap.toFixed(4)),
    results: rawResults,
    citations,
    refusalReason: isGrounded 
      ? null 
      : `Insufficient GATE CSE context evidence (similarity: ${topScore.toFixed(2)}, keyword overlap: ${(overlap * 100).toFixed(0)}%). Refusing to fabricate an unverified answer to prevent hallucinations.`
  };
}

module.exports = {
  retrieve,
  GROUNDING_THRESHOLD,
  MIN_OVERLAP_THRESHOLD
};
