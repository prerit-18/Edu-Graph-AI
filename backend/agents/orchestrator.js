/**
 * Orchestrator Interface
 * Section 23 of Implementation Guide:
 * Decouples the Application and REST API routes from the underlying multi-agent framework.
 * Allows seamless hot-swapping between CrewAI (Minor) and LangGraph (Major) without modifying API contracts.
 */

const { agents, Task, Crew } = require('./crew');

class OrchestrationInterface {
  constructor(mode = 'crewai') {
    this.mode = mode; // 'crewai' in Minor, 'langgraph' in Major
  }

  /**
   * Concept Teaching Workflow
   */
  async askConcept({ query, subject, topicId, userId }) {
    if (this.mode === 'crewai') {
      const task = new Task({
        description: 'Explain concept grounded in GATE CSE knowledge base with citations',
        expectedOutput: 'Grounded explanation, confidence score, and verified citations',
        agent: agents.conceptTeacher
      });
      const crew = new Crew({ agents: [agents.conceptTeacher], tasks: [task] });
      const result = await crew.kickoff({ query, subject, topicId, userId });
      return result['Concept Teacher'];
    }
    throw new Error(`Orchestrator mode "${this.mode}" not implemented`);
  }

  /**
   * PYQ Trend & Pattern Analysis Workflow
   */
  async analyzePYQ({ topicId, subject, query, userId }) {
    if (this.mode === 'crewai') {
      const task = new Task({
        description: 'Analyze PYQ frequency, question types, and recurring exam patterns',
        expectedOutput: 'Statistical breakdown and strategic exam recommendations',
        agent: agents.pyqAnalyst
      });
      const crew = new Crew({ agents: [agents.pyqAnalyst], tasks: [task] });
      const result = await crew.kickoff({ topicId, subject, query, userId });
      return result['PYQ Analyst'];
    }
    throw new Error(`Orchestrator mode "${this.mode}" not implemented`);
  }

  /**
   * Problem Solving & Answer Verification Workflow
   */
  async solveProblem({ questionId, questionText, studentAnswer, userId, topicId }) {
    if (this.mode === 'crewai') {
      const task = new Task({
        description: 'Derive verified step-by-step solution, run calculator checks, and update BKT',
        expectedOutput: 'Step-by-step explanation, accuracy check, and BKT update',
        agent: agents.problemSolver
      });
      const crew = new Crew({ agents: [agents.problemSolver], tasks: [task] });
      const result = await crew.kickoff({ questionId, questionText, studentAnswer, userId, topicId });
      return result['Problem Solver'];
    }
    throw new Error(`Orchestrator mode "${this.mode}" not implemented`);
  }

  /**
   * Syllabus & Prerequisite Pathway Workflow
   */
  async exploreSyllabus({ topicId, subject, userId }) {
    if (this.mode === 'crewai') {
      const task = new Task({
        description: 'Verify prerequisites and map curriculum learning sequence',
        expectedOutput: 'Syllabus topics with learner readiness indicators',
        agent: agents.syllabusAgent
      });
      const crew = new Crew({ agents: [agents.syllabusAgent], tasks: [task] });
      const result = await crew.kickoff({ topicId, subject, userId });
      return result['Syllabus Agent'];
    }
    throw new Error(`Orchestrator mode "${this.mode}" not implemented`);
  }

  /**
   * Spaced Repetition Revision Workflow
   */
  async getRevisionSchedule({ userId }) {
    if (this.mode === 'crewai') {
      const task = new Task({
        description: 'Prioritize weak and decaying topics using BKT mastery and recency',
        expectedOutput: 'Ranked list of due topics and high-priority study action',
        agent: agents.revisionAgent
      });
      const crew = new Crew({ agents: [agents.revisionAgent], tasks: [task] });
      const result = await crew.kickoff({ userId });
      return result['Revision Agent'];
    }
    throw new Error(`Orchestrator mode "${this.mode}" not implemented`);
  }

  /**
   * Active Recall Workflow
   */
  async generateActiveRecall({ topicId, userId }) {
    return await agents.activeRecallAgent.runner.generatePrompt({ topicId, userId });
  }

  async gradeActiveRecall({ topicId, question, studentAnswer, referenceAnswer, keyConcepts, userId }) {
    return await agents.activeRecallAgent.runner.gradeResponse({
      topicId,
      question,
      studentAnswer,
      referenceAnswer,
      keyConcepts,
      userId
    });
  }

  /**
   * Mock Test Simulator
   */
  generateMockTest({ subject, count }) {
    return agents.mockTestAgent.runner.generateTest({ subject, count });
  }

  evaluateMockTest({ testId, submissions, userId }) {
    return agents.mockTestAgent.runner.evaluateSubmission({ testId, submissions, userId });
  }
}

const orchestratorInstance = new OrchestrationInterface('crewai');
module.exports = orchestratorInstance;
