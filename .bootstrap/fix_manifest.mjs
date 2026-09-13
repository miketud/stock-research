const fs = require('fs');
const path = require('path');

const manifestPath = path.join(process.cwd(), '.bootstrap/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const toRemove = [
  'frontend/src/components/layout/SiteHeader.tsx',
  'frontend/src/app/info/page.tsx',
  'frontend/src/lib/nav.ts',
  'frontend/src/nav/nav.generated.ts'
];

toRemove.forEach(file => {
  delete manifest.files[file];
});

manifest.files['frontend/src/components/layout/NavBar.tsx'] = {
  class: 'base',
  owner: 'base'
};

manifest.files['backend/src/routes/sec.route.ts'] = {
  class: 'injection',
  owner: 'ui_ux'
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log('Manifest reconciled successfully');
