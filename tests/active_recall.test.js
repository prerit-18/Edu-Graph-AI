const assert = require('assert');
const http = require('http');
const app = require('../backend/app');
const db = require('../backend/database/db');
const activeRecallAgent = require('../backend/agents/active_recall_agent');

let server;
let baseUrl;

function post(endpoint, data, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data || {});
    const url = new URL(endpoint, baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function get(endpoint, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runActiveRecallTests() {
  console.log('--- Testing Active Recall Agent End-to-End ---');

  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Setup test users
  const user1Email = `student_ar1_${Date.now()}@example.com`;
  const user2Email = `student_ar2_${Date.now()}@example.com`;

  const auth1 = await post('/api/auth/signup', { name: 'Aspirant Alice', email: user1Email, password: 'password123' });
  const auth2 = await post('/api/auth/signup', { name: 'Aspirant Bob', email: user2Email, password: 'password123' });

  const token1 = auth1.data.token;
  const user1Id = auth1.data.user.id;
  const token2 = auth2.data.token;
  const user2Id = auth2.data.user.id;

  // Test 1: Question generated for the correct topic
  console.log('Test 1: Generating recall prompt for topic os_scheduling...');
  const promptRes = await get('/api/recall/prompt?topicId=os_scheduling&type=concept_recall', token1);
  assert.strictEqual(promptRes.status, 200);
  assert.strictEqual(promptRes.data.topicId, 'os_scheduling');
  assert(promptRes.data.promptId, 'Must return promptId');
  assert(promptRes.data.question && promptRes.data.question.length > 10, 'Question must exist');
  console.log('✓ Test 1 Passed: Question generated for target topic');

  // Test 2: Answer key is NOT included in pre-submission API response
  console.log('Test 2: Verifying security (no reference answer or key concepts leaked)...');
  assert.strictEqual(promptRes.data.referenceAnswer, undefined, 'referenceAnswer must NOT be leaked');
  assert.strictEqual(promptRes.data.reference_answer, undefined, 'reference_answer must NOT be leaked');
  assert.strictEqual(promptRes.data.keyConcepts, undefined, 'keyConcepts must NOT be leaked');
  assert.strictEqual(promptRes.data.rubric, undefined, 'rubric must NOT be leaked');
  console.log('✓ Test 2 Passed: Pre-submission response is strictly secure');

  // Test 3: Correct answer evaluation and BKT update
  console.log('Test 3: Evaluating a correct answer submission...');
  const correctAns = 'SJF causes starvation for longer processes. Aging gradually increases priority over time to prevent starvation.';
  const evalCorrect = await post('/api/recall/grade', {
    promptId: promptRes.data.promptId,
    topicId: 'os_scheduling',
    studentAnswer: correctAns
  }, token1);

  assert.strictEqual(evalCorrect.status, 200);
  assert.strictEqual(evalCorrect.data.isCorrect, true);
  assert(evalCorrect.data.score >= 70, `Score should be >= 70, got ${evalCorrect.data.score}`);
  assert(evalCorrect.data.referenceAnswer, 'Reference answer must now be revealed post-submission');
  assert(evalCorrect.data.bktUpdate, 'BKT update must exist');
  assert(evalCorrect.data.bktUpdate.newPKnow > evalCorrect.data.bktUpdate.previousPKnow, 'Mastery must increase');
  console.log(`✓ Test 3 Passed: Correct answer marked isCorrect=true, P(Know): ${evalCorrect.data.bktUpdate.previousPKnow} -> ${evalCorrect.data.bktUpdate.newPKnow}`);

  // Test 4: Incorrect answer evaluation and BKT reduction
  console.log('Test 4: Evaluating an incorrect answer submission...');
  const promptRes2 = await get('/api/recall/prompt?topicId=os_deadlock', token1);
  const evalIncorrect = await post('/api/recall/grade', {
    promptId: promptRes2.data.promptId,
    topicId: 'os_deadlock',
    studentAnswer: 'Deadlocks happen because of memory leaks and cpu cache misses.'
  }, token1);

  assert.strictEqual(evalIncorrect.status, 200);
  assert.strictEqual(evalIncorrect.data.isCorrect, false);
  assert(evalIncorrect.data.score < 60, `Score should be < 60, got ${evalIncorrect.data.score}`);
  assert(evalIncorrect.data.bktUpdate, 'BKT update must be computed');
  console.log(`✓ Test 4 Passed: Incorrect answer evaluated with constructive feedback`);

  // Test 5: Partially correct answer receives useful feedback
  console.log('Test 5: Evaluating a partially correct answer...');
  const promptResPartial = await get('/api/recall/prompt?topicId=os_sync&type=short_answer', token1);
  const evalPartial = await post('/api/recall/grade', {
    promptId: promptResPartial.data.promptId,
    topicId: 'os_sync',
    studentAnswer: 'Mutual exclusion and progress are required for critical section solutions.'
  }, token1);

  assert.strictEqual(evalPartial.status, 200);
  assert(evalPartial.data.missingPoints.length > 0 || evalPartial.data.correctPoints.length > 0, 'Must provide concept points breakdown');
  console.log('✓ Test 5 Passed: Partial evaluation provided structured points breakdown');

  // Test 6 & 7: BKT persistence in database
  console.log('Test 6 & 7: Verifying mastery persistence in SQLite...');
  const dbMastery = db.prepare('SELECT p_know FROM mastery WHERE user_id = ? AND topic_id = ?').get(user1Id, 'os_scheduling');
  assert(dbMastery !== undefined, 'Mastery row must exist');
  assert.strictEqual(dbMastery.p_know, evalCorrect.data.bktUpdate.newPKnow);
  console.log(`✓ Test 6 & 7 Passed: Mastery correctly persisted in SQLite as ${dbMastery.p_know}`);

  // Test 8: Empty or invalid submission does not update BKT
  console.log('Test 8: Verifying blank submission handling...');
  const prevAttemptsCount = db.prepare('SELECT count(*) as count FROM attempts WHERE user_id = ?').get(user1Id).count;
  const evalBlank = await post('/api/recall/grade', {
    promptId: promptRes.data.promptId,
    topicId: 'os_scheduling',
    studentAnswer: '   '
  }, token1);

  assert.strictEqual(evalBlank.status, 200);
  assert.strictEqual(evalBlank.data.score, 0);
  assert.strictEqual(evalBlank.data.bktUpdate, null, 'Blank response must NOT update BKT');
  const afterBlankCount = db.prepare('SELECT count(*) as count FROM attempts WHERE user_id = ?').get(user1Id).count;
  assert.strictEqual(prevAttemptsCount, afterBlankCount, 'Attempt count must not increment on blank submission');
  console.log('✓ Test 8 Passed: Empty submission rejected safely without BKT modification');

  // Test 9: Idempotency (repeated clicks do not double count)
  console.log('Test 9: Verifying submission idempotency...');
  const evalRepeat = await post('/api/recall/grade', {
    promptId: promptRes.data.promptId,
    topicId: 'os_scheduling',
    studentAnswer: correctAns
  }, token1);

  assert.strictEqual(evalRepeat.status, 200);
  assert.strictEqual(evalRepeat.data.bktUpdate.newPKnow, dbMastery.p_know, 'Mastery should not double increase on immediate retry');
  console.log('✓ Test 9 Passed: Duplicate attempt submission handled idempotently');

  // Test 10: Student isolation (Alice cannot view Bob\'s history)
  console.log('Test 10: Verifying student recall history isolation...');
  const history1 = await get('/api/recall/history', token1);
  const history2 = await get('/api/recall/history', token2);

  assert.strictEqual(history1.status, 200);
  assert.strictEqual(history2.status, 200);
  assert(history1.data.history.length > 0, 'Alice should have recorded attempts');
  assert.strictEqual(history2.data.history.length, 0, 'Bob should have 0 attempts');
  console.log('✓ Test 10 Passed: Student recall history is strictly isolated');

  // Test 11: Adaptive next step recommendation
  console.log('Test 11: Checking adaptive next step recommendations...');
  assert(evalCorrect.data.nextAction, 'nextAction must exist');
  assert(evalCorrect.data.nextAction.url, 'nextAction must have target URL');
  assert(evalCorrect.data.nextAction.reason, 'nextAction must provide reasoning');
  console.log(`✓ Test 11 Passed: Next action recommended: "${evalCorrect.data.nextAction.label}" -> ${evalCorrect.data.nextAction.url}`);

  server.close();
  console.log('======================================================');
  console.log('🎉 All 11 Active Recall Tests Passed Successfully!');
  console.log('======================================================');
}

runActiveRecallTests().catch(err => {
  console.error('Active Recall test failed:', err);
  if (server) server.close();
  process.exit(1);
});
