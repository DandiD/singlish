# Redesign · Fase 4 — Ritmo settimanale e Diario: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'idea di serie giornaliera con un ritmo settimanale gentile (5 giorni su 7, regolabile 3–7) visibile in Oggi e a fine sessione, e trasformare Progressi in «Diario» con un calendario delle ultime 12 settimane e il totale dei versi sbloccati.

**Architecture:** Un modulo puro nuovo `src/domain/rhythm.ts` calcola la settimana (lun–dom) dai giorni con ripassi e dai giorni liberi salvati in `settings.freeDays`; Oggi segna il giorno libero alla prima apertura con coda vuota. `dailyActivity` in `src/domain/progress.ts` conta i ripassi per giorno delle ultime 12 settimane. Un componente `WeekRhythm` si usa in Oggi e a fine sessione; `Progress.tsx` diventa il Diario.

**Tech Stack:** Preact + TypeScript strict, Dexie, Vitest + @testing-library/preact + fake-indexeddb + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-engagement-design.md` (§5.1 schema di Oggi, §5.2 schema di fine sessione, §5.6, §6.1, §6.4, §8.1 `weekRhythm`/`dailyActivity`, §8.3, §9, §12 fase 4). Regole: `docs/spec.md`, `docs/design.md`, `CLAUDE.md`.

## Global Constraints

- Nessuna dipendenza nuova; colori solo da variabili di `src/styles/tokens.css` (anche `color-mix()` fra variabili); touch target ≥ 44 px; `prefers-reduced-motion: reduce` → stato finale senza animazione.
- Tempo iniettato (`now: Date`) nel dominio; giorni nel **fuso locale**, chiave `YYYY-MM-DD`; settimana da **lunedì** a domenica. Test senza rete; dati inventati.
- Nessuna migrazione e nessuna versione nuova di Dexie: in `Settings` due campi facoltativi `rhythmGoal?: number` e `freeDays?: string[]`. Un'impostazione salvata prima non li ha: obiettivo `5`, nessun giorno libero.
- `rhythmGoal` sempre fra 3 e 7 (intero) — `saveSettings` lo limita come fa con `newPerDay`. `freeDays` tiene solo gli ultimi 84 giorni (12 settimane).
- Nessuna colpa (§6.1, §6.4): settimana mancata → nessun messaggio; nessun numero di serie; nessuna notifica.
- Testo dell'interfaccia in italiano: «N giorni su M» (con «1 giorno su M»), «Obiettivo della settimana raggiunto», «Obiettivo settimanale» (Impostazioni), «Diario» (titolo e nome dell'icona in Oggi, titolo della pagina in `src/app.tsx`), «Versi sbloccati», «Ultime 12 settimane», «giorno libero».
- Un commit per task, messaggio in inglese, con la riga `Co-Authored-By:` del modello che scrive.

## Decisioni di questo piano (rispetto alla spec)

- D1. Giorno «attivo» = almeno un ripasso registrato quel giorno (`reviews.reviewedAt`), oppure giorno in `settings.freeDays`. Le frasi scritte e non ancora corrette non contano (diventano ripassi alla conferma, con la loro data).
- D2. «Prima apertura di un giorno con coda vuota» = Oggi carica e `buildSessionQueue` non ha card (`items.length === 0`) **e** oggi non c'è ancora nessun ripasso. Si salva da un effetto di Oggi con `markFreeDay(db, now)`, che non riscrive se il giorno c'è già. Una giornata finita (ripassi fatti, coda vuota) è già attiva per i ripassi: non diventa libera.
- D3. «Si raggiunge anche toccando l'anello o il ritmo» (§5.6): il ritmo è un link al Diario; l'anello no, perché ha già il «Perché?» e due azioni sullo stesso cerchio confonderebbero. L'icona in alto resta.
- D4. L'impulso dell'obiettivo raggiunto (§6.1) usa lo stesso meccanismo dell'impulso dell'anello (`DayRing`, variabile di modulo per chiave), con chiave = lunedì della settimana: una volta per settimana e per avvio dell'app.
- D5. Intensità del calendario a 5 livelli: 0 ripassi → 0; 1–9 → 1; 10–24 → 2; 25–49 → 3; ≥ 50 → 4. Colore: `color-mix(in srgb, var(--accent) P%, var(--surface-2))` con P = 0, 30, 55, 80, 100. Un giorno libero senza ripassi ha il livello 0 con un bordo (`--line-strong`) e «giorno libero» nel testo equivalente. I giorni dopo oggi non si disegnano.
- D6. Diario, ordine: calendario → comprensione al primo ascolto → «Versi sbloccati» (totale) → lessico attivo, memoria reale, guadagno medio, carico → vocabolario stimato → verso il livello successivo. Il totale dei versi sbloccati è la somma di `unlockedKeys(db)` (`src/domain/unlocked.ts`, canzoni in studio e completate): lo stesso numero che Oggi e lo Studio contano canzone per canzone.
- D7. La rotta resta `#/progress` (link e cronologia di prima continuano a funzionare); cambia solo ciò che si legge.

