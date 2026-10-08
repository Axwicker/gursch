// Bygger korten till tryckfiler.
//   node print/kortlek/build.mjs [kortnamn ...]
// Skriver till print/kortlek/ut/:
//   <namn>.pdf          vektor-PDF 69 × 94 mm (med utfall), typsnitten inbäddade – den här skickas till tryckeriet
//   <namn>.png          300 dpi, 815 × 1110 px, med utfall
//   <namn>-korrektur.png samma, med skärlinje (röd) och säkerhetsmarginal (blå) inritade
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { MM, svg, fontFaces } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'ut');
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const CARDS = {
  baksida: () => import('./cards/back.mjs').then((m) => m.default()),
};

const DPI = Number(process.env.DPI || 300);
const px = (mm) => Math.round((mm / 25.4) * DPI);

function page(inner, withGuides) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces(pathToFileURL(join(here, 'fonts')).href + '/')}
@page{size:${MM.W}mm ${MM.H}mm;margin:0}
html,body{margin:0;padding:0;background:#fff}
svg{display:block;width:100vw;height:100vh}
</style></head><body>${svg(inner, { withGuides })}</body></html>`;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CARDS);
const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: px(MM.W), height: px(MM.H) } });
const p = await ctx.newPage();

for (const name of names) {
  const inner = await CARDS[name]();
  for (const g of [false, true]) {
    const file = join(out, `${name}${g ? '-korrektur' : ''}.html`);
    writeFileSync(file, page(inner, g));
    await p.goto(pathToFileURL(file).href);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: file.replace(/\.html$/, '.png') });
    if (!g) await p.pdf({ path: file.replace(/\.html$/, '.pdf'), width: `${MM.W}mm`, height: `${MM.H}mm`, printBackground: true });
  }
  console.log('klar:', name);
}
await browser.close();
