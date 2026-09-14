const pyqTool = require('../tools/pyq_tool');
const bktTool = require('../tools/bkt_tool');
const db = require('../database/db');
const crypto = require('crypto');

/**
 * Mock Test Agent (Stretch Feature)
 * Role: GATE CSE Examination & Diagnostic Evaluator
 * Goal: Assemble mock tests, evaluate multi-question submissions, compute scores, update BKT, and generate diagnostic reports.
 */
class MockTestAgent {
  constructor() {
    this.role = 'Mock Test Agent';
    this.goal = 'Conduct timed GATE CSE diagnostic tests and provide comprehensive performance diagnostics.';
    this.backstory = 'GATE exam invigilator and analytics specialist who assesses full-spectrum readiness across subjects.';
    this.tools = [pyqTool, bktTool];
  }

  generateTest({ subject, count = 10 }) {
    let pool = pyqTool.getAllPYQs();
    if (subject && subject !== 'All') {
      pool = pool.filter(q => q.subject.toLowerCase() === subject.toLowerCase());
    }

    // Shuffle and pick
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, pool.length));

    return {
      testId: crypto.randomUUID(),
      title: `GATE CSE Diagnostic Mock Exam (${subject || 'All Subjects'})`,
      totalQuestions: selected.length,
      durationMinutes: selected.length * 3, // ~3 minutes per question
      questions: selected.map((q, idx) => ({
        index: idx + 1,
        id: q.id,
        year: q.year,
        subject: q.subject,
        topic_id: q.topic_id,
        type: q.type,
        question: q.question,
        options: q.options || []
      }))
    };
  }

  evaluateSubmission({ testId, submissions, userId }) {
    if (!Array.isArray(submissions)) {
      throw new Error('Submissions array is required');
    }

    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;
    const topicBreakdown = {};
    const detailedResults = [];

    for (const sub of submissions) {
      const q = pyqTool.getPYQById(sub.questionId);
      if (!q) continue;

      const studentAns = sub.answer !== undefined ? String(sub.answer).trim().toUpperCase() : '';
      let isCorrect = false;
      let isAttempted = studentAns !== '';

      if (isAttempted) {
        if (q.type === 'MCQ') {
          isCorrect = studentAns === q.answer.trim().toUpperCase();
        } else if (q.type === 'NAT' && q.numeric_answer !== undefined) {
          const sNum = parseFloat(studentAns);
          const oNum = parseFloat(q.numeric_answer);
          isCorrect = Math.abs(sNum - oNum) < 0.05;
        }

        if (isCorrect) correctCount++;
        else wrongCount++;

        // Update BKT for each attempted question
        if (userId) {
          bktTool.recordPractice(userId, q.topic_id, this.role, q.question, studentAns, isCorrect);
        }
      } else {
        unattemptedCount++;
      }

      // Track topic breakdown
      if (!topicBreakdown[q.topic_id]) {
        topicBreakdown[q.topic_id] = { total: 0, correct: 0, wrong: 0, unattempted: 0, subject: q.subject };
      }
      topicBreakdown[q.topic_id].total++;
      if (isCorrect) topicBreakdown[q.topic_id].correct++;
      else if (isAttempted) topicBreakdown[q.topic_id].wrong++;
      else topicBreakdown[q.topic_id].unattempted++;

      detailedResults.push({
        questionId: q.id,
        subject: q.subject,
        topic_id: q.topic_id,
        question: q.question,
        studentAnswer: studentAns || 'Not Attempted',
        officialAnswer: q.answer,
        isCorrect,
        explanation: q.explanation
      });
    }

    // Standard GATE scoring: +1 for correct, -0.33 for wrong MCQ (0 for NAT wrong)
    const marks = correctCount * 1.0 - wrongCount * 0.33;

    return {
      agent: this.role,
      testId,
      totalQuestions: submissions.length,
      correctCount,
      wrongCount,
      unattemptedCount,
      estimatedMarks: Number(marks.toFixed(2)),
      percentageScore: Math.round((correctCount / Math.max(1, submissions.length)) * 100),
      topicBreakdown,
      detailedResults
    };
  }
}

module.exports = new MockTestAgent();
