const fs = require('fs');
const path = require('path');
const { retrieve } = require('../backend/rag/retriever');

function runEvaluation() {
  console.log('==================================================');
  console.log('--- Running EduGraph AI Minor Evaluation Suite ---');
  console.log('==================================================');

  const casesPath = path.resolve(__dirname, 'test_cases.json');
  const testCases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  let total = testCases.length;
  let groundingCorrect = 0;
  let topicMatches = 0;
  let inDomainCount = 0;

  for (const tc of testCases) {
    const res = retrieve(tc.query);
    const isGroundingMatch = res.isGrounded === tc.should_be_grounded;
    if (isGroundingMatch) groundingCorrect++;

    let isTopicMatch = false;
    if (tc.should_be_grounded) {
      inDomainCount++;
      const topTopic = res.results[0]?.metadata?.topic_id;
      if (topTopic === tc.expected_topic) {
        topicMatches++;
        isTopicMatch = true;
      }
    }

    console.log(`[${tc.id}] "${tc.query.slice(0, 45)}..."`);
    console.log(`  Expected Grounded: ${tc.should_be_grounded} | Actual: ${res.isGrounded} (Confidence: ${res.confidence})`);
    if (tc.should_be_grounded) {
      console.log(`  Expected Topic: ${tc.expected_topic} | Actual Top Topic: ${res.results[0]?.metadata?.topic_id} -> ${isTopicMatch ? '✓ MATCH' : '✗ MISMATCH'}`);
    }
    console.log('--------------------------------------------------');
  }

  const groundingAccuracy = ((groundingCorrect / total) * 100).toFixed(1);
  const retrievalPrecision = ((topicMatches / inDomainCount) * 100).toFixed(1);

  console.log(`SUMMARY METRICS:`);
  console.log(`Total Test Cases:       ${total}`);
  console.log(`Grounding Accuracy:     ${groundingAccuracy}% (${groundingCorrect}/${total})`);
  console.log(`Retrieval Precision:   ${retrievalPrecision}% (${topicMatches}/${inDomainCount})`);
  console.log('==================================================');
}

runEvaluation();
