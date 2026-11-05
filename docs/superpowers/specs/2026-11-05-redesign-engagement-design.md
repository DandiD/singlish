# Singlish — redesign per il coinvolgimento (progettazione)

Data: 5 novembre 2026 · Stato: decisioni aperte chiuse il 5 novembre, in attesa di approvazione · Nessun codice: questo documento descrive cosa cambiare e perché; il piano di implementazione verrà dopo l'approvazione.

Riferimenti: `docs/spec.md` (regole e valori, restano validi), `docs/design.md` (token, tipografia, movimento, coerenza dei dati).

---

## 1. Intento

### Cosa è stato chiesto
Una progettazione moderna che porti a un redesign **più coinvolgente** per l'utente. Niente codice.

### Cosa assumo (da correggere se sbagliato)
- L'utente è uno solo (il proprietario dell'app); "coinvolgente" significa **tornare ogni giorno volentieri e finire le sessioni**, non passare più tempo nell'app.
- Il metodo (FSRS, 16 nuove al giorno, 30 minuti, massimo 4 canzoni aperte) non si tocca: il redesign deve far *rispettare* il metodo con piacere, non aggirarlo.
- Restano tutti i vincoli di progetto: nessun backend, nessuna dipendenza nuova, colori solo da token, interfaccia in italiano sobrio, 44 px minimi, temi chiaro e scuro, `prefers-reduced-motion`.
- Il look "studio serale" (fondo scuro, accento arancio, colori per tipo di espressione) è un'identità da far evolvere, non da buttare.

### Criteri di successo
1. In Oggi si capisce in **un colpo d'occhio** cosa fare e quanto manca (oggi servono 3–6 frasi da leggere).
2. Ogni sessione finisce con la sensazione di aver **guadagnato qualcosa di concreto** (versi che ora capisci), non con un conteggio.
3. Ogni canzone ha un'**identità visiva** e un **percorso visibile** dall'ascolto al riascolto finale.
4. Nessun numero inventato, nessuna leva colpevolizzante, nessun incentivo a superare i limiti del metodo.

---

## 2. Diagnosi dell'esperienza attuale

| Dove | Cosa succede oggi | Effetto sull'utente |
| --- | --- | --- |
| Oggi | Tre numeri mono (in scadenza, nuove, stimati) + note testuali lunghe e condizionali; lista canzoni con righe tipo «3 di 12 chunk e parole nel ripasso · 2 parole da smistare» | Molto da leggere prima di agire; tutte le canzoni sembrano uguali; il "perché" della giornata non si sente |
| Sessione | Card in fila con barra di avanzamento e chip «RICONOSCI · NUOVA» | Funziona, ma il ritmo è piatto: nessun segnale di serie di risposte giuste o di fine vicina |
| Fine sessione | Spunta + «N ripassate · N nuove» | Il premio è un conteggio; non dice cosa si sa fare di nuovo |
| Canzone / Studio | Testo con evidenziazioni, banner, azioni sparse (Smista, Chiedi a Gemini, Ritornello, Completa) | Le fasi del ciclo (spec §2) esistono ma non si vedono come un percorso |
| Progressi | Grafico di comprensione + 4 riquadri + test vocabolario, raggiunto da un'icona in alto | Bella sostanza, poco visitata; nessun legame quotidiano con il lavoro fatto |
| Lessico | Lista alfabetica con filtri | Utile come archivio, non come "collezione" di cui andare fieri |

Il problema non è la mancanza di funzioni: è che **il progresso, che esiste già nei dati, non viene raccontato**.

---

## 3. Approcci considerati

### A. Restyling visivo
Nuova gerarchia tipografica, card più grandi, meno testo. Costo basso, rischio basso, ma non cambia il motivo per cui si torna. **Insufficiente da solo.**

### B. Percorso della canzone + rituale quotidiano (raccomandato)
La canzone diventa la protagonista (copertina, colore, percorso a tappe); la giornata diventa un rituale breve con un solo obiettivo visibile; ogni sessione chiude mostrando i **versi sbloccati**. Tutto deriva da dati già salvati. Costo medio, coerente con lo spirito dell'app.

