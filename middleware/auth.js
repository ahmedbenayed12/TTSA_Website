const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ttsa_jwt_secret_key_2026';

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
    next();
  });
}

function requireReviewer(req, res, next) {
  verifyToken(req, res, () => {
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
