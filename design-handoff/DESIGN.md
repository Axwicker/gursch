# Gursch – ny design

Det här paketet beskriver hur Gursch ska se ut. Det är en designreferens, inte färdig kod för sajten.

## Vad som finns här

- `skarmbilder/` – en målbild per skärm och läge.
- `referens/` – samma skärmar som fristående HTML med exakta stilar (färger, typsnitt, mått, skuggor). Öppna dem i en webbläsare. De är statiska: valt kort, spelarnamn, belopp och texter är hårdkodade exempel.
- `assets/` – alla bilder som designen använder.

När en beskrivning här och en referensfil säger olika saker gäller referensfilen.

| Skärm eller läge | Fil (samma namn i `referens/` och `skarmbilder/`) |
|---|---|
| Start | `start` |
| Lobby | `lobby` |
| Bord, stick 1, du leder, mitten tom | `bord` |
| Bord, slängning | `bord-slangning` |
| Bord, förhandling | `bord-forhandling` |
| Bord, sista slaskchansen | `bord-slaskchans` |
| Bord, stick pågår, du ska följa | `bord-stick` |
| Bord, väntar på annan spelare, förra sticket ligger kvar | `bord-vantar` |
| Bord, din slask blev synad | `bord-slask-synad` |
| Bord, fem spelare, rundan slut | `bord-fem-spelare` |
| Dialog, syna slask | `dialog-syna-slask` |
| Dialog, rapportera fel | `dialog-rapportera-fel` |
| Dialog, lämna spelet | `dialog-lamna` |
| Panel, historik | `panel-historik` |
| Panel, chatt | `panel-chatt` |
| Rundresultat | `rundresultat` |
| Mobil, stick 1, mitten tom | `bord-mobil` |
| Mobil, stick pågår | `mobil-stick` |
| Mobil, slängning | `mobil-slangning` |
| Mobil, förhandling | `mobil-forhandling` |
| Mobil, meny | `mobil-meny` |

## Texter

Texterna i referensfilerna är exempel. Spelets egna texter – uppmaningar, statusrader, kombinationsnamn, dialogtexter – behålls som de är i koden idag. Där det står uttryckligen nedan att en text ska bort eller läggas till gäller det. Är du osäker på om en skillnad är avsiktlig: fråga, ändra inte.

## Känsla

Film noir och 1940-talets spelhåla. Platta färgfält, mörka konturer, hårda skuggor utan oskärpa. Inga gradienter på knappar eller paneler, inga glaseffekter, inga rundade "piller".

## Färger

| Namn | Värde | Används till |
|---|---|---|
| Grund | `#10211b` | Bakgrund på Start, Lobby och Rundresultat |
| Bläck | `#0a1612` | Konturer, mörka skyltar, mörk text på ljust |
| Filt | `#1f3d30` | Bordets filt, cirkeln bakom resultatpanelen |
| Filt ljus | `#28503e` | Ljusoval på golvet på Start |
| Ljuskägla | `#1a3329` | Ljuskäglan från lampan på Start |
| Underlägg | `#101c18` | Läderunderlägget under handen |
| Kräm | `#f0e8cc` | Paneler, dialoger, bordets kant, ljus text på mörkt |
| Papper | `#fbf7e9` | Textfält, spelkort, rader i listor |
| Linje | `#d6cdaf` | Tunna ramar och avdelare på kräm |
| Guld | `#c9a55a` | Huvudknapp, markeringar, skugga på "din" skylt |
| Mahogny | `#3a2419` | Golvet bakom bordet |
| Röd varning | `#c05a48` | Ram på rapportera-knappar och SLASK, timern när tiden är knapp |
| Röd fylld | `#a8322a` | Negativa belopp på ljus botten, LÄMNA-knappen, ordet SLASK! |
| Minus på mörkt | `#e58a7a` | Negativa belopp och SLASK-status på mörk skylt |
| Plus | `#1f6b45` | Positiva belopp på ljus botten |
| Plus på mörkt | `#7fcf9c` | Positiva belopp på mörk skylt |
| Kortröd | `#b3362c` | Röda valörer på spelkort |
| Dämpad text | `#9fb0a2` på mörkt, `#4f5f55` på ljust | Sekundär text |

