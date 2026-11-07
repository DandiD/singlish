# Chiedi a Gemini, seconda versione — design

Data: 2026-11-07. Sostituisce il flusso di `src/domain/ask.ts` e la modalità «Chiedi a Gemini» di Studio.

## Perché
Oggi lo studente tocca le parole del testo e le chiede tutte insieme; le voci entrano subito nel ripasso. Problemi:
- la traduzione del verso a volte manca (è un elenco a parte e facoltativo per Gemini);
- una voce segnata può non tornare, e il codice non se ne accorge;
- parole vicine si uniscono sempre, anche quando lo studente non vuole;
- per chiedere un verso intero bisogna toccare ogni parola;
- si può chiedere solo «cosa vuol dire», non il senso di un verso, la grammatica o un riferimento culturale;
- non si sceglie cosa tenere: tutto finisce nel ripasso.

## Obiettivi
1. Ogni cosa chiesta torna con la traduzione del suo verso, sempre.
2. Ogni cosa chiesta riceve una risposta, o è dichiarata senza risposta con Riprova.
3. Lo studente sceglie cosa entra nel ripasso; spiegazioni e traduzioni restano salvate comunque.
4. Si chiede un verso intero con un tocco e si ottiene senso, grammatica e cultura (le ultime due se utili).
5. Unire o separare parole vicine è una scelta esplicita.
6. Nel caso normale, una sola chiamata a Gemini.

Fuori: domanda libera scritta dallo studente; espressioni a cavallo di due versi; strofe intere come unità.

