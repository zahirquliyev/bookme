const router = require('express').Router();
const { pool } = require('../db/pool');

// GET /api/calls/active — active calls right now
router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, a.name as agent_name, a.extension
       FROM calls c LEFT JOIN agents a ON c.agent_id = a.id
       WHERE c.tenant_id = $1 AND c.ended_at IS NULL
       ORDER BY c.started_at ASC`,
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/:id — call detail
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, a.name as agent_name FROM calls c
       LEFT JOIN agents a ON c.agent_id = a.id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Call not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/calls/:id/notes — add call notes
router.put('/:id/notes', async (req, res) => {
  const { notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE calls SET notes = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [notes, req.params.id, req.tenantId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/analytics/summary — analytics
router.get('/analytics/summary', async (req, res) => {
  const { days = 7 } = req.query;
  try {
    const result = await pool.query(
      `SELECT
         DATE(started_at) as date,
         COUNT(*) as total,
         SUM(CASE WHEN status='answered' THEN 1 ELSE 0 END) as answered,
         SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) as missed,
         AVG(duration_seconds) as avg_duration,
         AVG(wait_time_seconds) as avg_wait
       FROM calls
       WHERE tenant_id = $1 AND started_at > NOW() - ($2 || ' days')::INTERVAL
       GROUP BY DATE(started_at)
       ORDER BY date ASC`,
      [req.tenantId, days]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
