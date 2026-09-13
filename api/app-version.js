/**
 * GET /api/app-version — Nest Music OTA version manifest
 * Mirrors public/app-version.json for clients that prefer an API route.
 */
const fs = require('fs');
const path = require('path');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const candidates = [
    path.join(process.cwd(), 'public', 'app-version.json'),
    path.join(process.cwd(), 'app-version.json'),
    path.join(__dirname, '..', 'www', 'app-version.json')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        return res.status(200).json(j);
      }
    } catch (_) {}
  }

  // Fallback inline (kept in sync with www/app-version.json)
  return res.status(200).json({
    version: '1.3.0',
    build: 130,
    bundleUrl: 'https://nest-music.vercel.app/bundles/v1.3.0/www.zip',
    staticBase: 'https://nest-music.vercel.app/bundles/v1.3.0/',
    notes: 'Themes, in-app OTA, offline downloads, queue, Smart Radio, social lite.',
    minNative: '1.3.0'
  });
};
