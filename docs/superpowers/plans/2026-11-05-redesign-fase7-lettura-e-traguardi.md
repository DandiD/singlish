# Redesign · Fase 7 — Lettura a tempo e traguardi rari: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere la lettura a tempo (il testo una riga alla volta, grande, mentre si ascolta con Spotify) come tappa dello Studio, e pochi traguardi rari legati al metodo, calcolati dai dati, mostrati una volta come foglio dal basso e poi elencati nel Diario.

**Architecture:** Funzioni pure nuove in `src/domain/readAlong.ts` (righe da leggere) e `src/domain/milestones.ts` (traguardi raggiunti dai dati); una schermata nuova `ReadAlong.tsx` sulla rotta `#/songs/:id/read`; un hook `useWakeLock` estratto da `useTimer`; un foglio `MilestoneSheet` mostrato da Oggi. Campi nuovi facoltativi: `songs.readAlongAt?`, `settings.milestonesSeen?`.

**Tech Stack:** Preact + TypeScript strict, Dexie, Vitest + @testing-library/preact + fake-indexeddb + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-engagement-design.md` (§5.3 «Lettura a tempo», §6.3, §6.4, §7.4 riga «Traguardo», §7.5, §8.1 `milestones`, §8.3, §9, §12 fase 7). Regole: `docs/spec.md`, `docs/design.md`, `CLAUDE.md`.

## Global Constraints

- Nessuna dipendenza nuova; colori solo da variabili di `src/styles/tokens.css`; touch target ≥ 44 px; `prefers-reduced-motion: reduce` → foglio senza impulso, nessuna transizione fra righe.
- Tempo iniettato (`now: Date`); test senza rete; testi di canzoni inventati.
- Nessuna migrazione: `Song.readAlongAt?: Date | null`, `Settings.milestonesSeen?: Record<string, Date>`; il backup li porta (le date si riconvertono all'import come le altre: aggiungerle a `importBackup`).
- Nessun audio nell'app, nessuna sincronizzazione automatica (§5.3).
- Traguardi (§6.3): pochi, mai assegnati da eventi, sempre ricalcolati dai dati; si salva solo la data in cui sono stati mostrati. Nessuna valuta, nessun punteggio, nessuna notifica (§6.4).
- Testo italiano: «Leggi a tempo» (canzoni) / «Leggi riga per riga» (testi), «Letta tutta» / «Letto tutto», «Solo il ritornello», «ritornello» (segno sulle righe ripetute), «Avanti», «Indietro», «Traguardi».
- Un commit per task, messaggio in inglese, con la riga `Co-Authored-By:` del modello che scrive.

## Decisioni di questo piano (rispetto alla spec)

- D1. Righe della lettura: quelle del testo non vuote (dopo `trim`), nell'ordine; una riga è «ritornello» se la sua forma normalizzata è fra quelle di `chorusLines(song.lines)` (stessa normalizzazione: esportare da `src/domain/chorus.ts` un `isChorusLine(lines, line)` o il `norm`).
- D2. «Leggi a tempo» sostituisce «Ritornello a voce» come azione della tappa Studio del percorso (`SongPath`); il Ritornello resta raggiungibile dalla lettura con «Solo il ritornello» (solo se la canzone ha un ritornello). Dettaglio della tappa Studio: «letta il 5 novembre» (o «letto» per i testi) se `readAlongAt` c'è.
- D3. Comandi: metà destra dello schermo o `ArrowRight`/`Space`/`PageDown` → avanti; metà sinistra o `ArrowLeft`/`PageUp` → indietro; due pulsanti «Indietro» e «Avanti» da 44 px in basso. Sull'ultima riga «Avanti» diventa «Letta tutta» (o «Letto tutto»): salva `readAlongAt = now` e torna allo Studio. «✕» in alto esce senza salvare.
- D4. Voci nella riga corrente: le evidenziazioni di sempre (`itemsInSong(...).spansByLine[lineIndex]`, senza parlato connesso); toccare una voce apre una nuvoletta con il significato (`meaningIt`) sotto la riga, senza cambiare riga (il tocco sulla voce non conta come «avanti»); Esc o un altro tocco la chiudono.
- D5. Accessibilità: la riga corrente è in una regione `aria-live="polite"`; la riga dopo è `aria-hidden`; «Riga N di M» visibile in piccolo.
- D6. Schermo acceso: `useWakeLock(active: boolean)` estratto da `src/ui/useTimer.ts` (stesso codice, `useTimer` lo usa), attivo per tutta la lettura.
- D7. Traguardi (id → condizione, dai dati attuali):
  - `song-all-unlocked`: almeno una canzone con `lines > 0` e `unlocked === lines`.
  - `final-gain-20`: almeno una canzone con `comprehensionAfter − comprehensionBefore ≥ 20`.
  - `active-50`, `active-150`, `active-500`: `progressStats(...).active ≥ N`.
  - `week-goal`: almeno una settimana (lun–dom, giorni locali) con giorni attivi ≥ obiettivo attuale (`rhythmGoalOf`), contando ripassi e `freeDays`; `week-goal-4`: quattro settimane consecutive così.
  - `level-up`: `nextLevel` esiste, `activeAtLevel ≥ LEVEL_UP.active` e `currentComprehension ≥ LEVEL_UP.comprehension`.
  Titoli e frasi: «Una canzone tutta capita» / «Tutti i versi di «<titolo>» sono sbloccati.»; «Venti punti in più» / «Al riascolto finale di «<titolo>» hai capito 20 punti in più.»; «50 voci attive» (150, 500) / «Le usi senza aiuto: le riconosci e le completi.»; «Una settimana a ritmo» / «Hai raggiunto l'obiettivo della settimana.»; «Quattro settimane di fila» / «Quattro settimane a ritmo, una dopo l'altra.»; «Pronto per il <livello>» / «Puoi alzare il livello nelle Impostazioni.».
- D8. Prima apertura con questa versione (`milestonesSeen` assente): tutti i traguardi già raggiunti si segnano come visti con la data di oggi, senza mostrarli (niente raffica di fogli per chi usa l'app da tempo, o dopo un backup vecchio).
- D9. Oggi mostra al massimo **un** foglio di traguardo per apertura, il primo non visto nell'ordine di D7; chiuderlo («Bene») salva `milestonesSeen[id] = now`. Il foglio ha un impulso unico (`--t-med`) e la vibrazione (`buzz`, fase 5). Il Diario elenca i traguardi raggiunti con la data in cui sono stati visti, in una sezione «Traguardi» in fondo; senza traguardi la sezione non c'è.

## Review Focus

1. **Testo con righe vuote, ripetute, lunghissime** — le vuote si saltano; il segno «ritornello» solo sulle righe ripetute; una riga lunga va a capo senza scroll orizzontale a 390 px. Test in Task 1, 2 e 6.
2. **Tocchi che non devono avanzare** — toccare una voce (nuvoletta), i pulsanti, «✕» o «Solo il ritornello» non cambia riga; il primo «Indietro» sulla prima riga non fa nulla. Test in Task 2.
3. **Uscire senza finire** — «✕», il tasto indietro del telefono, cambiare scheda: nessun `readAlongAt`; il blocco dello schermo si rilascia. Test in Task 2.
4. **Traguardo raggiunto e poi perso** (verso che si riblocca, obiettivo alzato) — se già visto resta nel Diario con la sua data; se mai visto non si mostra più finché non torna vero. Test in Task 4 e 5.
5. **Backup e prima apertura** — un backup con `milestonesSeen` non rimostra nulla; un utente esistente senza `milestonesSeen` non vede una raffica (D8). Test in Task 5.

---

### Task 1: Righe da leggere e data di lettura (dominio)

**Files:**
- Create: `src/domain/readAlong.ts`
- Modify: `src/domain/chorus.ts` (esporta la normalizzazione o `isChorusLine`), `src/db/types.ts` (`Song.readAlongAt?`), `src/domain/backup.ts` (data riconvertita all'import)
- Test: `tests/domain/read-along.test.ts`, `tests/domain/backup.test.ts`

**Interfaces:**
- Produces:
  - `type ReadLine = { lineIndex: number; text: string; chorus: boolean }`
  - `readingLines(song: Pick<Song, 'lines'>): ReadLine[]` — D1.
  - `saveReadAlong(db: SinglishDB, songId: string, now: Date): Promise<void>` — solo per canzoni analizzate, in studio o completate.

- [ ] **Step 1: Write the failing tests**: righe vuote e di soli spazi saltate con `lineIndex` originale; ritornello con apostrofi curvi e maiuscole diverse riconosciuto; riga unica ripetuta tre volte → tutte `chorus`; `saveReadAlong` salva la data, non tocca una bozza; backup con `readAlongAt` come stringa → `Date` dopo l'import.
- [ ] **Step 2: Run** `npm test -- tests/domain/read-along.test.ts tests/domain/backup.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: reading lines and read-along date`.

### Task 2: Schermata della lettura a tempo

**Files:**
- Create: `src/ui/screens/ReadAlong.tsx`, `src/ui/useWakeLock.ts`
- Modify: `src/router.ts` (rotta `{ name: 'readAlong'; songId }` ↔ `#/songs/:id/read`, profondità come `chorus`), `src/app.tsx` (titolo «Leggi a tempo», `NO_NAV`), `src/ui/useTimer.ts` (usa `useWakeLock`), `src/styles/base.css`, `src/styles/motion.css`
- Test: `tests/ui/read-along.test.tsx`, `tests/ui/router.test.ts` (o dove si testano le rotte), `tests/ui/timer*.test.ts*` restano verdi

