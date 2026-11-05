# Redesign · Fase 5 — Sessione con ritmo: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere visibile il ritmo della sessione: al posto della barra sottile una fila di segmenti colorati dal voto, una serie silenziosa che brilla dopo 5 risposte di fila senza «Di nuovo», la traduzione del verso che compare quando si rivela il significato, la parola giusta che si aggancia nel buco della Completa e la lettera sbagliata sottolineata, una vibrazione brevissima disattivabile.

**Architecture:** Funzioni pure nuove in `src/domain/sessionRhythm.ts` (segmenti e serie) e in `src/domain/text.ts` (parte diversa di una risposta con un refuso); un componente `RatingSegments` sostituisce la barra in `Session.tsx`; un modulo `src/ui/haptics.ts` vibra rispettando `settings.haptics`. Nessun cambio a FSRS, alla coda o ai conteggi.

**Tech Stack:** Preact + TypeScript strict, Dexie, Vitest + @testing-library/preact + fake-indexeddb + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-engagement-design.md` (§5.2 «Durante», §7.4, §7.5, §8.3 `haptics`, §9, §12 fase 5). Regole: `docs/spec.md`, `docs/design.md` («Movimento»), `CLAUDE.md`.

## Global Constraints

- Nessuna dipendenza nuova; colori solo da variabili di `src/styles/tokens.css`; touch target ≥ 44 px; `prefers-reduced-motion: reduce` → nessuna animazione (il segmento prende il colore senza scala, la parola compare nel buco senza molla, la serie non brilla).
- Tempo iniettato nel dominio; test senza rete; testi inventati.
- Nessun cambio a voti, coda, conteggi, timer: «N di M» in testa resta com'è (anche come testo per lo screen reader).
- Il colore non è l'unica informazione (§9): segmento Bene/Facile **pieno**, Difficile **a metà**, Di nuovo **vuoto con bordo**, frase scritta (Produci) **puntinato**; i segmenti hanno un testo equivalente.
- Nessuna colpa (§5.2): la serie non mostra numeri e non dice nulla quando si interrompe.
- Vibrazione (§7.5): solo su risposta esatta nella Completa e chiusura dell'anello di Oggi (i traguardi arrivano in fase 7); `navigator.vibrate` assente → niente; impostazione `settings.haptics?: boolean`, assente = attiva; interruttore «Vibrazione» nelle Impostazioni.
- Un commit per task, messaggio in inglese, con la riga `Co-Authored-By:` del modello che scrive.

## Decisioni di questo piano (rispetto alla spec)

- D1. Segmenti = una per card della sessione (`total` di oggi in `Session.tsx`). Le card fatte prima di riprendere una sessione (`doneReviews`, `doneNew`, `doneWritten`) non hanno un voto in memoria: segmento **«fatto»** pieno tenue (`--line-strong`), senza leggere i ripassi. Le card ancora da fare sono vuote senza bordo; la corrente ha un anello.
- D2. Serie silenziosa: brilla una volta il segmento della **5ª** risposta consecutiva diversa da «Di nuovo» in questa visita della sessione; poi nient'altro finché un «Di nuovo» non riparte da zero (una serie nuova può brillare di nuovo alla sua 5ª). Le frasi scritte non interrompono e non contano.
- D3. Testo equivalente: il gruppo dei segmenti è `role="img"` con `aria-label` «Voti finora: N Bene o Facile, N Difficile, N Di nuovo» (le parti a 0 si omettono; nessun voto → «Nessun voto finora»).
- D4. Riconosci: al tocco di «Mostra significato» sotto il significato compare la traduzione del verso (`song.lineTranslations` per il `lineIndex` del contesto), in dissolvenza; se manca, nulla. Non nelle voci di Espandi (non hanno verso).
- D5. Completa, risposta esatta (voto proposto 3): il buco del verso mostra la forma attesa con classe `snap` (molla breve `--ease-spring`, `--t-med`). Refuso (voto 2): nella riga «Risposta attesa» la parte diversa della forma attesa è dentro `<u>`; la funzione la trova con prefisso e suffisso comuni (confronto senza maiuscole).
- D6. Chiusura dell'anello: la vibrazione parte insieme all'impulso esistente di `DayRing` (una volta per giorno).

## Review Focus

1. **Sessione lunga (60+ card) a 390 px** — i segmenti restano su una riga, senza scroll orizzontale, ognuno almeno 2 px. Test in Task 2 (stile: larghezza flessibile) e verifica in e2e (Task 5, nessuno scroll orizzontale).
2. **Sessione ripresa** — i segmenti già fatti sono «fatto», la posizione corrente è giusta, la serie riparte da zero. Test in Task 2.
3. **Refuso con lettere ripetute o inserimento/omissione** («recieve»/«receive», «runing»/«running», «wonder»/«wander») — la parte sottolineata è la differenza minima e mai vuota quando c'è un refuso. Test in Task 1.
4. **Dispositivo senza `navigator.vibrate`** (iPhone) o impostazione spenta — nessun errore, nessuna chiamata. Test in Task 4.
5. **Movimento ridotto** — segmenti, aggancio e serie senza animazioni. Test (presenza delle regole in `motion.css`) in Task 2 e Task 3.

---

### Task 1: Dominio (segmenti, serie, refuso)

**Files:**
- Create: `src/domain/sessionRhythm.ts`
- Modify: `src/domain/text.ts`
- Test: `tests/domain/session-rhythm.test.ts`, `tests/domain/text.test.ts`

**Interfaces:**
- Produces:
  - `type SegmentKind = 'full' | 'half' | 'empty' | 'written' | 'done' | 'todo'`
  - `segmentOf(rating: Rating): 'full' | 'half' | 'empty'` — 3, 4 → `full`; 2 → `half`; 1 → `empty`.
  - `type Outcome = { kind: 'rated'; rating: Rating } | { kind: 'written' }`
  - `sessionSegments(input: { doneBefore: number; outcomes: Outcome[]; total: number }): SegmentKind[]` — `doneBefore` × `done`, poi gli esiti di questa visita, poi `todo` fino a `total`.
  - `streakGlowAt(outcomes: Outcome[]): number[]` — indici (negli `outcomes`) delle risposte che brillano (D2).
  - `segmentsLabel(outcomes: Outcome[]): string` — D3.
  - in `text.ts`: `typoSpan(given: string, expected: string): { before: string; diff: string; after: string } | null` — su `expected`; `null` se uguali (senza maiuscole); `diff` mai vuoto quando diversi (per un'omissione nel dato, la lettera attesa mancante; per un'aggiunta, la lettera di `expected` accanto al punto dell'aggiunta).

- [ ] **Step 1: Write the failing tests**: `segmentOf` per 1–4; `sessionSegments` con 2 fatte prima, [3, 2, scritta, 1] e totale 8 → `['done','done','full','half','written','empty','todo','todo']`; `streakGlowAt` — 5 «Bene» → `[4]`; 10 «Bene» → `[4]`; [3,3,3,3,1,3,3,3,3,3] → `[9]`; scritte in mezzo non contano né interrompono; `segmentsLabel` con zeri omessi e caso vuoto; `typoSpan` — «recieve»/«receive», «runing»/«running», «wonder»/«wander», «Wander»/«wander» → `null`, aggiunta «runn»/«run».
- [ ] **Step 2: Run** `npm test -- tests/domain/session-rhythm.test.ts tests/domain/text.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: session rating segments, silent streak and typo span`.

### Task 2: Segmenti in testa alla sessione

**Files:**
- Create: `src/ui/components/RatingSegments.tsx`
- Modify: `src/ui/screens/Session.tsx` (testa: la `.bar` diventa `RatingSegments`; gli esiti di questa visita si tengono in uno stato aggiornato da `rate` e `produce`), `src/styles/base.css`, `src/styles/motion.css`
- Test: `tests/ui/rating-segments.test.tsx`, `tests/ui/session.test.tsx` (o file nuovo `tests/ui/session-segments.test.tsx`)

**Interfaces:**
- Consumes: Task 1.
- Produces: `RatingSegments({ segments, current, glow }: { segments: SegmentKind[]; current: number; glow: number[]; label: string })` — `glow` sono indici nella fila completa (`doneBefore + i`).

- [ ] **Step 1: Write the failing tests**: componente — una `span` per segmento con classe `seg-<kind>`, `seg-current` sull'indice corrente, `seg-glow` sugli indici dati, `role="img"` con l'etichetta; sessione — dopo «Bene» il primo segmento è `seg-full` e il secondo `seg-current`; dopo «Di nuovo» `seg-empty`; dopo una Produci `seg-written`; sessione ripresa con 2 già fatte → i primi due `seg-done`, la corrente è la terza (Review Focus 2); cinque «Bene» di fila → il 5° ha `seg-glow`; il testo «N di M» c'è ancora; CSS: `.seg` con `flex: 1 1 0` e `min-width: 2px` (Review Focus 1), regola di riduzione del movimento in `motion.css` per `.seg` e `.seg-glow` (Review Focus 5, test che legge il file come `tests/ui/tokens.test.ts`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (colori: `full` `--accent`, `half` metà riempita con `linear-gradient` di variabili, `empty` bordo `--line-strong`, `written` bordo puntinato `--accent`, `done` `--line-strong`, `todo` `--surface-2`).
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: rating segments replace the session progress bar`.

