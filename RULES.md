# Gursch – regelbok

Varje regel har ett nummer. Testerna i `test/` refererar till reglerna med taggar som
`[R24]`, och `test/rules-coverage.test.js` fallerar om någon regel här saknar test.

Alla regler här är bekräftade eller kommer direkt från specifikationen.

Hittar du ett fel när du spelar: tryck **RAPPORTERA REGELFEL** när rundan är klar (se
sist i dokumentet).

---

## Grund

**R1.** 2–5 spelare och en kortlek med 52 kort. Färgerna saknar betydelse.

**R2.** Alla börjar på 0 kr. Alla belopp är hela kronor, och saldon får bli negativa.

**R3.** Valörer: 2–10, J = 11, Q = 12, K = 13, A = 14. *Face cards* är J, Q, K och A.

## Given och flop

**R4.** Dealern flyttas ett steg varje runda. Korten delas ut med början hos spelaren efter
dealern: fyra dolda kort var, sedan ett femte uppvänt kort var.

**R5.** Den som har det högsta uppvända kortet vinner *floppen*.
Vid lika vinner den som fick sitt kort sist i utdelningsordningen.
Floppkortet syns för alla under floppen och första slängrundan. När första slängrundan är
slut göms det.

**R6.** Multiplier: antingen fast (×1, ×2, ×3, ×4, ×5, ×10, ×25, ×50, ×100) eller *flopmult*, där
flopkortets värde gånger 1–4 blir multiplier.

## Kombinationer och 7:an

**R7.** 7:an är joker i kombinationer: K,7 = K,K och 2,2,7 = tre tvåor. En ensam 7:a är lika
stark som ett ess i sticket, men räknas som 7 i slutvärdet.

**R8.** En kombination är *clean* (alla kort har samma valör), *semi-mixed* (samma valör plus
7:or) eller *mixed* (allt annat).

## Första slängrundan

**R9.** Flopvinnaren börjar, sedan går turen vidare i sittordning. Den första som slänger
bestämmer antalet (1–4). De andra slänger lika många eller säger STAY.
Säger den första STAY bestämmer nästa som slänger antalet.

**R10.** Den som säger STAY i första slängrundan står över den första förhandlingen och är
med igen i nästa.

**R11.** Drar man 1 kort visas det uppvänt för alla när det dras, i ungefär 3 sekunder, och
sedan göms det. Det syns aldrig i nästa slängning, i sista slaskchansen eller i stickspelet.
Drar man 2–4 kort är de dolda.

**R12.** När draghögen tar slut blandas hela slänghögen, även kort som just har slängts,
och blir en ny draghög.

## Slängförhandling

**R13.** Efter första slängrundan förhandlar alla samtidigt. Var och en föreslår hur många
kort alla ska slänga (1–4) och kan ändra sig när som helst. Allas förslag syns i realtid,
och man kan chatta under tiden. Förhandlingen har en timer (20 s, går att ändra i lobbyn).

**R14.** Visar alla samma tal väljer alla samtidigt så många kort och drar nya, och sedan
börjar en ny förhandling. Enigheten måste hålla i 2 s, så att man hinner ändra sig.

**R15.** STAY avslutar förhandlingen direkt. Är man inte överens när tiden tar slut avslutas
den också. I båda fallen slängs inga kort och spelet börjar.
En enighet som redan pågår när tiden tar slut får gå klart.

**R16.** Den som inte hinner välja sina kort får sina högsta kort slängda (turtimern
gäller). Det finns inget tak för antalet förhandlingar i en runda.

## Slask

**R17.** SLASK: man lägger hela handen i slänghögen och får fem nya kort. Det går att slaska
på sin tur i första slängrundan och i sista slaskchansen. Efter en slask väljer man igen
direkt på sin nya hand: slaska igen, eller fortsätta (slänga eller STAY i första slängrundan,
PASS i sista slaskchansen). Varje spelare får slaska högst 3 gånger per runda (går att ändra
i lobbyn).

