const pyqTool = require('../tools/pyq_tool');
const bktTool = require('../tools/bkt_tool');
const bank = require('../services/question_bank');
const db = require('../database/db');
const crypto = require('crypto');

const MIN_PER_MARK = 1.8; // GATE: 180 minutes for 100 marks

/**
 * Mock Test Agent
 * Builds tests ONLY from keyed, verified questions in the question bank (official GATE questions with an official
 * key, or the clearly-labelled practice set), without repeats; stores every test so submissions are validated
 * against what was actually served; scores with the GATE marking scheme (MCQ: -1/3 of marks for a wrong answer,
 * MSQ/NAT: no negative marking); updates BKT once per attempted question.
 * Tools: pyq_tool, bkt_tool
 */
class MockTestAgent {
  constructor() {
    this.role = 'Mock Test Agent';
    this.goal = 'Run timed GATE-style tests from the verified question bank and produce accurate diagnostics.';
    this.backstory = 'Exam invigilator and analytics specialist: strict about marking schemes and answer keys.';
    this.tools = [pyqTool, bktTool];
  }

  generateTest({ userId, subject, topic_id, year, difficulty, origin, count = 10 } = {}) {
    if (!userId) throw Object.assign(new Error('Authentication required'), { status: 401 });
    count = Math.min(Math.max(parseInt(count, 10) || 10, 1), 65);
    const filters = { verifiedOnly: true, hasKey: true };
    if (subject && subject !== 'All') filters.subject = subject;
    if (topic_id) filters.topic_id = topic_id;
    if (year) filters.year = Number(year);
    if (difficulty) filters.difficulty = difficulty;
    if (origin === 'official') filters.origin = 'official_gate';
    else if (origin === 'practice') filters.origin = 'synthetic_practice';

    const { questions: pool, total } = bank.search(filters, { limit: 500, random: true });
    // no duplicate question text within one test
    const seen = new Set(); const selected = [];
    for (const q of pool) {
      const h = bank.textHash(q.question);
      if (seen.has(h)) continue;
      seen.add(h); selected.push(q);
      if (selected.length >= count) break;
    }
    if (selected.length === 0) {
      throw Object.assign(new Error('No keyed questions match these filters. Try a different subject, year or source.'), { status: 404 });
    }

    const maxScore = selected.reduce((a, q) => a + (Number(q.marks) || 1), 0);
    const duration = Math.max(5, Math.round(maxScore * MIN_PER_MARK));
    const testId = crypto.randomUUID();
    db.prepare(`INSERT INTO mock_tests (id, user_id, params_json, question_ids, duration_minutes, max_score) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(testId, userId, JSON.stringify({ subject, topic_id, year, difficulty, origin, count }), JSON.stringify(selected.map(q => q.id)), duration, maxScore);

    return {
      testId,
      title: `GATE CSE Mock Test (${subject || 'All Subjects'}${year ? ', ' + year : ''})`,
      totalQuestions: selected.length,
      requestedQuestions: count,
      shortfall: selected.length < count ? `Only ${selected.length} matching keyed question(s) available (pool: ${total}).` : null,
      durationMinutes: duration,
      maxScore,
      markingScheme: 'MCQ: +marks, -1/3 of marks if wrong. MSQ and NAT: +marks, no negative marking. Unattempted: 0.',
      sources: [...new Set(selected.map(q => q.origin))],
      questions: selected.map((q, i) => ({ ...bank.publicView(q), index: i + 1 }))
    };
  }

  evaluateSubmission({ testId, submissions, userId }) {
    if (!userId) throw Object.assign(new Error('Authentication required'), { status: 401 });
    if (!Array.isArray(submissions)) throw Object.assign(new Error('submissions must be an array'), { status: 400 });
    const test = db.prepare('SELECT * FROM mock_tests WHERE id = ? AND user_id = ?').get(testId, userId);
    if (!test) throw Object.assign(new Error('Test not found'), { status: 404 });
    if (test.submitted_at) throw Object.assign(new Error('This test has already been submitted'), { status: 409 });

    const ids = JSON.parse(test.question_ids);
    const answers = new Map();
    const ignored = [];
    for (const s of submissions) {
      if (!s || !ids.includes(s.questionId) || answers.has(s.questionId)) { ignored.push(s && s.questionId); continue; }
      answers.set(s.questionId, s.answer);
    }

    let correctCount = 0, wrongCount = 0, unattempted = 0, score = 0;
    const topicBreakdown = {}; const detailedResults = [];
    for (const id of ids) {
      const q = bank.getById(id);
      if (!q) continue;
      const r = bank.evaluateAnswer(q, answers.get(id));
      if (!r.attempted) unattempted++; else if (r.isCorrect) correctCount++; else wrongCount++;
      score += r.marksAwarded || 0;

      if (r.attempted && r.isCorrect !== null) {
        bktTool.recordPractice(userId, q.topic_id, this.role, q.question, String(answers.get(id)), r.isCorrect,
          { type: q.type, source: 'mock_test', questionId: q.id });
      }
      const tb = topicBreakdown[q.topic_id] || (topicBreakdown[q.topic_id] = { total: 0, correct: 0, wrong: 0, unattempted: 0, subject: q.subject });
      tb.total++;
      if (!r.attempted) tb.unattempted++; else if (r.isCorrect) tb.correct++; else tb.wrong++;

      detailedResults.push({
        questionId: q.id, subject: q.subject, topic_id: q.topic_id, question: q.question, options: q.options, type: q.type,
        marks: q.marks, studentAnswer: r.attempted ? String(answers.get(id)) : 'Not Attempted', officialAnswer: q.answer,
        isCorrect: r.attempted ? r.isCorrect : false, marksAwarded: Number((r.marksAwarded || 0).toFixed(2)),
        explanation: q.explanation, explanationSource: q.explanation_source, origin: q.origin, year: q.year
      });
    }
    score = Number(score.toFixed(2));
    const report = {
      agent: this.role, testId, totalQuestions: ids.length, correctCount, wrongCount, unattemptedCount: unattempted,
      score, maxScore: test.max_score, estimatedMarks: score,
      percentageScore: Number(((score / (test.max_score || 1)) * 100).toFixed(1)),
      accuracyOfAttempted: correctCount + wrongCount ? Number(((correctCount / (correctCount + wrongCount)) * 100).toFixed(1)) : null,
      topicBreakdown, detailedResults, ignoredSubmissions: ignored.filter(Boolean).length
    };
    db.prepare('UPDATE mock_tests SET submitted_at = ?, result_json = ?, score = ? WHERE id = ?')
      .run(new Date().toISOString(), JSON.stringify(report), score, testId);
    return report;
  }

  getHistory(userId, limit = 10) {
    return db.prepare(`SELECT id, created_at, submitted_at, score, max_score, duration_minutes, params_json
      FROM mock_tests WHERE user_id = ? AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT ?`).all(userId, limit)
      .map(r => ({ ...r, params: JSON.parse(r.params_json || '{}'), params_json: undefined }));
  }

  getReport(userId, testId) {
    const t = db.prepare('SELECT result_json FROM mock_tests WHERE id = ? AND user_id = ? AND submitted_at IS NOT NULL').get(testId, userId);
    return t ? JSON.parse(t.result_json) : null;
  }
}

module.exports = new MockTestAgent();
