const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');
const { authRequired, JWT_SECRET } = require('../middleware/authRequired');
const { rateLimit } = require('../middleware/rateLimit');
const learnerStateTool = require('../tools/learner_state_tool');

/**
 * POST /api/auth/signup
 */
const authLimiter = rateLimit({ windowMs: 10 * 60_000, max: Number(process.env.RATE_LIMIT_AUTH || 60), name: 'auth' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/signup', authLimiter, async (req, res) => {
  try {
    let { name, email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    email = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 8-128 characters' });
    }
    if (name !== undefined && (typeof name !== 'string' || name.length > 80)) {
      return res.status(400).json({ error: 'Name must be at most 80 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const id = crypto.randomUUID();
    const password_hash = await bcrypt.hash(password, 10);
    const userName = name || email.split('@')[0];

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(id, userName, email, password_hash);

    const token = jwt.sign({ id, email, name: userName }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id, name: userName, email }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    let { email, password } = req.body || {};
    if (!email || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    email = String(email).trim().toLowerCase();

    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * POST /api/auth/timezone { timezone }  - IANA zone used to decide the learner's daily session date
 */
router.post('/timezone', authRequired, (req, res) => {
  const tz = req.body && req.body.timezone;
  if (!require('../services/daily_flashcards').isValidTimezone(tz)) return res.status(400).json({ error: 'Invalid IANA timezone (e.g. Asia/Kolkata)' });
  db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(tz, req.user.id);
  res.json({ timezone: tz });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, name, email, timezone, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const streak = learnerStateTool.getLearnerStreak(user.id);

  res.json({
    user,
    streak
  });
});

module.exports = router;
