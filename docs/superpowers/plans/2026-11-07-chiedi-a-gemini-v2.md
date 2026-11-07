# Chiedi a Gemini v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Studio lo studente segna parole, espressioni (unite col giunto) e versi interi; una chiamata a Gemini restituisce una risposta per ogni richiesta, sempre con la traduzione del verso; un foglio «Risposte» fa scegliere cosa entra nel ripasso.

**Architecture:** Tre moduli di dominio piatti al posto di `src/domain/ask.ts`: `askSelection.ts` (stato puro della selezione → richieste con id), `askRequest.ts` (prompt, messaggio, schema, controllo, chiamata di recupero), `askDraft.ts` (salvataggio di traduzioni, note e bozza su `Song`; «Aggiungi» e «Chiudi»). L'interfaccia: `PickLine` (giunti e numero del verso), foglio `AnswersSheet` (itemId `ask`) e `VerseSheet` (itemId `ln:<riga>`), aperti come gli altri fogli di Studio.

**Tech Stack:** Preact, TypeScript strict, Dexie, zod, Vitest + @testing-library/preact + fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-chiedi-a-gemini-v2-design.md`

## Global Constraints
- Nessuna dipendenza nuova.
- TDD: test che fallisce → codice minimo → test verde → un commit per task. Messaggi di commit in inglese, `feat:`/`fix:`/`docs:`/`test:`, con riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- I test non fanno rete: Gemini si inietta come `fetch` finto (`{ candidates: [{ content: { parts: [{ text: JSON.stringify(x) }] } }] }`).
- Il tempo si inietta (`now: Date`); niente `new Date()` nel dominio.
- Testo dell'interfaccia in italiano; contenuti di studio in inglese con `lang="en"`.
- Colori solo da variabili di `src/styles/tokens.css`; stili in `src/styles/base.css`.
- Touch target ≥ 44 px (giunto, numero del verso, caselle).
- Testi di canzoni nei test: solo inventati.
- Limite: `MAX_REQUESTS = 12` richieste per invio (un verso = 1, un'espressione = 1).
- `Song` riceve solo campi facoltativi non indicizzati: niente nuova versione Dexie.
- Il campo `at` di `AskDraft` previsto dalla spec si omette: nessuno lo legge e il backup non lo riporterebbe a `Date` (YAGNI).

## Review Focus
1. Parole con apostrofo o separate da punteggiatura (`don't, you`): il giunto appare fra token consecutivi e l'espressione unita è la fetta di verso dal primo all'ultimo token, punteggiatura compresa → test in Task 1.
2. Una seconda richiesta mentre c'è una bozza pendente sullo stesso verso o sulla stessa voce: la risposta nuova sostituisce la vecchia (stessa chiave), le altre restano → test in Task 4.
3. Chiudere il foglio Risposte con Indietro/Esc non perde la bozza: Studio mostra «Hai risposte da rivedere» → test in Task 7.
4. La stessa voce restituita per due righe e spuntata due volte: un solo chunk con due versi, 2 card, conteggio annunciato uguale a quello creato → test in Task 5.
5. Riprova offline o mentre una richiesta è in corso: disabilitato, nessuna chiamata → test in Task 7.

---

### Task 1: Selezione nel testo (dominio puro)

**Files:**
- Create: `src/domain/askSelection.ts`
- Test: `tests/domain/ask-selection.test.ts`

**Interfaces:**
- Produces:
  - `tokenize(line: string): { text: string; start: number; end: number }[]` — spostata qui da `ask.ts` (stessa regex `/[A-Za-z0-9’'-]+/g`); `ask.ts` la ri-esporta da qui finché esiste.
  - `type Selection = { words: ReadonlySet<string>; joins: ReadonlySet<string>; verses: ReadonlySet<number> }` — parola `"riga:token"`; giunto `"riga:token"` = unione fra `token` e `token+1`.
  - `emptySelection(): Selection`
  - `type AskRequest = { id: string; lineIndex: number; text?: string }` — `text` solo per le voci `w*`.
  - `const MAX_REQUESTS = 12`
  - `requestsOf(lines: string[], sel: Selection): AskRequest[]` — prima tutte le `w*` in ordine di testo (`w1, w2…`), poi le `v*` in ordine di riga (`v1, v2…`). Una voce = sequenza massimale di parole segnate consecutive legate da giunti presenti; `text = line.slice(first.start, last.end)`.
  - `toggleWord(sel: Selection, key: string): Selection` — togliendo una parola si tolgono anche i giunti `l:t-1` e `l:t`.
  - `toggleJoin(sel: Selection, key: string): Selection` — vale solo se `l:t` e `l:t+1` sono entrambe segnate, altrimenti restituisce `sel`.
  - `toggleVerse(sel: Selection, lineIndex: number): Selection`
  - `withinLimit(lines: string[], before: Selection, after: Selection): boolean` — `true` se `requestsOf(after).length <= MAX_REQUESTS` oppure non è cresciuto rispetto a `before`.

