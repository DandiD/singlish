# Singlish — regole di progetto

PWA personale per imparare l'inglese dalle canzoni (testi incollati a mano), con ripasso FSRS e analisi via Gemini. Un solo utente, nessun backend.

## Documenti da leggere prima di lavorare
- `docs/spec.md` — cosa deve fare l'app (fonte di verità per valori e regole).
- `docs/design.md` — token di colore, tipografia, mappa delle schermate del canvas di design.
- `docs/superpowers/plans/` — piani di implementazione. Esegui un task alla volta, nell'ordine.

## Stack (non aggiungere dipendenze fuori da questa lista senza chiedere)
Vite, Preact, TypeScript (strict), Dexie + dexie-react-hooks, ts-fsrs, zod, vite-plugin-pwa.
Test: Vitest, @testing-library/preact, fake-indexeddb, happy-dom. E2E: Playwright.

## Regole
- TDD: prima il test che fallisce, poi il codice minimo, poi il commit. Un commit per task concluso.
- I test non fanno mai rete: Gemini e Spotify si iniettano come `fetch` finti.
- Il tempo si inietta (`now: Date`) in tutto il dominio: niente `new Date()` dentro funzioni pure.
- Testo dell'interfaccia in italiano, diretto e sobrio. Contenuti di studio in inglese.
- Colori solo tramite le variabili CSS di `src/styles/tokens.css` (temi chiaro e scuro).
- Touch target minimo 44 px. Campi di risposta: `lang="en" autocapitalize="off" autocorrect="off" spellcheck="false"`.
- Mai salvare la chiave Gemini fuori da IndexedDB; mai loggarla.
- Non riprodurre testi di canzoni reali in test, fixture o esempi: usa testi inventati.

## Comandi
- `npm run dev` · `npm test` · `npm run test:e2e` · `npm run build` · `npm run typecheck`
