const AsteriskManager = require('asterisk-manager');
const { pool } = require('../db/pool');

let ami = null;

async function initAMI() {
  return new Promise((resolve, reject) => {
    ami = new AsteriskManager(
      process.env.ASTERISK_AMI_PORT || 5038,
      process.env.ASTERISK_HOST || 'localhost',
      process.env.ASTERISK_AMI_USER || 'ccadmin',
      process.env.ASTERISK_AMI_SECRET || 'amipassword',
      true // enable events
    );

    ami.keepConnected();

    ami.on('connect', () => {
      console.log('✅ AMI connected');
      setupEventHandlers();
      resolve(ami);
    });

    ami.on('error', (err) => {
      console.error('AMI error:', err.message);
      reject(err);
    });

    setTimeout(() => reject(new Error('AMI connection timeout')), 10000);
  });
}

function setupEventHandlers() {
  // New incoming call
  ami.on('QueueCallerJoin', async (event) => {
    try {
      const { calleridnum, destchannel, queue, uniqueid } = event;

      // Find tenant by queue name
      const queueResult = await pool.query(
        'SELECT tenant_id FROM queues WHERE asterisk_name = $1', [queue]
      );
      if (!queueResult.rows[0]) return;
      const tenantId = queueResult.rows[0].tenant_id;

      // Log call start
      await pool.query(
        `INSERT INTO calls (tenant_id, asterisk_uniqueid, caller_number, called_number, queue_id, status, started_at)
         SELECT $1, $2, $3, $4, q.id, 'ringing', NOW()
         FROM queues q WHERE q.asterisk_name = $5`,
        [tenantId, uniqueid, calleridnum, destchannel || queue, queue]
      );

      // Broadcast to frontend
      global.io?.to(`tenant:${tenantId}`).emit('call:incoming', {
        uniqueid, callerNumber: calleridnum, queue
      });
    } catch (err) {
      console.error('QueueCallerJoin error:', err);
    }
  });

  // Call answered by agent
  ami.on('AgentConnect', async (event) => {
    try {
      const { member, uniqueid, queue } = event;
      // Extract SIP username from channel (SIP/sip_tenant_1001-xxxx)
      const sipUser = member?.replace(/^SIP\//, '').split('-')[0];

      const agentResult = await pool.query(
        'SELECT * FROM agents WHERE sip_username = $1', [sipUser]
      );
      if (!agentResult.rows[0]) return;
      const agent = agentResult.rows[0];

      const callResult = await pool.query(
        `UPDATE calls SET agent_id = $1, status = 'answered', answered_at = NOW()
         WHERE asterisk_uniqueid = $2 RETURNING *`,
        [agent.id, uniqueid]
      );

      if (callResult.rows[0]) {
        const call = callResult.rows[0];
        const waitSecs = Math.round((new Date() - new Date(call.started_at)) / 1000);
        await pool.query('UPDATE calls SET wait_time_seconds = $1 WHERE id = $2', [waitSecs, call.id]);

        global.io?.to(`tenant:${call.tenant_id}`).emit('call:answered', {
          uniqueid, agentId: agent.id, agentName: agent.name
        });

        // Update agent status to busy
        await pool.query('UPDATE agents SET status = $1 WHERE id = $2', ['busy', agent.id]);
        global.io?.to(`tenant:${call.tenant_id}`).emit('agent:status:updated', {
          agentId: agent.id, status: 'busy'
        });
      }
    } catch (err) {
      console.error('AgentConnect error:', err);
    }
  });

  // Call ended
  ami.on('Hangup', async (event) => {
    try {
      const { uniqueid, duration } = event;

      const callResult = await pool.query(
        `UPDATE calls SET ended_at = NOW(), duration_seconds = $1,
         status = CASE WHEN status = 'answered' THEN 'answered' ELSE 'missed' END
         WHERE asterisk_uniqueid = $2 AND ended_at IS NULL RETURNING *`,
        [parseInt(duration) || 0, uniqueid]
      );

      if (callResult.rows[0]) {
        const call = callResult.rows[0];

        // Release agent back to online
        if (call.agent_id) {
          await pool.query('UPDATE agents SET status = $1 WHERE id = $2', ['online', call.agent_id]);
          global.io?.to(`tenant:${call.tenant_id}`).emit('agent:status:updated', {
            agentId: call.agent_id, status: 'online'
          });
        }

        global.io?.to(`tenant:${call.tenant_id}`).emit('call:ended', {
          uniqueid, duration: call.duration_seconds, status: call.status
        });
      }
    } catch (err) {
      console.error('Hangup error:', err);
    }
  });

  // Queue call abandoned (caller hung up waiting)
  ami.on('QueueCallerAbandon', async (event) => {
    try {
      const { uniqueid } = event;
      const result = await pool.query(
        `UPDATE calls SET status = 'abandoned', ended_at = NOW()
         WHERE asterisk_uniqueid = $1 RETURNING tenant_id`,
        [uniqueid]
      );
      if (result.rows[0]) {
        global.io?.to(`tenant:${result.rows[0].tenant_id}`).emit('call:abandoned', { uniqueid });
      }
    } catch (err) {
      console.error('QueueCallerAbandon error:', err);
    }
  });
}

async function reloadAsteriskSIP() {
  return new Promise((resolve, reject) => {
    if (!ami) return reject(new Error('AMI not connected'));
    ami.action({ action: 'command', command: 'sip reload' }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

async function getAsteriskStatus() {
  return new Promise((resolve, reject) => {
    if (!ami) return reject(new Error('AMI not connected'));
    ami.action({ action: 'CoreStatus' }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

module.exports = { initAMI, reloadAsteriskSIP, getAsteriskStatus };