- [ ] **Step 1: Write the failing tests** (`lines = ['I gave up on you, babe', "don't, you know", 'paper lanterns drift']`)
  - `tokenize("don't, you")` → testi `["don't", 'you']`.
  - `toggleWord` su `0:1` e `0:2` senza giunto → `requestsOf` = `[{id:'w1',lineIndex:0,text:'gave'},{id:'w2',lineIndex:0,text:'up'}]`.
  - poi `toggleJoin('0:1')` → `[{id:'w1',lineIndex:0,text:'gave up'}]`; di nuovo `toggleJoin('0:1')` → due voci.
  - catena `0:1↔0:2↔0:3`, poi `toggleWord('0:2')` → `gave`, `on`; `joins` vuoto.
  - `toggleJoin('0:3')` con `0:4` non segnata → selezione identica (stesso oggetto).
  - giunto sopra la punteggiatura: `1:0`, `1:1` + `toggleJoin('1:0')` → `text: "don't, you"`.
  - `toggleVerse(…, 2)` + parola `0:1` → `[{id:'w1',…}, {id:'v1',lineIndex:2}]` (v senza `text`); due toggle tolgono il verso.
  - ordine: parola in riga 2 e parola in riga 0 → `w1` è la riga 0.
  - `withinLimit`: 12 parole separate + una tredicesima → `false`; togliere da 12 → `true`; catena di 3 unite con 11 voci, togliere la centrale (12→13) → `false`.

