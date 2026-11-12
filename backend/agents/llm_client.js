require('dotenv').config();
const crypto = require('crypto');
const tokenMonitor = require('../services/token_monitor');

/**
 * Central LLM service (Gemini by default; Groq / OpenAI / OpenRouter supported through the same interface).
 * Every agent and service goes through this one module:
 *   generate()      -> text            (returns null on any failure; the reason is in status())
 *   generateOrThrow -> text            (throws LLMError)
 *   generateJSON()  -> parsed + validated object (throws LLMError code MALFORMED / VALIDATION)
 *   embed()         -> embedding vectors (Gemini embedContent)
 *   validateConfig()-> startup check of key + model availability (never throws, never logs the key)
 *
 * Failure handling: errors are classified (INVALID_KEY, QUOTA, RATE_LIMIT, TIMEOUT, NETWORK, SERVER, BAD_REQUEST,
 * BLOCKED, MALFORMED, NO_KEY). 429/5xx/network are retried at most MAX_RETRIES times with exponential backoff
 * (honouring Retry-After / retryDelay when short). INVALID_KEY disables calls until restart; QUOTA / RATE_LIMIT open a
 * short cool-down so we fail fast instead of hammering the API. Nothing here ever invents an answer.
 *
 * Model routing: LLM_MODEL (complex) vs LLM_MODEL_FAST (cheap, simple features). API keys are sent in headers only.
 */
// 'flashcard' and 'active_recall' generation use the stronger model: they run once per learner/day or per challenge and
// the weaker model produced arithmetic errors that our validators had to reject (see docs/CHANGES.md).
const FAST_FEATURES = new Set(['quick_doubt', 'active_recall_eval', 'pyq_analysis']);
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);
const MAX_RETRIES = Math.min(Number(process.env.LLM_MAX_RETRIES ?? 2), 3);
const isReal = k => !!k && !/your_|key_here/i.test(k);
const sleep = ms => new Promise(r => setTimeout(r, ms));

class LLMError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = 'LLMError'; this.code = code; Object.assign(this, extra); }
}

const DEFAULTS = {
  gemini: { complex: 'gemini-2.5-flash', fast: 'gemini-2.5-flash-lite', embed: 'gemini-embedding-001' },
  groq: { complex: 'llama-3.3-70b-versatile', fast: 'llama-3.3-70b-versatile' },
  openai: { complex: 'gpt-4o-mini', fast: 'gpt-4o-mini' },
  openrouter: { complex: 'meta-llama/llama-3.3-70b-instruct:free', fast: 'meta-llama/llama-3.3-70b-instruct:free' }
};

class LLMClient {
  constructor() {
    this.inflight = new Map();
    this.cooldownUntil = 0;
    this.disabledReason = null;
    this.lastError = null;     // { code, message, at }
    this.validated = null;     // null = unknown, true/false after validateConfig()
    this.reloadConfig();
  }

  reloadConfig() {
    this.provider = (process.env.LLM_PROVIDER || '').toLowerCase();
    this.model = process.env.LLM_MODEL;
    this.fastModel = process.env.LLM_MODEL_FAST;
    this.embedModel = process.env.EMBEDDING_MODEL || (DEFAULTS.gemini.embed);
    this.keys = {
      gemini: process.env.GEMINI_API_KEY, groq: process.env.GROQ_API_KEY,
      openai: process.env.OPENAI_API_KEY, openrouter: process.env.OPENROUTER_API_KEY
    };
    const has = p => isReal(this.keys[p]);
    if (!this.provider || !has(this.provider)) {
      this.provider = ['gemini', 'groq', 'openai', 'openrouter'].find(has) || this.provider;
    }
  }

  hasValidKey() {
    this.reloadConfig();
    return ['gemini', 'groq', 'openai', 'openrouter'].includes(this.provider) && isReal(this.keys[this.provider]);
  }

  /** true when a call would actually be attempted (key present, not disabled, not cooling down) */
  isAvailable() { return this.hasValidKey() && !this.disabledReason && Date.now() >= this.cooldownUntil; }

  /** Safe-to-expose state (no secrets) for /api/health and UI notices */
  status() {
    this.reloadConfig();
    return {
      provider: this.provider || null, configured: this.hasValidKey(), validated: this.validated,
      disabledReason: this.disabledReason, coolingDownMs: Math.max(0, this.cooldownUntil - Date.now()),
      lastError: this.lastError, models: { complex: this.modelFor('concept_explain'), fast: this.modelFor('quick_doubt') }
    };
  }