### C. Gamification piena
Punti esperienza, livelli dell'utente, serie giornaliere con perdita, trofei. Aumenta l'uso nel breve, ma spinge a "fare punti" invece di ricordare, e mal si sposa con FSRS (giorni senza scadenze punirebbero l'utente senza colpa). **Scartato**; ne prendo solo due idee innocue: il ritmo settimanale e i traguardi rari (§6).

**Scelta: B**, con il restyling di A come base visiva.

---

## 4. Principi del redesign

1. **La canzone è la protagonista.** Ogni schermata che parla di una canzone ne mostra copertina e colore.
2. **Un'azione chiara per schermata.** Il pulsante principale sta nella metà bassa; tutto il resto è secondario.
3. **Mostra, non scrivere.** Anelli, tappe, versi illuminati al posto delle frasi condizionali. Il testo resta per lo screen reader e per i casi rari.
4. **Premia il ricordo vero.** Le ricompense vengono da FSRS e dai versi capiti, mai dal tempo passato o dal numero di tocchi.
5. **Calma, non casinò.** Niente suoni, niente coriandoli continui, niente colpa. Un momento firma per ogni traguardo, poi silenzio.

---

## 5. Schermate

Telefono di riferimento 390 × 844, come in `docs/design.md`. Gli schemi sono indicativi.

### 5.1 Oggi → «Il tuo giro»

```
┌──────────────────────────────────────┐
│ Singlish                    ◔  ⚙     │
│ Mercoledì 5 novembre                 │
│                                      │
│        ╭──────────────╮              │
│       ╱   18 card      ╲             │   anello: card fatte oggi / card di oggi
│      │    ~22′          │            │   (scadenza + nuove ammesse)
│       ╲  di 30′        ╱             │
│        ╰──────────────╯              │
│   ● ● ● ● ○ ○ ○   4 giorni su 5      │   ritmo settimanale (§6.1)
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🟧 Riascolto finale pronto        │ │   al massimo UN invito in evidenza,
│ │ «Paper Lanterns» · 7 giorni      │ │   scelto per priorità (§5.1.1)
│ └──────────────────────────────────┘ │
│                                      │
│ Le tue canzoni            2 di 4  ＋ │
│ ┌────┐ ┌────┐ ┌────┐                 │   carosello orizzontale di copertine
│ │ ▒▒ │ │ ▒▒ │ │ ＋ │                 │   con anello di avanzamento sul bordo
│ └────┘ └────┘ └────┘                 │
│ Paper   Salt                         │
│ ●●●○○○  ●○○○○○                       │   tappe del percorso (§5.3)
│                                      │
│ [▶  Inizia il giro              ]    │   CTA unica, sempre in basso
└──────────────────────────────────────┘
│  Oggi      Canzoni      Lessico      │
```

- **Anello del giorno**: un solo numero grande (card di oggi), sotto i minuti stimati sul timer. Si riempie man mano che si ripassa; a fine giornata diventa pieno con un breve impulso (unico momento animato di Oggi).
- **Stati dell'anello** (sostituiscono le note di oggi, con lo stesso significato):
  - pieno + «Fatto per oggi» → nessuna card resta;
  - parziale + «Restano 6 card» → sessione chiusa con card che tornano;
  - tratteggiato + «Card nuove in pausa: il ripasso supera i 30′» → `newBlockedByLoad`;
  - vuoto + «Niente da ripassare» → coda vuota; la CTA diventa l'azione che porta card (Smista, Apri lo Studio, Aggiungi canzone), con la stessa logica della Sessione vuota.
- **Invito in evidenza**: una sola card, in quest'ordine di priorità: frasi da correggere → riascolto finale pronto → parole da smistare → canzone «Da studiare». Gli altri inviti restano raggiungibili dalla copertina della canzone. Così Oggi non diventa una lista di compiti.
- **Carosello delle canzoni**: copertina (§7.2), titolo, 6 pallini del percorso. Toccare apre la pagina della canzone. La card «＋» passa dal controllo di sblocco come oggi; al limite di 4 sparisce e il titolo dice «4 di 4».
- Le canzoni completate con parole da smistare non stanno nel carosello: compaiono come invito in evidenza («Ti restano 3 parole da smistare in “Salt”»).

#### 5.1.1 Testi che restano
Le frasi lunghe di oggi non spariscono: diventano il testo accessibile dell'anello (`aria-label`) e un piccolo «Perché?» che apre un foglio con la spiegazione completa. Il comportamento e i conteggi restano quelli di `buildSessionQueue`, `itemsInSong`, `pendingWords`.

### 5.2 Sessione → ritmo e fine che racconta

**Durante**
- In alto, al posto della barra sottile: una **fila di segmenti**, uno per card, che si colorano con il voto (Bene/Facile pieno, Difficile a metà, Di nuovo vuoto con bordo). Si vede il ritmo, non solo la posizione.
- La card mostra **la copertina in piccolo** e il colore della canzone sul bordo sinistro: si ricorda da dove viene il verso.
- Il **momento firma** esistente (chunk che si riempie come karaoke nella Riconosci) resta e si estende: quando si rivela il significato, la traduzione del verso appare sotto in dissolvenza, così il chunk torna dentro la frase.
- **Serie silenziosa**: dopo 5 risposte di fila senza «Di nuovo», il segmento corrente brilla una volta. Nessun numero, nessuna penalità quando si interrompe.
- Card Completa: risposta esatta → la parola scritta si "aggancia" nel buco con una molla breve (`--ease-spring`); errore di battitura → la lettera diversa si sottolinea.

**Fine sessione → «Versi sbloccati»**

```
┌──────────────────────────────────────┐
│            ✓  Fatto per oggi         │
│                                      │
│   Oggi hai sbloccato 3 versi         │
│                                      │
│ ┃ 🟧 Paper Lanterns                  │
│ ┃ "we kept the light on for a while" │   verso con il chunk evidenziato,
│ ┃  abbiamo tenuto la luce accesa…    │   e la traduzione sotto
│ ┃ 🟦 Salt                            │
│ ┃ "I'll get over it by spring"       │
│ ┃ ...                                │
│                                      │
│  24 ripassate · 8 nuove · 2 frasi    │   il conteggio resta, in secondo piano
│  ● ● ● ● ● ○ ○  5 giorni su 5 ✓      │
│                                      │
│ [   Torna a Oggi                ]    │
└──────────────────────────────────────┘
```

- Un **verso sbloccato** è un verso di una canzone in cui *tutte* le voci evidenziate hanno superato la prima memorizzazione (§8.2). La fine sessione mostra quelli passati a "sbloccato" grazie alla sessione appena fatta.
- Se nessun verso si è sbloccato, si mostrano **le voci più forti di oggi** (le 3 con stabilità FSRS cresciuta di più): c'è sempre qualcosa di concreto da guardare, mai un elenco vuoto.
- Restano le regole di oggi: «Sessione finita · N card ancora da fare oggi», il pulsante «Correggi le frasi».

### 5.3 Pagina della canzone → il percorso a tappe

Unisce in testa allo Studio le fasi già presenti in spec §2, rese come un percorso orizzontale:

```
 Ascolto ── Analisi ── Studio ── Smista ── Ripasso ── Riascolto
   ●           ●          ●         ◐         ○           ○
  45%                           3 da fare   9 di 14    tra 3 giorni
```

- Copertina grande in testa (con titolo e artista sopra in Bricolage), pulsante Spotify, sotto il percorso.
- Ogni tappa è toccabile e porta alla sua azione (Smista, Ritornello, Riascolto finale) solo quando è disponibile; altrimenti dice quando lo sarà («tra 3 giorni»).
- **Testo vivo**: le righe sbloccate diventano piene (`--text`), quelle ancora in studio restano più tenui (`--text-2`) con le evidenziazioni di sempre. Scorrendo, la canzone si "accende" verso dopo verso man mano che la si impara. È il ponte visivo fra ripasso e canzone.
- **Lettura a tempo** (pulsante «Leggi a tempo», nella tappa Studio; deciso: fa parte di questo redesign). Route `#/songs/:id/read`.
  - Si apre Spotify con il pulsante in testa, poi si legge il testo **una riga alla volta**, grande (Bricolage 28 px), con la riga dopo in anteprima tenue sotto. Si avanza toccando la metà destra dello schermo (o con lo spazio/freccia), si torna indietro toccando la metà sinistra. Nessun audio nell'app e nessuna sincronizzazione automatica: il tempo lo dà chi canta.
  - Nella riga corrente le voci hanno i colori di sempre; toccare una voce mostra il significato in una nuvoletta, senza uscire.
  - Le righe vuote del testo si saltano; le righe ripetute (`chorusLines`) mostrano un piccolo segno «ritornello».
  - Alla fine: «Letta tutta» salva `songs.readAlongAt` e torna alla pagina della canzone; ✕ esce senza salvare. La tappa Studio del percorso mostra la data dell'ultima lettura.
  - Il **Ritornello a voce** esistente resta, raggiungibile dalla stessa schermata («Solo il ritornello»): copre le righe del ritornello come oggi.
  - Su un testo libero il pulsante si chiama «Leggi riga per riga» e non mostra Spotify.
  - Lo schermo resta acceso (Screen Wake Lock) durante la lettura e si rilascia uscendo, come nella sessione.
  - Accessibilità: la riga corrente è in una regione `aria-live="polite"`; i comandi avanti/indietro sono anche due pulsanti da 44 px in basso.
- Le azioni secondarie (Modifica, Chiedi a Gemini, Segna come completata, Elimina) scendono in un menu «⋯», tranne «Chiedi a Gemini» che resta un pulsante fluttuante nello Studio.

### 5.4 Canzoni → scaffale
Griglia di copertine 2 colonne: prima le aperte (con anello), poi «Completate» con il guadagno del riascolto finale come etichetta («+28»). La variante testo libero usa una copertina tipografica con l'icona della fonte (serie, podcast, articolo).

### 5.5 Lessico → collezione
- In testa una **striscia di composizione**: barra divisa per tipo di espressione con i colori esistenti (phrasal verb blu, idiomi arancio, collocazioni verde, slang viola, parole neutre). Si tocca un tratto per filtrare.
- Ogni riga mostra un piccolo **indicatore di forza** (3 tacche: nuova, in apprendimento, attiva) derivato dallo stato già calcolato in `lexicon()`.
- Vista alternativa «Per canzone»: le voci raggruppate sotto la copertina della loro canzone di casa.

### 5.6 Progressi → «Diario»
- Si raggiunge anche toccando l'anello del giorno o il ritmo settimanale, non solo dall'icona.
- In testa un **calendario a griglia** delle ultime 12 settimane: ogni quadrato è un giorno, l'intensità è il numero di ripassi (5 livelli, colore `--accent` su `--surface-2`). Tabella equivalente per lo screen reader.
- Poi, in ordine: comprensione al primo ascolto (il grafico di oggi), **versi sbloccati in totale**, lessico attivo, memoria reale, guadagno medio, carico, vocabolario stimato, verso il livello successivo.
- I «—» senza dati restano, con la frase che dice cosa fare.

---

## 6. Meccaniche di coinvolgimento

Ogni meccanica ha una fonte nei dati esistenti e una regola contro l'abuso.

### 6.1 Ritmo settimanale (al posto della serie giornaliera)
- **Cosa**: pallini lun–dom della settimana corrente; un giorno è "attivo" se ha almeno un ripasso (`reviews.reviewedAt`, giorno locale) **oppure** se quel giorno la coda era vuota (vedi sotto). Obiettivo predefinito **5 giorni su 7**, regolabile 3–7 nelle Impostazioni.
- **Perché non la serie giornaliera**: con FSRS ci sono giorni legittimamente senza scadenze; una serie che si rompe punirebbe l'utente senza colpa e spingerebbe a fare card inutili.
- **Giorno senza scadenze**: alla prima apertura di un giorno con coda vuota si salva il giorno come "libero" (`settings.freeDays`, solo date). Conta come attivo. Se l'app non si apre, non si sa e il giorno resta vuoto: accettato.
- **Raggiunto l'obiettivo**: il cerchio della settimana si chiude con un breve impulso, una volta. Nessun premio ulteriore.
- **Mancato**: nessun messaggio. La settimana nuova riparte.

### 6.2 Versi sbloccati
Vedi §8.2 per la regola. Appare in fine sessione, nella pagina della canzone (testo vivo), in Progressi e come **unico numero di avanzamento** delle canzoni (deciso): in Oggi, Canzoni e nella tappa Ripasso del percorso, «X di Y chunk e parole nel ripasso» diventa «9 di 14 versi sbloccati», e l'anello della copertina segue lo stesso rapporto. Il conteggio delle voci resta solo nello Studio (in testa, come oggi) e nel foglio di sblocco, dove serve per decidere. I casi speciali di oggi restano con le stesse parole: «N parole da smistare», «Da studiare», «nessuna voce da ripassare», voci sospese nel Lessico; una canzone con voci ma nessuna ancora in Review dice «0 di 14 versi sbloccati». Anche il riepilogo del Riascolto finale, che oggi conta «N di M chunk e parole nel ripasso come Oggi», passa ai versi sbloccati, così le due schermate restano d'accordo.

### 6.3 Traguardi rari
Pochi, legati al metodo, mostrati una volta come foglio dal basso e poi elencati in Progressi:
- Prima canzone con tutti i versi sbloccati.
- Primo riascolto finale con guadagno ≥ 20 punti.
- 50, 150, 500 voci attive (150 coincide con la soglia di livello di `LEVEL_UP`).
- Prima settimana con l'obiettivo di ritmo raggiunto; 4 settimane di fila.
- Livello successivo raggiungibile (già previsto: qui diventa un momento visibile).

Regola: un traguardo si calcola dai dati (non si "assegna" con eventi), così un backup importato li ricostruisce. Si salva solo la data in cui è stato mostrato (`settings.milestonesSeen`).

### 6.4 Cosa non si fa (di proposito)
- Nessuna notifica push di richiamo, nessun «Hai perso la serie!».
- Nessun bonus per superare `newPerDay` o il timer; la modalità intensiva resta una scelta esplicita nel foglio di sblocco.
- Nessuna classifica, nessun confronto con altri, nessuna valuta interna.
- Nessun suono.

---

## 7. Sistema visivo

### 7.1 Gerarchia
- **Display**: Bricolage Grotesque 700, 40–56 px per il numero dell'anello e i titoli delle canzoni nella pagina della canzone (l'asse `opsz` fino a 96 lo permette già).
- Titoli di pagina 28 px, sezioni 13 px maiuscoletto `--muted` (come le `section-label` di oggi).
- Testo dei versi in Inter Tight 500, 20 px nella sessione, 17 px nello Studio.
- JetBrains Mono solo per il timer e i minuti: i conteggi principali passano a Bricolage per essere più caldi.

