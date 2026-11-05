# Redesign · Fase 1 — Base visiva: piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare a ogni canzone un'identità visiva (tinta + copertina di Spotify o generata) e aggiornare gerarchia tipografica e raggi, senza cambiare il comportamento dell'app.

**Architecture:** Sei tinte nuove nei token CSS; una funzione pura sceglie tinta, motivo e iniziali dall'id e dal titolo; il dominio Spotify legge anche `thumbnail_url` dall'oEmbed già usato; `ensureCover` salva `songs.coverUrl` con un solo tentativo per canzone per sessione dell'app; un componente `Cover` mostra l'immagine o, se manca o non si carica, la copertina generata. Il service worker tiene le immagini in una cache a parte.

**Tech Stack:** Preact + TypeScript strict, Dexie, vite-plugin-pwa (Workbox), Vitest + @testing-library/preact + fake-indexeddb + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-engagement-design.md` (§7.1, §7.2, §7.3, §8.3, §12 fase 1). Regole generali: `docs/spec.md`, `docs/design.md`, `CLAUDE.md`.

## Global Constraints

- Nessuna dipendenza nuova (stack in `CLAUDE.md`).
- Colori solo tramite variabili di `src/styles/tokens.css`, con i tre blocchi: `:root, [data-theme="dark"]`, `[data-theme="light"]`, `@media (prefers-color-scheme: light) [data-theme="auto"]`.
- I test non fanno rete: `fetch` finto iniettato (`useDeps().fetch` nell'interfaccia, parametro `fetchFn` nel dominio).
- Tempo iniettato (`now: Date`) nel dominio; niente `new Date()` nelle funzioni pure.
- Testo dell'interfaccia in italiano; testi di canzoni inventati nei test.
- Touch target ≥ 44 px; `prefers-reduced-motion` rispettato.
- Nessun cambio di comportamento in questa fase: conteggi, testi e navigazione restano quelli di oggi (i test esistenti devono passare senza modifiche, salvo quelli che cercano nodi DOM spostati, da aggiornare solo nel selettore).
- Un commit per task, messaggio in inglese come quelli del repository, con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Link Spotify che cambia** — dopo Modifica con un link diverso la copertina vecchia non deve restare: `coverUrl` torna `undefined` e la nuova arriva al prossimo `ensureCover`. Test in Task 4.
2. **Offline o oEmbed bloccato da CORS** — nessun errore a schermo, nessun `coverUrl` scritto, copertina generata; nessun secondo tentativo nella stessa sessione dell'app. Test in Task 4.
3. **`thumbnail_url` ostile o strano** (http, altro dominio, stringa vuota) — ignorato: l'app carica immagini solo dai CDN di Spotify. Test in Task 3.
4. **Immagine salvata che non si carica** (CDN irraggiungibile, cache vuota offline) — si passa alla generata senza riprovare in quella vista e senza icone rotte. Test in Task 5.
5. **Titoli limite per le iniziali** (vuoto, «Senza titolo», solo cifre o simboli, apostrofi e accenti) — iniziali leggibili o «♪», mai stringa vuota. Test in Task 2.

---

### Task 1: Tinte delle canzoni nei token

**Files:**
- Modify: `src/styles/tokens.css` (tutti e tre i blocchi)
- Modify: `docs/design.md` (sezione «Token»: blocco CSS e tabella; nuova riga in «Colori dei tipi di espressione» che dice che le tinte delle canzoni non si usano per i tipi)
- Test: `tests/ui/tokens.test.ts` (nuovo)

**Interfaces:**
- Produces: variabili CSS `--song-1` … `--song-6` e `--song-1-tint` … `--song-6-tint`, e classi `.song-hue-1` … `.song-hue-6` (in `src/styles/base.css`) che impostano `--song: var(--song-N); --song-tint: var(--song-N-tint);`. I componenti successivi usano solo `--song` e `--song-tint`.

Valori (rosa, ocra, ciano, salvia, prugna, ardesia):

| Token | Scuro | Chiaro |
| --- | --- | --- |
| `--song-1` / `-tint` | `#FF8FB1` / `#2E1A22` | `#B83A70` / `#FBE3EC` |
| `--song-2` / `-tint` | `#E2B24A` / `#2A2416` | `#8A5F00` / `#F6EBCF` |
| `--song-3` / `-tint` | `#5CC8E0` / `#15262B` | `#0B6F84` / `#DDF1F6` |
| `--song-4` / `-tint` | `#A7C48A` / `#1F2619` | `#466E2F` / `#E5EFDC` |
| `--song-5` / `-tint` | `#D79BB8` / `#2A1922` | `#83395F` / `#F2E0EA` |
| `--song-6` / `-tint` | `#9FB2C6` / `#1C2229` | `#435568` / `#E2E8EF` |

