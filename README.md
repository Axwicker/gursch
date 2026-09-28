# Gursch

Realtids multiplayer-webbapp för kortspelet **Gursch** (2–5 spelare, en 52-kortslek).

```bash
npm install
npm start          # http://localhost:3000
npm test           # 129 tester (regler, invarianter, fuzz, uppspelning, bottar, paus)
npm run replay -- rapport.json   # visa en rapporterad runda drag för drag
npm run screenshots              # skärmbilder av en hel runda, jämförda med referensen
```

## Arkitektur

Spelmotorn är **server-authoritative** och helt separerad från UI:t.

```
src/engine/cards.js        kortlek, shuffle, dragning, face cards
src/engine/combination.js  kombinationer, 7-regeln, clean/semi-mixed, slutvärden, quint
src/engine/money.js        multiplier, ledger, round-/slaskbetalningar (heltal kr)
src/engine/bot.js          AI-motspelare (ser bara publikt state + sin egen hand)
src/engine/replay.js       uppspelning av loggade rundor (felrapporter)
scripts/replay.js          visar en rapporterad runda drag för drag
src/engine/game.js         state machine: flop, discard, slask, stick, mini-gursch, resultat
src/server/rooms.js        rum, slask-timers, städning
src/server/index.js        Express + Socket.IO, hidden information, reconnect
public/                    UI (lobby, pokerbord, animationer, chat, history)
test/                      tester, taggade med regelnummer; test/replays/ = rapporterade rundor
```

Klienten får aldrig andra spelares dolda kort: servern skickar `publicState()` till alla
och `privateState(playerId)` individuellt. Alla actions valideras på servern
(rätt spelare, rätt fas, rätt antal kort, ägarskap, slaskgräns, race conditions).
Även inställningar valideras mot en vitlista (`sanitizeSettings`).

* **Återanslutning** kräver en hemlig token som bara klienten som gick med har.
  Spelar-id:t är publikt, så utan token kunde vem som helst ta över en plats och se handen.
* **Blandning** på servern använder `crypto.randomInt` (Fisher–Yates). Tester injicerar en seedad rng.
* **Zoninvarianter**: `test/fuzz.test.js` låter slumpade bottar spela 600 rundor och kontrollerar
  efter varje drag att alla 52 kort finns i exakt en zon och att pengarna är nollsumma.
* Klienten importerar `/engine/combination.js` direkt från servern för att förhandsvisa
  markerade kort (kombination, om den tar ledningen, slutvärde). Servern avgör fortfarande allt.

### State machine

```
LOBBY → (deal + flop) → INITIAL_DISCARD → (NEGOTIATION → DISCARD_SELECT)* → NEGOTIATION
      → FINAL_SLASK → TRICK → [MINI_GURSCH*] → ROUND_RESULT → nästa runda (dealern flyttas ett steg)
```
NEGOTIATION och DISCARD_SELECT är **realtidsfaser** utan tur. Allt tidsstyrt (turtimer,
slaskfönstret, förhandlingens timer och bekräftelse, kortvalets timer och pausens
säkerhetsspärr) går genom `game.tick()` och `game.nextWakeup()`; servern håller en enda
timer (`syncGameTimer`). `game.pause()`/`resume()` fryser allt medan någon skriver en
felrapport och flyttar fram alla deadlines med pausens längd.
Five-of-a-kind/Quint two i ett ledutspel avbryter stickspelet och går direkt till resultat.

## Regler

Alla spelregler finns numrerade i **[RULES.md](RULES.md)** (R1–R31 plus appens regler A1–A5).
Tolkningar som inte är bekräftade är markerade ⚠️ där. Testerna refererar till reglerna med
taggar som `[R24]`, och `test/rules-coverage.test.js` fallerar om en regel saknar test.

## Felrapporter och uppspelning

Varje runda får ett eget slumpfrö, och alla drag loggas (`round.log`). Knappen
**RAPPORTERA FEL** (toppmenyn, även mitt i en runda) sparar loggen plus spelarens beskrivning
i `reports/` på servern (`submitReport`). Loggen skickas aldrig till klienterna, eftersom den
avslöjar alla händer.

