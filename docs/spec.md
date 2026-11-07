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
Traduci in italiano solo le righe che contengono un chunk, una parola o un fenomeno di parlato connesso estratti,
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

### Chiedi a Gemini
Dallo Studio lo studente segna parole, espressioni (il dito trascinato sulle parole vicine dello stesso verso) e versi interi, poi li manda a Gemini in **una** chiamata (`callGemini`: stesso modello, `temperature: 0.2`, JSON con `responseSchema`, stessi ritentativi su 429/5xx). Massimo **12 richieste** per invio (un verso = 1, un'espressione = 1): oltre il limite il tocco non segna e la barra mostra «Massimo 12 per volta». Offline il pulsante è disabilitato.

#### Messaggio utente
```text
Tipo: canzone | Tipo: testo libero (non una canzone)
Titolo: {title} — {artist}          (riga omessa se entrambi vuoti)
Livello: {level}
Testo (righe numerate):
{index}: {line}
...
Richieste:
w1 · riga 4 · "gave up"
w2 · riga 4 · "cold"
v1 · riga 7
```

#### Prompt di sistema
```text
Sei un insegnante di inglese madrelingua che lavora con studenti italiani.
Lo studente sta studiando il testo e ti manda delle richieste, ognuna con un id.
Rispondi a ogni id esattamente una volta, senza saltarne nessuno e senza aggiungerne.
Prima di rispondere leggi il verso e quelli vicini: il significato è quello che ha in quel verso,
non quello del dizionario. Se è figurato, ironico, slang o un gioco di parole, dillo.
Per ogni id scrivi translation_it: la traduzione di tutto il verso in italiano naturale,
come la direbbe un italiano, non parola per parola. Non è mai vuota.
Richieste w (parole o espressioni segnate):
- decidi se è un chunk (phrasal verb, idioma, collocazione, frase fatta, slang: più parole da imparare
  insieme) o una parola singola (lemma);
- se ciò che è segnato fa parte di un'espressione più ampia nel verso, restituisci l'espressione intera
  in surface_form e metti widened a true; altrimenti surface_form è esattamente il testo segnato;
- forma base, tipo, livello, registro (usable | informal | song_only), tema, significato in italiano
  nel contesto del verso, spiegazione di massimo 20 parole in italiano, un esempio d'uso quotidiano in
  inglese; per i chunk anche una situazione in italiano per produrlo.
Richieste v (versi interi):
- sense_it: cosa dice davvero il verso, massimo 40 parole;
- grammar_it: una costruzione utile o insolita del verso, massimo 30 parole; null se non c'è niente di utile;
- culture_it: riferimento culturale, slang o citazione, massimo 30 parole; null se non c'è;
- proposals: da 0 a 2 chunk del verso utili al livello dello studente, con gli stessi campi dei chunk
  e surface_form esattamente come compare nel verso.
Non inventare: se non sei sicuro, dillo nella spiegazione.
```
Per i testi liberi il messaggio dice «testo libero»; nessuna nota di pronuncia.

#### Schema della risposta
```json
{
  "answers": [{
    "id": "w1",
    "translation_it": "",
    "item": { "item_type": "chunk | word", "base_form": "", "surface_form": "", "widened": false,
      "type": "phrasal_verb | idiom | collocation | fixed_phrase | slang | noun | verb | adjective | adverb",
      "cefr": "B1", "register": "usable", "topic": "emotions",
      "meaning_it": "", "explanation_it": "", "extra_example_en": "", "production_prompt_it": "" },
    "verse": { "sense_it": "", "grammar_it": null, "culture_it": null, "proposals": [ /* chunk come sopra */ ] }
  }]
}
```
`item` e `verse` sono `nullable`: per `w*` c'è solo `item`, per `v*` solo `verse`. Per `item_type: "word"` `base_form` è il lemma e `type` la parte del discorso.

#### Controllo della risposta
- Si scartano id sconosciuti, ripetuti (vale il primo) o con il campo sbagliato (`item` su un `v*` e viceversa).
- La riga si ricava dall'id richiesto, mai da Gemini.
- Una risposta è **completa** se ha `translation_it` non vuota e il suo campo (`item` o `verse`) valido.
- Se mancano risposte complete: **una** chiamata di recupero, con lo stesso prompt e solo le richieste mancanti (stessi id). Le risposte complete si uniscono.
- Ciò che resta senza risposta va nella bozza come «senza risposta».
- Proposte con `base_form` uguale (per `normalizeKey`) a una voce `w*` della stessa risposta si scartano.

#### Recupero, bozza e note
- Se mancano risposte complete parte **una** sola chiamata di recupero, con lo stesso prompt e solo le richieste mancanti (stessi id); ciò che resta senza risposta va nella bozza come «senza risposta» e si rimanda con «Riprova».
- Traduzioni (solo quelle mancanti) e note dei versi (`Song.lineNotes`, una nuova nota sostituisce la precedente) si salvano subito; le risposte vanno in `Song.askDraft`, bozza pendente che si unisce alle richieste successive.
- Il foglio «Risposte di Gemini» fa scegliere cosa entra nel ripasso: «Aggiungi N card al ripasso» crea le voci spuntate (chunk o parola nuova = 2 card, voce esistente = riceve il verso, nessun duplicato) e cancella la bozza; «Chiudi senza aggiungere» cancella solo la bozza.
- In Studio un verso con nota mostra un segno che apre un foglio con verso, traduzione, Senso, Grammatica e Cultura (queste ultime se presenti). Con una bozza pendente Studio mostra «Hai risposte da rivedere».

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
