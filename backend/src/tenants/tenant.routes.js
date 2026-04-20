const router = require('express').Router();
const { pool } = require('../db/pool');
const { requireRole } = require('../middleware/auth');

// GET /api/tenants/me — tenant info
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, p.name as plan_name, p.max_agents, p.max_numbers, p.features
       FROM tenants t JOIN plans p ON t.plan_id = p.id WHERE t.id = $1`,
      [req.tenantId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tenants/stats — dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [calls, agents, missed] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
                AVG(duration_seconds) as avg_duration,
                AVG(wait_time_seconds) as avg_wait
         FROM calls WHERE tenant_id = $1 AND started_at > NOW() - INTERVAL '24 hours'`,
        [req.tenantId]
      ),
      pool.query(
        `SELECT status, COUNT(*) as count FROM agents WHERE tenant_id = $1 GROUP BY status`,
        [req.tenantId]
      ),
      pool.query(
        `SELECT COUNT(*) as missed FROM calls
         WHERE tenant_id = $1 AND status = 'missed' AND started_at > NOW() - INTERVAL '24 hours'`,
        [req.tenantId]
      )
    ]);

    const agentStats = {};
    agents.rows.forEach(r => agentStats[r.status] = parseInt(r.count));

    res.json({
      today: {
        total: parseInt(calls.rows[0].total),
        answered: parseInt(calls.rows[0].answered),
        missed: parseInt(missed.rows[0].missed),
        avgDuration: Math.round(calls.rows[0].avg_duration || 0),
        avgWait: Math.round(calls.rows[0].avg_wait || 0)
      },
      agents: agentStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tenants/numbers — phone numbers
router.get('/numbers', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM phone_numbers WHERE tenant_id = $1 ORDER BY is_primary DESC',
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tenants/numbers — add phone number
router.post('/numbers', requireRole('owner', 'admin'), async (req, res) => {
  const { number, type, provider, isPrimary, isFallback, gsmPort, voipDid } = req.body;
  try {
    // Check plan limits
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM phone_numbers WHERE tenant_id = $1',
      [req.tenantId]
    );
    if (parseInt(countResult.rows[0].count) >= req.tenant.max_numbers) {
      return res.status(403).json({ error: `Plan limit: max ${req.tenant.max_numbers} numbers` });
    }

    // Only one primary allowed
    if (isPrimary) {
      await pool.query(
        'UPDATE phone_numbers SET is_primary = FALSE WHERE tenant_id = $1',
        [req.tenantId]
      );
    }

    const result = await pool.query(
      `INSERT INTO phone_numbers (tenant_id, number, type, provider, is_primary, is_fallback, gsm_port, voip_did)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.tenantId, number, type, provider, isPrimary || false, isFallback || false, gsmPort, voipDid]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tenants/calls — call history
router.get('/calls', async (req, res) => {
  const { page = 1, limit = 20, status, from, to } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `SELECT c.*, a.name as agent_name
                 FROM calls c LEFT JOIN agents a ON c.agent_id = a.id
                 WHERE c.tenant_id = $1`;
    const params = [req.tenantId];
    let paramIdx = 2;

    if (status) { query += ` AND c.status = $${paramIdx++}`; params.push(status); }
    if (from)   { query += ` AND c.started_at >= $${paramIdx++}`; params.push(from); }
    if (to)     { query += ` AND c.started_at <= $${paramIdx++}`; params.push(to); }

    query += ` ORDER BY c.started_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ calls: result.rows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tenants/working-hours
router.get('/working-hours', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM working_hours WHERE tenant_id = $1 ORDER BY day_of_week',
    [req.tenantId]
  );
  res.json(result.rows);
});

// PUT /api/tenants/working-hours
router.put('/working-hours', requireRole('owner', 'admin'), async (req, res) => {
  const { hours } = req.body; // Array of { day_of_week, open_time, close_time, is_active }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM working_hours WHERE tenant_id = $1', [req.tenantId]);
    for (const h of hours) {
      await client.query(
        'INSERT INTO working_hours (tenant_id, day_of_week, open_time, close_time, is_active) VALUES ($1,$2,$3,$4,$5)',
        [req.tenantId, h.day_of_week, h.open_time, h.close_time, h.is_active]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Working hours updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