**R18.** När någon slaskar kan de andra *syna* inom 7 sekunder (går att ändra i lobbyn), och den som synar först
gäller. Man kan inte syna sin egen slask. Inget annat händer förrän fönstret har stängt.

**R19.** Synad slask: fanns det face cards i den gamla handen betalar slaskaren 10 kr per
face card till den som synade. Fanns det inga betalar den som synade 25 kr till slaskaren.
En slask som ingen synar kostar ingenting.

**R20.** Sista slaskchansen: när slängningen är klar får alla i tur, med början hos
flopvinnaren, välja SLASK eller PASS innan stickspelet börjar. Den som redan har slaskat
max antal gånger hoppas över, och den som når max under sin tur går vidare automatiskt.

## Stickspel

**R21.** Flopvinnaren leder första sticket. Den som vinner ett stick leder nästa.

**R22.** Utspelet är 1–5 kort som är clean eller semi-mixed. Ett ensamt kort går alltid.
Mixed får inte spelas ut. Den som *följer* får däremot lägga mixed, till exempel dam + kung på
två 10:or, så länge varje kort följer R24. Det är ett sätt att bli av med dåliga kort.

**R23.** Alla lägger lika många kort som utspelet.

**R24.** Följregeln: man måste inte slå. Varje kort man lägger måste vara
- en 7:a, eller
- minst lika högt som utspelet, alltså det som påbörjade sticket, eller
- ett av ens lägsta kort (7:an räknas då som 7).

Utspelet räknas som kombinationens värde: 4,4,7 är tre fyror, så 6,7,10 går att lägga.
En 7:a räknas som ess bara när den spelas ut ensam.

"Lägsta" räknas bland korten man inte redan lägger som 7:a eller högt kort. Med handen
7,9,K,A mot Q,Q går alltså 7+9, men inte K+9, eftersom den kvarvarande 7:an är lägre än 9:an.

**R25.** Den som lagt den bästa kombinationen hittills leder sticket. Ett senare spel tar
över ledningen bara om det har minst lika högt värde *och* är minst lika rent (clean är
renare än semi-mixed), och är bättre i minst ett av dem. Exempel:
- A,7 efter 8,8: tar inte över, ett semi-mixed slår aldrig ett clean.
- 2,2 efter A,7: tar inte över, lägre värde vinner aldrig, även om det är clean.
- K,K efter K,7, eller A,7 efter K,7: tar över.

Mixed vinner aldrig. Vid exakt lika (samma värde och typ) vinner den som lade sist.
Ordningen spelar roll: med tre spelare kan 8,8 → A,7 → 2,2 sluta med att 8,8 vinner.

## Slutvärde och betalning

**R26.** Rundan tar slut när alla har spelat ut sina kort. Ens *slutvärde* räknas på korten
man gick ut på, alltså de man lade i sista sticket:
- clean eller semi-mixed: värdet × antal kort (7:an räknas som det den ersätter, men en
  ensam 7:a är 7)
- mixed: summan av korten (7:an räknas som 7)

**R27.** Spelar någon ut fem lika (*five of a kind*, även med 7:or, till exempel *quint two*
som bara är 2:or och 7:or) går den spelaren ut direkt och rundan tar slut. De andras
slutvärde blir hela deras hand. Quinten räknas som vanligt slutvärde (fem kungar = 65), så den
som går ut på en quint kan förlora precis som alla andra.

**R28.** Den med högst slutvärde förlorar och betalar slutvärdet × multiplier till varje
annan spelare.

## Mini-gursch

**R29.** Har flera samma högsta slutvärde spelar de en *mini-gursch*. Var och en får 3 kort
(2 dolda och 1 uppvänt) ur en ny lek. Den med det högsta uppvända kortet börjar (vid lika
den som fick sitt kort sist). Multipliern gångras med antalet deltagare. Sedan spelas det
som ett vanligt stickspel.

