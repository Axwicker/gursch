// build-regler.js - gör public/regler.html av regelkapitlen i RULES.md (R1-R31).
// En statisk, sökbar sida så att Google kan visa reglerna. Kör: npm run build:regler
// "Appens regler" (A1-A7) och felrapporteringen är interna och tas inte med.
//
// Skriver också public/llms.txt och public/llms-full.txt. De är till för AI-sökmotorer
// (ChatGPT, Claude, Perplexity m.fl.): en kort beskrivning av sajten och reglerna som ren text.
// KORT_OM och FAQ nedan är sammanfattningar av RULES.md. Ändras en regel som nämns där
// måste texten här ändras också.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

// Senaste ändringen av reglerna, enligt git. Visas på sidan och i den strukturerade datan.
let uppdaterad;
// Är filerna ändrade men inte incheckade gäller dagens datum.
try {
  const filer = ['RULES.md', 'scripts/build-regler.js'];
  const git = (...args) => execFileSync('git', [...args, '--', ...filer], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!git('status', '--porcelain')) uppdaterad = git('log', '-1', '--format=%cs');
} catch { /* inget git */ }
uppdaterad ||= new Date().toISOString().slice(0, 10);
const uppdateradText = new Date(`${uppdaterad}T12:00:00Z`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Snabbfakta: korta, fristående påståenden som går att citera rakt av.
const KORT_OM = [
  ['Typ', 'Kortspel med stick, där man först slänger och drar nya kort'],
  ['Spelare', '2–5'],
  ['Kortlek', 'En vanlig kortlek med 52 kort, utan jokrar. Färgerna saknar betydelse'],
  ['Kort på handen', '5 (fyra dolda och ett uppvänt)'],
  ['Mål', 'Att gå ut på så lågt slutvärde som möjligt. Den med högst slutvärde förlorar rundan'],
  ['Specialkort', '7:an är joker i kombinationer'],
  ['Spela online', 'Gratis på gursch.beer, i webbläsaren, med vänner eller mot bottar'],
];

// Vanliga frågor. Varje svar ska gå att läsa utan resten av sidan.
const FAQ = [
  ['Vad är Gursch?',
    'Gursch är ett kortspel för 2–5 spelare som spelas med en vanlig kortlek med 52 kort. Varje spelare får fem kort, byter kort i en eller flera slängrundor och spelar sedan ut handen i stick. Den som går ut på det högsta slutvärdet förlorar rundan och betalar de andra.'],
  ['Hur många kan spela Gursch?',
    'Gursch spelas av 2–5 spelare med en enda kortlek.'],
  ['Vad går Gursch ut på?',
    'Målet i Gursch är att ha så lågt slutvärde som möjligt när rundan är slut. Slutvärdet räknas på korten man lägger i sista sticket. Den med högst slutvärde förlorar och betalar slutvärdet gånger rundans multiplier till varje annan spelare.'],
  ['Hur går en runda i Gursch till?',
    'En runda i Gursch har fyra delar. Först delas fem kort ut, och den med det högsta uppvända kortet vinner floppen och får börja. Sedan slänger spelarna kort och drar nya, först i tur och ordning och därefter i förhandlingar där alla måste vara överens om antalet. Efter det spelas alla kort ut i stick. Till sist räknas slutvärdet, och den med högst slutvärde betalar de andra.'],
  ['Vad gör 7:an i Gursch?',
    '7:an är joker i kombinationer i Gursch: kung och 7:a räknas som två kungar. En ensam 7:a är lika stark som ett ess i sticket, men den räknas som 7 i slutvärdet.'],
  ['Måste man slå i Gursch?',
    'Nej, man måste inte slå i Gursch. Enligt följregeln ska varje kort man lägger vara en 7:a, minst lika högt som utspelet eller ett av ens lägsta kort. Alla lägger lika många kort som utspelet.'],
  ['Vad är en slask i Gursch?',
    'En slask i Gursch är att lägga hela handen i slänghögen och få fem nya kort. De andra spelarna kan syna slasken inom 7 sekunder. Fanns det knekt, dam, kung eller ess i den gamla handen betalar slaskaren 10 kr per sådant kort till den som synade, annars betalar den som synade 25 kr till slaskaren. Man får slaska högst tre gånger per runda.'],
  ['Vad händer om man spelar ut fem lika i Gursch?',
    'Den som spelar ut fem lika i Gursch, även med 7:or som jokrar, går ut direkt och rundan tar slut. De andras slutvärde blir då hela deras hand. Fem lika räknas som ett vanligt slutvärde, till exempel 65 för fem kungar, så den som går ut på det kan ändå förlora.'],
  ['Vad är en mini-gursch?',
    'En mini-gursch är ett särspel i Gursch när flera spelare har samma högsta slutvärde. De som är lika får tre kort var ur en ny lek och spelar ett kort stickspel. Multipliern gångras med antalet deltagare, och förloraren betalar sitt slutvärde i mini-gurschen gånger den höjda multipliern.'],
  ['Kan man spela Gursch online?',
    'Ja, Gursch går att spela gratis online på gursch.beer. Spelet körs i webbläsaren utan installation. Man skapar ett spel och delar en länk med sina vänner, eller spelar mot bottar. En övningsrunda med guide lär ut reglerna.'],
  ['Spelar man Gursch om riktiga pengar?',
    'Nej, på gursch.beer är kronorna bara spelets poängräkning. Alla börjar på 0 kr, saldot kan bli negativt och inga riktiga pengar hanteras.'],
  ['Heter det Gursch eller Gurch?',
    'Spelet heter Gursch. Stavningen Gurch förekommer också och syftar på samma kortspel.'],
];

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
    { '@type': 'WebPage', '@id': `${SITE}/regler#page`, url: `${SITE}/regler`, name: title, description, inLanguage: 'sv-SE', dateModified: uppdaterad, isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': `${SITE}/#spel` } },
    { '@type': 'Game', '@id': `${SITE}/#spel`, name: 'Gursch', alternateName: 'Gurch', url: `${SITE}/`, inLanguage: 'sv-SE',
      description: 'Kortspel för 2–5 spelare med en vanlig kortlek. Man slänger och drar kort, spelar ut handen i stick, och den som går ut på högst slutvärde förlorar rundan.',
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5 },
      gameItem: { '@type': 'Thing', name: 'Kortlek med 52 kort' } },
    { '@type': 'FAQPage', '@id': `${SITE}/regler#faq`, inLanguage: 'sv-SE', mainEntity: FAQ.map(([q, a]) => (
      { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
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
<p class="ingress">Gursch (ibland stavat Gurch) är ett kortspel för 2–5 spelare med en vanlig kortlek, med gurkan Gurkan som maskot. Här finns alla regler, i samma ordning som de används i spelet. Vill du hellre öva direkt kan du <a href="/">spela mot bottar</a> och låta guiden visa dig hur det går till.</p>
<p class="uppdaterad">Senast uppdaterad <time datetime="${uppdaterad}">${uppdateradText}</time></p>
<nav class="innehall" aria-label="Innehåll">
<a href="#kort-om-gursch">Kort om Gursch</a>
${sections.map((s) => `<a href="#${s.title.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-').replace(/^-|-$/g, '')}">${esc(s.title)}</a>`).join('\n')}
<a href="#vanliga-fragor">Vanliga frågor</a>
</nav>

<section id="kort-om-gursch">
<h2>Kort om Gursch</h2>
<dl class="fakta">
${KORT_OM.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('\n')}
</dl>
</section>

${body}

<section id="vanliga-fragor">
<h2>Vanliga frågor om Gursch</h2>
${FAQ.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n')}
</section>

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

// ---- llms.txt: kort vägvisare för AI-sökmotorer (formatet från llmstxt.org) ----
const llms = `# Gursch

> Gursch (ibland stavat Gurch) är ett kortspel för 2–5 spelare med en vanlig kortlek med 52 kort. På gursch.beer går det att spela gratis i webbläsaren, med vänner via en länk eller mot bottar. Sajten är på svenska.

${KORT_OM.map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Reglerna senast uppdaterade ${uppdaterad}.

## Sidor

- [Spela Gursch](${SITE}/): Startsidan. Skapa ett spel och dela länken, gå med i ett spel med en kod, eller spela en övningsrunda mot bottar med en guide.
- [Regler för Gursch](${SITE}/regler): Alla regler (R1–R31) i den ordning de används, med vanliga frågor.

## Fulltext

- [Reglerna som ren text](${SITE}/llms-full.txt): Hela regelboken och vanliga frågor i Markdown.

## Övrigt

- [Källkoden på GitHub](https://github.com/Axwicker/gursch): Spelets server och klient. Servern avgör alla drag.
`;
writeFileSync(path.join(ROOT, 'public/llms.txt'), llms);

const llmsFull = `# Gursch – regler

> Gursch (ibland stavat Gurch) är ett kortspel för 2–5 spelare med en vanlig kortlek med 52 kort. Spela gratis på ${SITE}/. Den här filen är reglerna från ${SITE}/regler som ren text. Senast uppdaterad ${uppdaterad}.

## Kort om Gursch

${KORT_OM.map(([k, v]) => `- ${k}: ${v}`).join('\n')}

${sections.map((s) => `## ${s.title}\n\n${s.body.replace(/\n---\s*$/m, '').trim()}`).join('\n\n')}

## Vanliga frågor

${FAQ.map(([q, a]) => `### ${q}\n\n${a}`).join('\n\n')}
`;
writeFileSync(path.join(ROOT, 'public/llms-full.txt'), llmsFull);

// ---- sitemap.xml: lastmod visar sökmotorerna när reglerna ändrades ----
writeFileSync(path.join(ROOT, 'public/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}/regler</loc>
    <lastmod>${uppdaterad}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`);
console.log(`public/regler.html skriven (${sections.length} avsnitt, ${(md.match(/\*\*R\d+\./g) ?? []).length} regler i RULES.md)`);
