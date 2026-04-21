const AsteriskManager = require('asterisk-manager');
const { pool } = require('../db/pool');

let ami = null;
let amiConnected = false;
let handlersSet = false;

async function initAMI() {
  connectAMI();
  return Promise.resolve();
}

function connectAMI() {
  try {
    ami = new AsteriskManager(
      parseInt(process.env.ASTERISK_AMI_PORT) || 5038,
      process.env.ASTERISK_HOST || '127.0.0.1',
      process.env.ASTERISK_AMI_USER || 'ccadmin',
      process.env.ASTERISK_AMI_SECRET || 'amipassword',
      true
    );

    ami.keepConnected();

    ami.on('connect', () => {
      amiConnected = true;
      console.log('✅ Asterisk AMI connected');
      if (!handlersSet) {
        setupEventHandlers();
        handlersSet = true;
      }
    });

    ami.on('close', () => {
      amiConnected = false;
      console.warn('⚠️  AMI disconnected — will retry automatically');
    });

    ami.on('error', (err) => {
      amiConnected = false;
      if (err.code !== 'ECONNREFUSED') {
        console.warn('⚠️  AMI error:', err.message);
      }
    });

  } catch (err) {
    console.warn('⚠️  AMI init error (non-fatal):', err.message);
  }
}

function setupEventHandlers() {
  if (!ami) return;

  // PeerStatus — agent online/offline
  ami.on('peerstatus', async (event) => {
    try {
      const sipUser = event.peer?.replace(/^SIP\//, '');
      if (!sipUser) return;
      const newStatus = event.peerstatus === 'Registered' ? 'online' : 'offline';
      const result = await pool.query(
        'UPDATE agents SET status = $1 WHERE sip_username = $2 RETURNING id, tenant_id, status',
        [newStatus, sipUser]
      );
      if (result.rows[0]) {
        const { id, tenant_id, status } = result.rows[0];
        console.log(`Agent ${sipUser} → ${status}`);
        global.io?.to(`tenant:${tenant_id}`).emit('agent:status:updated', { agentId: id, status });
      }
    } catch (err) {
      console.error('peerstatus error:', err);
    }
  });

  // DialBegin — agent-to-agent call started
  ami.on('dialbegin', async (event) => {
    try {
      const callerNum = event.calleridnum;
      const destNum = event.destcalleridnum;
      const uniqueid = event.uniqueid;

      console.log(`DialBegin: ${callerNum} → ${destNum} [${uniqueid}]`);

      const callerResult = await pool.query(
        'SELECT * FROM agents WHERE extension = $1', [callerNum]
      );
      if (!callerResult.rows[0]) return;
      const caller = callerResult.rows[0];

      await pool.query(
        `INSERT INTO calls (tenant_id, asterisk_uniqueid, caller_number, called_number, agent_id, call_type, direction, status, started_at)
         VALUES ($1, $2, $3, $4, $5, 'internal', 'internal', 'ringing', NOW())
         ON CONFLICT DO NOTHING`,
        [caller.tenant_id, uniqueid, callerNum, destNum, caller.id]
      );

      global.io?.to(`tenant:${caller.tenant_id}`).emit('call:incoming', {
        uniqueid, callerNumber: callerNum, calledNumber: destNum, type: 'internal'
      });
    } catch (err) {
      console.error('dialbegin error:', err);
    }
  });

  // DialEnd — call answered or missed
  ami.on('dialend', async (event) => {
    try {
      const uniqueid = event.uniqueid;
      const status = event.dialstatus === 'ANSWER' ? 'answered' : 'missed';
      const result = await pool.query(
        `UPDATE calls SET status = $1, answered_at = CASE WHEN $1 = 'answered' THEN NOW() ELSE NULL END
         WHERE asterisk_uniqueid = $2 RETURNING *`,
        [status, uniqueid]
      );
      if (result.rows[0]) {
        const call = result.rows[0];
        global.io?.to(`tenant:${call.tenant_id}`).emit('call:answered', { uniqueid, status });
      }
    } catch (err) {
      console.error('dialend error:', err);
    }
  });

  // Hangup — call ended
  ami.on('hangup', async (event) => {
    try {
      const { uniqueid, duration } = event;
      const result = await pool.query(
        `UPDATE calls SET ended_at = NOW(), duration_seconds = $1,
         status = CASE WHEN status = 'answered' THEN 'answered' ELSE 'missed' END
         WHERE asterisk_uniqueid = $2 AND ended_at IS NULL RETURNING *`,
        [parseInt(duration) || 0, uniqueid]
      );
      if (result.rows[0]) {
        const call = result.rows[0];
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
      console.error('hangup error:', err);
    }
  });

  // QueueCallerJoin
  ami.on('queuecallerjoin', async (event) => {
    try {
      const { calleridnum, destchannel, queue, uniqueid } = event;
      const queueResult = await pool.query(
        'SELECT tenant_id FROM queues WHERE asterisk_name = $1', [queue]
      );
      if (!queueResult.rows[0]) return;
      const tenantId = queueResult.rows[0].tenant_id;
      await pool.query(
        `INSERT INTO calls (tenant_id, asterisk_uniqueid, caller_number, called_number, queue_id, status, started_at)
         SELECT $1, $2, $3, $4, q.id, 'ringing', NOW()
         FROM queues q WHERE q.asterisk_name = $5`,
        [tenantId, uniqueid, calleridnum, destchannel || queue, queue]
      );
      global.io?.to(`tenant:${tenantId}`).emit('call:incoming', {
        uniqueid, callerNumber: calleridnum, queue
      });
    } catch (err) {
      console.error('queuecallerjoin error:', err);
    }
  });

  // AgentConnect
  ami.on('agentconnect', async (event) => {
    try {
      const { member, uniqueid } = event;
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
        await pool.query('UPDATE agents SET status = $1 WHERE id = $2', ['busy', agent.id]);
        global.io?.to(`tenant:${call.tenant_id}`).emit('agent:status:updated', {
          agentId: agent.id, status: 'busy'
        });
      }
    } catch (err) {
      console.error('agentconnect error:', err);
    }
  });

  // QueueCallerAbandon
  ami.on('queuecallerabandon', async (event) => {
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
      console.error('queuecallerabandon error:', err);
    }
  });
}

async function reloadAsteriskSIP() {
  if (!amiConnected) throw new Error('AMI not connected');
  return new Promise((resolve, reject) => {
    ami.action({ action: 'command', command: 'sip reload' }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

async function getAsteriskStatus() {
  if (!amiConnected) throw new Error('AMI not connected');
  return new Promise((resolve, reject) => {
    ami.action({ action: 'CoreStatus' }, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

module.exports = { initAMI, reloadAsteriskSIP, getAsteriskStatus };