### Task 3: Riconosci con la traduzione, Completa che si aggancia

**Files:**
- Modify: `src/ui/screens/Session.tsx` (`SessionCard`), `src/styles/base.css`, `src/styles/motion.css`
- Test: `tests/ui/session.test.tsx` (o `tests/ui/session-cards.test.tsx`)

**Interfaces:**
- Consumes: Task 1 (`typoSpan`).

- [ ] **Step 1: Write the failing tests**: Riconosci con `lineTranslations` per la riga → dopo «Mostra significato» la traduzione è visibile (classe `verse-it`); prima no; senza traduzione nulla; voce di Espandi nulla (D4); Completa esatta → il buco contiene la forma attesa con classe `snap`; refuso → «Risposta attesa» contiene `<u>` con la parte diversa (es. attesa «wander», data «wonder» → `<u>a</u>`); sbagliata (voto 1) → nessun `<u>` e buco vuoto; `motion.css` ha la regola ridotta per `.snap` e `.verse-it`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: line translation on reveal, answer snaps into the gap, typo underlined`.

### Task 4: Vibrazione

**Files:**
- Create: `src/ui/haptics.ts`
- Modify: `src/db/types.ts` (`Settings.haptics?: boolean`), `src/ui/screens/Settings.tsx` (interruttore «Vibrazione» nella sezione ASPETTO, con nota «Una vibrazione brevissima quando la risposta è esatta e quando chiudi l'anello del giorno.»), `src/ui/screens/Session.tsx` (Completa esatta, al momento del «Controlla» con voto proposto 3), `src/ui/components/DayRing.tsx` (insieme all'impulso, D6), `docs/design.md` (segmenti, serie, aggancio, vibrazione)
- Test: `tests/ui/haptics.test.ts`, `tests/ui/settings.test.tsx`, `tests/ui/session.test.tsx`, `tests/ui/day-ring.test.tsx`

**Interfaces:**
- Produces: `buzz(settings: Pick<Settings, 'haptics'>, nav?: { vibrate?: (ms: number) => boolean }): void` — chiama `nav.vibrate(10)` se `settings.haptics !== false` e la funzione esiste; `nav` predefinito `navigator`; mai eccezioni (try/catch).

- [ ] **Step 1: Write the failing tests**: `buzz` con impostazione assente → vibra 10 ms; `false` → no; senza `vibrate` → nessun errore (Review Focus 4); `vibrate` che lancia → nessun errore; Impostazioni — interruttore «Vibrazione» acceso senza campo, spegnerlo salva `haptics: false`; Completa esatta → `navigator.vibrate` chiamato una volta; refuso → non chiamato; `DayRing` allo stato `done` la prima volta → chiamato, la seconda (stessa chiave) no.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (`DayRing` riceve `haptics` come prop o legge le impostazioni da chi lo usa: passarlo da `Today.tsx`).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: optional haptics on exact answers and ring closure`.

### Task 5: End-to-end

**Files:**
- Create: `tests/e2e/session-rhythm.spec.ts`

Dati in IndexedDB come in `tests/e2e/unlocked.spec.ts` (nessuna rete): una canzone in studio con due versi tradotti, due chunk con card R in scadenza e una card C in scadenza (sbloccata) di un terzo chunk.

- [ ] **Step 1: Write the test** (viewport 390 × 844): sessione → la testa ha 3 segmenti; Riconosci → «Mostra significato» → la traduzione del verso è visibile → «Bene» → primo segmento pieno; Riconosci → «Di nuovo» → secondo segmento vuoto; Completa → risposta esatta → «Controlla» → il buco contiene la forma → «Conferma» → fine sessione; in nessun momento `document.documentElement.scrollWidth > clientWidth`.
- [ ] **Step 2: Run** `npm run build && npx playwright test` — Expected: tutti verdi.
- [ ] **Step 3: Commit** `test: e2e session segments, translation and snapping answer`.
