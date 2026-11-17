// Renders public/logo.svg into PNG icons (PWA + Android) using the preinstalled Playwright Chromium.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req(execSync('npm root -g').toString().trim() + '/playwright')); }
import { readFileSync, mkdirSync } from 'node:fs';
const svg = readFileSync(new URL('../public/logo.svg', import.meta.url), 'utf8');
const out = [
  ['public/icons/icon-192.png', 192, 0], ['public/icons/icon-512.png', 512, 0],
  ['public/icons/maskable-512.png', 512, 0], ['public/icons/apple-touch-icon.png', 180, 0],
  ['public/favicon-64.png', 64, 0], ['assets/icon-only.png', 1024, 0],
  ['assets/icon-foreground.png', 1024, 0.18], ['public/icons/icon-round-512.png', 512, 'round'],
];
mkdirSync('assets', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  const radius = pad === 'round' ? '50%' : '0';
  const inner = typeof pad === 'number' ? size * (1 - pad * 2) : size;
  const bg = file.includes('foreground') ? 'transparent' : '#06213F';
  await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px;overflow:hidden">
    <div style="width:${inner}px;height:${inner}px;border-radius:${radius};overflow:hidden">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
  console.log('wrote', file);
}
await browser.close();
