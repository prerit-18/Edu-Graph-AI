/**
 * CrewAI Architecture Implementation in EduGraph AI
 * Follows CrewAI primitives:
 * - Agent: role, goal, backstory, tools, llm
 * - Task: description, expected_output, agent, tools
 * - Crew: agents, tasks, process (sequential / hierarchical), kickoff()
 */

const conceptTeacherAgent = require('./concept_teacher');
const pyqAnalystAgent = require('./pyq_analyst');
const problemSolverAgent = require('./problem_solver');
const syllabusAgent = require('./syllabus_agent');
const revisionAgent = require('./revision_agent');
const activeRecallAgent = require('./active_recall_agent');
const mockTestAgent = require('./mock_test_agent');
const { runCrewAITask } = require('./crewai_bridge');

class Agent {
  constructor({ role, goal, backstory, tools = [], runner, taskType }) {
    this.role = role;
    this.goal = goal;
    this.backstory = backstory;
    this.tools = tools;
    this.runner = runner;
    this.taskType = taskType;
  }

  async executeTask(taskInput) {
    // 1. Attempt official Python CrewAI execution if taskType is registered
    if (this.taskType) {
      try {
        const query = taskInput.query || taskInput.questionText || '';
        const crewRes = await runCrewAITask({
          task: this.taskType,
          query,
          subject: taskInput.subject,
          topicId: taskInput.topicId,
          questionId: taskInput.questionId,
          studentAnswer: taskInput.studentAnswer,
          userId: taskInput.userId
        });

        if (crewRes && (crewRes.explanation || crewRes.analysis)) {
          // If the task also needs local state updates (e.g. problem solver BKT)
          if (this.runner && typeof this.runner.run === 'function' && taskInput.studentAnswer !== undefined) {
            const localRun = await this.runner.run(taskInput);
            return {
              ...localRun,
              ...crewRes,
              explanation: crewRes.explanation || localRun.explanation,
              bktUpdate: localRun.bktUpdate || crewRes.bktUpdate
            };
          }

          return {
            agent: this.role,
            grounded: crewRes.grounded !== undefined ? crewRes.grounded : true,
            confidence: crewRes.confidence || 0.88,
            explanation: crewRes.explanation || crewRes.analysis,
            analysis: crewRes.analysis || crewRes.explanation,
            citations: crewRes.citations || [],
            stats: crewRes.stats,
            ...crewRes
          };
        }
      } catch (err) {
        console.warn(`[CrewAI Fallback] ${this.role} falling back to local domain engine:`, err.message);
      }
    }

    // 2. Local resilient domain engine
    if (typeof this.runner?.run === 'function') {
      return await this.runner.run(taskInput);
    }
    throw new Error(`Runner for agent ${this.role} does not implement run()`);
  }
}

class Task {
  constructor({ description, expectedOutput, agent }) {
    this.description = description;
    this.expectedOutput = expectedOutput;
    this.agent = agent;
  }

  async run(context = {}) {
    return await this.agent.executeTask(context);
  }
}

class Crew {
  constructor({ agents = [], tasks = [], process = 'sequential' }) {
    this.agents = agents;
    this.tasks = tasks;
    this.process = process;
  }

  async kickoff(inputs = {}) {
    const results = {};
    for (const task of this.tasks) {
      const taskOutput = await task.run(inputs);
      results[task.agent.role] = taskOutput;
    }
    return results;
  }
}

// Instantiate CrewAI agents with task bindings
const agents = {
  conceptTeacher: new Agent({
    role: 'Concept Teacher',
    goal: 'Deliver grounded GATE CSE explanations with citations',
    backstory: conceptTeacherAgent.backstory,
    tools: conceptTeacherAgent.tools,
    runner: conceptTeacherAgent,
    taskType: 'concept'
  }),
  pyqAnalyst: new Agent({
    role: 'PYQ Analyst',
    goal: 'Analyze recurring exam trends and traps',
    backstory: pyqAnalystAgent.backstory,
    tools: pyqAnalystAgent.tools,
    runner: pyqAnalystAgent,
    taskType: 'pyq'
  }),
  problemSolver: new Agent({
    role: 'Problem Solver',
    goal: 'Step-by-step rigorous solutions with verification and calculator checks',
    backstory: problemSolverAgent.backstory,
    tools: problemSolverAgent.tools,
    runner: problemSolverAgent,
    taskType: 'solve'
  }),
  syllabusAgent: new Agent({
    role: 'Syllabus Agent',
    goal: 'Curriculum pathway navigation and prerequisite verification',
    backstory: syllabusAgent.backstory,
    tools: syllabusAgent.tools,
    runner: syllabusAgent
  }),
  revisionAgent: new Agent({
    role: 'Revision Agent',
    goal: 'Prioritized spaced repetition scheduling',
    backstory: revisionAgent.backstory,
    tools: revisionAgent.tools,
    runner: revisionAgent
  }),
  activeRecallAgent: new Agent({
    role: 'Active Recall Agent',
    goal: 'Active cognitive retrieval prompt generation and answer grading',
    backstory: activeRecallAgent.backstory,
    tools: activeRecallAgent.tools,
    runner: activeRecallAgent
  }),
  mockTestAgent: new Agent({
    role: 'Mock Test Agent',
    goal: 'Full-spectrum GATE examination simulation and diagnostics',
    backstory: mockTestAgent.backstory,
    tools: mockTestAgent.tools,
    runner: mockTestAgent
  })
};

module.exports = {
  Agent,
  Task,
  Crew,
  agents
};
