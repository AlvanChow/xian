// Copies the build output to the repository root, so GitHub Pages
// ("Deploy from a branch" -> main -> /root) serves it directly.
//
// index.html is still one self-contained file for the map and the scarcity
// board. humans-data.json rides beside it because the census fetches its 557
// records only when its tab is first opened — inlining them would have put ~900KB
// on every visitor's first paint for a view most never open.
import { copyFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['index.html', 'humans-data.json']) {
  const from = resolve(root, 'dist', name);
  const to = resolve(root, name);
  copyFileSync(from, to);
  console.log('postbuild: copied', from, '->', to);
}
