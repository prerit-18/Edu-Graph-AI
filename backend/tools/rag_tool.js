const { retrieve } = require('../rag/retriever');

/**
 * RAG Tool for Agents
 * Retrieves verified context and grounding evidence from the GATE knowledge base.
 */
class RAGTool {
  constructor() {
    this.name = 'rag_tool';
    this.description = 'Retrieves official GATE syllabus descriptions, notes, and previous year questions with grounding confidence scores.';
  }

  execute(params) {
    const query = typeof params === 'string' ? params : params.query;
    const filters = typeof params === 'object' ? params.filters || {} : {};
    return retrieve(query, filters);
  }
}

module.exports = new RAGTool();
