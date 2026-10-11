/**
 * Authentication Routes
 * POST /api/auth/login  — Authenticate and receive JWT
 * GET  /api/auth/me     — Get current user profile
 */

const express = require('express');
const router = express.Router();
const { authenticateUser, generateToken, authMiddleware } = require('../middleware/auth');
const { getRolePermissions } = require('../config/roles');

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { token, user: { id, username, role, permissions } }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = authenticateUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  const permissions = getRolePermissions(user.role);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      permissions
    }
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user's profile
 */
router.get('/me', authMiddleware, (req, res) => {
  const permissions = getRolePermissions(req.user.role);
  res.json({
    user: {
      ...req.user,
      permissions
    }
  });
});

module.exports = router;