### 7.2 Copertine delle canzoni
Deciso: **prima la copertina di Spotify, altrimenti quella generata.**
- **Spotify**: l'oEmbed già chiamato in Aggiungi canzone e in Modifica (spec §9) restituisce anche `thumbnail_url`; si salva in `songs.coverUrl` insieme al titolo. Nessuna API nuova, nessuna autenticazione. L'immagine si mostra con un normale `<img>` (non serve CORS) e il service worker la tiene in una cache a parte (cache-first, al massimo 60 immagini, 90 giorni), così resta visibile offline dopo la prima volta.
- **Generata**, in tutti gli altri casi: oEmbed fallito (CORS, rete, offline), canzone senza link, testo libero, immagine che non si carica (evento `error` dell'immagine → si passa alla generata senza riprovare in quella vista). Ogni canzone ha una **tinta** scelta in modo stabile dall'id fra 6 tinte nuove nei token, un motivo semplice (onde, cerchi o righe, scelto anche lui dall'id) e le iniziali del titolo in Bricolage. La tinta si usa sempre (bordo nella sessione, testata della canzone), anche quando la copertina è quella di Spotify.
- Canzoni salvate prima: la copertina di Spotify arriva alla prossima Modifica del link oppure, se online, con un solo tentativo silenzioso all'apertura della pagina della canzone; se fallisce resta la generata e non si riprova più in quella sessione dell'app.
- **Nuovi token** (scuro/chiaro, da aggiungere a `tokens.css` e `docs/design.md`): `--song-1` … `--song-6` e i rispettivi `--song-N-tint`. Scelti per non confondersi con i colori dei tipi di espressione (blu, arancio, verde, viola): per esempio rosa, ocra, ciano, salvia, prugna, ardesia. Contrasto verificato per il testo sopra in entrambi i temi.

### 7.3 Superfici e profondità
- Card più ariose: raggio 20 px per le card principali (oggi 12–16), 24 px per i fogli come oggi.
- Una sola ombra morbida per la card della sessione e il foglio in primo piano; il resto piatto.
- La tinta della canzone si usa al 12–16% come sfondo della testata della pagina della canzone, mai sul testo.

### 7.4 Movimento (aggiunte a `motion.css`)
| Momento | Gesto | Durata | Con riduzione del movimento |
| --- | --- | --- | --- |
| Anello che si riempie dopo una sessione | ritorno a Oggi | `--t-slow` | stato finale |
| Verso che si "accende" nello Studio | apertura dopo un nuovo sblocco | `--t-med`, una riga alla volta | stato finale |
| Segmento di voto in sessione | voto | `--t-fast` | colore senza scala |
| Traguardo | foglio dal basso | `--t-med` + impulso unico | foglio senza impulso |

Restano valide le regole esistenti: il movimento risponde ai gesti, la barra in basso resta ferma.

### 7.5 Vibrazione
Vibrazione brevissima (dove disponibile) solo su: risposta esatta nella Completa, chiusura dell'anello, traguardo. Disattivabile nelle Impostazioni con un solo interruttore «Vibrazione».

---

## 8. Impatto sul dominio (descrizione, non codice)

Regola di `docs/design.md`: ogni numero si calcola in un solo punto. Le funzioni nuove sono pure, con `now: Date` iniettato.

### 8.1 Funzioni nuove
| Funzione (modulo) | Calcola | Usata da |
| --- | --- | --- |
| `todayRing` (`domain/queue`) | card fatte oggi, card di oggi, minuti stimati, stato dell'anello | Oggi, fine sessione |
| `weekRhythm` (`domain/rhythm`) | giorni attivi della settimana, obiettivo, raggiunto sì/no | Oggi, fine sessione, Progressi |
| `unlockedLines` (`domain/songItems`) | per canzone: versi con voci, versi sbloccati | Oggi, Studio, Canzoni, fine sessione, Progressi |
| `newlyUnlocked` (`domain/songItems`) | versi sbloccati da una sessione (confronto prima/dopo i suoi ripassi) | fine sessione |
| `dailyActivity` (`domain/progress`) | ripassi per giorno, ultime 12 settimane | Diario |
| `milestones` (`domain/milestones`) | traguardi raggiunti e data, dai dati | Progressi, foglio del traguardo |
| `songHue` (`ui/`) | indice 1–6 della tinta e del motivo dall'id | tutte le copertine |
| `featuredInvite` (`domain/`) | l'unico invito in evidenza di Oggi, per priorità | Oggi |

### 8.2 Regola del verso sbloccato
Un verso di una canzone è **sbloccato** quando ha almeno una voce (chunk o parola in studio, non sospesa, con un contesto su quella riga) e **ogni** sua voce ha la card R fuori dallo stato New e Learning (cioè in Review) e l'ultimo voto della R diverso da «Di nuovo». Le parole note non contano (sono già capite); i versi senza voci non compaiono nel conteggio. Un verso può tornare "non sbloccato" se una voce viene dimenticata: il testo vivo lo mostra di nuovo tenue, senza avvisi.

### 8.3 Dati nuovi
Senza nuove tabelle e senza migrazioni dei dati esistenti:
- In `settings`: `rhythmGoal: number` (predefinito 5), `freeDays: string[]` (date `YYYY-MM-DD`, si tengono solo le ultime 12 settimane), `milestonesSeen: Record<string, Date>`, `haptics: boolean`.
- In `songs`, campi facoltativi (le righe di prima restano valide senza migrazione): `coverUrl?: string | null` (copertina di Spotify) e `readAlongAt?: Date | null` (ultima lettura a tempo completata, §5.3).
Il backup li esporta già (tutte le tabelle tranne la chiave).

---

## 9. Accessibilità
- Anello, ritmo, segmenti e calendario hanno sempre il testo equivalente (`aria-label` o tabella nascosta), come il grafico di Progressi oggi.
- Il colore non è mai l'unica informazione: i segmenti di voto usano anche il riempimento (pieno, metà, vuoto), le tacche di forza sono 1–3, i pallini del ritmo hanno la spunta.
- Il testo vivo dello Studio mantiene un contrasto AA anche per le righe tenui (`--text-2` su `--bg` lo rispetta in entrambi i temi).
- Il carosello di Oggi si scorre anche da tastiera e ogni copertina è un link con il titolo come nome.

---

## 10. Come si misura (personale, senza tracciamento esterno)
Nessuna analitica: i dati ci sono già in IndexedDB. Dopo 4 settimane si confronta con le 4 precedenti:
- giorni attivi a settimana;
- sessioni chiuse con «Fatto per oggi» rispetto a quelle abbandonate;
- canzoni arrivate al riascolto finale;
- memoria reale (non deve scendere: se scende, il redesign sta spingendo a fare in fretta).

---

## 11. Decisioni prese (5 novembre 2026)
1. **Copertine**: quella di Spotify dall'oEmbed; se non si riesce a prenderla o a caricarla, quella generata (§7.2).
2. **Obiettivo del ritmo**: 5 giorni su 7, regolabile 3–7 (§6.1).
3. **Numero delle canzoni**: «versi sbloccati» al posto di «chunk e parole nel ripasso» (§6.2).
4. **Lettura a tempo**: dentro questo redesign (§5.3).

---

## 12. Rilascio a fasi
Ogni fase è utilizzabile da sola e avrà il suo piano in `docs/superpowers/plans/`.

1. **Base visiva**: token delle tinte, copertine (Spotify con ripiego sulla generata, cache del service worker), gerarchia tipografica, raggi. Nessun cambio di comportamento.
2. **Oggi «Il tuo giro»**: anello, invito unico, carosello, foglio «Perché?».
3. **Versi sbloccati**: regola nel dominio, testo vivo nello Studio, fine sessione nuova, numero nelle copertine.
4. **Ritmo settimanale e Diario**: `weekRhythm`, calendario, impostazione dell'obiettivo.
5. **Sessione**: segmenti di voto, serie silenziosa, aggancio della Completa, vibrazione.
6. **Percorso della canzone, Scaffale, Collezione**: tappe nello Studio, Canzoni a griglia, Lessico con composizione e forza.
7. **Lettura a tempo e traguardi**.

Test previsti per ogni fase, secondo le regole del progetto: test unitari delle funzioni pure (con `now` iniettato e testi inventati), test dei componenti per gli stati dell'anello e della fine sessione, un test end-to-end del giro completo (Oggi → sessione → versi sbloccati → Oggi con anello pieno).
