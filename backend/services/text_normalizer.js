/**
 * Educational Text Normalizer for Speech Synthesis
 * Converts raw Markdown, LaTeX mathematical formulas, symbols, and CS expressions
 * into fluent, natural spoken English for the AI Speaking Tutor.
 */

function normalizeEducationalTextForSpeech(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Remove code blocks (replace with friendly audio cue)
  cleaned = cleaned.replace(/```[a-z]*[\s\S]*?```/gi, ' Refer to the code implementation shown on screen. ');

  // 2. Remove Markdown tables (replace with brief spoken note)
  cleaned = cleaned.replace(/\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n?)+/gi, ' Refer to the summary table on screen. ');

  // 3. Remove inline code backticks while preserving the text inside
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 4. Remove image syntax and HTML tags
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');

  // 5. Clean Markdown headers: '### 📘 Operating Systems ➔ CONCEPT' -> 'Operating Systems: CONCEPT.'
  cleaned = cleaned.replace(/^#+\s*[^\w\s]*\s*(.+)$/gm, (match, title) => {
    const formatted = title.replace(/[➔→]/g, ': ').replace(/[📘⚡🎯🧠📊🔍⚠️💡]/g, '').replace(/\s+/g, ' ').trim();
    return formatted.endsWith('.') ? formatted : formatted + '.';
  });

  // 6. Clean callout trap / pro-tip blockquotes
  cleaned = cleaned.replace(/^>\s*[⚠️💡]*\s*\*\*([^*]+)\*\*:?/gm, '$1:');
  cleaned = cleaned.replace(/^>\s*/gm, '');

  // 7. Remove citation pills and bracketed references
  cleaned = cleaned.replace(/\[Source:[^\]]+\]/gi, '');
  cleaned = cleaned.replace(/\[[0-9]+\]/g, '');

  // 8. Convert explicit LaTeX and mathematical formulas ($ ... $) FIRST so math symbols like * are preserved
  cleaned = cleaned.replace(/\$([^$]+)\$/g, (match, formula) => {
    return normalizeFormula(formula);
  });

  // 9. Strip Markdown bold, italics, bullets, and decorators from prose (prevents asterisks becoming "times times")
  cleaned = cleaned.replace(/\*\*\*([^*]+)\*\*\*/g, '$1'); // bold italic
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');     // bold
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');         // italic
  cleaned = cleaned.replace(/___([^_]+)___/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');
  cleaned = cleaned.replace(/^[\*\-\+]\s+/gm, ' ');         // bullet points
  cleaned = cleaned.replace(/[*_~]{1,3}/g, '');            // any leftover stray asterisks/underscores
  cleaned = cleaned.replace(/---+/g, ' ');

  // 10. Also catch unescaped standalone CS and math expressions
  cleaned = normalizeFormula(cleaned);

  // 11. Clean extra whitespaces and punctuation runs
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  cleaned = cleaned.replace(/\s+([.,;:?!])/g, '$1');

  return cleaned.trim();
}

/**
 * Normalizes mathematical and Computer Science expressions to natural spoken words
 */
