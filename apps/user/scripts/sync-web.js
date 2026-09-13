const fs = require('fs');
const path = require('path');
const src = path.resolve(__dirname, '../../../www');
const dest = path.resolve(__dirname, '../www');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['index.html', 'manifest.json']) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
// Capacitor needs a simple local asset; admin not included
console.log('Synced user www from ../../www');
