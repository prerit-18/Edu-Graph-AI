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
  assert(refuseResult.explanation.includes('Concept Grounding Notice'), 'Must display refusal notice');
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
  assert(revResult.topActionTopic !== undefined, 'Should recommend a focus topic');
  console.log(`✓ Revision Agent OK (Top Focus: ${revResult.topActionTopic.topic_name})`);

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
  assert(gradeResult.bktUpdate !== null, 'Should update BKT');
  console.log(`✓ Active Recall OK (Grade score: ${gradeResult.score}%, BKT: ${gradeResult.bktUpdate.newPKnow})`);

  // 7. Mock Test Agent
  console.log('Testing Mock Test Agent...');
  const testExam = orchestrator.generateMockTest({ subject: 'All', count: 5 });
  assert.strictEqual(testExam.questions.length, 5, 'Should generate 5 questions');

  const evalResult = orchestrator.evaluateMockTest({
    testId: testExam.testId,
    submissions: [
      { questionId: testExam.questions[0].id, answer: 'B' }
    ],
    userId: testUserId
  });
  assert(evalResult.totalQuestions === 1, 'Evaluated submissions count');
  console.log('✓ Mock Test Agent OK');

  console.log('All Agent tests passed successfully!');
}

runAgentTests().catch(err => {
  console.error('Agent test failed:', err);
  process.exit(1);
});
