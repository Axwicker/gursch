// learn.js - "Lär dig Gursch": ett bildspel som går igenom reglerna på ett par minuter.
// Bara text och exempel - inget skickas till servern. Varje bild hänvisar till RULES.md
// (test/learn.test.js kontrollerar att regelnumren finns där).
//
// Exempelrader: { cards: ['KS', '7H'], text, tone }  tone: 'win' (guldring) | 'lose' (röd ring)
//               { seg: { picked, dots: { tal: antal andra } }, text }  väljaren 1–4 i förhandlingen

export const LEARN_SLIDES = [
  {
    title: 'Gå ut lågt',
    text: 'Alla spelar ut sina kort i stick: en spelar ut, de andra lägger lika många kort, och det bästa vinner. '
      + 'Korten du lägger i sista sticket blir ditt slutvärde. Den med högst slutvärde förlorar och betalar '
      + 'slutvärdet × multipliern (rummets insats, till exempel ×10) till var och en av de andra.',
    rows: [
      { cards: ['2C', '7H'], text: 'Två tvåor (7:an är joker): 2 × 2 = 4. Billigt.', tone: 'win' },
      { cards: ['KS', 'KD'], text: '13 × 2 = 26. Dyrt.', tone: 'lose' },
    ],
    rules: ['R26', 'R28'],
  },
  {
    title: 'Given och floppen',
    text: 'Alla får fyra dolda kort och ett femte uppvänt. Den som har det högsta uppvända kortet vinner floppen och börjar. '
      + '2 är lägst, sedan 3–10, J, Q, K och högst A.',
    rows: [
      { cards: ['9D'], text: 'Bengt' },
      { cards: ['QS'], text: 'Du vinner floppen', tone: 'win' },
      { cards: ['4H'], text: 'Greta' },
    ],
    rules: ['R3', 'R4', 'R5'],
  },
  {
    title: '7:an är joker',
    text: 'I en kombination blir 7:an det du behöver. Lika valörer är clean, lika valörer plus 7:or är semi-mixed '
      + 'och allt annat är mixed. En ensam 7:a i ett stick är lika stark som ett ess.',
    rows: [
      { cards: ['KS', '7H'], text: 'Två kungar (semi-mixed)' },
      { cards: ['2C', '2D', '7S'], text: 'Tre tvåor (semi-mixed)' },
      { cards: ['5H', '9C'], text: 'Mixed' },
    ],
    rules: ['R7', 'R8'],
  },
  {
    title: 'Släng och förhandla',
    text: 'Först slänger man i tur och ordning. Den första som slänger bestämmer hur många kort (1–4), och de andra '
      + 'slänger lika många eller säger STAY och behåller sina kort. Sedan förhandlar alla samtidigt: välj 1–4 och ändra dig när du vill. '
      + 'Visar alla samma tal i 2 sekunder slänger alla så många, och en ny förhandling börjar. '
      + 'STAY, eller att tiden tar slut, startar spelet.',
    rows: [
      { seg: { picked: 2, dots: { 2: 1, 3: 1 } }, text: 'Du vill 2, en vill 2, en vill 3. Inte överens än.' },
      { seg: { picked: 2, dots: { 2: 2 } }, text: 'Alla vill 2. Alla slänger två kort.', tone: 'win' },
    ],
    rules: ['R9', 'R13', 'R14', 'R15'],
  },
  {
    title: 'Slask',
    text: 'På din tur kan du slaska: hela handen åker i slänghögen och du får fem nya kort. De andra har några sekunder på sig att syna. '
      + 'Fanns det face cards (J, Q, K, A) i den gamla handen betalar du 10 kr per face card till den som synade. '
      + 'Fanns det inga får du 25 kr. Innan stickspelet får alla en sista chans att slaska.',
    rows: [
      { cards: ['2C', '4D', '5S', '9H', 'JC'], text: 'Synad: du betalar 10 kr (en knekt)', tone: 'lose' },
      { cards: ['2C', '4D', '5S', '9H', '10C'], text: 'Synad: du får 25 kr', tone: 'win' },
    ],
    rules: ['R17', 'R18', 'R19', 'R20'],
  },
  {
    title: 'Stickspelet',
    text: 'Flopvinnaren spelar ut först: 1–5 kort som är clean eller semi-mixed. Alla andra lägger lika många kort. '
      + 'Den som vinner sticket spelar ut i nästa.',
    rows: [
      { cards: ['QS', 'QH'], text: 'Utspel: två damer' },
      { cards: ['4C', 'KD'], text: 'Följ med två kort. Får vara mixed.' },
    ],
    rules: ['R21', 'R22', 'R23'],
  },
  {
    title: 'Följregeln',
    text: 'Du måste inte slå. Men varje kort du lägger måste vara en 7:a, minst lika högt som utspelet '
      + 'eller ett av dina lägsta kort. Med 7, 9, K och A på handen mot två damer:',
    rows: [
      { cards: ['7S', '9D'], text: 'Går: 7:an är fri och 9:an är lägst av resten', tone: 'win' },
      { cards: ['KC', '9D'], text: 'Går inte: 7:an ligger kvar och är lägre än 9:an', tone: 'lose' },
    ],
    rules: ['R24'],
  },
  {
    title: 'Vem vinner sticket?',
    text: 'Ett senare spel tar över bara om det är minst lika högt och minst lika rent (clean slår semi-mixed), '
      + 'och bättre i något av dem. Mixed vinner aldrig. Är två semi-mixed lika höga vinner den med färst 7:or, annars den som lade sist.',
    rows: [
      { cards: ['8C', '8H'], text: 'Utspel: två åttor (clean)' },
      { cards: ['AS', '7D'], text: 'Tar inte över: högre, men semi-mixed är mindre rent' },
      { cards: ['KS', 'KH'], text: 'Tar över: högre och lika rent', tone: 'win' },
    ],
    rules: ['R25'],
  },
  {
    title: 'Sista sticket',
    text: 'Alla har lika många kort. Lägger den som spelar ut alla sina kort är det sista sticket, och då går alla ut. '
      + 'Clean och semi-mixed räknas som värdet × antal kort, mixed som summan (7:an räknas då som 7). '
      + 'Spelar någon ut fem lika slutar rundan direkt. Har flera samma högsta värde spelar de en mini-gursch med högre multiplier.',
    rows: [
      { cards: ['3C', '3H'], text: '3 × 2 = 6' },
      { cards: ['JD', '7S'], text: 'Två knektar: 11 × 2 = 22', tone: 'lose' },
      { cards: ['5C', '9D'], text: 'Mixed: 5 + 9 = 14' },
    ],
    rules: ['R26', 'R27', 'R29'],
    outro: 'Nu testar vi! I övningsrundan säger jag till när något nytt händer.',
  },
];

