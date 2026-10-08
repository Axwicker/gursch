// Gemensamma mått, färger och former för den tryckta Gursch-leken.
// Allt ritas i millimeter: viewBox 0 0 69 94 = pokerkort 63 × 88 mm plus 3 mm utfall runt om.

export const MM = {
  W: 69, H: 94,          // med utfall
  TRIM_W: 63, TRIM_H: 88,
  BLEED: 3,
  SAFE: 3,               // säkerhetsmarginal innanför skärlinjen
  RADIUS: 3,             // hörnradie på det skurna kortet
  CX: 34.5, CY: 47,
};

// Skärlinje och säkerhetsyta i viewBox-koordinater
export const TRIM = { x: MM.BLEED, y: MM.BLEED, w: MM.TRIM_W, h: MM.TRIM_H };
export const SAFE = { x: MM.BLEED + MM.SAFE, y: MM.BLEED + MM.SAFE, w: MM.TRIM_W - 2 * MM.SAFE, h: MM.TRIM_H - 2 * MM.SAFE };

export const C = {
  grund: '#10211b',
  black: '#0a1612',
  filt: '#1f3d30',
  krem: '#f0e8cc',
  papper: '#fbf7e9',
  linje: '#d6cdaf',
  guld: '#c9a55a',
  mahogny: '#3a2419',
  kortrod: '#b3362c',
  rodVarning: '#c05a48',
  // Kritstreck: kräm blandad 30 % i Grund, som fast färg (ingen transparens i trycket)
  krita: '#5a6d60',
  // Gurkans egna toner, tagna från maskoten
  gurka: '#4f7353',
  gurkaLjus: '#6a9168',
  gurkaMork: '#33513a',
};

// Bilder från designsystemet (design-handoff/assets) som fil-URL
export const asset = (file) => new URL(`../../design-handoff/assets/${file}`, import.meta.url).href;

// Färgsymboler i en 100 × 100-ruta, centrerade kring (50, 50)
export const SUIT_PATH = {
  hjarter: 'M50 94 C 22 70 3 52 3 31 C 3 14 15 4 29 4 C 39 4 46 10 50 20 C 54 10 61 4 71 4 C 85 4 97 14 97 31 C 97 52 78 70 50 94 Z',
  ruter: 'M50 2 Q 68 28 88 50 Q 68 72 50 98 Q 32 72 12 50 Q 32 28 50 2 Z',
  spader: 'M50 3 C 74 25 97 42 97 62 C 97 76 87 85 75 85 C 66 85 59 81 55 74 C 56 84 60 91 67 97 L 33 97 C 40 91 44 84 45 74 C 41 81 34 85 25 85 C 13 85 3 76 3 62 C 3 42 26 25 50 3 Z',
  klover: 'M50 5 A 20 20 0 0 1 66.5 36.4 A 20 20 0 1 1 55 74 C 56 84 60 91 67 97 L 33 97 C 40 91 44 84 45 74 A 20 20 0 1 1 33.5 36.4 A 20 20 0 0 1 50 5 Z',
};

export const SUIT_COLOR = { hjarter: 'kortrod', ruter: 'kortrod', spader: 'black', klover: 'black' };

// En färgsymbol med mitten i (x, y) och höjden h mm
export function pip(suit, x, y, h, fill, rotate = 0) {
  const s = h / 100;
  return `<path d="${SUIT_PATH[suit]}" fill="${fill}" transform="translate(${x} ${y}) rotate(${rotate}) scale(${s}) translate(-50 -50)"/>`;
}

export function fontFaces(base = './fonts/') {
  const f = (family, file, weight) =>
    `@font-face{font-family:'${family}';src:url('${base}${file}') format('woff2');font-weight:${weight};font-style:normal;}`;
  return [
    f('Alfa Slab One', 'alfa-slab-one-latin-400-normal.woff2', 400),
    f('Barlow Condensed', 'barlow-condensed-latin-600-normal.woff2', 600),
    f('Barlow Condensed', 'barlow-condensed-latin-700-normal.woff2', 700),
    f('Barlow', 'barlow-latin-400-normal.woff2', 400),
    f('Barlow', 'barlow-latin-500-normal.woff2', 500),
    f('Barlow', 'barlow-latin-600-normal.woff2', 600),
    f('Barlow', 'barlow-latin-700-normal.woff2', 700),
  ].join('\n');
}

// Hjälplinjer för korrektur: skärlinje (röd), säkerhetsmarginal (blå streckad)
export function guides() {
  return `<g fill="none" stroke-width="0.25">
    <rect x="${TRIM.x}" y="${TRIM.y}" width="${TRIM.w}" height="${TRIM.h}" rx="${MM.RADIUS}" stroke="#ff2d55"/>
    <rect x="${SAFE.x}" y="${SAFE.y}" width="${SAFE.w}" height="${SAFE.h}" stroke="#2d8cff" stroke-dasharray="1 0.8"/>
  </g>`;
}

export function svg(inner, { withGuides = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MM.W} ${MM.H}" width="${MM.W}mm" height="${MM.H}mm">
${inner}
${withGuides ? guides() : ''}
</svg>`;
}
