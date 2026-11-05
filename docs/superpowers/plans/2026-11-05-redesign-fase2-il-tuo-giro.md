# Redesign · Fase 2 — Oggi «Il tuo giro»: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare Oggi da cruscotto di numeri e frasi in un giro quotidiano leggibile in un colpo d'occhio: anello del giorno, un solo invito in evidenza, canzoni come copertine scorrevoli, un'unica azione principale in basso.

**Architecture:** Tre funzioni pure nuove in `src/domain/today.ts` decidono stato dell'anello, invito in evidenza e azione quando non c'è nulla da ripassare; un conteggio asincrono dice quante card sono state fatte oggi. Due componenti nuovi (`DayRing`, `SongCarousel`) le mostrano; `Today.tsx` li compone. I numeri restano quelli di oggi: `buildSessionQueue`, `itemsInSong`, `finalListenDue`, `pendingProductions` non cambiano.

**Tech Stack:** Preact + TypeScript strict, Dexie, Vitest + @testing-library/preact + fake-indexeddb + happy-dom, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-engagement-design.md` (§4, §5.1, §5.1.1, §7.4, §9, §12 fase 2). Regole: `docs/spec.md`, `docs/design.md` (sezioni «Coerenza dei dati fra schermate», «Movimento»), `CLAUDE.md`.

## Global Constraints

- Nessuna dipendenza nuova; colori solo da variabili di `src/styles/tokens.css`; touch target ≥ 44 px; `prefers-reduced-motion: reduce` → stati finali senza animazione.
- Tempo iniettato (`now: Date`) nel dominio; test senza rete; testi di canzoni inventati.
- Ogni numero si calcola in un solo punto (design.md): Oggi annuncia esattamente le card che la Sessione mostrerà (`buildSessionQueue`), le voci di una canzone vengono da `itemsInSong`, le frasi da `pendingProductions`, il riascolto da `finalListenDue`.
- Testo dell'interfaccia in italiano, sobrio. Restano invariati: il titolo `h1` «Ripasso di oggi» (fuoco e test esistenti), le tre statistiche «in scadenza», «nuove», «stimati» (in piccolo sotto l'anello), il titolo «Canzoni e testi aperti» con «N di 4», `LIMIT_NOTE` al limite, «Da smistare nelle canzoni completate» (ora come invito), tutte le frasi lunghe di oggi (ora nel «Perché?» e come testo accessibile).
- Cambiano deliberatamente (aggiornare i test esistenti che li cercano, solo nel nome cercato): il pulsante «Inizia sessione» diventa «Inizia il giro» (o «Continua il giro» se oggi è già stata fatta almeno una card) — `tests/ui/*.test.tsx` e `tests/e2e/mvp.spec.ts`.
- Un commit per task, messaggio in inglese, con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisioni di questo piano (rispetto alla spec)
- D1. Il «Perché?» (§5.1.1) è un pulsante di espansione (`aria-expanded`) che mostra la spiegazione sotto l'anello, non un foglio dal basso: stesso contenuto, meno codice di navigazione (niente voce di cronologia, niente gestione del fuoco del foglio).
- D2. I pallini del percorso nel carosello e il numero «versi sbloccati» arrivano con le fasi 3 e 6; qui il carosello mostra copertina con anello di avanzamento (rapporto `done/total` di oggi) e un'etichetta breve.
- D3. Il ritmo settimanale del mockup arriva con la fase 4: non si disegna ora.
- D4. Una canzone con riascolto finale pronto che non è l'invito in evidenza porta, dal carosello, al riascolto finale (etichetta «Riascolto pronto»): altrimenti resterebbe irraggiungibile da Oggi.
- D5. «Card fatte oggi» = ripassi registrati da mezzanotte locale + frasi scritte oggi ancora da correggere. Una frase confermata diventa un ripasso con la data in cui è stata scritta, quindi non si conta due volte.

## Review Focus

1. **Mezzanotte con l'app aperta** — dopo `useDayTick` l'anello riparte da 0 fatte e mostra le card del giorno nuovo, come la Sessione. Test in Task 1 (conteggio con `now` del giorno dopo) e Task 4.
2. **Coda vuota ma qualcosa da fare** (solo frasi da correggere, solo parole da smistare, solo «Da studiare», solo bozze, nessuna canzone) — l'azione principale porta esattamente a ciò che crea card, nello stesso ordine della Sessione vuota; mai un pulsante che porta a una Sessione vuota. Test in Task 1 e Task 4.
3. **Invito duplicato** — lo stesso obiettivo non compare due volte (invito in evidenza e azione principale): se coincidono si mostra solo l'azione principale. Test in Task 4.
4. **Carosello con 4 canzoni e titoli lunghi a 390 px** — scorre in orizzontale dentro sé stesso, la pagina non ha scroll orizzontale, ogni copertina è un link con il titolo come nome, raggiungibile da tastiera. Test in Task 3 (nomi e link) e verifica a vista in Task 5.
5. **Card nuove trattenute dal carico** (`newBlockedByLoad`) insieme a card fatte — l'anello è parziale **e** tratteggiato, con la frase esistente nel «Perché?»; mai «Fatto per oggi» se restano card. Test in Task 1 e Task 2.

---

### Task 1: Dominio di Oggi (anello, invito, azione a coda vuota, card fatte oggi)

**Files:**
- Create: `src/domain/today.ts`
- Test: `tests/domain/today.test.ts`

**Interfaces:**
- Consumes: il ritorno di `buildSessionQueue` (`Awaited<ReturnType<typeof buildSessionQueue>>`, `src/domain/queue.ts`: `items`, `dueCount`, `newCount`, `estMinutes`, `newBlockedByLoad`), `startOfLocalDay(now)` (stesso file), `pendingProductions(db)` (`src/domain/production.ts`, elementi con `at?: Date`), `Song` (`src/db/types.ts`).
- Produces:
  - `doneToday(db: SinglishDB, now: Date): Promise<number>` — `reviews` con `reviewedAt >= startOfLocalDay(now)` (usa l'indice `reviewedAt`) + frasi di `pendingProductions` con `at >= startOfLocalDay(now)`.
  - `type RingState = 'todo' | 'partial' | 'done' | 'empty'`
  - `dayRing(input: { done: number; left: number; blocked: boolean }): { done: number; total: number; state: RingState; blocked: boolean }` — `total = done + left`; `state`: `left > 0 && done === 0` → `todo`; `left > 0 && done > 0` → `partial`; `left === 0 && done > 0` → `done`; `left === 0 && done === 0` → `empty`. `left` è `queue.items.length`, `blocked` è `queue.newBlockedByLoad`.
  - `type Invite = { kind: 'correct'; count: number } | { kind: 'final'; song: Song } | { kind: 'triage'; song: Song; count: number } | { kind: 'study'; song: Song }`
  - `featuredInvite(input: { toCorrect: number; finalDue: Song[]; toTriage: { song: Song; count: number }[]; toStudy: Song[] }): Invite | null` — primo non vuoto in quest'ordine: frasi da correggere → `finalDue[0]` → `toTriage[0]` (solo `count > 0`) → `toStudy[0]`.
  - `type EmptyAction = { kind: 'add' } | { kind: 'correct'; count: number } | { kind: 'triage'; song: Song; count: number } | { kind: 'study'; song: Song } | { kind: 'analyze'; song: Song } | { kind: 'none' }`
  - `emptyAction(input: { hasSongs: boolean; toCorrect: number; toTriage: { song: Song; count: number }[]; toStudy: Song[]; toAnalyze: Song[] }): EmptyAction` — stesso ordine dei messaggi della Sessione vuota (`src/ui/screens/Session.tsx`, ramo `items.length === 0`): nessuna canzone → `add`; frasi → `correct`; parole da smistare → `triage`; «Da studiare» → `study`; bozze o in coda → `analyze`; altrimenti `none`.

- [ ] **Step 1: Write the failing tests** (`tests/domain/today.test.ts`, canzoni inventate, `now` fisso):
  - `dayRing`: una riga per stato — `{done:0,left:5}` → `todo`, total 5; `{done:3,left:2}` → `partial`, total 5; `{done:4,left:0}` → `done`; `{done:0,left:0}` → `empty`; `blocked: true` si conserva in ogni stato.
  - `featuredInvite`: priorità — con tutti e quattro presenti → `correct`; senza frasi → `final` con la prima canzone; poi `triage` (ignora voci con `count: 0`); poi `study`; niente → `null`.
  - `emptyAction`: una riga per ogni ramo nell'ordine dichiarato, e `hasSongs: false` vince su tutto.
  - `doneToday`: con `createDb('t-' + crypto.randomUUID())`: 2 ripassi oggi, 1 ieri alle 23:59 locali, una sessione con 1 frase scritta oggi e 1 scritta ieri (card presenti, chunk non sospeso) → `3`; con `now` = domani 00:01 → `0` (Review Focus 1); una frase la cui card è stata eliminata non conta.
- [ ] **Step 2: Run** `npx vitest run tests/domain/today.test.ts` — Expected: FAIL (modulo mancante).
- [ ] **Step 3: Implement** `src/domain/today.ts` con le firme sopra.
- [ ] **Step 4: Run** il test, poi `npm test` e `npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: today domain — day ring, featured invite, empty-queue action, cards done today`.

### Task 2: Componente `DayRing`

**Files:**
- Create: `src/ui/components/DayRing.tsx`
- Modify: `src/styles/base.css`, `src/styles/motion.css`
- Test: `tests/ui/day-ring.test.tsx`

**Interfaces:**
- Consumes: `dayRing` result (Task 1).
- Produces: `DayRing(props: { ring: ReturnType<typeof dayRing>; estMinutes: number; timerMinutes: number; label: string; why: string | null })`.
  - SVG cerchio di sfondo (`var(--line)`) e arco di avanzamento (`var(--accent)`, `stroke-dasharray`/`stroke-dashoffset` da `done/total`, 0 se `total === 0`), con classe `day-ring--{state}` e `day-ring--blocked` se `blocked` (arco tratteggiato: `stroke-dasharray` a trattini sul cerchio di sfondo).
  - Al centro: numero grande `total` in `.display` quando `state` è `todo`/`partial`, `done` quando è `done`, «—» quando è `empty`; sotto, `~{estMinutes}′ di {timerMinutes}′` (nascosto quando `empty` o `done`).
  - Sotto l'anello: `label` visibile (testo breve, vedi Task 4).
  - `why` non nullo → pulsante «Perché?» (`aria-expanded`, `aria-controls`, min 44 px) che mostra/nasconde `<p id=…>` con `why`; lo stesso testo è sempre presente anche in un `<span class="visually-hidden">` dentro la regione dell'anello (così il lettore di schermo e i test esistenti lo trovano senza aprire).
  - La regione dell'anello è `role="img"` con `aria-label` = `"{done} di {total} card fatte oggi"` (`"Nessuna card oggi"` se `total === 0`); il testo visibile resta fuori dalla `role="img"`.
  - Movimento (`motion.css`): l'arco si riempie da 0 al valore all'apertura (`--t-slow`, `--ease-out`); in stato `done` un solo impulso di scala sull'anello (`--t-med`); con `prefers-reduced-motion: reduce` nessuna animazione.

- [ ] **Step 1: Write the failing tests**:
  - `aria-label` per i quattro stati (`'3 di 5 card fatte oggi'`, `'Nessuna card oggi'`).
  - numero centrale per stato (`'5'` todo, `'5'` partial con done 3, `'4'` done, `'—'` empty) e minuti visibili solo in `todo`/`partial` (`'~12′ di 30′'`).
  - classe `day-ring--blocked` presente con `blocked: true` anche in `partial` (Review Focus 5).
  - «Perché?»: assente con `why: null`; presente con `aria-expanded="false"`, il clic lo porta a `"true"` e rende visibile il paragrafo; il testo di `why` è nel DOM anche prima del clic.
  - arco: `stroke-dashoffset` uguale a `C * (1 - done/total)` con `C` la circonferenza del componente; `0` per `total === 0` non produce `NaN`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/day-ring.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** componente, CSS (solo variabili) e animazioni.
- [ ] **Step 4: Run** il test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: DayRing — cards done today as a ring, with an expandable why`.

### Task 3: Componente `SongCarousel`

**Files:**
- Create: `src/ui/components/SongCarousel.tsx`
- Modify: `src/styles/base.css`
- Test: `tests/ui/song-carousel.test.tsx`

**Interfaces:**
- Consumes: `Cover` (`src/ui/components/Cover.tsx`, `size: 'md'`), `Song`.
- Produces: `type CarouselItem = { song: Song; href: string; label: string; detail: string; progress: number | null }` e `SongCarousel(props: { items: CarouselItem[]; onAdd: (() => void) | null; addHref: string })`.
  - `<ul class="song-carousel">` orizzontale (`overflow-x: auto`, `scroll-snap-type: x mandatory`, larghezza voce 132 px, nessuna barra visibile, `overscroll-behavior-x: contain`), una `<li>` per voce con `<a href>`: copertina `md` dentro un anello di avanzamento (`conic-gradient(var(--accent) {progress}turn, var(--line) 0)` come bordo di 3 px; nessun anello se `progress === null`), titolo (2 righe al massimo, `overflow-wrap: anywhere`), `label` visibile breve, `detail` in `span.visually-hidden` (frase completa di oggi).
  - Il nome accessibile del link contiene titolo, `label` e `detail`.
  - Se `onAdd` non è nullo: ultima voce «＋ Aggiungi» (link a `addHref`, `onClick` → `preventDefault()` e `onAdd()`), 132 px, copertina tratteggiata con `var(--line-strong)`.

- [ ] **Step 1: Write the failing tests**:
  - due voci → due link con `href` giusti e nome che contiene titolo, `label` e `detail`;
  - `detail` è nel DOM dentro `.visually-hidden`;
  - `progress: 0.5` → stile dell'anello contiene `0.5turn`; `null` → nessun elemento anello;
  - `onAdd` presente → link «Aggiungi» con `href={addHref}`, il clic chiama `onAdd` una volta e non naviga (`defaultPrevented`); `onAdd: null` → nessun «Aggiungi».
  - un titolo di 120 caratteri senza spazi resta dentro la voce: la `h3` ha la classe che applica `overflow-wrap: anywhere` (verifica a vista in Task 5).
- [ ] **Step 2: Run** `npx vitest run tests/ui/song-carousel.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** componente e CSS.
- [ ] **Step 4: Run** il test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: SongCarousel — open songs as covers with a progress ring`.

### Task 4: Oggi composta

**Files:**
- Modify: `src/ui/screens/Today.tsx`
- Create: `src/ui/todayText.ts` (testi di Oggi in un solo posto)
- Modify: `src/styles/base.css` (rimuovere le regole di Oggi non più usate: `.today-card .stats` resta per le tre statistiche piccole)
- Modify: test esistenti che cercano «Inizia sessione» (solo il nome): `tests/ui/*.test.tsx`, `tests/e2e/mvp.spec.ts`
- Test: `tests/ui/today.test.tsx` (nuovo)

**Interfaces:**
- Consumes: Task 1 (`doneToday`, `dayRing`, `featuredInvite`, `emptyAction`), Task 2 (`DayRing`), Task 3 (`SongCarousel`, `CarouselItem`), esistenti `buildSessionQueue`, `itemsInSong`, `finalListenDue`, `pendingProductions`, `activeSongs`, `useAddGate`, `useDayTick`, `href`.
- Produces in `src/ui/todayText.ts`:
  - `songDetail(row): string` — la frase completa di oggi per una canzone (spostare **senza cambiarla** l'espressione condizionale attuale di `Today.tsx` per la riga della canzone, comprese «Da analizzare» per bozze e in coda).
  - `songLabel(row, finalReady: boolean): string` — breve: «Riascolto pronto» se `finalReady`; «Da analizzare»; «Da studiare»; «N da smistare» se `total === 0 && toTriage > 0`; «{done} di {total}» se `total > 0`; altrimenti «Nessuna voce».
  - `ringLabel(ring, toCorrect: number): string` — `todo`: «{left} card da fare»; `partial`: «Restano {left} card»; `done`: «Fatto per oggi» se `toCorrect === 0`, altrimenti «Ripasso fatto · frasi da correggere»; `empty`: «Niente da ripassare oggi.».
  - `ringWhy(ring, input: { blocked: boolean; minutes: number; toCorrect: number }): string | null` — la frase esistente del blocco («Per ora niente card nuove: il ripasso in scadenza supera … Arrivano quando scende sotto.») se `blocked`; la frase esistente delle frasi da correggere se `empty && toCorrect > 0`; altrimenti `null`. Copiare le stringhe attuali da `Today.tsx` parola per parola.
  - `emptyCta(action): { text: string; route } | null` — `add`: «Aggiungi una canzone» (passa da `gate.request()` come oggi); `correct`: «Correggi le frasi» → `feedback`; `triage`: «Smista le parole di «{titolo}»» → `triage`; `study`: «Apri lo Studio di «{titolo}»» → `study`; `analyze`: «Analizza «{titolo}»» → `analyzing`; `none` → `null`.

Composizione di `Today` (dall'alto): testata e data come oggi; banner di installazione come oggi; `section.today-card` con `h1` «Ripasso di oggi», `DayRing`, le tre statistiche piccole, la nota dell'intensiva; l'invito in evidenza (`a.card.final-due`, stessi testi e `section-label` di oggi per frasi e riascolto; per `triage` «{N} parole da smistare in «{titolo}»» → `triage`; per `study` «“{titolo}” è da studiare» → `study`), **nascosto se coincide con l'azione principale** (stesso `kind` e stessa canzone); titolo «Canzoni e testi aperti {N di 4}» e `SongCarousel` (`onAdd` nullo al limite, con `LIMIT_NOTE` visibile); le completate con parole da smistare restano raggiungibili: se non sono l'invito in evidenza, compaiono sotto il carosello come oggi («Da smistare nelle canzoni completate»); in fondo l'azione principale: `items.length > 0` → «Inizia il giro» (`done === 0`) o «Continua il giro» → `session`; altrimenti `emptyCta(emptyAction(…))` se non nullo.
Href delle voci del carosello: bozze e in coda → `analyzing`; canzoni in `finalListenDue` che non sono l'invito → `finalListen` (D4); le altre → `study`. `progress`: `done/total` se `total > 0`, altrimenti `null`.

- [ ] **Step 1: Write the failing tests** (`tests/ui/today.test.tsx`, `AppDepsProvider` con `now` fisso, dati inventati):
  - coda con 5 card e nessun ripasso oggi → `aria-label` «0 di 5 card fatte oggi», testo «5 card da fare», link «Inizia il giro» → `#/session`;
  - dopo 3 ripassi registrati oggi e 2 card ancora in coda → «Restano 2 card», link «Continua il giro»;
  - tutto fatto, nessuna frase → «Fatto per oggi», nessun link alla sessione;
  - `newBlockedByLoad` → la frase del blocco esistente è nel DOM (visually-hidden) e nel «Perché?» espanso;
  - coda vuota, per ciascun ramo di `emptyAction`: testo e `href` del pulsante (`#/songs/{id}/triage`, `#/songs/{id}`, `#/songs/{id}/analyzing`, `#/feedback`; «Aggiungi una canzone» senza canzoni) e **nessun invito in evidenza duplicato** con lo stesso obiettivo (Review Focus 2 e 3);
  - priorità dell'invito con frasi da correggere **e** riascolto pronto → si vede l'invito delle frasi; la canzone del riascolto nel carosello porta a `#/songs/{id}/final` con etichetta «Riascolto pronto» (D4);
  - mezzanotte: con `now` spostato al giorno dopo e `useDayTick` scattato, l'`aria-label` torna «0 di N» (Review Focus 1);
  - carosello: 4 canzoni aperte → 4 link con il titolo nel nome e nessun «Aggiungi»; `LIMIT_NOTE` visibile; 2 canzoni → «Aggiungi» presente, il clic apre il controllo di sblocco come oggi.
- [ ] **Step 2: Run** `npx vitest run tests/ui/today.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `todayText.ts` e la nuova `Today.tsx`; aggiorna «Inizia sessione» → «Inizia il giro» nei test esistenti (solo il nome cercato).
- [ ] **Step 4: Run** `npm test` e `npm run typecheck` — Expected: PASS tutti; nessun test esistente ha cambiato asserzioni oltre al nome del pulsante.
- [ ] **Step 5: Commit** `feat: Today becomes «Il tuo giro» — ring, one invite, song carousel, one main action`.

### Task 5: Verifica a vista, e2e e documentazione

**Files:**
- Modify: `tests/e2e/mvp.spec.ts` (se non già fatto in Task 4: nome del pulsante)
- Modify: `docs/design.md` (sezione «Coerenza dei dati fra schermate»: Oggi con anello, invito unico, carosello; i nomi delle funzioni di `src/domain/today.ts`; le decisioni D1–D5)

- [ ] **Step 1: Verifica a vista** con uno script Playwright usa-e-getta (fuori dai test del repository): Oggi a 390 × 844, temi chiaro e scuro, negli stati `todo`, `partial` con `blocked`, `done`, `empty` con azione `triage`, e con 4 canzoni di cui una dal titolo di 120 caratteri. Per ogni schermata: `document.documentElement.scrollWidth <= innerWidth`, il carosello scorre in orizzontale, l'azione principale sta nella metà bassa, nessun testo tagliato o sovrapposto, bersagli ≥ 44 px. Salva gli screenshot nella cartella di lavoro (non nel repository).
- [ ] **Step 2: Run** `npm test`, `npm run typecheck`, `npm run test:e2e`, `npm run build` — Expected: PASS (l'e2e del manifest dipende dalla PR #8: se non è ancora in `main`, segnalarlo e non correggerlo qui).
- [ ] **Step 3: Aggiorna** `docs/design.md`.
- [ ] **Step 4: Commit** `docs: Today ring, invite and carousel in the design notes`.