## Review Focus

1. **Settimana a cavallo di mese/anno e ora legale** — lunedì giusto e 7 giorni anche quando la settimana attraversa il 31 dicembre o il cambio d'ora (giorni locali, non `+ 86_400_000`). Test in Task 1.
2. **Impostazioni salvate prima** (senza `rhythmGoal`/`freeDays`) — obiettivo 5, nessun crash, il backup importato funziona. Test in Task 1 e Task 4.
3. **Giorno libero che non deve esserlo** — coda vuota perché la giornata è già finita, o card in arrivo più tardi: niente `freeDays`; e niente scritture ripetute a ogni render. Test in Task 3.
4. **Mezzanotte con l'app aperta** — dopo `useDayTick` il ritmo e il calendario mostrano il giorno nuovo; il giorno libero si segna per il giorno nuovo, non per ieri. Test in Task 3.
5. **Obiettivo abbassato a settimana in corso** (es. da 5 a 3 con 4 giorni fatti) — mai «4 giorni su 3»: il testo diventa «Obiettivo della settimana raggiunto · 4 giorni»; i pallini restano 7 (lun–dom) con la spunta sui giorni attivi. Test in Task 1 (testo) e Task 3.

---

### Task 1: Dominio del ritmo

**Files:**
- Create: `src/domain/rhythm.ts`
- Modify: `src/db/types.ts` (`Settings.rhythmGoal?`, `Settings.freeDays?`), `src/domain/settings.ts` (limite 3–7 in `saveSettings`)
- Test: `tests/domain/rhythm.test.ts`, una riga in `tests/domain/settings.test.ts` (o il file che testa `saveSettings`)

**Interfaces:**
- Produces:
  - `RHYTHM_GOAL_DEFAULT = 5`, `rhythmGoalOf(s: Settings): number` (→ `s.rhythmGoal ?? 5`).
  - `localDayKey(d: Date): string` — `YYYY-MM-DD` locale (spostare qui quella di `src/ui/screens/Today.tsx:30` e importarla da lì).
  - `weekStart(now: Date): Date` — lunedì 00:00 locale della settimana di `now`.
  - `type RhythmDay = { key: string; weekday: number /* 0 = lunedì */; active: boolean; free: boolean; today: boolean; future: boolean }`
  - `weekRhythm(input: { reviewDays: Set<string>; freeDays: string[]; goal: number; now: Date }): { days: RhythmDay[]; active: number; goal: number; reached: boolean }` — 7 giorni lun–dom; `active` conta i giorni attivi (D1) fino a oggi; `reached = active >= goal`.
  - `rhythmText(r: ReturnType<typeof weekRhythm>): string` — «3 giorni su 5», «1 giorno su 5»; raggiunto → «Obiettivo della settimana raggiunto · N giorni» (Review Focus 5).
  - `reviewDaysSince(db: SinglishDB, since: Date): Promise<Set<string>>` — chiavi dei giorni con ripassi da `since` (indice `reviewedAt`).
  - `markFreeDay(db: SinglishDB, now: Date): Promise<void>` — aggiunge `localDayKey(now)` a `settings.freeDays` se manca, tiene solo gli ultimi 84 giorni; non scrive se non cambia nulla.
  - `loadWeekRhythm(db: SinglishDB, now: Date): Promise<ReturnType<typeof weekRhythm>>` — compone i tre sopra con le impostazioni.

