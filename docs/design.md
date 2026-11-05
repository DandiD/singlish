# Singlish — design

Canvas: https://claude.ai/artifact/6wE9aRMt77EJmgR2gFwgZx (pagine: Schermate · scuro, Schermate · chiaro, Interazioni UML, Casi d'uso).
Look: "studio serale". Fondo scuro di default, un accento arancio, colori per tipo di espressione. Tema: Automatico (segue il sistema), Chiaro, Scuro.

## Tipografia
- Titoli: Bricolage Grotesque 700 (opsz 12..96). Titoli di pagina e testata dello Studio 28 px.
- `.display`: Bricolage Grotesque 700, `clamp(40px, 12vw, 56px)`, interlinea 1, `opsz` 96.
- Testo del brano (`.lyrics`) 17 px; verso nella card di sessione 20 px, Inter Tight 500.
- Testo: Inter Tight 400/500/600.
- Timer e numeri tecnici: JetBrains Mono 500.
Self-hosted in `public/fonts/` (woff2, sottoinsiemi latin e latin-ext, licenza OFL) con `display=swap`; il service worker le mette in precache, quindi funzionano offline dal primo avvio.

## Colori dei tipi di espressione
phrasal verb `--blue` · idioma `--accent` · collocazione `--green` · slang `--violet` · parola singola: sottolineatura `--text-2` · parlato connesso: sottolineatura puntinata `--muted`.
Le tinte delle canzoni (`--song-1` … `--song-6`) identificano le canzoni e non si usano mai per i tipi di espressione.
Evidenziazione nel testo: sfondo del colore al 16% di opacità + bordo inferiore 2 px del colore pieno.

## Token (copiare in `src/styles/tokens.css`)
```css
:root, [data-theme="dark"] {
  --bg: #111317;
  --scrim: #0B0C0F;
  --surface: #1B1E25;
  --surface-2: #15181D;
  --chip: #2A2F39;
  --divider: #22262E;
  --line: #2E333D;
  --line-strong: #3A404C;
  --line-strong-2: #5A606C;
  --ghost-text: #4A4F59;
  --muted-2: #6B717C;
  --muted: #A3A8B3;
  --text-2: #C9CDD4;
  --text: #F2F1EC;
  --accent: #FF8A4C;
  --accent-text: #FF8A4C;
  --accent-text-2: #FFB08A;
  --accent-tint: #2A1E17;
  --on-accent: #1A0E06;
  --on-tint-text: #E7D3C7;
  --blue: #7DB0FF;
  --blue-text: #9CC4FF;
  --blue-tint: #1A2433;
  --blue-tint-text: #C9D8EE;
  --green: #5FD3B3;
  --green-text: #8BE3CA;
  --violet: #C9A2FF;
  --danger-text: #FF9C9C;
  --danger-line: #5A3A3A;
  --overlay: rgba(11,12,15,.94);
  --diagram-line: #8C93A0;
  --song-1: #FF8FB1;
  --song-1-tint: #2E1A22;
  --song-2: #E2B24A;
  --song-2-tint: #2A2416;
  --song-3: #5CC8E0;
  --song-3-tint: #15262B;
  --song-4: #A7C48A;
  --song-4-tint: #1F2619;
  --song-5: #D79BB8;
  --song-5-tint: #2A1922;
  --song-6: #9FB2C6;
  --song-6-tint: #1C2229;
}
[data-theme="light"] {
  --bg: #F5F6F8;
  --scrim: #D5D9DF;
  --surface: #FFFFFF;
  --surface-2: #EDEFF2;
  --chip: #E5E8ED;
  --divider: #E3E6EB;
  --line: #DADDE3;
  --line-strong: #C2C7CF;
  --line-strong-2: #A9AFB9;
  --ghost-text: #9AA0AA;
  --muted-2: #8A909A;
  --muted: #5B6270;
  --text-2: #3A404A;
  --text: #14171C;
  --accent: #F47A32;
  --accent-text: #B0460E;
  --accent-text-2: #9E3F0C;
  --accent-tint: #FFE7D8;
  --on-accent: #1A0E06;
  --on-tint-text: #5A3422;
  --blue: #2F6FD6;
  --blue-text: #1F57B0;
  --blue-tint: #E3EDFB;
  --blue-tint-text: #23406B;
  --green: #1F9E7C;
  --green-text: #12735A;
  --violet: #7D4CCB;
  --danger-text: #B3261E;
  --danger-line: #E5B2AE;
  --overlay: rgba(245,246,248,.96);
  --diagram-line: #7A818C;
  --song-1: #B43869;
  --song-1-tint: #FBE3EC;
  --song-2: #8A5F00;
  --song-2-tint: #F6EBCF;
  --song-3: #0B6F84;
  --song-3-tint: #DDF1F6;
  --song-4: #466E2F;
  --song-4-tint: #E5EFDC;
  --song-5: #83395F;
  --song-5-tint: #F2E0EA;
  --song-6: #435568;
  --song-6-tint: #E2E8EF;
}
@media (prefers-color-scheme: light) {
  [data-theme="auto"] {
    --bg: #F5F6F8;
    --scrim: #D5D9DF;
    --surface: #FFFFFF;
    --surface-2: #EDEFF2;
    --chip: #E5E8ED;
    --divider: #E3E6EB;
    --line: #DADDE3;
    --line-strong: #C2C7CF;
    --line-strong-2: #A9AFB9;
    --ghost-text: #9AA0AA;
    --muted-2: #8A909A;
    --muted: #5B6270;
    --text-2: #3A404A;
    --text: #14171C;
    --accent: #F47A32;
    --accent-text: #B0460E;
    --accent-text-2: #9E3F0C;
    --accent-tint: #FFE7D8;
    --on-accent: #1A0E06;
    --on-tint-text: #5A3422;
    --blue: #2F6FD6;
    --blue-text: #1F57B0;
    --blue-tint: #E3EDFB;
    --blue-tint-text: #23406B;
    --green: #1F9E7C;
    --green-text: #12735A;
    --violet: #7D4CCB;
    --danger-text: #B3261E;
    --danger-line: #E5B2AE;
    --overlay: rgba(245,246,248,.96);
    --diagram-line: #7A818C;
    --song-1: #B43869;
    --song-1-tint: #FBE3EC;
    --song-2: #8A5F00;
    --song-2-tint: #F6EBCF;
    --song-3: #0B6F84;
    --song-3-tint: #DDF1F6;
    --song-4: #466E2F;
    --song-4-tint: #E5EFDC;
    --song-5: #83395F;
    --song-5-tint: #F2E0EA;
    --song-6: #435568;
    --song-6-tint: #E2E8EF;
  }
}
```