- [ ] **Step 1: Write the failing test** `tests/ui/tokens.test.ts`: legge `src/styles/tokens.css` con `fs`, estrae i tre blocchi, e per ognuno:
  - `test('every theme block defines song-1..6 and their tints')`: le 12 variabili ci sono in tutti e tre i blocchi;
  - `test('auto-light block equals the light block')`: i 12 valori del blocco `auto` sono identici a quelli di `[data-theme="light"]`;
  - `test('initials are readable on the cover tint')`: rapporto di contrasto WCAG fra `--song-N` e `--song-N-tint` ≥ 4.5 in scuro e in chiaro (luminanza relativa sRGB, formula WCAG 2.x, calcolata nel test).
- [ ] **Step 2: Run** `npx vitest run tests/ui/tokens.test.ts` — Expected: FAIL (variabili mancanti).
- [ ] **Step 3: Implement** le 12 variabili nei tre blocchi con i valori della tabella; le sei classi `.song-hue-N` in `base.css`; aggiorna `docs/design.md`. Se un valore non raggiunge 4.5, scurisci (chiaro) o schiarisci (scuro) solo `--song-N` finché passa, e riporta il valore nuovo nella tabella di `design.md`.
- [ ] **Step 4: Run** `npx vitest run tests/ui/tokens.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: six song hues in the design tokens (dark, light, auto)`.

### Task 2: Tinta, motivo e iniziali di una canzone

**Files:**
- Create: `src/ui/cover.ts`
- Test: `tests/ui/cover.test.ts`

**Interfaces:**
- Produces:
  - `type Motif = 'waves' | 'circles' | 'lines'`
  - `songLook(id: string): { hue: 1 | 2 | 3 | 4 | 5 | 6; motif: Motif }` — stabile per lo stesso id.
  - `coverInitials(title: string): string` — 1 o 2 caratteri maiuscoli, oppure `'♪'`.