**R30.** Förloraren betalar sitt slutvärde i mini-gurschen (det man gick ut på där) × den
höjda multipliern. Rundans lika slutvärde spelar ingen roll längre.

**R31.** Blir det lika igen spelas en ny mini-gursch (*mini-mini-gursch*) med ännu högre
multiplier. Inställningen *Mini-gursch cap* begränsar antalet nivåer.
När gränsen nås och det fortfarande är lika avgörs det med en *dragning*. Korten som finns
kvar i mini-gurschens draghög läggs dolda på bordet. De lika väljer ett kort var i
sittordning, med början hos den första av dem efter dealern, och varje kort vänds upp när
det väljs. Högst kort vinner (2 lägst, A högst, 7:an räknas som 7). Den med lägst kort
förlorar och betalar sitt slutvärde från den senaste mini-gurschen × den senaste nivåns
multiplier. Drar flera lika lågt drar de igen bland korten som är kvar.

---

## Appens regler

Det här är inga kortspelsregler, utan hur appen hanterar tid, anslutningar och fusk.

**A1.** Turtimer: 45 s (går att ändra eller stänga av i lobbyn). Tar tiden slut görs det
passiva draget: STAY i första slängrundan, PASS i sista slaskchansen, och i stickspelet
det tillåtna spelet med lägst kortsumma.

**A2.** Ingen ser andras dolda kort. Servern skickar bara det publika läget och ens egen
hand. Kortvalet efter en förhandling är hemligt tills korten dras.

**A3.** Servern avgör allt och avvisar ogiltiga drag med en förklaring. Samma lista över
tillåtna drag (`legalPlays`) används av servern, bottarna, timern och gränssnittet.

**A4.** Nya spelare kan gå med i lobbyn eller mellan rundor, men ingen kan lämna mitt i en
runda. En host som varit frånkopplad i 30 s ersätts av en ansluten spelare. En bot kan
aldrig vara host.

**A5.** Inställningar kontrolleras på servern och kan bara ändras mellan rundor.

**A6.** När någon skriver en felrapport pausas spelet för alla. Inga drag kan göras, alla
timers står still (tur, slaskfönster, förhandling, kortval) och bottarna väntar. Chatten
fungerar. När rapporten är klar fortsätter spelet med samma tid kvar som innan. Bara den som
pausade kan fortsätta. Pausen släpper av sig själv efter 3 minuter, eller om den som pausade
tappar anslutningen.

**A7.** Övningsrundan (*Lär dig Gursch* på startsidan) är en runda mot två lätta bottar med
×1 och utan turtimer. Första given är bestämd i förväg: du får 3, 3, 7 och K dolda och en
uppvänd dam, så du vinner floppen. Bottarna synar din första slask men ingen mer, och de
synar aldrig varandra. En guide förklarar varje moment första gången det händer och pausar
spelet medan den pratar. Knapparna syns ändå, och trycker du på ett drag fortsätter spelet.
Ingen annan kan gå med. Efter första rundan spelar man vidare som vanligt.

---

## Rapportera ett regelfel

1. Tryck **RAPPORTERA FEL** i toppmenyn direkt när något blir fel. Det går även mitt i en
   runda, och knappen finns också i resultatrutan. Spelet pausas för alla medan du skriver
   (A6), så ingen tid eller tur går förlorad.
2. Beskriv vad som blev fel, till exempel "Leo fick lägga en 9:a på en ensam 7:a".
3. Rapporten sparas direkt i projektets mapp `reports/`. Den innehåller rundans frö och alla
   drag fram till det ögonblicket, och hur din skärm såg ut (webbläsare, fönsterstorlek, zoom
   och om knapparna låg synliga). Den skickas aldrig till spelarna, så ingen kan se någon
   annans kort genom den.
4. Säg till Claude att kolla rapporterna. Claude spelar upp rundan, rättar felet och lägger
   rapporten i `test/replays/`, så att felet aldrig kan komma tillbaka.

Så här visar du en rapporterad runda drag för drag:

```bash
npm run replay -- reports/<fil>.json
```
