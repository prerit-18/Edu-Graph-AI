const assert = require('assert');
const db = require('../backend/database/db');
const smartFlashcardsService = require('../backend/services/smart_flashcards');
const crypto = require('crypto');

console.log('--- Testing Smart Flashcards (3 Strong + 2 Weak) ---');

// Helper to create a unique test user
function createTestUser(name = 'Test Student') {
  const userId = `test_user_sf_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash)
    VALUES (?, ?, ?, ?)
  `).run(userId, name, `${userId}@example.com`, 'hash123');
  return userId;
}

// -------------------------------------------------------------
// Test 1: Student with both Strong and Weak Topics
// -------------------------------------------------------------
console.log('\n[Test 1] Student with both Strong and Weak Topics:');
const userBoth = createTestUser('Student Both');

// Set up 2 strong topics (p_know >= 0.75 and >= 2 attempts)
const strongTopics = ['algo_asymptotic', 'algo_searching_sorting_hashing'];
strongTopics.forEach(tId => {
  db.prepare(`
    INSERT INTO mastery (user_id, topic_id, p_know, last_seen)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userBoth, tId, 0.85);

  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO attempts (id, user_id, topic_id, agent, question, answer, correct)
      VALUES (?, ?, ?, 'TestAgent', 'Q', 'A', 1)
    `).run(crypto.randomUUID(), userBoth, tId);
  }
});

// Set up 2 weak topics (p_know <= 0.35 and >= 2 attempts)
const weakTopics = ['os_deadlock', 'cn_routing'];
weakTopics.forEach(tId => {
  db.prepare(`
    INSERT INTO mastery (user_id, topic_id, p_know, last_seen)
    VALUES (?, ?, ?, datetime('now'))
  `).run(userBoth, tId, 0.25);

  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO attempts (id, user_id, topic_id, agent, question, answer, correct)
      VALUES (?, ?, ?, 'TestAgent', 'Q', 'A', 0)
    `).run(crypto.randomUUID(), userBoth, tId);
  }
});

const classification1 = smartFlashcardsService.classifyTopics(userBoth);
assert(classification1.strongTopics.length >= 2, 'Should classify at least 2 strong topics');
assert(classification1.weakTopics.length >= 2, 'Should classify at least 2 weak topics');
console.log(`✓ Classification verified: ${classification1.strongTopics.length} Strong, ${classification1.weakTopics.length} Weak`);

const session1 = smartFlashcardsService.generateSession(userBoth);
assert.strictEqual(session1.totalCards, 5, 'Session must generate exactly 5 cards');
assert.strictEqual(new Set(session1.cards.map(c => c.id)).size, 5, 'Zero duplicates in session');
assert.strictEqual(session1.actualBreakdown.strong, 3, 'Must have 3 strong cards');
assert.strictEqual(session1.actualBreakdown.weak, 2, 'Must have 2 weak cards');
console.log('✓ Session 1 generated exactly 5 unique cards: 3 Strong + 2 Weak');

// -------------------------------------------------------------
// Test 2: Student with ONLY Strong Topics
// -------------------------------------------------------------
console.log('\n[Test 2] Student with ONLY Strong Topics (Handling fallback for weak slots):');
const userOnlyStrong = createTestUser('Student High Achiever');
['algo_asymptotic', 'algo_searching_sorting_hashing', 'algo_dp'].forEach(tId => {
  db.prepare(`
    INSERT INTO mastery (user_id, topic_id, p_know, last_seen)
    VALUES (?, ?, 0.92, datetime('now'))
  `).run(userOnlyStrong, tId);
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO attempts (id, user_id, topic_id, agent, question, answer, correct)
      VALUES (?, ?, ?, 'TestAgent', 'Q', 'A', 1)
    `).run(crypto.randomUUID(), userOnlyStrong, tId);
  }
});

const session2 = smartFlashcardsService.generateSession(userOnlyStrong);
assert.strictEqual(session2.totalCards, 5, 'Must generate exactly 5 cards even when 0 weak topics exist');
assert.strictEqual(new Set(session2.cards.map(c => c.id)).size, 5, 'No duplicates in only-strong session');
assert.strictEqual(session2.actualBreakdown.strong, 3, 'Must have 3 strong cards');
assert.strictEqual(session2.actualBreakdown.weak, 2, 'Must have 2 weak cards (filled gracefully via diagnostic/unseen fallback)');
assert(session2.fallbackUsed, 'Should note fallback was used for weak slots');
console.log('✓ Graceful fallback handled when 0 weak topics exist: Exactly 5 unique cards delivered');

// -------------------------------------------------------------
// Test 3: Student with ONLY Weak Topics
// -------------------------------------------------------------
console.log('\n[Test 3] Student with ONLY Weak Topics (Handling fallback for strong slots):');
const userOnlyWeak = createTestUser('Student Struggling');
['os_scheduling', 'os_sync', 'os_deadlock'].forEach(tId => {
  db.prepare(`
    INSERT INTO mastery (user_id, topic_id, p_know, last_seen)
    VALUES (?, ?, 0.20, datetime('now'))
  `).run(userOnlyWeak, tId);
  for (let i = 0; i < 3; i++) {
    db.prepare(`
      INSERT INTO attempts (id, user_id, topic_id, agent, question, answer, correct)
      VALUES (?, ?, ?, 'TestAgent', 'Q', 'A', 0)
    `).run(crypto.randomUUID(), userOnlyWeak, tId);
  }
});

