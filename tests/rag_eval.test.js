const assert = require('assert');
const { evaluate } = require('../evaluation/run_eval');

console.log('--- RAG retrieval evaluation (regression guard) ---');
// Tests run on the small practice-only corpus; the thresholds are calibrated for the full corpus (see evaluation/run_eval.js).
// Here we guard the property that matters most: no out-of-domain query is ever answered.
const sets = [['test_cases.json', 0.7], ['heldout_cases.json', 0.6], ['heldout2_cases.json', 0.6]];
for (const [file, minAcc] of sets) {
  const r = evaluate(file);
  console.log(`${file}: grounding ${(r.groundingAccuracy * 100).toFixed(1)}% (FP ${r.falsePositives}, FN ${r.falseNegatives}), topic@1 ${r.topicTop1}`);
  assert.strictEqual(r.falsePositives, 0, `${file}: out-of-domain queries must be refused (no hallucination)`);
  assert(r.groundingAccuracy >= minAcc, `${file}: grounding accuracy ${r.groundingAccuracy} below ${minAcc}`);
}
// strategies return only their own source types
const { retrieve } = require('../backend/rag/retriever');
const pyq = retrieve('page replacement fifo belady', { strategy: 'pyq' });
assert(pyq.results.every(r => r.metadata.source_type === 'pyq'), 'pyq strategy returns questions only');
const concept = retrieve('page replacement fifo belady', { strategy: 'concept' });
assert(concept.results.every(r => r.metadata.source_type !== 'pyq'), 'concept strategy returns syllabus material only');
assert(concept.results.length <= 3 && concept.results.every(r => r.text.length <= 503), 'context stays small');
const filtered = retrieve('scheduling', { strategy: 'concept', subject: 'Operating Systems' });
assert(filtered.results.every(r => r.metadata.subject === 'Operating Systems'), 'metadata filter honoured');
console.log('🎉 RAG evaluation tests passed');