- [ ] **Step 1: Write the failing tests**: `weekStart` per un mercoledì, una domenica (→ lunedì prima, non dopo), il 1° gennaio 2027 (venerdì → lunedì 28 dicembre 2026) e la settimana del cambio d'ora di fine ottobre 2026 (7 chiavi distinte e consecutive); `weekRhythm` con ripassi lun e mer, giorno libero mar, oggi giovedì → `active` 3, `today` sul giovedì, ven–dom `future`; giorno futuro in `freeDays` non conta; `reached` a 5 su 5; `rhythmText` nei tre casi (singolare, normale, raggiunto con obiettivo superato); `markFreeDay` aggiunge una volta, non riscrive (spia su `db.settings.put` o confronto di riga), pota oltre 84 giorni; `rhythmGoalOf` senza campo → 5; `saveSettings({ rhythmGoal: 9 })` → 7, `2` → 3, `4.6` → 5.
- [ ] **Step 2: Run** `npx vitest run tests/domain/rhythm.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: weekly rhythm from review days and free days`.

### Task 2: Attività per giorno (dominio)

**Files:**
- Modify: `src/domain/progress.ts`
- Test: `tests/domain/progress.test.ts` (o file nuovo `tests/domain/daily-activity.test.ts`)

**Interfaces:**
- Consumes: `localDayKey`, `weekStart` (Task 1).
- Produces:
  - `type ActivityDay = { key: string; reviews: number; level: 0 | 1 | 2 | 3 | 4; free: boolean; future: boolean }`
  - `activityLevel(reviews: number): 0 | 1 | 2 | 3 | 4` — soglie D5.
  - `dailyActivity(reviews: Pick<Review, 'reviewedAt'>[], freeDays: string[], now: Date): ActivityDay[][]` — 12 settimane (colonne) da 7 giorni (lun–dom), l'ultima è quella di `now`; giorni dopo oggi con `future: true` e 0 ripassi.

- [ ] **Step 1: Write the failing tests**: soglie di `activityLevel` ai bordi (0, 1, 9, 10, 24, 25, 49, 50); `dailyActivity` → 12 × 7, prima colonna inizia 11 settimane prima del lunedì corrente; conteggi giusti per due giorni con ripassi (uno alle 23:59 e uno alle 00:01 locali di giorni diversi); ripassi più vecchi di 12 settimane ignorati; giorno libero marcato; giorni dopo oggi `future`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: daily review activity for the last 12 weeks`.

### Task 3: Ritmo in Oggi e a fine sessione

**Files:**
- Create: `src/ui/components/WeekRhythm.tsx`
- Modify: `src/ui/screens/Today.tsx` (sotto l'anello; effetto `markFreeDay` per D2; `localDayKey` importata dal dominio), `src/ui/screens/Session.tsx` (fine sessione, ramo `items.length === 0 || finished`, sotto il conteggio), `src/styles/base.css`, `src/styles/motion.css`
- Test: `tests/ui/week-rhythm.test.tsx`, `tests/ui/today.test.tsx`, `tests/ui/session.test.tsx` (o `session-unlocked.test.tsx`)

**Interfaces:**
- Consumes: Task 1 (`loadWeekRhythm`, `rhythmText`, `markFreeDay`, `localDayKey`, `weekStart`).
- Produces: `WeekRhythm({ rhythm, weekKey }: { rhythm: ReturnType<typeof weekRhythm>; weekKey: string })` — un link (`href` del Diario) con 7 pallini (lun–dom, iniziali «L M M G V S D» nascoste allo screen reader) e il testo `rhythmText`. Pallino attivo pieno con la spunta, oggi con un anello, futuri tenui (§9: il colore non è l'unica informazione). Nome accessibile del link: «Ritmo della settimana: <rhythmText>. Apri il Diario». Raggiunto → classe con impulso una volta per `weekKey` (D4).

- [ ] **Step 1: Write the failing tests**: `WeekRhythm` — 7 pallini, spunte sui giorni attivi, nome del link, `href` `#/progress`, impulso solo la prima volta per la stessa settimana; Oggi — mostra il ritmo con i giorni dei ripassi; coda vuota e nessun ripasso oggi → `freeDays` contiene oggi e il pallino di oggi è attivo; coda vuota ma ripassi fatti oggi → `freeDays` invariato; coda con card → invariato; rimontare Oggi non riscrive (Review Focus 3); dopo mezzanotte (`now` spostato + evento come nel test della mezzanotte di fase 2) il giorno libero è quello nuovo (Review Focus 4); obiettivo 3 con 4 giorni → «Obiettivo della settimana raggiunto · 4 giorni» (Review Focus 5); fine sessione — il ritmo compare con il giorno di oggi attivo.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: weekly rhythm in Today and at session end`.

