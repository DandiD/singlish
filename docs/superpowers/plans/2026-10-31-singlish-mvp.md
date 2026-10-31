# Singlish MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una PWA installabile che trasforma un testo di canzone incollato in chunk e parole da ripassare con FSRS, con sessione quotidiana da 30 minuti.

**Architecture:** App statica Vite + Preact senza backend. Il dominio (testo, frequenze, Gemini, ingest, scheduler, coda, timer, backup) è fatto di moduli TypeScript puri o con `db` e `now` iniettati, testati con Vitest e fake-indexeddb. Le schermate sono componenti Preact sottili sopra il dominio, con `useLiveQuery` di Dexie.

**Tech Stack:** Vite, Preact, TypeScript strict, Dexie 4 + dexie-react-hooks, ts-fsrs, zod, vite-plugin-pwa; Vitest, @testing-library/preact, happy-dom, fake-indexeddb, Playwright.

**Spec:** `docs/spec.md` (valori e regole), `docs/design.md` (token, schermate, route). Leggili entrambi prima di ogni task.

## Global Constraints

- Card nuove al giorno: 16 (`newPerDay`), chunk e parole insieme.
- Ripasso: 30 minuti; studio canzone: 15 minuti.
- Se i ripassi in scadenza stimati superano i minuti del timer di ripasso, nessuna card nuova quel giorno.
- Fascia di frequenza: B1 2000–5000, B2 3000–8000, C1 6000–15000.
- Voti FSRS 1 Again, 2 Hard, 3 Good, 4 Easy; etichette UI Di nuovo, Difficile, Bene, Facile. Memoria obiettivo predefinita 0.9, range 0.85–0.95.
- Correzione automatica: esatto = 3, Levenshtein 1 = 2, altro = 1.
- Card C sbloccata dopo 2 ripassi R con voto diverso da Again.
- Gemini: `temperature: 0.2`, JSON con `responseSchema`, retry dopo 2000, 8000, 30000 ms su 429 e 5xx.
- Massimo 4 canzoni aperte (status `analyzed` o `studying`).
- Tutto il tempo del dominio viene da un parametro `now: Date`; il "giorno" è il giorno locale del dispositivo.
- Copy UI in italiano; nessun testo di canzone reale in fixture o test.
- Colori solo da variabili CSS di `src/styles/tokens.css`; touch target ≥ 44 px.

## Review Focus

1. **Testo incollato sporco** (CRLF, righe vuote multiple, intestazioni tipo `[Chorus]`, apostrofi tipografici): l'utente si aspetta righe pulite e indici stabili → test in Task 3 (`splitLines`).
2. **Gemini restituisce `line_index` fuori range o duplicati**: nessun crash, l'elemento viene scartato o deduplicato → test in Task 6 (`parseAnalysis`).
3. **Stesso chunk in due canzoni**: nessuna card doppia, il verso si aggiunge a `contexts` → test in Task 8.
4. **App chiusa a metà sessione o timer ricaricato**: il tempo rimasto si ricalcola dai timestamp, il ripasso già fatto resta salvato → test in Task 12 e Task 10.
5. **Cambio di giorno e ora legale**: il conteggio "nuove di oggi" usa il giorno locale; una sessione iniziata alle 23:50 non regala 16 nuove extra a mezzanotte e 10 → test in Task 11.

## File Structure

```
src/
  main.tsx                 avvio, tema, registrazione SW
  app.tsx                  shell: router + nav in basso
  router.ts                parseRoute(hash) → Route
  styles/tokens.css        token da docs/design.md
  styles/base.css          reset, font, componenti base (button, card, sheet)
  db/types.ts              tipi delle tabelle
  db/db.ts                 classe Dexie, createDb()
  domain/settings.ts       default, bandForLevel, get/save
  domain/text.ts           splitLines, normalizeAnswer, levenshtein, gradeAnswer, normalizeKey
  domain/freq.ts           ranksFromList, loadRanks, filterWordsByBand
  domain/spotify.ts        parseSpotifyTrackUrl, fetchTrackTitle
  domain/gemini/prompt.ts  SYSTEM_PROMPT, buildUserMessage, RESPONSE_SCHEMA
  domain/gemini/parse.ts   AnalysisSchema (zod), parseAnalysis
  domain/gemini/client.ts  callGemini, GeminiError
  domain/ingest.ts         saveAnalysis, analyzeSong
  domain/triage.ts         applyTriage
  domain/scheduler.ts      createScheduler, newFsrsCard, recordReview
  domain/queue.ts          startOfLocalDay, buildSessionQueue, estimateAvgSeconds
  domain/timer.ts          funzioni pure del timer
  domain/backup.ts         exportBackup, importBackup
  ui/useTimer.ts           hook: persistenza + visibilitychange + wake lock
  ui/screens/Today.tsx, Songs.tsx, AddSong.tsx, Analyzing.tsx, Study.tsx,
            ItemSheet.tsx, Triage.tsx, Session.tsx, Settings.tsx
  ui/components/BottomNav.tsx, TimerPill.tsx, Highlighted.tsx, RatingBar.tsx
scripts/build-freq.mjs     TSV → public/freq.json
public/freq.json           generato (fixture piccola finché la fonte non è scelta)
tests/                     specchio di src/ (unit) + tests/e2e/ (Playwright)
```

---

