# Chrome Web Store listing

Package: `packages/extension/dist/ikataster-chrome-<version>.zip` (build: `node packages/extension/build.mjs` with `IKATASTER_ORIGINS` set).

## Store listing

- **Name:** iKataster — izpisi iz zemljiške knjige (from manifest)
- **Category:** Productivity → Tools
- **Language:** Slovenian (add English as a second listing language)
- **Homepage / support URL:** https://ikataster.si
- **Privacy policy URL:** https://ikataster.si/zasebnost/

### Short description (manifest, ≤132 chars)

Poveže spletno aplikacijo iKataster z e-ZK (esodisce.si) in tvojo SI-PASS prijavo. Podatki ne zapustijo brskalnika.

### Detailed description (sl)

iKataster je brezplačna spletna aplikacija za pregled katastra (parcele, stavbe, deli stavb, upravniki) in za prenos rednih izpisov iz zemljiške knjige. Ta razširitev je most med aplikacijo ikataster.si in portalom e-Sodstvo.

Kako deluje:
1. V istem brskalniku se prijaviš v e-Sodstvo s svojim SI-PASS in odpreš stran ZK izpiskov.
2. Na ikataster.si dodaš nepremičnine na seznam za izpise (posamezno, vse dele stavbe, vse stavbe upravnika ali z uvozom Excel seznama).
3. Klikneš »Prenesi nove izpiske« – razširitev v zavihku e-Sodstva pošlje enako zahtevo kot obrazec ZK izpiskov in PDF vrne aplikaciji.
4. Aplikacija iz PDF-jev prebere lastnike, deleže, hipoteke in služnosti; izvoziš jih v Excel ali ZIP s PDF-ji.

Zasebnost:
- Razširitev ne vidi tvojega gesla in ne pošilja podatkov na noben strežnik.
- Izpisi so shranjeni samo v tvojem brskalniku.
- Dovoljenja so omejena na esodisce.si in stran ikataster.si.
- Dnevna omejitev e-Sodstva (400 izpisov) je upoštevana.

Odprta koda: https://github.com/ibracic/ikataster

### Detailed description (en)

iKataster is a free web app for Slovenian cadastre data (parcels, buildings, building parts, building managers) and for downloading current land-registry extracts. This extension connects ikataster.si with the e-Sodstvo portal where you are signed in with your own SI-PASS. When you request extracts in the app, the extension sends the same request as the official "ZK izpiski" form in your e-Sodstvo tab and hands the PDF back to the app. It never sees your password, sends nothing to any server, and extracts stay in your browser. Open source: https://github.com/ibracic/ikataster

## Graphics

- Icon 128×128: `packages/extension/static/icons/icon128.png`
- Screenshots 1280×800: building panel, extract list with connected extension, building manager portfolio
- Small promo tile 440×280

## Privacy practices tab

**Single purpose:** Download land-registry extracts from the user's own signed-in e-Sodstvo (esodisce.si) session into the iKataster web app (ikataster.si).

**Permission justification**

- `scripting`: Runs one function inside the user's open esodisce.si tab that submits the official "ZK izpiski" form request (same-origin POST to /evlozisce/javni_izpisi/03-001.html) and returns the reply to the app. Needed because the request must use the user's existing e-Sodstvo session.
- Host permission `https://esodisce.si/*`: Find the user's e-Sodstvo tab and run the request above. No other sites.
- Content script on `https://ikataster.si/*`: Relays messages between the iKataster web page and the extension (origin-checked). It does not read page content.

**Remote code:** No. All code is in the package.

**Data usage:** The extension handles "Personally identifiable information" and "Website content" only in the sense that land-registry PDFs (which contain owner names) pass from esodisce.si to ikataster.si in the same browser. Nothing is collected, transmitted to the developer, sold or used for unrelated purposes. Tick all three certifications.

## Notes for reviewer (optional field)

To test: sign in at https://esodisce.si with SI-PASS (Slovenian e-ID required), open https://esodisce.si/evlozisce/javni_izpisi/list.html, then on https://ikataster.si search a building, click "Dodaj za izpis ZK", open the extracts list and click "Prenesi nove izpiske". Without an SI-PASS login the app shows "session expired", which is the expected behaviour.
