const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start safely.');
}

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireMember(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'member') {
      return res.status(403).json({ error: 'Member access required' });
    }
    const db = require('../db/database');
    const user = db.prepare('SELECT is_blocked FROM users WHERE id = ?').get(req.user.id);
    if (user && user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been blocked by the administrator.' });
    }
    next();
  });
}

function requireReviewer(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role === 'reviewer_temp') {
      return res.status(403).json({ error: 'You must change your password before accessing reviewer features.' });
    }
    if (req.user.role !== 'reviewer') {
      return res.status(403).json({ error: 'Reviewer access required' });
    }
    next();
  });
}

function requireAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

function requireAnyAuth(req, res, next) {
  verifyToken(req, res, next);
}

module.exports = { verifyToken, requireMember, requireReviewer, requireAdmin, requireAnyAuth };