- [ ] **Step 2: Run** `npx vitest run tests/domain/ask-selection.test.ts` — Expected: FAIL (modulo mancante).
- [ ] **Step 3: Implement `src/domain/askSelection.ts`** con le firme sopra; i set restituiti sono nuovi (immutabilità).
- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat: selection model for Chiedi a Gemini with joins and whole verses`

---

### Task 2: Prompt, messaggio, schema e controllo della risposta

**Files:**
- Create: `src/domain/askRequest.ts`
- Test: `tests/domain/ask-request.test.ts`

**Interfaces:**
- Consumes: `AskRequest` (Task 1); `GeminiError` da `src/domain/gemini/client.ts`; `normalizeKey` da `src/domain/text.ts`; `Level` da `src/db/types.ts`.
- Produces:
  - `ASK_SYSTEM_PROMPT: string` — testo **esatto** del blocco «Prompt di sistema» della spec, §2.
  - `buildAskMessage(input: { kind: 'song' | 'text'; title: string; artist: string; level: Level; lines: string[]; requests: AskRequest[] }): string`
  - `ASK_SCHEMA` — schema Gemini (`type: 'OBJECT'`, maiuscole come in `src/domain/gemini/prompt.ts`) per `{ answers: [{ id, translation_it, item (nullable), verse (nullable) }] }`; `item.type` enum = 5 tipi di chunk + `noun, verb, adjective, adverb`; `verse.grammar_it`/`culture_it` nullable; `verse.proposals` = array di oggetti con i campi di `item` senza `item_type`, `surface_form`, `widened`.
  - zod: `AskItemSchema`, `AskProposalSchema`, `AskVerseSchema`; tipi `AskItem`, `AskProposal`, `AskVerse` (snake_case, come `Expansion`).
  - `type AskAnswer = { key: string; lineIndex: number; text?: string; translationIt: string; item: AskItem | null; verse: AskVerse | null }`
  - `answerKey(r: { lineIndex: number; text?: string }): string` — `v:<riga>` senza testo, altrimenti `w:<riga>:<normalizeKey(text)>`.
  - `checkAnswers(raw: unknown, requests: AskRequest[]): { answers: AskAnswer[]; missing: AskRequest[] }`

Formato del messaggio (righe unite da `\n`):
```text
Tipo: canzone            | Tipo: testo libero (non una canzone)
Titolo: {title} — {artist}   ← «Titolo: {title}» se artist vuoto; riga omessa se entrambi vuoti
Livello: {level}
Testo (righe numerate):
{i}: {line}
Richieste:
w1 · riga 4 · "gave up"
v1 · riga 7
```

Regole di `checkAnswers` (la riga e il testo vengono sempre dalla richiesta):
- `raw` senza array `answers` → `throw new GeminiError('bad_json', …)`.
- id sconosciuto → scartato. Per ogni id vale la **prima risposta completa**.
- completa = `translation_it.trim() !== ''` e: per `w*` `item` valido e `verse` null/assente; per `v*` `verse` valido e `item` null/assente.
- `item` valido: `item_type: 'chunk'` con `type` fra i 5 tipi di chunk, oppure `'word'` con `type` fra le 4 parti del discorso; `base_form`, `surface_form` non vuoti.
- proposte di un verso con `normalizeKey(base_form)` uguale al `base_form` di un `item` della stessa risposta → scartate; proposte oltre la seconda → scartate.
- `translationIt` salvata trim; `missing` = richieste senza risposta completa, nell'ordine originale.

- [ ] **Step 1: Write the failing tests**
  - messaggio: contiene `'Tipo: canzone'`, `'Titolo: Paper Lanterns — The Inventions'`, `'0: I gave up on you'`, `'Richieste:\nw1 · riga 0 · "gave up"\nv1 · riga 2'`; con `kind:'text'`, titolo e artista vuoti → contiene `'Tipo: testo libero (non una canzone)'` e non `'Titolo:'`.
  - `ASK_SYSTEM_PROMPT` contiene `'esattamente una volta'`, `'Non è mai vuota'`, `'widened'`; `ASK_SCHEMA.properties.answers.items.required` = `['id', 'translation_it', 'item', 'verse']`.
  - risposta completa per `w1` e `v1` → 2 answers, `key` `'w:0:gave up'` e `'v:2'`, `lineIndex` dalla richiesta anche se il raw contiene `line_index: 9`.
  - `translation_it: '  '` → in `missing`.
  - `item` su `v1` → in `missing`; `item_type:'word', type:'idiom'` → in `missing`.
  - id `w9` sconosciuto → ignorato; `w1` due volte, la prima incompleta → vale la seconda.
  - proposta uguale (maiuscole/apostrofi) all'item `w1` → scartata; 3 proposte → 2.
  - `{}` → `rejects/throws` `GeminiError` con `code: 'bad_json'`.
- [ ] **Step 2: Run** `npx vitest run tests/domain/ask-request.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/domain/askRequest.ts`; ogni risposta si valida singolarmente con `safeParse` (una sbagliata non fa cadere le altre).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Chiedi a Gemini prompt and per-id answer check with mandatory translation`

---

### Task 3: Chiamata con recupero delle mancanti

**Files:**
- Modify: `src/domain/askRequest.ts`
- Test: `tests/domain/ask-request.test.ts`

**Interfaces:**
- Consumes: `callGemini`, `GeminiDeps` da `src/domain/gemini/client.ts`.
- Produces: `requestAnswers(input: Parameters<typeof buildAskMessage>[0], gemini: { apiKey: string; model: string }, deps: GeminiDeps): Promise<{ answers: AskAnswer[]; unanswered: AskRequest[] }>`

Comportamento: prima chiamata con tutte le richieste; un errore qui si propaga. Se `missing` non è vuoto, **una** seconda chiamata con lo stesso prompt e solo le mancanti (stessi id). Errore o `bad_json` nella seconda → le mancanti diventano `unanswered`. Risultato: answers della prima + della seconda, ordinate come le richieste.

- [ ] **Step 1: Write the failing tests**
  - tutto completo → `fetch` chiamato 1 volta, `unanswered: []`.
  - prima risposta senza `v1` → 2 chiamate; il corpo della seconda contiene `'v1 · riga 2'` e non contiene `'w1 ·'`; risultato con entrambe.
  - seconda chiamata ancora senza `v1` → `unanswered` = `[{ id:'v1', lineIndex:2 }]`, nessuna terza chiamata.
  - seconda chiamata HTTP 400 → `unanswered` contiene `v1`, `answers` contiene `w1`, nessuna eccezione.
  - prima chiamata HTTP 400 → rejects `GeminiError`.
