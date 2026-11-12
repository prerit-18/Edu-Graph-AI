const syllabusTool = require('../tools/syllabus_tool');
const learnerStateTool = require('../tools/learner_state_tool');
const { statusFor, THRESHOLDS } = require('../knowledge_tracing/bkt');

/**
 * Syllabus Agent
 * Role: GATE CSE curriculum navigator. Topics, descriptions and the official syllabus text come ONLY from
 * data/syllabus/syllabus.json (nothing is invented). Learner readiness comes from BKT: an unattempted prerequisite
 * is reported as "not yet attempted", not as "low mastery".
 * Tools: syllabus_tool, learner_state_tool
 */
class SyllabusAgent {
  constructor() {
    this.role = 'Syllabus Agent';
    this.goal = 'Navigate the official syllabus and prerequisite graph and report learner readiness per topic.';
    this.backstory = 'Curriculum architect who sequences topics by prerequisites and never invents syllabus content.';
    this.tools = [syllabusTool, learnerStateTool];
  }

  async run({ topicId, subject, userId }) {
    const allTopics = syllabusTool.getAllTopics();
    const byId = new Map();
    if (userId) learnerStateTool.getUserMastery(userId).forEach(m => byId.set(m.topic_id, m));

    const view = allTopics.map(t => {
      const m = byId.get(t.id);
      const attempted = !!(m && m.last_seen);
      const status = attempted ? statusFor(m.p_know, m.n_attempts) : 'not_started';
      let prereqStatus = 'Ready';
      if (t.prerequisite_id) {
        const pm = byId.get(t.prerequisite_id);
        if (!pm || !pm.last_seen) prereqStatus = `Prerequisite "${t.prerequisite_id}" not attempted yet`;
        else if (pm.p_know < 0.60) prereqStatus = `Prerequisite "${t.prerequisite_id}" below 60% mastery`;
      }
      return {
        id: t.id, name: t.name, subject: t.subject, prerequisite_id: t.prerequisite_id, pyq_weight: t.pyq_weight,
        description: syllabusTool.getTopicDescription(t.id),
        attempted, n_attempts: m ? m.n_attempts : 0,
        p_know: attempted ? m.p_know : null, status, prereqStatus
      };
    });

    const wanted = subject ? view.filter(t => t.subject.toLowerCase() === String(subject).toLowerCase()) : view;
    let targetPath = null;
    if (topicId) {
      const chain = syllabusTool.getPrerequisiteChain(topicId);
      if (!chain.length) throw Object.assign(new Error(`Unknown topic "${topicId}"`), { status: 404 });
      targetPath = chain.map(t => view.find(v => v.id === t.id));
    }
    return {
      agent: this.role, subjectFilter: subject || 'All',
      officialSyllabus: subject ? syllabusTool.getOfficialSyllabus(subject) : null,
      minAttemptsForClassification: THRESHOLDS.minAttempts,
      topics: wanted, targetPath
    };
  }
}

module.exports = new SyllabusAgent();
