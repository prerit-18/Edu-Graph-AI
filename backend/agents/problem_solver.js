const ragTool = require('../tools/rag_tool');
const pyqTool = require('../tools/pyq_tool');
const bktTool = require('../tools/bkt_tool');
const bank = require('../services/question_bank');
const { generateWithCrew } = require('./crewai_bridge');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');
const agentPrompts = require('../services/agent_prompts');

/**
 * Problem Solver Agent
 * Role: Step-by-step solver and answer verifier.
 * Rules:
 *  - Grading is deterministic and uses the stored OFFICIAL key (MCQ / MSQ / NAT range) - never an LLM.
 *  - The key and explanation are only revealed after the student answers (or asks to reveal).
 *  - Stored explanations are used as-is (and labelled by source). Only when none exists is an AI derivation
 *    generated through CrewAI; it is cross-checked against the key and flagged if it disagrees.
 *  - Custom (non-bank) problems get an AI solution that is explicitly marked unverified and never touches BKT.
 * Tools: rag_tool, bkt_tool (+ CrewAI calculator tool in the crew path)
 */
class ProblemSolverAgent {
  constructor() {
    this.role = 'Problem Solver';
    this.goal = 'Solve GATE problems step by step, verify answers against official keys, and update learner mastery.';
    this.backstory = 'Meticulous solver who verifies every numeric step and never forces a derivation to match a key.';
    this.tools = [ragTool, bktTool];  // arithmetic verification runs through the CrewAI calculator tool (crewai/tools.py) and mathjs checks
  }

  keyAppearsIn(text, q) {
    if (!q || !q.answer) return true;
    const t = String(text).toLowerCase();
    if (q.type === 'NAT') {
      const ref = q.numeric_answer ?? parseFloat(q.answer);
      return [String(ref), String(Number(ref.toFixed ? ref.toFixed(2) : ref))].some(v => t.includes(v));
    }
    const letters = String(q.answer).toUpperCase().split(';');
    return letters.every(l => new RegExp(`(\\(|\\b|option\\s*)${l.toLowerCase()}\\b`).test(t));
  }

  /**
   * Gemini explains WHY the official answer is right. Its structured output must restate the official answer
   * ("final_answer"), which is checked deterministically (MCQ/MSQ/NAT rules); a disagreeing explanation is discarded.
   * Valid explanations are cached per answer-key version.
   */
  async explainOfficialAnswer(q, keyRec) {
    const ver = keyRec.source ? keyRec.source.key_version : 1;
    const cached = db.prepare("SELECT explanation, model FROM ai_explanations WHERE question_id = ? AND key_version = ? AND kind = 'official_key_explanation'").get(q.id, ver);
    if (cached) return { text: cached.explanation, model: cached.model, cached: true };
    if (!llmClient.isAvailable()) return { text: null, reason: llmClient.status().lastError?.code || 'AI service unavailable' };
    const support = ragTool.execute({ query: q.question.slice(0, 300), filters: { strategy: 'solution', topic_id: q.topic_id, topK: 2 } });
    const material = support.results.filter(r => r.metadata.source_type === 'syllabus').map(r => r.text).join('\n').slice(0, 600);
    const brief = JSON.stringify({ question: q.question, options: q.options.length ? q.options : undefined, type: q.type, official_answer: q.answer, marks: q.marks, material: material || undefined });
    try {
      const out = await llmClient.generateJSON({
        systemPrompt: agentPrompts.PYQ_EXPLAINER, userPrompt: brief, temperature: 0.2, maxOutputTokens: agentPrompts.LIMITS.pyq_solution,
        agentLabel: 'Problem Solver', featureLabel: 'pyq_solution',
        validate: o => {
          if (typeof o.explanation !== 'string' || o.explanation.trim().length < 20) throw new Error('explanation missing');
          if (typeof o.final_answer !== 'string') throw new Error('final_answer missing');
          const check = bank.evaluateAnswer(q, o.final_answer);
          if (check.isCorrect !== true) throw new Error(`final_answer "${o.final_answer}" disagrees with the official answer - explain the OFFICIAL answer ${q.answer}`);
          return null;
        }
      });
      const text = out.explanation.trim().slice(0, 2500);
      db.prepare("INSERT OR REPLACE INTO ai_explanations (question_id, key_version, kind, explanation, final_answer, model) VALUES (?, ?, 'official_key_explanation', ?, ?, ?)")
        .run(q.id, ver, text, out.final_answer, llmClient.modelFor('pyq_solution'));
      return { text, model: llmClient.modelFor('pyq_solution'), cached: false };
    } catch (e) {
      return { text: null, reason: e.code === 'VALIDATION' ? 'the generated explanation did not agree with the official answer and was discarded' : (e.code || e.message) };
    }
  }

