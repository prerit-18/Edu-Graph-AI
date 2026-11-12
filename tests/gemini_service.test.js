const assert = require('assert');
const stub = require('./gemini_stub');
const llm = require('../backend/agents/llm_client');
const { LLMError } = llm;

(async () => {
  console.log('--- Central Gemini service: failure handling ---');
  stub.install();

  // no key
  process.env.GEMINI_API_KEY = ''; process.env.LLM_PROVIDER = 'none'; llm._resetState();
  await assert.rejects(llm.generateOrThrow({ userPrompt: 'x' }), e => e.code === 'NO_KEY');
  assert.strictEqual(await llm.generate({ userPrompt: 'x' }), null);
  assert.strictEqual(llm.isAvailable(), false);
  console.log('✓ no key -> NO_KEY, generate() returns null (never a fabricated answer)');

  // invalid key: typed error, one call, then disabled until restart (no hammering)
  stub.reset('invalid_key');
  await assert.rejects(llm.generateOrThrow({ userPrompt: 'hello' }), e => e.code === 'INVALID_KEY');
  assert.strictEqual(stub.state.calls, 1, 'invalid key is not retried');
  await assert.rejects(llm.generateOrThrow({ userPrompt: 'hello 2' }), e => e.code === 'INVALID_KEY');
  assert.strictEqual(stub.state.calls, 1, 'calls are blocked after the key was rejected');
  assert.strictEqual(llm.status().validated, false);
  console.log('✓ invalid key: typed error, not retried, further calls blocked');

  // quota: typed, not retried, cool-down fails fast without network
  stub.reset('quota');
  await assert.rejects(llm.generateOrThrow({ userPrompt: 'q1' }), e => e.code === 'QUOTA');
  assert.strictEqual(stub.state.calls, 1);
  await assert.rejects(llm.generateOrThrow({ userPrompt: 'q2' }), e => e.code === 'QUOTA' && e.cooldown);
  assert.strictEqual(stub.state.calls, 1, 'cool-down avoids hitting the API again');
  assert.strictEqual(llm.isAvailable(), false);
  console.log('✓ quota exhaustion: typed, not retried, cool-down enforced');

  // rate limit: retried (bounded) then succeeds
  stub.reset('rate', 1);
  assert.strictEqual(await llm.generateOrThrow({ userPrompt: 'r1', featureLabel: 'general' }), 'stub text answer');
  assert.strictEqual(stub.state.calls, 2, 'one retry after a 429');
  console.log('✓ rate limit: bounded retry then success');

  // retries are bounded
  stub.reset('server', 99);
  await assert.rejects(llm.generateOrThrow({ userPrompt: 's1' }), e => e.code === 'SERVER');
  assert.strictEqual(stub.state.calls, 2, 'LLM_MAX_RETRIES=1 -> exactly 2 attempts');
  console.log('✓ 5xx: retries are bounded (no infinite loops)');

  // network failure
  stub.reset('network');
  await assert.rejects(llm.generateOrThrow({ userPrompt: 'n1' }), e => e.code === 'NETWORK');
  console.log('✓ network failure -> NETWORK');

  // blocked / empty output
  stub.reset('blocked');
  await assert.rejects(llm.generateOrThrow({ userPrompt: 'b1' }), e => e.code === 'BLOCKED');

  // malformed JSON: one repair attempt, then typed failure
  stub.reset('malformed');
  await assert.rejects(llm.generateJSON({ userPrompt: 'j1', systemPrompt: 's' }), e => e.code === 'MALFORMED');
  assert.strictEqual(stub.state.calls, 2, 'one repair attempt only');
  stub.reset('malformed_once', 1);
  stub.state.mode = 'malformed_once';
  const fixed = await llm.generateJSON({ userPrompt: 'j2', systemPrompt: 'flashcards', validate: o => (Array.isArray(o.cards) ? null : 'no cards') });
  assert(Array.isArray(fixed.cards), 'a single malformed answer is repaired by one retry with the problem shown to the model');
  assert.strictEqual(stub.state.calls, 2);
  console.log('✓ malformed model output: single repair attempt, typed failure, nothing invented');

  // validation hook
  stub.reset('ok');
  await assert.rejects(llm.generateJSON({ userPrompt: 'j3', systemPrompt: 'flashcards', validate: () => 'always wrong' }), e => e.code === 'MALFORMED' || e.code === 'VALIDATION');

  // startup validation never throws and never exposes the key
  stub.reset('ok');
  const v = await llm.validateConfig();
  assert.strictEqual(v.ok, true);
  assert(!JSON.stringify(llm.status()).includes('AIzaFAKE'), 'status() must not leak the key');
  stub.reset('invalid_key');
  const v2 = await llm.validateConfig();
  assert.strictEqual(v2.ok, false);
  assert.strictEqual(llm.status().validated, false);
  console.log('✓ startup validation: detects invalid key, never leaks it');

  // model routing
  stub.reset('ok');
  assert.notStrictEqual(llm.modelFor('quick_doubt'), llm.modelFor('concept_explain'), 'fast vs complex routing');
  llm._resetState();
  console.log('🎉 Gemini service tests passed');
})().catch(e => { console.error('Gemini service test failed:', e); process.exit(1); });
