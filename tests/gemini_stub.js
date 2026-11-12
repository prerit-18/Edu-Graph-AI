// Test double for Gemini's REST API (global fetch). Never touches the network.
const llm = require('../backend/agents/llm_client');

const state = { calls: 0, urls: [], mode: 'ok', failures: 0, counter: 0, lastBody: null };

function reply(status, body, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: k => headers[k.toLowerCase()] }, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
}
const gemini = text => reply(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });

/** builds valid flashcards for whatever topics the prompt asks for */
function cardsFor(prompt, variant) {
  let req; try { req = JSON.parse(prompt); } catch (e) { return { cards: [] }; }
  return { cards: req.map(r => ({
    topic_id: r.topic_id, type: 'concept', difficulty: 'medium',
    question: `Round ${variant} vx${variant}a vx${variant}b vx${variant}c vx${variant}d: state the key idea of ${r.topic} (${r.syllabus.slice(0, 50)}) ?`,
    answer: `${r.topic} covers ${r.syllabus.slice(0, 80)}`,
    explanation: `This follows from the syllabus entry for ${r.topic}: ${r.syllabus.slice(0, 80)}`
  })) };
}

function install() {
  global.fetch = async (url, init) => {
    state.calls++; state.urls.push(String(url));
    const body = init && init.body ? JSON.parse(init.body) : {};
    state.lastBody = body;
    if (String(url).includes('/models?') && state.mode === 'invalid_key') return reply(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}');
    if (String(url).includes('/models?')) return reply(200, { models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/gemini-2.5-flash-lite' }] });
    if (String(url).includes(':embedContent') && state.mode !== 'network' && state.mode !== 'invalid_key' && state.mode !== 'quota') {
      state.embedCalls = (state.embedCalls || 0) + 1;
      const v = new Array(64).fill(0);
      for (const w of String(body.content.parts[0].text).toLowerCase().match(/[a-z0-9]+/g) || []) { let h = 7; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 64] += 1; }
      return reply(200, { embedding: { values: v } });
    }
    switch (state.mode) {
      case 'invalid_key': return reply(400, '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}');
      case 'forbidden': return reply(403, '{"error":{"code":403,"status":"PERMISSION_DENIED"}}');
      case 'quota': return reply(429, '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}');
      case 'rate': if (state.failures-- > 0) return reply(429, '{"error":{"code":429,"message":"Too many requests","status":"RESOURCE_EXHAUSTED"}}', { 'retry-after': '0' }); break;
      case 'server': if (state.failures-- > 0) return reply(503, '{"error":{"code":503,"status":"UNAVAILABLE"}}'); break;
      case 'network': throw new TypeError('fetch failed');
      case 'malformed': return gemini('this is {not json');
      case 'malformed_once': if (state.failures-- > 0) return gemini('{"cards": [ {oops'); break;
      case 'blocked': return reply(200, { promptFeedback: { blockReason: 'SAFETY' } });
      case 'bad_cards': { const p = body.contents[0].parts[0].text; const c = cardsFor(p, ++state.counter); c.cards[0].question = 'Which GATE 2023 question asks about ' + c.cards[0].topic_id + ' details?'; return gemini(JSON.stringify(c)); }
      case 'bad_calc': { const p = body.contents[0].parts[0].text; const c = cardsFor(p, ++state.counter); c.cards[0].calc = { expression: '2*3', result: 7 }; return gemini(JSON.stringify(c)); }
    }
    const prompt = body.contents && body.contents[0].parts[0].text;
    const sys = (body.systemInstruction && body.systemInstruction.parts[0].text) || '';
    if (sys.includes('active-recall question')) {
      const brief = JSON.parse(prompt);
      if (state.mode === 'recall_impersonate') return gemini(JSON.stringify({ question: 'In GATE 2019 which condition is required for ' + brief.topic + ' to hold?', referenceAnswer: 'x '.repeat(10), keyConcepts: ['alpha', 'beta'] }));
      if (state.mode === 'recall_dup') return gemini(JSON.stringify({ question: 'Fixed duplicate question about ' + brief.topic + ' and its syllabus ' + brief.syllabus.slice(0, 40) + ' please?', referenceAnswer: 'reference answer text ' + brief.syllabus.slice(0, 60), keyConcepts: brief.syllabus.split(/\W+/).filter(w => w.length > 5).slice(0, 3) }));
      const n = ++state.counter;
      const concepts = [...new Set(brief.syllabus.split(/\W+/).filter(w => w.length > 5))].slice(0, 3);
      const out = { question: `Round ${n} rq${n}a rq${n}b rq${n}c: explain ${brief.topic} considering ${brief.syllabus.slice(0, 60)}?`, referenceAnswer: `${brief.topic}: ${brief.syllabus.slice(0, 120)}`, keyConcepts: concepts, rubric: 'all concepts', difficulty: brief.difficulty };
      if (brief.question_type === 'numeric') { out.question = `Round ${n} rq${n}a rq${n}b: compute the value of ${brief.topic} quantity using 6 times 7?`; out.referenceAnswer = 'The answer is 42'; out.numeric = { expression: '6*7', result: 42 }; }
      return gemini(JSON.stringify(out));
    }
    if (sys.includes('OFFICIAL answer')) {
      const b = JSON.parse(prompt); state.explainCalls = (state.explainCalls || 0) + 1;
      let fa = String(b.official_answer).includes(':') ? String(b.official_answer).split(':')[0] : String(b.official_answer);
      if (state.mode === 'explain_wrong') fa = b.type === 'NAT' ? '987654' : 'Z';
      return gemini(JSON.stringify({ explanation: `Because the official answer ${b.official_answer} follows from the stated definition and the steps shown here.`, final_answer: fa }));
    }
    if (sys.includes('problem solver')) return gemini('Step 1: reason it out.\nFinal answer: B');
    if (sys.includes('You grade')) {
      const inp = JSON.parse(prompt); const ans = inp.student_answer.toLowerCase();
      const matched = inp.key_concepts.filter(c => ans.includes('equiv') || ans.includes(c.toLowerCase()));
      return gemini(JSON.stringify({ score: Math.round(100 * matched.length / inp.key_concepts.length), matched_concepts: matched, missing_concepts: inp.key_concepts.filter(c => !matched.includes(c)), misconceptions: [], feedback: 'stub evaluation' }));
    }
    if (sys.includes('flashcards')) { await new Promise(r => setTimeout(r, 20)); return gemini(JSON.stringify(cardsFor(prompt, ++state.counter))); }
    return gemini('stub text answer');
  };
}

function reset(mode = 'ok', failures = 0) {
  state.calls = 0; state.urls = []; state.mode = mode; state.failures = failures;
  llm._resetState();
  process.env.GEMINI_API_KEY = 'AIzaFAKE_test_key_not_real_0123456789'; process.env.LLM_PROVIDER = 'gemini';
}
module.exports = { install, reset, state };
