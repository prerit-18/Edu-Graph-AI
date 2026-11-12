const assert = require('assert');
const orchestrator = require('../backend/agents/orchestrator');
const db = require('../backend/database/db');

async function runAgentTests() {
  console.log('--- Testing CrewAI Agents & Orchestrator ---');

  const testUserId = 'test_agent_user_42';
  db.prepare('INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
    testUserId, 'Agent Test User', 'agent_test@example.com', 'dummyhash'
  );

  // 1. Concept Teacher: Grounded query
  console.log('Testing Concept Teacher (In-domain)...');
  const conceptResult = await orchestrator.askConcept({
    query: 'Explain CPU Scheduling algorithms and SRTF turnaround time',
    subject: 'Operating Systems',
    topicId: 'os_scheduling',
    userId: testUserId
  });
  assert.strictEqual(conceptResult.grounded, true, 'Should be grounded');
  assert(conceptResult.explanation.length > 50, 'Explanation should be substantial');
  assert(conceptResult.citations.length > 0, 'Should have citations');
  console.log('✓ Concept Teacher In-Domain OK');

  // 2. Concept Teacher: Out-of-domain query (must refuse)
  console.log('Testing Concept Teacher (Out-of-domain refusal)...');
  const refuseResult = await orchestrator.askConcept({
    query: 'How to bake sweet chocolate cookies in an oven',
    userId: testUserId
  });
  assert.strictEqual(refuseResult.grounded, false, 'Should NOT be grounded');
  assert(refuseResult.explanation.includes('Not covered'), 'Must display refusal notice');
  const nn = await orchestrator.askConcept({ query: 'explain neural networks backpropagation', userId: testUserId });
  assert.strictEqual(nn.grounded, false, 'ML topics outside GATE CSE must be refused');
  console.log('✓ Concept Teacher Refusal OK');

  // 3. PYQ Analyst
  console.log('Testing PYQ Analyst...');
  const pyqResult = await orchestrator.analyzePYQ({
    topicId: 'os_scheduling',
    userId: testUserId
  });
  assert(pyqResult.stats.total_questions > 0, 'Should find questions for os_scheduling');
  assert(pyqResult.analysis.length > 50, 'Analysis should be detailed');
  console.log('✓ PYQ Analyst OK');

  // 4. Problem Solver with correct answer -> BKT Update
  console.log('Testing Problem Solver...');
  const solveResult = await orchestrator.solveProblem({
    questionId: 'os_2024_001',
    studentAnswer: '20',
    userId: testUserId
  });
  assert.strictEqual(solveResult.isCorrect, true, 'Answer 20 should be correct for os_2024_001');
  assert(solveResult.bktUpdate !== null, 'BKT update must be returned');
  assert(solveResult.bktUpdate.newPKnow > 0.30, 'P(Know) must increase');
  console.log(`✓ Problem Solver OK (New P(Know): ${solveResult.bktUpdate.newPKnow})`);

  // 5. Revision Agent
  console.log('Testing Revision Agent...');
  const revResult = await orchestrator.getRevisionSchedule({ userId: testUserId });
  assert(Array.isArray(revResult.allTopicsRanked), 'Should rank all topics');
  assert.strictEqual(revResult.allTopicsRanked.length, 1, 'only attempted topics are ranked');
  assert.strictEqual(revResult.topActionTopic, null, 'one attempt is insufficient data - no recommendation');
  assert(revResult.needsMoreData.some(t => t.topic_id === 'os_scheduling'), 'topic flagged as needing more data');
  const fresh = await orchestrator.getRevisionSchedule({ userId: 'nobody_ever_attempted_' + Date.now() });
  assert.strictEqual(fresh.insufficientData, true, 'a learner with no attempts gets an explicit insufficient-data answer');
  console.log('✓ Revision Agent OK (uses real data, handles insufficient data)');

  // 6. Active Recall Agent
  console.log('Testing Active Recall Agent...');
  const recallPrompt = await orchestrator.generateActiveRecall({
    topicId: 'os_scheduling',
    type: 'concept_recall',
    userId: testUserId
  });
  assert(recallPrompt.question.length > 10, 'Prompt should have question text');
  assert(recallPrompt.promptId, 'Prompt should have promptId');
  
  const gradeResult = await orchestrator.gradeActiveRecall({
    promptId: recallPrompt.promptId,
    topicId: 'os_scheduling',
    studentAnswer: 'SJF causes starvation for longer jobs. Aging increases process priority over time to prevent starvation.',
    userId: testUserId
  });
  assert.strictEqual(gradeResult.isCorrect, true, 'Recall with key concepts should be correct');
  assert(gradeResult.bktUpdate !== null, 'Should update BKT on completion');
  console.log(`✓ Active Recall OK (Grade score: ${gradeResult.score}%, BKT: ${gradeResult.bktUpdate.newPKnow})`);

  // 7. Mock Test Agent
  console.log('Testing Mock Test Agent...');
  const testExam = orchestrator.generateMockTest({ userId: testUserId, subject: 'All', count: 5 });
  assert.strictEqual(testExam.questions.length, 5, 'Should generate 5 questions');
  assert.strictEqual(new Set(testExam.questions.map(q => q.id)).size, 5, 'no duplicate questions');
  testExam.questions.forEach(q => { assert.strictEqual(q.answer, undefined, 'key must not be served'); });
  const evalResult = orchestrator.evaluateMockTest({
    testId: testExam.testId,
    submissions: [{ questionId: testExam.questions[0].id, answer: 'B' }, { questionId: 'not_in_this_test', answer: 'A' }],
    userId: testUserId
  });
  assert.strictEqual(evalResult.totalQuestions, 5);
  assert.strictEqual(evalResult.ignoredSubmissions, 1, 'questions outside the test are ignored');
  assert.throws(() => orchestrator.evaluateMockTest({ testId: testExam.testId, submissions: [], userId: testUserId }), /already been submitted/);
  console.log('✓ Mock Test Agent OK');

  console.log('All Agent tests passed successfully!');
}

runAgentTests().catch(err => {
  console.error('Agent test failed:', err);
  process.exit(1);
});
