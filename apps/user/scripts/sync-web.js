const fs = require('fs');
const path = require('path');
const src = path.resolve(__dirname, '../../../www');
const dest = path.resolve(__dirname, '../www');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['index.html', 'manifest.json']) {
  if (fs.existsSync(path.join(src, f))) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
}
// optional icons folder
const iconsSrc = path.join(src, 'icons');
if (fs.existsSync(iconsSrc)) {
  const iconsDest = path.join(dest, 'icons');
  fs.mkdirSync(iconsDest, { recursive: true });
  for (const f of fs.readdirSync(iconsSrc)) {
    fs.copyFileSync(path.join(iconsSrc, f), path.join(iconsDest, f));
  }
}
console.log('Synced user www from ../../www');
