const syllabusTool = require('../tools/syllabus_tool');
const learnerStateTool = require('../tools/learner_state_tool');
const db = require('../database/db');
const crypto = require('crypto');

/**
 * Syllabus Agent
 * Role: GATE CSE Curriculum Guide & Dependency Navigator
 * Goal: Map prerequisites, sequence topic learning paths, and identify syllabus coverage gaps.
 * Tools: syllabus_tool, learner_state_tool
 */
class SyllabusAgent {
  constructor() {
    this.role = 'Syllabus Agent';
    this.goal = 'Navigate syllabus prerequisite trees and recommend optimal learning sequences.';
    this.backstory = 'Curriculum architect who understands topic prerequisite graphs and ensures students build foundational mastery before tackling advanced topics.';
    this.tools = [syllabusTool, learnerStateTool];
  }

  async run({ topicId, subject, userId }) {
    const allTopics = syllabusTool.getAllTopics();
    let masteryMap = {};
    if (userId) {
      const userMastery = learnerStateTool.getUserMastery(userId);
      userMastery.forEach(m => {
        masteryMap[m.topic_id] = m.p_know;
      });
    }

    // Build directed acyclic graph (DAG) of syllabus
    const topicsWithPrereqStatus = allTopics.map(t => {
      const pKnow = masteryMap[t.id] !== undefined ? masteryMap[t.id] : 0.30;
      let prereqStatus = 'Ready';
      if (t.prerequisite_id) {
        const prereqPKnow = masteryMap[t.prerequisite_id] !== undefined ? masteryMap[t.prerequisite_id] : 0.30;
        if (prereqPKnow < 0.60) {
          prereqStatus = `Prerequisite "${t.prerequisite_id}" below 60% mastery`;
        }
      }

      return {
        id: t.id,
        name: t.name,
        subject: t.subject,
        prerequisite_id: t.prerequisite_id,
        pyq_weight: t.pyq_weight,
        p_know: pKnow,
        prereqStatus
      };
    });

    // Targeted path if topicId provided
    let path = null;
    if (topicId) {
      path = syllabusTool.getPrerequisiteChain(topicId).map(t => ({
        ...t,
        p_know: masteryMap[t.id] !== undefined ? masteryMap[t.id] : 0.30
      }));
    }

    if (userId) {
      db.prepare(`
        INSERT INTO agent_logs (id, user_id, agent, grounded, detail)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        userId,
        this.role,
        1,
        JSON.stringify({ topicId, subject })
      );
    }

    return {
      agent: this.role,
      subjectFilter: subject || 'All',
      topics: subject ? topicsWithPrereqStatus.filter(t => t.subject.toLowerCase() === subject.toLowerCase()) : topicsWithPrereqStatus,
      targetPath: path
    };
  }
}

module.exports = new SyllabusAgent();