  /** Independent AI solution for a question WITHOUT a verified key (or a custom problem). Always labelled unverified. */
  async provisionalSolution(q, problem) {
    const id = q ? q.id : null;
    if (id) {
      const c = db.prepare("SELECT explanation, final_answer, model FROM ai_explanations WHERE question_id = ? AND key_version = 0 AND kind = 'provisional_solution'").get(id);
      if (c) return { text: c.explanation, answer: c.final_answer, model: c.model, cached: true };
    }
    if (!llmClient.isAvailable()) return { text: null, reason: llmClient.status().lastError?.code || 'AI service unavailable' };
    const ctx = ragTool.execute({ query: problem.slice(0, 300), filters: { strategy: 'solution', topic_id: q ? q.topic_id : undefined, topK: 2 } });
    const brief = JSON.stringify({ question: problem, options: q && q.options.length ? q.options : undefined, type: q ? q.type : undefined, material: ctx.results.map(r => r.text).join('\n').slice(0, 600) || undefined });
    try {
      const gen = await generateWithCrew({
        role: 'problem_solver', description: `Solve step by step and state the final answer. Be concise.\n${brief}`, expectedOutput: 'Numbered steps ending with "Final answer: ..."',
        context: '', systemPrompt: agentPrompts.PROBLEM_SOLVER, userPrompt: brief, maxOutputTokens: agentPrompts.LIMITS.pyq_solution, agentLabel: 'Problem Solver', featureLabel: 'pyq_solution'
      });
      if (!gen || !gen.text) return { text: null, reason: llmClient.status().lastError?.code || 'AI service unavailable' };
      const m = /final answer\s*[:\-]\s*(.+)/i.exec(gen.text);
      const answer = m ? m[1].trim().slice(0, 120) : null;
      if (id) db.prepare("INSERT OR REPLACE INTO ai_explanations (question_id, key_version, kind, explanation, final_answer, model) VALUES (?, 0, 'provisional_solution', ?, ?, ?)").run(id, gen.text.slice(0, 2500), answer, gen.via);
      return { text: gen.text.trim(), answer, model: gen.via };
    } catch (e) { return { text: null, reason: e.code || e.message }; }
  }

