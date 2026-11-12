/**
 * Sentence-aware sliding-window chunker.
 * size/overlap are in WORDS. Short texts come back as a single chunk.
 */
function chunkText(text, { size = 90, overlap = 20 } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  if (words.length <= size) return [clean];
  const sentences = clean.match(/[^.!?;]+[.!?;]?/g) || [clean];
  const chunks = []; let cur = [];
  const flush = () => { if (cur.length) chunks.push(cur.join(' ').trim()); };
  for (const s of sentences) {
    const sw = s.trim().split(' ');
    if (cur.length + sw.length > size && cur.length) {
      flush();
      cur = cur.slice(Math.max(0, cur.length - overlap)); // carry-over overlap
    }
    cur.push(...sw);
  }
  flush();
  return chunks;
}
module.exports = { chunkText };
