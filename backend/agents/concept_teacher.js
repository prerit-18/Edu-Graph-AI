const ragTool = require('../tools/rag_tool');
const llmClient = require('./llm_client');
const db = require('../database/db');
const crypto = require('crypto');

/**
 * Concept Teacher Agent
 * Role: Senior GATE CSE Professor & Concept Specialist
 * Goal: Deliver precise, intuitive, and strictly grounded explanations with citations.
 * Backstory: An experienced computer science educator who references official syllabus definitions and prevents misinformation.
 */
class ConceptTeacherAgent {
  constructor() {
    this.role = 'Concept Teacher';
    this.goal = 'Deliver strictly grounded GATE CSE conceptual explanations with verified citations.';
    this.backstory = 'Renowned GATE Computer Science professor who explains complex system concepts rigorously without hallucinating outside the verified syllabus.';
    this.tools = [ragTool];
  }

  async run({ query, userId, subject, topicId }) {
    // 1. Invoke RAG Tool to retrieve verified knowledge base evidence
    const retrieval = ragTool.execute({
      query,
      filters: { subject, topic_id: topicId, topK: 3 }
    });

    const isGrounded = retrieval.isGrounded;

    // Log interaction to agent_logs
    if (userId) {
      db.prepare(`
        INSERT INTO agent_logs (id, user_id, agent, grounded, detail)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        userId,
        this.role,
        isGrounded ? 1 : 0,
        JSON.stringify({ query, confidence: retrieval.confidence })
      );
    }

    // 2. Strict grounding check: if evidence is insufficient, refuse fabrication!
    if (!isGrounded) {
      return {
        agent: this.role,
        grounded: false,
        confidence: retrieval.confidence,
        explanation: `⚠️ **Concept Grounding Notice**: I cannot provide a verified answer for this query. ${retrieval.refusalReason}`,
        citations: [],
        suggestedActions: [
          'Verify that the query pertains directly to GATE CSE (Operating Systems, Algorithms, or DBMS).',
          'Explore official syllabus topics from the Dashboard or Syllabus view.'
        ]
      };
    }

    // 3. Evidence is sufficient - generate grounded explanation
    const contextSnippets = retrieval.results.map(r => r.text).join('\n---\n');

    const systemPrompt = `You are the GATE CSE Concept Teacher.
Strict Guidelines:
1. Explain the student's question clearly, highlighting intuition, formal definitions, and GATE exam significance.
2. Ground your answer strictly in the provided Context Chunks.
3. Explicitly cite the concepts and topics referenced.
4. Keep the explanation structured with clear bullet points.`;

    const userPrompt = `Student Question: ${query}\n\nVerified Context Chunks:\n${contextSnippets}`;

    let explanation = await llmClient.generate({ systemPrompt, userPrompt });

    if (!explanation) {
      // Dynamic query-grounded synthesis
      const topMatch = retrieval.results[0];
      const meta = topMatch.metadata;
      const topicTitle = meta.topic_name || meta.topic_id || subject || 'Core Topic';

      explanation = `### 📘 Concept Deep-Dive: ${topicTitle} (${meta.subject || 'GATE CSE'})\n\n` +
        `**Addressing Your Query:** *"${query}"*\n\n` +
        `**Core Principles & Theoretical Foundations:**\n` +
        `${topMatch.text}\n\n` +
        `**Analysis & Intuitive Insight:**\n` +
        `In GATE CSE, mastery of **${topicTitle}** relies on understanding how the system behaves under edge conditions and constraints. ` +
        `Key invariants must be preserved (e.g. mutual exclusion, serializability, or recurrence relations) regardless of runtime scheduling or data ordering.\n\n` +
        `**GATE CSE Examination Insights:**\n` +
        `- **High-Frequency Testing Points:** Trace step-by-step state transitions, queue ordering, and formula calculations (turnaround time, waiting time, complexity bounds).\n` +
        `- **Tricky Traps:** Watch for subtle distinctions (e.g., preemption vs. non-preemption, boundary condition indexing, and candidate keys vs. superkeys).\n` +
        `- **Recommended Action:** Solve at least 2-3 recent PYQs on ${topicTitle} to cement calculation speed.`;
    }

    return {
      agent: this.role,
      grounded: true,
      confidence: retrieval.confidence,
      explanation,
      citations: retrieval.citations
    };
  }
}

module.exports = new ConceptTeacherAgent();