## 1. Segnare nel testo (Studio, modalità «Chiedi a Gemini»)
- **Parola**: un tocco la segna, un altro la toglie. Ogni parola segnata nasce separata.
- **Giunto**: fra due parole segnate e adiacenti sullo stesso verso compare un giunto `+` (bersaglio ≥ 44 px, `aria-pressed`, etichetta «Unisci» / «Separa»). Un tocco le unisce in un'unica espressione, un secondo le separa. Le catene si uniscono un giunto alla volta. Togliere una parola dentro un'espressione la spezza in quel punto (i giunti che toccavano quella parola spariscono).
- **Verso intero**: un tocco sul numero del verso (≥ 44 px, `aria-pressed`) lo segna; un altro lo toglie. Sullo stesso verso si possono segnare anche parole: il verso porta senso, grammatica e cultura; le parole il significato.
- **Barra in basso**: conteggio («2 versi · 3 voci»), Annulla, Chiedi a Gemini. Massimo **12 richieste** per invio (un verso = 1, un'espressione = 1). Oltre il limite il tocco non segna e la barra mostra «Massimo 12 per volta».
- Offline: Chiedi a Gemini disabilitato, come oggi. Durante la richiesta il testo non si tocca.
- Dopo un errore, quello che era segnato resta segnato.

Stato della selezione (dominio, funzione pura e testata): insieme delle parole segnate `riga:token`, insieme dei giunti uniti `riga:token` (giunto fra `token` e `token+1`), insieme dei versi segnati. Da questo si ricavano le richieste:
- `w1, w2, …` voci: sequenze massimali di parole segnate legate da giunti uniti, in ordine di testo;
- `v1, v2, …` versi interi, in ordine di testo.

## 2. Richiesta a Gemini
Una chiamata con `callGemini` (stesse impostazioni: modello, `temperature: 0.2`, JSON con `responseSchema`, ritentativi su 429/5xx).

### Messaggio utente
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

### Prompt di sistema
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

### Schema della risposta
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

### Controllo della risposta (zod, nel dominio)
- Si scartano id sconosciuti, ripetuti (vale il primo) o con il campo sbagliato (`item` su un `v*` e viceversa).
- La riga si ricava dall'id richiesto, mai da Gemini.
- Una risposta è **completa** se ha `translation_it` non vuota e il suo campo (`item` o `verse`) valido.
- Se mancano risposte complete: **una** chiamata di recupero, con lo stesso prompt e solo le richieste mancanti (stessi id). Le risposte complete si uniscono.
- Ciò che resta senza risposta va nella bozza come «senza risposta».
- Proposte con `base_form` uguale (per `normalizeKey`) a una voce `w*` della stessa risposta si scartano.

## 3. Foglio «Risposte»
Si apre al termine della richiesta, sopra Studio. Raggruppato per verso, in ordine di testo. Per ogni verso:
- verso in inglese (`lang="en"`) e traduzione;
- se chiesto intero: **Senso**; **Grammatica** e **Cultura** solo se non null;
- le voci `w*` di quel verso: forma, significato, spiegazione, esempio; casella **spuntata**. Se `widened`: nota «allargata a *…*». Se la voce esiste già (chunk per `key`, parola per `lemma`): nota «Già nel tuo lessico», la casella resta e decide se riceve il verso;
- le proposte dei versi interi: casella **non spuntata**;
- le richieste senza risposta: «Gemini non ha risposto su questo» e, in fondo al foglio, un unico «Riprova» che rimanda solo quelle (si uniscono alla bozza).

In fondo: «Aggiungi N card al ripasso» (N = card che nasceranno davvero, calcolato come in Espandi; se 0 e nessuna voce esistente spuntata: «Chiudi»), e «Chiudi senza aggiungere».

## 4. Dati
Due campi facoltativi su `Song` (non indicizzati, nessuna nuova versione Dexie):
```ts
/** Note dei versi chiesti interi a Gemini. */
lineNotes?: { lineIndex: number; senseIt: string; grammarIt: string | null; cultureIt: string | null }[]
/** Risposte di «Chiedi a Gemini» in attesa della scelta dello studente. */
askDraft?: AskDraft
```
`AskDraft` contiene le risposte complete, le richieste senza risposta e la data. Al termine della richiesta, in una transazione:
- le traduzioni vanno in `lineTranslations` (si aggiungono solo quelle mancanti);
- le note dei versi vanno in `lineNotes` (una nuova nota per lo stesso verso sostituisce la precedente);
- la bozza va in `askDraft` (una nuova richiesta con una bozza pendente: le risposte si uniscono, per id di verso/voce nuovi).

«Aggiungi» crea le voci spuntate con le regole di oggi (`askGemini`): voce nuova → chunk o parola con 2 card; voce esistente → riceve il verso (`addContext`, `graduate`), torna attiva, se parola non in studio passa in studio con card R se mancano. Poi cancella `askDraft`. «Chiudi senza aggiungere» cancella solo `askDraft`.

Canzone eliminata durante la richiesta: non si salva niente (come oggi). Il backup esporta e importa i due campi senza modifiche (sono parte di `songs`).

## 5. Studio
- Un verso con nota mostra un piccolo segno (icona, colore da token) accanto al numero; toccandolo si apre un foglio con verso, traduzione, Senso, Grammatica, Cultura.
- Con una bozza pendente, Studio mostra «Hai risposte da rivedere» con un pulsante che apre il foglio Risposte.

## 6. Errori
- Errori di `callGemini`: messaggio da `geminiProblem`, come oggi; selezione conservata; nessun salvataggio.
- Risposta non valida nel suo insieme (`bad_json`): come sopra.
- Chiamata di recupero fallita: si salva ciò che è arrivato, il resto va in «senza risposta».

## 7. Test (TDD, nessuna rete)
- Dominio selezione: segna/togli, giunto unisci/separa, catene, rottura togliendo una parola centrale, verso intero, limite 12, ordine degli id.
- Messaggio: tipo, titolo omesso se vuoto, righe numerate, richieste con id.
- Controllo risposta: id sconosciuti/ripetuti/campo sbagliato, traduzione vuota → incompleta, riga dall'id, proposte duplicate scartate.
- Recupero: `fetch` finto con risposta parziale → seconda chiamata con sole mancanti; seconda fallita → «senza risposta».
- Salvataggio: traduzioni solo mancanti, note sostituite, bozza unita, canzone eliminata → niente.
- Aggiungi: solo spuntate, esistenti non duplicate e passate in studio, conteggio card uguale al piano.
- UI: giunto e numero del verso (ruoli, `aria-pressed`), barra con conteggio e limite, foglio Risposte, segno sul verso, bozza pendente.
- E2E: un giro con testo inventato e `fetch` finto.

## 8. Documenti
Aggiungere a `docs/spec.md`, sezione 8, la sottosezione «Chiedi a Gemini» con prompt, messaggio e schema di questa spec.