**Interfaces:**
- Consumes: Task 1; `itemsInSong`, `Highlighted` (`src/ui/components/Highlighted.tsx`), `chorusLines`, `href`/`onBack`/`goBackTo`/`stillHere` (`src/router.ts`).

- [ ] **Step 1: Write the failing tests**: la prima riga è nella regione `aria-live`, la seconda in anteprima `aria-hidden`; «Riga 1 di N»; tocco a destra / `ArrowRight` / `Space` → riga 2; tocco a sinistra / `ArrowLeft` → indietro; «Indietro» sulla prima non fa nulla; tocco su una voce → nuvoletta con il significato, riga invariata, Esc la chiude (Review Focus 2); righe vuote saltate e segno «ritornello» (Review Focus 1); ultima riga → «Letta tutta» salva `readAlongAt` e torna allo Studio; testo libero → «Letto tutto», niente Spotify; «✕» esce senza salvare (Review Focus 3); «Solo il ritornello» porta a `chorus` solo se c'è un ritornello; `useWakeLock(true)` chiede il blocco e lo rilascia allo smontaggio (finto `navigator.wakeLock`); canzone inesistente → «Canzone non trovata» come nel Ritornello.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (riga corrente Bricolage 28 px dalla scala tipografica esistente; anteprima `--text-2`; con movimento ridotto nessuna transizione).
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: read-along screen, one line at a time`.

### Task 3: Lettura nella tappa Studio

**Files:**
- Modify: `src/ui/components/SongPath.tsx` (azione della tappa Studio: lettura), `src/ui/screens/Study.tsx`, `src/domain/path.ts` (dettaglio «letta il …» dalla data, con `Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })`)
- Test: `tests/domain/path.test.ts`, `tests/ui/song-path.test.tsx`, `tests/ui/study.test.tsx`, `tests/ui/chorus.test.tsx` (il Ritornello ora si apre dalla lettura: aggiornare solo come ci si arriva)

- [ ] **Step 1: Write the failing tests**: tappa Studio di una canzone in studio → link «Leggi a tempo» alla rotta di lettura; testo libero → «Leggi riga per riga»; con `readAlongAt` il dettaglio è «letta il 5 novembre» («letto» per i testi); bozza → nessun link; dal Ritornello si torna allo Studio come prima.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: read-along from the Study stage of the song path`.

