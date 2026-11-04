# Singlish — specifica (estratto operativo)

Versione completa, con razionale e diagrammi: https://claude.ai/artifact/Ar5PBrMjVq7fxUCZzfbr3E
Canvas di design (24 schermate, casi d'uso e diagrammi di sequenza UML): https://claude.ai/artifact/6wE9aRMt77EJmgR2gFwgZx

Questo file contiene i valori e le regole che il codice deve rispettare. In caso di conflitto vale questo file.

## 1. Obiettivo
Trasformare ogni canzone (o testo incollato) in espressioni ("chunk") e parole singole da ripassare con FSRS, dal B1 al C1, con 30 minuti di ripasso al giorno.

## 2. Ciclo di una canzone
1. Ascolto senza testo, l'utente segna la % capita (`comprehensionBefore`, 0–100).
2. Incolla il testo → analisi Gemini (1 chiamata).
3. Studio: testo con chunk e parole evidenziati; schede consultabili e modificabili.
4. Smista parole: per ogni parola singola "La so" (→ profilo parole note) o "Da imparare" (→ card).
5. Card nuove entrano nel ripasso: massimo 16 al giorno, chunk e parole insieme.
6. Riascolto finale dopo ≥ 7 giorni (v1).

Priorità delle card nuove: chunk delle canzoni → parole "da imparare" → espansioni (v1) → testi liberi (v1).

## 3. Carico
| Parametro | Valore |
| --- | --- |
| Ripasso giornaliero | 30 minuti (timer della sessione), divisibile in 2 × 15 |
| Card nuove al giorno | 16 (impostazione `newPerDay`), chunk e parole insieme |
| Stop delle nuove | se i ripassi in scadenza oggi superano i 30 minuti stimati, le nuove non entrano |
| Canzoni/testi aperti | massimo 4: tutte le canzoni non completate (bozze e in coda comprese) |
| Modalità intensiva (v1) | 25 nuove al giorno per massimo 7 giorni |

## 4. Card dell'MVP
| Card | Davanti | Risposta | Sblocco | Correzione |
| --- | --- | --- | --- | --- |
| R — Riconosci | Verso con chunk/parola evidenziati | Mostra significato, poi voto | Subito | Autovalutazione (4 voti) |
| C — Completa | Verso con il buco + significato in italiano | Scrivi chunk/parola | Dopo 2 ripassi R con voto ≠ Again | Automatica: esatto = Good, distanza di Levenshtein 1 = Hard, altro = Again; voto sempre modificabile |

Card A, P, F, S: fuori dall'MVP.

Voti FSRS: Again, Hard, Good, Easy (etichette UI: Di nuovo, Difficile, Bene, Facile). Memoria obiettivo 0,90 (regolabile 0,85–0,95).
Card dello stesso chunk/parola non escono nella stessa sessione.

## 5. Confronto delle risposte
Minuscole; apostrofi tipografici ’ ‘ → '; spazi multipli → uno; trim; contrazioni equivalenti: I'm = I am, you're = you are, it's = it is, don't = do not, can't = cannot, won't = will not, gonna = going to, wanna = want to. Errore di battitura = distanza di Levenshtein ≤ 1 dopo la normalizzazione; si confrontano anche le forme senza espansione delle contrazioni e vale la distanza minore («dont» per «don't» è un errore di battitura). Forma e buco si cercano nel verso come parola intera, poi come pezzo di parola.

## 6. Timer
| Attività | Durata predefinita | Uscendo dall'app (`visibilitychange`) |
| --- | --- | --- |
| Studio canzone | 15 min | pausa automatica |
| Sessione di ripasso | 30 min | pausa automatica |
Comandi: avvia, pausa, riprendi, ferma. Lo stato si salva (avvio, millisecondi accumulati, stato) e il tempo rimasto si calcola dall'orologio, non contando i tick. Allo scadere non si interrompe nulla: si finisce la card e si sceglie "+5 minuti" o "Chiudi". Vibrazione breve se disponibile. Screen Wake Lock durante la sessione, rilasciato in pausa.

## 7. Livelli e fascia di frequenza
Livello impostato: B1 | B2 | C1. Fascia utile per le parole singole (ranghi di frequenza):
| Livello | Fascia |
| --- | --- |
| B1 | 2.000–5.000 |
| B2 | 3.000–8.000 |
| C1 | 6.000–15.000 |
Una parola entra in Smista parole solo se il suo rango è dentro la fascia e il lemma non è già nel profilo (note o già studiate). Parole senza rango nella lista: escluse.

Lista di frequenza: file `public/freq.json` (array di lemmi ordinati per rango, prime 20.000), da wordfreq 3.1.1 (lista `best`, inglese; solo parole di lettere), licenza CC BY-SA 4.0: fonte citata nelle Impostazioni e in `public/freq.LICENSE.md`. Lo script `scripts/build-freq.mjs` accetta un TSV `lemma<TAB>rank`.

