// build-regler.js - gör public/regler.html av regelkapitlen i RULES.md (R1-R31).
// En statisk, sökbar sida så att Google kan visa reglerna. Kör: npm run build:regler
// "Appens regler" (A1-A7) och felrapporteringen är interna och tas inte med.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://gursch.beer';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/`(.+?)`/g, '<code>$1</code>');

const md = readFileSync(path.join(ROOT, 'RULES.md'), 'utf8');
const sections = md.split(/^## /m).slice(1)
  .map((s) => { const [title, ...rest] = s.split('\n'); return { title: title.trim(), body: rest.join('\n') }; })
  .filter((s) => !/^(Appens regler|Rapportera)/.test(s.title));

function renderBlock(block) {
  const lines = block.split('\n');
  const html = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { html.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`); list = null; } };
  for (const line of lines) {
    if (/^- /.test(line)) { flushPara(); (list ??= []).push(line.slice(2).trim()); }
    else if (list && /^\s+\S/.test(line)) list[list.length - 1] += ' ' + line.trim();
    else { flushList(); if (line.trim()) para.push(line.trim()); }
  }
  flushPara(); flushList();
  return html.join('\n');
}

const body = sections.map((s) => {
  const blocks = s.body.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b && b !== '---');
  const items = blocks.map((b) => {
    const html = renderBlock(b);
    const id = b.match(/^\*\*(R\d+)\./)?.[1];
    return id ? html.replace('<p>', `<p id="${id.toLowerCase()}">`) : html;
  }).join('\n');
  const slug = s.title.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-').replace(/^-|-$/g, '');
  return `<section id="${slug}">\n<h2>${esc(s.title)}</h2>\n${items}\n</section>`;
}).join('\n\n');

const title = 'Regler för Gursch – så spelar du kortspelet';
const description = 'Alla regler för kortspelet Gursch: giv och flop, slängförhandling, slask, stickspel, följregeln, betalning och mini-gursch. 2–5 spelare, en kortlek.';

const page = `<!doctype html>
<!-- Genereras av scripts/build-regler.js från RULES.md. Ändra inte för hand. -->
<html lang="sv">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${SITE}/regler" />
<meta name="theme-color" content="#10211b" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Gursch" />
<meta property="og:locale" content="sv_SE" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${SITE}/regler" />
<meta property="og:image" content="${SITE}/assets/og-gursch.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" href="/assets/favicon-192.png" sizes="192x192" />
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@600;700&display=swap" />
<link rel="stylesheet" href="/regler.css" />
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': `${SITE}/regler#page`, url: `${SITE}/regler`, name: title, description, inLanguage: 'sv-SE', isPartOf: { '@id': `${SITE}/#website` } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Gursch', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Regler', item: `${SITE}/regler` },
    ] },
  ],
}, null, 2)}
</script>
</head>
<body>
<header class="topp">
  <a class="varumarke" href="/">GURSCH</a>
  <a class="knapp" href="/">Spela nu</a>
</header>
<main>
<article>
<h1>Regler för Gursch</h1>
<p class="ingress">Gursch är ett kortspel för 2–5 spelare med en vanlig kortlek. Här finns alla regler, i samma ordning som de används i spelet. Vill du hellre öva direkt kan du <a href="/">spela mot bottar</a> och låta guiden visa dig hur det går till.</p>
<nav class="innehall" aria-label="Innehåll">
${sections.map((s) => `<a href="#${s.title.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-').replace(/^-|-$/g, '')}">${esc(s.title)}</a>`).join('\n')}
</nav>

${body}

<section class="cta">
<h2>Redo att spela?</h2>
<p>Skapa ett spel, dela länken med dina vänner och kör. Det är gratis och kräver ingen installation.</p>
<a class="knapp" href="/">Spela Gursch</a>
</section>
</article>
</main>
<footer><a href="/">Gursch</a> · kortspelet för 2–5 spelare · <a href="/">gursch.beer</a></footer>
</body>
</html>
`;

writeFileSync(path.join(ROOT, 'public/regler.html'), page);
console.log(`public/regler.html skriven (${sections.length} avsnitt, ${(md.match(/\*\*R\d+\./g) ?? []).length} regler i RULES.md)`);
