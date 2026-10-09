import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

const root = resolve(here, 'toys');

// Every folder in /toys with an index.html becomes its own page at /<folder>/.
const input: Record<string, string> = { index: resolve(root, 'index.html') };
for (const name of readdirSync(root, { withFileTypes: true })) {
  const html = resolve(root, name.name, 'index.html');
  if (name.isDirectory() && existsSync(html)) input[name.name] = html;
}

export default defineConfig({
  root,
  base: './',
  resolve: { alias: { '@kit': resolve(here, 'kit') } },
  server: { fs: { allow: [here] } },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input },
  },
});