## 8. Gemini
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`.
- Modello: impostazione `model`, predefinito il Flash-Lite più recente disponibile nel tier gratuito (stringa modificabile).
- `generationConfig`: `temperature: 0.2`, `responseMimeType: "application/json"`, `responseSchema` (sotto).
- Errore 429 o 5xx: ritenta dopo 2 s, 8 s, 30 s; poi la canzone resta in bozza in coda e si riprova alla prossima apertura.
- Offline: salva bozza senza chiamare.
- Il testo viene diviso in righe numerate prima dell'invio; Gemini restituisce indici di riga.

### Prompt di sistema
```text
Sei un insegnante di inglese madrelingua che lavora con studenti italiani.
Ricevi un testo (canzone o testo libero), il livello CEFR dello studente,
la sua fascia di frequenza utile e i chunk e le parole che conosce già.
1) Estrai 8–14 chunk utili (phrasal verb, idiomi, collocazioni, frasi fatte, slang),
   privilegiando il livello dello studente e quello sopra. Escludi quelli già noti.
2) Estrai 5–8 parole singole (lemma) non comprese nei chunk, utili da imparare.
Per ogni chunk e parola: forma base, forma nel testo, indice della riga, tipo, livello,
registro (usable | informal | song_only), tema (emotions, relationships, work, travel,
money, health, leisure, time, other), significato in italiano naturale,
spiegazione di massimo 20 parole in italiano, un secondo esempio d'uso quotidiano.
Solo per i chunk: una situazione in italiano per produrlo, nota di pronuncia se nel canto
si fonde o si accorcia.
Aggiungi: un solo punto di grammatica, fino a 3 fenomeni di parlato connesso (solo canzoni),
una stima della percentuale di testo che lo studente capisce già.
Traduci in italiano solo le righe che contengono un chunk o una parola estratti,
una volta per riga; non tradurre le altre righe. Non inventare: se un significato dipende dal contesto, dillo.
```

### Messaggio utente
```text
Tipo: canzone | Tipo: testo libero (non una canzone): niente parlato connesso.
Livello: {level}
Fascia di frequenza: {bandStart}-{bandEnd}
Già noti: {knownList, separati da virgola, massimo 300}
Testo (righe numerate):
{index}: {line}
...
```

### Schema della risposta
```json
{
  "difficulty_known_pct": 85,
  "grammar_point": { "title": "", "explanation_it": "", "line_index": 0 },
  "connected_speech": [ { "line_index": 0, "written": "going to", "sung": "gonna", "note_it": "" } ],
  "chunks": [ { "base_form": "", "surface_form": "", "line_index": 0,
    "type": "phrasal_verb | idiom | collocation | fixed_phrase | slang",
    "cefr": "B1 | B2 | C1 | C2", "register": "usable | informal | song_only", "topic": "emotions",
    "meaning_it": "", "explanation_it": "", "extra_example_en": "",
    "production_prompt_it": "", "pronunciation_note_it": "" } ],
  "words": [ { "lemma": "", "surface_form": "", "line_index": 0,
    "pos": "noun | verb | adjective | adverb", "cefr": "B2", "register": "usable", "topic": "travel",
    "meaning_it": "", "explanation_it": "", "extra_example_en": "" } ],
  "line_translations": [ { "line_index": 0, "translation_it": "" } ]
}
```
`line_translations`: solo le righe con almeno un chunk o una parola estratti; la scheda dell'elemento mostra la traduzione del suo verso.
Se `difficulty_known_pct` < 60 l'app suggerisce di rimandare la canzone (non la blocca). Una canzone rimandata («Tienila per più avanti») non porta card nuove nel ripasso finché non se ne apre lo Studio.

## 9. Spotify
Solo link. Titolo dal endpoint oEmbed `https://open.spotify.com/oembed?url={trackUrl}` (campo `title`). Se la chiamata fallisce (CORS o rete), campi vuoti da compilare a mano. Nessuna API Spotify autenticata. Link accettati: `https://open.spotify.com/track/{id}` con eventuale `?si=…` e prefisso `intl-xx/`.

## 10. Dati (IndexedDB con Dexie, database `singlish`)
Tabelle MVP: songs, chunks, words, cards, reviews, sessions, settings. Campi in `docs/superpowers/plans/2026-10-31-singlish-mvp.md`, Task 2. Id: UUID generati sul dispositivo.
Lo stesso chunk (`baseForm` normalizzato) o la stessa parola (`lemma`) in una seconda canzone non crea nuove card: si aggiunge il verso a `contexts[]`, con la forma in cui la voce compare lì (`surfaceForm`) se è diversa da quella della prima canzone.

## 11. Backup
Esporta un file JSON con tutte le tabelle tranne `apiKey` (esclusa di proposito); importa sostituendo i dati dopo conferma. Condivisione tramite `navigator.share` se disponibile, altrimenti download.

## 12. PWA
Manifest, service worker con precache dell'app (vite-plugin-pwa), funziona offline tranne l'analisi. `navigator.storage.persist()` alla prima apertura. Su iOS va aggiunta alla schermata Home.

## 13. Fuori dall'MVP (v1/v2)
Card A, P, F, S; Espandi; ritornello guidato; riascolto finale; Progressi; Lessico; test di vocabolario; modalità intensiva; temi in Lessico; card ostinate; ottimizzazione FSRS.