### Task 4: Obiettivo nelle Impostazioni

**Files:**
- Modify: `src/ui/screens/Settings.tsx` (sezione STUDIO), `src/domain/backup.ts` solo se l'import perde i campi (verificare con un test)
- Test: `tests/ui/settings.test.tsx`, `tests/domain/backup.test.ts`

Un `<select>` «Obiettivo settimanale» con le opzioni 3–7 («3 giorni su 7» … «7 giorni su 7»), valore `rhythmGoalOf(settings)`, salva subito con `saveSettings({ rhythmGoal })` come gli altri campi della sezione; sotto una nota: «Un giorno conta se ripassi almeno una card, o se quel giorno non c'era niente da ripassare.»

- [ ] **Step 1: Write the failing tests**: il select mostra 5 senza campo salvato; cambiarlo a 3 salva `rhythmGoal: 3`; backup esportato e reimportato conserva `rhythmGoal` e `freeDays` (Review Focus 2).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: weekly goal setting`.

### Task 5: Diario

**Files:**
- Modify: `src/ui/screens/Progress.tsx`, `src/app.tsx` (titolo «Diario»), `src/ui/screens/Today.tsx` (nome dell'icona «Diario»), `src/styles/base.css`, `docs/design.md` (ritmo, Diario, calendario, campi nuovi)
- Create: `src/ui/components/ActivityCalendar.tsx`
- Test: `tests/ui/progress.test.tsx` (e i test che cercano «Progressi»: aggiornare solo il nome cercato)

**Interfaces:**
- Consumes: Task 2 (`dailyActivity`), Task 1 (`settings.freeDays`), `unlockedKeys` (`src/domain/unlocked.ts`).
- Produces: `ActivityCalendar({ weeks }: { weeks: ActivityDay[][] })` — griglia SVG o CSS 12 colonne × 7 righe, `role="img"` con `aria-label` riassuntivo («Ultime 12 settimane: N giorni con ripassi»), più una tabella `visually-hidden` (data, ripassi, «giorno libero») come il grafico di comprensione.

- [ ] **Step 1: Write the failing tests**: titolo «Diario»; calendario prima della comprensione (ordine D6); 84 celle meno i giorni futuri; una cella con 30 ripassi ha livello 3 (classe o attributo); la tabella nascosta ha una riga per un giorno libero con «giorno libero»; il riquadro «Versi sbloccati» mostra il totale uguale alla somma dei «N di M» di Oggi (dati con due canzoni); senza dati il riquadro dice «—» e una frase su cosa fare («Ripassa le card di una canzone: i versi capiti si contano qui.»); l'icona di Oggi si chiama «Diario».
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Progress becomes the Diary with a 12-week calendar`.

### Task 6: End-to-end

**Files:**
- Create: `tests/e2e/rhythm.spec.ts`

Dati scritti in IndexedDB come in `tests/e2e/unlocked.spec.ts` (nessuna rete): impostazioni con `rhythmGoal: 3`, una canzone in studio con un chunk e la sua card R in scadenza, ripassi registrati lunedì e martedì della settimana di oggi (se oggi è lunedì o martedì, il test sposta i giorni in modo da restare nella settimana: calcolarli dal lunedì corrente e usare solo quelli prima di oggi, con almeno uno).

- [ ] **Step 1: Write the test**: Oggi mostra il ritmo con N giorni → giro: rivela, «Bene» → fine sessione con il ritmo che conta anche oggi → «Torna a Oggi» → tocca il ritmo → Diario con il calendario e la cella di oggi non a livello 0 → Impostazioni: obiettivo a 7 → Oggi dice «… su 7».
- [ ] **Step 2: Run** `npm run build && npx playwright test` — Expected: tutti verdi.
- [ ] **Step 3: Commit** `test: e2e weekly rhythm and Diary`.
