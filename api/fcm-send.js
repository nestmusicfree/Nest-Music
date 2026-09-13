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
const CHANNEL_ID = 'nest_music_notifications';
const STALE_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

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

function collectTokenEntries(tree) {
  const entries = [];
  if (!tree || typeof tree !== 'object') return entries;
  for (const uid of Object.keys(tree)) {
    const bucket = tree[uid];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const tid of Object.keys(bucket)) {
      const entry = bucket[tid];
      const token = typeof entry === 'string' ? entry : (entry && (entry.token || entry.value));
      if (token && typeof token === 'string' && token.length > 20) {
        entries.push({ token, path: `device_tokens/${uid}/${tid}` });
      }
    }
  }
  return entries;
}

function isStaleTokenError(err) {
  const code = (err && err.errorInfo && err.errorInfo.code) || (err && err.code) || '';
  const msg = String((err && err.message) || err || '');
  if (STALE_CODES.has(code)) return true;
  return /NotRegistered|UNREGISTERED|registration-token-not-registered|Requested entity was not found/i.test(msg);
}

const DEFAULT_IMAGE = 'https://i.postimg.cc/sg287hck/thinkogic-sharpen-image-209299.png';

function publicImageUrl(payload) {
  const raw = payload.imageUrl || payload.image || payload.coverUrl || payload.cover || '';
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw)) return raw;
  const aid = payload.announcementId || payload.imageId || payload.requestId || '';
  if (aid) return `https://nest-music.vercel.app/api/announce-image?id=${encodeURIComponent(aid)}`;
  return DEFAULT_IMAGE;
}

function buildMessage(token, payload) {
  const songId = String(payload.songId || '');
  const type = String(payload.type || 'song');
  const title = payload.title || 'Nest Music';
  const body = payload.body || '';
  const imageUrl = publicImageUrl(payload);
  const deepLink = songId ? `nestmusic://track/${songId}` : 'nestmusic://open';
  return {
    token,
    notification: { title, body, imageUrl },
    data: {
      songId,
      type,
      title,
      body,
      imageUrl,
      click_action: 'OPEN',
      url: deepLink
    },
    android: {
      priority: 'high',
      ttl: 3600 * 1000,
      notification: {
        channelId: CHANNEL_ID,
        sound: 'default',
        defaultSound: true,
        defaultVibrateTimings: true,
        visibility: 'public',
        notificationCount: 1,
        clickAction: 'OPEN',
        icon: 'ic_stat_nest',
        color: '#1DB954',
        imageUrl,
        tag: songId ? `nest-track-${songId}` : (type === 'message' ? 'nest-message' : 'nest-music')
      }
    }
  };
}

async function deliver(payload) {
  const db = admin.database();
  const snap = await db.ref('device_tokens').once('value');
  const entries = collectTokenEntries(snap.val());
  const seen = new Set();
  const unique = entries.filter((e) => {
    if (seen.has(e.token)) return false;
    seen.add(e.token);
    return true;
  });

  let sent = 0;
  let failed = 0;
  let cleaned = 0;
  const errors = [];

  for (const { token, path } of unique) {
    try {
      await admin.messaging().send(buildMessage(token, payload));
      sent++;
    } catch (e) {
      failed++;
      if (isStaleTokenError(e)) {
        try {
          await db.ref(path).remove();
          cleaned++;
        } catch (_) { /* ignore prune failure */ }
      }
      if (errors.length < 8) errors.push(String(e && e.message || e));
    }
  }
  return { sent, failed, cleaned, tokenCount: unique.length, errors };
}

function payloadFromRequest(reqData, fallback) {
  const src = reqData || fallback || {};
  return {
    title: src.title || 'Nest Music',
    body: src.body || '',
    songId: src.songId || src.trackId || '',
    type: src.type || 'song',
    imageUrl: src.imageUrl || src.image || src.coverUrl || '',
    announcementId: src.announcementId || src.imageId || '',
    requestId: src.requestId || ''
  };
}

function isCronOrGet(req) {
  return req.method === 'GET' || req.headers['x-vercel-cron'] === '1';
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
  // Cron / GET drain must work without a Bearer token. POST is protected when a secret is set.
  if (secret && !isCronOrGet(req)) {
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
      let payload = payloadFromRequest(null, body);
      const requestId = body.requestId || null;
      if (requestId) {
        const snap = await db.ref(`notification_requests/${requestId}`).once('value');
        const reqData = snap.val();
        if (!reqData) return res.status(404).json({ ok: false, error: 'notification request not found' });
        payload = payloadFromRequest({ ...reqData, requestId, announcementId: reqData.announcementId || requestId });
      }
      const result = await deliver(payload);
      if (requestId) {
        await db.ref(`notification_requests/${requestId}`).update({
          status: 'sent',
          sentAt: Date.now(),
          sentCount: result.sent,
          failedCount: result.failed,
          cleanedCount: result.cleaned,
          tokenCount: result.tokenCount
        });
      }
      return res.status(200).json({ ok: true, ...result });
    }

    // GET / cron — drain pending
    const allSnap = await db.ref('notification_requests').once('value');
    const all = allSnap.val();
    if (!all) return res.status(200).json({ ok: true, processed: 0 });
    const pending = Object.entries(all)
      .filter(([, v]) => v && v.status !== 'sent')
      .slice(-20);
    let processed = 0;
    const results = [];
    for (const [id, reqData] of pending) {
      const result = await deliver(payloadFromRequest({ ...reqData, requestId: id, announcementId: reqData.announcementId || id }));
      await db.ref(`notification_requests/${id}`).update({
        status: 'sent',
        sentAt: Date.now(),
        sentCount: result.sent,
        failedCount: result.failed,
        cleanedCount: result.cleaned,
        tokenCount: result.tokenCount
      });
      processed++;
      results.push({ id, ...result });
    }
    return res.status(200).json({ ok: true, processed, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
