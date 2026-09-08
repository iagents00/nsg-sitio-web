import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = import.meta.dirname;
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
for (const page of ['index', 'portafolio', 'diagnostico']) {
  let html = await readFile(resolve(root, page + '.html'), 'utf8');
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (!match[1]?.includes('application/ld+json')) new vm.Script(match[2], { filename: page + '.html' });
  }
  // Preserve asset resolution both with and without a trailing slash.
  html = html.replace(/((?:src|href)=["'])assets\//g, '$1/assets/');
  await writeFile(resolve(output, page + '.html'), html);
  if (page !== 'index') {
    await mkdir(resolve(output, page), { recursive: true });
    await writeFile(resolve(output, page, 'index.html'), html);
  }
}
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });
for (const file of ['robots.txt', 'sitemap.xml', 'site.webmanifest']) await copyFile(resolve(root, file), resolve(output, file));
console.log('Build complete: home, portfolio, standalone diagnostic and assets.');
