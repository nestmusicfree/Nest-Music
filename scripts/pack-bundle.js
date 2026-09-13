/**
 * Pack www/ into public/bundles/vX.Y.Z/ (static mirror + www.zip) and write app-version.json
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const verPath = path.join(root, 'www', 'app-version.json');
const manifest = JSON.parse(fs.readFileSync(verPath, 'utf8'));
const version = manifest.version;
const outDir = path.join(root, 'public', 'bundles', `v${version}`);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'bundles') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
copyDir(path.join(root, 'www'), outDir);

// zip for OTA download (requires zip CLI)
const zipPath = path.join(outDir, 'www.zip');
try {
  execSync(`cd "${path.join(root, 'www')}" && zip -qr "${zipPath}" . -x 'bundles/*'`, { stdio: 'inherit' });
} catch (e) {
  console.warn('zip failed — installing via apt may be needed; writing placeholder note');
  fs.writeFileSync(path.join(outDir, 'WWW_ZIP_MISSING.txt'), 'Run: zip -qr www.zip . from www/');
}

fs.copyFileSync(verPath, path.join(root, 'public', 'app-version.json'));
fs.copyFileSync(verPath, path.join(outDir, 'app-version.json'));
console.log('Bundle packed:', outDir);
console.log('app-version.json → public/');
