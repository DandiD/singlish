# Redesign · Fase 6 — Percorso della canzone, Scaffale, Collezione: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere visibile il ciclo di ogni canzone come percorso a tappe (nello Studio e come pallini nel carosello di Oggi), trasformare Canzoni in uno scaffale di copertine e il Lessico in una collezione con la composizione per tipo, la forza di ogni voce e una vista per canzone.

**Architecture:** Una funzione pura nuova `songPath` in `src/domain/path.ts` calcola le tappe di una canzone dai dati che le schermate leggono già (stato, parole da smistare, versi sbloccati, riascolto); lo Studio e il carosello la mostrano. Canzoni passa da lista a griglia con un menu «⋯» per le azioni secondarie. Il Lessico aggiunge una striscia di composizione (filtro per tipo), le tacche di forza e una vista «Per canzone», tutte da `lexicon()`.

**Tech Stack:** Preact + TypeScript strict, Dexie, Vitest + @testing-library/preact + fake-indexeddb + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-engagement-design.md` (§5.1 pallini del carosello, §5.3 tranne «Lettura a tempo», §5.4, §5.5, §7.1, §7.3, §9, §12 fase 6). Regole: `docs/spec.md`, `docs/design.md`, `CLAUDE.md`.

## Global Constraints

- Nessuna dipendenza nuova; colori solo da variabili di `src/styles/tokens.css`; touch target ≥ 44 px; `prefers-reduced-motion: reduce` rispettato; nessuno scroll orizzontale della pagina a 390 px.
- Tempo iniettato (`now: Date`); test senza rete; dati inventati.
- Ogni numero da una sola fonte: versi sbloccati da `unlockedLines`/`unlockedBySong`, parole da smistare da `pendingWords`, riascolto da `finalListenDue` e `FINAL_LISTEN_DAYS`, stato delle voci da `lexicon()`.
- Nessun dato nuovo, nessuna migrazione.
- Testo italiano. Nomi delle tappe: «Ascolto», «Analisi», «Studio», «Smista», «Ripasso», «Riascolto»; per i testi liberi la prima è «Lettura» e non c'è «Riascolto». Restano le parole di oggi per: «Segna come completata/o», «Elimina canzone/testo», «Apri in Spotify ↗», «Chiedi a Gemini», «Ritornello a voce», «Modifica», «Analizza ora», conferme ed eliminazione (`DELETE_NOTE`, `LIMIT_NOTE`).
- Un commit per task, messaggio in inglese, con la riga `Co-Authored-By:` del modello che scrive.

## Decisioni di questo piano (rispetto alla spec)

- D1. Tappe e stati (`done` | `partial` | `current` | `todo`), con il dettaglio sotto il pallino:
  - Ascolto/Lettura: `done` con «N%» se `comprehensionBefore` c'è, altrimenti `todo` senza dettaglio.
  - Analisi: `done` se lo stato non è `draft`/`queued`; altrimenti `current`, azione → `analyzing`.
  - Studio: `done` se `studying`/`done`; `current` se `analyzed` (azione → lo Studio stesso: nel carosello apre lo Studio). Nello Studio l'azione della tappa è «Ritornello a voce» se la canzone ha un ritornello (`chorusLines`), altrimenti nessuna.
  - Smista: `done` se non ci sono parole da smistare; `partial` con «N da fare» altrimenti, azione → `triage`.
  - Ripasso: con `lines > 0`: `done` se `unlocked === lines`, `partial` con «U di L» se `unlocked > 0`, `todo` con «0 di L» altrimenti; con `lines === 0`: `todo` senza dettaglio. Nessuna azione (il ripasso è in Oggi).
  - Riascolto (solo canzoni): `done` con «+N» (o «N%» senza `comprehensionBefore`) se `comprehensionAfter` c'è; `current` con «pronto» se in `finalListenDue`, azione → `finalListen`; se `studying`: `todo` con «tra N giorni» (N = giorni che mancano a `FINAL_LISTEN_DAYS` da `studyStartedAt ?? analyzedAt ?? addedAt`, arrotondati per eccesso, minimo 1); altrimenti `todo` senza dettaglio.
- D2. Il carosello di Oggi mostra sotto l'etichetta i pallini delle tappe (`aria-hidden`; il testo accessibile resta `songDetail`). Lo stato del pallino: pieno (`done`), metà (`partial`), anello (`current`), vuoto (`todo`) — forme, non solo colori.
- D3. Studio: testata con copertina grande, titolo (Bricolage, `--fs-display` o il più grande della scala esistente) e artista; il pulsante «Apri in Spotify ↗» sale nella testata; sotto il percorso. «Chiedi a Gemini» diventa un pulsante fluttuante in basso (sopra la barra di navigazione, 44 px, come la CTA di Oggi con `--nav-h`). «Ritornello a voce» passa nella tappa Studio. «Segna come completata» ed «Elimina» passano in un menu «⋯» nella testata (pulsante con `aria-haspopup="menu"`, `aria-expanded`; il menu è una lista di pulsanti; Esc e un tocco fuori lo chiudono; le conferme restano come oggi). «Modifica» resta in Canzoni (lì c'è il modulo).
- D4. Canzoni: griglia a 2 colonne. Prima le aperte (non `done`), poi il titolo «Completate» e le completate. Ogni elemento: copertina (con l'anello dei versi sbloccati se `lines > 0`), titolo, una riga di stato (la stessa di oggi: `statusLabel`, «N% prima», «X di Y versi sbloccati»); le completate con il guadagno come etichetta («+28», o niente senza i due valori). Copertina e titolo sono un link (Analizza/Studio come oggi). Un pulsante «⋯» per elemento apre un menu con «Apri in Spotify ↗» (se c'è il link), «Modifica», «Elimina»; modulo di modifica e conferma di eliminazione occupano tutta la riga della griglia (`grid-column: 1 / -1`). I testi liberi mostrano sulla copertina generata il nome della fonte (Serie, Podcast, Articolo, Testo) al posto di un'icona (non ce ne sono di adatte e non se ne disegnano).
- D5. Lessico, striscia di composizione: una barra divisa per tipo (phrasal verb, idiomi, collocazioni, frasi fisse, slang, parole) con le larghezze proporzionali ai conteggi di `lexicon(data, {})` e i colori delle classi `hl` esistenti; ogni tratto è un pulsante (44 px di altezza toccabile) che filtra per tipo (`aria-pressed`), ritoccarlo toglie il filtro. Testo equivalente: la legenda sotto con i conteggi. Filtro nuovo `LexFilter.type?: LexEntry['type']`.
- D6. Forza: tre tacche per voce (`nuovo` 1, `impara` 2, `attivo` 3; `sospeso` e `da smistare` 0), `aria-hidden`; lo stato a parole resta («B1 · attivo»).
- D7. Vista «Per canzone»: un controllo a due voci («Tutte» / «Per canzone») sopra l'elenco; «Per canzone» raggruppa le voci filtrate per `songId` di casa, con copertina piccola e titolo della canzone come intestazione (`h2`), canzoni in ordine di `addedAt`; le voci senza canzone (Espandi) in un gruppo «Altre voci».

## Review Focus

1. **Canzone con riascolto pronto e parole da smistare** — tappe Smista `partial` e Riascolto `current` insieme; nel carosello entrambe visibili; nessuna tappa con un'azione quando non è disponibile. Test in Task 1 e Task 2.
2. **Testo libero** — 5 tappe, «Lettura», niente Riascolto, niente Spotify; in Canzoni la copertina dice la fonte. Test in Task 1, 2, 4.
3. **Menu «⋯»** con tastiera e screen reader — si apre e si chiude con Invio/Esc, il fuoco torna al pulsante, un tocco fuori lo chiude, le azioni distruttive chiedono ancora conferma. Test in Task 2 e Task 4.
4. **Lessico con filtri combinati** (ricerca + tipo dalla striscia + chip + tema + vista per canzone) — il conteggio e i gruppi seguono tutti i filtri; un gruppo vuoto non compare; «Nessuna voce con questi filtri.» quando tutto è vuoto. Test in Task 5 e 6.
5. **390 px con titoli lunghi** — griglia di Canzoni, testata dello Studio, percorso a 6 tappe e striscia del Lessico senza scroll orizzontale. Verifica in Task 7 (e2e).

---

### Task 1: Percorso della canzone (dominio)

**Files:**
- Create: `src/domain/path.ts`
- Test: `tests/domain/path.test.ts`

**Interfaces:**
- Consumes: `Song` (`src/db/types.ts`), `FINAL_LISTEN_DAYS` (`src/domain/finalListen.ts`).
- Produces:
  - `type StageId = 'listen' | 'analyze' | 'study' | 'triage' | 'review' | 'final'`
  - `type StageState = 'done' | 'partial' | 'current' | 'todo'`
  - `type Stage = { id: StageId; name: string; state: StageState; detail: string | null; action: 'analyzing' | 'triage' | 'finalListen' | null }`
  - `songPath(input: { song: Song; toTriage: number; unlocked: number; lines: number; finalReady: boolean; now: Date }): Stage[]` — D1 (l'azione «Ritornello» della tappa Studio la aggiunge lo Studio, non il dominio).

- [ ] **Step 1: Write the failing tests**: una riga per ogni stato di ogni tappa di D1, compresi «tra N giorni» (studio iniziato 2 giorni e 1 ora fa → «tra 5 giorni»; 6 giorni e 23 ore fa → «tra 1 giorno»), «+N», «N%» senza prima, testo libero (5 tappe, «Lettura»), canzone in coda (Analisi `current` con azione), Review Focus 1.
- [ ] **Step 2: Run** `npm test -- tests/domain/path.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: song path stages from saved data`.

### Task 2: Percorso e testata nello Studio

**Files:**
- Create: `src/ui/components/SongPath.tsx`, `src/ui/components/MoreMenu.tsx`
- Modify: `src/ui/screens/Study.tsx`, `src/styles/base.css`
- Test: `tests/ui/song-path.test.tsx`, `tests/ui/more-menu.test.tsx`, `tests/ui/study.test.tsx` (aggiornare solo i selettori dei pulsanti spostati)

**Interfaces:**
- Consumes: Task 1; `pendingWords` (`src/domain/triage.ts`), `unlockedLines`/`rCardStates` (`src/domain/unlocked.ts`), `finalListenDue` (`src/domain/finalListen.ts`), `chorusLines` (`src/domain/chorus.ts`), `href` (`src/router.ts`).
- Produces:
  - `SongPath({ stages, songId, chorus }: { stages: Stage[]; songId: string; chorus: boolean })` — `<ol aria-label="Percorso della canzone">`, una voce per tappa con pallino (forma per stato), nome e dettaglio; una tappa con azione è un link (`href` dell'azione; tappa Studio con `chorus` → `chorus`); il nome accessibile di ogni voce dice nome, stato a parole («fatta», «in corso», «da fare», «ora») e dettaglio.
  - `MoreMenu({ label, items }: { label: string; items: { text: string; onSelect(): void; danger?: boolean }[] })` — D3.

- [ ] **Step 1: Write the failing tests**: `SongPath` — 6 voci, link solo per le tappe con azione, nomi accessibili; `MoreMenu` — chiuso all'inizio, Invio apre, Esc chiude e il fuoco torna al pulsante, tocco fuori chiude, selezione chiama `onSelect` e chiude (Review Focus 3); Studio — percorso con i dati veri (canzone con 2 parole da smistare → Smista «2 da fare» con link a Smista; riascolto pronto → link al riascolto), «Apri in Spotify ↗» nella testata, «Chiedi a Gemini» fluttuante, «Ritornello a voce» dalla tappa Studio, «Segna come completata» ed «Elimina canzone» dal menu «⋯» con le conferme di oggi; testo libero senza Spotify e con 5 tappe (Review Focus 2).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Study shows the song path, actions move to the path and a menu`.

