const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT u.*, t.slug as tenant_slug, t.is_active as tenant_active FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.id = $1 AND u.is_active = TRUE',
      [decoded.userId]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!result.rows[0].tenant_active) {
      return res.status(403).json({ error: 'Tenant account is inactive' });
    }

    req.user = result.rows[0];
    req.tenantId = result.rows[0].tenant_id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
