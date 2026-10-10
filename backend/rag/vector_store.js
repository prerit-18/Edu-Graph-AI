const fs = require('fs');
const path = require('path');
const { generateEmbedding, cosineSimilarity, tokenOverlap } = require('./embeddings');

const INDEX_FILE = path.resolve(__dirname, '../../data/chroma/vector_index.json');

class VectorStore {
  constructor() {
    this.chunks = [];
    this.isLoaded = false;
  }

  /**
   * Load index from disk if available
   */
  load() {
    if (fs.existsSync(INDEX_FILE)) {
      try {
        const raw = fs.readFileSync(INDEX_FILE, 'utf8');
        this.chunks = JSON.parse(raw);
        this.isLoaded = true;
        return true;
      } catch (err) {
        console.warn('Could not read index file, will re-index:', err.message);
      }
    }
    return false;
  }

  /**
   * Save index to disk
   */
  save() {
    const dir = path.dirname(INDEX_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(INDEX_FILE, JSON.stringify(this.chunks, null, 2), 'utf8');
  }

  /**
   * Index all syllabus topics and curated PYQs
   */
  buildIndex() {
    const newChunks = [];

    // 1. Index syllabus topics
    const syllabusPath = path.resolve(__dirname, '../../data/syllabus/syllabus.json');
    if (fs.existsSync(syllabusPath)) {
      const syllabus = JSON.parse(fs.readFileSync(syllabusPath, 'utf8'));
      for (const sub of syllabus) {
        for (const topic of sub.topics) {
          const text = `Subject: ${sub.subject}. Topic: ${topic.name}. Description: ${topic.description}. Prerequisites: ${topic.prerequisite || 'None'}.`;
          newChunks.push({
            id: `syllabus_${topic.id}`,
            text,
            metadata: {
              source_type: 'syllabus',
              subject: sub.subject,
              topic_id: topic.id,
              topic_name: topic.name,
              pyq_weight: topic.pyq_weight
            },
            embedding: generateEmbedding(text)
          });
        }
      }
    }

    // 2. Index PYQ questions dynamically from all subject folders
    const pyqRoot = path.resolve(__dirname, '../../data/pyq');
    if (fs.existsSync(pyqRoot)) {
      const subjectDirs = fs.readdirSync(pyqRoot, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const dirName of subjectDirs) {
        const qFile = path.join(pyqRoot, dirName, 'questions.json');
        if (fs.existsSync(qFile)) {
          try {
            const questions = JSON.parse(fs.readFileSync(qFile, 'utf8'));
            for (const q of questions) {
              const text = `GATE ${q.year} ${q.subject || dirName} [${q.topic_id}] Question: ${q.question} Options: ${q.options ? q.options.join(' | ') : 'N/A'}. Correct Answer: ${q.answer}. Solution Explanation: ${q.explanation}`;
              newChunks.push({
                id: `pyq_${q.id}`,
                text,
                metadata: {
                  source_type: 'pyq',
                  subject: q.subject || dirName,
                  topic_id: q.topic_id,
                  year: q.year,
                  question_id: q.id,
                  type: q.type,
                  answer: q.answer,
                  explanation: q.explanation
                },
                embedding: generateEmbedding(text)
              });
            }
          } catch (err) {
            console.warn(`Could not index ${qFile}:`, err.message);
          }
        }
      }
    }

    this.chunks = newChunks;
    this.isLoaded = true;
    this.save();
    return this.chunks.length;
  }

  /**
   * Search vector store with filters
   * @param {string} query 
   * @param {object} filters 
   * @param {number} topK 
   */
  search(query, filters = {}, topK = 4) {
    if (!this.isLoaded && !this.load()) {
      this.buildIndex();
    }

    const queryVec = generateEmbedding(query);
    const scored = [];

    for (const chunk of this.chunks) {
      // Apply metadata filters
      if (filters.subject && chunk.metadata.subject !== filters.subject) {
        continue;
      }
      if (filters.topic_id && chunk.metadata.topic_id !== filters.topic_id) {
        continue;
      }
      if (filters.source_type && chunk.metadata.source_type !== filters.source_type) {
        continue;
      }

      const cosSim = cosineSimilarity(queryVec, chunk.embedding);
      const overlap = tokenOverlap(query, chunk.text);
      // Hybrid scoring: balances dense hash embedding with sparse lexical overlap
      const hybridScore = Number(((cosSim * 0.35) + (overlap * 0.65)).toFixed(4));
      scored.push({
        id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
        similarity: hybridScore,
        cosSim,
        overlap
      });
    }

    // Sort by highest hybrid similarity
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }
}

const vectorStoreInstance = new VectorStore();
module.exports = vectorStoreInstance;
