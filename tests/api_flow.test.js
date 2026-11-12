const assert = require('assert');
const { startServer, request, signup } = require('./http_helper');
const db = require('../backend/database/db');
const bank = require('../backend/services/question_bank');
const { rateLimit } = require('../backend/middleware/rateLimit');

(async () => {
  console.log('--- API flow: auth, PYQ practice, mock, revision, flashcards ---');
  const { server, baseUrl } = await startServer();
  const R = (m, u, d, t) => request(baseUrl, m, u, d, t);
  try {
    // ---------------- data integrity
    const orphan = db.prepare('SELECT COUNT(*) c FROM questions WHERE topic_id NOT IN (SELECT id FROM topics)').get().c;
    assert.strictEqual(orphan, 0, 'every stored question references an existing topic');
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM questions WHERE origin = 'synthetic_practice' AND verification_status != 'synthetic'").get().c, 0);
    console.log('✓ no orphan question topics; practice set is labelled synthetic');

    // ---------------- auth
    assert.strictEqual((await R('POST', '/api/auth/signup', { email: 'a@b.co', password: 'short' })).status, 400);
    assert.strictEqual((await R('POST', '/api/auth/signup', { email: 'not-an-email', password: 'longenough1' })).status, 400);
    const u = await signup(baseUrl, 'Mixed.Case');
    const dup = await R('POST', '/api/auth/signup', { email: u.email.toUpperCase(), password: 'password123' });
    assert.strictEqual(dup.status, 400, 'emails are case-insensitive unique');
    assert.strictEqual((await R('POST', '/api/auth/login', { email: u.email.toUpperCase(), password: 'password123' })).status, 200);
    assert.strictEqual((await R('POST', '/api/auth/login', { email: "' OR 1=1 --", password: 'x' })).status, 401);
    for (const [m, ep] of [['POST', '/api/agents/solve'], ['POST', '/api/agents/concept'], ['GET', '/api/mock/start'], ['GET', '/api/pyq'], ['GET', '/api/flashcards/smart-session'], ['GET', '/api/agents/token-report']]) {
      assert.strictEqual((await R(m, ep, {})).status, 401, `${ep} requires login`);
    }
    assert.strictEqual((await R('GET', '/api/agents/token-report', null, u.token)).status, 403, 'token report is admin-only');
    console.log('✓ auth validation, case-insensitive emails, protected routes');

    // ---------------- PYQ listing never leaks keys
    const list = await R('GET', '/api/pyq?subject=Operating%20Systems&limit=50', null, u.token);
    assert.strictEqual(list.status, 200);
    assert(list.data.total >= 5);
    list.data.questions.forEach(q => { assert.strictEqual(q.answer, undefined); assert.strictEqual(q.explanation, undefined); });
    const filt = await R('GET', '/api/pyq/filters', null, u.token);
    assert(filt.data.years.length && filt.data.topics.length && filt.data.types.length);
    const nat = (await R('GET', '/api/pyq?type=NAT&limit=5', null, u.token)).data.questions[0];
    assert.strictEqual(nat.type, 'NAT');
    console.log('✓ PYQ list/filter endpoints work and never include answers');

    // ---------------- solving rules
    const q = bank.search({ topic_id: 'os_deadlock', type: 'MCQ' }).questions[0];
    const noAns = await R('POST', '/api/agents/solve', { questionId: q.id }, u.token);
    assert.strictEqual(noAns.data.officialAnswer, null, 'key hidden until the student answers');
    assert.strictEqual(noAns.data.explanation, null);
    assert.strictEqual(noAns.data.bktUpdate, null);
    const wrongLetter = ['A', 'B', 'C', 'D'].find(l => l !== q.answer);
    const wrong = await R('POST', `/api/pyq/${q.id}/attempt`, { answer: wrongLetter }, u.token);
    assert.strictEqual(wrong.data.isCorrect, false);
    assert.strictEqual(wrong.data.officialAnswer, q.answer);
    assert(wrong.data.explanation);
    assert(wrong.data.bktUpdate.newPKnow < wrong.data.bktUpdate.previousPKnow);
    assert.strictEqual(wrong.data.marksAwarded, -(Number(q.negative_marks) || 0));
    const m1 = db.prepare('SELECT n_attempts, n_correct FROM mastery WHERE user_id = ? AND topic_id = ?').get(u.id, 'os_deadlock');
    assert.deepStrictEqual({ ...m1 }, { n_attempts: 1, n_correct: 0 });
    console.log(`✓ solver: hidden key, official-key grading, negative marking, BKT ${wrong.data.bktUpdate.previousPKnow} -> ${wrong.data.bktUpdate.newPKnow}`);

    // custom problem: unverified, never touches BKT
    const custom = await R('POST', '/api/agents/solve', { questionText: 'What is the time complexity of binary search on a sorted array?', studentAnswer: 'log n' }, u.token);
    assert.strictEqual(custom.status, 200);
    assert.strictEqual(custom.data.bktUpdate, null);
    assert.strictEqual(custom.data.verificationStatus, 'unverified');
    assert.strictEqual((await R('POST', '/api/agents/solve', { questionId: 'does_not_exist', studentAnswer: 'A' }, u.token)).status, 404);
    console.log('✓ custom problems are unverified and never affect mastery; unknown ids -> 404');

    // ---------------- revision + flashcards use the real learner data
    const wrong2 = await R('POST', `/api/pyq/${q.id}/attempt`, { answer: wrongLetter }, u.token);
    assert(wrong2.data.bktUpdate);
    const rev = await R('GET', '/api/revision/schedule', null, u.token);
    assert.strictEqual(rev.data.topActionTopic.topic_id, 'os_deadlock', 'two wrong attempts make os_deadlock the top revision topic');
    assert.strictEqual(rev.data.topActionTopic.status, 'weak');
    assert(rev.data.topActionTopic.suggestedPractice.every(p => p.id !== q.id), 'already-attempted question is not re-suggested');
    assert(rev.data.allTopicsRanked.every(t => t.last_seen), 'unattempted topics are never ranked');
    const cls = await R('GET', '/api/flashcards/topic-classification', null, u.token);
    const weakIds = (cls.data.weakTopics || cls.data.classification?.weakTopics || []).map(t => t.topic_id);
    assert(weakIds.includes('os_deadlock'), 'smart flashcards classify the topic as weak from BKT');
    const sess = await R('GET', '/api/flashcards/today', null, u.token);
    assert.strictEqual(sess.status, 503, 'with no Gemini key the endpoint refuses instead of inventing cards');
    assert.strictEqual(sess.data.code, 'AI_UNAVAILABLE');
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM fc_daily_sessions WHERE user_id = ?').get(u.id).c, 0, 'nothing persisted');
    console.log('✓ revision + smart flashcards reflect actual performance');

    // ---------------- mock tests
    const bob = await signup(baseUrl, 'bob');
    const t = await R('GET', '/api/mock/start?subject=All&count=8&origin=practice', null, u.token);
    assert.strictEqual(t.status, 200);
    assert.strictEqual(new Set(t.data.questions.map(x => x.id)).size, t.data.questions.length, 'no duplicate questions');
    t.data.questions.forEach(x => assert.strictEqual(x.answer, undefined));
    const expectScore = (picks) => picks.reduce((a, [id, ans]) => a + bank.evaluateAnswer(bank.getById(id), ans).marksAwarded, 0);
    // answer first question correctly, second wrongly, rest blank
    const [q1, q2] = t.data.questions.map(x => bank.getById(x.id));
    const right = q1.type === 'NAT' ? String(q1.numeric_answer ?? q1.answer) : q1.answer;
    const wrongAns = q2.type === 'NAT' ? '987654' : (['A', 'B', 'C', 'D'].find(l => l !== q2.answer));
    assert.strictEqual((await R('POST', '/api/mock/submit', { testId: t.data.testId, submissions: [] }, bob.token)).status, 404, "another user's test is not accessible");
    const sub = await R('POST', '/api/mock/submit', { testId: t.data.testId, submissions: [{ questionId: q1.id, answer: right }, { questionId: q2.id, answer: wrongAns }] }, u.token);
    assert.strictEqual(sub.status, 200);
    assert.strictEqual(sub.data.correctCount, 1);
    assert.strictEqual(sub.data.wrongCount, 1);
    assert.strictEqual(sub.data.unattemptedCount, t.data.questions.length - 2);
    assert.strictEqual(sub.data.score, Number(expectScore([[q1.id, right], [q2.id, wrongAns]]).toFixed(2)), 'score follows GATE marking scheme');
    assert.strictEqual((await R('POST', '/api/mock/submit', { testId: t.data.testId, submissions: [] }, u.token)).status, 409, 'cannot submit twice');
    assert.strictEqual((await R('GET', '/api/mock/history', null, u.token)).data.history.length, 1);
    console.log(`✓ mock: no repeats, keys hidden, score ${sub.data.score}/${sub.data.maxScore}, one submission, history stored`);
    assert.strictEqual((await R('GET', '/api/mock/start?subject=Nonexistent%20Subject&count=5', null, u.token)).status, 404);

    // ---------------- concept: related PYQs + refusal
    const c = await R('POST', '/api/agents/concept', { query: 'Explain deadlock prevention', topicId: 'os_deadlock' }, u.token);
    assert.strictEqual(c.data.grounded, true);
    assert(c.data.relatedQuestions.length > 0 && c.data.relatedQuestions.every(r => r.id));
    assert(['curated', 'syllabus_only', 'llm', 'crewai'].includes(c.data.generatedBy));
    const off = await R('POST', '/api/agents/concept', { query: 'recipe for a chocolate cake' }, u.token);
    assert.strictEqual(off.data.grounded, false);
    assert.strictEqual((await R('POST', '/api/agents/concept', { query: 'x' }, u.token)).status, 400);
    console.log('✓ concept study: grounded answer + related PYQs; refusal for off-topic; input validated');

    // ---------------- rate limiter unit check
    const lim = rateLimit({ windowMs: 60000, max: 2, name: 't' });
    let blocked = 0;
    for (let i = 0; i < 4; i++) lim({ ip: 'x', user: null }, { set() {}, status() { blocked++; return { json() {} }; } }, () => {});
    assert.strictEqual(blocked, 2, 'third and fourth request are rejected');
    console.log('✓ rate limiter blocks over-limit requests');
    console.log('🎉 API flow tests passed');
  } finally { server.close(); }
})().catch(e => { console.error('API flow test failed:', e); process.exit(1); });