## Typsnitt

Alla tre hämtas från Google Fonts.

- **Alfa Slab One** – bara de stora orden: GURSCH, RUNDAN KLAR, rumskoden i lobbyn och SLASK!.
- **Barlow Condensed** 600/700 – knappar, rubriker i paneler, etiketter, namn, valörer på kort. Versaler med spärrning 0,08–0,14 em på knappar och etiketter.
- **Barlow** 400/500/600 – löptext, fältetiketter, uppmaningar.

## Form och skugga

- Hörnradie 4 px på knappar, fält och skyltar, 6 px på paneler. Aldrig helt runda knappar.
- Ram 2 px i Bläck på ljusa ytor.
- Skuggor är hårda och förskjutna, utan oskärpa: `8px 8px 0` på paneler och dialoger, `4px 4px 0` på huvudknappar.
- Guldskugga betyder "det här är du": din namnskylt vid bordet, din rad i resultatlistan och spelarlistan, dina egna chattmeddelanden.
- Guldring (3 px runt om) betyder "aktiv just nu": valt kort, skylten för den som är på tur, vinnande kort i sticket.
- Fokusmarkering: en 3 px ring med 2 px luft. Grön (#2f7a56) på ljusa ytor (kräm och papper), guld på mörka. Textfält får i stället tjockare ram och guldskugga.

## Knappar

Bara en huvudknapp per skärm eller dialog.

1. **Huvudknapp** – guldfyllning, mörk text, mörk ram, hård skugga. SKAPA SPEL, SPELA 2 KORT, SLÄNG 2 KORT, PASS, SPELA IGEN, STARTA SPELET, SPARA RAPPORT, SYNA SLASK.
2. **Mörk knapp** – fylld i Grund med krämfärgad text. GÅ MED, SKICKA.
3. **Ramknapp** – genomskinlig med 2 px ram. STAY, TILL LOBBYN, HISTORIK, CHATT, LÄMNA, AVBRYT, STANNA, KOPIERA.
4. **Ramknapp med röd ram** (`#c05a48`) – RAPPORTERA FEL och SLASK.
5. **Röd fylld knapp** (`#a8322a`, krämfärgad text) – bara LÄMNA i bekräftelsen.

En huvudknapp som inte går att trycka på (inga kort valda) visas med 45 % opacitet.

Väljaren 1–4 i förhandlingen och nivåväljaren Lätt/Medel/Svår är samma sorts sammansatta väljare: en ram runt alla alternativ, det valda fyllt.

## Rörelse

Allt går på 120 ms och stängs av vid `prefers-reduced-motion`. Hover-effekter bara inom `@media (hover:hover)`.

- Huvudknapp: lyfter 2 px upp åt vänster och skuggan blir längre vid hover, sjunker 3 px ner i skuggan vid tryck.
- Ramknapp: fylls med färg vid hover, sjunker 2 px vid tryck.
- Kort i handen: lyfter 4 px vid hover. Valt kort ligger 8 px upp och har guldring. Gråa kort rör sig inte.
- Textfält: tjockare ram och guldskugga `6px 6px 0` vid fokus.

Exakta regler står i `<style>` högst upp i referensfilerna (klasserna som börjar på `gk-`).

## Start (`start`)

- Vänster: golvlampan, ljuskäglan, ljusovalen på golvet och gurkmannen. Lampan är cirka 80 % av hans höjd. Skuggan under skorna ligger i bilden `gursch-maskot-med-skugga.png` och ska inte ritas separat.
- Höger: titeln GURSCH med guldskugga, knappen LÄR DIG GURSCH, och två krämfärgade paneler.
- Ingen undertitel under GURSCH.
- Sajten har idag ett namnfält. I designen finns ett i varje panel. De ska visa samma värde: skriver man i det ena fylls det andra.
- Namnfälten har exempeltexten "Ditt smeknamn".
- Botnivå väljs med en tredelad väljare (Lätt, Medel, Svår), inte en rullista. Medel är förvald.
- Raden "Beta 0.1.0 – …" som finns idag ligger kvar, under fotraden och i samma dämpade stil.

## Lobby (`lobby`)

- Bakgrund i Grund. Överst huvudmärket, etiketten RUMSKOD i guld och själva koden i Alfa Slab One med guldskugga. Till höger inbjudningslänken i ett pappersfält med knappen KOPIERA.
- Två krämfärgade paneler bredvid varandra: SPELARE och INSTÄLLNINGAR.
- Spelarrader är pappersrader. Din rad har mörk ram och guldskugga. Märken: HOST (mörk), DU (guld), BOT (ram).
- Botens nivå väljs med samma tredelade väljare som på Start, i liten storlek. Krysset tar bort boten.
- LÄGG TILL BOT är en ramknapp med streckad ram. STARTA SPELET är huvudknappen.
- Inställningarna är rullistor i två kolumner, ritade som pappersfält med en pil till höger. Kryssrutorna är vanliga kryssrutor i Bläck.

## Bordet på dator

Alla bordslägen delar samma delar. Läs det här avsnittet tillsammans med `bord`, `bord-slangning`, `bord-forhandling`, `bord-slaskchans`, `bord-stick`, `bord-vantar`, `bord-slask-synad` och `bord-fem-spelare`.

### Golv, topplist och bord

- Hela bakgrunden är ett plankgolv: grundfärg Mahogny med `planktextur.svg` som upprepat mönster (640 × 256 px), mörkare ut mot kanterna.
- Topplisten är mörkbetsad och halvgenomskinlig över golvet. Huvudmärket (`gursch-marke-sticker-tjock.png`) är 114 px högt och hänger ner över listens underkant. Sedan ordet GURSCH, taggarna för runda, multiplikator, rumskod och BETA, och till höger knapparna RAPPORTERA FEL, HISTORIK, CHATT och LÄMNA.
- Bordet är en avlång oval med krämfärgad kant och filt. Fem fåtöljer (`fatolj.png`, roterad per plats) står inskjutna under bordet: du nere i mitten, en på varje kortsida, två upptill. En plats utan spelare visar bara en tom fåtölj. Med fem spelare sitter den femte uppe till höger (`bord-fem-spelare`).

### Mitten av bordet

- På filten ligger gurktrycket (`gurktryck-filt.png`). Det ritas först. Allt annat – skyltar, kort, rutor – ritas ovanpå.
- Ordet GURSCH på gurkan syns bara när inga kort ligger i mitten (`bord`). Så fort leken, slänghögen eller ett stick ligger där döljs ordet och korten ligger ovanpå gurkan.
- Överst i mitten står fasen i guld (SLÄNGNING, FÖRHANDLING, SISTA SLASKCHANSEN, STICKSPEL · STICK 2, RUNDAN ÄR SLUT) och under den statusraden.
- Den egna raden "Dealer · Flop · Stick" finns inte kvar. Sticknumret står i fasraden. Dealern visas med D-brickan och floppen med FLOP-märket på skyltarna.
- Lek och slänghög är två små kortbaksidor med etiketterna LEK 32 och SLÄNGT under. Tom slänghög är en streckad ram.

### Sticket

- En ruta per spelare som lagt, i en rad: namnet överst, korten, och kombinationens namn på en mörk etikett under. Flera kort överlappar varandra med 14 px.
- Den som vann får namnet i guld och guldring runt korten. Den som förlorar sista sticket får rött namn och röd ring.
- När ett nytt stick börjar ligger det förra kvar med 55 % opacitet och etiketten FÖRRA STICKET under (`bord-vantar`).
- Sista sticket har etiketten SISTA STICKET – HÖGST SLUTVÄRDE FÖRLORAR och visar slutvärdet under varje kort (`bord-fem-spelare`).

### Skyltar

- Motspelare har mörka skyltar: namn, och under det saldot. Status står på samma rad som saldot, efter en punkt: `0 kr · TÄNKER …`, `0 kr · 2 KORT`, `+10 kr · STAY`, `0 kr · SLASK`. TÄNKER är guld, SLASK är röd, övrigt krämfärgat.
- Den som är på tur har en 3 px guldring runt skylten.
- I förhandlingen visas varje spelares förslag som en liten bricka efter saldot: fylld krämfärgad för ett förslag (2 KORT), bara ram för den som inte valt än (…), streckad ram för den som står över.
- Märken sitter som nålar i skyltens hörn: D-brickan uppe till vänster, FLOP uppe till höger. Slaskräknaren (SLASK 1/3) sitter vid sidan av skylten, mot bordets mitt.
- Under skylten ligger spelarens kort som baksidor. Det uppvända kortet visas med valören.
- Din skylt är krämfärgad med guldskugga. Dina märken ligger i en rad under skylten. Din status står efter saldot: `−30 kr · SYNAD`.
- Kortbaksidor är mörka med ljusa kritstrecksränder, 2 px breda med 4 px mellanrum.
- Sjuor har ett litet guldhörn uppe till höger, både i handen och på bordet.

### Underlägget med din hand

Din hand ligger på ett mörkt läderunderlägg med streckad guldsöm, centrerat under bordet. Uppifrån och ner:

1. Turtimern: en smal list. Guld när det är gott om tid, röd när det är knappt.
2. Uppmaningen på en rad, till exempel "Släng 2 kort (Bot Sixten valde antalet) – eller stay eller slask". När du valt kort visas kombinationens namn här i stället, som idag.
3. Handen. Ditt uppvända kort har etiketten UPPVÄND i guld ovanför. Kort som inte får läggas visas med 42 % opacitet. Kort som håller på att delas ut visas som baksidor.
4. Knappraden: räknaren till vänster i guld (2 AV 2 VALDA), knapparna i mitten, tiden till höger (DIN TUR · 38 s). Tiden blir röd när det är knappt.

Knappraden finns alltid kvar, även när det inte är din tur. Då står bara vem som är på tur och tiden i mitten (`bord-vantar`).

| Läge | Knappar |
|---|---|
| Slängning | SLÄNG 2 KORT (huvudknapp), STAY (ram), SLASK (röd ram) |
| Förhandling | väljaren 1–4, STAY (ram) |
| Sista slaskchansen | PASS (huvudknapp), SLASK (röd ram) |
| Stickspel | SPELA 2 KORT (huvudknapp) |

I väljaren 1–4 är ditt eget val fyllt. Små prickar under en siffra visar hur många andra som vill samma.

### Slask

- När någon annan slaskar visas dialogen `dialog-syna-slask`: ordet SLASK! i rött, en mening, nedräkningen som list och sekunder, och huvudknappen SYNA SLASK. När du själv slaskat visas samma ruta utan knapp.
- När en slask synats visas en krämfärgad ruta mitt på bordet (`bord-slask-synad`): vem som synade, den gamla handen med guldring runt de klädda korten, och resultatet i rött.

### Små meddelanden

Korta besked som "Återansluten" visas som en mörk skylt med guldram, mitt under topplisten (`bord-vantar`).

## Dialoger

- Dialoger är krämfärgade paneler med 2 px mörk ram och skuggan `8px 8px 0`, mitt på skärmen. Bakom ligger en mörk slöja över hela spelet (`rgba(6,10,8,.74)`), utan oskärpa.
- Rubriken i Barlow Condensed 700, 26 px, versaler.
- `dialog-rapportera-fel`: text, rullista, textruta, SPARA RAPPORT (huvudknapp) och AVBRYT (ram).
- `dialog-lamna`: text, STANNA (ram) och LÄMNA (röd fylld).

## Sidopaneler

- Historik och chatt är krämfärgade paneler som glider in från höger, 400 px breda och i full höjd, med mörk kant och hård skugga åt vänster. Ingen slöja bakom.
- Överst rubriken och en stängknapp med kryss, sedan en mörk linje.
- `panel-historik`: en etikett per runda (RUNDA 2) och en pappersrad per händelse: vem och vad till vänster, beloppet till höger i grönt eller rött, förklaringen under.
- `panel-chatt`: andras meddelanden till vänster som pappersrutor med tunn ram. Dina egna till höger med mörk ram och guldskugga. Längst ner textfältet och knappen SKICKA.

## Rundresultat (`rundresultat`)

- En krämfärgad panel mot en stor cirkel i Filt. Huvudmärket sitter mitt på panelens överkant.
- Under titeln RUNDAN KLAR och raden med runda och multiplikator står spelets egen mening om vad som hände ("Du förlorade rundan. Du hade högst slutvärde …"), med första meningen i fetare stil.
- Din rad har mörk ram och guldskugga.
- Raden "Dealern flyttas ett steg till nästa runda." finns inte.
- Längst ner: TIDIGARE HÄNDER (ramknapp) och RAPPORTERA REGELFEL (röd ram).

## Mobil

Läs `bord-mobil`, `mobil-stick`, `mobil-slangning`, `mobil-forhandling` och `mobil-meny`.

- Samma filt, skyltar och kort, men inga fåtöljer och inget plankgolv. Bordet är en rundad rektangel som fyller bredden.
- Motspelarna ligger i en rad överst. Status står på en egen rad i skylten, eftersom skyltarna är smala. Under skylten visas bara det uppvända kortet och märkena, inga baksidor.
- Gurktrycket ligger mitt på filten. Ordet GURSCH syns när mitten är tom. När kort ligger där står fasen och statusraden över trycket och korten under.
- Sticket radbryts: två eller tre rutor per rad.
- Bara huvudmärket i topplisten, utan ordet GURSCH. Menyknappen är 44 × 44 px.
- Menyn (`mobil-meny`) är en liten krämfärgad panel under knappen med HISTORIK, CHATT, RAPPORTERA FEL och LÄMNA SPELET. Knappen visar ett kryss medan menyn är öppen.
- Under bordet: turtimern som en list över hela bredden, uppmaningen (får radbrytas), räknare och tid på en rad, handen, och knapparna i en rad över hela bredden.

## Bilderna i `assets/`

| Fil | Används |
|---|---|
| `gursch-maskot-med-skugga.png` | Helfiguren på Start. Skuggan från skorna ingår i bilden. |
| `gursch-maskot-sticker.png` | Helfigur med krämfärgad kontur, utan skugga. |
| `gursch-maskot.png` | Helfigur utan kontur, för ljus bakgrund. |
| `gursch-marke-sticker-tjock.png` | Huvudmärket i små storlekar: topplisten, lobbyn och resultatpanelen. |
| `gursch-marke-sticker.png` | Huvudmärket med tunnare kontur, för stora storlekar. |
| `gursch-marke.png` | Huvudmärket utan kontur, för ljus bakgrund. |
| `golvlampa.png` | Lampan på Start. |
| `fatolj.png` | Fåtöljen runt bordet, sedd uppifrån med ryggen uppåt i bilden. |
| `gurktryck-filt.png` | Gurkan på filten. Halvgenomskinlig, så den följer filtens färg. |
| `planktextur.svg` | Golvet. Halvgenomskinligt mönster som läggs över grundfärgen. |

## Regler som inte får brytas

- Spelregler, poängräkning och all spellogik lämnas orörda. Det här gäller bara utseende, plus de två nya funktionerna som beskrivs separat.
- Inga lägen, knappar eller upplysningar som finns i spelet idag får försvinna för att de saknas i en referensbild. Saknas något: behåll det, klä det i samma stil och säg till.
- Riktiga element för allt klickbart: `<button>`, `<a>`, `<input>` med `<label>`. Synlig fokusmarkering överallt.