const RANKS = { J: 11, Q: 12, K: 13, A: 14 };
/** 'KS' -> { rank: 13, suit: 'S' }, '10H' -> { rank: 10, suit: 'H' } */
export function parseCard(code) {
  const label = code.slice(0, -1);
  return { rank: RANKS[label] ?? Number(label), suit: code.slice(-1) };
}

/**
 * Kopplar in bildspelet. app.js skickar in sina egna hjälpfunktioner, så att korten och dialogen
 * ser ut och beter sig som i resten av spelet.
 */
export function initLearn({ $, el, cardNode, openDialog, closeDialog, onPlay }) {
  const dialog = $('learn-overlay');
  const stage = $('learn-stage');
  const dots = $('learn-dots');
  const prev = $('learn-prev');
  const next = $('learn-next');
  const play = $('learn-play');
  let index = 0;
  let inGame = false;   // öppnat från toppraden mitt i ett spel: sista bilden har Stäng i stället för Öva
  const dotNodes = LEARN_SLIDES.map((s, i) => {
    const b = el('button', 'learn-dot');
    b.type = 'button';
    b.setAttribute('aria-label', `Bild ${i + 1}: ${s.title}`);
    b.onclick = () => show(i);
    dots.append(b);
    return b;
  });

  function rowNode(row, r) {
    const n = el('div', `learn-row ${row.tone ? `learn-${row.tone}` : ''}`);
    if (row.cards) {
      const cards = el('div', 'learn-cards');
      row.cards.forEach((code, i) => cards.append(cardNode({ id: `learn-${r}-${i}`, ...parseCard(code) })));
      n.append(cards);
    }
    if (row.seg) {
      // Samma väljare som i förhandlingen, men bara som bild
      const seg = el('div', 'gk-seg gk-seg-siffror learn-seg');
      seg.setAttribute('aria-hidden', 'true');
      for (let v = 1; v <= 4; v++) {
        const opt = el('span', 'gk-seg-val', String(v));
        opt.setAttribute('aria-pressed', String(v === row.seg.picked));
        const others = row.seg.dots?.[v] ?? 0;
        if (others) {
          const p = el('span', 'gk-prickar');
          for (let i = 0; i < others; i++) p.append(el('span'));
          opt.append(p);
        }
        seg.append(opt);
      }
      n.append(seg);
    }
    n.append(el('p', 'learn-row-text', row.text));
    return n;
  }

  function show(i, dir = 0) {
    index = Math.max(0, Math.min(LEARN_SLIDES.length - 1, i));
    const s = LEARN_SLIDES[index];
    const last = index === LEARN_SLIDES.length - 1;
    $('learn-step').textContent = `${index + 1} / ${LEARN_SLIDES.length}`;
    $('learn-title').textContent = s.title;
    $('learn-text').textContent = s.outro && !inGame ? `${s.text} ${s.outro}` : s.text;
    $('learn-rules').textContent = `Regel ${s.rules.join(' · ')}`;
    const ex = $('learn-examples');
    ex.replaceChildren(...s.rows.map(rowNode));
    dotNodes.forEach((d, k) => d.setAttribute('aria-current', String(k === index)));
    prev.disabled = index === 0;
    next.hidden = last;
    play.hidden = !last;
    if (dir && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stage.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  const step = (d) => show(index + d, d);
  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  $('learn-close').onclick = () => closeDialog(dialog);
  play.onclick = () => { closeDialog(dialog); if (!inGame) onPlay(); };

  dialog.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight' && index < LEARN_SLIDES.length - 1) { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); step(-1); }
  });

  // Svep åt sidan på mobilen
  let swipe = null;
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') swipe = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && index < LEARN_SLIDES.length - 1) step(1);
    if (dx > 0 && index > 0) step(-1);
  });
  stage.addEventListener('pointercancel', () => { swipe = null; });

  return {
    /** inGame: öppnat under ett spel (Regler i toppraden) - då leder sista bilden inte till en ny runda. */
    open({ inGame: game = false } = {}) {
      inGame = game;
      play.textContent = inGame ? 'Stäng' : 'Öva en runda';
      show(0);
      openDialog(dialog, next);
    },
  };
}
