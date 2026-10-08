// tutorial.js - guiden i övningsrundan ("Lär dig Gursch", fas 2). Gurkmannen i en pratbubbla
// förklarar varje moment första gången det händer i rundan och lyser upp det han pratar om.
//
// Stegen styrs av spelets läge (inte av händelser), så att inget missas om flera saker händer
// i samma uppdatering. Ett steg visas en gång. Medan bubblan syns är spelet pausat med
// orsaken 'tutorial' (bottar och timers väntar). Knapparna syns ändå - trycker man på ett
// drag stängs bubblan först (app.js anropar beforeAction).
//
// Steg: { id, when(c), pages(c) -> [text, …], target?: selektor, pause?: false }
// c = { S, P, me, nick(id), myTurn, has(type), action(type) }

const isFinal = (c) => {
  const lead = c.S.trick?.plays[0]?.playerId;
  return Boolean(lead) && c.S.players.find((p) => p.id === lead)?.handCount === 0;
};
const ranks = (c) => c.P.hand.map((x) => x.rank).sort((a, b) => a - b).join(',');

export const COACH_STEPS = [
  {
    id: 'welcome',
    when: (c) => c.S.phase === 'INITIAL_DISCARD',
    pages: (c) => [
      'Välkommen till övningsrundan! Du spelar mot två bottar, och det finns ingen tidsgräns för dina drag. Jag säger till när något nytt händer.',
      c.S.flopWinnerId === c.me
        ? 'Du har det högsta uppvända kortet, så du vinner floppen och börjar. Det uppvända kortet syns för alla under första slängrundan.'
        : `${c.nick(c.S.flopWinnerId)} har det högsta uppvända kortet och vinner floppen, så hen börjar.`,
    ],
    target: '#seat-me',
  },
  {
    id: 'firstDiscard',
    when: (c) => c.S.phase === 'INITIAL_DISCARD' && c.has('discard'),
    pages: (c) => [
      ranks(c) === '3,3,7,12,13'
        ? 'Titta på din hand: 3, 3 och 7:an blir tre treor, eftersom 7:an är joker. Kungen och damen är dyra att gå ut på.'
        : 'Titta på din hand: lika valörer hör ihop, och 7:an är joker. Höga kort är dyra att gå ut på.',
      c.action('discard').free
        ? 'Markera korten du vill bli av med och tryck SLÄNG. Du är först, så du bestämmer hur många (1–4) de andra ska slänga. Du kan också säga STAY, eller SLASKA och få fem helt nya kort.'
        : `Den första bestämde ${c.action('discard').count} kort. Släng lika många, säg STAY eller SLASKA och få fem helt nya kort.`,
    ],
    target: '#hand',
  },
  {
    id: 'mySlask',
    when: (c) => c.S.pendingSlask?.playerId === c.me,
    pages: () => [
      'Du slaskade! Hela handen åker i slänghögen. Först har de andra några sekunder på sig att syna, sedan får du fem nya kort.',
      'Synar någon visas din gamla hand. Fanns det face cards (J, Q, K, A) betalar du 10 kr per face card. Fanns det inga får du 25 kr.',
    ],
  },
  {
    id: 'otherSlask',
    when: (c) => c.S.pendingSlask && c.S.pendingSlask.playerId !== c.me && c.has('callSlask'),
    pages: (c) => [
      `${c.nick(c.S.pendingSlask.playerId)} slaskade! Tryck SYNA SLASK om du tror att den gamla handen hade face cards (J, Q, K, A).`,
      'Hade den det betalar slaskaren dig 10 kr per face card. Hade den inga betalar du 25 kr. Låter du bli kostar det ingenting.',
    ],
    target: '#btn-call-slask',
  },
  {
    id: 'skippedNegotiation',
    when: (c) => c.S.phase === 'NEGOTIATION' && !c.S.negotiation.participants.includes(c.me),
    pages: () => ['Du sa STAY, så du står över den första förhandlingen. Du är med igen i nästa.'],
  },
  {
    id: 'negotiation',
    when: (c) => c.S.phase === 'NEGOTIATION' && c.has('propose'),
    pages: () => [
      'Nu förhandlar alla samtidigt om hur många kort alla ska slänga. Välj 1–4 och ändra dig när du vill. Prickarna visar vad de andra vill.',
      'Visar alla samma tal i 2 sekunder slänger alla så många. Är du nöjd med handen trycker du STAY, så börjar spelet direkt.',
    ],
    target: '#actions',
  },
  {
    id: 'discardSelect',
    when: (c) => c.S.phase === 'DISCARD_SELECT' && c.has('discard'),
    pages: (c) => [`Alla var överens! Välj ${c.action('discard').count} kort att slänga. De andra ser inte vilka du väljer.`],
    target: '#hand',
  },
  {
    id: 'finalSlask',
    when: (c) => c.S.phase === 'FINAL_SLASK' && c.has('pass'),
    pages: () => ['Sista chansen att slaska innan stickspelet. PASS behåller handen.'],
    target: '#actions',
  },
  {
    id: 'lead',
    when: (c) => c.S.phase === 'TRICK' && c.has('play') && !c.S.trick?.plays.length,
    pages: () => [
      'Du spelar ut. Lägg 1–5 kort som är clean (lika valörer) eller semi-mixed (lika valörer plus 7:or). Kort som inte går att spela är gråa.',
      'Tänk framåt: korten du lägger i sista sticket blir ditt slutvärde, och högst förlorar. Bli av med de höga korten i tid.',
    ],
    target: '#hand',
  },
  {
    id: 'finalTrick',
    when: (c) => c.S.phase === 'TRICK' && c.has('play') && isFinal(c),
    pages: (c) => [`Sista sticket! ${c.nick(c.S.trick.plays[0].playerId)} gick ut, så nu går alla ut. Korten du lägger nu blir ditt slutvärde.`],
    target: '#hand',
  },
  {
    id: 'follow',
    when: (c) => c.S.phase === 'TRICK' && c.has('play') && c.S.trick?.plays.length > 0,
    pages: () => [
      'Följ med lika många kort som utspelet. Du måste inte slå. Men varje kort ska vara en 7:a, minst lika högt som utspelet eller ett av dina lägsta. Gråa kort går inte.',
      'Mixed är tillåtet när du följer, så det är ett bra tillfälle att bli av med höga kort.',
    ],
    target: '#hand',
  },
  {
    id: 'trickWon',
    when: (c) => c.S.phase === 'TRICK' && c.S.lastTrick,
    pages: (c) => [
      `${c.S.lastTrick.winnerId === c.me ? 'Du' : c.nick(c.S.lastTrick.winnerId)} vann sticket och spelar ut i nästa.`,
      'Ett senare spel tar bara över ledningen om det är minst lika högt och minst lika rent (clean slår semi-mixed). Mixed vinner aldrig.',
    ],
    target: '#trick-area',
  },
  {
    id: 'mini',
    when: (c) => c.S.phase === 'MINI_GURSCH',
    pages: () => ['Flera fick samma högsta slutvärde! De spelar en mini-gursch: 3 nya kort och högre multiplier. Den som förlorar den betalar.'],
  },
  {
    id: 'result',
    when: (c) => c.S.phase === 'ROUND_RESULT',
    pages: () => [
      'Rundan är klar! Den med högst slutvärde betalar slutvärdet × multipliern till var och en av de andra.',
      'Nu kan du Gursch. Tryck SPELA IGEN för att fortsätta mot bottarna, eller lämna och skapa ett eget spel med vänner.',
    ],
    target: '#btn-play-again',
    pause: false,
  },
];

