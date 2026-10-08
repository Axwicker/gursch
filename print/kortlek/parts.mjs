// Återanvändbara figurer: gurkmärket och kritstrecksmönstret.
import { C } from './lib.mjs';

// Gurkmärket: en liggande gurka med solglasögon, ritad så att den ser likadan ut
// vriden 180° (allt kommer i par speglade genom mitten). Längd len mm, vinkel angle°.
export function pickleBadge(cx, cy, len, angle = 0, { outline = C.black, sw = 0.55, glasses = true } = {}) {
  const L = len, W = len * 0.38, r = W / 2;
  const bumps = [[-0.29, -1], [0.04, -1], [0.31, -1]].flatMap(([t, s]) => [[t * L, s * r], [-t * L, -s * r]]);
  const br = W * 0.12;
  const nubW = W * 0.2, nubH = W * 0.24;

  const shapes = (fill, stroke, w) => {
    const a = stroke ? `fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"` : `fill="${fill}"`;
    return [
      `<rect x="${-L / 2 - nubW * 0.7}" y="${-nubH / 2}" width="${nubW * 1.4}" height="${nubH}" rx="${nubH * 0.35}" ${a}/>`,
      `<rect x="${L / 2 - nubW * 0.7}" y="${-nubH / 2}" width="${nubW * 1.4}" height="${nubH}" rx="${nubH * 0.35}" ${a}/>`,
      `<rect x="${-L / 2}" y="${-r}" width="${L}" height="${W}" rx="${r}" ${a}/>`,
      ...bumps.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${br}" ${a}/>`),
    ].join('');
  };

  const warts = [[-0.36, 0.1], [-0.17, 0.26], [0.2, -0.05]]
    .flatMap(([t, u]) => [[t * L, u * W], [-t * L, -u * W]])
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="${W * 0.06}" ry="${W * 0.045}" fill="${C.gurkaMork}"/>`)
    .join('');

  // Solglasögon mitt på gurkan: två linser, en brygga, blänk i motsatta hörn
  const lw = W * 0.62, lh = W * 0.44, gap = W * 0.16;
  const lens = (x) => `<rect x="${x - lw / 2}" y="${-lh / 2}" width="${lw}" height="${lh}" rx="${lh * 0.28}" fill="${C.black}"/>`;
  const glint = (x, y, rot) => `<rect x="${-lw * 0.18}" y="${-lh * 0.06}" width="${lw * 0.36}" height="${lh * 0.12}" fill="${C.krem}" transform="translate(${x} ${y}) rotate(${rot})"/>`;
  const gx = (lw + gap) / 2;
  const glassesSvg = glasses ? `
    <rect x="${-L / 2 + W * 0.05}" y="${-W * 0.05}" width="${L - W * 0.1}" height="${W * 0.1}" fill="${C.black}"/>
    ${lens(-gx)}${lens(gx)}
    ${glint(-gx - lw * 0.18, -lh * 0.2, -25)}${glint(gx + lw * 0.18, lh * 0.2, -25)}` : '';

  return `<g transform="translate(${cx} ${cy}) rotate(${angle})">
    ${shapes(outline, outline, sw * 2)}
    ${shapes(C.gurka)}
    <rect x="${-L * 0.4}" y="${-W * 0.17}" width="${L * 0.8}" height="${W * 0.34}" rx="${W * 0.17}" fill="${C.gurkaLjus}"/>
    ${warts}
    ${glassesSvg}
  </g>`;
}

// Kritstrecksränder över en rektangel, symmetriska kring mittlinjen x = cx
export function pinstripes(x, y, w, h, cx, { pitch = 2, width = 0.32, color = C.krita } = {}) {
  const lines = [];
  for (let dx = 0; cx - dx >= x - pitch; dx += pitch) {
    for (const lx of dx === 0 ? [cx] : [cx - dx, cx + dx]) {
      if (lx > x - width && lx < x + w + width) lines.push(`<rect x="${lx - width / 2}" y="${y}" width="${width}" height="${h}" fill="${color}"/>`);
    }
  }
  return lines.join('');
}
