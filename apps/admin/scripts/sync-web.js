const fs = require('fs');
const path = require('path');
const src = path.resolve(__dirname, '../../../www');
const dest = path.resolve(__dirname, '../www');
fs.mkdirSync(dest, { recursive: true });
// Admin app: serve admin.html as index so WebView loads console directly
fs.copyFileSync(path.join(src, 'admin.html'), path.join(dest, 'index.html'));
fs.copyFileSync(path.join(src, 'manifest.json'), path.join(dest, 'manifest.json'));
console.log('Synced admin www (admin.html -> index.html)');