- [ ] **Step 1: Write the failing tests**
  - `test('same id, same look')`: `songLook('abc')` uguale a se stesso in due chiamate.
  - `test('all six hues and three motifs appear')`: su 300 id `crypto.randomUUID()` compaiono tutti gli `hue` 1–6 e tutti e tre i motivi.
  - `test('initials from the first two words')`: `'Paper Lanterns'` → `'PL'`; `'salt'` → `'S'`; `"  don't   wait up "` → `'DW'`; `'Élan vital'` → `'ÉV'`.
  - `test('initials fall back to a note')`: `''`, `'   '`, `'1999'`, `'!!!'` → `'♪'`; `'Senza titolo'` → `'♪'` (titolo segnaposto dell'app).
- [ ] **Step 2: Run** `npx vitest run tests/ui/cover.test.ts` — Expected: FAIL (modulo mancante).
- [ ] **Step 3: Implement** in `src/ui/cover.ts`. Hash FNV-1a a 32 bit sull'id; `hue = (h % 6) + 1`, `motif` da `Math.floor(h / 6) % 3`. Iniziali: parole separate da spazi, di ognuna la prima lettera Unicode (`/\p{L}/u`), al massimo due, `toLocaleUpperCase('it')`.
- [ ] **Step 4: Run** `npx vitest run tests/ui/cover.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: stable hue, motif and initials for each song`.

### Task 3: Copertina dall'oEmbed di Spotify

**Files:**
- Modify: `src/domain/spotify.ts`
- Test: `tests/domain/spotify.test.ts`

**Interfaces:**
- Produces:
  - `fetchTrackInfo(trackUrl: string, fetchFn?: typeof fetch): Promise<{ title: string | null; thumbnailUrl: string | null } | null>` — `null` se la richiesta fallisce o la risposta non è ok o non è JSON; altrimenti i due campi, ciascuno `null` se assente o non valido.
  - `safeCoverUrl(raw: unknown): string | null` — accetta solo `https:` con host `i.scdn.co`, `mosaic.scdn.co` o che termina in `.spotifycdn.com`.
  - `fetchTrackTitle` resta con la stessa firma e lo stesso comportamento, implementata sopra `fetchTrackInfo` (i test esistenti non cambiano).

- [ ] **Step 1: Write the failing tests** (in `describe('fetchTrackInfo')` e `describe('safeCoverUrl')`):
  - risposta `{ title: 'Late Train Home', thumbnail_url: 'https://i.scdn.co/image/ab67' }` → `{ title: 'Late Train Home', thumbnailUrl: 'https://i.scdn.co/image/ab67' }`, stessa URL chiamata del test di `fetchTrackTitle`;
  - `thumbnail_url` su `https://image-cdn-ak.spotifycdn.com/image/x` → accettato;
  - `http://i.scdn.co/x`, `https://evil.example/x.jpg`, `https://i.scdn.co.evil.example/x`, `''`, `42` → `thumbnailUrl: null` (titolo comunque letto);
  - rete che rifiuta, status 404, corpo non JSON → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/domain/spotify.test.ts` — Expected: FAIL sui test nuovi, PASS sui vecchi.
- [ ] **Step 3: Implement** `safeCoverUrl` con `new URL` dentro `try`; `fetchTrackInfo`; riscrivi `fetchTrackTitle` come `(await fetchTrackInfo(url, fetchFn))?.title ?? null`.
- [ ] **Step 4: Run** `npx vitest run tests/domain/spotify.test.ts` — Expected: PASS tutti.
- [ ] **Step 5: Commit** `feat: read the album cover from Spotify oEmbed (Spotify CDNs only)`.

### Task 4: Salvare la copertina (`ensureCover`) e azzerarla quando cambia il link

**Files:**
- Modify: `src/db/types.ts` (`Song`: `coverUrl?: string | null` con commento «Copertina dall'oEmbed di Spotify; assente = da cercare, null = nessuna»)
- Create: `src/domain/cover.ts`
- Modify: `src/ui/screens/Songs.tsx` (`SongEdit`: le due `db.songs.update` che scrivono `spotifyUrl`)
- Test: `tests/domain/cover.test.ts` (nuovo), `tests/ui/songs-edit-cover.test.tsx` (nuovo)

**Interfaces:**
- Consumes: `fetchTrackInfo` (Task 3).
- Produces: `ensureCover(db: SinglishDB, songId: string, fetchFn: typeof fetch, tried?: Set<string>): Promise<void>`; il `tried` predefinito è un `Set` del modulo (una sessione dell'app). Regole:
  - non fa nulla se la canzone non c'è, è `kind: 'text'`, non ha `spotifyUrl`, ha già `coverUrl` diverso da `undefined`, o `tried` contiene già `songId:spotifyUrl`;
  - aggiunge la chiave a `tried` **prima** della richiesta;
  - risposta ok → scrive `coverUrl` (`thumbnailUrl`, anche `null` se Spotify risponde senza immagine valida), ma solo se `spotifyUrl` è ancora quello per cui ha chiesto (`where('id').equals(id).filter(s => s.spotifyUrl === url).modify`);
  - richiesta fallita (`fetchTrackInfo` → `null`) → non scrive nulla;
  - non lancia mai (gli errori di IndexedDB vanno a `reportError`, come in `Songs.tsx`).
- `SongEdit`: quando il link salvato è diverso da `song.spotifyUrl`, la stessa `update` mette `coverUrl: undefined` (campo tolto) — Dexie: usa `modify((s) => { delete s.coverUrl })` oppure `update(id, { coverUrl: undefined })` se il test conferma che il campo sparisce.

- [ ] **Step 1: Write the failing tests** `tests/domain/cover.test.ts` (fake-indexeddb, `createDb('t-' + crypto.randomUUID())`, canzone inventata):
  - `test('saves the Spotify cover once')`: fetch finto con `thumbnail_url` valido → `coverUrl` salvato; seconda chiamata → fetch chiamato una volta sola;
  - `test('offline: nothing saved, no second try in this app session')`: fetch che rifiuta → `coverUrl` resta `undefined`; seconda chiamata con lo stesso `tried` → fetch non richiamato; con un `tried` nuovo → richiamato;
  - `test('Spotify without image saves null')`: risposta ok senza `thumbnail_url` → `coverUrl === null`;
  - `test('skips texts, songs without link and songs with a cover')`;
  - `test('link changed during the request: nothing saved')`: il fetch finto, prima di rispondere, aggiorna `spotifyUrl` della canzone → `coverUrl` resta `undefined`.
- [ ] **Step 2: Write the failing UI test** `tests/ui/songs-edit-cover.test.tsx`: canzone con `spotifyUrl` A e `coverUrl` X; Modifica, nuovo link B, Salva → in DB `spotifyUrl === B` e `coverUrl === undefined`; stessa cosa uscendo dalla pagina senza Salva (smontaggio). Con lo stesso link A e titolo cambiato → `coverUrl` resta X.
- [ ] **Step 3: Run** `npx vitest run tests/domain/cover.test.ts tests/ui/songs-edit-cover.test.tsx` — Expected: FAIL.
- [ ] **Step 4: Implement** `src/domain/cover.ts`, il campo in `types.ts`, e l'azzeramento nelle due scritture di `SongEdit`.
- [ ] **Step 5: Run** i due file e poi `npm test` — Expected: PASS tutti (nessun test esistente rotto).
- [ ] **Step 6: Commit** `feat: keep the Spotify cover of each song, reset when the link changes`.

### Task 5: Componente `Cover`

**Files:**
- Create: `src/ui/components/Cover.tsx`
- Modify: `src/styles/base.css` (classi `.cover`, `.cover-sm` 40 px, `.cover-md` 56 px, `.cover-lg` 120 px, raggio 12/14/20 px)
- Test: `tests/ui/cover-component.test.tsx`

**Interfaces:**
- Consumes: `songLook`, `coverInitials` (Task 2); classi `.song-hue-N` (Task 1).
- Produces: `Cover({ song, size }: { song: Pick<Song, 'id' | 'title' | 'kind' | 'coverUrl'>; size: 'sm' | 'md' | 'lg' })`. Radice `<span class="cover cover-{size} song-hue-{N}" aria-hidden="true">` (decorativa: il titolo è sempre scritto accanto). Dentro: `<img src={coverUrl} alt="" loading="lazy" decoding="async">` se `coverUrl` è una stringa e non ha dato errore in questa vista; altrimenti la copertina generata: sfondo `var(--song-tint)`, motivo SVG inline in `var(--song)` al 35% di opacità (`waves`: tre curve; `circles`: tre cerchi concentrici in un angolo; `lines`: righe diagonali), iniziali in Bricolage 700 di colore `var(--song)`. Per `kind: 'text'` niente immagine, sempre generata.

- [ ] **Step 1: Write the failing tests**
  - `test('shows the Spotify image when there is one')`: `img` con `src` uguale a `coverUrl`, `alt=""`;
  - `test('falls back to the generated cover when the image fails')`: `fireEvent.error(img)` → niente `img`, compaiono le iniziali `'PL'` per «Paper Lanterns»; un nuovo render con lo stesso `song` nella stessa istanza non rimette l'`img`;
  - `test('generated cover for null, undefined and texts')`: nessun `img`; classe `song-hue-{songLook(id).hue}` sulla radice;
  - `test('hidden from screen readers')`: radice con `aria-hidden="true"`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/cover-component.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** il componente e le classi CSS (solo variabili dei token).
- [ ] **Step 4: Run** il test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Cover component (Spotify image, generated fallback)`.

### Task 6: Copertine e tinte nelle schermate

**Files:**
- Modify: `src/ui/screens/Study.tsx` (testata, righe ~146–150: `Cover size="lg"` sopra il titolo; testata con sfondo `var(--song-tint)` al 14% via `color-mix`; `ensureCover(db, song.id, fetch)` in un `useEffect` all'apertura, senza attendere)
- Modify: `src/ui/screens/Songs.tsx` (ogni `li.song-card`: `Cover size="md"` a sinistra del titolo)
- Modify: `src/ui/screens/Today.tsx` (ogni `a.song-card`: `Cover size="md"`)
- Modify: `src/ui/screens/Session.tsx` (card R/C/P/A, sopra la riga «titolo · riga N»: `Cover size="sm"` accanto al titolo; la `section.session-card` prende `song-hue-N` e un bordo sinistro di 4 px `var(--song)`; per le voci di Espandi senza canzone nessuna copertina né bordo)
- Modify: `src/ui/screens/AddSong.tsx` (dopo la creazione della canzone, `void ensureCover(db, song.id, fetch)` senza attendere: la navigazione non cambia)
- Modify: `src/styles/base.css`
- Test: `tests/ui/study.test.tsx`, `tests/ui/session.test.tsx`, `tests/ui/add-song.test.tsx` (aggiunte)

**Interfaces:**
- Consumes: `Cover` (Task 5), `ensureCover` (Task 4), `songLook` (Task 2).

- [ ] **Step 1: Write the failing tests**
  - Study: canzone con `spotifyUrl` e senza `coverUrl`, fetch finto con `thumbnail_url` valido → dopo `waitFor`, `coverUrl` salvato in DB e `img` nella testata; con fetch che rifiuta → nessun errore a schermo (nessun `role="alert"`), copertina generata.
  - Session: la card di una voce di canzone ha la classe `song-hue-{songLook(song.id).hue}`; la card di una voce di Espandi non ha classi `song-hue-`.
  - AddSong: con link valido e fetch finto che restituisce titolo e copertina, dopo l'invio la canzone ha `coverUrl`; con fetch che rifiuta la canzone si crea come oggi.
- [ ] **Step 2: Run** `npx vitest run tests/ui/study.test.tsx tests/ui/session.test.tsx tests/ui/add-song.test.tsx` — Expected: FAIL sui test nuovi.
- [ ] **Step 3: Implement** le modifiche alle cinque schermate.
- [ ] **Step 4: Run** `npm test` — Expected: PASS tutti. Se un test esistente fallisce solo perché cerca un nodo spostato, aggiorna il selettore, non l'asserzione.
- [ ] **Step 5: Commit** `feat: song covers and hues in Study, Songs, Today and Session`.

### Task 7: Cache delle copertine nel service worker

**Files:**
- Modify: `vite.config.ts` (`workbox.runtimeCaching`)
- Test: `tests/pwa/covers-cache.test.ts` (nuovo)

**Interfaces:**
- Produces: una voce di `runtimeCaching` con `urlPattern` regex `^https://(i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)/`, `handler: 'CacheFirst'`, `options: { cacheName: 'covers', expiration: { maxEntries: 60, maxAgeSeconds: 90 * 24 * 60 * 60 }, cacheableResponse: { statuses: [0, 200] } }` (0: le immagini di un altro dominio arrivano opache).

- [ ] **Step 1: Write the failing test**: estrai la regex in una costante esportata `COVER_URL_PATTERN` in `src/pwa/covers.ts`, importata da `vite.config.ts`. Il test verifica che accetti `https://i.scdn.co/image/ab67` e `https://image-cdn-ak.spotifycdn.com/image/x`, e rifiuti `https://i.scdn.co.evil.example/x`, `http://i.scdn.co/x`, `https://open.spotify.com/oembed`. Lo stesso test verifica che `safeCoverUrl` (Task 3) e `COVER_URL_PATTERN` diano la stessa risposta su questi cinque URL.
- [ ] **Step 2: Run** `npx vitest run tests/pwa/covers-cache.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** la costante e la voce in `vite.config.ts`.
- [ ] **Step 4: Run** il test, poi `npm run build` — Expected: PASS; la build termina (compreso `check-build-secrets`) e `grep -c "covers" dist/sw.js` dà almeno 1.
- [ ] **Step 5: Commit** `feat: cache song covers in the service worker (cache-first, 60 images, 90 days)`.

### Task 8: Gerarchia tipografica e raggi

**Files:**
- Modify: `src/styles/base.css`
- Modify: `docs/design.md` (sezioni «Tipografia» e «Regole» dei raggi)

Valori (spec §7.1, §7.3):
- nuova classe `.display`: Bricolage Grotesque 700, `font-size: clamp(40px, 12vw, 56px)`, `line-height: 1`, `font-variation-settings: 'opsz' 96`;
- titolo nella testata dello Studio: 28 px (oggi 20 px); titoli di pagina (`.songs-head h1`, `.settings-head h1`) 28 px;
- `.lyrics` 17 px (oggi 18 px); `.session-card .verse` 20 px, Inter Tight 500;
- raggio 20 px per `.card`, `.song-card`, `.session-card`, `.install-card` (oggi 14–16 px); pulsanti e campi restano 12 px; fogli restano 24 px;
- una sola ombra per `.session-card` e `.sheet`: `box-shadow: 0 8px 24px color-mix(in srgb, var(--scrim) 40%, transparent)`.

- [ ] **Step 1: Implement** i valori in `base.css` e aggiorna `docs/design.md`.
- [ ] **Step 2: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 3: Verifica a vista** con `npm run dev` a 390 × 844, temi chiaro e scuro: Oggi, Canzoni, Studio (con e senza copertina Spotify), Sessione (card R e C). Controlla: niente scroll orizzontale, titoli lunghi che vanno a capo senza sovrapporsi alla copertina, iniziali leggibili, bersagli ≥ 44 px. Poi `npm run test:e2e` — Expected: PASS.
- [ ] **Step 4: Commit** `style: type scale and radii of the redesign`.

---

## Dopo questa fase
Le fasi 2–7 della spec (§12) avranno ciascuna il proprio piano, scritto quando questa è conclusa, così ogni piano parte dal codice com'è davvero.
