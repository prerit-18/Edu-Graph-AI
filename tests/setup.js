// Preloaded by `npm test` (node --require ../tests/setup.js).
// Every test file runs against its OWN throwaway SQLite database, never the real data/edugraph.db,
// with LLM keys blanked so tests are deterministic, free and offline.
const os = require('os');
const path = require('path');
const fs = require('fs');
if (!process.env.EDUGRAPH_TEST_KEEP_ENV) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edugraph-test-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) process.env[k] = '';
  process.env.LLM_PROVIDER = 'none';
  process.env.JWT_SECRET = 'unit-test-secret';
  // deterministic corpus: tests never depend on whichever official papers happen to be ingested locally
  process.env.GATE_PROCESSED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'edugraph-no-papers-'));
  process.env.LLM_MAX_RETRIES = '1';
  process.env.USE_CREWAI = 'false';   // tests never spawn Python/CrewAI or reach the network
  process.env.RATE_LIMIT_AUTH = '10000';
  process.env.RATE_LIMIT_AI = '10000';
  process.env.RATE_LIMIT_API = '100000';
}
require('../backend/database/seed')({ quiet: true });
require('../backend/services/question_bank').importAll();