| Token | Scuro | Chiaro |
| --- | --- | --- |
| `--bg` | `#111317` | `#F5F6F8` |
| `--scrim` | `#0B0C0F` | `#D5D9DF` |
| `--surface` | `#1B1E25` | `#FFFFFF` |
| `--surface-2` | `#15181D` | `#EDEFF2` |
| `--chip` | `#2A2F39` | `#E5E8ED` |
| `--divider` | `#22262E` | `#E3E6EB` |
| `--line` | `#2E333D` | `#DADDE3` |
| `--line-strong` | `#3A404C` | `#C2C7CF` |
| `--line-strong-2` | `#5A606C` | `#A9AFB9` |
| `--ghost-text` | `#4A4F59` | `#9AA0AA` |
| `--muted-2` | `#6B717C` | `#8A909A` |
| `--muted` | `#A3A8B3` | `#5B6270` |
| `--text-2` | `#C9CDD4` | `#3A404A` |
| `--text` | `#F2F1EC` | `#14171C` |
| `--accent` | `#FF8A4C` | `#F47A32` |
| `--accent-text` | `#FF8A4C` | `#B0460E` |
| `--accent-text-2` | `#FFB08A` | `#9E3F0C` |
| `--accent-tint` | `#2A1E17` | `#FFE7D8` |
| `--on-accent` | `#1A0E06` | `#1A0E06` |
| `--on-tint-text` | `#E7D3C7` | `#5A3422` |
| `--blue` | `#7DB0FF` | `#2F6FD6` |
| `--blue-text` | `#9CC4FF` | `#1F57B0` |
| `--blue-tint` | `#1A2433` | `#E3EDFB` |
| `--blue-tint-text` | `#C9D8EE` | `#23406B` |
| `--green` | `#5FD3B3` | `#1F9E7C` |
| `--green-text` | `#8BE3CA` | `#12735A` |
| `--violet` | `#C9A2FF` | `#7D4CCB` |
| `--danger-text` | `#FF9C9C` | `#B3261E` |
| `--danger-line` | `#5A3A3A` | `#E5B2AE` |
| `--overlay` | `rgba(11,12,15,.94)` | `rgba(245,246,248,.96)` |
| `--diagram-line` | `#8C93A0` | `#7A818C` |
| `--song-1` / `-tint` | `#FF8FB1` / `#2E1A22` | `#B43869` / `#FBE3EC` |
| `--song-2` / `-tint` | `#E2B24A` / `#2A2416` | `#8A5F00` / `#F6EBCF` |
| `--song-3` / `-tint` | `#5CC8E0` / `#15262B` | `#0B6F84` / `#DDF1F6` |
| `--song-4` / `-tint` | `#A7C48A` / `#1F2619` | `#466E2F` / `#E5EFDC` |
| `--song-5` / `-tint` | `#D79BB8` / `#2A1922` | `#83395F` / `#F2E0EA` |
| `--song-6` / `-tint` | `#9FB2C6` / `#1C2229` | `#435568` / `#E2E8EF` |

Regole: testo su `--accent` sempre `--on-accent`; link e testo arancio con `--accent-text`; superfici `--surface`, bordi `--line` / `--line-strong`; raggio 20 px per card (`.card`, `.song-card`, `.session-card`, `.install-card`), 12 px per pulsanti e campi, 24 px per i fogli dal basso; un'unica ombra per `.session-card` e `.sheet`: `0 8px 24px` di `--scrim` al 40%.

## Schermate dell'MVP (numeri del canvas)
| N. | Schermata | Route |
| --- | --- | --- |
| 01 | Oggi | `#/` |
| 02 | Canzoni | `#/songs` |
| 03 | Aggiungi canzone | `#/songs/new` |
| 04 | Analisi in corso | `#/songs/:id/analyzing` |
| 05 | Studio canzone | `#/songs/:id` |
| 06 | Scheda chunk/parola | foglio dal basso su `#/songs/:id?item=:itemId` |
| 19 | Smista parole | `#/songs/:id/triage` |
| 10 | Card Riconosci | `#/session` |
| 11 | Card Completa | `#/session` |
| 14 | Timer scaduto | foglio su `#/session` |
| 18 | Impostazioni | `#/settings` |
| — | Lessico (canvas: Lexicon) | `#/lexicon` |
| — | Diario (canvas: Progress), da Oggi; la rotta resta `#/progress` | `#/progress` |
| — | Riascolto finale (canvas: FinalListen), da Oggi | `#/songs/:id/final` |
| — | Aggiungi testo (canvas: AddText), da Canzoni | `#/songs/new-text` |
| — | Card Produci (canvas: CardP) | `#/session` |
| — | Le tue frasi (canvas: Feedback), da fine sessione o Oggi | `#/feedback` |
| — | Card Ascolta (canvas: CardA) | `#/session` |
| — | Test di vocabolario (canvas: VocabTest, VocabResult), da Progressi | `#/vocab-test` |
| — | Ritornello a voce (canvas: Chorus), dallo Studio | `#/songs/:id/chorus` |
| — | Espandi (canvas: Expand), dalla scheda di una parola | `#/expand/:wordId` |
| — | Card Sfumature (canvas: CardNuance) | `#/session` |

Navigazione in basso: Oggi, Canzoni, Lessico. Azioni principali nella metà bassa dello schermo. Telefono di riferimento: 390 × 844.
L'altezza della navigazione in basso è `--nav-h` (65px, senza l'area sicura) in `src/styles/base.css`, in un solo punto: lo spazio in fondo alle schermate con la navigazione e l'azione principale di Oggi si calcolano da lì. In Oggi l'azione principale (`.today-cta`) è `sticky` sopra la navigazione (12px più su, sotto navigazione, fogli e pillole), con un'ombra del colore di fondo che la stacca dal carosello, e la pagina tiene il fuoco da tastiera fuori dalla sua ombra (`scroll-padding-bottom`). `tests/e2e/today-layout.spec.ts` lo verifica a 390 × 844.

## Movimento
Regole in `src/styles/motion.css` (curve `--ease-out`, `--ease-spring`; durate `--t-fast/med/slow`).
- Il movimento risponde ai gesti: cambio di schermata (View Transitions, avanti/indietro/dissolvenza secondo `navDirection` in `src/router.ts`), fogli dal basso che salgono e scendono, card della sessione che entrano da destra, voti e scelte che "saltano".
- Un solo momento firma: nella card Riconosci il chunk si riempie da sinistra a destra come una riga di karaoke.
- La barra in basso resta ferma durante le transizioni; l'indicatore scivola fra le schede.
- `prefers-reduced-motion: reduce`: restano gli stati finali, senza spostamenti.

