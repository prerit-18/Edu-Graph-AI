#!/usr/bin/env node
/**
 * Generate Gemini embeddings for every chunk of the retrieval index (syllabus, official syllabus text, questions).
 * Resumable (skips chunks whose text hash is unchanged) and quota-aware (stops cleanly on a quota/rate error).
 *   npm run embed            # all missing chunks
 *   npm run embed -- 100     # at most 100 chunks this run
 */
require('dotenv').config();
const seed = require('../database/seed');
seed({ quiet: true });
require('../services/question_bank').importAll();
const store = require('../rag/vector_store');
const semantic = require('../rag/semantic');
const llm = require('../agents/llm_client');

(async () => {
  if (!llm.hasValidKey() || llm.status().provider !== 'gemini') { console.error('A Gemini API key is required (GEMINI_API_KEY).'); process.exit(1); }
  store.ensureFresh();
  const cov = semantic.coverage(store.chunks);
  console.log(`Index: ${cov.total} chunks, ${cov.embedded} already embedded with ${llm.embedModel}.`);
  const limit = Number(process.argv[2]) || Infinity;
  const r = await semantic.embedIndex(store.chunks, { limit, onProgress: (d, t) => { if (d % 25 === 0 || d === t) console.log(`  embedded ${d}/${t}`); } });
  console.log(`Done: ${r.embedded} embedded, ${r.remaining} remaining.`, r.error ? `Stopped: ${r.error.code} - ${r.error.message}` : '');
  const c2 = semantic.coverage(store.chunks);
  console.log(`Coverage: ${c2.embedded}/${c2.total} (${(c2.ratio * 100).toFixed(0)}%)`);
  process.exit(r.error ? 2 : 0);
})();