### Task 4: Traguardi (dominio)

**Files:**
- Create: `src/domain/milestones.ts`
- Modify: `src/domain/rhythm.ts` (`weeksReached`), `src/db/types.ts` (`Settings.milestonesSeen?`), `src/domain/backup.ts` (date di `milestonesSeen` riconvertite)
- Test: `tests/domain/milestones.test.ts`, `tests/domain/rhythm.test.ts`, `tests/domain/backup.test.ts`

**Interfaces:**
- Consumes: `progressStats`, `LEVEL_UP` (`src/domain/progress.ts`), `unlockedBySong`/`rCardStates` (`src/domain/unlocked.ts`), `rhythmGoalOf`, `localDayKey`, `weekStart` (`src/domain/rhythm.ts`).
- Produces:
  - `weeksReached(dayKeys: Set<string>, goal: number, now: Date): { any: boolean; fourInARow: boolean }` — settimane lun–dom fino a quella di `now` compresa.
  - `type MilestoneId = 'song-all-unlocked' | 'final-gain-20' | 'active-50' | 'active-150' | 'active-500' | 'week-goal' | 'week-goal-4' | 'level-up'`
  - `type Milestone = { id: MilestoneId; title: string; text: string }`
  - `MILESTONE_ORDER: MilestoneId[]` — l'ordine di D7.
  - `reachedMilestones(db: SinglishDB, now: Date): Promise<Milestone[]>` — D7, in `MILESTONE_ORDER`, con i testi di D7 (il titolo della canzone per i primi due: la prima canzone, per `addedAt`, che soddisfa la condizione; il livello per `level-up`).
  - `markMilestoneSeen(db: SinglishDB, id: MilestoneId, now: Date): Promise<void>` e `seedMilestonesSeen(db: SinglishDB, now: Date): Promise<boolean>` — D8 (`true` se ha seminato).

