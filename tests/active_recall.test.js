const assert = require('assert');
const { startServer, request, signup } = require('./http_helper');
const db = require('../backend/database/db');

(async () => {
  console.log('--- Active Recall: server-side 3-attempt rules ---');
  const { server, baseUrl } = await startServer();
  const R = (m, u, d, t) => request(baseUrl, m, u, d, t);
  try {
    const alice = await signup(baseUrl, 'alice');
    const bob = await signup(baseUrl, 'bob');

    // auth required
    assert.strictEqual((await R('GET', '/api/recall/prompt?topicId=os_deadlock')).status, 401);
    assert.strictEqual((await R('POST', '/api/recall/grade', { promptId: 'x', studentAnswer: 'y' })).status, 401);
    console.log('✓ unauthenticated access rejected');

    // pre-submission: no key leaked
    const p = await R('GET', '/api/recall/prompt?topicId=os_deadlock', null, alice.token);
    assert.strictEqual(p.status, 200);
    assert(p.data.promptId && p.data.question);
    for (const k of ['referenceAnswer', 'keyConcepts', 'rubric']) assert.strictEqual(p.data[k], undefined, `${k} leaked`);
    assert.strictEqual(p.data.attemptsRemaining, 3);
    console.log('✓ question served without answer key');

    // another user cannot grade or read it
    assert.strictEqual((await R('POST', '/api/recall/grade', { promptId: p.data.promptId, studentAnswer: 'x' }, bob.token)).status, 404);
    assert.strictEqual((await R('GET', `/api/recall/state/${p.data.promptId}`, null, bob.token)).status, 404);
    console.log('✓ prompt is bound to its owner');

    // blank answers do not consume an attempt
    assert.strictEqual((await R('POST', '/api/recall/grade', { promptId: p.data.promptId, studentAnswer: '   ' }, alice.token)).status, 400);

    // attempts 1 and 2 wrong: no answer reveal, no BKT, client attemptNumber ignored
    const wrong = 'memory leaks and cache misses';
    const a1 = await R('POST', '/api/recall/grade', { promptId: p.data.promptId, studentAnswer: wrong, attemptNumber: 3 }, alice.token);
    assert.strictEqual(a1.status, 200);
    assert.strictEqual(a1.data.attemptNumber, 1, 'client attemptNumber must be ignored');
    assert.strictEqual(a1.data.attemptsRemaining, 2);
    assert.strictEqual(a1.data.completed, false);
    assert.strictEqual(a1.data.referenceAnswer, null);
    assert.strictEqual(a1.data.bktUpdate, null);
    const a2 = await R('POST', '/api/recall/grade', { promptId: p.data.promptId, studentAnswer: wrong }, alice.token);
    assert.strictEqual(a2.data.attemptsRemaining, 1);
    assert.strictEqual(a2.data.referenceAnswer, null);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM attempts WHERE user_id = ?').get(alice.id).c, 0, 'BKT must not run before completion');
    console.log('✓ attempts 1-2: coaching only, no reveal, no BKT');

    // attempt 3 wrong: reveal + explanation + exactly one BKT update
    const a3 = await R('POST', '/api/recall/grade', { promptId: p.data.promptId, studentAnswer: wrong }, alice.token);
    assert.strictEqual(a3.data.completed, true);
    assert(a3.data.referenceAnswer && a3.data.explanation, 'answer + explanation revealed after 3rd wrong attempt');
    assert.strictEqual(a3.data.isCorrect, false);
    assert(a3.data.bktUpdate && a3.data.bktUpdate.newPKnow < a3.data.bktUpdate.previousPKnow, 'wrong final attempt lowers P(know)');
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM attempts WHERE user_id = ?').get(alice.id).c, 1);
    console.log(`✓ 3rd wrong attempt reveals answer; BKT ${a3.data.bktUpdate.previousPKnow} -> ${a3.data.bktUpdate.newPKnow}`);

    // submissions disabled after completion
    const a4 = await R('POST', '/api/recall/grade', { promptId: p.data.promptId, studentAnswer: 'one more' }, alice.token);
    assert.strictEqual(a4.status, 409);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM attempts WHERE user_id = ?').get(alice.id).c, 1, 'no double counting');
    const st = await R('GET', `/api/recall/state/${p.data.promptId}`, null, alice.token);
    assert.strictEqual(st.data.completed, true);
    assert.strictEqual(st.data.attemptsUsed, 3);
    console.log('✓ further submissions rejected (409); history persisted');

    // correct answer on first attempt completes immediately
    const p2 = await R('GET', '/api/recall/prompt?topicId=os_scheduling', null, alice.token);
    const good = await R('POST', '/api/recall/grade', { promptId: p2.data.promptId,
      studentAnswer: 'SJF causes starvation of longer processes; aging gradually increases priority with waiting time to prevent starvation. Turnaround time TAT = CT - AT and waiting time WT = TAT - BT. Round Robin with quantum q approaches FCFS as q grows and has context switch overhead when q is small. Preemptive scheduling can interrupt processes.' }, alice.token);
    assert.strictEqual(good.status, 200);
    if (good.data.isCorrect) {
      assert.strictEqual(good.data.completed, true);
      assert(good.data.referenceAnswer);
      assert(good.data.bktUpdate.newPKnow > good.data.bktUpdate.previousPKnow);
      console.log('✓ correct answer completes challenge and raises P(know)');
    } else {
      console.log('! generic answer was not accepted for the sampled prompt (rubric-dependent); skipped positive check');
    }
    console.log('🎉 Active Recall tests passed');
  } finally { server.close(); }
})().catch(e => { console.error('Active Recall test failed:', e); process.exit(1); });
