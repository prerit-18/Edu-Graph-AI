const learnerStateTool = require('../tools/learner_state_tool');
const pyqTool = require('../tools/pyq_tool');
const { statusFor, THRESHOLDS } = require('../knowledge_tracing/bkt');
const db = require('../database/db');
const crypto = require('crypto');

/**
 * Revision Agent
 * Role: Spaced-repetition & retention strategist driven ONLY by real learner data.
 *  - Topics the learner has never attempted are never called "weak" or "due".
 *  - A topic needs >= THRESHOLDS.minAttempts attempts before it is classified (otherwise: "needs more data").
 *  - Priority = (1 - P(know)) * pyq_weight * (1 + 0.1 * min(days_since_seen, 30)); due when the BKT schedule
 *    (revision_schedule.due_at) has passed or the topic is weak.
 *  - Each recommended topic comes with unattempted PYQs from the question bank (official first).
 * Tools: learner_state_tool, pyq_tool
 */
class RevisionAgent {
  constructor() {
    this.role = 'Revision Agent';
    this.goal = 'Rank weak and decaying topics from actual performance and attach relevant practice questions.';
    this.backstory = 'Retention specialist who refuses to recommend anything the learner data does not support.';
    this.tools = [learnerStateTool, pyqTool];
  }

  attemptedQuestionIds(userId) {
    return db.prepare("SELECT DISTINCT question_id FROM attempts WHERE user_id = ? AND question_id != ''")
      .all(userId).map(r => r.question_id);
  }

  suggestPractice(userId, topicId, done) {
    const { questions } = pyqTool.search({ topic_id: topicId, excludeIds: done }, { limit: 20 });
    return questions
      .sort((a, b) => (a.origin === 'official_gate' ? 0 : 1) - (b.origin === 'official_gate' ? 0 : 1) || b.year - a.year)
      .slice(0, 3)
      .map(q => ({ id: q.id, year: q.year, type: q.type, marks: q.marks, origin: q.origin,
        label: q.origin === 'official_gate' ? `GATE ${q.year}` : 'Practice question' }));
  }

  async run({ userId }) {
    if (!userId) throw Object.assign(new Error('userId is required for a personalised revision schedule'), { status: 401 });

    const mastery = learnerStateTool.getUserMastery(userId);
    const attempted = mastery.filter(m => m.last_seen);
    const now = new Date();

    if (attempted.length === 0) {
      const starters = mastery.filter(m => !m.prerequisite_id).sort((a, b) => b.pyq_weight - a.pyq_weight).slice(0, 3)
        .map(m => ({ topic_id: m.topic_id, topic_name: m.topic_name, subject: m.subject }));
      return {
        agent: this.role, insufficientData: true, dueTopics: [], needsMoreData: [], topActionTopic: null, allTopicsRanked: [],
        recommendedAction: 'No revision plan yet: you have not attempted any question. Try a PYQ, an Active Recall question or a mock test first - revision recommendations are built from your actual results.',
        suggestedStart: starters
      };
    }

    const done = this.attemptedQuestionIds(userId);
    const ranked = attempted.map(item => {
      const days = Math.max(0, Math.floor((now - new Date(item.last_seen)) / 86400000));
      const status = statusFor(item.p_know, item.n_attempts);
      const scheduleDue = item.due_at ? new Date(item.due_at) <= now : false;
      const priority = (1 - item.p_know) * item.pyq_weight * (1 + 0.1 * Math.min(days, 30));
      return {
        topic_id: item.topic_id, topic_name: item.topic_name, subject: item.subject, p_know: item.p_know,
        pyq_weight: item.pyq_weight, last_seen: item.last_seen, n_attempts: item.n_attempts, daysElapsed: days, status,
        isDue: status !== 'insufficient_data' && status !== 'mastered' && (scheduleDue || status === 'weak'),
        priorityScore: Number(priority.toFixed(4))
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);

    const needsMoreData = ranked.filter(r => r.status === 'insufficient_data');
    const dueTopics = ranked.filter(r => r.isDue).slice(0, 5).map(t => ({ ...t, suggestedPractice: this.suggestPractice(userId, t.topic_id, done) }));
    const top = dueTopics[0] || null;

    let recommendedAction;
    if (top) {
      recommendedAction = `Revise **${top.topic_name}** (${top.subject}) first: mastery ${(top.p_know * 100).toFixed(0)}% after ${top.n_attempts} attempts, last practised ${top.daysElapsed} day(s) ago.`;
    } else if (needsMoreData.length) {
      recommendedAction = `Not enough data yet: practise ${needsMoreData[0].topic_name} (only ${needsMoreData[0].n_attempts} attempt) at least ${THRESHOLDS.minAttempts} times so it can be classified.`;
    } else {
      recommendedAction = 'No topics need urgent revision based on your results. Continue with new topics.';
    }

    db.prepare('INSERT INTO agent_logs (id, user_id, agent, grounded, detail) VALUES (?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), userId, this.role, 1, JSON.stringify({ dueCount: dueTopics.length, topFocus: top?.topic_id }));

    return {
      agent: this.role, insufficientData: false, dueTopics, needsMoreData, topActionTopic: top,
      recommendedAction, allTopicsRanked: ranked
    };
  }
}

module.exports = new RevisionAgent();
