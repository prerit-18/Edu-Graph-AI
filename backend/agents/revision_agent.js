const learnerStateTool = require('../tools/learner_state_tool');
const syllabusTool = require('../tools/syllabus_tool');
const db = require('../database/db');
const crypto = require('crypto');

/**
 * Revision Agent
 * Role: Spaced Repetition & Retention Optimization Strategist
 * Goal: Identify decaying skills, rank weak/due topics, and recommend high-impact study actions.
 * Tools: learner_state_tool
 */
class RevisionAgent {
  constructor() {
    this.role = 'Revision Agent';
    this.goal = 'Analyze learner state, recency, and PYQ weights to schedule prioritized revisions.';
    this.backstory = 'Cognitive science and spaced repetition expert optimizing student retention for high-weight GATE concepts.';
    this.tools = [learnerStateTool];
  }

  async run({ userId }) {
    if (!userId) {
      return {
        agent: this.role,
        error: 'userId is required to generate a personalized revision schedule.'
      };
    }

    const masteryList = learnerStateTool.getUserMastery(userId);
    const now = new Date();

    // Calculate dynamic priority for each topic:
    // Priority = (1 - P(Know)) * pyq_weight * (1 + 0.1 * days_since_last_seen)
    const prioritized = masteryList.map(item => {
      let daysElapsed = 0;
      if (item.last_seen) {
        const last = new Date(item.last_seen);
        daysElapsed = Math.max(0, Math.floor((now - last) / (1000 * 60 * 60 * 24)));
      } else {
        daysElapsed = 7; // Never seen treated as 7 days stale
      }

      const rawPriority = (1 - item.p_know) * item.pyq_weight * (1 + 0.15 * daysElapsed);
      const isDue = item.p_know < 0.65 || (daysElapsed >= 3 && item.p_know < 0.85);

      return {
        topic_id: item.topic_id,
        topic_name: item.topic_name,
        subject: item.subject,
        p_know: item.p_know,
        pyq_weight: item.pyq_weight,
        last_seen: item.last_seen,
        daysElapsed,
        isDue,
        priorityScore: Number(rawPriority.toFixed(4))
      };
    });

    prioritized.sort((a, b) => b.priorityScore - a.priorityScore);

    const dueTopics = prioritized.filter(p => p.isDue).slice(0, 5);
    const topActionTopic = dueTopics.length > 0 ? dueTopics[0] : prioritized[0];

    let recommendedAction = `No immediate high-urgency revisions! Great work. Continue with new topics.`;
    if (topActionTopic) {
      recommendedAction = `Immediate Focus: Practice active recall on **${topActionTopic.topic_name}** (${topActionTopic.subject}). Current mastery is ${(topActionTopic.p_know * 100).toFixed(1)}% with an exam weight of ${topActionTopic.pyq_weight}.`;
    }

    db.prepare(`
      INSERT INTO agent_logs (id, user_id, agent, grounded, detail)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      userId,
      this.role,
      1,
      JSON.stringify({ dueCount: dueTopics.length, topFocus: topActionTopic?.topic_id })
    );

    return {
      agent: this.role,
      dueTopics,
      topActionTopic,
      recommendedAction,
      allTopicsRanked: prioritized
    };
  }
}

module.exports = new RevisionAgent();
