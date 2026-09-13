const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'public');
fs.rmSync(pub, { recursive: true, force: true });
fs.mkdirSync(pub, { recursive: true });

// Full www → public root (user app)
copyDir(path.join(root, 'www'), pub);
// Don't nest bundles inside themselves if any
fs.rmSync(path.join(pub, 'bundles'), { recursive: true, force: true });

// Web admin with absolute /admin/ base
execSync('npm run build', {
  cwd: path.join(root, 'apps/admin-web'),
  stdio: 'inherit',
  env: { ...process.env, ADMIN_BASE: '/admin/' }
});
copyDir(path.join(root, 'apps/admin-web/dist'), path.join(pub, 'admin'));

fs.writeFileSync(path.join(pub, 'admin.html'), `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta http-equiv="refresh" content="0;url=/admin/"/>
<link rel="canonical" href="/admin/"/>
<title>Nest Music Admin</title>
<script>location.replace('/admin/'+location.search+location.hash)</script>
</head><body style="background:#08080a;color:#fff;font-family:sans-serif;padding:2rem">
Redirecting to <a href="/admin/" style="color:#1DB954">/admin/</a>…
</body></html>
`);

// Pack OTA bundles + app-version.json
try {
  execSync('node scripts/pack-bundle.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.warn('pack-bundle note:', e.message);
  if (fs.existsSync(path.join(root, 'www', 'app-version.json'))) {
    fs.copyFileSync(path.join(root, 'www', 'app-version.json'), path.join(pub, 'app-version.json'));
  }
}

console.log('public/ prepared: index + css/js + admin/ + bundles + app-version.json');
