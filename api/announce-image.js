/**
 * GET /api/announce-image?id= — public image for FCM / inbox.
 * Looks up announcements/{id} or notification_requests/{id} imageBase64.
 */
const admin = require('firebase-admin');

const DB_URL = process.env.FIREBASE_DATABASE_URL || 'https://jokefi-default-rtdb.firebaseio.com';

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

function decodeDataUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
  // raw base64
  try {
    return { mime: 'image/jpeg', buf: Buffer.from(raw, 'base64') };
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  const id = String((req.query && (req.query.id || req.query.announcementId)) || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    initAdmin();
    const db = admin.database();
    let val = (await db.ref(`announcements/${id}`).once('value')).val();
    if (!val) val = (await db.ref(`notification_requests/${id}`).once('value')).val();
    const raw = val && (val.imageBase64 || val.imageData || val.coverBase64);
    const decoded = decodeDataUrl(raw);
    if (!decoded) {
      res.writeHead(302, { Location: 'https://i.postimg.cc/sg287hck/thinkogic-sharpen-image-209299.png' });
      return res.end();
    }
    res.setHeader('Content-Type', decoded.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).end(decoded.buf);
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