  async run({ questionId, questionText, studentAnswer, userId, topicId, reveal = false }) {
    let q = null;
    if (questionId) {
      q = pyqTool.getPYQById(questionId);
      if (!q) throw Object.assign(new Error(`Question "${questionId}" not found`), { status: 404 });
    } else if (typeof questionText !== 'string' || questionText.trim().length < 10 || questionText.length > 2000) {
      throw Object.assign(new Error('questionText must be 10-2000 characters'), { status: 400 });
    }

    const problem = q ? q.question : questionText.trim();
    const assignedTopic = q ? q.topic_id : (topicId && db.prepare('SELECT 1 FROM topics WHERE id = ?').get(topicId) ? topicId : null);
    const answered = studentAnswer !== undefined && studentAnswer !== null && String(studentAnswer).trim() !== '';

    // 1. Deterministic grading + learner update (bank questions only)
    let grade = null; let bktResult = null;
    if (q && answered) {
      grade = bank.evaluateAnswer(q, studentAnswer);
      if (userId && grade.isCorrect !== null) {
        bktResult = bktTool.recordPractice(userId, assignedTopic, this.role, problem, studentAnswer, grade.isCorrect,
          { type: q.type, source: 'pyq_practice', questionId: q.id });
      }
    }

    const mayReveal = !q || answered || reveal === true;

    // 2. Official key record (provenance-checked). Gemini only EXPLAINS it; it never decides it.
    const keyRec = q ? bank.officialKeyRecord(q) : null;
    const officialVerified = !!(keyRec && keyRec.kind === 'official' && keyRec.verified);
    let explanation = null; let explanationSource = 'none'; let explanationWarning = null; let aiExplanation = null; let provisional = null; let aiNotice = null;
    if (mayReveal) {
      if (q && q.explanation && q.explanation_source !== 'ai') {
        explanation = q.explanation; explanationSource = q.explanation_source || 'curated';   // stored (practice-set) solution
      } else if (q && officialVerified) {
        const r = await this.explainOfficialAnswer(q, keyRec);
        if (r.text) { explanation = r.text; explanationSource = 'ai'; aiExplanation = { text: r.text, model: r.model, consistentWithOfficialKey: true, cached: r.cached }; }
        else aiNotice = r.reason;
      } else {
        // no official key (custom problem or key unavailable): clearly-labelled provisional AI solution
        const r = await this.provisionalSolution(q, problem);
        if (r.text) {
          explanation = r.text; explanationSource = 'ai'; explanationWarning = 'AI-generated solution - NOT verified against any official key.';
          provisional = { answer: r.answer, label: 'AI-generated, unverified', model: r.model };
          aiExplanation = { text: r.text, model: r.model, consistentWithOfficialKey: null, cached: r.cached };
        } else aiNotice = r.reason;
      }
      if (!explanation && aiNotice) {
        explanation = officialVerified
          ? `The official answer is ${q.answer}. An AI explanation is not available right now (${aiNotice}).`
          : `No official key is available and an AI solution could not be generated right now (${aiNotice}).`;
      }
    }

    if (userId) {
      db.prepare('INSERT INTO agent_logs (id, user_id, agent, grounded, detail) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), userId, this.role, q ? 1 : 0,
          JSON.stringify({ questionId, isCorrect: grade ? grade.isCorrect : null, newPKnow: bktResult?.newPKnow }));
    }

    const hasKey = !!(q && q.answer);
    return {
      agent: this.role,
      questionId: q ? q.id : null,
      question: problem,
      options: q ? q.options : [],
      type: q ? q.type : null,
      marks: q ? q.marks : null,
      year: q ? q.year : null,
      origin: q ? q.origin : 'custom',
      verificationStatus: q ? q.verification_status : 'unverified',
      topicId: assignedTopic,
      answered,
      isCorrect: grade ? grade.isCorrect : null,
      marksAwarded: grade ? grade.marksAwarded : null,
      officialAnswer: mayReveal && officialVerified ? q.answer : (mayReveal && q && q.origin !== 'official_gate' && hasKey ? q.answer : null),
      hasOfficialKey: officialVerified,
      answerStatus: !q ? 'unverified' : (officialVerified ? 'official' : (q.origin === 'official_gate' ? 'unverified' : 'practice_key')),
      official: mayReveal && keyRec ? { answer: keyRec.answer, verified: keyRec.verified, label: keyRec.label, source: keyRec.source, keyRevisions: keyRec.revisions || 0 } : null,
      aiExplanation, provisional, aiNotice,
      studentAnswer: answered ? String(studentAnswer) : null,
      bktUpdate: bktResult,
      explanation,
      explanationSource,
      explanationWarning,
      citations: q ? [{ source: q.origin === 'official_gate' ? `GATE CSE ${q.year} (official)` : 'EduGraph practice set (not an official GATE question)', question_id: q.id }] : []
    };
  }
}

module.exports = new ProblemSolverAgent();
