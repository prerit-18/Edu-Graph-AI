/**
 * Lexical vs semantic (Gemini embedding) retrieval on the three query sets.
 * Needs a database whose chunk_embeddings were generated with `npm run embed`:
 *   DB_PATH=/path/to/db node evaluation/run_semantic_eval.js
 * Metrics: grounding accuracy (answer / refuse), false positives (out-of-domain answered), topic@1 for in-domain queries.
 * SEMANTIC_GATE is calibrated on test_cases.json only; the held-out sets are never used to set it.
 */
const path = require('path');
const B = path.resolve(__dirname, '../backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') });
require(path.join(B, 'database/seed'))({ quiet: true });
require(path.join(B, 'services/question_bank')).importAll();
const store = require(path.join(B, 'rag/vector_store'));
const semantic = require(path.join(B, 'rag/semantic'));
const { retrieve, retrieveAsync } = require(path.join(B, 'rag/retriever'));

(async () => {
  store.ensureFresh();
  const cov = semantic.coverage(store.chunks);
  console.log(`embedding coverage: ${cov.embedded}/${cov.total}`);
  if (cov.ratio < 0.5) { console.error('Run `npm run embed` first.'); process.exit(1); }
  const sets = ['test_cases.json', 'heldout_cases.json', 'heldout2_cases.json'];
  const rows = {};
  for (const f of sets) {
    const cases = require(path.resolve(__dirname, f));
    const out = [];
    for (const c of cases) {
      const lex = retrieve(c.query);
      const sem = await retrieveAsync(c.query, {});
      out.push({ c, lex, sem });
      await new Promise(r => setTimeout(r, 700));
    }
    rows[f] = out;
  }
  const summarize = (rs, key) => {
    let ok = 0, fp = 0, fn = 0, inDom = 0, top = 0;
    for (const { c, lex, sem } of rs) {
      const r = key === 'lex' ? lex : sem;
      if (r.isGrounded === c.should_be_grounded) ok++; else if (r.isGrounded) fp++; else fn++;
      if (c.should_be_grounded) { inDom++; if (r.results[0] && r.results[0].metadata.topic_id === c.expected_topic) top++; }
    }
    return `grounding ${(100 * ok / rs.length).toFixed(1)}% (FP ${fp}, FN ${fn}), topic@1 ${top}/${inDom}`;
  };
  for (const f of sets) {
    console.log(`\n${f} (n=${rows[f].length})\n  lexical : ${summarize(rows[f], 'lex')}\n  semantic: ${summarize(rows[f], 'sem')}`);
  }
  // separation of the best semantic cosine on the tuning set (for choosing SEMANTIC_GATE)
  const tune = rows['test_cases.json'];
  const sc = r => r.sem.semanticScore ?? 0;
  const inMin = Math.min(...tune.filter(x => x.c.should_be_grounded).map(sc));
  const outMax = Math.max(...tune.filter(x => !x.c.should_be_grounded).map(sc));
  console.log(`\ntuning set semantic cosine: in-domain min ${inMin.toFixed(3)}, out-of-domain max ${outMax.toFixed(3)} (current SEMANTIC_GATE ${process.env.SEMANTIC_GATE || 0.62})`);
  process.exit(0);
})();
