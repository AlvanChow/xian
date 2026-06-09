import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));

// Vite serves from `src` (dev server with hot reload). The production build
// inlines all CSS/JS into one self-contained HTML file in `dist`, which the
// postbuild step copies to the repo root as index.html for GitHub Pages.
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
  },
});
