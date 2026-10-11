// Authentication middleware using JWT
// JWT flow: login -> get token -> send token with every request -> server verifies
// Reference: https://jwt.io/introduction

const jwt = require('jsonwebtoken');
const { hasPermission } = require('../config/roles');

// in production this should be in .env file, using hardcoded for demo
const JWT_SECRET = process.env.JWT_SECRET || 'pure-insights-dev-secret-key-2026';
const JWT_EXPIRY = '24h';

// hardcoded users for demo (in prod would be from database)
// TODO: connect to actual user database
const USERS = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin', email: 'admin@purestorage.com' },
  { id: 2, username: 'analyst', password: 'analyst123', role: 'analyst', email: 'analyst@purestorage.com' },
  { id: 3, username: 'viewer', password: 'viewer123', role: 'viewer', email: 'viewer@purestorage.com' }
];

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function authenticateUser(username, password) {
  return USERS.find(u => u.username === username && u.password === password);
}

// this middleware runs before every protected route
// it checks if the request has a valid JWT token in the Authorization header
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid Bearer token in the Authorization header'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', message: 'Please log in again' });
    }
    return res.status(403).json({ error: 'Invalid token', message: 'Token verification failed' });
  }
}

// this is a middleware factory - returns a new middleware function for each permission
// used like: router.get('/costs', requirePermission('view_costs'), handler)
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Role '${req.user.role}' does not have '${permission}' permission`,
        required: permission,
        userRole: req.user.role
      });
    }

    next();
  };
}

module.exports = {
  generateToken,
  authenticateUser,
  authMiddleware,
  requirePermission,
  JWT_SECRET,
  USERS
};