  modelFor(feature) {
    const d = DEFAULTS[this.provider] || DEFAULTS.gemini;
    let m = (FAST_FEATURES.has(feature) ? (this.fastModel || d.fast) : (this.model || d.complex));
    if (this.provider !== 'openrouter' && m.includes('/') && !m.startsWith('gemini/')) m = d.complex;
    return String(m).replace(/^(gemini|groq)\//i, '');
  }

  _note(err) { this.lastError = { code: err.code, message: String(err.message).slice(0, 200), at: new Date().toISOString() }; }

  async _fetch(url, init) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try { return await fetch(url, { ...init, signal: ctl.signal }); }
    catch (e) {
      throw e.name === 'AbortError' ? new LLMError('TIMEOUT', `LLM request timed out after ${TIMEOUT_MS} ms`) : new LLMError('NETWORK', `Network error: ${e.message}`);
    } finally { clearTimeout(timer); }
  }

  /** map an HTTP failure to a typed error */
  _httpError(status, bodyText, res) {
    let msg = bodyText.slice(0, 300); let retryAfter = Number(res?.headers?.get?.('retry-after')) || 0;
    const m = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(bodyText); if (m) retryAfter = Math.max(retryAfter, Number(m[1]));
    if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(bodyText))
      return new LLMError('INVALID_KEY', 'The LLM API key was rejected (invalid, expired or lacks permission).', { status });
    if (status === 429) {
      const daily = /per day|daily|billing|exceeded your current quota/i.test(bodyText);
      return new LLMError(daily ? 'QUOTA' : 'RATE_LIMIT', daily ? 'LLM quota exhausted for this key.' : 'LLM rate limit hit.', { status, retryAfter });
    }
    if (status >= 500) return new LLMError('SERVER', `LLM provider error (HTTP ${status}).`, { status, retryAfter });
    return new LLMError('BAD_REQUEST', `LLM rejected the request (HTTP ${status}): ${msg}`, { status });
  }

  async _call({ systemPrompt, userPrompt, temperature, jsonMode, responseSchema, maxOutputTokens, model }) {
    const p = this.provider;
    if (p === 'gemini') {
      const gen = { temperature, maxOutputTokens };
      if (/2\.5-flash/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 }; // short answers: no hidden reasoning tokens
      if (jsonMode || responseSchema) gen.responseMimeType = 'application/json';
      if (responseSchema) gen.responseSchema = responseSchema;
      const res = await this._fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.keys.gemini },
        body: JSON.stringify({
          systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }], generationConfig: gen
        })
      });
      if (!res.ok) throw this._httpError(res.status, await res.text(), res);
      const d = await res.json();
      const cand = d.candidates?.[0];
      if (!cand) throw new LLMError('BLOCKED', `No candidate returned${d.promptFeedback?.blockReason ? ' (' + d.promptFeedback.blockReason + ')' : ''}.`);
      const text = (cand.content?.parts || []).map(x => x.text || '').join('');
      if (!text) throw new LLMError('MALFORMED', `Empty model output (finishReason ${cand.finishReason || 'unknown'}).`);
      const u = d.usageMetadata;
      return { text, finishReason: cand.finishReason, usage: u ? { input: u.promptTokenCount, output: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) } : null };
    }
    const urls = { groq: 'https://api.groq.com/openai/v1/chat/completions', openai: 'https://api.openai.com/v1/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions' };
    if (!urls[p]) throw new LLMError('NO_KEY', 'No LLM provider configured.');
    const body = { model, temperature, max_tokens: maxOutputTokens, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] };
    if (jsonMode && p !== 'openrouter') body.response_format = { type: 'json_object' };
    const res = await this._fetch(urls[p], { method: 'POST', headers: { Authorization: `Bearer ${this.keys[p]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw this._httpError(res.status, await res.text(), res);
    const d = await res.json();
    const text = d.choices?.[0]?.message?.content;
    if (!text) throw new LLMError('MALFORMED', 'Empty model output.');
    return { text, finishReason: d.choices[0].finish_reason, usage: d.usage ? { input: d.usage.prompt_tokens, output: d.usage.completion_tokens } : null };
  }

  /** @returns {Promise<string>} text; throws LLMError */
  async generateOrThrow({
    systemPrompt = '', userPrompt = '', temperature = 0.3, jsonMode = false, responseSchema = null,
    maxOutputTokens = 1024, agentLabel = 'Unknown', featureLabel = 'general', model: modelOverride = null
  } = {}) {
    this.reloadConfig();
    if (!this.hasValidKey()) throw new LLMError('NO_KEY', 'No LLM API key is configured.');
    if (this.disabledReason) throw new LLMError('INVALID_KEY', this.disabledReason);
    if (Date.now() < this.cooldownUntil) {
      throw new LLMError(this.lastError?.code === 'QUOTA' ? 'QUOTA' : 'RATE_LIMIT', 'LLM temporarily unavailable (cooling down after a rate/quota error).', { cooldown: true });
    }
    const model = modelOverride || this.modelFor(featureLabel);
    const key = crypto.createHash('sha1').update([this.provider, model, systemPrompt, userPrompt, jsonMode, maxOutputTokens, temperature].join('\u0001')).digest('hex');
    if (this.inflight.has(key)) return this.inflight.get(key);   // identical concurrent prompt -> one request

    const task = (async () => {
      const started = Date.now();
      let lastErr;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const r = await this._call({ systemPrompt, userPrompt, temperature, jsonMode, responseSchema, maxOutputTokens, model });
          tokenMonitor.recordCall({ agent: agentLabel, feature: featureLabel, inputText: `${systemPrompt}\n\n${userPrompt}`,
            outputText: r.text, model, latencyMs: Date.now() - started, usage: r.usage, via: 'direct' });
          this.validated = this.validated === false ? false : true;
          return r.text;
        } catch (err) {
          lastErr = err instanceof LLMError ? err : new LLMError('NETWORK', err.message);
          this._note(lastErr);
          if (lastErr.code === 'INVALID_KEY') { this.disabledReason = lastErr.message; this.validated = false; break; }
          const retryable = ['RATE_LIMIT', 'SERVER', 'NETWORK', 'TIMEOUT'].includes(lastErr.code);
          const wait = Math.min(lastErr.retryAfter ? lastErr.retryAfter * 1000 : 600 * 2 ** attempt, 8000);
          if (!retryable || attempt === MAX_RETRIES || (lastErr.retryAfter && lastErr.retryAfter > 20)) break;
          await sleep(wait);
        }
      }
      if (lastErr.code === 'QUOTA' || lastErr.code === 'RATE_LIMIT') {
        this.cooldownUntil = Date.now() + Math.min(Math.max((lastErr.retryAfter || 30) * 1000, 15000), 120000);
      }
      console.warn(`[LLM] ${lastErr.code}: ${lastErr.message}`);
      throw lastErr;
    })();
    this.inflight.set(key, task);
    try { return await task; } finally { this.inflight.delete(key); }
  }

  /** @returns {Promise<string|null>} text, or null on any failure (callers must fall back honestly and label it) */
  async generate(opts = {}) {
    try { return await this.generateOrThrow(opts); }
    catch (e) { if (!(e instanceof LLMError)) { this._note(new LLMError('NETWORK', e.message)); } return null; }
  }

  /**
   * Structured output. `validate(obj)` must throw (or return a string describing the problem) when the object is
   * unacceptable; one repair attempt is made by showing the model the problem. Throws LLMError(MALFORMED|VALIDATION).
   */
  async generateJSON({ validate = null, repair = true, ...opts } = {}) {
    const parse = txt => {
      const clean = txt.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      // models often emit LaTeX such as \\frac or \\alpha inside strings: a lone backslash is invalid JSON, so double it
      const fixSlashes = t => t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      for (const candidate of [clean, fixSlashes(clean)]) {
        try { return JSON.parse(candidate); } catch (e) { /* try next */ }
        const a = candidate.search(/[\[{]/), b = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
        if (a >= 0 && b > a) { try { return JSON.parse(candidate.slice(a, b + 1)); } catch (e2) { /* try next */ } }
      }
      throw new LLMError('MALFORMED', `Model returned invalid JSON (${clean.length} chars, starts: ${clean.slice(0, 60).replace(/\s+/g, ' ')}...).`);
    };
    const check = obj => {
      if (!validate) return null;
      try { const r = validate(obj); return typeof r === 'string' ? r : null; } catch (e) { return e.message; }
    };
    let text = await this.generateOrThrow({ ...opts, jsonMode: true });
    let problem = null, obj = null;
    try { obj = parse(text); problem = check(obj); } catch (e) { problem = e.message; }
    if (!problem) return obj;
    console.warn(`[LLM] structured output rejected (${opts.featureLabel || 'general'}): ${String(problem).slice(0, 200)}`);
    if (!repair) throw new LLMError('VALIDATION', problem);
    text = await this.generateOrThrow({
      ...opts, jsonMode: true,
      userPrompt: `${opts.userPrompt}\n\nYour previous output was rejected: ${problem}\nReturn corrected JSON only.`
    });
    obj = parse(text);
    problem = check(obj);
    if (problem) throw new LLMError('VALIDATION', problem);
    return obj;
  }

  /** Gemini embeddings (one request per text, light throttling). Returns number[][] */
  async embed(texts, { taskType = 'RETRIEVAL_DOCUMENT', dims = 768, agentLabel = 'Embedder', delayMs = 120 } = {}) {
    this.reloadConfig();
    if (this.provider !== 'gemini' || !this.hasValidKey()) throw new LLMError('NO_KEY', 'Embeddings need a Gemini API key.');
    if (this.disabledReason) throw new LLMError('INVALID_KEY', this.disabledReason);
    const out = [];
    for (const text of texts) {
      if (Date.now() < this.cooldownUntil) throw new LLMError('RATE_LIMIT', 'Embedding paused (cool-down).');
      let lastErr;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const started = Date.now();
          const res = await this._fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.embedModel}:embedContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.keys.gemini },
            body: JSON.stringify({ model: `models/${this.embedModel}`, content: { parts: [{ text: String(text).slice(0, 6000) }] }, taskType, outputDimensionality: dims })
          });
          if (!res.ok) throw this._httpError(res.status, await res.text(), res);
          const v = (await res.json()).embedding?.values;
          if (!Array.isArray(v)) throw new LLMError('MALFORMED', 'Embedding response had no vector.');
          tokenMonitor.recordCall({ agent: agentLabel, feature: 'embedding', inputText: text, outputText: '', model: this.embedModel, latencyMs: Date.now() - started });
          out.push(v); lastErr = null; break;
        } catch (err) {
          lastErr = err instanceof LLMError ? err : new LLMError('NETWORK', err.message); this._note(lastErr);
          if (lastErr.code === 'INVALID_KEY') this.disabledReason = lastErr.message;
          if (!['RATE_LIMIT', 'SERVER', 'NETWORK', 'TIMEOUT'].includes(lastErr.code) || attempt === MAX_RETRIES) break;
          await sleep(Math.min(lastErr.retryAfter ? lastErr.retryAfter * 1000 : 800 * 2 ** attempt, 8000));
        }
      }
      if (lastErr) { if (['QUOTA', 'RATE_LIMIT'].includes(lastErr.code)) this.cooldownUntil = Date.now() + 30000; throw lastErr; }
      if (delayMs) await sleep(delayMs);
    }
    return out;
  }

  /** Startup check: is the key accepted and is the routed model listed? Never throws; never prints the key. */
  async validateConfig() {
    this.reloadConfig();
    if (!this.hasValidKey()) { this.validated = null; return { ok: false, reason: 'no_key' }; }
    if (this.provider !== 'gemini') return { ok: true, note: 'startup validation implemented for Gemini only' };
    try {
      const res = await this._fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': this.keys.gemini } });
      if (!res.ok) throw this._httpError(res.status, await res.text(), res);
      const names = new Set(((await res.json()).models || []).map(m => m.name.replace(/^models\//, '')));
      const wanted = [this.modelFor('concept_explain'), this.modelFor('quick_doubt')];
      const missing = wanted.filter(m => !names.has(m));
      this.validated = missing.length === 0;
      if (missing.length) this.lastError = { code: 'MODEL_UNAVAILABLE', message: `Configured model(s) not offered by the API: ${missing.join(', ')}`, at: new Date().toISOString() };
      return { ok: this.validated, missingModels: missing };
    } catch (e) {
      if (e.code === 'INVALID_KEY') { this.disabledReason = e.message; this.validated = false; }
      this._note(e instanceof LLMError ? e : new LLMError('NETWORK', e.message));
      return { ok: false, reason: e.code || 'error' };
    }
  }

  /** test helper: clear cool-downs / disabled flag */
  _resetState() { this.cooldownUntil = 0; this.disabledReason = null; this.lastError = null; this.validated = null; }
}

module.exports = new LLMClient();
module.exports.LLMError = LLMError;
