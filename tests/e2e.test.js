const assert = require('assert');
const http = require('http');
const app = require('../backend/app');

// Start temporary test server
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

async function runE2EDemo() {
  console.log('======================================================');
  console.log('--- Phase 8: Running 16-Step Complete End-to-End Demo ---');
  console.log('======================================================');

  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const uniqueEmail = `gate_aspirant_${Date.now()}@example.com`;
  let authToken = null;
  let userId = null;

  // Step 1: Signup & Login
  console.log('Step 1: Student signs up and receives JWT token...');
  const authRes = await post('/api/auth/signup', {
    name: 'Prerit GATE Topper',
    email: uniqueEmail,
    password: 'password123'
  });
  assert.strictEqual(authRes.status, 201, 'Signup should succeed');
  authToken = authRes.data.token;
  userId = authRes.data.user.id;
  assert(authToken, 'Auth token should exist');
  console.log(`✓ Step 1 Passed: Registered user ${userId} with JWT token`);

  // Step 2: Dashboard shows initial mastery
  console.log('Step 2: Dashboard fetches learner state and initial mastery...');
  const dashRes1 = await get('/api/learner/dashboard', authToken);
  assert.strictEqual(dashRes1.status, 200);
  const initialMastery = dashRes1.data.mastery.find(m => m.topic_id === 'os_scheduling')?.p_know ?? 0.0;
  assert.strictEqual(initialMastery, 0.0, 'New account should start with 0.0 mastery');
  assert.strictEqual(dashRes1.data.summary.averageMastery, 0.0, 'New account should have 0% average mastery');
  dashRes1.data.subjectProgress.forEach(sp => {
    assert.strictEqual(sp.percentage, 0, `${sp.subject} progress should start at 0% for new accounts`);
  });
  console.log(`✓ Step 2 Passed: Initial P(Know) for os_scheduling = ${initialMastery}, all subject stats = 0%`);

  // Step 3 & 4 & 5 & 6: Concept Teacher with RAG grounding and citations
  console.log('Step 3-6: Student asks Concept Teacher: "Explain CPU scheduling"...');
  const conceptRes = await post('/api/agents/concept', {
    query: 'Explain CPU scheduling algorithms, turnaround time and SJF',
    subject: 'Operating Systems',
    topicId: 'os_scheduling'
  }, authToken);
  assert.strictEqual(conceptRes.status, 200);
  assert.strictEqual(conceptRes.data.grounded, true, 'Response must be grounded in GATE syllabus');
  assert(conceptRes.data.citations.length > 0, 'Response must include citations');
  console.log(`✓ Step 3-6 Passed: Grounded explanation returned with ${conceptRes.data.citations.length} citation(s)`);

  // Step 7 & 8: Student solves a PYQ
  console.log('Step 7-8: Student solves a PYQ with Problem Solver...');
  const solveRes = await post('/api/agents/solve', {
    questionId: 'os_2024_001',
    studentAnswer: '20'
  }, authToken);
  assert.strictEqual(solveRes.status, 200);
  assert.strictEqual(solveRes.data.isCorrect, true, 'Answer 20 should be marked correct');

  // Step 9 & 10: Attempt stored in SQLite and BKT updates mastery
  console.log('Step 9-10: Verifying attempt stored in SQLite and BKT updated...');
  assert(solveRes.data.bktUpdate, 'BKT update must be returned');
  const newPKnow = solveRes.data.bktUpdate.newPKnow;
  assert(newPKnow > initialMastery, `Mastery must increase from ${initialMastery} to ${newPKnow}`);
  console.log(`✓ Step 9-10 Passed: BKT updated mastery from ${initialMastery} to ${newPKnow}`);

  // Step 11: Dashboard changes
  console.log('Step 11: Checking dashboard reflects updated mastery...');
  const dashRes2 = await get('/api/learner/dashboard', authToken);
  const updatedTopic = dashRes2.data.mastery.find(m => m.topic_id === 'os_scheduling');
  assert.strictEqual(updatedTopic.p_know, newPKnow);
  console.log(`✓ Step 11 Passed: Dashboard reflects new P(Know): ${updatedTopic.p_know}`);

  // Step 12: Revision identifies weak/due topic
  console.log('Step 12: Revision Agent identifies due/weak topics...');
  const revRes = await get('/api/revision/schedule', authToken);
  assert.strictEqual(revRes.status, 200);
  assert(revRes.data.topActionTopic !== undefined, 'Revision schedule must recommend action');
  console.log(`✓ Step 12 Passed: Recommended study focus on: ${revRes.data.topActionTopic.topic_name}`);

  // Step 13: Active Recall creates a recall prompt
  console.log('Step 13: Active Recall generates a conceptual retrieval challenge...');
  const recallPrompt = await get(`/api/recall/prompt?topicId=os_scheduling`, authToken);
  assert.strictEqual(recallPrompt.status, 200);
  assert(recallPrompt.data.question, 'Recall question must exist');
  assert(recallPrompt.data.promptId, 'Prompt ID must exist');
  assert.strictEqual(recallPrompt.data.referenceAnswer, undefined, 'Pre-submission answer key must not be leaked');
  console.log(`✓ Step 13 Passed: Active Recall prompt created: "${recallPrompt.data.question.slice(0, 60)}..."`);

  // Step 14 & 15: Student answers and response is graded
  console.log('Step 14-15: Student answers recall prompt and receives AI grading...');
  const studentAnswer = 'SJF suffers from starvation of longer processes. Aging solves this by increasing priority over time.';
  const gradeRes = await post('/api/recall/grade', {
    promptId: recallPrompt.data.promptId,
    topicId: 'os_scheduling',
    studentAnswer
  }, authToken);
  assert.strictEqual(gradeRes.status, 200);
  assert.strictEqual(gradeRes.data.isCorrect, true);
  assert(gradeRes.data.referenceAnswer, 'Reference answer should now be returned post-evaluation');

  // Step 16: BKT updates again
  console.log('Step 16: Verifying second BKT update from active recall...');
  assert(gradeRes.data.bktUpdate, 'BKT update must exist for recall attempt');
  const secondPKnow = gradeRes.data.bktUpdate.newPKnow;
  assert(secondPKnow > newPKnow, `Second BKT update must advance mastery: ${newPKnow} -> ${secondPKnow}`);
  console.log(`✓ Step 16 Passed: BKT updated again to ${secondPKnow}!`);

  server.close();
  console.log('======================================================');
  console.log('🎉 All 16 Steps of the Complete End-to-End Demo Succeeded!');
  console.log('======================================================');
}

runE2EDemo().catch(err => {
  console.error('E2E Demo failed:', err);
  if (server) server.close();
  process.exit(1);
});
