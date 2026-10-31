const pyqTool = require('../tools/pyq_tool');
const ragTool = require('../tools/rag_tool');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');
const agentPrompts = require('../services/agent_prompts');
const responseCache = require('../services/response_cache');

/**
 * PYQ Analyst Agent
 * Role: GATE CSE Historical Trends & Pattern Specialist
 * Goal: Analyze previous year questions, identify repeat testing patterns, frequency, and trick angles.
 * Tools: pyq_tool, rag_tool
 */
class PYQAnalystAgent {
  constructor() {
    this.role = 'PYQ Analyst';
    this.goal = 'Analyze GATE PYQ frequency, question types, and conceptual recurrence patterns.';
    this.backstory = 'Data-driven exam strategist who dissects 2021-2025 GATE CSE question distributions to uncover recurring question templates.';
    this.tools = [pyqTool, ragTool];
  }

  async run({ topicId, subject, query, userId }) {
    // Determine topic either from parameter or via RAG search
    let targetTopicId = topicId;
    if (!targetTopicId && query) {
      const search = ragTool.execute({ query, filters: { subject } });
      if (search.results.length > 0) {
        targetTopicId = search.results[0].metadata.topic_id;
      }
    }

    if (!targetTopicId) {
      targetTopicId = 'os_scheduling'; // Default high-yield topic
    }

    // Retrieve PYQs and frequency statistics
    const stats = pyqTool.getTopicStats(targetTopicId);
    const questions = pyqTool.getPYQsByTopic(targetTopicId);
    const topicRow = db.prepare('SELECT * FROM topics WHERE id = ?').get(targetTopicId);

    const topicName = topicRow ? topicRow.name : targetTopicId;
    const topicSubject = topicRow ? topicRow.subject : (subject || 'General');

    // Check response cache
    const cacheKey = responseCache.makeKey('PYQ Analyst', targetTopicId, query || topicName, userId);
    if (cacheKey) {
      const cached = responseCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const systemPrompt = agentPrompts.PYQ_ANALYST;

    const userPrompt = `Topic: ${topicName} (${topicSubject})\n` +
      `Stats: ${JSON.stringify(stats, null, 2)}\n` +
      `Sample Questions: ${JSON.stringify(questions.slice(0, 3), null, 2)}`;

    let analysis = await llmClient.generate({
      systemPrompt,
      userPrompt,
      maxOutputTokens: agentPrompts.LIMITS.pyq_solution || 1024,
      agentLabel: 'PYQ Analyst',
      featureLabel: 'pyq_analysis'
    });

    if (!analysis) {
      const sampleList = questions.slice(0, 2).map((q, idx) => 
        `${idx + 1}. **GATE ${q.year} (${q.type}):** *"${q.question.slice(0, 120)}..."* (Official Answer: **${q.answer}**)`
      ).join('\n');

      analysis = `### 📊 PYQ Trend & Distractor Analysis: ${topicName} (${topicSubject})\n\n` +
        `**Exam Weight & Historical Frequency (2021–2025):**\n` +
        `- **Appeared Sessions:** ${stats.years_appeared?.join(', ') || 'Regularly in recent GATE exams'}\n` +
        `- **Historical Recurrence Rate:** ${stats.frequency_rate || 'High-Yield (tested in 60%+ of recent years)'}\n` +
        `- **Question Format Breakdown:** ${Object.entries(stats.types || {}).map(([t, c]) => `${c}x ${t}`).join(', ') || 'MCQ & Numerical Answer Type (NAT)'}\n\n` +
        `**Representative Exam Questions from Verified Archive:**\n` +
        `${sampleList || 'Curated exam questions available in Practice Studio.'}\n\n` +
        `**Recurring Exam Patterns & IIT Traps:**\n` +
        `- **Distractor Traps:** Questions often manipulate arrival order, identical priorities, or subtle preemption boundary timings.\n` +
        `- **Precision:** For NAT questions, avoid rounding until the final calculation step; keep intermediate calculations as exact fractions.\n` +
        `- **Exam Preparation Strategy:** Master 1-mark theoretical properties before tackling multi-process 2-mark numerical derivations.`;
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
        JSON.stringify({ targetTopicId, totalQuestions: stats.total_questions })
      );
    }

    const result = {
      agent: this.role,
      topicId: targetTopicId,
      topicName,
      subject: topicSubject,
      stats,
      sampleQuestions: questions,
      analysis
    };

    if (cacheKey && analysis) {
      responseCache.set(cacheKey, 'PYQ Analyst', targetTopicId, result);
    }

    return result;
  }
}

module.exports = new PYQAnalystAgent();