- [ ] **Step 2: Run** `npx vitest run tests/domain/ask-request.test.ts` — Expected: FAIL sui nuovi test.
- [ ] **Step 3: Implement** `requestAnswers`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: one recovery call for unanswered Chiedi a Gemini requests`

---

### Task 4: Salvataggio di traduzioni, note e bozza

**Files:**
- Modify: `src/db/types.ts` (interfaccia `Song`)
- Create: `src/domain/askDraft.ts`
- Test: `tests/domain/ask-draft.test.ts`

**Interfaces:**
- Consumes: `requestAnswers`, `AskAnswer`, `answerKey` (Task 2–3); `AskRequest` (Task 1); `getSettings`.
- Produces:
  - in `types.ts`: `export type LineNote = { lineIndex: number; senseIt: string; grammarIt: string | null; cultureIt: string | null }`; `export type AskDraft = { answers: import('../domain/askRequest').AskAnswer[]; unanswered: import('../domain/askSelection').AskRequest[] }`; su `Song`: `lineNotes?: LineNote[]` e `askDraft?: AskDraft` con i commenti JSDoc della spec §4.
  - `askGemini(db: SinglishDB, songId: string, requests: AskRequest[], deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> }): Promise<AskDraft>` — legge impostazioni e canzone, chiama `requestAnswers`, poi `saveAnswers`.
  - `saveAnswers(db: SinglishDB, songId: string, result: { answers: AskAnswer[]; unanswered: AskRequest[] }): Promise<AskDraft>` — in una transazione `rw` su `songs`.

Regole di `saveAnswers`:
- canzone assente → `throw new Error(...)`, niente scritto.
- `lineTranslations`: aggiunge solo le righe che non hanno già una traduzione; ordinate per riga.
- `lineNotes`: per ogni answer con `verse`, nota `{ lineIndex, senseIt, grammarIt, cultureIt }` che sostituisce quella della stessa riga.
- `askDraft`: unione con la bozza esistente per `key` (le nuove sostituiscono); una chiave che riceve risposta esce da `unanswered`; `unanswered` nuove si aggiungono se la chiave non ha già una risposta (chiave di una richiesta = `answerKey(request)`). Answers ordinate per `lineIndex`, poi `w` prima di `v`.
- restituisce la bozza salvata.

- [ ] **Step 1: Write the failing tests**
  - riga 0 già tradotta `'vecchia'`, risposta con `translationIt 'nuova'` sulla riga 0 e riga 2 → riga 0 resta `'vecchia'`, riga 2 aggiunta.
  - answer verso riga 2 → `lineNotes` `[{lineIndex:2, senseIt:…, grammarIt:null, cultureIt:'…'}]`; seconda richiesta sulla riga 2 → una sola nota, quella nuova.
  - **(Review Focus 2)** bozza con `w:0:gave up` e `v:2`; nuova risposta per `w:0:gave up` con meaning diverso → la bozza ha 2 answers e quella di `gave up` è la nuova.
  - `unanswered` `v1` riga 2 nella bozza, poi risposta per `v:2` → `unanswered` vuoto.
  - canzone eliminata prima di `saveAnswers` → rejects; nessuna tabella cambiata.
  - `askGemini` end-to-end con `fetch` finto → bozza salvata su `db.songs.get(id).askDraft`; senza chiave → rejects `GeminiError` `no_key`.
- [ ] **Step 2: Run** `npx vitest run tests/domain/ask-draft.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** tipi e `src/domain/askDraft.ts`.
- [ ] **Step 4: Run** il test e `npm run typecheck` — Expected: PASS, nessun errore.
- [ ] **Step 5: Commit** `feat: save translations, verse notes and a pending answers draft`

---

### Task 5: «Aggiungi» e «Chiudi senza aggiungere»