const session3 = smartFlashcardsService.generateSession(userOnlyWeak);
assert.strictEqual(session3.totalCards, 5, 'Must generate exactly 5 cards even when 0 strong topics exist');
assert.strictEqual(new Set(session3.cards.map(c => c.id)).size, 5, 'No duplicates in only-weak session');
assert.strictEqual(session3.actualBreakdown.strong, 3, 'Must have 3 strong cards (filled via foundational fallback)');
assert.strictEqual(session3.actualBreakdown.weak, 2, 'Must have 2 weak cards');
assert(session3.fallbackUsed, 'Should note fallback was used for strong slots');
console.log('✓ Graceful fallback handled when 0 strong topics exist: Exactly 5 unique cards delivered');

// -------------------------------------------------------------
// Test 4: Student with Insufficient Learning History
// -------------------------------------------------------------
console.log('\n[Test 4] Student with Insufficient Learning History (1 question only):');
const userOneQuestion = createTestUser('Student One Attempt');
db.prepare(`
  INSERT INTO attempts (id, user_id, topic_id, agent, question, answer, correct)
  VALUES (?, ?, 'dbms_normalization', 'TestAgent', 'Q', 'A', 1)
`).run(crypto.randomUUID(), userOneQuestion);

const classification4 = smartFlashcardsService.classifyTopics(userOneQuestion);
assert.strictEqual(classification4.strongTopics.length, 0, 'Topic with 1 question should NOT be classified as strong');
assert.strictEqual(classification4.weakTopics.length, 0, 'Topic with 1 question should NOT be classified as weak');
assert.strictEqual(classification4.insufficientDataTopics.length, 1, 'Topic with 1 question must be placed in insufficientDataTopics');
assert.strictEqual(classification4.insufficientDataTopics[0].topic_id, 'dbms_normalization', 'Must identify correct topic');
console.log('✓ Rule verified: Single question attempt is handled as insufficient data and NOT classified prematurely');

// -------------------------------------------------------------
// Test 5: Brand New Student (Zero Learning History)
// -------------------------------------------------------------
console.log('\n[Test 5] Brand New Student (Zero learning history):');
const userNew = createTestUser('Brand New Student');
const session5 = smartFlashcardsService.generateSession(userNew);
assert.strictEqual(session5.totalCards, 5, 'Must generate exactly 5 baseline cards');
assert.strictEqual(new Set(session5.cards.map(c => c.id)).size, 5, 'Zero duplicates in new student session');
console.log('✓ Baseline session generated cleanly for brand new student');

// -------------------------------------------------------------
// Test 6: Feedback Recording & Session Summary Generation
// -------------------------------------------------------------
console.log('\n[Test 6] Feedback Recording and Session Summary Generation:');
const userFeedback = createTestUser('Student Feedback');
const session6 = smartFlashcardsService.generateSession(userFeedback);

// Submit feedback for card 1..4 (in-progress)
for (let i = 0; i < 4; i++) {
  const card = session6.cards[i];
  const resp = smartFlashcardsService.recordFeedback({
    sessionId: session6.sessionId,
    flashcardId: card.id,
    userId: userFeedback,
    response: i % 2 === 0 ? 'got_it' : 'need_practice'
  });
  assert.strictEqual(resp.sessionCompleted, false, `Card ${i+1} should not mark session complete`);
  assert.strictEqual(resp.cardsAnswered, i + 1, `Should report ${i+1} cards answered`);
}

// Submit 5th card (completing the session)
const finalResp = smartFlashcardsService.recordFeedback({
  sessionId: session6.sessionId,
  flashcardId: session6.cards[4].id,
  userId: userFeedback,
  response: 'got_it'
});

assert.strictEqual(finalResp.sessionCompleted, true, '5th card feedback must complete session');
assert(finalResp.summary, 'Must return session summary upon completion');
assert.strictEqual(finalResp.summary.flashcardsCompleted, 5, 'Summary must record 5 cards completed');
assert.strictEqual(finalResp.summary.strongReviewed, 3, 'Summary must record 3 strong cards');
assert.strictEqual(finalResp.summary.weakReviewed, 2, 'Summary must record 2 weak cards');
assert.strictEqual(finalResp.summary.gotItCount + finalResp.summary.needPracticeCount, 5, 'Got it + Need practice must equal 5');
assert(Array.isArray(finalResp.summary.topicsRecommended), 'Must provide recommended topics array');
console.log(`✓ Feedback saved and session completed: ${finalResp.summary.gotItCount} Got it, ${finalResp.summary.needPracticeCount} Need Practice`);
console.log(`✓ Recommended topics: ${finalResp.summary.topicsRecommended.map(t => t.topic_name).join(', ')}`);

// Verify history retrieval
const history = smartFlashcardsService.getHistory(userFeedback);
assert.strictEqual(history.length, 1, 'Must retrieve 1 completed session in history');
assert.strictEqual(history[0].sessionId, session6.sessionId, 'History must match session ID');
assert.strictEqual(history[0].completed, true, 'History must show completed = true');
console.log('✓ Session history successfully persisted in SQLite');

// -------------------------------------------------------------
// Test 7: Configurable Thresholds Verification
// -------------------------------------------------------------
console.log('\n[Test 7] Configurable Thresholds:');
const customThresholds = { strongThreshold: 0.90, weakThreshold: 0.60, minAttempts: 3 };
const customClassification = smartFlashcardsService.classifyTopics(userBoth, customThresholds);
assert.strictEqual(customClassification.thresholds.strongThreshold, 0.90);
assert.strictEqual(customClassification.thresholds.weakThreshold, 0.60);
console.log('✓ Thresholds are fully configurable without hardcoded assumptions');

console.log('\n======================================================');
console.log('🎉 ALL SMART FLASHCARD UNIT & INTEGRATION TESTS PASSED!');
console.log('======================================================');