- [ ] **Step 1: Write the failing tests**: ogni traguardo raggiunto e non raggiunto con dati minimi (una riga per traguardo, compresi i bordi 49/50, guadagno 19/20); `weeksReached` con quattro settimane di fila e con un buco; obiettivo 7 non raggiunto con 6 giorni; settimana a cavallo dell'anno; `seedMilestonesSeen` semina solo se il campo manca e non sovrascrive; `markMilestoneSeen` salva la data; traguardo perso dopo essere stato visto: resta in `milestonesSeen` (Review Focus 4); backup con date stringa → `Date`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: rare milestones computed from saved data`.

### Task 5: Foglio del traguardo in Oggi e Traguardi nel Diario

**Files:**
- Create: `src/ui/components/MilestoneSheet.tsx`
- Modify: `src/ui/screens/Today.tsx`, `src/ui/screens/Progress.tsx`, `src/styles/base.css`, `src/styles/motion.css`, `docs/design.md` (lettura a tempo, traguardi, campi nuovi)
- Test: `tests/ui/milestone-sheet.test.tsx`, `tests/ui/today.test.tsx`, `tests/ui/progress.test.tsx`

**Interfaces:**
- Consumes: Task 4; `buzz` (`src/ui/haptics.ts`).
- Produces: `MilestoneSheet({ milestone, onClose, haptics }: { milestone: Milestone; onClose(): void; haptics?: boolean })` — foglio come `UnlockSheet` (`role="dialog"`, `aria-modal`, fuoco sul foglio, Esc e tocco sullo sfondo chiudono, pulsante «Bene»).

- [ ] **Step 1: Write the failing tests**: Oggi con `milestonesSeen` assente e un traguardo raggiunto → nessun foglio, `milestonesSeen` seminato (Review Focus 5); con `milestonesSeen: {}` e due traguardi → un solo foglio, il primo nell'ordine; «Bene» salva la data e il foglio non ricompare rimontando Oggi; il secondo compare alla prossima apertura; vibrazione chiamata una volta; Esc chiude e salva come «Bene»; Diario — sezione «Traguardi» con titolo e «visto il 5 novembre» per ogni traguardo in `milestonesSeen` che è ancora o era raggiunto (i visti restano anche se persi, Review Focus 4); nessuna sezione senza traguardi visti; `motion.css` ha l'impulso del foglio e la sua regola ridotta.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: milestone sheet in Today and milestones in the Diary`.

### Task 6: End-to-end

**Files:**
- Create: `tests/e2e/read-along.spec.ts`, `tests/e2e/milestones.spec.ts`

Dati in IndexedDB come in `tests/e2e/unlocked.spec.ts`, viewport 390 × 844, nessuna rete.

- [ ] **Step 1: Write the tests**: lettura — canzone in studio con una riga vuota, un ritornello ripetuto e una riga lunghissima; Studio → tappa «Leggi a tempo» → avanti con il tocco a destra e con la tastiera → una voce apre la nuvoletta senza cambiare riga → fino a «Letta tutta» → di nuovo nello Studio con «letta il …»; nessuno scroll orizzontale. Traguardi — impostazioni con `milestonesSeen: {}` e una canzone con tutti i versi sbloccati → Oggi mostra «Una canzone tutta capita» → «Bene» → ricaricando non ricompare → Diario lo elenca.
- [ ] **Step 2: Run** `npm run build && npx playwright test` — Expected: tutti verdi.
- [ ] **Step 3: Commit** `test: e2e read-along and milestones`.
