/**
 * Nest Music FCM HTTP v1 sender (Vercel serverless) using firebase-admin.
 * Env: FIREBASE_SERVICE_ACCOUNT = stringified service account JSON
 * Optional: FCM_SEND_SECRET (Bearer), FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID
 *
 * POST { requestId? , title?, body?, songId?, type? }
 * GET  drains pending notification_requests (status != sent)
 */

const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DATABASE_URL || 'https://jokefi-default-rtdb.firebaseio.com';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const sa = getServiceAccount();
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  return admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: DB_URL,
    projectId: process.env.FIREBASE_PROJECT_ID || sa.project_id || 'jokefi'
  });
}

function collectTokens(tree) {
  const tokens = new Set();
  if (!tree || typeof tree !== 'object') return [];
  for (const uid of Object.keys(tree)) {
    const bucket = tree[uid];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const tid of Object.keys(bucket)) {
      const entry = bucket[tid];
      const token = typeof entry === 'string' ? entry : (entry && (entry.token || entry.value));
      if (token && typeof token === 'string' && token.length > 20) tokens.add(token);
    }
  }
  return [...tokens];
}

async function deliver(payload) {
  const db = admin.database();
  const snap = await db.ref('device_tokens').once('value');
  const tokens = collectTokens(snap.val());
  let sent = 0, failed = 0;
  const errors = [];

  for (const token of tokens) {
    try {
      await admin.messaging().send({
        token,
        notification: {
          title: payload.title || 'Nest Music',
          body: payload.body || ''
        },
        data: {
          songId: String(payload.songId || ''),
          type: String(payload.type || 'song')
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'nest_music_notifications',
            sound: 'default'
          }
        }
      });
      sent++;
    } catch (e) {
      failed++;
      if (errors.length < 5) errors.push(String(e && e.message || e));
    }
  }
  return { sent, failed, tokenCount: tokens.length, errors };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!getServiceAccount()) {
    return res.status(503).json({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT not configured on Vercel',
      hint: 'Set FIREBASE_SERVICE_ACCOUNT to the Admin SDK JSON string, then redeploy.'
    });
  }

  const secret = process.env.FCM_SEND_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    initAdmin();
    const db = admin.database();

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      let payload = {
        title: body.title || 'Nest Music',
        body: body.body || '',
        songId: body.songId || '',
        type: body.type || 'song'
      };
      const requestId = body.requestId || null;
      if (requestId) {
        const snap = await db.ref(`notification_requests/${requestId}`).once('value');
        const reqData = snap.val();
        if (!reqData) return res.status(404).json({ ok: false, error: 'notification request not found' });
        payload = {
          title: reqData.title || 'Nest Music',
          body: reqData.body || '',
          songId: reqData.songId || reqData.trackId || '',
          type: reqData.type || 'song'
        };
      }
      const result = await deliver(payload);
      if (requestId) {
        await db.ref(`notification_requests/${requestId}`).update({
          status: 'sent',
          sentAt: Date.now(),
          sentCount: result.sent,
          failedCount: result.failed
        });
      }
      return res.status(200).json({ ok: true, ...result });
    }

    // GET — drain pending
    const allSnap = await db.ref('notification_requests').once('value');
    const all = allSnap.val();
    if (!all) return res.status(200).json({ ok: true, processed: 0 });
    const pending = Object.entries(all)
      .filter(([, v]) => v && v.status !== 'sent')
      .slice(-10);
    let processed = 0;
    const results = [];
    for (const [id, reqData] of pending) {
      const result = await deliver({
        title: reqData.title || 'Nest Music',
        body: reqData.body || '',
        songId: reqData.songId || reqData.trackId || '',
        type: reqData.type || 'song'
      });
      await db.ref(`notification_requests/${id}`).update({
        status: 'sent',
        sentAt: Date.now(),
        sentCount: result.sent,
        failedCount: result.failed
      });
      processed++;
      results.push({ id, ...result });
    }
    return res.status(200).json({ ok: true, processed, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