## Versi sbloccati
- Regola (D1/D2): un verso è sbloccato quando tutte le sue voci hanno la card R in stato Review (un «Di nuovo» porta la card a Relearning, quindi il verso si riblocca). Le voci si leggono dai `contexts` (chunk non sospesi, parole `learn` non sospese); un verso senza voci non conta. Il numero viene solo da `unlockedLines` (`src/domain/unlocked.ts`) ed è lo stesso in Oggi, Riascolto finale, Canzoni e Studio («3 di 14 versi sbloccati»).
- Testo vivo nello Studio: ogni `<p>` del testo ha `line-open` (sbloccato, `--text`) o `line-studying` (con voci non ancora sbloccate, `--text-2`); i versi senza voci restano senza classe; in modalità «Chiedi a Gemini» nessuna classe. Il dato è anche nella testa («Studio · … · 2 di 9 versi sbloccati»), non solo nel colore.
- Movimento: i versi sbloccati che non erano in `songs.unlockedSeen` hanno anche `line-lit` e si accendono uno alla volta (`--i`, `--t-med` di durata e di sfasamento); poi `unlockedSeen` diventa l'elenco attuale. Un verso che si riblocca esce dall'elenco senza avvisi. Con `prefers-reduced-motion: reduce` resta lo stato finale, senza animazione.
- Campi facoltativi nuovi, senza indici né migrazione: `sessions.unlockedAtStart` (versi sbloccati all'apertura di una sessione), `reviews.stability` (`{ before, after }`), `songs.unlockedSeen` (indici di riga).

## Navigazione
Cronologia dell'app in `src/nav-history.ts`, usata dal router (`goBack`, `goBackTo`, `goReplace`, `onBack`, `onBackTo`).
- «Indietro» e ✕ ripercorrono la cronologia (come il tasto Indietro del telefono); senza pagine precedenti nell'app sostituiscono la voce con la pagina di riserva. Il tasto Indietro non riapre mai una pagina appena chiusa.
- Gli esiti di un'azione (canzone salvata → analisi → smistamento → studio, scheda chiusa, sessione finita) sostituiscono la voce: tornando indietro non si ripassa da moduli e passaggi già conclusi.
- Tornando a una pagina si ritrova lo scroll; una pagina nuova parte dall'alto. La scheda attiva della barra, toccata di nuovo, riporta in cima.
- A ogni cambio di pagina il fuoco va sul titolo (`h1`) e la scheda del browser prende il titolo della pagina. Le schermate che caricano dati segnano `main` con `aria-busy` finché non sono pronte.

## Errori
Testi in `src/ui/errors.ts` (`geminiProblem`, `storageProblem`, `failedMessage`, `actionMessage`), uno per causa: cosa è successo (titolo, senza punto), perché e cosa fare (frasi complete). Mai codici tecnici a schermo, salvo lo status HTTP dove aiuta («errore 503»).
- Gemini: chiave mancante o rifiutata e modello inesistente portano a Impostazioni; testo bloccato dai filtri, risposta incompleta, servizio occupato o irraggiungibile offrono «Riprova». In coda si dice il motivo (offline o Gemini occupato).
- Prova della chiave: un solo tentativo; offline o rete assente non diventano mai «chiave non valida»; con 429 la chiave è buona e si salva.
- Azioni non riuscite (voto, smistamento, modifica, completamento, impostazioni): avviso in basso (`reportError`, `ErrorToast`), il pulsante torna usabile. Anche le promesse rifiutate senza gestione arrivano all'avviso.
- Pagine: `ErrorBoundary` al posto dello schermo bianco; `DbGate`, `useLive` e `useFailure` portano lì anche il database che non si apre e i caricamenti falliti, con un testo dedicato per spazio esaurito e dati del browser bloccati.
- Moduli: errori sotto il campo con `aria-invalid` e `aria-describedby`, mostrati dopo aver lasciato il campo.

## Coerenza dei dati fra schermate
Ogni numero si calcola in un solo punto, così due schermate non possono contraddirsi.
- Canzoni aperte: `activeSongs` / `activeSongCount` e `MAX_OPEN_SONGS` in `src/domain/ingest.ts` (tutte le non completate). Oggi le elenca tutte (bozze e in coda portano all'analisi) e, al limite, toglie «Aggiungi» e mostra `LIMIT_NOTE` come Canzoni e Aggiungi canzone.
- Ripasso: `buildSessionQueue` esclude già le voci viste nella sessione lasciata a metà; Oggi annuncia esattamente le card che la Sessione mostrerà.
- Voci di una canzone: `itemsInSong` in `src/domain/songItems.ts`, unica per lo Studio (evidenziazione e conteggi) e per l'avanzamento in Oggi. Le voci che il testo non riesce a evidenziare (coperte da una voce più lunga nello stesso verso, o con una forma che non si trova) sono elencate sotto il testo in «Altre voci di questa canzone»: ogni voce contata è raggiungibile, e i conteggi sono evidenziate + elencate.
- Studio: i conteggi in testa sono le voci evidenziate nel testo (non sospese, parole non note, anche quelle nate in un'altra canzone). In Oggi la stessa canzone conta quelle voci meno le parole ancora da smistare.
- Una voce in un'altra canzone si evidenzia nella forma del suo verso (`contexts[].surfaceForm`): testo, scheda e card della sessione usano la stessa. Per i dati salvati prima, se la forma non è nel verso si provano la forma base e le sue forme irregolari comuni (`formIn`: «run out of» → «ran out of»); una voce che resta introvabile finisce nell'elenco sotto il testo, contata come le altre. Salvando di nuovo una canzone, un contesto senza forma la prende.
- Parole da smistare: `pendingWords` in `src/domain/triage.ts` (in un verso della canzone, anche se nate altrove, non sospese) per il banner dello Studio, Smista e l'esito dell'Analisi.
- Canzone «tenuta per più avanti»: resta `analyzed`, in Canzoni e in Oggi si chiama «Da studiare» e non porta card nuove nel ripasso; aprirne lo Studio la porta a `studying`. Le card già in ripasso continuano.
- Oggi, «Il tuo giro» (`src/ui/screens/Today.tsx`, componenti `DayRing` e `SongCarousel`, testi in `src/ui/todayText.ts`): anello delle card fatte oggi, un solo invito in evidenza, carosello delle canzoni aperte, una sola azione principale. Le funzioni di `src/domain/today.ts`: `doneToday` (card fatte), `dayRing` (stato `todo` | `partial` | `done` | `empty`, tratteggiato se `newBlockedByLoad`), `featuredInvite` (frasi da correggere, riascolto finale, parole da smistare, canzone da studiare), `emptyAction` (azione a coda vuota, stesso ordine della Sessione vuota). Il pulsante è «Inizia il giro» o «Continua il giro» se oggi c'è già una card fatta.
- Decisioni: D1 il «Perché?» è un pulsante di espansione (`aria-expanded`, paragrafo `hidden`), non un foglio dal basso. D2 il carosello mostra copertina con anello `done/total` ed etichetta breve; i pallini del percorso e i «versi sbloccati» arrivano con le fasi 3 e 6. D3 il ritmo settimanale arriva con la fase 4. D4 una canzone con riascolto pronto che non è l'invito porta al riascolto dalla copertina («Riascolto pronto»). D5 «card fatte oggi» = ripassi da mezzanotte locale + frasi scritte oggi ancora da correggere (una frase confermata diventa un ripasso con la data di scrittura, non si conta due volte).
- Regole: F1 a coda vuota (anello `empty` o `done`) l'azione principale è `emptyCta(emptyAction(...))` se non nulla, altrimenti nessuna; l'invito che coincide con l'azione non si mostra due volte. F5 il testo di `emptyCta` «correct» è «Correggi la frase con Gemini» / «Correggi le N frasi con Gemini», uguale alla Sessione. F8 i minuti del timer non hanno più la nota «su N minuti»: li dice l'anello, nel centro («~N′ di M′») e nel testo accessibile («…, circa N minuti su M»), solo mentre restano card; le tre statistiche restano in tutti gli stati. F9 con le nuove trattenute dal carico l'etichetta aggiunge « · nuove in pausa» e il testo accessibile «, card nuove in pausa». F10 l'azione principale si vede al caricamento sopra la navigazione (vedi `--nav-h`). Gli inviti hanno tutti la loro etichetta: «LE TUE FRASI», «RIASCOLTO FINALE», «DA SMISTARE», «DA STUDIARE». Le parole da smistare di ogni canzone, aperta o completata, vengono da `pendingWords` (`src/domain/triage.ts`), come in Smista; `itemsInSong` resta la fonte di totale e fatte. L'anello completo pulsa una volta sola al giorno (`dayKey` di `DayRing`).
- Testi che descrivono un effetto dicono quello vero: chiudendo la sessione allo scadere le card restanti restano su Oggi; Escludi toglie la voce, che torna se ricompare in una canzone nuova.

## Lessico
Tutte le voci (chunk e parole non note) da `lexicon()` in `src/domain/lexicon.ts`: prima i chunk, poi le parole, in ordine alfabetico. Ricerca in inglese e in italiano (senza maiuscole né accenti), filtri Tutti, B1, B2, C1, Attivi, Solo canzone, Parole e Tema; «Aree scoperte» dai temi con meno voci in studio (`coverage`). Stato: nuovo (card R mai vista), impara, attivo (card C in ripasso), sospeso, da smistare. Ogni riga apre la scheda della voce nella sua canzone; da lì una voce sospesa si riattiva.

## Ritmo e Diario
Ritmo settimanale (`src/domain/rhythm.ts`): giorni locali `YYYY-MM-DD`, settimana da lunedì a domenica. Un giorno è «attivo» con almeno un ripasso registrato (`reviews.reviewedAt`) o se è in `settings.freeDays`; le frasi scritte e non ancora corrette non contano. Un giorno libero si segna con `markFreeDay` alla prima apertura di Oggi con coda vuota e nessun ripasso quel giorno (una giornata finita non diventa libera). Il ritmo in Oggi è un link al Diario; l'anello no. L'obiettivo raggiunto pulsa una volta per settimana e per avvio dell'app. Abbassando l'obiettivo a settimana in corso il testo diventa «Obiettivo della settimana raggiunto · N giorni», mai «4 giorni su 3». Nessuna colpa: settimana mancata senza messaggio, nessuna serie, nessuna notifica.
Campi nuovi in `Settings` (nessuna migrazione, facoltativi): `rhythmGoal?: number` (intero fra 3 e 7, predefinito 5) e `freeDays?: string[]` (solo gli ultimi 84 giorni).

Il Diario (`src/ui/screens/Progress.tsx`, rotta `#/progress`) ha questo ordine: calendario «Ultime 12 settimane» → comprensione al primo ascolto → «Versi sbloccati» (somma di `unlockedKeys`, uguale ai «N di M» di Oggi sommati) → lessico attivo, memoria reale, guadagno medio, carico → vocabolario stimato → verso il livello successivo.
Calendario (`ActivityCalendar`): 12 colonne (settimane) per 7 righe, giorni futuri non disegnati, `role="img"` con tabella `visually-hidden`. Livelli: 0 ripassi → 0; 1–9 → 1; 10–24 → 2; 25–49 → 3; 50 o più → 4. Colore `color-mix(in srgb, var(--accent) P%, var(--surface-2))` con P = 0, 30, 55, 80, 100; un giorno libero senza ripassi è di livello 0 con bordo `--line-strong` e «giorno libero» nel testo equivalente.

### Numeri del Diario
Numeri da `progressStats` in `src/domain/progress.ts`: comprensione al primo ascolto per canzone (grafico a una serie, asse adattato ai valori, soglia del 70%, tabella per lo screen reader), lessico attivo (card Completa in ripasso; quelle del livello attuale contano per salire), memoria reale (ripassi non nuovi degli ultimi 30 giorni non dimenticati), carico medio dei prossimi 7 giorni, avanzamento verso il livello successivo (150 voci attive e 70%). Senza dati si mostra «—» e cosa fare, mai numeri inventati.

## Riascolto finale
Una canzone in studio da almeno 7 giorni (`studyStartedAt`, segnata aprendo lo Studio; per le canzoni di prima vale `analyzedAt`) compare in Oggi come «Riascolto finale». Si riascolta senza testo, si segna la % capita adesso, si vede il guadagno rispetto al primo ascolto; «Chiudi la canzone» la completa; il riepilogo conta «N di M chunk e parole nel ripasso» come Oggi. Il guadagno medio va in Progressi.

## Testi liberi
Un testo (serie, podcast, articolo, altro) è una `Song` con `kind: 'text'` e `source`: stessa analisi (a Gemini si dice «Tipo: testo libero»), niente parlato connesso, niente riascolto finale; conta nel limite delle 4 aperte. Si aggiunge da Canzoni con la variante testo di Aggiungi canzone (stessa bozza, limite e attese).

## Chiedere a Gemini dal testo
Nello Studio «Chiedi a Gemini» apre la selezione: ogni parola del testo diventa un pulsante; parole vicine sulla stessa riga sono un'unica espressione (`groupSelection` in `src/domain/ask.ts`). L'invito chiede di leggere tutto e segnare tutto prima di inviare: parte una sola chiamata (`askGemini`), con lo stesso formato di chunk e parole dell'analisi. Le voci entrano subito nel ripasso (scelte dallo studente, niente Smista né fascia); quelle già presenti ricevono il verso e, se erano parole note o da smistare, passano in studio. Le traduzioni dei versi mancanti si aggiungono. Offline il pulsante si spegne e lo dice; un errore di Gemini lascia la selezione per riprovare.

## Sblocco della canzone successiva
«Aggiungi» (Canzoni, Oggi) controlla `readiness` in `src/domain/readiness.ts`: voci delle canzoni in corso ancora fuori dal ripasso, carico dei prossimi 7 giorni sotto i minuti del timer, posti liberi. Se non è pronta si apre il foglio (canvas: Unlock) con i tre controlli, «Sblocca lo stesso», «Aspetto, va bene così» e la modalità intensiva (`intensiveUntil`: 25 nuove al giorno per 7 giorni, segnalata in Oggi).

## Card Produci
Quando la card Completa di un chunk con situazione (`productionPromptIt`) va in ripasso, nasce la card P (anche per i chunk di prima). Nella sessione: situazione in italiano, chunk da usare, frase in inglese (campo con le regole delle risposte); «Non so farla» vale Di nuovo subito, «Salva e avanti» mette la frase in `sessions.productions` senza voto. A fine sessione e in Oggi «Le tue frasi» le corregge tutte con una sola chiamata (verdetto, frase corretta, nota, voto proposto modificabile); «Conferma i voti» registra i ripassi. Finché una frase aspetta, la sua voce non torna in coda. La situazione (`.produce .verse`) è a 22px di proposito: è testo italiano da leggere con calma, più grande del verso inglese delle altre card.

## Card Ascolta
Nasce insieme alla Produci, solo per i chunk con nota di pronuncia o parlato connesso nel verso. Il verso si ascolta con la sintesi vocale del dispositivo (naturale o più lenta), si scrive il dettato; `gradeDictation` conta le parole sbagliate (contrazioni e apostrofi tollerati): 0 Bene, 1 Difficile, di più Di nuovo. Senza sintesi vocale la card lo dice e mostra il verso.

## Test di vocabolario
80 parole sì/no (`src/domain/vocabTest.ts`): 10 per fascia di rango dalla lista di frequenza e 20 inventate; la quota di sì per fascia si corregge con i sì alle inventate. Il risultato (stima, grafico per fascia, fascia utile suggerita) si salva in `settings.vocabTests` e va in Progressi. Usa solo le fasce che la lista copre per intero; sotto tre fasce il test non è disponibile e lo dice.

## Ritornello a voce
Il ritornello sono le righe ripetute del testo (`chorusLines`, al massimo sei); il pulsante compare nello Studio solo se esiste. Si canta con Spotify, si tocca una riga per coprirla; «Ancora» conta un tentativo, «Ce l'ho, senza testo» salva `chorusDoneAt` e torna allo Studio.

## Espandi e Sfumature
Dalla scheda di una parola «Espandi» chiede a Gemini, con una sola chiamata a richiesta, famiglia, collocazioni, contrari e sfumature (`src/domain/expand.ts`); il risultato resta in `words.expansion`. Le voci scelte diventano parole o collocazioni (`origin: 'expand'`, `fromItemId`, senza verso: frase = esempio di Gemini, niente card Ascolta) e in coda vengono dopo chunk e parole delle canzoni; i testi liberi vengono per ultimi. Restano finché esiste la parola da cui sono nate (eliminando una canzone ne seguono la canzone). L'annuncio «N card nuove» viene da `expansionPlan`, lo stesso calcolo dell'aggiunta; una parola già nota o da smistare scelta qui passa in studio. Le sfumature creano sulla parola la card S: situazione, frase con il buco, opzioni, spiegazione, voto proposto (Bene se giusta, Di nuovo se no).

## Conteggi condivisi delle funzioni nuove
- Sblocco, Oggi, Studio, riascolto finale: le voci di una canzone sono quelle con un verso lì (`contexts`), mai le voci di Espandi.
- Carico dei prossimi 7 giorni (Progressi e sblocco): voci in scadenza, una per voce come nella sessione (`dueItemsWithin`).
- Frasi da correggere (Oggi, «Le tue frasi», fine sessione): `pendingProductions`, solo quelle con la card ancora presente e il chunk non sospeso.
- Una voce di Espandi che riceve un verso (analisi di una canzone, «Chiedi a Gemini») diventa voce di canzone (`graduate`): perde `origin`/`fromItemId`, prende canzone, riga e forma di quel verso, e da lì vale come le altre ovunque.
- «Espandi» si offre solo sulle parole in studio (non da smistare, non sospese) e non sulle voci nate da Espandi: niente card Sfumature su parole fuori dal ripasso, niente voci di voci.
- Una parola che passa in studio (Chiedi a Gemini, Espandi) riceve Riconosci e Completa se non ha la R, anche se ha già un'altra card.
- Sessione ripresa: anche le frasi già scritte contano nel «N di M».
- Voluto: sospendere una parola non sospende le voci nate da lei con Espandi (sospendere è reversibile, le voci figlie sono voci a sé); escludere invece le toglie. Una canzone «Da studiare» conta nello sblocco finché non se ne apre lo Studio, perché le sue card nuove non entrano finché non la si studia.
- Le voci di Espandi entrano in coda se la parola da cui sono nate compare in una canzone in studio (o completata). Una frase scritta su una card Produci nuova conta subito fra le nuove del giorno in cui è stata scritta (`wasNew`, `at`); confermata, il ripasso porta quella data e conta fra le nuove o le ripassate della sua sessione. Se Gemini non corregge qualche frase, «Le tue frasi» lo dice e quelle restano da correggere. «Chiedi a Gemini» su una voce sospesa la riattiva.
- Elimina canzone: le parole note, e quelle già ripassate almeno una volta, restano nel profilo come note (senza versi né card), così non tornano in Smista. Le nuove del giorno contano solo le frasi con la card presente e il chunk attivo. L'intensiva alza le nuove a 25 ma non abbassa un valore più alto.
- Parole del profilo (note senza versi): scelte in Espandi passano in studio come voci della parola espansa (`origin: 'expand'`, ne seguono canzone e coda). Eliminando una canzone, le voci di Espandi seguono la parola d'origine se resta in un'altra canzone; altrimenti, se già ripassate, restano nel profilo come note, se no escono.
- Invariante: la canzone e la riga di una voce (`songId`, `lineIndex`) sono sempre quelle di uno dei suoi versi, se ne ha. Quando una voce senza casa (parola del profilo, voce di Espandi) riceve un verso, ci si sposta (`graduate`). Una parola che era nota e passa in studio lo ricorda (`wasKnown`): eliminata la sua canzone torna nel profilo anche se mai ripassata.
- All'apertura e dopo l'importazione di un backup `repairHomes` riporta sul primo verso le voci salvate prima di questa regola, e le voci di Espandi sul verso della loro parola. Quando si elimina la canzone di origine di una voce condivisa, la voce prende la forma del primo verso che resta; gli altri versi senza forma propria tengono quella vecchia, così restano evidenziati. La casa di una voce è sempre il suo primo verso (`isHome`): `graduate` e la riparazione la riportano lì con la sua forma, e la card Ascolta prende la riga dal verso della canzone che mostra.
- Espandi aperto dall'indirizzo su una parola che non si può espandere (`canExpand`: sospesa, da smistare o nata da Espandi) lo dice e non chiama Gemini; `addExpansion` rifiuta comunque. Il riascolto finale di una canzone già completata mostra il risultato salvato e non lo riscrive; su una canzone non in studio (bozza, in coda, «Da studiare», testo libero) lo dice e non la chiude. Dopo l'importazione di un backup la riparazione gira nella stessa transazione: se fallisce, restano i dati di prima.
- La scheda mostra un verso solo se la voce ne ha uno nella canzone aperta: aperta dall'indirizzo su un'altra canzone, o per una parola del profilo, non mostra nessun verso.
- Escludere una parola che sapevi già (`wasKnown`) la rimette nel profilo, sia direttamente sia escludendo la sua parola d'origine.
- Le Impostazioni mostrano la fascia utile in uso e da dove viene (`bandFromTest`: livello o test di vocabolario, anche quando i numeri coincidono); cambiare livello la riporta a quella del livello, e lo dicono.
- Escludere: il testo di conferma dice l'effetto vero (una parola che sapevi già torna fra quelle che sai).
- Lo Studio di una canzone già completata non offre di nuovo «Segna come completata».
- Lo Studio aperto dall'indirizzo su una canzone non ancora analizzata (bozza, in coda) lo dice e non offre «Segna come completata» né «Chiedi a Gemini».
- Un testo libero non salva note di pronuncia (né dall'analisi né da «Chiedi a Gemini»). Un chunk nato in una canzone e presente anche in un testo non mostra la sua nota nella scheda del testo, non riceve la card Ascolta se la sua casa è un testo, e la card Ascolta su un testo non mostra la nota.
- «Chiedi a Gemini»: ogni voce conta una volta sola, come aggiunta o come «c'era già», anche se segnata in più versi o restituita due volte.
- In Sessione, il voto di una card eliminata nel frattempo da un'altra scheda la salta senza contarla.
- Voluto: i ripassi restano come storico anche quando la loro canzone viene eliminata, quindi le card nuove viste oggi continuano a contare nel limite delle nuove del giorno e nella memoria reale (lo stesso numero in Oggi, Sessione e Progressi). `chorusDoneAt` si salva per uso futuro e nessuna schermata lo mostra.
- Un testo libero non si chiude da solo: Aggiungi testo dice che, quando chunk e parole sono nel ripasso, lo si segna come completato dallo Studio. Il limite delle 4 aperte dice «canzoni o testi» e offre anche di eliminare (una bozza non si può completare). Lo sblocco dice che le card nuove entrano nella coda insieme alle altre (l'ordine resta quello per gruppi di `sortKey`). Eliminare una canzone dice che anche le parole già ripassate restano nel profilo come note. Nei testi il verso si chiama «nel testo» e la legenda non mostra la pronuncia.
- Impostazioni: il modello si salva da solo come le altre preferenze (anche quando il campo perde il fuoco toccando «Prova»); se la prova fallisce il messaggio dice che la chiave non è stata salvata e quale modello è salvato.
- «Chiedi a Gemini» su una canzone eliminata durante la chiamata non salva nulla (nessuna voce con versi di una canzone che non c'è più).
- Una parola che torna nel profilo (Escludi, Elimina canzone) non resta sospesa.
- La Sessione vuota con una canzone «Da studiare» dice di aprirne lo Studio, non «Torna domani».
- Testi liberi: Modifica mostra solo il titolo; l'Analisi dice «Il testo è salvato» e non parla di pronuncia. I messaggi di errore di Gemini valgono per ogni richiesta (non «Analisi non riuscita», non «un'altra canzone»).
- Testi liberi: Aggiungi testo, Analisi, Studio (completa, elimina), Canzoni («aggiunto il») e il foglio di sblocco aperto da Aggiungi testo parlano di un testo. La Sessione vuota con una canzone «Da studiare» dice che aprendone lo Studio le card nuove «possono» entrare (dipende dal limite del giorno). Le tue frasi: le frasi arrivano appena scritte. La prova offline della chiave dice quale modello è salvato. In Espandi «le voci nuove» entrano dopo chunk e parole delle canzoni (una parola già in un testo resta parola di quel testo).
- Oggi intitola la lista «Canzoni e testi aperti», come il limite e lo sblocco; il Lessico scrive «N canzoni», «N testi» o «N tra canzoni e testi». Il riascolto finale aperto su una canzone completata senza riascolto dice «Canzone già completata».
- Marginale accettato: dall'indirizzo la scheda di una parola nota mostra Sospendi ed Escludi; Ritornello e Riascolto finale si aprono anche su un testo (il riascolto dice che è per le canzoni in studio). Nessuna schermata ci porta.
- Il riepilogo di fine sessione e il foglio del tempo scaduto contano anche le frasi scritte (come «N di M»). La Sessione vuota con solo canzoni da analizzare dice che si analizzano appena si è online. Il badge di un testo completato dice «Completato».
- La Sessione vuota dice cosa porta card nuove: smistare le parole di una canzone in studio, aprire lo Studio di una «Da studiare», o in Canzoni «Analizza ora» per quelle da analizzare (le bozze non si analizzano da sole; quelle in coda si riprovano all'apertura dell'app). Con solo frasi da correggere di sessioni chiuse offre la correzione, senza «Fatto per oggi». Senza sintesi vocale, su un testo dice di leggere il verso. La prova della chiave già salvata, se fallisce, dice che è la chiave salvata a non funzionare.
- Prova della chiave: solo un rifiuto della chiave (`bad_key`) dà la colpa alla chiave salvata; per gli altri errori il messaggio dice che la chiave salvata non è cambiata. Offline, con la chiave già salvata, dice che non è stata provata (resta salvata).
- Escludi una parola: torna in Smista solo se ricompare in una canzone nuova e rientra nella fascia. Il riepilogo del riascolto finale parla delle «altre» solo se ce ne sono. Il badge offline dice che aspetta tutto ciò che chiede a Gemini.
- Una voce su più righe della stessa canzone porta nell'indirizzo la riga toccata (`id@riga`): la scheda mostra quella riga e la sua traduzione. Canzoni offre «Apri» anche per le canzoni completate (per smistare le parole rimaste o rileggere il testo).
- Sblocco: vicino al tetto il carico si mostra con un decimale («30,3′ … oltre i 30′»), così il numero non contraddice «sotto/oltre». La nota di pronuncia di un chunk si vede solo nella scheda della sua canzone di casa (come la card Ascolta). Chiudendo una scheda aperta dal Lessico il fuoco torna anche ai link «id@riga».
- Il carico si scrive con `loadLabel` sia in Progressi sia nello sblocco; al tetto esatto lo sblocco dice «entro». L'errore «bloccato» dei filtri vale per ogni richiesta a Gemini. Oggi, per una canzone in studio con solo parole da smistare, dice quante sono da smistare nello Studio invece di «0 di 0».
- Deciso: le card nuove e quelle sbagliate tornano lo stesso giorno (passi di apprendimento standard di FSRS). Oggi, Sessione e testi lo dicono allo stesso modo; per cambiarlo serve una richiesta esplicita, perché cambia il modo di imparare.
- Fine della sessione: FSRS rimette in scadenza dopo pochi minuti le card nuove e quelle sbagliate (passi di apprendimento). Finita la sessione si ricalcola la coda: se oggi torna qualcosa il titolo è «Sessione finita» con «N card ancora da fare oggi: le trovi in Oggi», altrimenti «Fatto per oggi». Il foglio del tempo scaduto conta le card rimaste in questa sessione. Per un testo l'Analisi dice «lo analizzo».
- Sessione aperta senza più nulla da mostrare (le card rimaste sono state sospese o escluse): `buildSessionQueue` la segnala come `staleSession` e conta senza di lei, così le card sbagliate tornate in scadenza si vedono in Oggi e la Sessione chiude la vecchia e ne apre una nuova. Con frasi da correggere che tengono fuori le loro voci, Oggi e la Sessione vuota dicono che quelle voci tornano dopo la correzione (non «Torna domani»). La fine della sessione conta le card «ancora da fare oggi» (sbagliate, nuove o appena sbloccate) e dice «Fatto per oggi» solo se non resta nulla e non ci sono frasi da correggere: confermate, le loro card possono tornare in scadenza lo stesso giorno.
- Marginale accettato: chiusa una sessione aperta che nascondeva tutto (`staleSession`), il riepilogo della nuova sessione conta solo quello fatto nella nuova; i ripassi della vecchia restano salvati e contati in Progressi.
- Oggi, con il ripasso in scadenza oltre il timer, dice «Per ora niente card nuove … Arrivano quando scende sotto»: il blocco si ricalcola su ciò che resta. La card Produci dice che la correzione si chiede da «Le tue frasi» (anche a fine sessione).
- `newBlockedByLoad` vale solo se il carico trattiene davvero card nuove (limite del giorno non esaurito e nuove disponibili): altrimenti Oggi non promette nuove.
- Marginale accettato: «Fatto per oggi» non nomina le parole da smistare (Oggi le mostra per canzone; smistarle porta card nuove su azione dell'utente). Con un timer di ripasso di pochi minuti, chiudendo a metà le card sbagliate possono far scattare il blocco delle nuove: il foglio del tempo dice «quello che resta da fare oggi lo trovi su Oggi», e Oggi spiega il blocco.
- Ogni voce ha la sua scheda (`key={itemId}`): chiusa una scheda e aperta subito un'altra voce, la nuova si chiude normalmente.
- La scheda, chiudendosi, torna allo Studio solo se l'indirizzo non è cambiato nel frattempo (animazione di 200 ms): un tocco sulla barra durante la chiusura non viene annullato.
- Due analisi della stessa canzone insieme (coda all'apertura e «Analizza ora»): se una riesce, l'errore dell'altra non dice «in coda». In «Chiedi a Gemini», durante la richiesta le parole e «Annulla» sono spenti (la richiesta partita non si può annullare).
- Dopo un salvataggio le azioni che navigano (Aggiungi dopo il controllo di sblocco, Espandi «Aggiungi», Conferma dei voti, Smista, Studiala ora, Riascolto finale, Segna come completata, Elimina, Ritornello, Test di vocabolario, Ferma e salva, Aggiungi canzone) ricontrollano l'indirizzo (`stillHere`): se nel frattempo si è toccato Indietro o la barra, non riportano indietro. Senza View Transitions scroll e fuoco vanno solo alla pagina che è ancora quella.
- Oggi si ricalcola quando l'app torna in primo piano e a mezzanotte (`useDayTick`): lasciata aperta la sera, al mattino mostra le card del nuovo giorno come la Sessione.
- `replace` della cronologia: se la voce precedente è già la pagina di destinazione si torna a quella invece di duplicarla (dopo «Aggiorna la fascia», «Conferma i voti», «Chiudi la canzone», «Elimina» basta un solo Indietro).
- Dalla fine della Sessione (e dalla Sessione vuota) «Correggi» sostituisce la voce della sessione (`onReplace`): Indietro da «Le tue frasi» non rimonta la Sessione, che altrimenti ne aprirebbe una nuova.
- La scheda in modifica chiusa senza velo, Esc o X (tasto o gesto Indietro) salva la modifica lo stesso, come le altre chiusure.
- Marginale accettato: se «Conferma i voti» si interrompe a metà per un guasto di IndexedDB, il conteggio «Gemini non ha corretto N» può non tornare finché si riapre la pagina (le frasi già confermate non si contano due volte).
- Modifica di una canzone: con un link appena incollato e Salva subito, una canzone «Senza titolo» aspetta il titolo da Spotify (massimo 4 s, come Aggiungi). Uscendo dalla pagina a metà (barra, Indietro) quello che si è scritto e vale si salva (un link non valido no: resta quello di prima; un titolo svuotato resta quello di prima, ma link e artista si salvano) e, su una canzone «Senza titolo» con un link nuovo, il titolo di Spotify arriva anche dopo l'uscita; Annulla non salva.
- Impostazioni: ogni campo tiene una bozza di quello che si scrive (un ridisegno della pagina non la cancella) e si salva lasciandolo, o lasciando la pagina con il campo ancora aperto; non a ogni tasto (con preact/compat `onChange` scatterebbe a ogni carattere, quindi si usa `onBlur`). «Prova» usa il modello appena scritto. I timer si uniscono a quelli salvati dentro la transazione: due campi salvati insieme non si sovrascrivono. Il cursore della memoria si salva al rilascio. La chiave si salva quando «Prova» riesce; scrivendola, la pagina lo dice.
- «Conferma» di Segna come completata, «Sì, elimina» (Studio e Canzoni) e «Ce l'ho» del Ritornello agiscono una volta sola anche con un doppio tocco.
- Il foglio di sblocco segue i dati mentre è aperto (un'analisi che finisce, una voce che entra nel ripasso).
- «Conferma i voti» conta ogni frase una volta sola: una frase già confermata (doppio tocco, ripetizione dopo un errore a metà) non registra un secondo ripasso. Nel Riascolto finale e in Aggiungi canzone toccare il cursore senza spostarlo conferma la percentuale mostrata. Le canzoni completate con parole ancora da smistare compaiono in Oggi («Completata · N parole da smistare», link allo Studio), fuori dal conto delle aperte.
- Le parole mai smistate contano dappertutto allo stesso modo: Oggi le nomina nella riga di ogni canzone («Da studiare» compresa), lo Studio con il banner, lo sblocco come «N parole da smistare» anche per le canzoni completate (la canzone successiva non è pronta finché restano). In Oggi le completate con parole rimaste stanno sotto «Da smistare nelle canzoni completate», fuori dalle aperte. La Sessione vuota calcola il suo motivo dai dati vivi.
- La lista di Smista segue i dati: una parola smistata altrove mentre è aperta sparisce da lista e conteggi.
- In Oggi la riga di ogni canzone nomina le parole lasciate da smistare anche quando ha altre voci nel ripasso («X di Y chunk e parole nel ripasso · N parole da smistare»); una canzone senza voci dice «nessuna voce da ripassare», mai «0 chunk e parole».
- Se Gemini non restituisce nessuna correzione, «Le tue frasi» lo dice come errore e le frasi restano da correggere (si riprova). Una canzone in studio senza voci nel ripasso dice in Oggi se sono sospese («le trovi sospese nel Lessico»), non «0 di 0».
- Voluto: riprendendo una sessione lasciata con ✕ compare «In pausa»: uscire mette in pausa il timer, e il timer salvato riparte solo con «Riprendi» (spec §4).
- Marginale accettato: Oggi e Progressi tenuti in primo piano per ore si ricalcolano a mezzanotte, al ritorno in primo piano o a ogni scrittura: le soglie a metà giornata (fine dell'intensiva, 7 giorni esatti per il riascolto finale, finestre mobili) arrivano con qualche minuto di ritardo.
- Anche Progressi usa `useDayTick`. Vicino al tetto il carico arrotonda il decimale dalla parte giusta (sopra in su, sotto in giù).
- La fine della Sessione e la Sessione vuota lasciate aperte oltre mezzanotte ricontano le card al ritorno in primo piano (`useDayTick`): «Sessione finita · N card ancora da fare oggi» o «Ci sono card da ripassare», come Oggi.
- Marginale accettato: uscendo da «Le tue frasi» dopo «Correggi» e prima di «Conferma i voti», le correzioni non confermate si perdono e le frasi restano da correggere (come i testi non inviati). Se nei primi secondi dopo l'avvio la ripresa della coda e «Analizza ora» lavorano sulla stessa canzone e il tentativo dello schermo fallisce prima che l'altro riesca, l'Analisi dice «in coda» e poco dopo la canzone risulta analizzata (dati giusti). Dopo «Escludi» il fuoco torna al corpo della pagina (il link della voce non c'è più). La fine della sessione potrebbe mostrare per un istante il titolo prima che arrivi il conteggio delle frasi (non riprodotto: c'è un test).
- Marginale accettato: Oggi dice «Niente da ripassare oggi.» anche con canzoni «Da studiare» o parole da smistare: è vero per la coda di adesso, e Oggi elenca quelle canzoni con «Da studiare» o «N parole da smistare» (stesso caso di «Fatto per oggi»). Le sessioni di ripasso lasciate aperte in giorni passati restano senza `endedAt`: nessuna schermata le mostra e le loro frasi continuano a contare.
- Marginale accettato: una sessione aperta prima di mezzanotte e ripresa dopo non nasconde più le voci già viste (è un giorno nuovo; Oggi e Sessione restano d'accordo). Aprire e chiudere la Sessione in pochi millisecondi può lasciare due sessioni aperte.
- Voluto: una frase scritta il cui chunk viene sospeso esce da «N di M» della sessione ripresa, come da Oggi e da Le tue frasi (stessa regola di `pendingProductions`).
- Marginale accettato: se `freq.json` (in precache) non si carica con la rete attiva, l'Analisi dice «Sei offline» e mette la canzone in coda: succede solo per un guasto della cache.
- Marginale accettato: l'avviso generico «Non salvato. Riprova…» compare per ogni azione non riuscita per un guasto di IndexedDB, anche per le poche che leggono soltanto.
- Voluto: «Tienila per più avanti» dopo l'analisi è solo un link a Canzoni e non scrive nulla.
- Voluto: il carico dei 7 giorni (Progressi, sblocco) conta anche le card con una frase in attesa di correzione: dopo la conferma vanno ripassate comunque.
- Marginale accettato: confermare da un'altra scheda del browser una frase la cui card è stata eliminata o sospesa la conta comunque nella sessione (era già contata in «N di M» quando è stata scritta); un ripasso su una voce sospesa non la rimette in coda.
- Marginale accettato: `repairHomes` all'apertura non blocca il primo disegno (se IndexedDB restasse bloccato l'app non partirebbe); le query live correggono i numeri subito dopo. Escludere una parola rimette nel profilo le voci di Espandi che erano note (`wasKnown`).
- Marginale e voluto: le card di una parola scelta in Espandi che appartiene a una canzone «Da studiare» aspettano che quella canzone si apra; una voce che cambia canzone d'origine prende la forma del suo primo verso rimasto (se non si trova nel verso, resta fra «Altre voci di questa canzone»).
- Marginale e accettato: le scelte di Smista non confermate (e i testi non ancora inviati: frase, risposta, voci scelte in Espandi, % del riascolto) si perdono uscendo prima di confermare.
- Marginale e voluto: la scorciatoia «Aggiungi canzone» dell'app installata apre direttamente il modulo (controlla solo il limite di 4); riattivare l'intensiva fa ripartire i 7 giorni.
- Voluto: aprire una voce dal Lessico apre lo Studio della sua canzone (e quindi, se era «Da studiare», la mette in studio); la card Ascolta guarda il parlato connesso del verso d'origine del chunk; l'intestazione di Espandi mostra la canzone d'origine della parola.
- Escludi (`excludeItem`) fa uscire anche le voci nate con Espandi dalla voce esclusa; la conferma dice quante.
- «Aggiungi testo» passa dal controllo di sblocco come «Aggiungi».

## Salvataggi
Niente di ciò che l'utente inserisce si perde in silenzio.
- Aggiungi canzone: il modulo è una bozza in `localStorage` (si esce dall'app per ascoltare e copiare il testo, e iOS può chiuderla); si svuota a canzone salvata. Senza titolo scritto, l'invio aspetta il titolo di Spotify (al massimo 4 s); correggendo il link, il titolo preso da Spotify si aggiorna; uno scritto a mano vince. La comprensione non indicata si salva vuota («—»), non 50%. Se l'utente va altrove mentre si aspetta, la canzone non si crea.
- Analisi: l'esito si salva solo se la canzone non è già analizzata; una seconda analisi (doppio avvio, coda all'apertura) non cambia stato né dati.
- Impostazioni: ogni campo si salva da solo (la chiave invece quando «Prova» riesce), modello compreso (senza spazi; vuoto torna quello salvato). I numeri vuoti tornano al valore salvato, quelli fuori limite si fermano al limite, e il campo mostra il valore salvato. La prova della chiave salva la chiave provata, anche se intanto si è scritto altro.
- Scheda: chiudendola mentre si modifica (velo, Esc, X) la modifica si salva; un significato vuoto non si salva.
- Ripasso: voto e contatori della sessione in una sola transazione. Le sessioni di Studio si chiudono uscendo.
- Canzoni: «Modifica» su ogni canzone, in qualunque stato, per titolo, artista e link Spotify. Titolo vuoto non salvabile; link non di un brano bloccato con lo stesso messaggio di Aggiungi canzone; link vuoto toglie il link; se il titolo è ancora «Senza titolo», arriva da Spotify lasciando il campo del link.
- Link Spotify che non è di un brano: l'invio si ferma, lo dice e torna al campo (non si salva senza link in silenzio).

## Contenuti e interazioni
- Forme nel verso: `findForm` cerca la parola intera, poi il pezzo di parola («end» non diventa «fri*end*s»); Studio, scheda e card R/C della sessione usano la stessa forma (`formIn`), e la card C chiede quella.
- Parlato connesso: le parole con sottolineatura puntinata aprono la scheda «Pronuncia» (scritto, cantato, spiegazione, verso).
- Avvisi: nella sessione stanno in alto, sotto l'intestazione, per non coprire i voti; altrove in basso.
- Installazione: accettata dal pulsante o dal menu (`appinstalled`), la scheda dice «App installata».

## PWA
Chiave Gemini da `.env.local` (`VITE_GEMINI_API_KEY`): letta solo con `npm run dev`. `npm run build` termina con `scripts/check-build-secrets.mjs`, che fallisce se la chiave compare nei file costruiti.
Manifest con icone `any` e `maskable` (generate da `scripts/make-icons.mjs`), scorciatoie (Ripasso, Aggiungi canzone) e screenshot. Aggiornamento su richiesta: pillola «Nuova versione» → «Aggiorno…» → «App aggiornata» (fallisce in modo visibile dopo 8 s). Installazione dalle Impostazioni (pulsante su Chrome/Android, istruzioni su iOS) e banner in Oggi quando il browser la propone o su iOS; chiuso una volta (`installBannerDismissed` in IndexedDB) non ricompare. Pubblicata su GitHub Pages (`/singlish/`, base dalla variabile `BASE_PATH` della build). Segnale «Offline» in alto quando manca la rete.
