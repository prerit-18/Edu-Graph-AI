/**
 * Embeddings Module
 * Generates dense normalized vector representations for text chunks and queries.
 * Supports cosine similarity computation and token overlap analysis.
 */

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 
  'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could', 
  'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 
  'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 
  'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 
  'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 
  'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 
  'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 
  'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 
  'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 
  'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 
  'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 
  'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 
  'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 
  'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 
  'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 
  'yours', 'yourself', 'yourselves', 'please', 'tell', 'explain', 'give', 'how'
]);

/**
 * Tokenize text into normalized lowercase tokens
 * @param {string} text 
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\+\-\*\/]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Compute Term Frequency map
 * @param {string[]} tokens 
 * @returns {Map<string, number>}
 */
function computeTF(tokens) {
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

/**
 * Create a hash-based fixed-dimension dense vector (Embedding dimension: 512)
 * Normalized to unit length (L2 norm = 1.0)
 * @param {string} text 
 * @param {number} dim 
 * @returns {number[]}
 */
function generateEmbedding(text, dim = 512) {
  const tokens = tokenize(text);
  const vector = new Float32Array(dim);
  if (tokens.length === 0) return Array.from(vector);

  const tf = computeTF(tokens);
  
  for (const [token, count] of tf.entries()) {
    // 32-bit FNV-1a hash
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % dim;
    const sign = (hash & 1) === 0 ? 1 : -1;
    
    const weight = (1 + Math.log(count)) * sign;
    vector[index] += weight;

    // Sub-token character n-grams for morphology
    if (token.length > 3) {
      for (let j = 0; j < token.length - 2; j++) {
        const sub = token.substring(j, j + 3);
        let subHash = 2166136261;
        for (let k = 0; k < sub.length; k++) {
          subHash ^= sub.charCodeAt(k);
          subHash = Math.imul(subHash, 16777619);
        }
        const subIndex = Math.abs(subHash) % dim;
        vector[subIndex] += 0.25 * sign;
      }
    }
  }

  // L2 normalization
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] /= norm;
    }
  }

  return Array.from(vector);
}

/**
 * Cosine similarity between two normalized vectors
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number}
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return Math.max(0, Math.min(1, dot));
}

/**
 * Check literal token intersection between query and document text
 * @param {string} query 
 * @param {string} docText 
 * @returns {number} Fraction of query tokens found in docText (0.0 to 1.0)
 */
function tokenOverlap(query, docText) {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const docLower = docText.toLowerCase();
  let matched = 0;
  for (const token of qTokens) {
    if (docLower.includes(token)) {
      matched++;
    }
  }
  return matched / qTokens.length;
}

module.exports = {
  tokenize,
  generateEmbedding,
  cosineSimilarity,
  tokenOverlap
};