### Task 1: Scaffold, token, router, shell

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/app.tsx`, `src/router.ts`, `src/styles/tokens.css`, `src/styles/base.css`, `src/ui/components/BottomNav.tsx`
- Test: `tests/router.test.ts`

**Interfaces:**
- Produces: `type Route = { name: 'today' } | { name: 'songs' } | { name: 'addSong' } | { name: 'analyzing', songId: string } | { name: 'study', songId: string, itemId?: string } | { name: 'triage', songId: string } | { name: 'session' } | { name: 'settings' } | { name: 'notFound' }`; `parseRoute(hash: string): Route`; `href(route: Route): string`; hook `useRoute(): Route`.

- [ ] **Step 1: Scaffold** con `npm create vite@latest . -- --template preact-ts`; aggiungi le dipendenze dello stack in CLAUDE.md; script `test`, `test:e2e`, `typecheck` (`tsc --noEmit`), `build`. Vitest con environment `happy-dom` e `setupFiles` che importa `fake-indexeddb/auto`. Alias `react` → `preact/compat` in vite e vitest (serve a dexie-react-hooks).
- [ ] **Step 2: Write the failing test**

```ts
test('parseRoute maps hashes', () => {
  expect(parseRoute('')).toEqual({ name: 'today' })
  expect(parseRoute('#/songs/new')).toEqual({ name: 'addSong' })
  expect(parseRoute('#/songs/abc')).toEqual({ name: 'study', songId: 'abc' })
  expect(parseRoute('#/songs/abc?item=x1')).toEqual({ name: 'study', songId: 'abc', itemId: 'x1' })
  expect(parseRoute('#/songs/abc/triage')).toEqual({ name: 'triage', songId: 'abc' })
  expect(parseRoute('#/nope')).toEqual({ name: 'notFound' })
})
test('href round-trips', () => {
  const r = { name: 'analyzing', songId: 'z' } as const
  expect(parseRoute(href(r))).toEqual(r)
})
```

- [ ] **Step 3: Run** `npx vitest run tests/router.test.ts` → FAIL (modulo mancante).
- [ ] **Step 4: Implement** `parseRoute`, `href`, `useRoute` (ascolta `hashchange`) secondo le route di `docs/design.md`. Copia i token in `src/styles/tokens.css` esattamente come in `docs/design.md`; `<html data-theme>` impostato da `main.tsx` (default `auto`). Font Google in `index.html`. `app.tsx` mostra un segnaposto per ogni route e `BottomNav` (Oggi, Canzoni, Lessico disabilitato con "Presto").
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run build` → tutto verde.
- [ ] **Step 6: Commit** `feat: scaffold app shell, tokens and hash router`

---

### Task 2: Database e impostazioni

**Files:**
- Create: `src/db/types.ts`, `src/db/db.ts`, `src/domain/settings.ts`
- Test: `tests/domain/settings.test.ts`

**Interfaces:**
- Produces (tipi in `src/db/types.ts`):
  - `Level = 'B1' | 'B2' | 'C1'`; `Register = 'usable' | 'informal' | 'song_only'`; `ChunkType = 'phrasal_verb' | 'idiom' | 'collocation' | 'fixed_phrase' | 'slang'`; `Rating = 1 | 2 | 3 | 4`; `Context = { songId: string; lineIndex: number }`.
  - `Song { id; kind: 'song'; title; artist; spotifyUrl: string | null; lines: string[]; status: 'draft' | 'queued' | 'analyzed' | 'studying' | 'done'; level: Level; difficultyKnownPct: number | null; comprehensionBefore: number | null; grammarPoint: { title: string; explanationIt: string; lineIndex: number } | null; connectedSpeech: { lineIndex: number; written: string; sung: string; noteIt: string }[]; addedAt: Date; analyzedAt: Date | null }`
  - `Chunk { id; songId; key: string; baseForm; surfaceForm; lineIndex: number; contexts: Context[]; type: ChunkType; cefr: string; register: Register; topic: string; meaningIt; explanationIt; extraExampleEn; productionPromptIt; pronunciationNoteIt; userEdited: boolean; suspended: boolean }`
  - `Word { id; lemma; surfaceForm; pos; freqRank: number; songId; lineIndex: number; contexts: Context[]; cefr; register: Register; topic; meaningIt; explanationIt; extraExampleEn; triage: 'pending' | 'known' | 'learn'; userEdited: boolean; suspended: boolean }`
  - `CardRow { id; itemType: 'chunk' | 'word'; itemId; kind: 'R' | 'C'; unlocked: 0 | 1; due: Date; fsrs: import('ts-fsrs').Card; goodRCount: number }`
  - `Review { id; cardId; rating: Rating; auto: boolean; answer: string | null; elapsedMs: number; reviewedAt: Date; wasNew: boolean }`
  - `SessionRow { id; kind: 'study' | 'review'; songId: string | null; startedAt: Date; endedAt: Date | null; timer: TimerState; reviewsDone: number; newDone: number }` (`TimerState` è definito qui, in `src/db/types.ts`: `{ status: 'idle' | 'running' | 'paused' | 'stopped'; durationMs: number; accumulatedMs: number; resumedAt: number | null }`)
  - `Settings { id: 'settings'; apiKey: string; model: string; theme: 'auto' | 'light' | 'dark'; level: Level; bandStart: number; bandEnd: number; desiredRetention: number; newPerDay: number; timerMinutes: { study: number; review: number }; persistAsked: boolean }`
