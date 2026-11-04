# Singlish

Impara l'inglese dalle canzoni che ascolti. Incolli il testo di una canzone (o di una serie, un podcast, un articolo), Gemini estrae le espressioni e le parole utili al tuo livello, e l'app te le fa ripassare ogni giorno con FSRS, un algoritmo di ripetizione dilazionata.

È una web app installabile sul telefono (PWA). Non ha un server: tutti i tuoi dati restano nel browser del telefono. L'unica cosa che esce è il testo che mandi a Gemini per l'analisi, con la tua chiave.

---

## Indice

1. [Aprire l'app sul telefono](#1-aprire-lapp-sul-telefono)
2. [Installarla sul telefono](#2-installarla-sul-telefono)
3. [Creare la chiave Gemini](#3-creare-la-chiave-gemini)
4. [Prima configurazione](#4-prima-configurazione)
5. [Aggiungere una canzone](#5-aggiungere-una-canzone)
6. [Smistare le parole e studiare la canzone](#6-smistare-le-parole-e-studiare-la-canzone)
7. [Il ripasso di ogni giorno](#7-il-ripasso-di-ogni-giorno)
8. [Quando passare alla canzone successiva](#8-quando-passare-alla-canzone-successiva)
9. [Lessico, Progressi e test di vocabolario](#9-lessico-progressi-e-test-di-vocabolario)
10. [Backup dei dati](#10-backup-dei-dati)
11. [Aggiornamenti](#11-aggiornamenti)
12. [Problemi frequenti](#12-problemi-frequenti)
13. [Pubblicarne una tua copia](#13-pubblicarne-una-tua-copia)
14. [Per chi sviluppa](#14-per-chi-sviluppa)
15. [Licenze e testi delle canzoni](#15-licenze-e-testi-delle-canzoni)

---

## 1. Aprire l'app sul telefono

L'app è già pubblicata. Non serve un computer.

1. Sul telefono apri **Chrome** (Android) o **Safari** (iPhone).
2. Vai a **[https://dandid.github.io/singlish/](https://dandid.github.io/singlish/)**.

Ti serve anche un **account Google**, per la chiave gratuita di Gemini ([punto 3](#3-creare-la-chiave-gemini)).

## 2. Installarla sul telefono

Installata, Singlish si apre dall'icona sulla Home, a schermo intero, e funziona anche senza rete (l'analisi con Gemini aspetta la connessione).

- **Android (Chrome)**: in **Oggi** compare il riquadro «Installala»: tocca **Installa**. Se non c'è, menu ⋮ del browser → «Installa app» (o «Aggiungi a schermata Home»).
- **iPhone (Safari)**: tocca il pulsante **Condividi** di Safari → «Aggiungi alla schermata Home».

Le istruzioni sono anche nelle **Impostazioni**, sezione **App**. Lì trovi pure **Condividi app**, per mandare il link a qualcuno.

**Importante:** i tuoi dati restano nel browser con cui hai aperto l'app. Se la apri da un altro browser o da un altro indirizzo, la trovi vuota. Per spostare i dati usa il [backup](#10-backup-dei-dati).

## 3. Creare la chiave Gemini

L'app usa Gemini (di Google) per analizzare i testi. Ti serve una chiave personale:

1. Apri [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e accedi con il tuo account Google.
2. Tocca **«Create API key»** (Crea chiave API) e copia la chiave.
3. Nell'app: dalla schermata **Oggi**, tocca l'icona dell'ingranaggio (**Impostazioni**).
4. Incolla la chiave nel campo **Chiave API** e tocca **Prova**.
5. Se compare **«Chiave valida, salvata.»** sei a posto.

La chiave si salva **solo** quando «Prova» riesce, e resta sul telefono: non finisce nel backup e non va da nessun'altra parte.

Il modello predefinito è `gemini-flash-lite-latest`; puoi cambiarlo nel campo **Modello** delle Impostazioni.

Con il piano gratuito di Gemini, Google può usare i testi che invii per migliorare i suoi servizi. Leggi le condizioni su [ai.google.dev](https://ai.google.dev/gemini-api/terms).

## 4. Prima configurazione

Nelle **Impostazioni**:

| Campo | Cosa fa | Valore iniziale |
|---|---|---|
| Livello | B1, B2 o C1: decide quali parole ti propone | B1 |
| Nuove al giorno | Quante card nuove entrano ogni giorno | 16 |
| Memoria obiettivo | Quanto vuoi ricordare (0,85–0,95): più alto, più ripassi | 0,90 |
| Timer Studio / Ripasso | Minuti per sessione | 15 / 30 |
| Tema | Automatico, chiaro o scuro | Automatico |

I campi si salvano da soli quando li lasci. Per una scelta più precisa delle parole, fai il **test di vocabolario** (vedi [punto 9](#9-lessico-progressi-e-test-di-vocabolario)).

## 5. Aggiungere una canzone

1. Vai su **Canzoni** (barra in basso) e tocca **Aggiungi**.
2. **1 · Link Spotify** (facoltativo): incolla il link del brano (in Spotify: ⋯ → Condividi → Copia link). Il titolo arriva da solo.
3. **2 · Ascoltala senza testo**: ascolta la canzone e indica con il cursore quanto hai capito. Serve per misurare i progressi alla fine.
4. **3 · Incolla il testo**: incolla il testo della canzone.
5. Tocca **Analizza con Gemini**. Dopo qualche secondo vedi l'esito.

Se sei offline o Gemini è occupato, la canzone resta **in coda** e viene analizzata alla prossima apertura dell'app (oppure tocca **Analizza ora** in Canzoni).

Puoi tenere **al massimo 4 canzoni o testi aperti** insieme. Per aggiungerne un altro, segnane uno come completato o eliminalo.

**Testi che non sono canzoni** (serie, podcast, articoli): in Canzoni tocca **Aggiungi testo**. Funziona allo stesso modo, senza la parte sulla pronuncia del canto.

## 6. Smistare le parole e studiare la canzone

Dopo l'analisi:

- **Studiala ora** ti porta allo **Smista**: per ogni parola scegli **La so** oppure **Da imparare**, poi **Conferma**. Solo quelle «da imparare» entrano nel ripasso.
- **Tienila per più avanti** la lascia tra le «Da studiare»: le sue card entrano nel ripasso solo quando apri lo Studio.

Nello **Studio** di una canzone:
- il testo ha le espressioni e le parole evidenziate: tocca una voce per aprire la sua **scheda** (significato, spiegazione, esempio);
- dalla scheda puoi **Modifica**, **Sospendi** (la togli dal ripasso, la ritrovi nel Lessico), **Escludi** (la togli del tutto) ed **Espandi** (Gemini propone parole della stessa famiglia, collocazioni, contrari e sfumature);
- **Chiedi a Gemini**: segna nel testo tutte le parole o frasi che vuoi capire, poi una sola richiesta le spiega e le aggiunge al ripasso;
- **Ritornello a voce**: ripeti il ritornello nascondendo le righe una alla volta;
- **Segna come completata**: chiude la canzone e libera un posto.

## 7. Il ripasso di ogni giorno

1. Apri l'app: la schermata **Oggi** dice quante card sono **in scadenza**, quante **nuove** e quanti minuti servono.
2. Tocca **Inizia sessione**.
3. Le card sono di cinque tipi:
   - **Riconosci**: vedi l'espressione nel verso, ricordi il significato, tocchi «Mostra significato» e ti dai un voto;
   - **Completa**: scrivi la parola che manca nel verso;
   - **Produci**: scrivi una tua frase in inglese con l'espressione;
   - **Ascolta**: il telefono legge il verso e tu lo scrivi;
   - **Sfumature**: scegli la parola giusta fra due o tre simili.
4. Il voto (**Di nuovo**, **Difficile**, **Bene**, **Facile**) decide quando la card tornerà. Le card sbagliate e quelle nuove tornano anche lo stesso giorno, dopo pochi minuti.
5. A fine sessione vedi **«Sessione finita»** con le card ancora da fare oggi, oppure **«Fatto per oggi»** se non resta nulla.

Le frasi scritte nelle card **Produci** si correggono tutte insieme: da **Oggi** (riquadro «Le tue frasi») o dalla fine della sessione, tocca **Correggi con Gemini**, controlla i voti proposti e tocca **Conferma i voti**.

Se il ripasso in scadenza supera i minuti del timer, l'app ferma le card nuove finché non lo smaltisci: Oggi lo dice.

## 8. Quando passare alla canzone successiva

Quando tocchi **Aggiungi** con canzoni ancora aperte, l'app controlla che:
- le voci delle canzoni aperte siano già nel ripasso e le parole siano state smistate;
- il ripasso dei prossimi 7 giorni stia nel tuo timer;
- ci sia un posto libero (massimo 4).

Se manca qualcosa, un foglio spiega cosa. Puoi aspettare oppure toccare **Sblocca lo stesso**. La **modalità intensiva** porta le nuove fino a 25 al giorno per 7 giorni.

Dopo **7 giorni** di studio di una canzone, Oggi propone il **Riascolto finale**: la riascolti senza testo, indichi quanto capisci adesso e vedi il guadagno rispetto al primo ascolto.

## 9. Lessico, Progressi e test di vocabolario

- **Lessico** (barra in basso): tutte le tue voci, con ricerca in inglese e in italiano, filtri per livello e stato, e le aree tematiche coperte.
- **Progressi** (icona del grafico in Oggi): comprensione canzone per canzone, lessico attivo, memoria reale, carico dei prossimi giorni, guadagno medio.
- **Test di vocabolario** (da Progressi): circa 80 parole, per ognuna tocchi **La conosco** o **Non la conosco**. Stima il tuo vocabolario e propone la **fascia di parole utile**; tocca **Aggiorna la fascia utile** per usarla.

## 10. Backup dei dati

I dati stanno **solo nel browser del telefono**. Se cancelli i dati del browser, disinstalli l'app o cambi telefono, li perdi senza un backup.

- **Esporta**: Impostazioni → **Esporta**. Salva o condividi il file `.json` (per esempio su Drive o via email a te stesso).
- **Importa**: Impostazioni → **Importa** e scegli il file. **Sostituisce** tutti i dati presenti con quelli del file.

La chiave Gemini non è nel backup: dopo un'importazione su un nuovo telefono va reinserita ([punto 3](#3-creare-la-chiave-gemini)).

Consiglio: esporta un backup ogni settimana.

## 11. Aggiornamenti

Ogni modifica pubblicata sul ramo `main` di GitHub arriva da sola all'indirizzo dell'app, in un paio di minuti.

Sul telefono, all'apertura successiva compare l'avviso di una nuova versione: tocca **Aggiorna**. Su iPhone l'avviso può comparire solo all'apertura dopo.

I tuoi dati non si perdono con un aggiornamento.

## 12. Problemi frequenti

| Problema | Cosa fare |
|---|---|
| «Manca la chiave Gemini» | Inserisci la chiave nelle Impostazioni e tocca Prova ([punto 3](#3-creare-la-chiave-gemini)). |
| «La chiave Gemini non funziona» | Ricopiala intera da AI Studio, o creane una nuova. |
| «Il modello … non esiste» | Nelle Impostazioni rimetti `gemini-flash-lite-latest` nel campo Modello. |
| «Gemini è occupato» | Hai raggiunto il limite gratuito o il servizio è carico: riprova tra qualche minuto. La canzone resta in coda. |
| L'app sul telefono è vuota | L'hai aperta da un altro browser o da un altro indirizzo: torna a quello di prima, o importa un backup. |
| Non compare «Installa app» | Usa Chrome su Android o Safari su iPhone, all'indirizzo `https://dandid.github.io/singlish/` ([punto 2](#2-installarla-sul-telefono)). |
| «Aggiungi» non c'è | Hai già 4 canzoni o testi aperti: segnane uno come completato o eliminane uno. |

## 13. Pubblicarne una tua copia

Per avere una tua versione dell'app a un indirizzo tuo:

1. Su GitHub, in questa pagina, tocca **Fork** e crea la copia nel tuo account.
2. Nella tua copia: **Settings** → **Pages** → in «Build and deployment», alla voce «Source» scegli **GitHub Actions**.
3. **Actions** → workflow «Pubblica su GitHub Pages» → **Run workflow**.
4. Dopo un paio di minuti l'app è su `https://<il-tuo-utente>.github.io/singlish/`.

Da lì in poi ogni push sul ramo `main` esegue i test e, se passano, ripubblica l'app.

Per provarla sul tuo computer invece serve **Node.js 22 o più recente** ([nodejs.org](https://nodejs.org)):

```bash
git clone https://github.com/DandiD/singlish.git
cd singlish
npm install
npm run dev
```

Poi apri l'indirizzo che compare nel Terminale (di solito `http://localhost:5173`).

## 14. Per chi sviluppa

Stack: Vite, Preact, TypeScript, Dexie (IndexedDB), ts-fsrs, zod, vite-plugin-pwa. Test con Vitest e Playwright.

```bash
npm run dev         # server di sviluppo
npm test            # test unitari
npm run test:e2e    # test end-to-end (Playwright)
npm run typecheck   # controllo dei tipi
npm run build       # versione da pubblicare in dist/
```

In sviluppo puoi mettere la chiave Gemini in `.env.local` (copia `.env.example`): viene letta **solo** con `npm run dev` e non finisce mai nel build. `npm run build` controlla che nessun segreto sia finito in `dist/`.

Documenti di progetto: `docs/spec.md` (cosa fa l'app), `docs/design.md` (schermate, regole di coerenza dei dati, comportamenti voluti).

## 15. Licenze e testi delle canzoni

- La lista di frequenza delle parole (`public/freq.json`) viene da [wordfreq](https://github.com/rspeer/wordfreq) ed è distribuita con licenza **CC BY-SA 4.0** (dettagli in `public/freq.LICENSE.md`).
- I testi delle canzoni sono protetti da diritto d'autore. L'app non ne contiene nessuno: li incolli tu, per tuo studio personale, e restano sul tuo telefono. Non pubblicare l'app con testi reali dentro, né screenshot con testi reali.
