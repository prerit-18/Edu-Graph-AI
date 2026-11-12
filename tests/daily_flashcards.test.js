const assert = require('assert');
const stub = require('./gemini_stub');
const db = require('../backend/database/db');
const llm = require('../backend/agents/llm_client');
const daily = require('../backend/services/daily_flashcards');
const bktTool = require('../backend/tools/bkt_tool');
const { getMastery } = require('../backend/knowledge_tracing/bkt');

function newUser(label) {
  const id = `u_${label}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, label, `${id}@t.local`, 'x');
  return id;
}
const sessions = id => db.prepare('SELECT COUNT(*) c FROM fc_daily_sessions WHERE user_id = ?').get(id).c;
const cardsCount = id => db.prepare('SELECT COUNT(*) c FROM fc_daily_cards WHERE user_id = ?').get(id).c;
const T0 = new Date('2026-03-10T12:00:00Z');

(async () => {
  console.log('--- Daily Smart Flashcards ---');
  stub.install(); stub.reset('ok');

  // timezone-aware daily date
  assert.strictEqual(daily.localDate('Pacific/Kiritimati', T0), '2026-03-11');
  assert.strictEqual(daily.localDate('Pacific/Pago_Pago', T0), '2026-03-10');
  assert.strictEqual(daily.isValidTimezone('Not/AZone'), false);
  console.log('✓ session date follows the learner timezone (UTC+14 vs UTC-11 on the same instant)');

  // ---- Gemini failures never leave partial sessions
  for (const [mode, code] of [['invalid_key', 'INVALID_KEY'], ['quota', 'QUOTA'], ['network', 'NETWORK'], ['malformed', 'MALFORMED'], ['bad_cards', 'VALIDATION'], ['bad_calc', 'VALIDATION']]) {
    const u = newUser('fail_' + mode); stub.reset(mode);
    await assert.rejects(daily.getToday(u, { tz: 'UTC', now: T0 }), e => e.status === 503 && e.code === 'AI_UNAVAILABLE', mode);
    assert.strictEqual(sessions(u), 0, `${mode}: no session row left behind`); assert.strictEqual(cardsCount(u), 0, `${mode}: no partial cards`);
  }
  console.log('✓ invalid key / quota / network / malformed JSON / impersonated-PYQ / bad arithmetic -> 503, nothing persisted');


  stub.reset('ok');
  // ---- brand-new learner: transparent fallback, exactly one Gemini call
  const a = newUser('newbie');
  const s1 = await daily.getToday(a, { tz: 'Asia/Kolkata', now: T0 });
  assert.strictEqual(s1.cards.length, 5);
  assert.strictEqual(stub.state.calls, 1, 'one structured Gemini call for five cards');
  assert.strictEqual(s1.actualBreakdown.strong, 0, 'no data -> nothing is labelled strong');
  assert(s1.cards.every(c => c.card_label === 'new_topic'), 'cards are honestly labelled new_topic');
  assert(s1.distribution.fallbackReasons.length > 0, 'fallback reasons are stored and shown');
  assert(s1.cards.every(c => c.origin === 'ai_generated_practice' && c.question && c.answer && c.explanation && c.difficulty && c.subject && c.sources.length));
  assert.strictEqual(new Set(s1.cards.map(c => c.topic_id)).size, 5, 'five distinct topics');
  console.log('✓ new learner: 5 cards, transparent fallback labels, 1 Gemini call');

  // ---- refresh / reopen the same day: same session, no new Gemini call
  const calls = stub.state.calls;
  const s1b = await daily.getToday(a, { tz: 'Asia/Kolkata', now: new Date(T0.getTime() + 3600e3) });
  const s1c = await daily.getToday(a, { tz: 'Asia/Kolkata', now: new Date(T0.getTime() + 5 * 3600e3) });
  assert.strictEqual(s1b.sessionId, s1.sessionId); assert.strictEqual(s1c.sessionId, s1.sessionId);
  assert.deepStrictEqual(s1b.cards.map(c => c.id), s1.cards.map(c => c.id));
  assert.strictEqual(stub.state.calls, calls, 'no Gemini call when the session exists');
  assert.strictEqual(sessions(a), 1); assert.strictEqual(cardsCount(a), 5);
  console.log('✓ refresh/return same day restores the same 5 cards without calling Gemini');

  // ---- concurrency: 8 simultaneous first requests -> 1 session, 1 call
  const b = newUser('racer'); stub.state.calls = 0;
  const results = await Promise.all(Array.from({ length: 8 }, () => daily.getToday(b, { tz: 'UTC', now: T0 })));
  assert.strictEqual(new Set(results.map(r => r.sessionId)).size, 1);
  assert.strictEqual(sessions(b), 1); assert.strictEqual(cardsCount(b), 5);
  assert.strictEqual(stub.state.calls, 1, 'concurrent requests share one generation');
  console.log('✓ 8 concurrent requests -> 1 session, 5 cards, 1 Gemini call');

  // DB-level guarantee
  assert.throws(() => db.prepare("INSERT INTO fc_daily_sessions (id, user_id, session_date, timezone, status) VALUES ('dupx', ?, ?, 'UTC', 'ready')").run(b, results[0].sessionDate), /UNIQUE/);
  console.log('✓ UNIQUE(user_id, session_date) rejects duplicate sessions at the database level');

  // ---- personalised: 3 strong + 2 weak from real BKT data
  const c = newUser('learner');
  const strong = ['os_scheduling', 'os_sync', 'algo_dp'], weak = ['dbms_normalization', 'cn_routing'];
  for (const t of strong) for (let i = 0; i < 3; i++) bktTool.recordPractice(c, t, 'test', 'q', 'a', true, { type: 'MCQ' });
  for (const t of weak) for (let i = 0; i < 3; i++) bktTool.recordPractice(c, t, 'test', 'q', 'a', false, { type: 'MCQ' });
  stub.state.calls = 0;
  const s2 = await daily.getToday(c, { tz: 'UTC', now: T0 });
  assert.deepStrictEqual(s2.cards.filter(x => x.card_label === 'strong').map(x => x.topic_id).sort(), [...strong].sort());
  assert.deepStrictEqual(s2.cards.filter(x => x.card_label === 'weak').map(x => x.topic_id).sort(), [...weak].sort());
  assert.deepStrictEqual(s2.actualBreakdown, { strong: 3, weak: 2 });
  assert.deepStrictEqual(s2.distribution.fallbackReasons, []);
  assert(s2.cards.filter(x => x.card_label === 'strong').every(x => x.mastery_score >= 65));
  console.log('✓ learner with data: exactly 3 strong + 2 weak, chosen from BKT estimates, no fallback');

  // ---- feedback, resume, completion, "Got it" is not mastery
  const before = getMastery(c, 'os_scheduling').p_know;
  const f1 = daily.recordFeedback({ userId: c, sessionId: s2.sessionId, flashcardId: s2.cards[0].id, response: 'got_it' });
  assert.strictEqual(f1.cardsAnswered, 1);
  daily.recordFeedback({ userId: c, sessionId: s2.sessionId, flashcardId: s2.cards[0].id, response: 'got_it' }); // idempotent
  daily.recordFeedback({ userId: c, sessionId: s2.sessionId, flashcardId: s2.cards[1].id, response: 'need_practice' });
  const resumed = await daily.getToday(c, { tz: 'UTC', now: new Date(T0.getTime() + 7200e3) });
  assert.strictEqual(resumed.cardsAnswered, 2); assert.strictEqual(resumed.resumeIndex, 2);
  assert.strictEqual(resumed.cards[0].feedback, 'got_it'); assert.strictEqual(resumed.cards[1].feedback, 'need_practice');
  for (const card of s2.cards.slice(2)) daily.recordFeedback({ userId: c, sessionId: s2.sessionId, flashcardId: card.id, response: 'got_it' });
  const done = await daily.getToday(c, { tz: 'UTC', now: new Date(T0.getTime() + 9000e3) });
  assert.strictEqual(done.completed, true); assert(done.summary && done.summary.selfAssessmentOnly === true);
  assert.strictEqual(done.summary.topicsRecommended.length, 1);
  assert.throws(() => daily.recordFeedback({ userId: c, sessionId: s2.sessionId, flashcardId: s2.cards[0].id, response: 'need_practice' }), /already completed/);
  assert.throws(() => daily.recordFeedback({ userId: a, sessionId: s2.sessionId, flashcardId: s2.cards[0].id, response: 'got_it' }), /not found/, 'other users cannot write to my cards');
  assert.strictEqual(getMastery(c, 'os_scheduling').p_know, before, '"Got it" never changes BKT mastery');
  assert.strictEqual(stub.state.calls, 1, 'resume/complete never re-called Gemini');
  console.log('✓ feedback persisted, session resumes at first unanswered card, completes with summary, BKT untouched');

  // ---- next day: fresh, different cards, one new Gemini call
  stub.state.calls = 0;
  const day2 = await daily.getToday(c, { tz: 'UTC', now: new Date(T0.getTime() + 24 * 3600e3) });
  assert.notStrictEqual(day2.sessionId, s2.sessionId); assert.strictEqual(day2.sessionDate, '2026-03-11');
  assert.strictEqual(stub.state.calls, 1);
  const q1 = new Set(s2.cards.map(x => x.question));
  assert(day2.cards.every(x => !q1.has(x.question)), 'no question repeats from yesterday');
  assert.strictEqual(sessions(c), 2);
  console.log('✓ next day: new session, new questions, one new Gemini call, history kept');

  // retry after failure creates exactly one session
  const r = newUser('retry'); stub.reset('network');
  await assert.rejects(daily.getToday(r, { tz: 'UTC', now: T0, reuse: false }));
  stub.reset('ok');
  const rr = await Promise.all([daily.getToday(r, { tz: 'UTC', now: T0 }), daily.getToday(r, { tz: 'UTC', now: T0 })]);
  assert.strictEqual(rr[0].sessionId, rr[1].sessionId); assert.strictEqual(sessions(r), 1); assert.strictEqual(cardsCount(r), 5);
  console.log('✓ retry after an outage: exactly one session, five cards');

  // reuse of previously validated cards when Gemini is down (same topics, not shown to this learner before)
  const twin = newUser('twin');
  for (const t of strong) for (let i = 0; i < 3; i++) bktTool.recordPractice(twin, t, 'test', 'q', 'a', true, { type: 'MCQ' });
  for (const t of weak) for (let i = 0; i < 3; i++) bktTool.recordPractice(twin, t, 'test', 'q', 'a', false, { type: 'MCQ' });
  stub.reset('network'); stub.state.calls = 0;
  const reused = await daily.getToday(twin, { tz: 'UTC', now: new Date(T0.getTime() + 48 * 3600e3) });
  assert.strictEqual(reused.generatedBy, 'reused_validated');
  assert(reused.distribution.fallbackReasons.some(x => /reused/.test(x)), 'reuse is disclosed');
  assert.strictEqual(reused.cards.length, 5);
  const seenByTwin = new Set(db.prepare('SELECT content_hash h FROM fc_daily_cards WHERE user_id = ? AND session_id != ?').all(twin, reused.sessionId).map(r => r.h));
  assert(reused.cards.every(x => x.origin === 'ai_generated_practice'));
  console.log('✓ Gemini down + validated pool available: session built from reused cards and labelled as such');

  // validators in isolation
  const plan = daily.planSession(newUser('v'), '2026-03-10');
  assert.strictEqual(plan.slots.length, 5);
  assert.throws(() => daily.validateCards({ cards: [] }, plan, [], { hashes: new Set(), byTopic: new Map() }), /exactly 5/);
  console.log('🎉 Daily flashcard tests passed');
})().catch(e => { console.error('Daily flashcards test failed:', e); process.exit(1); });
