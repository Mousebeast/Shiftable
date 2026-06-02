'use strict';

const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('[auth] JWT_SECRET environment variable is required');
}

/**
 * authenticate
 *
 * Reads the JWT from req.cookies.token, verifies it with JWT_SECRET,
 * and attaches the decoded payload to req.user.
 *
 * Responds 401 if the token is missing, invalid, or expired.
 */
function authenticate(req, res, next) {
  const token = req.cookies && req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    // Both JsonWebTokenError and TokenExpiredError are treated as 401
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * checkRole(allowedRoles)
 *
 * Returns middleware that rejects with 403 if req.user.role is not
 * in the allowedRoles array.  Must be used after authenticate.
 */
function checkRole(allowedRoles) {
  return function (req, res, next) {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

/**
 * requireStaff — allows staff, manager, admin
 * requireManager — allows manager, admin
 * requireAdmin — allows admin only
 *
 * Each is an array of middleware so Express will run them in order:
 *   router.get('/path', requireManager, handler)
 */
const requireStaff = [authenticate, checkRole(['staff', 'manager', 'admin'])];
const requireManager = [authenticate, checkRole(['manager', 'admin'])];
const requireAdmin = [authenticate, checkRole(['admin'])];

// authenticate is exported for routes that need auth without a specific role (e.g. notifications).
// For role-gated routes, use requireStaff, requireManager, or requireAdmin instead.
module.exports = { authenticate, requireStaff, requireManager, requireAdmin };
