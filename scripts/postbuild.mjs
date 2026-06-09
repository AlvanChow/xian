// Copies the single inlined build output to the repository root as index.html,
// so GitHub Pages ("Deploy from a branch" -> main -> /root) serves it directly.
import { copyFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'dist/index.html');
const to = resolve(root, 'index.html');
copyFileSync(from, to);
console.log('postbuild: copied', from, '->', to);
