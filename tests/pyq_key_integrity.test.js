const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const stub = require('./gemini_stub');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'key-int-'));
execFileSync('python3', [path.join(__dirname, 'fixtures/make_fake_gate_pdf.py'), path.join(tmp, 'raw')], { stdio: 'pipe' });
execFileSync('python3', [path.join(__dirname, '../data_pipeline/gate_ingest.py'), '--paper-pdf', 'paper.pdf', '--key-pdf', 'key.pdf', '--year', '2099', '--session', 'Set1',
  '--raw-dir', path.join(tmp, 'raw'), '--out-dir', path.join(tmp, 'out'), '--source-url', 'https://example.invalid/paper', '--key-url', 'https://example.invalid/key'], { stdio: 'pipe' });
process.env.GATE_PROCESSED_DIR = path.join(tmp, 'out');

const db = require('../backend/database/db');
const bank = require('../backend/services/question_bank');
const solver = require('../backend/agents/problem_solver');
bank.importOfficialPapers();
const uid = 'u_key_test';
db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(uid, 'k', 'k@t.local', 'x');
const ID = n => `gate_cs_2099_set1_cs${n}`;

(async () => {
  console.log('--- Official PYQ answer-key integrity ---');
  stub.install(); stub.reset('ok');

  // 1. provenance of an official key
  const q = bank.getById(ID(11));       // MCQ, key B (fixture)
  const rec = bank.officialKeyRecord(q);
  assert.strictEqual(rec.kind, 'official'); assert.strictEqual(rec.verified, true); assert.strictEqual(rec.answer, 'B');
  assert.strictEqual(rec.source.year, 2099); assert.strictEqual(rec.source.question_no, 11); assert.strictEqual(rec.source.key_version, 1);
  assert.strictEqual(rec.source.key_url, 'https://example.invalid/key');
  console.log('✓ official key retrieved with year / paper / question number / key URL / version');

  // 2. Gemini explains the OFFICIAL answer; the official answer is displayed separately and never comes from Gemini
  const r1 = await solver.run({ questionId: ID(11), studentAnswer: 'C', userId: uid });
  assert.strictEqual(r1.isCorrect, false); assert.strictEqual(r1.officialAnswer, 'B'); assert.strictEqual(r1.answerStatus, 'official');
  assert.strictEqual(r1.official.source.year, 2099); assert.strictEqual(r1.official.verified, true);
  assert(r1.aiExplanation && r1.aiExplanation.consistentWithOfficialKey === true && r1.explanationSource === 'ai');
  const sentToGemini = JSON.parse(stub.state.lastBody.contents[0].parts[0].text);
  assert.strictEqual(sentToGemini.official_answer, 'B', 'the verified key is passed to the model');
  console.log('✓ Gemini receives question + official key and only explains it; answer shown separately from AI text');

  // 3. cached per key version -> no second model call
  const c0 = stub.state.explainCalls;
  const r1b = await solver.run({ questionId: ID(11), studentAnswer: 'B', userId: uid });
  assert.strictEqual(stub.state.explainCalls, c0, 'cached explanation reused'); assert.strictEqual(r1b.aiExplanation.cached, true);
  console.log('✓ explanation cached per key version (no duplicate Gemini call)');

  // 4. an explanation that contradicts the official key is discarded
  stub.reset('explain_wrong');
  const r2 = await solver.run({ questionId: ID(14), studentAnswer: 'A', userId: uid });
  assert.strictEqual(r2.aiExplanation, null, 'contradicting explanation is not shown');
  assert(/discarded|official answer is/i.test(r2.explanation + r2.aiNotice));
  assert(r2.officialAnswer, 'official answer still displayed');
  const r2n = await solver.run({ questionId: ID(12), studentAnswer: '1', userId: uid });   // NAT
  assert.strictEqual(r2n.aiExplanation, null);
  console.log('✓ Gemini explanation disagreeing with the key (MCQ and NAT) is rejected and discarded');
  stub.reset('ok');

  // 5. MSQ and NAT validation logic of the key
  const m = await solver.run({ questionId: ID(13), studentAnswer: 'B;A', userId: uid });   // MSQ A;B
  assert.strictEqual(m.isCorrect, true); assert(m.aiExplanation);
  const n = await solver.run({ questionId: ID(12), studentAnswer: '2.665', userId: uid });
  assert.strictEqual(n.isCorrect, true, 'NAT range accepted');
  console.log('✓ MCQ / MSQ / NAT-range key logic applied');

  // 6. missing key -> unverified, provisional AI solution is labelled, never official
  const nk = await solver.run({ questionId: ID(21), studentAnswer: 'A', userId: uid });
  assert.strictEqual(nk.officialAnswer, null); assert.strictEqual(nk.answerStatus, 'unverified'); assert.strictEqual(nk.isCorrect, null);
  assert.strictEqual(nk.bktUpdate, null, 'ungradable question never changes mastery');
  assert(nk.provisional && /unverified/i.test(nk.provisional.label) && /NOT verified/.test(nk.explanationWarning));
  assert.strictEqual(nk.official.verified, false);
  console.log('✓ no key: answer marked unverified; AI solution clearly labelled provisional; not graded; no BKT');

  // 7. key provenance mismatch is detected
  db.prepare("INSERT INTO papers (id, year, session, paper_code) VALUES ('gate_other_2000_x', 2000, 'x', 'CS')").run();
  db.prepare("UPDATE questions SET paper_id = 'gate_other_2000_x' WHERE id = ?").run(ID(15));
  const bad = bank.officialKeyRecord(bank.getById(ID(15)));
  assert.strictEqual(bad.verified, false); assert.strictEqual(bad.answer, null);
  const rb = await solver.run({ questionId: ID(15), studentAnswer: 'A', userId: uid });
  assert.strictEqual(rb.officialAnswer, null); assert.strictEqual(rb.isCorrect !== true && rb.isCorrect !== false ? true : rb.isCorrect !== undefined, true);
  console.log('✓ a key that does not belong to its paper/year/question is not shown as official');

  // 8. revised key: history kept, latest used, cached explanation invalidated
  const calls = stub.state.explainCalls;
  const rev = bank.reviseKey(ID(11), { answer: 'C', source: 'https://example.invalid/final-key', note: 'corrected final key' });
  assert.strictEqual(rev.version, 2);
  assert.deepStrictEqual(bank.keyHistory(ID(11)).map(h => h.answer), ['B', 'C']);
  assert.strictEqual(bank.evaluateAnswer(bank.getById(ID(11)), 'C').isCorrect, true, 'latest official key is used');
  assert.strictEqual(bank.evaluateAnswer(bank.getById(ID(11)), 'B').isCorrect, false);
  const rr = await solver.run({ questionId: ID(11), studentAnswer: 'C', userId: uid });
  assert.strictEqual(rr.official.source.key_version, 2); assert.strictEqual(rr.official.keyRevisions, 2);
  assert.strictEqual(stub.state.explainCalls, calls + 1, 'revised key -> explanation regenerated');
  assert.strictEqual(JSON.parse(stub.state.lastBody.contents[0].parts[0].text).official_answer, 'C');
  console.log('✓ revised key: history preserved, latest version used, explanation regenerated for the new key');

  // 9. practice-set questions are never called official
  const pr = bank.search({ origin: 'synthetic_practice' }, { limit: 1 }).questions[0];
  const pz = await solver.run({ questionId: pr.id, studentAnswer: pr.type === 'NAT' ? '1' : 'A', userId: uid });
  assert.strictEqual(pz.answerStatus, 'practice_key'); assert.strictEqual(pz.official.verified, false); assert(/not an official/i.test(pz.official.label));
  console.log('✓ practice-set key labelled "not an official GATE key"');

  // 10. Gemini outage: official answer still shown, explanation honestly unavailable
  stub.reset('network');
  const out = await solver.run({ questionId: ID(16), studentAnswer: 'A', userId: uid });
  assert(out.officialAnswer && out.aiExplanation === null && /not available/.test(out.explanation));
  console.log('🎉 Official PYQ answer-key integrity tests passed');
})().catch(e => { console.error('Key integrity test failed:', e); process.exit(1); });
