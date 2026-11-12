const path = require('path');
process.env.DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), `edugraph-eval-${process.pid}.db`);
require('../backend/database/seed')({ quiet: true });
require('../backend/services/question_bank').importAll();
const { retrieve } = require('../backend/rag/retriever');

/**
 * Retrieval evaluation.
 *  - test_cases.json    : the set the grounding thresholds were TUNED on (optimistic by construction)
 *  - heldout_cases.json : written afterwards; its misses were SEEN before the scoring change, so it is semi-contaminated
 *  - heldout2_cases.json: written before the final scoring change and never looked at while tuning (cleanest number)
 * Metrics: grounding accuracy (answer / refuse decision) and top-1 topic accuracy for in-domain queries.
 */
function evaluate(file) {
  const cases = require(path.resolve(__dirname, file));
  let groundOk = 0, inDomain = 0, topicOk = 0, falsePos = 0, falseNeg = 0;
  const misses = [];
  for (const tc of cases) {
    const r = retrieve(tc.query);
    if (r.isGrounded === tc.should_be_grounded) groundOk++;
    else { (r.isGrounded ? falsePos++ : falseNeg++); misses.push(`${tc.should_be_grounded ? 'MISSED' : 'LEAKED'}: "${tc.query}" (coverage ${r.coverage}, score ${r.confidence})`); }
    if (tc.should_be_grounded) {
      inDomain++;
      if ((r.results[0] || {}).metadata && r.results[0].metadata.topic_id === tc.expected_topic) topicOk++;
    }
  }
  return { file, n: cases.length, groundingAccuracy: +(groundOk / cases.length).toFixed(3), falsePositives: falsePos, falseNegatives: falseNeg,
    topicTop1: `${topicOk}/${inDomain}`, topicTop1Accuracy: +(topicOk / inDomain).toFixed(3), misses };
}

if (require.main === module) {
  for (const f of ['test_cases.json', 'heldout_cases.json', 'heldout2_cases.json']) {
    const r = evaluate(f);
    console.log(`\n${f}: n=${r.n} grounding=${(r.groundingAccuracy * 100).toFixed(1)}% (FP ${r.falsePositives}, FN ${r.falseNegatives}) topic@1=${r.topicTop1}`);
    r.misses.forEach(m => console.log('  ' + m));
  }
}
module.exports = { evaluate };
