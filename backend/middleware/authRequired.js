const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// No hardcoded fallback: a committed default secret would let anyone forge tokens.
// If JWT_SECRET is not configured we generate an ephemeral one (tokens then expire on restart).
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'edugraph_ai_super_secret_jwt_key_gate_2025_prod') {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[security] JWT_SECRET missing or set to the old public default - using an ephemeral secret. ' +
    'Set a strong JWT_SECRET in backend/.env (e.g. `openssl rand -hex 48`).');
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
  }
}

// Optional auth helper that sets req.user if token is provided, but doesn't block if absent
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      req.user = decoded;
    } catch (err) {
      // Ignore invalid optional token
    }
  }
  next();
}

function adminRequired(req, res, next) {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!req.user || !admins.includes(String(req.user.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'Forbidden: admin only' });
  }
  next();
}

module.exports = {
  adminRequired,
  authRequired,
  optionalAuth,
  JWT_SECRET
};
