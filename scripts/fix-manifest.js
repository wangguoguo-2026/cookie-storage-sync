// C:\Users\2025\Desktop\yryLogin\scripts\fix-manifest.js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(__dirname, '..', 'dist', 'manifest.json');

if (!existsSync(manifestPath)) {
    console.error('dist/manifest.json not found. Run build first.');
    process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

if (manifest.web_accessible_resources) {
    manifest.web_accessible_resources.forEach((resource) => {
        delete resource.use_dynamic_url;
    });
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Fixed: removed use_dynamic_url from web_accessible_resources');
