const vectorStore = require('../backend/rag/vector_store');

console.log('Building RAG vector index from syllabus and PYQs...');
const count = vectorStore.buildIndex();
console.log(`RAG vector index successfully built with ${count} chunks!`);