function normalizeFormula(formula) {
  let f = formula;

  // Specific high-yield GATE CSE metrics
  f = f.replace(/\bTAT\s*=\s*CT\s*-\s*AT\b/gi, 'Turnaround Time equals Completion Time minus Arrival Time');
  f = f.replace(/\bWT\s*=\s*TAT\s*-\s*BT\b/gi, 'Waiting Time equals Turnaround Time minus Burst Time');
  f = f.replace(/\bWT\s*=\s*\(CT\s*-\s*AT\)\s*-\s*BT\b/gi, 'Waiting Time equals Completion Time minus Arrival Time minus Burst Time');
  f = f.replace(/\bBDP\s*=\s*Bandwidth\s*\*\s*Delay\b/gi, 'Bandwidth Delay Product equals Bandwidth times Propagation Delay');

  // Master Theorem & Recurrences
  f = f.replace(/T\(n\)\s*=\s*a\s*\*\s*T\(n\/b\)\s*\+\s*f\(n\)/gi, 'T of n equals a times T of n over b plus f of n');
  f = f.replace(/n\^\{\\log_b\s*a\}/gi, 'n to the power of log base b of a');
  f = f.replace(/n\^\(log_b\s*a\)/gi, 'n to the power of log base b of a');
  f = f.replace(/\\log_2/gi, 'log base 2');
  f = f.replace(/\\log_b/gi, 'log base b');
  f = f.replace(/\blog_2\b/gi, 'log base 2');

  // Asymptotic notation
  f = f.replace(/\\Theta\s*\(([^)]+)\)/gi, 'Theta of $1');
  f = f.replace(/Theta\s*\(([^)]+)\)/gi, 'Theta of $1');
  f = f.replace(/\\Omega\s*\(([^)]+)\)/gi, 'Big Omega of $1');
  f = f.replace(/Omega\s*\(([^)]+)\)/gi, 'Big Omega of $1');
  f = f.replace(/O\s*\(([^)]+)\)/g, 'Big O of $1');

  // Complexities inside notations
  f = f.replace(/n\s*\\log\s*n/gi, 'n log n');
  f = f.replace(/n\s*log\s*n/gi, 'n log n');
  f = f.replace(/n\^2/g, 'n squared');
  f = f.replace(/n\^3/g, 'n cubed');
  f = f.replace(/n\^k/g, 'n to the power of k');
  f = f.replace(/2\^n/g, 'two to the power of n');
  f = f.replace(/n!/g, 'n factorial');

  // Graph cardinality
  f = f.replace(/\|V\|\s*=\s*/gi, 'number of vertices equals ');
  f = f.replace(/\|E\|\s*=\s*/gi, 'number of edges equals ');
  f = f.replace(/\|V\|/gi, 'number of vertices');
  f = f.replace(/\|E\|/gi, 'number of edges');

  // Mathematical symbols
  f = f.replace(/\\le|\\leq|<=/g, ' is less than or equal to ');
  f = f.replace(/\\ge|\\geq|>=/g, ' is greater than or equal to ');
  f = f.replace(/\\neq|!=/g, ' is not equal to ');
  f = f.replace(/\\approx|~=/g, ' is approximately ');
  f = f.replace(/\\in/g, ' in ');
  f = f.replace(/\\notin/g, ' not in ');
  f = f.replace(/\\subset/g, ' subset of ');
  f = f.replace(/\\cup/g, ' union ');
  f = f.replace(/\\cap/g, ' intersection ');
  f = f.replace(/\\infty/g, 'infinity');
  f = f.replace(/\\times|\\cdot/g, ' times ');
  f = f.replace(/([0-9a-zA-Z\)])\s*\*\s*([0-9a-zA-Z\(])/g, '$1 times $2'); // Only convert * between variables/numbers
  f = f.replace(/\*/g, ''); // Strip any loose leftover asterisks
  f = f.replace(/\\rightarrow|->/g, ' implies ');
  f = f.replace(/\\leftarrow|<-/g, ' assigned from ');
  f = f.replace(/\\epsilon/g, 'epsilon');

  return f;
}

/**
 * Splits normalized text into digestible sentences/chunks (150-200 chars max)
 * to prevent browser SpeechSynthesis buffer stalls on long educational answers.
 */
function splitTextIntoSpeechChunks(text, maxChunkLen = 180) {
  if (!text) return [];

  // Split on sentence terminators
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
  const chunks = [];
  let currentChunk = '';

  for (const rawSentence of sentences) {
    const s = rawSentence.trim();
    if (!s) continue;

    if (currentChunk.length + s.length + 1 <= maxChunkLen) {
      currentChunk += (currentChunk ? ' ' : '') + s;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      if (s.length > maxChunkLen) {
        // Sub-split by clauses on comma/semicolon if very long
        const clauses = s.split(/([,;:]\s+)/);
        let clauseBuf = '';
        for (const cl of clauses) {
          if (clauseBuf.length + cl.length <= maxChunkLen) {
            clauseBuf += cl;
          } else {
            if (clauseBuf) chunks.push(clauseBuf.trim());
            clauseBuf = cl;
          }
        }
        if (clauseBuf.trim()) currentChunk = clauseBuf.trim();
        else currentChunk = '';
      } else {
        currentChunk = s;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

module.exports = {
  normalizeEducationalTextForSpeech,
  normalizeFormula,
  splitTextIntoSpeechChunks
};
