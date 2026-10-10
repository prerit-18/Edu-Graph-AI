const db = require('../database/db');

/**
 * Learner State Tool
 * Retrieves user mastery vectors, attempt history, and revision metrics from SQLite.
 */
class LearnerStateTool {
  constructor() {
    this.name = 'learner_state_tool';
    this.description = 'Accesses learner knowledge state, historical performance, and weak topics.';
  }

  getUserMastery(userId) {
    const query = `
      SELECT t.id AS topic_id, t.name AS topic_name, t.subject, t.pyq_weight,
             COALESCE(m.p_know, 0.0) AS p_know,
             m.last_seen,
             rs.due_at, rs.priority AS revision_priority
      FROM topics t
      LEFT JOIN mastery m ON m.topic_id = t.id AND m.user_id = ?
      LEFT JOIN revision_schedule rs ON rs.topic_id = t.id AND rs.user_id = ?
      ORDER BY t.subject, t.id
    `;
    return db.prepare(query).all(userId, userId);
  }

  getWeakTopics(userId, threshold = 0.60) {
    const list = this.getUserMastery(userId);
    return list
      .filter(item => item.p_know < threshold)
      .sort((a, b) => (b.revision_priority || 0) - (a.revision_priority || 0));
  }

  getRecentAttempts(userId, limit = 10) {
    return db.prepare(`
      SELECT a.*, t.name AS topic_name, t.subject
      FROM attempts a
      JOIN topics t ON t.id = a.topic_id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(userId, limit);
  }

  getLearnerStreak(userId) {
    const rows = db.prepare(`
      SELECT DISTINCT date(created_at) as attempt_date
      FROM attempts
      WHERE user_id = ?
      ORDER BY attempt_date DESC
    `).all(userId);

    if (rows.length === 0) return { currentStreak: 0, totalDaysActive: 0 };

    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let expectedDate = new Date();

    // Check if user practiced today or yesterday
    const firstDate = rows[0].attempt_date;
    const diffDaysFromToday = Math.floor((new Date(today) - new Date(firstDate)) / (1000 * 60 * 60 * 24));
    
    if (diffDaysFromToday <= 1) {
      expectedDate = new Date(firstDate);
      for (const row of rows) {
        const rowDate = new Date(row.attempt_date);
        const diff = Math.round((expectedDate - rowDate) / (1000 * 60 * 60 * 24));
        if (diff === 0) {
          streak++;
          expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    return {
      currentStreak: streak,
      totalDaysActive: rows.length,
      lastActive: rows[0].attempt_date
    };
  }
}

module.exports = new LearnerStateTool();
