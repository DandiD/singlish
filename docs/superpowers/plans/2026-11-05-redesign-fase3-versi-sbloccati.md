# Redesign · Fase 3 — Versi sbloccati: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raccontare il progresso in versi capiti: una regola nel dominio dice quali versi di una canzone sono sbloccati; la fine sessione mostra quelli appena sbloccati (o le voci più forti), lo Studio accende le righe sbloccate, e il numero di avanzamento delle canzoni diventa «X di Y versi sbloccati».

**Architecture:** Un modulo puro nuovo `src/domain/unlocked.ts` calcola i versi sbloccati di una canzone dagli stati FSRS delle card Riconosci; due funzioni asincrone confrontano lo stato all'inizio della sessione (salvato nella riga `sessions`) con quello alla fine e trovano le voci con la stabilità cresciuta di più (salvata nei `reviews`). Oggi, Riascolto finale, Canzoni e Studio usano la stessa funzione per il numero; Session la usa per la fine.

**Tech Stack:** Preact + TypeScript strict, Dexie, ts-fsrs 6, Vitest + @testing-library/preact + fake-indexeddb + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-engagement-design.md` (§5.2 «Fine sessione», §5.3 «Testo vivo», §6.2, §7.4, §8.1–8.3, §9, §12 fase 3). Regole: `docs/spec.md`, `docs/design.md` («Coerenza dei dati fra schermate», «Movimento»), `CLAUDE.md`.

## Global Constraints

- Nessuna dipendenza nuova; colori solo da variabili di `src/styles/tokens.css`; touch target ≥ 44 px; `prefers-reduced-motion: reduce` → stato finale senza animazione.
- Tempo iniettato (`now: Date`) nel dominio; test senza rete; testi di canzoni inventati.
- Ogni numero si calcola in un solo punto: i versi sbloccati di una canzone vengono solo da `unlockedLines`; Oggi, Riascolto finale, Canzoni e Studio dicono lo stesso numero.
- Nessuna migrazione e nessuna versione nuova di Dexie: solo campi facoltativi nuovi (`SessionRow.unlockedAtStart?`, `Review.stability?`, `Song.unlockedSeen?`), senza indici. Il backup li porta già (`importBackup` copia le righe con lo spread).
- Testo dell'interfaccia in italiano. Restano con le stesse parole: «Da analizzare», «Da studiare · …», «N parole da smistare nello Studio», «Nessuna voce nel ripasso: le trovi sospese nel Lessico», «Nessuna voce da ripassare in questa canzone», «Sessione finita» / «Fatto per oggi», il conteggio «N ripassate · N nuove · N frasi scritte», «N card ancora da fare oggi», il pulsante «Correggi le frasi».
- Plurale: «1 verso sbloccato», «N versi sbloccati»; nel conteggio il nome segue il totale: «0 di 1 verso sbloccato», «3 di 14 versi sbloccati». Vale anche per i testi liberi (si dice «versi» anche lì).
- Un commit per task, messaggio in inglese, con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisioni di questo piano (rispetto alla spec)

- D1. «Ultimo voto della R diverso da Di nuovo» (§8.2) si verifica con lo stato FSRS: con i passi di riapprendimento attivi (predefiniti in ts-fsrs 6, usati da `createScheduler`) un «Di nuovo» porta sempre una card in Review a Relearning. La regola diventa: **card R in stato `State.Review`**. Un test d'integrazione con `recordReview` lo fissa (Task 1).
- D2. Le voci di un verso si leggono dai `contexts` della voce (`songId` e `lineIndex` validi), non dalle evidenziazioni: una voce che il testo non riesce a evidenziare conta lo stesso sul suo verso. Contano i chunk non sospesi e le parole non sospese con `triage === 'learn'` (le parole da smistare non contano, come in Oggi; le note neppure).
- D3. «Prima/dopo la sessione» (§8.1 `newlyUnlocked`): all'apertura di una **sessione nuova** si salva in `sessions.unlockedAtStart` l'elenco dei versi già sbloccati (`"<songId>:<lineIndex>"`). Una sessione ripresa lo ritrova; una sessione aperta prima di questa versione non lo ha → la fine mostra solo il ripiego delle voci più forti, mai un falso elenco.
- D4. «Stabilità cresciuta di più» (§5.2): `recordReview` salva in ogni ripasso `stability: { before, after }`. Crescita di una voce = somma di `after − before` dei suoi ripassi (tutte le card della voce) dall'inizio della sessione, contando solo i voti diversi da «Di nuovo». Si mostrano le 3 voci con la crescita maggiore (> 0). Ripassi di prima senza `stability` non contano.
- D5. Se non c'è né un verso sbloccato né una voce cresciuta (sessione di soli «Di nuovo»), la sezione non compare: meglio niente che un elenco vuoto.
- D6. La fine sessione mostra al massimo 6 versi, poi «e altri N versi» (o «e un altro verso»).
- D7. «Verso che si accende» (§7.4): lo Studio ricorda in `songs.unlockedSeen` (indici di riga) i versi sbloccati già mostrati; all'apertura le righe sbloccate che non c'erano si accendono una alla volta, poi `unlockedSeen` diventa l'elenco attuale. Un verso che torna tenue esce dall'elenco senza avvisi, così se si risblocca si riaccende.
- D8. «Versi sbloccati in totale» in Progressi arriva con il Diario (fase 4). In Canzoni (che diventa scaffale in fase 6) per ora si aggiunge solo una riga di nota con il conteggio.

## Review Focus

1. **Sessione ripresa aperta prima della nuova versione** (riga `sessions` senza `unlockedAtStart`) — nessun elenco «Oggi hai sbloccato», solo le voci più forti. Test in Task 3.
2. **Voce su più versi o su più canzoni** — conta su ciascun verso della canzone, mai su un'altra canzone. Test in Task 1.
3. **Testo modificato dopo l'analisi** (contesto con `lineIndex` fuori dal testo) — il verso inesistente si ignora, nessun crash né conteggio gonfiato. Test in Task 1.
4. **Verso che si riblocca dopo un «Di nuovo»** — nello Studio torna tenue senza animazioni, e il numero in Oggi scende. Test in Task 1 (integrazione) e Task 5.
5. **Sessione di soli «Di nuovo»** — la fine non mostra una sezione vuota. Test in Task 3.

---

### Task 1: Regola del verso sbloccato

**Files:**
- Create: `src/domain/unlocked.ts`
- Test: `tests/domain/unlocked.test.ts`

**Interfaces:**
- Consumes: `Song`, `Chunk`, `Word`, `CardRow` (`src/db/types.ts`), `State` da `ts-fsrs`, `recordReview` (`src/domain/scheduler.ts`, solo nel test d'integrazione).
- Produces:
  - `type LineUnlock = { lineIndex: number; itemIds: string[]; unlocked: boolean }`
  - `unlockedLines(song: Song, chunks: Chunk[], words: Word[], rState: Map<string, State>): { lines: LineUnlock[]; unlocked: number; total: number }` — pura. `rState`: id della voce → stato FSRS della sua card R. `lines` ordinate per `lineIndex`, solo versi con almeno una voce (D2); `unlocked` = versi con tutte le voci in `State.Review` (D1); `total = lines.length`. Una voce senza card R non è sbloccata. Una voce con due contesti sullo stesso verso conta una volta.
  - `rCardStates(db: SinglishDB): Promise<Map<string, State>>` — dalle card con `kind === 'R'` (indice `kind`).
  - `lineKey(songId: string, lineIndex: number): string` → `` `${songId}:${lineIndex}` ``.

- [ ] **Step 1: Write the failing tests** (`tests/domain/unlocked.test.ts`, testi inventati):
  - un verso con due voci, entrambe Review → `unlocked: 1, total: 1`; una delle due Learning → `unlocked: 0`;
  - Relearning, New e voce senza card R → non sbloccato;
  - chunk sospeso, parola `known`, parola `pending`: non contano; un verso che ha solo voci così non compare in `lines` (`total` 0);
  - voce con contesti su due versi della stessa canzone → compare in entrambi; contesto su un'altra canzone → ignorato (Review Focus 2);
  - contesto con `lineIndex` oltre `song.lines.length` → ignorato (Review Focus 3);
  - due contesti sullo stesso verso → `itemIds` senza doppioni;
  - integrazione (`createDb('t-' + crypto.randomUUID())`): card R portata in Review con `recordReview` (voti «Bene» con `now` che avanza oltre `due`), verso sbloccato con `rCardStates`; poi `recordReview` con voto 1 → verso non più sbloccato (D1, Review Focus 4).
- [ ] **Step 2: Run** `npx vitest run tests/domain/unlocked.test.ts` — Expected: FAIL (modulo mancante).
- [ ] **Step 3: Implement** `src/domain/unlocked.ts` con le firme sopra.
- [ ] **Step 4: Run** `npx vitest run tests/domain/unlocked.test.ts && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: unlocked lines rule from R card states`.

### Task 2: Prima e dopo la sessione (dominio)

**Files:**
- Modify: `src/db/types.ts` (`SessionRow.unlockedAtStart?: string[]`, `Review.stability?: { before: number; after: number }`), `src/domain/scheduler.ts` (`recordReview` salva `stability`)
- Modify: `src/domain/unlocked.ts`
- Test: `tests/domain/unlocked-session.test.ts`, una riga in `tests/domain/scheduler.test.ts` (o il file che già testa `recordReview`)

**Interfaces:**
- Consumes: Task 1; `itemsInSong`, `Span` (`src/domain/songItems.ts`).
- Produces:
  - `unlockedKeys(db: SinglishDB): Promise<string[]>` — `lineKey` di tutti i versi sbloccati delle canzoni con stato `studying` o `done`.
  - `type UnlockedVerse = { song: Song; lineIndex: number; line: string; spans: Span[]; translation: string | null }`
  - `newlyUnlocked(db: SinglishDB, before: string[]): Promise<UnlockedVerse[]>` — versi sbloccati ora (come `unlockedKeys`) che non sono in `before`; ordine: canzone per `addedAt`, poi `lineIndex`. `spans` = `itemsInSong(...).spansByLine[lineIndex]` senza quelli con id che inizia per `cs:`; `translation` da `song.lineTranslations` (o `null`).
  - `type StrongItem = { itemId: string; text: string; meaningIt: string; song: Song | null; growth: number }` — `text` = `baseForm` del chunk o `lemma` della parola; `song` = canzone di casa (`songId` della voce) se esiste.
  - `strongestSince(db: SinglishDB, since: Date, limit = 3): Promise<StrongItem[]>` — D4; ordine per `growth` decrescente, a parità per `text`.

- [ ] **Step 1: Write the failing tests**:
  - `recordReview` salva `stability.before` = stabilità della card prima e `stability.after` = quella dopo (`after > before` su un «Bene» da Review);
  - `unlockedKeys`: canzoni `studying` e `done` contano, `analyzed`/`draft` no;
  - `newlyUnlocked`: con `before` che contiene un verso già sbloccato → torna solo quello nuovo, con `line`, `spans` (senza `cs:`), `translation`; `before` vuoto e nessun verso sbloccato → `[]`; ordine fra due canzoni per `addedAt`;
  - `strongestSince`: tre voci con crescite diverse + una con solo «Di nuovo» + una con ripasso prima di `since` + una con ripasso senza `stability` → le tre giuste nell'ordine giusto; `limit` rispettato; nessuna crescita → `[]` (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run tests/domain/unlocked-session.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** campi, `recordReview`, funzioni.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS (i test esistenti di `recordReview` non cambiano).
- [ ] **Step 5: Commit** `feat: session snapshot of unlocked lines and stability growth per review`.

### Task 3: Fine sessione «Versi sbloccati»

**Files:**
- Modify: `src/ui/screens/Session.tsx` (creazione della sessione nuova: `unlockedAtStart: await unlockedKeys(db)`; schermata di fine nel ramo `items.length === 0 || finished` — non nel ramo «Niente da ripassare»)
- Create: `src/ui/components/UnlockedVerses.tsx`
- Modify: `src/styles/base.css` (stili della sezione, colori solo da token, bordo sinistro con la tinta `--song-N` come nelle altre copertine)
- Test: `tests/ui/session-unlocked.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`unlockedKeys`, `newlyUnlocked`, `strongestSince`); `Cover` (`src/ui/components/Cover.tsx`, `size="sm"`), `Highlighted` (`src/ui/components/Highlighted.tsx`), `songLook` (`src/ui/cover.ts`), `plural` (`src/ui/plural.ts`).
- Produces: `UnlockedVerses({ verses, strongest }: { verses: UnlockedVerse[] | null; strongest: StrongItem[] })` — `verses === null` vuol dire «sessione senza istantanea» (D3).

