// tutorial.js - övningsrundan ("Lär dig Gursch", fas 2). En vanlig runda mot två lätta bottar,
// men med riggad första giv, ingen turtimer och bottar som synar spelarens slask högst en gång.
// Guiden (public/tutorial.js) pratar och pausar spelet med orsaken 'tutorial'.

export const TUTORIAL_BOTS = 2;
export const TUTORIAL_BOT_LEVEL = 'easy';
export const TUTORIAL_SLASK_CALLS = 1;   // bottarna synar spelarens slask en gång, sedan aldrig

export const TUTORIAL_SETTINGS = {
  multiplierMode: 'fixed',
  multiplierValue: 1,
  miniGurschCap: 1,
  turnSeconds: 0,            // ingen stress: ingen turtimer
  negotiationSeconds: 45,
  slaskCallSeconds: 10,
};

/**
 * Spelarens första hand: 3, 3 och en 7:a (= tre treor) plus K och en uppvänd dam som vinner
 * floppen. Då börjar spelaren, ser 7:an som joker direkt och har två dyra kort att bli av med.
 */
export const TUTORIAL_HAND = ['S3', 'H3', 'C7', 'D13'];   // id = färg + valör (cards.js)
export const TUTORIAL_FACE_UP = 'S12';
const BOT_FACE_UP = ['H9', 'D5'];

/**
 * Kort-id:n i utdelningsordning för game.startRound({ deck }): fyra dolda var, sedan ett
 * uppvänt var, med början hos spelaren efter dealern. Bottarnas dolda kort slumpas ur resten
 * (utan damer, kungar och ess, så att första rundan blir snäll).
 */
export function tutorialDeck(game, humanId, rng = Math.random) {
  const order = game.rotate(game.players.map((p) => p.id), game.dealerIndex + 1);
  const used = new Set([...TUTORIAL_HAND, TUTORIAL_FACE_UP, ...BOT_FACE_UP]);
  const pool = [];
  for (const suit of ['S', 'H', 'D', 'C']) {
    for (let rank = 2; rank <= 11; rank++) if (!used.has(`${suit}${rank}`)) pool.push(`${suit}${rank}`);
  }
  const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const hidden = new Map(order.map((id) => [id, id === humanId ? TUTORIAL_HAND.slice() : [take(), take(), take(), take()]]));
  let bot = 0;
  const faceUp = new Map(order.map((id) => [id, id === humanId ? TUTORIAL_FACE_UP : BOT_FACE_UP[bot++ % BOT_FACE_UP.length]]));
  const deck = [];
  for (let i = 0; i < 4; i++) for (const id of order) deck.push(hidden.get(id)[i]);
  for (const id of order) deck.push(faceUp.get(id));
  return deck;
}

/**
 * Ska en bot syna den här slasken? I övningsrundan synar bottarna aldrig varandra (spelaren
 * ska få chansen) och spelarens slask bara så länge det finns synningar kvar.
 */
export function tutorialShouldCall({ slaskerIsBot, callsLeft }) {
  return !slaskerIsBot && callsLeft > 0;
}