```bash
npm run replay -- rapport.json            # visa rundan drag för drag
npm run replay -- rapport.json --until 12 # stanna före händelse 12 och visa alla händer
```

Rapporter i `test/replays/` spelas upp i varje testkörning. Med `"expect": [{ "event": 33,
"rejected": "…" }]` ska just den händelsen avvisas (felet var ett drag som aldrig borde ha
tillåtits). Utan `expect` ska uppspelningen ge samma resultat som när rundan spelades.

## Skärmbilder

UI:t har inga tester. `npm run screenshots` startar en egen server (port 3217, fast slumpfrö),
spelar en runda mot bottar med Playwright och den installerade Chrome, och tar bilder i varje
fas i mobil (375×812) och dator (1280×800): start, lobby, utdelning, slängning, förhandling,
kortval, sista slaskchansen, slask, stick, resultat, historik och chatt.

* `screenshots/baseline/` är referensen (versionshanteras). Ny referens: `npm run screenshots -- --baseline`.
* `screenshots/current/index.html` visar referens och senaste körning sida vid sida.
* Samma kort delas ut varje gång, men bottarnas val är slumpade, så senare faser kan skilja sig.
* Skriptet agerar via `window.__gursch.emit` och kortens `data-id`, inte via knapptexter.
  Behåll id:na `create-nick`, `practice-level`, `btn-practice`, `btn-start`, `btn-history`,
  `btn-chat-toggle` och `data-close` när UI:t görs om, annars behöver skriptet ändras.

## Övrigt

* **Bottar**: host kan lägga till AI-motspelare i lobbyn, eller välja "SPELA MOT BOTTAR" på
  startsidan (eget rum med tre bottar). Boten får samma information som en människa och kan
  inte fuska. Strategi: bra kort är ess, 7:or och 4 eller lägre (för flopvinnaren även par);
  boten slänger sina dåliga kort och säger STAY bara med en väldigt bra hand (bara bra kort och
  minst två låga att gå ut på). Den leder med fem lika direkt och synar slaskar. Servern låter bottar agera efter
  ~1–2 s och synar slaskar tidigast efter 1,2 s så att människor hinner först. En bot kan
  aldrig bli host, och ett rum med bara bottar kvar städas bort.
* **Botnivåer** (väljs per bot i lobbyn, eller för alla vid "SPELA MOT BOTTAR"):
  * **Lätt** – gör ofta slumpmässiga legala drag, synar sällan och långsamt.
  * **Medel** – heuristiken ovan.
  * **Svår** – Monte Carlo i stickspelet: gissar motståndarnas dolda kort 40 gånger (viktat
    mot låga kort, eftersom spelare slänger höga), spelar ut resten av rundan med motorns
    egna regler och väljer draget med bäst förväntat resultat. Synar nästan alltid.
  * Uppmätt mot tre medelbottar (där 25 % är jämnt): lätt förlorar ~46 % av rundorna,
    svår ~22 %.
  * I slängförhandlingen föreslår bottarna antalet dåliga kort och går med på andras förslag
    inom en tolerans. Förhandlingarna fortsätter tills någon har en väldigt bra hand
    (i snitt 2,5 förhandlingar/runda).
* **Animationer** (`public/app.js`, "kortflygningar"): utdelning och slängning visas som
  flygande kopior ovanpå det riktiga läget (Web Animations API, bara transform/opacity), så
  de kan aldrig blockera ett drag. Kort i handen, sticket, chatten och lobbyn återanvänds
  mellan uppdateringar och animeras bara in en gång. I en dold flik animeras ingenting, och
  blir fliken synlig igen hoppar pågående kortanimationer direkt till slutet.
* **Lagliga drag** räknas ut på ett ställe, `GurschGame.legalPlays()`. Servern, bottarna,
  timern och klienten (som får listan i `privateState`) använder bara den.
