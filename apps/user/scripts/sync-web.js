const fs = require('fs');
const path = require('path');
const src = path.resolve(__dirname, '../../../www');
const dest = path.resolve(__dirname, '../www');

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    if (entry.name === 'bundles') continue;
    const a = path.join(s, entry.name);
    const b = path.join(d, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
copyDir(src, dest);
console.log('Synced user www from ../../www (incl. css/js)');