/**
 * Kopplar in guiden. app.js anropar update() efter varje state och beforeAction() innan ett drag
 * skickas. emit(event, payload, cb) skickar till servern.
 */
export function initCoach({ $, el, emit }) {
  const box = $('coach');
  const textNode = $('coach-text');
  const stepNode = $('coach-step');
  const okBtn = $('coach-ok');
  let seen = new Set();
  let roomKey = null;
  let current = null;   // { step, pages, page }
  let paused = false;   // pausade vi spelet för det här steget?
  let marked = [];
  let ctx = null;

  const loadSeen = (key) => {
    try { return new Set(JSON.parse(sessionStorage.getItem(key) || '[]')); } catch { return new Set(); }
  };
  const saveSeen = () => {
    try { sessionStorage.setItem(roomKey, JSON.stringify([...seen])); } catch { /* lagring avstängd */ }
  };

  function unmark() {
    for (const n of marked) n.classList.remove('coach-mark');
    marked = [];
  }

  const narrow = window.matchMedia('(max-width: 560px)');
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  /**
   * Bubblan ligger överst på bordet, men på mobilen hellre nere ovanför handen, så att
   * motståndarna syns. Krockar den med det den pekar på flyttas den till den andra kanten.
   */
  function place() {
    if (box.hidden) return;
    box.style.setProperty('--coach-bottom', `${($('handbar')?.offsetHeight ?? 0) + 12}px`);
    const target = marked[0];
    let low = narrow.matches && !(target && target.closest('#handbar'));
    box.classList.toggle('coach-low', low);
    if (target && overlaps(box.getBoundingClientRect(), target.getBoundingClientRect())) {
      low = !low;
      box.classList.toggle('coach-low', low);
    }
  }
  window.addEventListener('resize', place);

  function render() {
    const { pages, page } = current;
    textNode.textContent = pages[page];
    stepNode.textContent = pages.length > 1 ? `${page + 1} / ${pages.length}` : '';
    okBtn.textContent = page < pages.length - 1 ? 'Nästa' : 'Okej';
  }

  function show(step) {
    current = { step, pages: step.pages(ctx), page: 0 };
    seen.add(step.id);
    saveSeen();
    render();
    unmark();
    const target = step.target && document.querySelector(step.target);
    if (target) { target.classList.add('coach-mark'); marked.push(target); }
    box.hidden = false;
    place();
    box.classList.remove('coach-in');
    void box.offsetWidth;   // starta om in-animationen
    box.classList.add('coach-in');
    // Pausen hålls kvar om förra steget redan pausade (stegen kan komma direkt efter varandra).
    if (step.pause !== false && !paused && !ctx.S.paused) {
      paused = true;
      emit('pauseGame', { reason: 'tutorial' }, (res) => { if (!res?.ok) paused = false; });
    }
  }

  function hide() {
    current = null;
    box.hidden = true;
    unmark();
  }

  function resume() {
    if (paused) { paused = false; emit('resumeGame'); }
  }

  /** Stänger bubblan och släpper pausen (inför ett drag, eller när guiden hoppas över). */
  function close() {
    hide();
    resume();
  }

  const nextStep = () => ctx && COACH_STEPS.find((s) => !seen.has(s.id) && s.when(ctx));

  function next() {
    if (!current) return;
    if (current.page < current.pages.length - 1) { current.page += 1; render(); place(); return; }
    hide();
    const step = nextStep();
    if (step) show(step);
    if (!current || current.step.pause === false) resume();
  }

  /** Visar nästa steg vars villkor gäller, om ingen bubbla redan syns. */
  function check() {
    if (current) return;
    const step = nextStep();
    if (step) show(step);
  }

  okBtn.onclick = next;
  $('coach-skip').onclick = () => {
    for (const s of COACH_STEPS) seen.add(s.id);
    saveSeen();
    close();
  };

  return {
    /** Anropas efter varje state. Guiden pratar bara i övningsrundans första runda. */
    update({ S, P, me, code, nick }) {
      const active = Boolean(S?.tutorial) && S.roundNumber === 1 && S.phase !== 'LOBBY';
      if (!active) { if (current) close(); ctx = null; return; }
      const key = `gursch.coach.${code}`;
      if (key !== roomKey) { roomKey = key; seen = loadSeen(key); }
      ctx = {
        S, P, me, nick,
        has: (type) => P.actions.some((a) => a.type === type),
        action: (type) => P.actions.find((a) => a.type === type),
      };
      // Pausen kan ha släppts av sig själv (3 min) - då står inget längre still för oss.
      if (paused && S.paused === null && !current) paused = false;
      check();
    },
    /** Ett drag ska skickas: stäng bubblan och fortsätt spelet först (samma socket, samma ordning). */
    beforeAction() { if (current) close(); },
    /** Lämnar övningsrundan: ingen bubbla får ligga kvar. */
    reset() { close(); ctx = null; },
  };
}
