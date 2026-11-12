/**
 * Agent / Task / Crew primitives for EduGraph (Minor Project).
 *
 * ACTIVE agents (7): Syllabus, Concept Teacher, PYQ Analyst, Problem Solver, Revision, Mock Test,
 *                    Active Recall.
 * RESERVED for the Major Project (intentionally NOT defined or instantiated): Doubt Debugger, Interview.
 *   To add one later: create agents/<name>.js exporting { role, goal, backstory, tools, run() },
 *   register it in the `agents` map below and add an orchestrator method - nothing else changes.
 *
 * Which agents call CrewAI? Concept Teacher, PYQ Analyst and Problem Solver generate their natural-language
 * output through a real CrewAI crew (agents/crewai_bridge.js -> crewai/crew_runner.py) when an LLM key is
 * configured; the other four are deterministic/BKT-driven services (Syllabus, Revision, Mock Test) or call the
 * LLM directly with a strict JSON contract (Active Recall).
 */
const conceptTeacherAgent = require('./concept_teacher');
const pyqAnalystAgent = require('./pyq_analyst');
const problemSolverAgent = require('./problem_solver');
const syllabusAgent = require('./syllabus_agent');
const revisionAgent = require('./revision_agent');
const activeRecallAgent = require('./active_recall_agent');
const mockTestAgent = require('./mock_test_agent');

const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS || 90000);

class Agent {
  constructor({ role, goal, backstory, tools = [], runner, usesCrewAI = false }) {
    Object.assign(this, { role, goal, backstory, tools, runner, usesCrewAI });
  }

  async executeTask(taskInput = {}) {
    if (typeof this.runner?.run !== 'function') {
      throw new Error(`Runner for agent ${this.role} does not implement run()`);
    }
    const started = Date.now();
    const result = await Promise.race([
      this.runner.run(taskInput),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`${this.role} timed out`), { status: 504 })), AGENT_TIMEOUT_MS).unref())
    ]);
    if (!result || typeof result !== 'object') {
      throw new Error(`${this.role} returned an invalid result`);
    }
    result.agent = result.agent || this.role;
    result.latencyMs = Date.now() - started;
    return result;
  }
}

class Task {
  constructor({ description, expectedOutput, agent }) {
    this.description = description;
    this.expectedOutput = expectedOutput;
    this.agent = agent;
  }
  async run(context = {}) { return this.agent.executeTask(context); }
}

class Crew {
  constructor({ agents = [], tasks = [], process = 'sequential' }) {
    this.agents = agents; this.tasks = tasks; this.process = process;
  }
  async kickoff(inputs = {}) {
    const results = {};
    for (const task of this.tasks) results[task.agent.role] = await task.run(inputs);
    return results;
  }
}

const agents = {
  conceptTeacher: new Agent({ role: 'Concept Teacher', goal: conceptTeacherAgent.goal, backstory: conceptTeacherAgent.backstory, tools: conceptTeacherAgent.tools, runner: conceptTeacherAgent, usesCrewAI: true }),
  pyqAnalyst: new Agent({ role: 'PYQ Analyst', goal: pyqAnalystAgent.goal, backstory: pyqAnalystAgent.backstory, tools: pyqAnalystAgent.tools, runner: pyqAnalystAgent, usesCrewAI: true }),
  problemSolver: new Agent({ role: 'Problem Solver', goal: problemSolverAgent.goal, backstory: problemSolverAgent.backstory, tools: problemSolverAgent.tools, runner: problemSolverAgent, usesCrewAI: true }),
  syllabusAgent: new Agent({ role: 'Syllabus Agent', goal: syllabusAgent.goal, backstory: syllabusAgent.backstory, tools: syllabusAgent.tools, runner: syllabusAgent }),
  revisionAgent: new Agent({ role: 'Revision Agent', goal: revisionAgent.goal, backstory: revisionAgent.backstory, tools: revisionAgent.tools, runner: revisionAgent }),
  activeRecallAgent: new Agent({ role: 'Active Recall Agent', goal: activeRecallAgent.goal, backstory: activeRecallAgent.backstory, tools: activeRecallAgent.tools, runner: activeRecallAgent }),
  mockTestAgent: new Agent({ role: 'Mock Test Agent', goal: mockTestAgent.goal, backstory: mockTestAgent.backstory, tools: mockTestAgent.tools, runner: mockTestAgent })
};

module.exports = { Agent, Task, Crew, agents };
