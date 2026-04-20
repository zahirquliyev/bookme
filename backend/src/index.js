require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { pool } = require('./db/pool');
const { redisClient } = require('./db/redis');
const { initAMI } = require('./asterisk/ami');

// Routes
const authRoutes = require('./tenants/auth.routes');
const tenantRoutes = require('./tenants/tenant.routes');
const agentRoutes = require('./agents/agent.routes');
const callRoutes = require('./calls/call.routes');
const webhookRoutes = require('./webhooks/twilio.routes');

// Middleware
const { authMiddleware } = require('./middleware/auth');
const { tenantMiddleware } = require('./middleware/tenant');

const app = express();
const server = http.createServer(app);

// Socket.io for realtime agent status
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] }
});

// Make io accessible in routes
app.set('io', io);

// ── Middleware ──────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Public Routes ───────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes); // Twilio webhooks (no auth)

// ── Protected Routes ────────────────────────────────────
app.use('/api/tenants', authMiddleware, tenantRoutes);
app.use('/api/agents', authMiddleware, tenantMiddleware, agentRoutes);
app.use('/api/calls', authMiddleware, tenantMiddleware, callRoutes);

// ── Socket.io ───────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.tenantId = decoded.tenantId;
    next();
  } catch (e) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`Agent connected: ${socket.userId}`);
  socket.join(`tenant:${socket.tenantId}`);

  // Agent status update
  socket.on('agent:status', async ({ status }) => {
    try {
      await pool.query(
        'UPDATE agents SET status = $1 WHERE user_id = $2',
        [status, socket.userId]
      );
      io.to(`tenant:${socket.tenantId}`).emit('agent:status:updated', {
        userId: socket.userId,
        status
      });
    } catch (err) {
      console.error('Status update error:', err);
    }
  });

  socket.on('disconnect', async () => {
    await pool.query(
      'UPDATE agents SET status = $1 WHERE user_id = $2',
      ['offline', socket.userId]
    );
    io.to(`tenant:${socket.tenantId}`).emit('agent:status:updated', {
      userId: socket.userId,
      status: 'offline'
    });
  });
});

// ── Error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// ── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await pool.connect();
    console.log('✅ PostgreSQL connected');

    await redisClient.connect();
    console.log('✅ Redis connected');

    await initAMI();
    console.log('✅ Asterisk AMI connected');

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

start();