### Task 3: Pallini del percorso nel carosello di Oggi

**Files:**
- Modify: `src/ui/components/SongCarousel.tsx` (`CarouselItem.stages?: StageState[]`), `src/ui/screens/Today.tsx` (calcola `songPath` per ogni riga con i dati che ha già), `src/styles/base.css`
- Test: `tests/ui/song-carousel.test.tsx`, `tests/ui/today.test.tsx`

- [ ] **Step 1: Write the failing tests**: carosello — con `stages` 6 pallini `aria-hidden` con classe per stato; senza `stages` nulla; Oggi — una canzone in studio con parole da smistare ha il 4° pallino `partial`; il testo accessibile della copertina non cambia.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: path dots under each song in Today's carousel`.

### Task 4: Canzoni come scaffale

**Files:**
- Modify: `src/ui/screens/Songs.tsx`, `src/ui/components/Cover.tsx` (fonte del testo libero sulla copertina generata), `src/styles/base.css`
- Test: `tests/ui/songs*.test.tsx`, `tests/ui/consistency.test.tsx` (aggiornare solo i selettori)

**Interfaces:**
- Consumes: Task 2 (`MoreMenu`), `averageGain`-style per canzone (`comprehensionAfter - comprehensionBefore`), `unlockedBySong`.

- [ ] **Step 1: Write the failing tests**: due canzoni aperte e una completata → griglia con le aperte prima e il titolo «Completate» prima della completata; la completata ha «+28»; copertina con anello se ci sono versi; il link apre lo Studio (o l'analisi per le bozze); «⋯» → «Modifica» apre il modulo a tutta riga, «Elimina» chiede conferma con `DELETE_NOTE`, «Apri in Spotify ↗» solo con link; testo libero con «Podcast» sulla copertina (Review Focus 2); le note di oggi («N% prima», «X di Y versi sbloccati») restano.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Songs becomes a shelf of covers`.

### Task 5: Lessico — composizione e forza

**Files:**
- Modify: `src/domain/lexicon.ts` (`LexFilter.type?`, `composition(entries)`), `src/ui/screens/Lexicon.tsx`, `src/styles/base.css`
- Test: `tests/domain/lexicon.test.ts`, `tests/ui/lexicon.test.tsx`

**Interfaces:**
- Produces: `composition(entries: LexEntry[]): { type: LexEntry['type']; label: string; count: number }[]` — ordine fisso (phrasal verb, idiomi, collocazioni, frasi fisse, slang, parole), con le etichette italiane della legenda dello Studio (`LEGEND` in `src/ui/screens/Study.tsx`: riusarle spostandole in un modulo comune se servono a due schermate); `strength(status: LexStatus): 0 | 1 | 2 | 3`.

- [ ] **Step 1: Write the failing tests**: `composition` conta per tipo, tipi a 0 inclusi; filtro `type`; `strength` per ogni stato; Lessico — la striscia ha un pulsante per tipo con conteggio > 0, larghezze proporzionali (stile `flex-grow` = conteggio), toccare «Idiomi» filtra e `aria-pressed`, ritoccare toglie; combinato con ricerca e chip (Review Focus 4); tre tacche per riga con quelle accese secondo lo stato.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Lexicon composition strip and strength ticks`.

### Task 6: Lessico — vista per canzone

**Files:**
- Modify: `src/ui/screens/Lexicon.tsx`, `src/styles/base.css`, `docs/design.md` (percorso, scaffale, collezione)
- Test: `tests/ui/lexicon.test.tsx`

- [ ] **Step 1: Write the failing tests**: controllo «Tutte» / «Per canzone» (radio o segmented come il tema nelle Impostazioni); «Per canzone» → un `h2` per canzone in ordine di `addedAt` con copertina, le voci sotto; voci di Espandi in «Altre voci»; filtri applicati anche ai gruppi, gruppo vuoto assente, «Nessuna voce con questi filtri.» quando nulla (Review Focus 4).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Lexicon grouped by song`.

### Task 7: End-to-end

**Files:**
- Create: `tests/e2e/shelf-path.spec.ts`

Dati in IndexedDB come in `tests/e2e/unlocked.spec.ts` (nessuna rete), viewport 390 × 844: una canzone in studio con un titolo lungo, 2 parole da smistare, un chunk; una canzone completata con `comprehensionBefore` 40 e `comprehensionAfter` 68; un testo libero «Podcast».

- [ ] **Step 1: Write the test**: Oggi → la copertina ha 6 pallini → Studio → percorso con «Smista 2 da fare» → il link apre Smista → indietro → menu «⋯» si apre e si chiude con Esc → Canzoni: griglia, «Completate», «+28», «Podcast» → Lessico: striscia, tocca un tipo, vista «Per canzone» con le intestazioni; in ogni schermata `scrollWidth <= clientWidth` (Review Focus 5).
- [ ] **Step 2: Run** `npm run build && npx playwright test` — Expected: tutti verdi.
- [ ] **Step 3: Commit** `test: e2e song path, shelf and collection`.
