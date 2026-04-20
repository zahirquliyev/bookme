const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { requireRole } = require('../middleware/auth');
const { reloadAsteriskSIP } = require('../asterisk/ami');

// GET /api/agents — list agents
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.email FROM agents a JOIN users u ON a.user_id = u.id
       WHERE a.tenant_id = $1 ORDER BY a.name`,
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents — create agent
router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, password required' });
  }

  // Check plan limit
  const countResult = await pool.query(
    'SELECT COUNT(*) FROM agents WHERE tenant_id = $1', [req.tenantId]
  );
  if (parseInt(countResult.rows[0].count) >= req.tenant.max_agents) {
    return res.status(403).json({ error: `Plan limit: max ${req.tenant.max_agents} agents` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get next extension number for this tenant
    const extResult = await client.query(
      `SELECT COALESCE(MAX(CAST(extension AS INT)), 1000) + 1 as next_ext
       FROM agents WHERE tenant_id = $1`,
      [req.tenantId]
    );
    const extension = extResult.rows[0].next_ext.toString();
    const sipUsername = `sip_${req.tenant.slug.replace(/-/g, '_')}_${extension}`;
    const sipPassword = Math.random().toString(36).slice(-10);

    // Create user
    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'agent') RETURNING id`,
      [req.tenantId, email, passwordHash, name]
    );

    // Create agent
    const agentResult = await client.query(
      `INSERT INTO agents (tenant_id, user_id, name, extension, sip_username, sip_password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.tenantId, userResult.rows[0].id, name, extension, sipUsername, await bcrypt.hash(sipPassword, 10)]
    );

    // Add to default queue
    const queueResult = await client.query(
      'SELECT id FROM queues WHERE tenant_id = $1 LIMIT 1', [req.tenantId]
    );
    if (queueResult.rows[0]) {
      await client.query(
        'INSERT INTO queue_agents (queue_id, agent_id) VALUES ($1, $2)',
        [queueResult.rows[0].id, agentResult.rows[0].id]
      );
    }

    await client.query('COMMIT');

    // Reload Asterisk SIP config
    try { await reloadAsteriskSIP(); } catch (e) { console.warn('AMI reload failed:', e.message); }

    res.status(201).json({
      ...agentResult.rows[0],
      sipPassword, // Return plain password only on creation
      sipUsername,
      extension
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/agents/:id/status — update agent status
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['online', 'offline', 'busy', 'paused'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await pool.query(
      `UPDATE agents SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, req.params.id, req.tenantId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Agent not found' });

    // Broadcast to tenant room
    req.app.get('io').to(`tenant:${req.tenantId}`).emit('agent:status:updated', {
      agentId: req.params.id,
      status
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET is_active = FALSE WHERE id = (
         SELECT user_id FROM agents WHERE id = $1 AND tenant_id = $2
       )`,
      [req.params.id, req.tenantId]
    );
    await pool.query(
      'UPDATE agents SET status = $1 WHERE id = $2 AND tenant_id = $3',
      ['offline', req.params.id, req.tenantId]
    );
    res.json({ message: 'Agent deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
