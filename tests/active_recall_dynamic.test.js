const assert = require('assert');
const stub = require('./gemini_stub');
const db = require('../backend/database/db');
const orch = require('../backend/agents/orchestrator');
const bktTool = require('../backend/tools/bkt_tool');

function newUser(label) {
  const id = `r_${label}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, label, `${id}@t.local`, 'x');
  return id;
}
const gen = (userId, o = {}) => orch.generateActiveRecall({ topicId: 'os_deadlock', userId, ...o });
const grade = (userId, promptId, studentAnswer) => orch.gradeActiveRecall({ userId, promptId, studentAnswer });

(async () => {
  console.log('--- Dynamic Active Recall ---');
  stub.install(); stub.reset('ok');

  // fresh, grounded, labelled, key never leaked, learner level used
  const u = newUser('adv');
  for (let i = 0; i < 3; i++) bktTool.recordPractice(u, 'os_deadlock', 't', 'q', 'a', true, { type: 'MCQ' });
  const p1 = await gen(u);
  assert.strictEqual(p1.generation, 'gemini'); assert.strictEqual(p1.origin, 'ai_generated_practice');
  assert(/not an authentic GATE/.test(p1.label));
  for (const k of ['referenceAnswer', 'keyConcepts', 'rubric']) assert.strictEqual(p1[k], undefined);
  const brief = JSON.parse(stub.state.lastBody.contents[0].parts[0].text);
  assert.strictEqual(brief.learner_level, 'advanced'); assert.strictEqual(brief.difficulty, 'hard');
  assert(brief.syllabus && brief.syllabus.length > 20, 'grounded in the syllabus');
  const p2 = await gen(u);
  assert.notStrictEqual(p1.question, p2.question, 'a second request produces a different question');
  console.log('✓ generated question: grounded brief, learner level from BKT, labelled generated practice, no key leak, fresh each time');

  // paraphrase accepted via semantic evaluation; wrong answers keep the key hidden; 3rd reveals
  const w = await grade(u, p1.promptId, 'no idea at all');
  assert.strictEqual(w.completed, false); assert.strictEqual(w.referenceAnswer, null);
  const ok = await grade(u, p1.promptId, 'EQUIV: in other words, the same ideas expressed differently');
  console.log("DBG", JSON.stringify({s: ok.score, by: ok.evaluatedBy, f: ok.feedback})); assert.strictEqual(ok.isCorrect, true); assert.strictEqual(ok.evaluatedBy, 'gemini'); assert(ok.referenceAnswer && ok.completed);
  await assert.rejects(grade(u, p1.promptId, 'again'), /already complete/);
  console.log('✓ equivalent wording accepted (semantic grading), completion locks further submissions');

  // previous mistakes feed the next generation
  const m = newUser('mistakes');
  const q1 = await gen(m);
  for (let i = 0; i < 3; i++) await grade(m, q1.promptId, 'zzz wrong');
  const q2 = await gen(m);
  const brief2 = JSON.parse(stub.state.lastBody.contents[0].parts[0].text);
  assert(Array.isArray(brief2.target_weaknesses) && brief2.target_weaknesses.length > 0, 'missed concepts are passed to the generator');
  assert(brief2.avoid && brief2.avoid.length > 0, 'previous questions are listed to avoid');
  assert.notStrictEqual(q1.question, q2.question);
  console.log('✓ previous mistakes and earlier questions are fed into the next generation');

  // deterministic numeric check, no Gemini evaluation call
  const n = newUser('num');
  const np = await gen(n, { type: 'numeric' });
  stub.state.calls = 0;
  const bad = await grade(n, np.promptId, 'I get 41');
  assert.strictEqual(bad.isCorrect, false); assert.strictEqual(bad.evaluatedBy, 'numeric_check'); assert.strictEqual(bad.referenceAnswer, null);
  const good = await grade(n, np.promptId, 'The result is 42.');
  assert.strictEqual(good.isCorrect, true); assert.strictEqual(good.evaluatedBy, 'numeric_check');
  assert.strictEqual(stub.state.calls, 0, 'numeric answers are compared in code, not by the model');
  console.log('✓ numeric questions are graded deterministically (0 model calls)');

  // guards: impersonating a PYQ and duplicates are rejected -> honest fallback
  const g = newUser('guard');
  stub.reset('recall_impersonate');
  const imp = await gen(g);
  assert.notStrictEqual(imp.generation, 'gemini', 'the impersonating output was not used'); assert(imp.aiNotice);
  assert(imp.generation === 'reused_validated' || imp.origin !== 'ai_generated_practice', 'only previously validated questions keep the AI label');
  stub.reset('recall_dup');
  const d1 = await gen(g); const d2 = await gen(g);
  assert(d1.generation === 'gemini' || d1.generation === 'fallback' || d1.generation === 'reused_validated');
  assert.notStrictEqual(d2.generation, 'gemini', 'an exact duplicate of an earlier question is rejected');
  console.log('✓ "GATE 2019" impersonation and duplicates are rejected; fallback is labelled');

  // outage: labelled fallback, never silent; evaluation falls back transparently
  const o = newUser('outage'); stub.reset('network');
  const fb = await gen(o);
  assert(fb.aiNotice && fb.generation !== 'gemini'); assert(/unavailable|previously validated|AI/i.test(fb.label + fb.aiNotice));
  const ev = await grade(o, fb.promptId, 'some attempt at the answer');
  assert(['keyword_fallback', 'numeric_check'].includes(ev.evaluatedBy), 'the grading method is disclosed and never claims Gemini during an outage');
  console.log('✓ Gemini outage: question + grading fall back openly (aiNotice / evaluatedBy), nothing fabricated');

  // persistence: attempts survive (state endpoint), isolation between users
  const st = require('../backend/agents/active_recall_agent').getPromptState(m, q1.promptId);
  assert.strictEqual(st.attemptsUsed, 3); assert.strictEqual(st.completed, true);
  assert.strictEqual(require('../backend/agents/active_recall_agent').getPromptState(u, q1.promptId), null);
  console.log('🎉 Dynamic Active Recall tests passed');
})().catch(e => { console.error('Dynamic recall test failed:', e); process.exit(1); });
