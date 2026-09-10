const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function attachUser(req, res, next) {
  const token = req.cookies && req.cookies.bh_token;
  req.user = null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // invalid/expired token — treat as logged out
    }
  }
  res.locals.currentUser = req.user;
  next();
}

// For API routes: reject with 401/403 JSON.
function requireApiRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    next();
  };
}

// For page routes: redirect to login.
function requirePageRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).send('Forbidden');
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, agentId: user.agentId || null },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

module.exports = { attachUser, requireApiRole, requirePageRole, signToken, JWT_SECRET };
