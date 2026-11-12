const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/db');

/**
 * Question Bank
 * Single source of truth for PYQs. Two origins are kept strictly apart:
 *   - official_gate       : ingested from official GATE papers + official answer keys
 *   - synthetic_practice  : EduGraph's own practice set (NOT real GATE questions)
 * Official answers are never overwritten by AI text; AI/curated explanations are labelled.
 */

const DATA_DIR = path.resolve(__dirname, '../../data');
const PRACTICE_GLOB_DIR = path.join(DATA_DIR, 'pyq');
const officialDir = () => process.env.GATE_PROCESSED_DIR || path.join(DATA_DIR, 'gate_papers', 'processed');

const VALID_TYPES = new Set(['MCQ', 'MSQ', 'NAT']);

function normText(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function textHash(t) {
  return crypto.createHash('sha1').update(normText(t)).digest('hex');
}

// ---------------------------------------------------------------- mapping ---
function rowToQuestion(r) {
  if (!r) return null;
  let options = [];
  try { options = JSON.parse(r.options_json || '[]'); } catch (e) { options = []; }
  return {
    id: r.id,
    year: r.year,
    session: r.session,
    paper_code: r.paper_code,
    q_no: r.q_no,
    subject: r.subject,
    topic_id: r.topic_id,
    subtopic: r.subtopic,
    type: r.question_type,
    question: r.question_text,
    options,
    answer: r.correct_answer,
    numeric_answer: r.numeric_answer,
    answer_low: r.answer_low,
    answer_high: r.answer_high,
    explanation: r.explanation,
    explanation_source: r.explanation_source,
    marks: r.marks,
    negative_marks: r.negative_marks,
    difficulty: r.difficulty,
    origin: r.origin,
    verification_status: r.verification_status,
    topic_confidence: r.topic_confidence,
    source_document: r.source_document,
    source_page: r.source_page
  };
}

/** Student-facing view: never contains the key or the explanation. */
function publicView(q) {
  if (!q) return null;
  const { answer, numeric_answer, answer_low, answer_high, explanation, ...rest } = q;
  return { ...rest, hasOfficialKey: answer !== null && answer !== undefined && answer !== '' };
}

// -------------------------------------------------------------- validation --
function validateQuestion(q) {
  const issues = [];
  if (!q.id) issues.push('missing id');
  if (!q.question || String(q.question).trim().length < 10) issues.push('missing/short question text');
  if (!VALID_TYPES.has(q.type)) issues.push(`invalid type "${q.type}"`);
  if (q.type === 'MCQ' || q.type === 'MSQ') {
    if (!Array.isArray(q.options) || q.options.length < 4) issues.push('fewer than 4 options');
  }
  if (q.type === 'NAT' && q.options && q.options.length) issues.push('NAT question has options');
  if (!q.marks || ![1, 2].includes(Number(q.marks))) issues.push('marks missing or not 1/2');
  if (q.answer !== null && q.answer !== undefined && q.answer !== '') {
    if (q.type === 'MCQ' && !/^[A-D]$/.test(String(q.answer).trim().toUpperCase())) issues.push('MCQ key is not A-D');
    if (q.type === 'MSQ' && !/^[A-D](;[A-D])*$/.test(String(q.answer).trim().toUpperCase())) issues.push('MSQ key malformed');
    if (q.type === 'NAT' && Number.isNaN(parseFloat(String(q.answer).split(':')[0]))) issues.push('NAT key not numeric');
  }
  if (q.topic_id) {
    const t = db.prepare('SELECT 1 FROM topics WHERE id = ?').get(q.topic_id);
    if (!t) issues.push(`unknown topic_id "${q.topic_id}"`);
  } else {
    issues.push('no topic_id');
  }
  return issues;
}

// ---------------------------------------------------------------- importing --
const upsertQuestion = () => db.prepare(`
  INSERT INTO questions (id, paper_id, year, session, paper_code, q_no, subject, topic_id, subtopic,
    question_text, question_type, options_json, correct_answer, numeric_answer, answer_low, answer_high,
    explanation, explanation_source, marks, negative_marks, difficulty, origin, verification_status,
    topic_confidence, source_document, source_page, text_hash)
  VALUES (@id, @paper_id, @year, @session, @paper_code, @q_no, @subject, @topic_id, @subtopic,
    @question_text, @question_type, @options_json, @correct_answer, @numeric_answer, @answer_low, @answer_high,
    @explanation, @explanation_source, @marks, @negative_marks, @difficulty, @origin, @verification_status,
    @topic_confidence, @source_document, @source_page, @text_hash)
  ON CONFLICT(id) DO UPDATE SET
    topic_id = excluded.topic_id, subject = excluded.subject, question_text = excluded.question_text,
    question_type = excluded.question_type, options_json = excluded.options_json,
    correct_answer = excluded.correct_answer, numeric_answer = excluded.numeric_answer,
    answer_low = excluded.answer_low, answer_high = excluded.answer_high,
    explanation = excluded.explanation, explanation_source = excluded.explanation_source,
    marks = excluded.marks, negative_marks = excluded.negative_marks, difficulty = excluded.difficulty,
    verification_status = excluded.verification_status, topic_confidence = excluded.topic_confidence,
    source_document = excluded.source_document, source_page = excluded.source_page, text_hash = excluded.text_hash
`);

function toRow(q, extra) {
  const hasKey = q.answer !== null && q.answer !== undefined && q.answer !== '';
  let low = q.answer_low ?? null, high = q.answer_high ?? null, num = q.numeric_answer ?? null;
  if (q.type === 'NAT' && hasKey) {
    const parts = String(q.answer).split(':');
    if (parts.length === 2) { low = parseFloat(parts[0]); high = parseFloat(parts[1]); }
    else if (num === null) num = parseFloat(parts[0]);
  }
  return {
    id: q.id, paper_id: extra.paper_id || null, year: q.year || null, session: q.session || null,
    paper_code: q.paper_code || null, q_no: q.q_no || null, subject: q.subject || null,
    topic_id: q.topic_id || null, subtopic: q.subtopic || null,
    question_text: q.question, question_type: q.type, options_json: JSON.stringify(q.options || []),
    correct_answer: hasKey ? String(q.answer) : null, numeric_answer: num, answer_low: low, answer_high: high,
    explanation: q.explanation || null,
    explanation_source: q.explanation ? (q.explanation_source || extra.explanation_source || 'curated') : 'none',
    marks: q.marks || null, negative_marks: q.negative_marks ?? (q.type === 'MCQ' && q.marks ? +(q.marks / 3).toFixed(2) : 0),
    difficulty: q.difficulty || 'medium', origin: extra.origin, verification_status: extra.verification_status,
    topic_confidence: q.topic_confidence ?? 1.0, source_document: q.source_document || extra.source_document || null,
    source_page: q.source_page || null, text_hash: textHash(q.question)
  };
}

function importPracticeSet() {
  const up = upsertQuestion();
  let imported = 0; const rejected = [];
  if (!fs.existsSync(PRACTICE_GLOB_DIR)) return { imported, rejected };
  for (const dir of fs.readdirSync(PRACTICE_GLOB_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = path.join(PRACTICE_GLOB_DIR, dir.name, 'questions.json');
    if (!fs.existsSync(file)) continue;
    for (const q of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      const issues = validateQuestion(q);
      if (issues.length) { rejected.push({ id: q.id, issues }); continue; }
      up.run(toRow(q, { origin: 'synthetic_practice', verification_status: 'synthetic', explanation_source: 'curated' }));
      imported++;
    }
  }
  return { imported, rejected };
}

/** record the live key as a revision row; bump the version when an already-stored key changes */
function syncKeyRevision(id, row, keySource) {
  const cur = db.prepare('SELECT correct_answer, answer_low, answer_high, key_version FROM questions WHERE id = ?').get(id);
  if (!cur) return;
  const last = db.prepare('SELECT * FROM answer_key_revisions WHERE question_id = ? ORDER BY version DESC LIMIT 1').get(id);
  const same = last && (last.answer || null) === (cur.correct_answer || null);
  if (same) return;
  const version = last ? last.version + 1 : 1;
  db.prepare('INSERT OR IGNORE INTO answer_key_revisions (id, question_id, version, answer, numeric_low, numeric_high, source, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(`akr_${crypto.randomUUID()}`, id, version, cur.correct_answer, cur.answer_low, cur.answer_high, keySource || null, last ? `revised from "${last.answer}"` : 'initial official key');
  db.prepare('UPDATE questions SET key_version = ?, key_source = ? WHERE id = ?').run(version, keySource || null, id);
}

/** Manually record a revised official key (e.g. after IIT publishes a corrected final key). Old keys stay in history. */
function reviseKey(questionId, { answer, source, note }) {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
  if (!q) throw Object.assign(new Error('Unknown question'), { status: 404 });
  const last = db.prepare('SELECT MAX(version) v FROM answer_key_revisions WHERE question_id = ?').get(questionId).v || 0;
  let low = null, high = null;
  if (q.question_type === 'NAT') { const parts = String(answer).split(':'); low = parseFloat(parts[0]); high = parseFloat(parts[1] ?? parts[0]); }
  db.transaction(() => {
    db.prepare('INSERT INTO answer_key_revisions (id, question_id, version, answer, numeric_low, numeric_high, source, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`akr_${crypto.randomUUID()}`, questionId, last + 1, String(answer), low, high, source || null, note || 'revised key');
    db.prepare('UPDATE questions SET correct_answer = ?, answer_low = ?, answer_high = ?, numeric_answer = ?, key_version = ?, key_source = ?, verification_status = ? WHERE id = ?')
      .run(String(answer), low, high, q.question_type === 'NAT' && low === high ? low : null, last + 1, source || q.key_source, 'verified', questionId);
  })();
  return { questionId, version: last + 1 };
}

function keyHistory(questionId) {
  return db.prepare('SELECT version, answer, source, note, created_at FROM answer_key_revisions WHERE question_id = ? ORDER BY version').all(questionId);
}

/**
 * The official answer record for a question, with its provenance. For official questions this CHECKS that the key
 * belongs to the same paper/year/question number as the id says; a mismatch yields verified:false and no answer.
 */
function officialKeyRecord(q) {
  if (!q) return null;
  const has = q.answer !== null && q.answer !== undefined && q.answer !== '';
  if (q.origin !== 'official_gate') {
    return { kind: 'practice', answer: has ? q.answer : null, verified: false, label: 'EduGraph practice-set key (not an official GATE key)', source: null };
  }
  const paper = db.prepare('SELECT * FROM papers WHERE id = (SELECT paper_id FROM questions WHERE id = ?)').get(q.id);
  const row = db.prepare('SELECT year, q_no, key_version, key_source, paper_id FROM questions WHERE id = ?').get(q.id);
  const idOk = paper && q.id.startsWith(paper.id + '_') && row.year === paper.year;
  const qnoOk = row && (String(q.id).match(/_(?:ga|cs)(\d+)$/i) || [])[1] === String(row.q_no);
  const verified = !!(has && idOk && qnoOk && q.verification_status === 'verified');
  return {
    kind: 'official', answer: verified ? q.answer : null, verified,
    label: verified ? 'Official GATE answer key' : (has ? 'Key failed provenance check - not shown as official' : 'No official key stored for this question'),
    source: paper ? { year: paper.year, paper_code: paper.paper_code, session: paper.session || null, question_no: row.q_no, paper_id: paper.id, paper_url: paper.source_url, key_url: row.key_source || paper.key_source_url, key_version: row.key_version || 1, retrieved_at: paper.retrieved_at } : null,
    revisions: keyHistory(q.id).length
  };
}

function importOfficialPapers() {
  const up = upsertQuestion();
  const out = { papers: 0, imported: 0, duplicates: 0, review: 0, rejected: [] };
  const OFFICIAL_DIR = officialDir();
  if (!fs.existsSync(OFFICIAL_DIR)) return out;
  const upPaper = db.prepare(`
    INSERT INTO papers (id, year, session, paper_code, source_url, source_file, key_source_url, retrieved_at, license_note, status)
    VALUES (@id, @year, @session, @paper_code, @source_url, @source_file, @key_source_url, @retrieved_at, @license_note, @status)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, source_url = excluded.source_url,
      key_source_url = excluded.key_source_url, source_file = excluded.source_file`);
  const upReview = db.prepare(`INSERT OR REPLACE INTO ingest_review_queue (id, source_file, year, q_no, page, reason, raw_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const f of fs.readdirSync(OFFICIAL_DIR).filter(n => n.endsWith('.json') && !n.startsWith('_'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(OFFICIAL_DIR, f), 'utf8'));
    if (!doc.paper || !Array.isArray(doc.questions)) continue;
    const p = doc.paper;
    upPaper.run({
      id: p.id, year: p.year, session: p.session || null, paper_code: p.paper_code || 'CS',
      source_url: p.source_url || null, source_file: p.source_file || f, key_source_url: p.key_source_url || null,
      retrieved_at: p.retrieved_at || null, license_note: p.license_note || null, status: p.status || 'ingested'
    });
    out.papers++;
    for (const q of doc.questions) {
      q.year = q.year || p.year; q.session = q.session || p.session; q.paper_code = q.paper_code || p.paper_code;
      const issues = validateQuestion(q);
      // issues raised by the extraction pipeline that make a question unsafe to serve
      for (const i of q.issues || []) {
        if (/figure|option|garbled|extraction error|duplicate|empty|invalid .* key|has options/i.test(i)) issues.push(`pipeline: ${i}`);
      }
      const dup = db.prepare("SELECT id FROM questions WHERE text_hash = ? AND id != ? AND origin = 'official_gate' AND paper_id = ?")
        .get(textHash(q.question), q.id, p.id);
      if (dup) { out.duplicates++; continue; }
      const hasKey = q.answer !== null && q.answer !== undefined && q.answer !== '';
      let status = 'extracted_unverified';
      if (issues.some(i => !i.startsWith('unknown topic') && i !== 'no topic_id')) status = 'needs_review';
      else if (hasKey && q.key_verified !== false) status = 'verified';
      if (status === 'needs_review') {
        upReview.run(`${q.id}`, p.source_file || f, q.year, q.q_no || null, q.source_page || null, issues.join('; '), String(q.raw_text || q.question).slice(0, 4000));
        out.review++;
        out.rejected.push({ id: q.id, issues });
        continue;
      }
      if (issues.length) { q.topic_id = null; }
      if (!q.topic_id) { // fall back to subject-level placeholder so FK never fails
        const sub = db.prepare('SELECT id FROM topics WHERE subject = ? ORDER BY id LIMIT 1').get(q.subject);
        q.topic_id = sub ? sub.id : null; q.topic_confidence = 0.2;
      }
      if (!q.topic_id) { out.rejected.push({ id: q.id, issues: ['no resolvable topic'] }); continue; }
      up.run(toRow(q, { origin: 'official_gate', paper_id: p.id, verification_status: status, explanation_source: q.explanation_source || 'none' }));
      syncKeyRevision(q.id, null, p.key_source_url);
      out.imported++;
    }
    for (const r of doc.review_queue || []) {
      upReview.run(`${p.id}_${r.q_no || r.page}_${crypto.randomBytes(2).toString('hex')}`, p.source_file || f, p.year, r.q_no || null, r.page || null, r.reason, String(r.raw_text || '').slice(0, 4000));
      out.review++;
    }
  }
  return out;
}

function importAll() {
  const practice = importPracticeSet();
  const official = importOfficialPapers();
  return {
    practiceImported: practice.imported, practiceRejected: practice.rejected,
    officialPapers: official.papers, officialImported: official.imported,
    officialDuplicates: official.duplicates, reviewQueued: official.review
  };
}

// ----------------------------------------------------------------- queries --
/**
 * @param {object} f { year, years[], subject, topic_id, type, difficulty, origin, verified, q, ids[] }
 */
function search(f = {}, { limit = 50, offset = 0, random = false } = {}) {
  const where = []; const params = [];
  if (f.year) { where.push('year = ?'); params.push(Number(f.year)); }
  if (f.yearFrom) { where.push('year >= ?'); params.push(Number(f.yearFrom)); }
  if (f.yearTo) { where.push('year <= ?'); params.push(Number(f.yearTo)); }
  if (f.subject) { where.push('LOWER(subject) = LOWER(?)'); params.push(f.subject); }
  if (f.topic_id) { where.push('topic_id = ?'); params.push(f.topic_id); }
  if (f.type) { where.push('question_type = ?'); params.push(String(f.type).toUpperCase()); }
  if (f.difficulty) { where.push('difficulty = ?'); params.push(f.difficulty); }
  if (f.origin) { where.push('origin = ?'); params.push(f.origin); }
  if (f.verifiedOnly) { where.push("(verification_status IN ('verified','synthetic'))"); }
  if (f.hasKey) { where.push('correct_answer IS NOT NULL'); }
  if (f.excludeIds && f.excludeIds.length) {
    where.push(`id NOT IN (${f.excludeIds.map(() => '?').join(',')})`); params.push(...f.excludeIds);
  }
  if (f.q) { where.push('LOWER(question_text) LIKE ?'); params.push(`%${String(f.q).toLowerCase()}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM questions ${w}`).get(...params).c;
  const order = random ? 'ORDER BY RANDOM()' : 'ORDER BY year DESC, id';
  const rows = db.prepare(`SELECT * FROM questions ${w} ${order} LIMIT ? OFFSET ?`).all(...params, Math.min(limit, 500), offset);
  return { total, questions: rows.map(rowToQuestion) };
}

function getById(id) {
  return rowToQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(id));
}

function getAll() {
  return db.prepare('SELECT * FROM questions ORDER BY year DESC, id').all().map(rowToQuestion);
}

function filtersSummary() {
  const rows = (sql) => db.prepare(sql).all();
  return {
    years: rows('SELECT year, COUNT(*) n FROM questions WHERE year IS NOT NULL GROUP BY year ORDER BY year DESC'),
    subjects: rows('SELECT subject, COUNT(*) n FROM questions GROUP BY subject ORDER BY n DESC'),
    topics: rows('SELECT q.topic_id id, t.name, t.subject, COUNT(*) n FROM questions q JOIN topics t ON t.id = q.topic_id GROUP BY q.topic_id ORDER BY t.subject, t.name'),
    types: rows('SELECT question_type type, COUNT(*) n FROM questions GROUP BY question_type'),
    difficulties: rows('SELECT difficulty, COUNT(*) n FROM questions GROUP BY difficulty'),
    origins: rows('SELECT origin, verification_status, COUNT(*) n FROM questions GROUP BY origin, verification_status')
  };
}

/** Pure data statistics used by the PYQ Analyst. Nothing here is estimated. */
function topicStats(topicId) {
  const qs = search({ topic_id: topicId }, { limit: 500 }).questions;
  return buildStats(qs, topicId);
}

function buildStats(qs, topicId) {
  const official = qs.filter(q => q.origin === 'official_gate');
  const byYear = {}; const types = {}; let marks = 0;
  for (const q of qs) {
    const key = q.origin === 'official_gate' ? String(q.year) : `${q.year} (practice)`;
    byYear[key] = (byYear[key] || 0) + 1;
    types[q.type] = (types[q.type] || 0) + 1;
    marks += Number(q.marks) || 0;
  }
  const years = [...new Set(official.map(q => q.year))].sort((a, b) => b - a);
  const subjectRow = topicId ? db.prepare('SELECT subject FROM topics WHERE id = ?').get(topicId) : null;
  let subjectShare = null;
  if (subjectRow && official.length) {
    const tot = db.prepare("SELECT COUNT(*) c FROM questions WHERE subject = ? AND origin = 'official_gate'").get(subjectRow.subject).c;
    subjectShare = tot ? Number((official.length / tot).toFixed(3)) : null;
  }
  const allYears = db.prepare("SELECT COUNT(DISTINCT year) c FROM questions WHERE origin = 'official_gate'").get().c;
  return {
    topic_id: topicId || null,
    total_questions: qs.length,
    official_questions: official.length,
    practice_questions: qs.length - official.length,
    years_appeared: years,
    official_years_in_bank: allYears,
    by_year: byYear,
    types,
    total_marks: marks,
    share_of_subject_official: subjectShare,
    frequency_rate: official.length
      ? `${official.length} official question(s) in ${years.length} of ${allYears} ingested year(s)`
      : (allYears ? `0 official questions in ${allYears} ingested year(s)` : 'No official GATE papers ingested yet'),
    recurring: years.length >= 2
  };
}

/**
 * Data-only insights from the stored OFFICIAL papers (General Aptitude excluded). Every number is a count over stored
 * questions; "important"/"frequent" claims are derived from these counts, never from a model.
 */
function analytics({ subject } = {}) {
  const where = "origin = 'official_gate' AND subject != 'General Aptitude'" + (subject ? ' AND LOWER(subject) = LOWER(?)' : '');
  const args = subject ? [subject] : [];
  const rows = db.prepare(`SELECT q.year, q.paper_id, q.subject, q.topic_id, t.name topic_name, q.question_type type, q.marks, q.topic_confidence tc
    FROM questions q JOIN topics t ON t.id = q.topic_id WHERE ${where.replace(/origin/g, 'q.origin').replace(/subject/g, 'q.subject')}`).all(...args);
  const years = [...new Set(rows.map(r => r.year))].sort();
  const papers = db.prepare("SELECT COUNT(*) c FROM papers WHERE status != 'failed'").get().c;
  const total = rows.length;
  const group = (keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || []).concat(r)); } return m; };
  const topics = [...group(r => r.topic_id)].map(([id, rs]) => {
    const byYear = {}; rs.forEach(r => { byYear[r.year] = (byYear[r.year] || 0) + 1; });
    return { topic_id: id, topic_name: rs[0].topic_name, subject: rs[0].subject, questions: rs.length, marks: rs.reduce((a, r) => a + (r.marks || 0), 0),
      share: Number((rs.length / total).toFixed(3)), yearsAppeared: Object.keys(byYear).map(Number).sort(), byYear,
      recurring: Object.keys(byYear).length >= 2, lowConfidenceLabels: rs.filter(r => r.tc < 0.35).length };
  }).sort((a, b) => b.questions - a.questions);
  const subjects = [...group(r => r.subject)].map(([sub, rs]) => {
    const byYear = {}; rs.forEach(r => { byYear[r.year] = (byYear[r.year] || 0) + 1; });
    return { subject: sub, questions: rs.length, marks: rs.reduce((a, r) => a + (r.marks || 0), 0), share: Number((rs.length / total).toFixed(3)), byYear };
  }).sort((a, b) => b.questions - a.questions);
  const typeByYear = {}; rows.forEach(r => { (typeByYear[r.year] = typeByYear[r.year] || { MCQ: 0, MSQ: 0, NAT: 0 })[r.type]++; });
  // trend: change in subject question share between the earliest and latest ingested year
  let trends = [];
  if (years.length >= 2) {
    const first = years[0], last = years[years.length - 1];
    const cnt = (y, sub) => rows.filter(r => r.year === y && r.subject === sub).length;
    const tot = y => rows.filter(r => r.year === y).length;
    trends = subjects.map(s => ({ subject: s.subject, from: first, to: last, shareFrom: Number((cnt(first, s.subject) / (tot(first) || 1)).toFixed(3)), shareTo: Number((cnt(last, s.subject) / (tot(last) || 1)).toFixed(3)) }))
      .map(t => ({ ...t, change: Number((t.shareTo - t.shareFrom).toFixed(3)) })).sort((a, b) => b.change - a.change);
  }
  const dupes = db.prepare("SELECT COUNT(*) c FROM (SELECT text_hash FROM questions WHERE origin = 'official_gate' GROUP BY text_hash HAVING COUNT(DISTINCT paper_id) > 1)").get().c;
  return {
    coverage: { yearsIngested: years, officialPapers: papers, officialCsQuestions: total, caveat: (years.length < 3 ? 'Fewer than 3 years ingested: trends are indicative only. ' : '') + 'Counts cover only questions stored in the bank: 2024-2026 contain two papers per year, and questions queued for manual review (e.g. figure-based, common in Digital Logic) are not counted. Topic labels come from a keyword classifier and are not manually audited.' },
    topTopics: topics.slice(0, 15), recurringTopics: topics.filter(t => t.recurring).length, subjects, typeByYear, subjectShareTrend: trends,
    questionTextsAppearingInMultipleSets: dupes,
    labelQuality: { lowConfidenceLabels: topics.reduce((a, t) => a + t.lowConfidenceLabels, 0), of: total }
  };
}

// ----------------------------------------------------------------- grading --
function normLetters(a) {
  return [...new Set(String(a || '').toUpperCase().match(/[A-D]/g) || [])].sort();
}

/** Returns { attempted, isCorrect (true|false|null when no key), marksAwarded, expected } */
function evaluateAnswer(q, studentAnswer) {
  const s = studentAnswer === undefined || studentAnswer === null ? '' : String(studentAnswer).trim();
  if (s === '') return { attempted: false, isCorrect: false, marksAwarded: 0 };
  const hasKey = q.answer !== null && q.answer !== undefined && q.answer !== '';
  if (!hasKey) return { attempted: true, isCorrect: null, marksAwarded: 0, reason: 'no_official_key' };
  let ok = false;
  if (q.type === 'MCQ') {
    const m = s.toUpperCase().match(/^\(?([A-D])\)?(?:[.\s:)]|$)/);
    ok = !!m && m[1] === String(q.answer).trim().toUpperCase();
  } else if (q.type === 'MSQ') {
    const a = normLetters(s), b = normLetters(q.answer);
    ok = a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]);
  } else {
    const x = parseFloat(s.replace(/,/g, ''));
    if (!Number.isNaN(x)) {
      if (q.answer_low !== null && q.answer_low !== undefined && q.answer_high !== null && q.answer_high !== undefined) {
        ok = x >= q.answer_low - 1e-9 && x <= q.answer_high + 1e-9;
      } else {
        const ref = q.numeric_answer !== null && q.numeric_answer !== undefined ? q.numeric_answer : parseFloat(q.answer);
        ok = Math.abs(x - ref) <= Math.max(0.05, Math.abs(ref) * 0.001);
      }
    }
  }
  const marks = Number(q.marks) || 1;
  const penalty = q.type === 'MCQ' ? (Number(q.negative_marks) || 0) : 0;
  return { attempted: true, isCorrect: ok, marksAwarded: ok ? marks : (penalty ? -penalty : 0) };
}

module.exports = {
  importAll, importPracticeSet, importOfficialPapers, validateQuestion,
  search, getById, getAll, filtersSummary, topicStats, buildStats,
  publicView, evaluateAnswer, textHash, rowToQuestion,
  officialKeyRecord, reviseKey, keyHistory, analytics
};
