const router = require('express').Router();
const twilio = require('twilio');
const { pool } = require('../db/pool');

// Validate Twilio signature
function validateTwilio(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return next(); // Skip in dev

  const signature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const valid = twilio.validateRequest(authToken, signature, url, req.body);

  if (!valid) return res.status(403).send('Invalid Twilio signature');
  next();
}

// POST /api/webhooks/twilio/voice — incoming VoIP call
router.post('/twilio/voice', validateTwilio, async (req, res) => {
  const { To, From, CallSid } = req.body;
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    // Find tenant by VoIP number
    const numResult = await pool.query(
      `SELECT pn.tenant_id, q.asterisk_name
       FROM phone_numbers pn
       JOIN queues q ON pn.tenant_id = q.tenant_id
       WHERE pn.number = $1 AND pn.type = 'voip' AND pn.status = 'active'
       LIMIT 1`,
      [To]
    );

    if (!numResult.rows[0]) {
      twiml.say({ language: 'az-AZ' }, 'Bu nömrə artıq aktiv deyil.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    const { tenant_id, asterisk_name } = numResult.rows[0];

    // Check working hours
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = now.toTimeString().slice(0, 5);

    const hoursResult = await pool.query(
      `SELECT * FROM working_hours
       WHERE tenant_id = $1 AND day_of_week = $2 AND is_active = TRUE
       AND open_time <= $3::time AND close_time >= $3::time`,
      [tenant_id, dayOfWeek, currentTime]
    );

    if (!hoursResult.rows[0]) {
      twiml.say({ language: 'az-AZ' }, 'Bağlıdır. Zəhmət olmasa iş saatlarında zəng edin.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Log the call
    await pool.query(
      `INSERT INTO calls (tenant_id, asterisk_uniqueid, caller_number, called_number, call_type, status)
       VALUES ($1, $2, $3, $4, 'voip', 'ringing')`,
      [tenant_id, CallSid, From, To]
    );

    // Dial into Asterisk SIP
    const dial = twiml.dial({ timeout: 30, record: 'record-from-answer' });
    dial.sip(`sip:${asterisk_name}@${process.env.ASTERISK_SIP_HOST || 'asterisk'}:5060`);

    // Fallback if no answer
    twiml.say({ language: 'az-AZ' }, 'Bütün operatorlar məşğuldur. Zəhmət olmasa bir az sonra zəng edin.');
    twiml.hangup();

    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('Twilio voice webhook error:', err);
    twiml.say('Texniki xəta baş verdi.');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// POST /api/webhooks/twilio/status — call status updates
router.post('/twilio/status', validateTwilio, async (req, res) => {
  const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;

  const statusMap = {
    'completed': 'answered',
    'no-answer': 'missed',
    'busy': 'missed',
    'failed': 'missed',
    'canceled': 'abandoned'
  };

  try {
    await pool.query(
      `UPDATE calls SET
         status = $1,
         duration_seconds = $2,
         recording_url = $3,
         ended_at = NOW()
       WHERE asterisk_uniqueid = $4`,
      [
        statusMap[CallStatus] || CallStatus,
        parseInt(CallDuration) || 0,
        RecordingUrl || null,
        CallSid
      ]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Twilio status webhook error:', err);
    res.sendStatus(500);
  }
});

// POST /api/webhooks/twilio/recording — recording complete
router.post('/twilio/recording', validateTwilio, async (req, res) => {
  const { CallSid, RecordingUrl, RecordingDuration } = req.body;
  try {
    await pool.query(
      `UPDATE calls SET recording_url = $1 WHERE asterisk_uniqueid = $2`,
      [RecordingUrl, CallSid]
    );
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

module.exports = router;