**Files:**
- Modify: `src/domain/askDraft.ts`
- Modify (migrazione all'API nuova, stesse asserzioni sul risultato): `tests/domain/consistency-audit4.test.ts`, `consistency-audit5.test.ts`, `consistency-audit9.test.ts`, `consistency-audit13.test.ts`, `consistency-audit14.test.ts`
- Test: `tests/domain/ask-draft.test.ts`

**Interfaces:**
- Consumes: `addContext`, `contextOf`, `graduate` da `src/domain/ingest.ts`; `newCardPair`; `normalizeKey`; `newId`.
- Produces:
  - `proposalKey(a: AskAnswer, p: AskProposal): string` → `${a.key}>${normalizeKey(p.base_form)}`
  - `defaultKeep(draft: AskDraft): Set<string>` — tutte le chiavi di `item`, nessuna proposta.
  - `keepPlan(words: Word[], chunks: Chunk[], cards: { itemId: string; kind: string }[], draft: AskDraft, keep: ReadonlySet<string>): { cards: number; existing: number }`
  - `keepAnswers(db: SinglishDB, songId: string, keep: ReadonlySet<string>, now: Date): Promise<{ added: number; existing: number }>`
  - `dropDraft(db: SinglishDB, songId: string): Promise<void>` — toglie `askDraft`.

Regole di `keepAnswers` (riprendono il ciclo di salvataggio di `askGemini` in `src/domain/ask.ts`, con i suoi commenti): in una transazione `rw` su `songs, chunks, words, cards`; canzone assente → `throw`. Per ogni voce spuntata (item `w*` o proposta, riga = `answer.lineIndex`):
- chunk (`item_type:'chunk'` o proposta): chiave `normalizeKey(base_form)`; esiste → `addContext` + `graduate`, `suspended=false`, conta `existing` una volta per voce; nuova → `Chunk` con `surfaceForm` = `surface_form` (proposta: `base_form`), `pronunciationNoteIt: ''`, 2 card.
- parola: `lemma = base_form.trim().toLowerCase()`, `pos = type`; esiste → come oggi (contesto, `suspended=false`, se non `learn` passa in `learn` con `wasKnown` se era `known`, card R+C se non ha R); nuova → `Word` con `freqRank: 0`, `triage:'learn'`, 2 card.
- una voce creata in questa chiamata e ripetuta riceve solo il verso (non conta `existing`).
- poi `askDraft` tolto. `keepPlan.cards` deve uguagliare le card create.

- [ ] **Step 1: Write the failing tests**
  - `defaultKeep` = chiavi degli item, nessuna `>`.
  - spuntati 1 chunk nuovo e 1 proposta non spuntata → 1 chunk, 2 card, `askDraft` assente.
  - **(Review Focus 4)** stesso `base_form` restituito per riga 0 e riga 1, entrambi spuntati → 1 chunk con `contexts` di 2 righe, 2 card, `keepPlan(...).cards === 2`, `{ added: 1, existing: 0 }`.
  - parola esistente `triage:'known'` spuntata → `triage:'learn'`, `wasKnown:true`, 2 card; `keepPlan.cards` = 2 prima della chiamata.
  - nulla spuntato → nessuna card, bozza tolta.
  - `dropDraft` → `askDraft` assente, `lineNotes` e `lineTranslations` intatti.
  - migrazione: nei cinque `consistency-audit*.test.ts` sostituire `askGemini(db, songId, picks, deps)` con `askGemini(db, songId, requests, deps)` + `keepAnswers(db, songId, defaultKeep(draft), now)`, con il `fetch` finto che risponde nel formato `answers`; le asserzioni sul risultato (`{ added, existing }`, card, `suspended`, `wasKnown`, voce orfana assente) restano uguali. Per il caso «canzone eliminata durante la chiamata», l'eliminazione avviene dentro il `fetch` finto e `askGemini` rejects senza bozza né voci.
- [ ] **Step 2: Run** `npx vitest run tests/domain/ask-draft.test.ts tests/domain/consistency-audit*.test.ts` — Expected: FAIL sui nuovi test.
- [ ] **Step 3: Implement** in `src/domain/askDraft.ts`.
- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat: keep only the ticked Chiedi a Gemini items; close without adding`

---

### Task 6: Segnare nel testo (UI) e invio

**Files:**
- Create: `src/ui/components/PickLine.tsx`
- Modify: `src/ui/screens/Study.tsx` (stato della selezione, barra, invio; rimuovere `PickLine` locale e l'import da `domain/ask`)
- Delete: `src/domain/ask.ts`, `tests/domain/ask.test.ts` (coperti da Task 1–5)
- Modify: `src/styles/base.css` (`.joint`, `.verse-no`)
- Test: `tests/ui/ask.test.tsx` (riscritto)

**Interfaces:**
- Consumes: Task 1 (`Selection`, `toggle*`, `requestsOf`, `withinLimit`, `MAX_REQUESTS`, `tokenize`); `askGemini` (Task 4).
- Produces: `PickLine({ line, lineIndex, sel, onWord, onJoin, onVerse, disabled }: { line: string; lineIndex: number; sel: Selection; onWord(key: string): void; onJoin(key: string): void; onVerse(lineIndex: number): void; disabled?: boolean })`

UI:
- numero del verso: `<button class="verse-no" aria-pressed aria-label={`Verso intero ${lineIndex + 1}`}>{lineIndex + 1}</button>` prima del verso.
- parole: come oggi (`button.tok`, `aria-pressed`).
- fra `l:t` e `l:t+1` entrambe segnate, al posto del testo fra i due token: `<button class="joint" aria-pressed={joined} aria-label={joined ? `Separa «${a}» e «${b}»` : `Unisci «${a}» e «${b}»`}>↔</button>` (il testo in mezzo, se è punteggiatura, resta prima del giunto).
- testo d'aiuto: `Tocca le parole che non ti sono chiare, o il numero di un verso per chiederlo tutto. Il simbolo ↔ unisce due parole vicine in un'espressione.`
- barra: `{plural(v,'verso','versi')} · {plural(w,'voce','voci')}` (parti a zero omesse; nessuna richiesta → `Niente da chiedere`); un tocco rifiutato da `withinLimit` lascia la selezione e mostra `Massimo 12 per volta` (`role="status"`) fino al tocco successivo.
- invio: `askGemini(db, songId, requestsOf(...), { fetch, sleep })`; successo → selezione vuota, esce dalla modalità, apre il foglio `window.location.hash = href({ name: 'study', songId, itemId: 'ask' })`; errore → messaggio da `geminiProblem` come oggi, selezione conservata.

- [ ] **Step 1: Write the failing tests** (testo inventato `['I gave up on you, babe', 'paper lanterns drift']`)
  - segnare `gave` e `up` → appare `button` «Unisci «gave» e «up»»; click → `aria-pressed="true"` e nome «Separa…»; barra `1 voce`.
  - click su «Verso intero 2» → barra `1 verso · 1 voce`.
  - 12 parole segnate, tredicesima → resta `aria-pressed="false"` e compare `Massimo 12 per volta`.
  - invio con `fetch` finto completo → 1 chiamata, corpo con `'w1 · riga 0 · \\"gave up\\"'` e `'v1 · riga 1'`; poi `location.hash` termina con `item=ask`.
  - `fetch` HTTP 400 → messaggio d'errore e `gave` ancora `aria-pressed="true"`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/ask.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** componente, Study e stili (giunto e numero ≥ 44 × 44 px, colori da token).
- [ ] **Step 4: Run** `npx vitest run tests/ui && npm run typecheck` — Expected: PASS; `tests/ui/study.test.tsx` invariato e verde.
- [ ] **Step 5: Commit** `feat: pick words, joins and whole verses in Study`

---

### Task 7: Foglio «Risposte», bozza pendente, Riprova

**Files:**
- Create: `src/ui/screens/AnswersSheet.tsx`
- Modify: `src/ui/screens/Study.tsx` (dispatch `itemId === 'ask'`; avviso bozza)
- Modify: `src/styles/base.css`
- Test: `tests/ui/answers-sheet.test.tsx`

**Interfaces:**
- Consumes: `useSheet` da `src/ui/screens/ItemSheet.tsx`; `defaultKeep`, `keepPlan`, `keepAnswers`, `dropDraft`, `proposalKey`, `askGemini` (Task 4–5); `useOnline`.
- Produces: `AnswersSheet({ song }: { song: Song })`

Contenuto (spec §3), gruppi per verso in ordine di riga:
- `<h3 lang="en">{verso}</h3>` e la traduzione; se c'è `verse`: «Senso», poi «Grammatica» e «Cultura» solo se non null.
- item: checkbox con etichetta `surface_form` (`lang="en"`), poi `meaning_it`, `explanation_it`, `extra_example_en`; se `widened`: «allargata a *{surface_form}*» (frase originale `text`); se già nel lessico (chunk per `key`, parola per `lemma`): «Già nel tuo lessico».
- proposte: checkbox non spuntata con `base_form` e `meaning_it`.
- `unanswered`: «Gemini non ha risposto su questo» con il testo o «Verso {n}»; in fondo un pulsante `Riprova` (disabilitato offline o durante la richiesta) che chiama `askGemini` con `draft.unanswered`.
- piede: `Aggiungi {plural(n,'card','card')} al ripasso` con `n = keepPlan(...).cards`; se `n === 0`: `Chiudi`. Secondo pulsante `Chiudi senza aggiungere` → `dropDraft` e chiusura. Entrambi disabilitati durante l'azione.
- bozza assente (es. indirizzo aperto a mano) → il foglio si chiude.
- Studio, fuori dalla modalità selezione, con `song.askDraft`: `<p class="note info-box">Hai risposte da rivedere</p>` con link `Rivedi` a `href({ name: 'study', songId, itemId: 'ask' })`.

- [ ] **Step 1: Write the failing tests** (bozza scritta direttamente su `db.songs`)
  - un item e una proposta → casella item spuntata, proposta no; pulsante `Aggiungi 2 card al ripasso`; spuntare la proposta → `Aggiungi 4 card al ripasso`.
  - verso con `grammar_it: null` → «Senso» e «Cultura» presenti, «Grammatica» assente; traduzione visibile.
  - `Aggiungi` → `db.chunks` 1, `askDraft` assente.
  - `Chiudi senza aggiungere` → nessun chunk, `askDraft` assente, `lineNotes` intatti.
  - **(Review Focus 3)** Esc → foglio chiuso, `askDraft` presente, Studio mostra `Hai risposte da rivedere`.
  - **(Review Focus 5)** `unanswered` presente: offline → `Riprova` disabilitato; online → click → 1 chiamata; un secondo click durante la richiesta non parte (1 chiamata).
- [ ] **Step 2: Run** `npx vitest run tests/ui/answers-sheet.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** foglio, dispatch e avviso.
- [ ] **Step 4: Run** `npx vitest run tests/ui && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Answers sheet to choose what enters the review`

---

### Task 8: Note sui versi, e2e, documentazione

**Files:**
- Create: `src/ui/screens/VerseSheet.tsx`
- Modify: `src/ui/screens/Study.tsx` (segno sul verso; dispatch `itemId` che inizia con `ln:`)
- Modify: `src/styles/base.css`
- Modify: `docs/spec.md` (§8: nuova sottosezione «Chiedi a Gemini»)
- Test: `tests/ui/verse-sheet.test.tsx`, `tests/e2e/ask.spec.ts`

**Interfaces:**
- Consumes: `useSheet`; `Song.lineNotes`, `Song.lineTranslations`.
- Produces: `VerseSheet({ song, itemId }: { song: Song; itemId: string })` — `itemId = 'ln:<riga>'`.

UI: in Studio (fuori dalla selezione) un verso con nota mostra dopo il testo un link `<a class="verse-note" href={href({ name: 'study', songId, itemId: `ln:${i}` })} aria-label={`Note sul verso ${i + 1}`}>` con un'icona esistente di `Icon` (≥ 44 px, colore da token). Il foglio: verso (`lang="en"`), traduzione, «Senso», «Grammatica» e «Cultura» se non null. Riga senza nota → il foglio si chiude.

- [ ] **Step 1: Write the failing tests**
  - canzone con `lineNotes` sulla riga 1 → esiste il link «Note sul verso 2», non quello del verso 1.
  - foglio `ln:1` → mostra verso, traduzione, Senso, Cultura; niente Grammatica se null.
  - e2e (`tests/e2e/ask.spec.ts`, rete bloccata come in `mvp.spec.ts`, `generativelanguage` servito da `page.route` con una risposta completa): Studio → «Chiedi a Gemini» → segna due parole, unisci, segna un verso → invio → foglio Risposte → `Aggiungi 2 card al ripasso` → il verso mostra «Note sul verso» e l'espressione è evidenziata nel testo.
- [ ] **Step 2: Run** `npx vitest run tests/ui/verse-sheet.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** segno, foglio, stili; aggiorna `docs/spec.md` §8 copiando dalla spec di design messaggio, prompt e schema, più le regole su recupero, bozza e limite di 12.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build && npm run test:e2e` — Expected: tutto verde.
- [ ] **Step 5: Commit** `feat: verse notes in Study; e2e and spec for Chiedi a Gemini v2`
