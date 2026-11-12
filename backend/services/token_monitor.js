const db = require('../database/db');
const crypto = require('crypto');

/**
 * Token Usage Monitor & Cost Accounting Service
 * 
 * Tracks input tokens, output tokens, latency, and estimated USD expenditure
 * per agent interaction and feature category.
 * 
 * Rates (Gemini 2.5 Flash):
 * - Input:  $0.075 per 1M tokens ($0.000000075 / token)
 * - Output: $0.30  per 1M tokens ($0.00000030  / token)
 */

const INPUT_COST_PER_MILLION = 0.075;
const OUTPUT_COST_PER_MILLION = 0.30;
const MAX_RING_BUFFER = 500;

// In-memory ring buffer
const ringBuffer = [];

// Initialize SQLite table on first use
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_logs (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      agent TEXT,
      feature TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms INTEGER,
      estimated_cost_usd REAL
    );
    CREATE INDEX IF NOT EXISTS idx_token_logs_agent ON token_logs(agent);
    CREATE INDEX IF NOT EXISTS idx_token_logs_feature ON token_logs(feature);
  `);
  for (const [col, ddl] of [['usage_source', "TEXT DEFAULT 'estimated'"], ['via', "TEXT DEFAULT 'direct'"]]) {
    const has = db.prepare('PRAGMA table_info(token_logs)').all().some(c => c.name === col);
    if (!has) db.exec(`ALTER TABLE token_logs ADD COLUMN ${col} ${ddl}`);
  }
} catch (err) {
  console.warn('[TokenMonitor] Failed to ensure token_logs table:', err.message);
}

/**
 * Approximate token count using standard ~4 chars/token heuristic
 * @param {string} text 
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Record an LLM call into in-memory ring-buffer and SQLite
 */
function recordCall({ agent = 'Unknown', feature = 'general', inputText = '', outputText = '', model = 'unknown', latencyMs = 0, usage = null, via = 'direct' }) {
  // Prefer token counts reported by the provider; fall back to a chars/4 estimate and say so.
  const reported = usage && Number.isFinite(usage.input) && Number.isFinite(usage.output);
  const inputTokens = reported ? usage.input : estimateTokens(inputText);
  const outputTokens = reported ? usage.output : estimateTokens(outputText);
  const estimatedCostUsd = Number(
    ((inputTokens * INPUT_COST_PER_MILLION + outputTokens * OUTPUT_COST_PER_MILLION) / 1000000).toFixed(8)
  );

  const record = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    agent,
    feature,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    latency_ms: Math.max(0, Math.round(latencyMs)),
    estimated_cost_usd: estimatedCostUsd,
    usage_source: reported ? 'provider' : 'estimated',
    via
  };

  // 1. Maintain in-memory ring buffer (max 500)
  if (ringBuffer.length >= MAX_RING_BUFFER) {
    ringBuffer.shift();
  }
  ringBuffer.push(record);

  // 2. Persist to SQLite table
  try {
    const insertStmt = db.prepare(`
      INSERT INTO token_logs (id, agent, feature, model, input_tokens, output_tokens, latency_ms, estimated_cost_usd, usage_source, via)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      record.id,
      record.agent,
      record.feature,
      record.model,
      record.input_tokens,
      record.output_tokens,
      record.latency_ms,
      record.estimated_cost_usd,
      record.usage_source,
      record.via
    );
  } catch (err) {
    console.warn('[TokenMonitor] Error saving to SQLite token_logs:', err.message);
  }

  return record;
}

/**
 * Generate aggregated token & cost audit report
 */
function getReport() {
  let rows = [];
  try {
    rows = db.prepare('SELECT * FROM token_logs ORDER BY created_at DESC').all();
  } catch (err) {
    rows = [...ringBuffer].reverse();
  }

  const summary = {
    totalCalls: rows.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    avgLatencyMs: 0
  };

  const byAgent = {};
  const byFeature = {};
  const byModel = {};

  let totalLatency = 0;

  for (const row of rows) {
    const inTok = Number(row.input_tokens) || 0;
    const outTok = Number(row.output_tokens) || 0;
    const cost = Number(row.estimated_cost_usd) || 0;
    const lat = Number(row.latency_ms) || 0;

    summary.totalInputTokens += inTok;
    summary.totalOutputTokens += outTok;
    summary.totalCostUsd += cost;
    totalLatency += lat;

    const ag = row.agent || 'Unknown';
    if (!byAgent[ag]) {
      byAgent[ag] = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, totalLatency: 0 };
    }
    byAgent[ag].calls++;
    byAgent[ag].inputTokens += inTok;
    byAgent[ag].outputTokens += outTok;
    byAgent[ag].totalTokens += (inTok + outTok);
    byAgent[ag].costUsd += cost;
    byAgent[ag].totalLatency += lat;

    const feat = row.feature || 'general';
    if (!byFeature[feat]) {
      byFeature[feat] = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, totalLatency: 0 };
    }
    byFeature[feat].calls++;
    byFeature[feat].inputTokens += inTok;
    byFeature[feat].outputTokens += outTok;
    byFeature[feat].totalTokens += (inTok + outTok);
    byFeature[feat].costUsd += cost;
    byFeature[feat].totalLatency += lat;

    const mdl = row.model || 'unknown';
    if (!byModel[mdl]) {
      byModel[mdl] = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
    }
    byModel[mdl].calls++;
    byModel[mdl].inputTokens += inTok;
    byModel[mdl].outputTokens += outTok;
    byModel[mdl].totalTokens += (inTok + outTok);
    byModel[mdl].costUsd += cost;
  }

  summary.totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
  summary.totalCostUsd = Number(summary.totalCostUsd.toFixed(6));
  summary.avgLatencyMs = summary.totalCalls > 0 ? Math.round(totalLatency / summary.totalCalls) : 0;

  for (const ag of Object.keys(byAgent)) {
    byAgent[ag].avgLatencyMs = Math.round(byAgent[ag].totalLatency / byAgent[ag].calls);
    byAgent[ag].costUsd = Number(byAgent[ag].costUsd.toFixed(6));
    delete byAgent[ag].totalLatency;
  }

  for (const feat of Object.keys(byFeature)) {
    byFeature[feat].avgLatencyMs = Math.round(byFeature[feat].totalLatency / byFeature[feat].calls);
    byFeature[feat].costUsd = Number(byFeature[feat].costUsd.toFixed(6));
    delete byFeature[feat].totalLatency;
  }

  return {
    pricingRates: {
      geminiFlash2_5: {
        inputPerMillion: INPUT_COST_PER_MILLION,
        outputPerMillion: OUTPUT_COST_PER_MILLION
      }
    },
    summary,
    byAgent,
    byFeature,
    byModel,
    recentCalls: rows.slice(0, 50)
  };
}

module.exports = {
  recordCall,
  getReport,
  estimateTokens
};
