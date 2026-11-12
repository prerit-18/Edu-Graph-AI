const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-pipe-'));
const rawDir = path.join(tmp, 'raw'); const outDir = path.join(tmp, 'processed');

console.log('--- GATE ingestion pipeline (synthetic fixture PDFs, temp directories) ---');
execFileSync('python3', [path.join(__dirname, 'fixtures/make_fake_gate_pdf.py'), rawDir], { stdio: 'pipe' });
execFileSync('python3', [path.join(ROOT, 'data_pipeline/gate_ingest.py'), '--paper-pdf', 'paper.pdf', '--key-pdf', 'key.pdf',
  '--year', '2099', '--session', 'Set1', '--raw-dir', rawDir, '--out-dir', outDir, '--source-url', 'https://example.invalid/test'], { stdio: 'pipe' });

const doc = JSON.parse(fs.readFileSync(path.join(outDir, 'gate_cs_2099_set1.json'), 'utf8'));
const byId = Object.fromEntries(doc.questions.map(q => [q.id, q]));
assert.strictEqual(doc.questions.length, 65, 'all 65 questions detected');
assert.strictEqual(doc.questions.filter(q => q.section === 'GA').length, 10);
assert.strictEqual(doc.questions.filter(q => q.section === 'CS').length, 55);
console.log('✓ 10 GA + 55 CS questions detected');

const q1 = byId['gate_cs_2099_set1_cs11'];
assert.strictEqual(q1.type, 'MCQ'); assert.strictEqual(q1.answer, 'B'); assert.strictEqual(q1.marks, 1);
assert.strictEqual(q1.options.length, 4); assert.strictEqual(q1.topic_id, 'os_virtual_mem');
const q2 = byId['gate_cs_2099_set1_cs12'];
assert.strictEqual(q2.type, 'NAT'); assert.strictEqual(q2.answer, '2.66:2.67'); assert.strictEqual(q2.topic_id, 'os_scheduling');
const q3 = byId['gate_cs_2099_set1_cs13'];
assert.strictEqual(q3.type, 'MSQ'); assert.strictEqual(q3.answer, 'A;B'); assert.strictEqual(q3.topic_id, 'dbms_transactions');
assert.strictEqual(byId['gate_cs_2099_set1_cs36'].marks, 2, '2-mark banner applied');
assert.strictEqual(byId['gate_cs_2099_set1_ga6'].marks, 2);
console.log('✓ MCQ / NAT range / MSQ keys, marks and topic classification mapped correctly');

assert(byId['gate_cs_2099_set1_cs17'].issues.some(i => /figure/.test(i)), 'figure question flagged');
assert(byId['gate_cs_2099_set1_cs19'].issues.some(i => /option/.test(i)), 'missing options flagged');
assert(byId['gate_cs_2099_set1_cs20'].issues.some(i => /duplicate/.test(i)), 'duplicate flagged');
assert.strictEqual(byId['gate_cs_2099_set1_cs21'].answer, null, 'no key -> no answer invented');
console.log('✓ figure, 3-option, duplicate and missing-key cases flagged (never silently dropped)');

// ---- import into a throw-away DB with the real validators
process.env.GATE_PROCESSED_DIR = outDir;
const db = require('../backend/database/db');
const bank = require('../backend/services/question_bank');
const res = bank.importOfficialPapers();
assert.strictEqual(res.papers, 1);
assert(res.review >= 2, 'questions needing review land in ingest_review_queue');
const stored = db.prepare("SELECT verification_status s, COUNT(*) n FROM questions WHERE origin = 'official_gate' GROUP BY s").all();
const st = Object.fromEntries(stored.map(r => [r.s, r.n]));
assert(st.verified > 40, 'keyed questions are verified');
assert.strictEqual(st.extracted_unverified, 1, 'the key-less question is stored as unverified');
const noKey = bank.getById('gate_cs_2099_set1_cs21');
assert.strictEqual(noKey.answer, null);
assert.strictEqual(bank.evaluateAnswer(noKey, 'A').isCorrect, null, 'unverified question is never graded');
assert.strictEqual(bank.getById('gate_cs_2099_set1_cs19'), null, 'needs_review question is not served');
assert(db.prepare('SELECT COUNT(*) c FROM ingest_review_queue').get().c >= 2);
console.log('✓ import: verified vs unverified separated; review queue populated; unverified never graded');

// ---- grading rules
const nat = bank.getById('gate_cs_2099_set1_cs12');
assert.strictEqual(bank.evaluateAnswer(nat, '2.665').isCorrect, true, 'NAT range inclusive');
assert.strictEqual(bank.evaluateAnswer(nat, '2.7').isCorrect, false);
const msq = bank.getById('gate_cs_2099_set1_cs13');
assert.strictEqual(bank.evaluateAnswer(msq, 'B, A').isCorrect, true, 'MSQ set equality, order-free');
assert.strictEqual(bank.evaluateAnswer(msq, 'A').isCorrect, false, 'partial MSQ is wrong');
assert.strictEqual(bank.evaluateAnswer(msq, 'A;C').marksAwarded, 0, 'MSQ has no negative marking');
const mcq = bank.getById('gate_cs_2099_set1_cs11');
assert.strictEqual(bank.evaluateAnswer(mcq, 'C').marksAwarded, -0.33, 'MCQ 1-mark wrong = -1/3');
const mcq2 = bank.getById('gate_cs_2099_set1_cs36');
if (mcq2.type === 'MCQ') assert.strictEqual(bank.evaluateAnswer(mcq2, 'D').marksAwarded <= 0, true);
console.log('✓ MCQ/MSQ/NAT grading + negative marking');
console.log('🎉 GATE pipeline tests passed');