- Produces (`src/db/db.ts`): `class SinglishDB extends Dexie` con tabelle `songs: 'id, status, addedAt'`, `chunks: 'id, songId, &key'`, `words: 'id, &lemma, triage, songId'`, `cards: 'id, [unlocked+due], itemId, kind'`, `reviews: 'id, cardId, reviewedAt'`, `sessions: 'id, startedAt'`, `settings: 'id'`; `createDb(name = 'singlish'): SinglishDB`; `export const db = createDb()`.
- Produces (`src/domain/settings.ts`): `DEFAULT_SETTINGS: Settings` (apiKey `''`, model `'gemini-flash-lite-latest'` (verifica in AI Studio che l'alias esista per la tua chiave; è solo il default), theme `'auto'`, level `'B1'`, band 2000–5000, desiredRetention 0.9, newPerDay 16, timerMinutes { study: 15, review: 30 }, persistAsked false); `bandForLevel(level: Level): [number, number]`; `getSettings(db): Promise<Settings>`; `saveSettings(db, patch: Partial<Omit<Settings,'id'>>): Promise<Settings>` (se cambia `level` senza band esplicita, aggiorna la band con `bandForLevel`; clamp `desiredRetention` a 0.85–0.95 e `newPerDay` a 1–40).

- [ ] **Step 1: Write the failing test** (ogni test usa `createDb('t-' + crypto.randomUUID())`)

```ts
test('defaults when empty', async () => {
  expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS)
})
test('bands per level', () => {
  expect(bandForLevel('B1')).toEqual([2000, 5000])
  expect(bandForLevel('B2')).toEqual([3000, 8000])
  expect(bandForLevel('C1')).toEqual([6000, 15000])
})
test('changing level moves the band', async () => {
  const s = await saveSettings(db, { level: 'B2' })
  expect([s.bandStart, s.bandEnd]).toEqual([3000, 8000])
})
test('clamps retention and newPerDay', async () => {
  const s = await saveSettings(db, { desiredRetention: 0.99, newPerDay: 0 })
  expect(s.desiredRetention).toBe(0.95); expect(s.newPerDay).toBe(1)
})
```

- [ ] **Step 2: Run** `npx vitest run tests/domain/settings.test.ts` → FAIL.
- [ ] **Step 3: Implement** tipi, `SinglishDB`, impostazioni.
- [ ] **Step 4: Run** → PASS; `npm run typecheck` verde.
- [ ] **Step 5: Commit** `feat: dexie schema and settings`

---

### Task 3: Testo e confronto risposte

**Files:**
- Create: `src/domain/text.ts`
- Test: `tests/domain/text.test.ts`

**Interfaces:**
- Produces: `splitLines(raw: string): string[]`; `normalizeAnswer(s: string): string`; `normalizeKey(s: string): string`; `levenshtein(a: string, b: string): number`; `gradeAnswer(given: string, expected: string): { rating: 1 | 2 | 3; distance: number }`.

- [ ] **Step 1: Write the failing test**

```ts
test('splitLines cleans pasted lyrics', () => {
  const raw = '[Verse 1]\r\nI ran   down the road\r\n\r\n\r\n  We’re late again \n[Chorus]\nLa la'
  expect(splitLines(raw)).toEqual(['I ran down the road', "We're late again", 'La la'])
})
test('normalizeAnswer expands contractions and quotes', () => {
  expect(normalizeAnswer('  I’m GONNA  go ')).toBe('i am going to go')
  expect(normalizeAnswer("can't")).toBe('cannot')
})
test('gradeAnswer', () => {
  expect(gradeAnswer('let it slide', 'let it slide')).toEqual({ rating: 3, distance: 0 })
  expect(gradeAnswer('let it slid', 'let it slide').rating).toBe(2)
  expect(gradeAnswer('let go', 'let it slide').rating).toBe(1)
  expect(gradeAnswer("I'm over it", 'I am over it').rating).toBe(3)
})
test('normalizeKey ignores case and quotes', () => {
  expect(normalizeKey('Get It Off My Chest')).toBe(normalizeKey('get it off my chest'))
})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `splitLines`: CRLF → LF, scarta righe vuote e righe che sono solo `[...]`, apostrofi tipografici → `'`, spazi multipli → uno, trim. `normalizeAnswer`: minuscole, apostrofi, spazi, poi sostituzione a parola intera delle contrazioni della spec §5. `normalizeKey` = `normalizeAnswer`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: text normalization and answer grading`

---

### Task 4: Lista di frequenza e filtro per fascia

**Files:**
- Create: `src/domain/freq.ts`, `scripts/build-freq.mjs`, `public/freq.json` (fixture: 30 lemmi inventati o comuni, solo per sviluppo)
- Test: `tests/domain/freq.test.ts`

**Interfaces:**
- Consumes: `AnalysisWord` (Task 6; per evitare dipendenze circolari definisci qui `type WordCandidate = { lemma: string }` e rendi la funzione generica).
- Produces: `ranksFromList(lemmas: string[]): Map<string, number>` (rango = indice + 1, lemma in minuscolo, primo vince); `loadRanks(fetchFn = fetch): Promise<Map<string, number>>` (legge `/freq.json`, cache in memoria); `filterWordsByBand<T extends { lemma: string }>(words: T[], ranks: Map<string, number>, band: [number, number], known: Set<string>): (T & { freqRank: number })[]`.
- `scripts/build-freq.mjs <input.tsv> [--top 20000]`: legge righe `lemma<TAB>rank`, ordina per rank, deduplica, scrive `public/freq.json` come array di lemmi.

- [ ] **Step 1: Write the failing test**

```ts
const ranks = ranksFromList(['the', 'be', 'Harbour', 'dawn', 'the'])
test('ranks are 1-based, lowercase, first wins', () => {
  expect(ranks.get('the')).toBe(1); expect(ranks.get('harbour')).toBe(3)
})
test('filter keeps in-band, unknown, ranked words', () => {
  const words = [{ lemma: 'dawn' }, { lemma: 'the' }, { lemma: 'harbour' }, { lemma: 'zzz' }]
  const out = filterWordsByBand(words, ranks, [3, 4], new Set(['harbour']))
  expect(out).toEqual([{ lemma: 'dawn', freqRank: 4 }])
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5:** Verifica lo script: `node scripts/build-freq.mjs tests/fixtures/freq.tsv --top 3` con una fixture di 5 righe → `public/freq.json` contiene 3 lemmi in ordine. Ripristina poi la fixture di sviluppo.
- [ ] **Step 6: Commit** `feat: frequency ranks and band filter`

---

### Task 5: Link Spotify

**Files:**
- Create: `src/domain/spotify.ts`
- Test: `tests/domain/spotify.test.ts`

**Interfaces:**
- Produces: `parseSpotifyTrackUrl(url: string): string | null` (restituisce `https://open.spotify.com/track/{id}`); `fetchTrackTitle(trackUrl: string, fetchFn: typeof fetch = fetch): Promise<string | null>` (oEmbed, campo `title`; qualsiasi errore → `null`).

- [ ] **Step 1: Write the failing test**

```ts
test('parses track links', () => {
  expect(parseSpotifyTrackUrl('https://open.spotify.com/intl-it/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'))
    .toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')
  expect(parseSpotifyTrackUrl('https://open.spotify.com/album/123')).toBeNull()
  expect(parseSpotifyTrackUrl('not a url')).toBeNull()
})
test('title from oEmbed, null on failure', async () => {
  const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'Late Train Home' })))
  expect(await fetchTrackTitle('https://open.spotify.com/track/x', ok)).toBe('Late Train Home')
  expect(ok).toHaveBeenCalledWith('https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fx')
  const ko = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
  expect(await fetchTrackTitle('https://open.spotify.com/track/x', ko)).toBeNull()
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: spotify track link parsing and oembed title`

---

### Task 6: Prompt, schema e parsing della risposta Gemini

**Files:**
- Create: `src/domain/gemini/prompt.ts`, `src/domain/gemini/parse.ts`
- Test: `tests/domain/gemini-parse.test.ts`, `tests/fixtures/analysis.json` (risposta inventata su un testo inventato, 3 chunk e 3 parole)

**Interfaces:**
- Produces (`prompt.ts`): `SYSTEM_PROMPT: string` (testo esatto di spec §8); `buildUserMessage(input: { level: Level; band: [number, number]; known: string[]; lines: string[] }): string` (formato di spec §8, righe `"{i}: {line}"`, `known` troncato a 300 voci); `RESPONSE_SCHEMA: object` (schema OpenAPI per Gemini: `type: 'OBJECT'`, proprietà come spec §8, enum per `type`, `register`, `pos`, `cefr`; `required` per tutti i campi tranne `pronunciation_note_it`).
- Produces (`parse.ts`): `AnalysisSchema` (zod); `type Analysis = z.infer<typeof AnalysisSchema>`; `type AnalysisChunk = Analysis['chunks'][number]`; `type AnalysisWord = Analysis['words'][number]`; `parseAnalysis(raw: unknown, lineCount: number): Analysis` — lancia `GeminiError('bad_json')` (Task 7; per ora definisci `GeminiError` in `client.ts` già in questo task con il solo costruttore) se lo schema non torna; scarta chunk/parole con `line_index` fuori da `[0, lineCount)`; deduplica chunk per `normalizeKey(base_form)` e parole per lemma minuscolo; clamp di `difficulty_known_pct` a 0–100; `grammar_point` con indice fuori range → `null`.

- [ ] **Step 1: Write the failing test**

```ts
test('prompt lists numbered lines and known items', () => {
  const m = buildUserMessage({ level: 'B2', band: [3000, 8000], known: ['figure out'], lines: ['a', 'b'] })
  expect(m).toContain('Livello: B2'); expect(m).toContain('Fascia di frequenza: 3000-8000')
  expect(m).toContain('0: a\n1: b'); expect(m).toContain('figure out')
})
test('parses fixture', () => {
  const a = parseAnalysis(fixture, 10)
  expect(a.chunks).toHaveLength(3); expect(a.words).toHaveLength(3)
})
test('drops out-of-range lines and duplicates', () => {
  const bad = structuredClone(fixture)
  bad.chunks.push({ ...bad.chunks[0], line_index: 99 })
  bad.chunks.push({ ...bad.chunks[0], base_form: bad.chunks[0].base_form.toUpperCase() })
  bad.difficulty_known_pct = 140
  const a = parseAnalysis(bad, 10)
  expect(a.chunks).toHaveLength(3); expect(a.difficulty_known_pct).toBe(100)
})
test('rejects garbage', () => {
  expect(() => parseAnalysis({ foo: 1 }, 10)).toThrow(GeminiError)
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: gemini prompt, response schema and parser`

---

### Task 7: Client Gemini con retry

**Files:**
- Modify: `src/domain/gemini/client.ts`
- Test: `tests/domain/gemini-client.test.ts`

**Interfaces:**
- Produces: `class GeminiError extends Error { code: 'no_key' | 'rate_limited' | 'http' | 'network' | 'bad_json'; status?: number }`; `RETRY_DELAYS_MS = [2000, 8000, 30000]`; `callGemini(req: { apiKey: string; model: string; system: string; user: string; schema: object }, deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> }): Promise<unknown>` — POST all'endpoint di spec §8 con header `x-goog-api-key`, body `{ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema } }`; restituisce `JSON.parse(candidates[0].content.parts[0].text)`.

- [ ] **Step 1: Write the failing test**

```ts
const okBody = { candidates: [{ content: { parts: [{ text: '{"x":1}' }] } }] }
test('no key fails fast', async () => {
  await expect(callGemini({ ...req, apiKey: '' }, deps)).rejects.toMatchObject({ code: 'no_key' })
})
test('sends key header and returns parsed json', async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody)))
  expect(await callGemini(req, { fetch: f, sleep })).toEqual({ x: 1 })
  expect(f.mock.calls[0][1].headers['x-goog-api-key']).toBe('k')
  expect(JSON.parse(f.mock.calls[0][1].body).generationConfig.temperature).toBe(0.2)
})
test('retries 429 with 2s, 8s, 30s then fails', async () => {
  const f = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
  const s = vi.fn().mockResolvedValue(undefined)
  await expect(callGemini(req, { fetch: f, sleep: s })).rejects.toMatchObject({ code: 'rate_limited' })
  expect(s.mock.calls.map(c => c[0])).toEqual([2000, 8000, 30000]); expect(f).toHaveBeenCalledTimes(4)
})
test('does not retry 400', async () => {
  const f = vi.fn().mockResolvedValue(new Response('', { status: 400 }))
  await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'http', status: 400 })
  expect(f).toHaveBeenCalledTimes(1)
})
test('network error after retries', async () => {
  const f = vi.fn().mockRejectedValue(new TypeError('offline'))
  await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'network' })
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS. I 5xx si ritentano come i 429 ma finiscono con `code: 'http'`.
- [ ] **Step 5: Commit** `feat: gemini client with retry`

---

### Task 8: Ingest dell'analisi e orchestrazione

**Files:**
- Create: `src/domain/ingest.ts`, `src/domain/scheduler.ts` (solo `newFsrsCard` in questo task)
- Test: `tests/domain/ingest.test.ts`

**Interfaces:**
- Consumes: `Analysis` (Task 6), `filterWordsByBand` (Task 4), `callGemini` (Task 7), `getSettings` (Task 2), `normalizeKey` (Task 3).
- Produces: `newFsrsCard(now: Date): import('ts-fsrs').Card` (wrapper di `createEmptyCard(now)`); `createSong(db, input: { title: string; artist: string; spotifyUrl: string | null; rawText: string; comprehensionBefore: number | null }, now: Date): Promise<Song>` (status `draft`, `lines = splitLines(rawText)`, level dalle impostazioni); `saveAnalysis(db, songId: string, analysis: Analysis, ranks: Map<string, number>, now: Date): Promise<{ chunksAdded: number; contextsAdded: number; wordsPending: number }>`; `analyzeSong(db, songId: string, deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void>; now: Date; ranks: Map<string, number>; online: boolean }): Promise<'analyzed' | 'queued'>`; `openSongCount(db): Promise<number>`.
- Regole di `saveAnalysis` (in una transazione): per ogni chunk, se esiste `key` uguale → aggiungi `{songId, lineIndex}` a `contexts` (senza duplicati) e niente card; altrimenti crea `Chunk` + due card: R (`unlocked: 1`, `due: now`) e C (`unlocked: 0`, `due: now`), entrambe `fsrs = newFsrsCard(now)`, `goodRCount: 0`. Parole: `filterWordsByBand` con `known` = lemmi già presenti in `words` (qualsiasi triage); le nuove si salvano con `triage: 'pending'`, nessuna card; i lemmi già presenti ricevono solo il contesto. Aggiorna la canzone: `status: 'analyzed'`, `difficultyKnownPct`, `grammarPoint` e `connectedSpeech` (camelCase), `analyzedAt: now`.
- Regole di `analyzeSong`: `online === false` → status `queued`, nessuna chiamata. `GeminiError` con `rate_limited`, `network` o `http` 5xx → status `queued`. `no_key`, `bad_json`, `http` 4xx → rilancia (la UI mostra il messaggio). `known` per il prompt = `baseForm` dei chunk + lemmi delle parole, massimo 300.

- [ ] **Step 1: Write the failing test**

```ts
test('creates chunks with R unlocked and C locked; words pending', async () => {
  const song = await createSong(db, { title: 'T', artist: 'A', spotifyUrl: null, rawText: tenLines, comprehensionBefore: 55 }, now)
  const r = await saveAnalysis(db, song.id, analysis, ranks, now)
  expect(r).toEqual({ chunksAdded: 3, contextsAdded: 0, wordsPending: 2 }) // fixture: 1 parola fuori fascia
  const cards = await db.cards.toArray()
  expect(cards.filter(c => c.kind === 'R').every(c => c.unlocked === 1)).toBe(true)
  expect(cards.filter(c => c.kind === 'C').every(c => c.unlocked === 0)).toBe(true)
  expect((await db.songs.get(song.id))!.status).toBe('analyzed')
})
test('same chunk in a second song adds a context, not cards', async () => {
  /* due canzoni, stessa analisi */
  const r2 = await saveAnalysis(db, song2.id, analysis, ranks, now)
  expect(r2.chunksAdded).toBe(0); expect(r2.contextsAdded).toBe(3)
  expect(await db.cards.count()).toBe(6)
  const c = await db.chunks.toArray(); expect(c[0].contexts).toHaveLength(2)
})
test('offline queues without calling', async () => {
  const f = vi.fn()
  expect(await analyzeSong(db, song.id, { ...deps, fetch: f, online: false })).toBe('queued')
  expect(f).not.toHaveBeenCalled()
})
test('rate limited ends queued', async () => {
  const f = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
  expect(await analyzeSong(db, song.id, { ...deps, fetch: f })).toBe('queued')
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: ingest gemini analysis into chunks, words and cards`

---

### Task 9: Smistamento delle parole

**Files:**
- Create: `src/domain/triage.ts`
- Test: `tests/domain/triage.test.ts`

**Interfaces:**
- Consumes: `newFsrsCard` (Task 8).
- Produces: `pendingWords(db, songId: string): Promise<Word[]>` (ordinate per `lineIndex`); `applyTriage(db, decisions: Record<string, 'known' | 'learn'>, now: Date): Promise<{ known: number; learn: number }>` — `learn` crea card R (`unlocked: 1`) e C (`unlocked: 0`) per la parola; `known` aggiorna solo `triage`; parole non `pending` ignorate (idempotente).

- [ ] **Step 1: Write the failing test**

```ts
test('learn creates R and C, known creates nothing', async () => {
  const r = await applyTriage(db, { [w1]: 'learn', [w2]: 'known' }, now)
  expect(r).toEqual({ known: 1, learn: 1 })
  expect(await db.cards.where('itemId').equals(w1).count()).toBe(2)
  expect(await db.cards.where('itemId').equals(w2).count()).toBe(0)
})
test('idempotent', async () => {
  await applyTriage(db, { [w1]: 'learn' }, now); await applyTriage(db, { [w1]: 'learn' }, now)
  expect(await db.cards.where('itemId').equals(w1).count()).toBe(2)
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: word triage`

---

### Task 10: Scheduler FSRS e registrazione dei ripassi

**Files:**
- Modify: `src/domain/scheduler.ts`
- Test: `tests/domain/scheduler.test.ts`

**Interfaces:**
- Consumes: `CardRow`, `Review`, `Rating` (Task 2).
- Produces: `createScheduler(desiredRetention: number)` (wrapper di `fsrs(generatorParameters({ request_retention, enable_fuzz: false }))`; verifica l'API della versione installata di ts-fsrs: `next(card, now, rating)` o `repeat`); `recordReview(db, cardId: string, input: { rating: Rating; auto: boolean; answer: string | null; elapsedMs: number }, now: Date, desiredRetention: number): Promise<CardRow>` — in una transazione: calcola il nuovo stato, aggiorna `fsrs` e `due`, inserisce `Review` con `wasNew = (stato precedente === New)`; se `kind === 'R'` e `rating !== 1` incrementa `goodRCount`; quando arriva a 2 sblocca la card C sorella (`unlocked: 1`, `due: now`).

- [ ] **Step 1: Write the failing test**

```ts
test('good moves due forward and logs a review', async () => {
  const c = await recordReview(db, rId, { rating: 3, auto: false, answer: null, elapsedMs: 4000 }, now, 0.9)
  expect(c.due.getTime()).toBeGreaterThan(now.getTime())
  const rev = await db.reviews.where('cardId').equals(rId).toArray()
  expect(rev).toHaveLength(1); expect(rev[0].wasNew).toBe(true)
})
test('C unlocks after two non-Again R reviews', async () => {
  await recordReview(db, rId, { rating: 1, auto: false, answer: null, elapsedMs: 1 }, now, 0.9)
  await recordReview(db, rId, { rating: 3, auto: false, answer: null, elapsedMs: 1 }, later(1), 0.9)
  expect((await db.cards.get(cId))!.unlocked).toBe(0)
  await recordReview(db, rId, { rating: 2, auto: false, answer: null, elapsedMs: 1 }, later(2), 0.9)
  expect((await db.cards.get(cId))!.unlocked).toBe(1)
})
test('again keeps card due soon', async () => {
  const c = await recordReview(db, rId, { rating: 1, auto: false, answer: null, elapsedMs: 1 }, now, 0.9)
  expect(c.due.getTime() - now.getTime()).toBeLessThan(15 * 60 * 1000)
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: fsrs scheduling and C unlock`

---

### Task 11: Coda della sessione

**Files:**
- Create: `src/domain/queue.ts`
- Test: `tests/domain/queue.test.ts`

**Interfaces:**
- Consumes: tabelle di Task 2, `getSettings`.
- Produces: `startOfLocalDay(now: Date): Date`; `DEFAULT_SECONDS_PER_REVIEW = 12` (stima iniziale, poi sostituita dalla media reale); `estimateAvgSeconds(db): Promise<number>` (media di `elapsedMs` degli ultimi 200 ripassi se ≥ 50, altrimenti 12); `type QueueItem = { card: CardRow; isNew: boolean }`; `buildSessionQueue(db, now: Date): Promise<{ items: QueueItem[]; dueCount: number; newCount: number; estMinutes: number; newBlockedByLoad: boolean }>`.
- Regole: dovute = `unlocked = 1`, stato FSRS ≠ New, `due ≤ now`, item non sospeso; ordinate per `due` crescente (più in ritardo prima). Budget nuove = `newPerDay` − ripassi di oggi con `wasNew` (da `startOfLocalDay(now)`), minimo 0. Se `dueCount × avgSeconds / 60 > timerMinutes.review` → budget 0 e `newBlockedByLoad: true`. Candidate nuove = `unlocked = 1`, stato New, item non sospeso e, per le parole, `triage === 'learn'`; ordine: chunk prima delle parole; dentro, per `song.addedAt` e poi `lineIndex`. Mai due card con lo stesso `itemId` nella coda (vince la prima). Coda = dovute poi nuove. `estMinutes = ceil(items.length × avgSeconds / 60)`.

- [ ] **Step 1: Write the failing test**

```ts
test('due first, most overdue first', async () => {
  const q = await buildSessionQueue(db, now)
  expect(q.items.slice(0, 2).map(i => i.card.id)).toEqual([veryLate, late])
})
test('new budget is 16 minus new reviewed today (local day)', async () => {
  await seedNewReviews(db, 10, at('2026-10-31T09:00:00'))   // oggi
  await seedNewReviews(db, 5, at('2026-10-30T23:50:00'))    // ieri
  const q = await buildSessionQueue(db, at('2026-10-31T21:00:00'))
  expect(q.newCount).toBe(6)
})
test('day boundary does not double the budget', async () => {
  await seedNewReviews(db, 16, at('2026-10-31T23:50:00'))
  expect((await buildSessionQueue(db, at('2026-10-31T23:55:00'))).newCount).toBe(0)
  expect((await buildSessionQueue(db, at('2026-11-01T00:10:00'))).newCount).toBe(16)
})
test('heavy due load blocks new cards', async () => {
  await seedDueCards(db, 200) // 200 × 12 s = 40 min > 30
  const q = await buildSessionQueue(db, now)
  expect(q.newCount).toBe(0); expect(q.newBlockedByLoad).toBe(true)
})
test('chunks before words, no siblings, no suspended, no pending words', async () => {
  const q = await buildSessionQueue(db, now)
  const ids = q.items.map(i => i.card.itemId)
  expect(new Set(ids).size).toBe(ids.length)
  expect(q.items.findIndex(i => i.card.itemType === 'word')).toBeGreaterThan(q.items.findLastIndex(i => i.card.itemType === 'chunk' && i.isNew))
})
```

Esegui i test con `TZ=Europe/Rome` (script `test` in package.json: `TZ=Europe/Rome vitest run`).

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: daily session queue with new-card budget and load guard`

---

### Task 12: Timer

**Files:**
- Create: `src/domain/timer.ts`, `src/ui/useTimer.ts`, `src/ui/components/TimerPill.tsx`
- Test: `tests/domain/timer.test.ts`, `tests/ui/timer-pill.test.tsx`

**Interfaces:**
- Consumes: `TimerState` da `src/db/types.ts` (Task 2).
- Produces (`timer.ts`, puro): `startTimer(durationMs: number, now: number): TimerState`; `pauseTimer(s, now)`; `resumeTimer(s, now)`; `stopTimer(s, now)`; `extendTimer(s, ms: number)`; `elapsedMs(s, now): number`; `remainingMs(s, now): number` (min 0); `isExpired(s, now): boolean`; `formatMmSs(ms: number): string`.
- Produces (`useTimer.ts`): `useTimer(sessionId: string, opts: { autoPauseOnHide: boolean; wakeLock: boolean }): { state: TimerState; remaining: number; expired: boolean; pause(); resume(); stop(); extend(ms: number) }` — persiste `timer` nella riga `sessions` a ogni comando; tick UI ogni 1000 ms solo per il ridisegno; `visibilitychange` → pausa se `autoPauseOnHide`; wake lock richiesto in running, rilasciato in pausa e stop; `navigator.vibrate?.(200)` una volta allo scadere.
- Produces (`TimerPill.tsx`): pulsante con `mm:ss`, `aria-label` "Timer, N minuti e M secondi rimasti. Metti in pausa" o "Timer in pausa. Riprendi"; a tempo scaduto usa lo sfondo `--accent`.

- [ ] **Step 1: Write the failing test**

```ts
test('pause and resume exclude paused time', () => {
  let s = startTimer(30 * 60e3, 0)
  s = pauseTimer(s, 60e3); s = resumeTimer(s, 10 * 60e3)
  expect(elapsedMs(s, 11 * 60e3)).toBe(2 * 60e3)
})
test('survives reload: state is data, time is clock', () => {
  const saved = JSON.parse(JSON.stringify(startTimer(15 * 60e3, 1000)))
  expect(remainingMs(saved, 1000 + 5 * 60e3)).toBe(10 * 60e3)
})
test('expires and extends', () => {
  let s = startTimer(60e3, 0)
  expect(isExpired(s, 61e3)).toBe(true)
  s = extendTimer(s, 5 * 60e3); expect(isExpired(s, 61e3)).toBe(false)
})
test('format', () => { expect(formatMmSs(683000)).toBe('11:23') })
```

e in `timer-pill.test.tsx`: render con stato in pausa → testo `aria-label` contiene "Riprendi"; click chiama `resume`.

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: persistent timer with pause, resume, extend`

---

### Task 13: Backup

**Files:**
- Create: `src/domain/backup.ts`
- Test: `tests/domain/backup.test.ts`

**Interfaces:**
- Produces: `type BackupFile = { app: 'singlish'; version: 1; exportedAt: string; tables: { songs: Song[]; chunks: Chunk[]; words: Word[]; cards: CardRow[]; reviews: Review[]; sessions: SessionRow[]; settings: Omit<Settings, 'apiKey'>[] } }`; `exportBackup(db, now: Date): Promise<BackupFile>` (date in ISO); `importBackup(db, file: unknown): Promise<void>` (valida `app` e `version`, altrimenti `Error('Backup non valido')`; in una transazione svuota e reinserisce; riconverte le date; mantiene la `apiKey` corrente); `downloadOrShare(file: BackupFile): Promise<void>` (`navigator.share` con `File` se `canShare`, altrimenti download `singlish-backup-YYYY-MM-DD.json`).

- [ ] **Step 1: Write the failing test**

```ts
test('round trip keeps data and dates, never exports the key', async () => {
  const file = await exportBackup(db, now)
  expect(JSON.stringify(file)).not.toContain('secret-key')
  const db2 = createDb('t2-' + crypto.randomUUID()); await saveSettings(db2, { apiKey: 'other' })
  await importBackup(db2, JSON.parse(JSON.stringify(file)))
  expect(await db2.cards.count()).toBe(await db.cards.count())
  expect((await db2.cards.toArray())[0].due).toBeInstanceOf(Date)
  expect((await getSettings(db2)).apiKey).toBe('other')
})
test('rejects foreign files', async () => {
  await expect(importBackup(db, { app: 'x' })).rejects.toThrow('Backup non valido')
})
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: json backup export and import`

---

### Task 14: Schermata Impostazioni (18)

**Files:**
- Create: `src/ui/screens/Settings.tsx`
- Modify: `src/app.tsx`, `src/main.tsx` (applica `theme` a `<html data-theme>`)
- Test: `tests/ui/settings.test.tsx`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `callGemini`, `exportBackup`, `importBackup`, `downloadOrShare`.
- Comportamento: sezioni Aspetto (Automatico/Chiaro/Scuro), Gemini (chiave `type="password"`, modello, pulsante "Prova" che manda `user: 'ping'` con schema `{ type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } }` e mostra "Chiave valida" o "Chiave non valida, nulla salvato"; la chiave si salva solo se la prova va a buon fine), Studio (livello, nuove al giorno, memoria obiettivo 0,85–0,95), Timer (studio, ripasso, minuti), Backup (Esporta, Importa da file con conferma "Sostituire tutti i dati?"). Layout e copy come schermata 18 del canvas.

- [ ] **Step 1: Write the failing test** — render con db di test e fetch finto: cambiare livello in B2 aggiorna le impostazioni (band 3000–8000); "Prova" con risposta 200 salva la chiave e mostra "Chiave valida"; con 400 non la salva e mostra "Chiave non valida, nulla salvato".
- [ ] **Step 2–4:** FAIL → implement → PASS. Passa `fetch` e `db` tramite un contesto `AppDeps` (`src/ui/deps.tsx`: `{ db, fetch, sleep, now: () => Date }`) così tutte le schermate sono testabili.
- [ ] **Step 5: Commit** `feat: settings screen`

---

### Task 15: Canzoni, Aggiungi canzone, Analisi (02, 03, 04)

**Files:**
- Create: `src/ui/screens/Songs.tsx`, `src/ui/screens/AddSong.tsx`, `src/ui/screens/Analyzing.tsx`, `src/ui/deps.tsx` (se non già creato)
- Test: `tests/ui/add-song.test.tsx`

**Interfaces:**
- Consumes: `parseSpotifyTrackUrl`, `fetchTrackTitle`, `createSong`, `analyzeSong`, `openSongCount`, `loadRanks`.
- Comportamento:
  - Canzoni: elenco con stato (In studio, Da analizzare, Completate), % prima; pulsante "Aggiungi" disabilitato con nota "Massimo 4 canzoni aperte" se `openSongCount ≥ 4`; le bozze `queued` hanno "Analizza ora".
  - Aggiungi: link (al blur, se valido, prova `fetchTrackTitle` e precompila il titolo; se `null` lascia vuoto), titolo e artista, cursore 0–100 "Ascoltala senza testo. Quanto hai capito?", textarea testo; "Analizza con Gemini" crea la canzone e va ad Analisi. Testo vuoto → pulsante disabilitato.
  - Analisi: chiama `analyzeSong` con `online: navigator.onLine`; mostra i passi; esiti: `analyzed` → se `difficultyKnownPct < 60` avviso "Capiresti il N%: puoi studiarla lo stesso o tenerla per più avanti", pulsanti "Studiala ora" (→ triage se ci sono parole pending, altrimenti studio) e "Tienila per più avanti"; `queued` → "La analizzo alla prossima apertura"; errore `no_key` → link a Impostazioni; `bad_json` → "Risposta non valida, riprova".
  - All'avvio dell'app (`main.tsx`) le canzoni `queued` vengono rianalizzate in sequenza se online.

- [ ] **Step 1: Write the failing test** — Aggiungi: inserendo un link valido con oEmbed finto il titolo si precompila; con oEmbed che fallisce resta vuoto; con 4 canzoni aperte "Aggiungi" in Canzoni è disabilitato.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: songs list, add song and analysis screens`

---

### Task 16: Studio, Scheda, Smista parole (05, 06, 19)

**Files:**
- Create: `src/ui/screens/Study.tsx`, `src/ui/screens/ItemSheet.tsx`, `src/ui/screens/Triage.tsx`, `src/ui/components/Highlighted.tsx`
- Test: `tests/ui/highlighted.test.tsx`, `tests/ui/triage.test.tsx`

**Interfaces:**
- Consumes: `pendingWords`, `applyTriage`, `useTimer` (studio, 15 min, pausa all'uscita).
- Produces: `highlightLine(line: string, spans: { text: string; id: string; className: string }[]): ({ text: string } | { text: string; id: string; className: string })[]` — trova ogni `text` nella riga senza distinzione di maiuscole e apostrofi; se non lo trova, la riga resta intatta (nessun crash); sovrapposizioni: vince lo span più lungo.
- Comportamento:
  - Studio: timer in alto; banner "N parole nuove da smistare" se ci sono pending; punto di grammatica; legenda; testo con evidenziazioni (classi per tipo come in `docs/design.md`); tocco → `#/songs/:id?item=:itemId` apre la Scheda; "Apri in Spotify" (link esterno) se `spotifyUrl`.
  - Scheda (foglio dal basso): etichette tipo/livello/registro, forma base, significato, spiegazione, verso, esempio, nota di pronuncia; "Modifica" (significato e spiegazione, salva `userEdited: true`), "Sospendi" (`suspended: true`), "Escludi" (elimina chunk e card dopo conferma).
  - Smista parole: per ogni parola `lemma`, rango, significato, scelta "La so" / "Da imparare" (predefinito "Da imparare"); "Conferma" chiama `applyTriage` e torna allo studio.

- [ ] **Step 1: Write the failing test**

```ts
test('highlights case-insensitively and survives misses', () => {
  const out = highlightLine('Every night I Let It Slide', [{ text: 'let it slide', id: 'c1', className: 'id' }, { text: 'missing', id: 'c2', className: 'ph' }])
  expect(out).toEqual([{ text: 'Every night I ' }, { text: 'Let It Slide', id: 'c1', className: 'id' }])
})
```

e in `triage.test.tsx`: con 2 parole pending, scegliere "La so" sulla prima e confermare → 1 parola `known`, 2 card create per la seconda.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: study screen, item sheet and word triage`

---

### Task 17: Oggi, Sessione, Timer scaduto (01, 10, 11, 14)

**Files:**
- Create: `src/ui/screens/Today.tsx`, `src/ui/screens/Session.tsx`, `src/ui/components/RatingBar.tsx`
- Test: `tests/ui/session.test.tsx`

**Interfaces:**
- Consumes: `buildSessionQueue`, `recordReview`, `gradeAnswer`, `useTimer` (ripasso, `timerMinutes.review`, pausa all'uscita, wake lock), tabelle chunk/parole per il contenuto delle card.
- Comportamento:
  - Oggi: in scadenza, nuove, minuti stimati "su 30"; se `newBlockedByLoad` nota "Oggi niente card nuove: ripasso oltre i 30 minuti"; "Inizia sessione"; canzoni aperte con avanzamento.
  - Sessione: crea una riga `sessions` (kind `review`), costruisce la coda all'avvio; card R: verso con evidenziazione, "Mostra significato", poi `RatingBar` (Di nuovo / Difficile / Bene / Facile); card C: verso con buco, significato, input, "Controlla" → `gradeAnswer` propone il voto (preselezionato e modificabile), poi `RatingBar`. Ogni voto chiama `recordReview` con `auto` (true se l'utente non ha cambiato il voto proposto) ed `elapsedMs` dal momento in cui la card è apparsa. Pausa: overlay "In pausa" con "Riprendi" e "Ferma e salva". Timer scaduto: si finisce la card in corso, poi foglio "N minuti fatti" con ripassate, nuove, restanti, e pulsanti "Altri 5 minuti" (`extend(5 * 60e3)`) e "Chiudi". Coda vuota: "Fatto per oggi".
  - Il contenuto di una card legge il verso da `song.lines[lineIndex]` del primo contesto.

- [ ] **Step 1: Write the failing test** — con db di test (1 card R dovuta, 1 card C sbloccata e dovuta di un altro chunk): rispondere "let it slid" alla C mostra "Quasi: un errore di battitura" e preseleziona "Difficile"; confermando, `reviews` contiene `rating: 2, auto: true`; cambiando il voto in "Bene" prima di confermare → `auto: false`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: today and review session`

---

### Task 18: PWA ed end-to-end

**Files:**
- Modify: `vite.config.ts` (vite-plugin-pwa: `registerType: 'autoUpdate'`, manifest nome "Singlish", `display: 'standalone'`, `theme_color` = `--bg` scuro, icone 192 e 512 da `public/icons/`, precache di `freq.json` e font), `src/main.tsx` (`navigator.storage.persist()` una volta, salva `persistAsked`)
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png` (icona semplice: "S" Bricolage su `#111317` con accento `#FF8A4C`), `tests/e2e/mvp.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: tutta l'app.

- [ ] **Step 1: Write the failing e2e** — Playwright su `npm run preview`; intercetta `generativelanguage.googleapis.com` con la fixture di Task 6 e `open.spotify.com/oembed` con 500. Flusso: Impostazioni → incolla chiave finta (la prova risponde 200 grazie all'intercettazione) → Canzoni → Aggiungi → link, testo inventato di 10 righe, cursore 50 → Analizza → Studiala ora → Smista parole: conferma → Studio: vedi almeno 3 evidenziazioni → Oggi → Inizia sessione → valuta una card "Bene" → ricarica la pagina → il ripasso fatto risulta ancora (in scadenza diminuite di 1).
- [ ] **Step 2: Run** `npm run test:e2e` → FAIL dove manca qualcosa; correggi fino a verde.
- [ ] **Step 3:** `npm run build` e controlla che `dist/manifest.webmanifest` e il service worker esistano; Lighthouse PWA (Chrome DevTools) senza errori di installabilità.
- [ ] **Step 4: Commit** `feat: pwa manifest, offline cache and e2e smoke test`

---

## Dopo l'MVP
Piani separati per v1 (Espandi e card F, card P con correzione, card A, ritornello, riascolto finale, testi liberi, Progressi, Lessico) e v2 (test di vocabolario, sfumature, temi, intensiva, card ostinate, ottimizzazione FSRS). Scrivili dopo due settimane d'uso reale dell'MVP.
