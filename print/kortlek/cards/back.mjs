// Kortbaksidan. Hela motivet är en övre halva plus samma halva vriden 180°,
// så baksidan ser likadan ut åt båda hållen.
import { MM, C, pip, asset } from '../lib.mjs';
import { pinstripes } from '../parts.mjs';

export default function back() {
  const { W, H, CX, CY } = MM;

  // Krämfärgad ram helt innanför säkerhetsmarginalen (3,5 mm från skärlinjen),
  // så att en snedskuren ark inte syns som en ojämn kant.
  const fo = 6.5;                    // ramens ytterkant från utfallets kant
  const band = 1.3;
  const fi = fo + band;              // fältets kant
  const field = { x: fi, y: fi, w: W - 2 * fi, h: H - 2 * fi };

  // Medaljongen i mitten: en åttkant med avfasade hörn (art déco), maffiagurkan i varje halva
  const mw = 15.5, mh = 23.2, ch = 4.2;
  const octagon = (k) => {
    const w = mw - k, h = mh - k, c = ch - k * 0.41;
    return `M${CX - w + c} ${CY - h} H${CX + w - c} L${CX + w} ${CY - h + c} V${CY + h - c} L${CX + w - c} ${CY + h} H${CX - w + c} L${CX - w} ${CY + h - c} V${CY - h + c} Z`;
  };
  // Märket är 740 × 962 px; 26 mm brett. Hattkullen hamnar 1,7 mm under medaljongens kant
  // och mittlinjen skär genom slipsknuten.
  const iw = 26, ih = iw * 962 / 740;
  const head = `<image href="${asset('gursch-marke.png')}" x="${CX - iw / 2 - 0.6}" y="${CY - mh + 1.7 - iw * 56 / 740}" width="${iw}" height="${ih}" preserveAspectRatio="none"/>`;

  // Halva motivet (överdelen) – ritas två gånger
  const half = `
    <rect x="${CX - 15}" y="13.2" width="30" height="8.6" rx="0.6" fill="${C.black}" stroke="${C.krem}" stroke-width="0.45"/>
    <rect x="${CX - 13.9}" y="14.3" width="27.8" height="6.4" rx="0.3" fill="none" stroke="${C.guld}" stroke-width="0.22"/>
    <text x="${CX + 0.35}" y="19.95" text-anchor="middle" font-family="Alfa Slab One" font-size="5.6" letter-spacing="0.35" fill="${C.black}">GURSCH</text>
    <text x="${CX}" y="19.6" text-anchor="middle" font-family="Alfa Slab One" font-size="5.6" letter-spacing="0.35" fill="${C.guld}">GURSCH</text>
    ${pip('spader', field.x + 3.4, field.y + 3.6, 3.4, C.guld)}
    ${pip('hjarter', field.x + field.w - 3.4, field.y + 3.6, 3.2, C.guld)}
    <g clip-path="url(#cameo)"><g clip-path="url(#upper)">${head}</g></g>
  `;

  return `
  <rect width="${W}" height="${H}" fill="${C.filt}"/>
  <rect x="${field.x}" y="${field.y}" width="${field.w}" height="${field.h}" fill="${C.grund}"/>
  <clipPath id="upper"><rect x="0" y="0" width="${W}" height="${CY}"/></clipPath>
  <clipPath id="cameo"><path d="${octagon(1.2)}"/></clipPath>
  <clipPath id="field"><rect x="${field.x}" y="${field.y}" width="${field.w}" height="${field.h}"/></clipPath>
  <g clip-path="url(#field)">${pinstripes(field.x, field.y, field.w, field.h, CX)}</g>

  <!-- ram: bläcklinje, krämband, bläcklinje, guldlinje innanför -->
  <rect x="${fo + band / 2}" y="${fo + band / 2}" width="${W - 2 * fo - band}" height="${H - 2 * fo - band}" rx="1.4" fill="none" stroke="${C.krem}" stroke-width="${band}"/>
  <rect x="${fo}" y="${fo}" width="${W - 2 * fo}" height="${H - 2 * fo}" rx="1.9" fill="none" stroke="${C.black}" stroke-width="0.3"/>
  <rect x="${fi}" y="${fi}" width="${W - 2 * fi}" height="${H - 2 * fi}" rx="0.9" fill="none" stroke="${C.black}" stroke-width="0.3"/>
  <rect x="${fi + 1}" y="${fi + 1}" width="${W - 2 * fi - 2}" height="${H - 2 * fi - 2}" fill="none" stroke="${C.guld}" stroke-width="0.25"/>

  <!-- medaljongen: bläckkant, papper, gubbarna, guldlinje -->
  <path d="${octagon(-0.6)}" fill="${C.black}"/>
  <path d="${octagon(0)}" fill="${C.papper}" stroke="${C.krem}" stroke-width="0"/>
  <g clip-path="url(#cameo)">
    <path d="${octagon(0)}" fill="${C.papper}"/>
    ${pinstripes(CX - mw, CY - mh, 2 * mw, 2 * mh, CX, { pitch: 2, width: 0.25, color: C.krem })}
  </g>

  ${half}
  <g transform="rotate(180 ${CX} ${CY})">${half}</g>

  <path d="${octagon(0.9)}" fill="none" stroke="${C.guld}" stroke-width="0.3"/>
  <rect x="${CX - mw}" y="${CY - 0.35}" width="${2 * mw}" height="0.7" fill="${C.black}"/>
  <rect x="${CX - mw}" y="${CY - 0.1}" width="${2 * mw}" height="0.2" fill="${C.guld}"/>
  `;
}
