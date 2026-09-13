const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const adminWeb = path.resolve(__dirname, '../../admin-web');
const dest = path.resolve(__dirname, '../www');

// Prefer multi-file Vite admin build
const dist = path.join(adminWeb, 'dist');
function buildAdmin() {
  if (!fs.existsSync(path.join(adminWeb, 'node_modules'))) {
    execSync('npm install', { cwd: adminWeb, stdio: 'inherit' });
  }
  execSync('npm run build', { cwd: adminWeb, stdio: 'inherit' });
}

buildAdmin();
fs.mkdirSync(dest, { recursive: true });
// wipe www then copy dist
for (const f of fs.readdirSync(dest)) {
  fs.rmSync(path.join(dest, f), { recursive: true, force: true });
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
copyDir(dist, dest);
// ensure manifest
const manifest = {
  name: 'Nest Music Admin',
  short_name: 'Nest Admin',
  start_url: '.',
  display: 'standalone',
  background_color: '#08080a',
  theme_color: '#1DB954',
  icons: [
    { src: 'https://i.postimg.cc/sg287hck/thinkogic-sharpen-image-209299.png', sizes: '192x192', type: 'image/png' }
  ]
};
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Synced admin Capacitor www from apps/admin-web/dist');
