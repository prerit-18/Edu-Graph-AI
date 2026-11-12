const { spawn } = require('child_process');
const path = require('path');
const tokenMonitor = require('../services/token_monitor');
const llmClient = require('./llm_client');

const RUNNER = path.resolve(__dirname, '../crewai/crew_runner.py');
const TIMEOUT_MS = Number(process.env.CREWAI_TIMEOUT_MS || 60000);
const PYTHON = [process.env.PYTHON_BIN, 'python3', 'python'].filter(Boolean);

/** CrewAI is used when enabled (default) AND an LLM key exists. Set USE_CREWAI=false to bypass. */
function crewEnabled() {
  return String(process.env.USE_CREWAI || 'true').toLowerCase() !== 'false' && llmClient.hasValidKey();
}

function runPython(bin, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [RUNNER], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const timer = setTimeout(() => { if (!done) { done = true; child.kill('SIGKILL'); reject(new Error(`CrewAI timeout after ${TIMEOUT_MS}ms`)); } }, TIMEOUT_MS);
    child.stdout.on('data', d => { out += d; if (out.length > 5e6) child.kill('SIGKILL'); });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    child.on('close', () => {
      if (done) return; done = true; clearTimeout(timer);
      const line = out.split('\n').reverse().find(l => l.startsWith('@@EDUGRAPH_RESULT@@'));
      if (!line) return reject(new Error(`CrewAI produced no result line (${err.slice(-200)})`));
      try { resolve(JSON.parse(line.slice('@@EDUGRAPH_RESULT@@'.length))); } catch (e) { reject(new Error(`CrewAI JSON parse failed: ${e.message}`)); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/**
 * Run ONE real CrewAI crew (1 agent / 1 task / sequential) for a role.
 * @returns {Promise<{text:string, usage:object, model:string}|null>}  null => caller should use llmClient fallback
 */
async function runCrew({ role, description, expectedOutput, context = '', fast = false, agentLabel = role, featureLabel = 'general' }) {
  if (!crewEnabled()) return null;
  const started = Date.now();
  for (const bin of PYTHON) {
    try {
      const r = await runPython(bin, { role, description, expected_output: expectedOutput, context, fast });
      if (!r.ok) { console.warn(`[CrewAI] ${role}: ${r.error}`); return null; }
      const u = r.usage || {};
      tokenMonitor.recordCall({
        agent: agentLabel, feature: featureLabel, inputText: description + context, outputText: r.text,
        model: r.model || 'crewai', latencyMs: Date.now() - started, via: 'crewai',
        usage: Number.isFinite(u.prompt_tokens) && u.total_tokens > 0 ? { input: u.prompt_tokens, output: u.completion_tokens } : null
      });
      return { text: r.text, usage: u, model: r.model };
    } catch (e) {
      if (e.code === 'ENOENT') continue; // try next python binary
      console.warn(`[CrewAI] ${role} failed: ${e.message}`);
      return null;
    }
  }
  return null;
}

/** CrewAI first, then the direct provider call, else null (agents then use deterministic fallbacks). */
async function generateWithCrew({ role, description, expectedOutput, context, systemPrompt, userPrompt, maxOutputTokens, agentLabel, featureLabel }) {
  const crew = await runCrew({ role, description, expectedOutput, context, fast: false, agentLabel, featureLabel });
  if (crew && crew.text && crew.text.trim()) return { text: crew.text.trim(), via: 'crewai' };
  const text = await llmClient.generate({ systemPrompt, userPrompt, maxOutputTokens, agentLabel, featureLabel });
  return text ? { text, via: 'direct' } : null;
}

module.exports = { runCrew, generateWithCrew, crewEnabled };
