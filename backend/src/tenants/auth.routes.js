const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');

// ── Register new tenant + owner ──────────────────────────
router.post('/register', async (req, res) => {
  const { businessName, ownerName, email, password } = req.body;
  if (!businessName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check email uniqueness
    const existing = await client.query('SELECT id FROM tenants WHERE owner_email = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Generate slug from business name
    const slug = businessName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + uuidv4().slice(0, 6);

    // Get starter plan
    const planResult = await client.query("SELECT id FROM plans WHERE name = 'starter' LIMIT 1");
    const planId = planResult.rows[0]?.id;

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, owner_email, owner_name, plan_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [businessName, slug, email, ownerName, planId]
    );
    const tenantId = tenantResult.rows[0].id;

    // Hash password & create owner user
    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
      [tenantId, email, passwordHash, ownerName || email]
    );
    const userId = userResult.rows[0].id;

    // Create default queue for tenant
    await client.query(
      `INSERT INTO queues (tenant_id, name, asterisk_name)
       VALUES ($1, 'Main Queue', $2)`,
      [tenantId, `q_${slug.replace(/-/g, '_').slice(0, 20)}`]
    );

    await client.query('COMMIT');

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(userId, tenantId, 'owner');
    await saveRefreshToken(userId, refreshToken);

    res.status(201).json({
      message: 'Account created successfully',
      accessToken,
      refreshToken,
      tenant: { id: tenantId, slug, name: businessName }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// ── Login ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pool.query(
      `SELECT u.*, t.name as tenant_name, t.slug as tenant_slug
       FROM users u JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1 AND u.is_active = TRUE AND t.is_active = TRUE`,
      [email]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const { accessToken, refreshToken } = generateTokens(user.id, user.tenant_id, user.role);
    await saveRefreshToken(user.id, refreshToken);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        tenantSlug: user.tenant_slug
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Refresh token ────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const result = await pool.query(
      `SELECT s.*, u.tenant_id, u.role FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.refresh_token = $1 AND s.expires_at > NOW()`,
      [refreshToken]
    );

    if (!result.rows[0]) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    const session = result.rows[0];
    const { accessToken, refreshToken: newRefresh } = generateTokens(session.user_id, session.tenant_id, session.role);

    // Rotate refresh token
    await pool.query('DELETE FROM sessions WHERE id = $1', [session.id]);
    await saveRefreshToken(session.user_id, newRefresh);

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ── Logout ───────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await pool.query('DELETE FROM sessions WHERE refresh_token = $1', [refreshToken]);
  }
  res.json({ message: 'Logged out' });
});

// ── Helpers ──────────────────────────────────────────────
function generateTokens(userId, tenantId, role) {
  const accessToken = jwt.sign(
    { userId, tenantId, role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { userId, tenantId, role, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

async function saveRefreshToken(userId, token) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );
}

module.exports = router;
