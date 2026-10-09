#!/usr/bin/env node
/**
 * npm run new -- <slug> "<title>" "<one-line description>"
 * Copies templates/blank to toys/<slug>/ and fills in the placeholders.
 */
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [slug, title = slug, description = ''] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('usage: npm run new -- <slug> "<title>" "<description>"   (slug: lowercase, digits, dashes)');
  process.exit(2);
}
const dest = resolve('toys', slug);
if (existsSync(dest)) {
  console.error(`toys/${slug} already exists`);
  process.exit(1);
}
cpSync(resolve('templates/blank'), dest, { recursive: true });
const escHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const escTs = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
for (const f of readdirSync(dest)) {
  const p = join(dest, f);
  const esc = f.endsWith('.html') ? escHtml : escTs;
  const s = readFileSync(p, 'utf8')
    .replaceAll('__SLUG__', slug)
    .replaceAll('__TITLE__', esc(title))
    .replaceAll('__DESCRIPTION__', esc(description));
  writeFileSync(p, s);
}
console.log(`created toys/${slug}/ — run: npm run dev, then open /${slug}/`);
