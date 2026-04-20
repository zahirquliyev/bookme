const { pool } = require('../db/pool');

async function tenantMiddleware(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT t.*, p.max_agents, p.max_numbers, p.features, p.name as plan_name
       FROM tenants t JOIN plans p ON t.plan_id = p.id
       WHERE t.id = $1`,
      [req.tenantId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    req.tenant = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { tenantMiddleware };
