require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./routes/router');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend files
const frontendDir = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendDir));

// Root API Health Endpoint per Section 5
app.get('/api/health', (req, res) => {
  res.json({ message: 'EduGraph AI Backend Running', status: 'healthy', version: '1.0.0' });
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

// Mount Central API Router
app.use('/api', apiRouter);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`EduGraph AI Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
