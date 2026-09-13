/**
 * Nest Music FCM HTTP v1 sender (Vercel serverless).
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT = full JSON string of Firebase service account
 *   FCM_SEND_SECRET (optional) = shared secret for Authorization: Bearer ...
 *
 * POST /api/fcm-send
 *   body: { requestId?: string, title?, body?, songId?, data? }
 * If requestId is provided, loads notification_requests/{id} from RTDB.
 * Also supports GET (cron) to drain pending notification_requests with status!=sent.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'jokefi';
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

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'
  })).toString('base64url');
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  sign.end();
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${claim}.${sig}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await tokenRes.json();
  if (!data.access_token) throw new Error('Failed to mint Google access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function rtdbGet(path, accessToken) {
  const url = `${DB_URL}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RTDB GET ${path} ${res.status}`);
  return res.json();
}

async function rtdbPatch(path, body, accessToken) {
  const url = `${DB_URL}/${path}.json?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`RTDB PATCH ${path} ${res.status}`);
  return res.json();
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

async function sendFcm(accessToken, token, payload) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: {
          songId: String(payload.songId || ''),
          type: String(payload.type || 'song'),
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
          priority: 'HIGH',
          notification: {
            channelId: 'nest_music_notifications',
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      }
    })
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function deliver(accessToken, payload) {
  const tokensTree = await rtdbGet('device_tokens', accessToken);
  const tokens = collectTokens(tokensTree);
  let sent = 0, failed = 0;
  const errors = [];
  for (const token of tokens) {
    try {
      const r = await sendFcm(accessToken, token, payload);
      if (r.ok) sent++;
      else {
        failed++;
        if (errors.length < 5) errors.push(r.json);
      }
    } catch (e) {
      failed++;
      if (errors.length < 5) errors.push(String(e));
    }
  }
  return { sent, failed, tokenCount: tokens.length, errors };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const sa = getServiceAccount();
  if (!sa) {
    return res.status(503).json({
      ok: false,
      error: 'FIREBASE_SERVICE_ACCOUNT not configured on Vercel',
      hint: 'Paste the Firebase service account JSON into Vercel env FIREBASE_SERVICE_ACCOUNT, then redeploy.'
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
    const accessToken = await getAccessToken(sa);
    let payload = {
      title: 'Nest Music',
      body: 'New update',
      songId: '',
      type: 'song'
    };
    let requestId = null;

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      requestId = body.requestId || null;
      if (requestId) {
        const reqData = await rtdbGet(`notification_requests/${requestId}`, accessToken);
        if (!reqData) return res.status(404).json({ ok: false, error: 'notification request not found' });
        payload = {
          title: reqData.title || 'Nest Music',
          body: reqData.body || '',
          songId: reqData.songId || reqData.trackId || '',
          type: reqData.type || 'song'
        };
      } else {
        payload = {
          title: body.title || payload.title,
          body: body.body || payload.body,
          songId: body.songId || '',
          type: body.type || 'song'
        };
      }
      const result = await deliver(accessToken, payload);
      if (requestId) {
        await rtdbPatch(`notification_requests/${requestId}`, {
          status: 'sent',
          sentAt: Date.now(),
          sentCount: result.sent,
          failedCount: result.failed
        }, accessToken);
      }
      return res.status(200).json({ ok: true, ...result });
    }

    // GET / drain latest unsent
    const all = await rtdbGet('notification_requests', accessToken);
    if (!all) return res.status(200).json({ ok: true, processed: 0 });
    const pending = Object.entries(all)
      .filter(([, v]) => v && v.status !== 'sent')
      .slice(-10);
    let processed = 0;
    const results = [];
    for (const [id, reqData] of pending) {
      const result = await deliver(accessToken, {
        title: reqData.title || 'Nest Music',
        body: reqData.body || '',
        songId: reqData.songId || reqData.trackId || '',
        type: reqData.type || 'song'
      });
      await rtdbPatch(`notification_requests/${id}`, {
        status: 'sent',
        sentAt: Date.now(),
        sentCount: result.sent,
        failedCount: result.failed
      }, accessToken);
      processed++;
      results.push({ id, ...result });
    }
    return res.status(200).json({ ok: true, processed, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