Contenuto della fine (sotto il titolo, sopra il conteggio che resta com'è, in secondo piano):
- con versi: `<h2>` «Oggi hai sbloccato 1 verso» / «Oggi hai sbloccato N versi»; una lista (`<ul aria-label="Versi sbloccati">`) con per ogni verso: copertina piccola e titolo della canzone, il verso in `lang="en"` con le evidenziazioni, la traduzione sotto (se c'è); al massimo 6, poi «e un altro verso» / «e altri N versi» (D6);
- senza versi ma con voci cresciute (o `verses === null`): `<h2>` «Le voci più forti di oggi» e una lista con testo della voce (`lang="en"`), significato e titolo della canzone;
- né l'uno né l'altro: niente (D5).
I dati si calcolano una volta quando la sessione finisce (`since` = `startedAt` della sessione); finché non ci sono, la sezione non c'è (il resto della fine si vede subito).

- [ ] **Step 1: Write the failing tests** (`tests/ui/session-unlocked.test.tsx`; dati inventati; una card R in Relearning in scadenza, che con «Bene» passa a Review — verificare prima con `recordReview` che lo faccia):
  - una card, «Bene» → «Oggi hai sbloccato 1 verso», il verso e la traduzione; il conteggio «1 ripassata · 0 nuove» resta;
  - verso già sbloccato prima della sessione → non compare fra i nuovi;
  - sette versi sbloccati in una sessione → 6 righe e «e un altro verso»;
  - sessione ripresa senza `unlockedAtStart` → nessun «Oggi hai sbloccato», sì «Le voci più forti di oggi» (Review Focus 1);
  - solo «Di nuovo» → nessuna delle due intestazioni (Review Focus 5);
  - la sessione nuova salva `unlockedAtStart` (leggere la riga da `db.sessions`).
- [ ] **Step 2: Run** `npx vitest run tests/ui/session-unlocked.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS, compresi i test esistenti di `tests/ui/session.test.tsx`.
- [ ] **Step 5: Commit** `feat: session end shows the lines unlocked today`.

### Task 4: «X di Y versi sbloccati» in Oggi, Riascolto finale e Canzoni

**Files:**
- Modify: `src/ui/todayText.ts` (`SongRow`, `songDetail`, `songLabel`), `src/ui/screens/Today.tsx` (calcolo delle righe e `progress` del carosello), `src/ui/screens/FinalListen.tsx` (riepilogo), `src/ui/screens/Songs.tsx` (nota)
- Test: `tests/ui/today.test.tsx`, `tests/ui/final-listen.test.tsx`, `tests/ui/consistency.test.tsx`, `tests/ui/song-carousel.test.tsx` se serve; aggiornare solo le stringhe cercate che cambiano

**Interfaces:**
- Consumes: Task 1 (`unlockedLines`, `rCardStates`).
- Produces: `SongRow = { song: Song; items: number; lines: number; unlocked: number; toTriage: number; suspended: number }` — `items` = voci contate come oggi (quelle di `itemsInSong` meno le parole da smistare), usato da «Da studiare · N chunk e parole» e dai casi `items === 0`.

Testi:
- `songDetail`, canzone in studio o completata con `lines > 0`: «3 di 14 versi sbloccati» (+ « · N parole da smistare» come oggi); `lines === 0` → gli stessi rami di oggi per `items === 0`. Gli altri rami non cambiano.
- `songLabel` con `lines > 0`: «3 di 14 versi» (o «0 di 1 verso»); il resto uguale.
- Carosello: `progress = lines > 0 ? unlocked / lines : null`.
- Riascolto finale: «3 di 14 versi sbloccati: gli altri si sbloccano con le prossime sessioni. La canzone passa tra le completate.»; tutti sbloccati → «14 di 14 versi sbloccati. La canzone passa tra le completate.»; `lines === 0` → solo «La canzone passa tra le completate.».
- Canzoni: per le canzoni `studying` e `done` con `lines > 0`, una riga `<p class="note">` con lo stesso testo di `songDetail` per i versi (senza le parole da smistare).

- [ ] **Step 1: Update/write the failing tests**: `songDetail`/`songLabel` per ogni ramo nuovo (incluso singolare); Oggi con una canzone 1 di 2 versi → testo accessibile e anello del carosello al 50%; Riascolto finale nei tre casi; Canzoni mostra la nota; `consistency.test.tsx`: Oggi, Riascolto finale, Canzoni e testa dello Studio (Task 5 lo aggiunge; qui Oggi, Riascolto e Canzoni) dicono lo stesso «N di M»; un «Di nuovo» che riblocca un verso fa scendere il numero in Oggi (Review Focus 4).
- [ ] **Step 2: Run** i file toccati — Expected: FAIL sui testi nuovi.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: songs count unlocked lines in Today, final listen and Songs`.

### Task 5: Testo vivo nello Studio

**Files:**
- Modify: `src/db/types.ts` (`Song.unlockedSeen?: number[]`), `src/ui/screens/Study.tsx`, `src/styles/base.css`, `src/styles/motion.css`, `docs/design.md` (versi sbloccati: regola, testo vivo, movimento, campi nuovi)
- Test: `tests/ui/study.test.tsx` (o un file nuovo `tests/ui/study-unlocked.test.tsx`), `tests/ui/consistency.test.tsx` (testa dello Studio)

**Interfaces:**
- Consumes: Task 1.

Comportamento:
- Ogni `<p>` del testo (non in modalità «Chiedi a Gemini») ha la classe `line-open` se il verso ha voci ed è sbloccato, `line-studying` se ha voci e non è sbloccato; i versi senza voci restano come oggi. `line-studying` usa `--text-2`, `line-open` `--text`.
- Testa: «Studio · 3 chunk · 4 parole · 2 di 9 versi sbloccati» (l'ultima parte solo con `lines > 0`), così il dato non è solo nel colore (§9).
- D7: righe sbloccate non in `unlockedSeen` → anche classe `line-lit` con `style="--i: <k>"` (k = ordine fra le righe accese); dopo il primo render si salva `unlockedSeen` = righe sbloccate attuali (solo se cambia). `line-lit` anima il colore da `--text-2` a `--text` in `--t-med`, con ritardo `calc(var(--i) * var(--t-med))`; con riduzione del movimento nessuna animazione.

- [ ] **Step 1: Write the failing tests**: classi per riga (sbloccata, in studio, senza voci); testa con il conteggio e senza quando `lines === 0`; primo ingresso → `line-lit` sulla riga sbloccata e `unlockedSeen` salvato; secondo ingresso → nessun `line-lit`; verso che si riblocca → `line-studying`, nessun `line-lit`, e `unlockedSeen` lo perde (Review Focus 4); in modalità «Chiedi a Gemini» nessuna classe; consistency: testa dello Studio = Oggi.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (CSS solo con variabili dei token; regola di riduzione del movimento in `motion.css` come le altre).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Study lights up unlocked lines`.

### Task 6: Giro completo end-to-end

**Files:**
- Create: `tests/e2e/unlocked.spec.ts`

Come `tests/e2e/today-layout.spec.ts`, si scrive in IndexedDB (`singlish`) una canzone inventata in studio con due versi, un chunk sul verso 0 con la sua card R in Relearning in scadenza (campi FSRS completi, come li scrive ts-fsrs 6) e la card C bloccata (`goodRCount: 0`, così il «Bene» non sblocca la C e la coda resta vuota); nessuna rete (rotte esterne abortite come in `mvp.spec.ts`).

- [ ] **Step 1: Write the test**: Oggi → «Inizia il giro» → card Riconosci → rivela → «Bene» → fine con «Oggi hai sbloccato 1 verso» e il verso → «Torna a Oggi» → anello «Fatto per oggi» e la copertina dice «1 di 1 verso» → Studio della canzone: il verso 0 ha `line-open`.
- [ ] **Step 2: Run** `npm run build && npx playwright test tests/e2e/unlocked.spec.ts` — Expected: PASS; poi `npx playwright test` tutto verde.
- [ ] **Step 3: Commit** `test: e2e round from Today to unlocked lines and back`.
