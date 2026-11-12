require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./routes/router');
const { rateLimit } = require('./middleware/rateLimit');

const app = express();

// CORS: the frontend is served from this same origin, so cross-origin access is opt-in.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : { origin: false }));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  next();
});
app.use(express.json({ limit: '100kb' }));

// Keep the syllabus + question bank in sync with the data files (idempotent, non-destructive)
try {
  require('./database/seed')({ quiet: true });
  require('./services/question_bank').importAll();
} catch (err) {
  console.error('Startup data sync failed:', err.message);
}

// Serve static frontend files
const frontendDir = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendDir));

// Root API Health Endpoint per Section 5
app.get('/api/health', (req, res) => {
  const llm = require('./agents/llm_client').status();   // no secrets: provider, models, last error code
  res.json({ message: 'EduGraph AI Backend Running', status: 'healthy', version: '1.0.0', llm });
});

// Root route redirects or returns health message
app.get('/', (req, res) => {
  // If request accepts html, send index.html, otherwise json
  if (req.accepts('html')) {
    res.sendFile(path.join(frontendDir, 'index.html'));
  } else {
    res.json({ message: 'EduGraph AI Backend Running' });
  }
});

// Mount Central API Router (generous global limit; stricter limits live on auth + AI routes)
app.use('/api', rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_API || 300), name: 'global' }), apiRouter);

// JSON error handler (bad JSON bodies, oversized payloads, thrown route errors)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('Unhandled error:', err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`EduGraph AI Backend server running on http://localhost:${PORT}`);
    // Validate the Gemini configuration once at start-up (never blocks, never logs the key)
    const llm = require('./agents/llm_client');
    if (!llm.hasValidKey()) console.warn('[llm] No LLM API key configured: AI features will use labelled fallbacks.');
    else llm.validateConfig().then(r => console.log('[llm] config check:', JSON.stringify(r))).catch(() => {});
  });
}

module.exports = app;
