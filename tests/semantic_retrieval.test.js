const assert = require('assert');
const stub = require('./gemini_stub');
const db = require('../backend/database/db');
const store = require('../backend/rag/vector_store');
const semantic = require('../backend/rag/semantic');
const { retrieve, retrieveAsync } = require('../backend/rag/retriever');
const { startServer, request, signup } = require('./http_helper');

(async () => {
  console.log('--- Embeddings, semantic retrieval, exact filters ---');
  stub.install(); stub.reset('ok');
  store.ensureFresh();

  // before embedding: lexical only
  const none = await retrieveAsync('how do routers learn the best path', { strategy: 'concept' });
  assert.strictEqual(none.semantic, false, 'no embeddings yet -> lexical result');
  assert.strictEqual(stub.state.embedCalls || 0, 0, 'no embedding calls without stored chunk vectors');

  // embed the index (resumable, hash-based)
  const r = await semantic.embedIndex(store.chunks, { delayMs: 0 });
  assert.strictEqual(r.remaining, 0); assert.strictEqual(r.error, null);
  const cov = semantic.coverage(store.chunks);
  assert.strictEqual(cov.ratio, 1);
  const again = await semantic.embedIndex(store.chunks, { delayMs: 0 });
  assert.strictEqual(again.embedded, 0, 'unchanged chunks are not re-embedded');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM chunk_embeddings').get().c, store.chunks.length);
  console.log(`✓ ${store.chunks.length} chunks embedded once, resumable, unchanged chunks skipped`);

  // semantic retrieval path
  const calls = stub.state.embedCalls;
  const s1 = await retrieveAsync('banker algorithm safe state deadlock avoidance', { strategy: 'pyq', topK: 3 });
  assert.strictEqual(s1.semantic, true); assert(s1.results.length > 0); assert(s1.results.every(x => x.metadata.source_type === 'pyq'));
  assert(s1.results[0].semantic !== null, 'results carry a semantic score');
  assert(s1.results.every(x => x.metadata.question_id && x.metadata.year !== undefined), 'source info preserved');
  assert.strictEqual(stub.state.embedCalls, calls + 1, 'one query embedding');
  await retrieveAsync('banker algorithm safe state deadlock avoidance', { strategy: 'pyq', topK: 3 });
  assert.strictEqual(stub.state.embedCalls, calls + 1, 'query vectors are cached');
  console.log('✓ semantic retrieval ranks questions by embedding+lexical blend; query vectors cached');

  // outage -> graceful lexical fallback, same API
  stub.reset('network'); semantic._clear();
  const fb = await retrieveAsync('banker algorithm safe state deadlock avoidance', { strategy: 'pyq', topK: 3 });
  assert.strictEqual(fb.semantic, false); assert(fb.results.length > 0);
  assert.deepStrictEqual(fb.results.map(x => x.id), retrieve('banker algorithm safe state deadlock avoidance', { strategy: 'pyq', topK: 3 }).results.map(x => x.id));
  console.log('✓ embedding API down: falls back to the lexical result');
  stub.reset('ok');

  // exact filters through the DB (no embeddings involved) + semantic endpoint
  const { server, baseUrl } = await startServer();
  try {
    const u = await signup(baseUrl, 'sem');
    const R = (m, p, d) => request(baseUrl, m, p, d, u.token);
    const f = await R('GET', '/api/pyq?subject=Operating%20Systems&type=MCQ&limit=50');
    assert(f.data.questions.length > 0 && f.data.questions.every(q => q.subject === 'Operating Systems' && q.type === 'MCQ'));
    const y = await R('GET', '/api/pyq?year=2024'); assert(y.data.questions.every(q => q.year === 2024));
    const s = await R('GET', '/api/pyq/search?q=' + encodeURIComponent('process synchronisation with semaphores'));
    assert.strictEqual(s.status, 200); assert.strictEqual(s.data.semantic, true);
    s.data.questions.forEach(q => { assert.strictEqual(q.answer, undefined); assert(q.id && q.origin); });
    assert.strictEqual((await R('GET', '/api/pyq/search?q=ab')).status, 400);
    console.log('✓ exact filters (subject/type/year) work; /api/pyq/search returns keyless questions with source info');

    // quick actions
    assert.deepStrictEqual((await R('GET', '/api/quick-actions')).data.actions.sort(), ['ask_doubt', 'exam_traps', 'explain_concept', 'generate_flashcards', 'give_example', 'quick_revision', 'solve_pyq', 'test_me']);
    const sp = await R('POST', '/api/quick-actions/solve_pyq', { topic: 'Deadlocks', topicId: 'os_deadlock' });
    assert.strictEqual(sp.data.found, true); assert(require('../backend/services/question_bank').getById(sp.data.question.id), 'a real stored question, never model-invented');
    assert.strictEqual(sp.data.question.answer, undefined);
    assert.strictEqual((await R('POST', '/api/quick-actions/test_me', { topic: 'Deadlocks', topicId: 'os_deadlock' })).data.type, 'navigate');
    assert.strictEqual((await R('POST', '/api/quick-actions/ask_doubt', { topic: 'Deadlocks' })).status, 400);
    const qr = await R('POST', '/api/quick-actions/quick_revision', { topic: 'Deadlocks', topicId: 'os_deadlock' });
    assert.strictEqual(qr.status, 200); assert.strictEqual(qr.data.grounded, true);
    console.log('✓ quick actions: solve_pyq returns a stored PYQ, navigation actions, input validation, grounded LLM actions');
  } finally { server.close(); }
  console.log('🎉 Semantic retrieval tests passed');
})().catch(e => { console.error('Semantic retrieval test failed:', e); process.exit(1); });
