const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const src = path.join(projectRoot, 'index.html');
const webDir = path.join(projectRoot, 'www');
const dest = path.join(webDir, 'index.html');
const assetsSrcDir = path.join(projectRoot, 'assets');
const assetsDestDir = path.join(webDir, 'assets');

if (!fs.existsSync(src)) {
  console.error('Expected index.html at:', src);
  process.exit(1);
}

fs.mkdirSync(webDir, { recursive: true });

const html = fs.readFileSync(src, 'utf8');
// Only the Capacitor build (www/) should reference capacitor.js.
// The hosted web app can continue to use the root index.html unchanged.
const injected = html.includes('src="capacitor.js"')
  ? html
  : html.replace(
      /<\/head>/i,
      '  <script src="capacitor.js"></script>\n</head>'
    );

fs.writeFileSync(dest, injected, 'utf8');

if (fs.existsSync(assetsSrcDir)) {
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(assetsSrcDir, assetsDestDir, { recursive: true });
  } else {
    console.warn('⚠️ Node does not support fs.cpSync; assets/ was not copied to www/.');
  }
}

console.log('✓ Copied + injected capacitor.js', src, '→', dest);
