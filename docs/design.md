# Singlish — design

Canvas: https://claude.ai/artifact/6wE9aRMt77EJmgR2gFwgZx (pagine: Schermate · scuro, Schermate · chiaro, Interazioni UML, Casi d'uso).
Look: "studio serale". Fondo scuro di default, un accento arancio, colori per tipo di espressione. Tema: Automatico (segue il sistema), Chiaro, Scuro.

## Tipografia
- Titoli: Bricolage Grotesque 700 (opsz 12..96).
- Testo: Inter Tight 400/500/600.
- Timer e numeri tecnici: JetBrains Mono 500.
Self-hosted in `public/fonts/` (woff2, sottoinsiemi latin e latin-ext, licenza OFL) con `display=swap`; il service worker le mette in precache, quindi funzionano offline dal primo avvio.

## Colori dei tipi di espressione
phrasal verb `--blue` · idioma `--accent` · collocazione `--green` · slang `--violet` · parola singola: sottolineatura `--text-2` · parlato connesso: sottolineatura puntinata `--muted`.
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

Regole: testo su `--accent` sempre `--on-accent`; link e testo arancio con `--accent-text`; superfici `--surface`, bordi `--line` / `--line-strong`; raggi 12–16 px per card e pulsanti, 24 px per i fogli dal basso.

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

Navigazione in basso: Oggi, Canzoni, Lessico (Lessico disabilitato nell'MVP con etichetta "Presto"). Azioni principali nella metà bassa dello schermo. Telefono di riferimento: 390 × 844.

## Movimento
Regole in `src/styles/motion.css` (curve `--ease-out`, `--ease-spring`; durate `--t-fast/med/slow`).
- Il movimento risponde ai gesti: cambio di schermata (View Transitions, avanti/indietro/dissolvenza secondo `navDirection` in `src/router.ts`), fogli dal basso che salgono e scendono, card della sessione che entrano da destra, voti e scelte che "saltano".
- Un solo momento firma: nella card Riconosci il chunk si riempie da sinistra a destra come una riga di karaoke.
- La barra in basso resta ferma durante le transizioni; l'indicatore scivola fra le schede.
- `prefers-reduced-motion: reduce`: restano gli stati finali, senza spostamenti.

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
- Testi che descrivono un effetto dicono quello vero: chiudendo la sessione allo scadere le card restanti restano su Oggi; Escludi toglie la voce, che torna se ricompare in una canzone nuova.

## Salvataggi
Niente di ciò che l'utente inserisce si perde in silenzio.
- Aggiungi canzone: il modulo è una bozza in `localStorage` (si esce dall'app per ascoltare e copiare il testo, e iOS può chiuderla); si svuota a canzone salvata. Senza titolo scritto, l'invio aspetta il titolo di Spotify (al massimo 4 s); correggendo il link, il titolo preso da Spotify si aggiorna; uno scritto a mano vince. La comprensione non indicata si salva vuota («—»), non 50%. Se l'utente va altrove mentre si aspetta, la canzone non si crea.
- Analisi: l'esito si salva solo se la canzone non è già analizzata; una seconda analisi (doppio avvio, coda all'apertura) non cambia stato né dati.
- Impostazioni: ogni campo si salva da solo, modello compreso (senza spazi; vuoto torna quello salvato). I numeri vuoti tornano al valore salvato, quelli fuori limite si fermano al limite, e il campo mostra il valore salvato. La prova della chiave salva la chiave provata, anche se intanto si è scritto altro.
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
Manifest con icone `any` e `maskable` (generate da `scripts/make-icons.mjs`), scorciatoie (Ripasso, Aggiungi canzone) e screenshot. Aggiornamento su richiesta: pillola «Nuova versione» → «Aggiorno…» → «App aggiornata» (fallisce in modo visibile dopo 8 s). Installazione dalle Impostazioni (pulsante su Chrome/Android, istruzioni su iOS). Segnale «Offline» in alto quando manca la rete.
