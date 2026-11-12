const pyqTool = require('../tools/pyq_tool');
const bank = require('../services/question_bank');
const ragTool = require('../tools/rag_tool');
const { generateWithCrew } = require('./crewai_bridge');
const db = require('../database/db');
const crypto = require('crypto');
const agentPrompts = require('../services/agent_prompts');
const responseCache = require('../services/response_cache');

/**
 * PYQ Analyst Agent
 * Role: GATE CSE Historical Trends & Pattern Specialist
 * Goal: Report what the question bank ACTUALLY shows about a topic (counts, years, types, marks).
 * Everything numeric comes from the SQLite question bank; the LLM/CrewAI only narrates those numbers,
 * and only when there is enough data (>= 3 questions) for a narrative to add value.
 * Tools: pyq_tool, rag_tool
 */
class PYQAnalystAgent {
  constructor() {
    this.role = 'PYQ Analyst';
    this.goal = 'Summarise question counts, years, formats and marks for a topic strictly from the stored GATE papers.';
    this.backstory = 'Data-driven exam analyst who reports only what the stored papers show and flags thin data.';
    this.tools = [pyqTool, ragTool];
  }

  resolveTopic({ topicId, query, subject }) {
    if (topicId) {
      const row = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId);
      if (row) return row;
    }
    if (query) {
      const r = ragTool.execute({ query, filters: { strategy: 'concept', subject } });
      const hit = r.isGrounded && r.results.find(x => x.metadata.topic_id);
      if (hit) return db.prepare('SELECT * FROM topics WHERE id = ?').get(hit.metadata.topic_id);
    }
    return null;
  }

  /** deterministic, data-only report */
  buildReport(topic, stats, questions) {
    const lines = [`### PYQ analysis: ${topic.name} (${topic.subject})`, ''];
    if (stats.official_questions === 0 && stats.practice_questions === 0) {
      lines.push('No questions are stored for this topic yet, so no pattern can be reported.');
    } else {
      lines.push(`**Data coverage:** ${stats.frequency_rate}. ${stats.practice_questions} EduGraph practice question(s) (not official GATE) are also stored.`);
      if (stats.official_questions) {
        lines.push(`- Official questions: **${stats.official_questions}**` + (stats.share_of_subject_official !== null ? ` (${(stats.share_of_subject_official * 100).toFixed(1)}% of stored official ${topic.subject} questions)` : ''));
        lines.push(`- Years: ${stats.years_appeared.join(', ')}`);
      }
      lines.push(`- Formats: ${Object.entries(stats.types).map(([t, c]) => `${c} ${t}`).join(', ')}`);
      lines.push(`- Total marks across stored questions: ${stats.total_marks}`);
      lines.push(stats.recurring
        ? '- This topic appears in 2 or more different years of the stored papers.'
        : '- The stored papers show this topic in fewer than 2 years, so no recurring pattern can be claimed.');
      const showcase = questions.filter(q => q.origin === 'official_gate').slice(0, 3);
      if (showcase.length) {
        lines.push('', '**Official examples:**');
        showcase.forEach(q => lines.push(`- GATE ${q.year} Q${q.q_no || ''} (${q.type}, ${q.marks} mark): ${q.question.slice(0, 110)}...`));
      }
    }
    if (stats.official_questions > 0) {
      const a = bank.analytics({ subject: topic.subject });
      const t = a.topTopics.find(x => x.topic_id === topic.id);
      if (t) {
        const rank = a.topTopics.findIndex(x => x.topic_id === topic.id) + 1;
        lines.push(`- Rank by question count within ${topic.subject}: **#${rank} of ${a.topTopics.length}** topics with questions (${t.questions} questions, ${t.marks} marks).`);
        lines.push(`- Per year: ${Object.entries(t.byYear).map(([y, c]) => `${y}: ${c}`).join(', ')}`);
      }
      const tr = a.subjectShareTrend.find(x => x.subject === topic.subject);
      if (tr) lines.push(`- ${topic.subject} share of CS questions: ${(tr.shareFrom * 100).toFixed(0)}% in ${tr.from} → ${(tr.shareTo * 100).toFixed(0)}% in ${tr.to}.`);
      lines.push(`- _${a.coverage.caveat}_`);
    }
    if (stats.official_years_in_bank === 0) {
      lines.push('', '_Note: no official GATE papers have been ingested yet. Run the ingestion pipeline (docs/GATE_DATA.md) for real previous-year statistics._');
    }
    return lines.join('\n');
  }

  async run({ topicId, subject, query, userId }) {
    const topic = this.resolveTopic({ topicId, query, subject });
    if (!topic) {
      throw Object.assign(new Error('Could not determine a topic. Provide a topicId or a clearer topic name.'), { status: 400 });
    }
    const stats = pyqTool.getTopicStats(topic.id);
    const { questions } = pyqTool.search({ topic_id: topic.id }, { limit: 50 });
    questions.sort((a, b) => (a.origin === 'official_gate' ? 0 : 1) - (b.origin === 'official_gate' ? 0 : 1) || b.year - a.year);

    const sig = `${stats.total_questions}:${stats.official_questions}:${query || ''}`;
    const cacheKey = responseCache.makeKey('PYQ Analyst', topic.id, sig, userId);
    if (cacheKey) { const c = responseCache.get(cacheKey); if (c) return { ...c, cached: true }; }

    let analysis = this.buildReport(topic, stats, questions);
    let generatedBy = 'data';

    if (stats.total_questions >= 3) {
      const data = JSON.stringify({ topic: topic.name, subject: topic.subject, stats,
        samples: questions.slice(0, 4).map(q => ({ year: q.year, type: q.type, marks: q.marks, origin: q.origin, text: q.question.slice(0, 160) })) });
      const description = `Write a brief (under 150 words) exam-prep insight for the topic using ONLY this data. ` +
        `Do not mention years or counts that are not in it.${query ? ` Student focus: ${String(query).slice(0, 200)}` : ''}\nDATA: ${data}`;
      const gen = await generateWithCrew({
        role: 'pyq_analyst', description, expectedOutput: 'Short data-faithful insight paragraph(s).', context: '',
        systemPrompt: agentPrompts.PYQ_ANALYST, userPrompt: description,
        maxOutputTokens: agentPrompts.LIMITS.pyq_analysis, agentLabel: 'PYQ Analyst', featureLabel: 'pyq_analysis'
      });
      if (gen && gen.text) { analysis += `\n\n**Insight:** ${gen.text}`; generatedBy = gen.via; }
    }

    if (userId) {
      db.prepare('INSERT INTO agent_logs (id, user_id, agent, grounded, detail) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), userId, this.role, 1, JSON.stringify({ topicId: topic.id, total: stats.total_questions }));
    }

    const result = {
      agent: this.role, topicId: topic.id, topicName: topic.name, subject: topic.subject,
      stats, sampleQuestions: questions.slice(0, 12), analysis, generatedBy
    };
    if (cacheKey) responseCache.set(cacheKey, 'PYQ Analyst', topic.id, result);
    return result;
  }
}

module.exports = new PYQAnalystAgent();
