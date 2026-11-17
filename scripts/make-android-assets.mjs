// Generates Android launcher icons (legacy, round, adaptive) and splash screens from public/logo.svg.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const req = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req(execSync('npm root -g').toString().trim() + '/playwright')); }
const RES = 'android/app/src/main/res';
const svg = readFileSync('public/logo.svg', 'utf8');
const noBg = svg.replace(/<rect width="512" height="512"[^>]*\/>/, '');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, w, h, html) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true });
}
const sized = (s, px) => s.replace('<svg ', `<svg width="${px}" height="${px}" `);
for (const [d, k] of Object.entries(densities)) {
  const L = Math.round(48 * k); const F = Math.round(108 * k);
  await render(`${RES}/mipmap-${d}/ic_launcher.png`, L, L, `<div style="width:${L}px;height:${L}px;border-radius:${L * 0.2}px;overflow:hidden">${sized(svg, L)}</div>`);
  await render(`${RES}/mipmap-${d}/ic_launcher_round.png`, L, L, `<div style="width:${L}px;height:${L}px;border-radius:50%;overflow:hidden">${sized(svg, L)}</div>`);
  const inner = Math.round(F * 0.74);
  await render(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, F, F, `<div style="width:${F}px;height:${F}px;display:grid;place-items:center">${sized(noBg, inner)}</div>`);
}
// splash screens
for (const dir of readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
  const f = `${RES}/${dir}/splash.png`;
  if (!existsSync(f)) continue;
  const dim = execSync(`python3 -c "from PIL import Image;print(*Image.open('${f}').size)"`).toString().trim().split(' ').map(Number);
  const [w, h] = dim; const s = Math.round(Math.min(w, h) * 0.32);
  await render(f, w, h, `<div style="width:${w}px;height:${h}px;background:#06213F;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Roboto,Arial,sans-serif;color:#fff">
    <div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;overflow:hidden;box-shadow:0 ${s * 0.05}px ${s * 0.2}px rgba(0,0,0,.4)">${sized(svg, s)}</div>
    <div style="margin-top:${s * 0.18}px;font-weight:700;font-size:${Math.round(s * 0.16)}px;letter-spacing:.5px">Target Planner and Tracker</div></div>`);
}
await browser.close();
console.log('Android icons & splash generated');
