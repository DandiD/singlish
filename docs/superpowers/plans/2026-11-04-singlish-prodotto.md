# Singlish da MVP a prodotto — piano

Obiettivo: un'app completa da usare ogni giorno, non più un MVP. Si lavora su `main`, un task alla volta, con TDD e un commit per task. Ogni schermata nuova segue il suo disegno nel canvas (https://claude.ai/artifact/6wE9aRMt77EJmgR2gFwgZx) e passa le prove nel browser (Chromium e WebKit, 360–1440 px, axe, temi chiaro e scuro).

## Fase 1 — Fondamenta del prodotto
1. **Chiave Gemini solo in sviluppo.** `VITE_GEMINI_API_KEY` si legge solo con `npm run dev`; `npm run build` non la contiene mai (prova sul file costruito).
2. **Elimina canzone.** In Canzoni e nello Studio, con conferma. Toglie la canzone, le voci solo sue con le loro card e le parole da smistare; le voci condivise perdono solo il verso di questa canzone. I ripassi restano come storico.
3. **Sospensione reversibile.** Nella scheda «Sospesa» diventa «Riattiva»; le voci sospese si ritrovano nel Lessico.

## Fase 2 — Lessico e Progressi (canvas: Lexicon, Progress)
4. **Lessico** (`#/lexicon`, terza scheda della barra, non più «Presto»): conteggio chunk e parole, ricerca in inglese e in italiano, filtri (Tutti, B1, B2, C1, Attivi, Solo canzone, Parole, Tema), riquadro «Aree scoperte» per tema, righe con colore del tipo, significato, canzone (o «N canzoni»), livello e stato (nuovo, impara, attivo, sospeso). Ogni riga apre la scheda della voce.
5. **Progressi** (`#/progress`, da Oggi): comprensione al primo ascolto per canzone (grafico), lessico attivo, memoria reale contro obiettivo, guadagno medio per canzone (dal riascolto finale), carico dei prossimi 7 giorni, avanzamento verso il livello successivo.

## Fase 3 — Ciclo completo di una canzone (canvas: FinalListen, AddText, Unlock)
6. **Riascolto finale** dopo ≥ 7 giorni di studio: Oggi lo propone, si segna la % capita dopo; il guadagno entra in Progressi.
7. **Testi liberi:** Aggiungi testo (non canzone), stessa analisi senza parlato connesso.
8. **Sblocco della canzone successiva** (canvas Unlock): prima di aggiungere, se le canzoni in corso hanno voci fuori dal ripasso o il carico supera il tetto, un foglio lo spiega; «Sblocca lo stesso», «Aspetto», modalità intensiva (25 nuove al giorno per 7 giorni).

## Fase 4 — Chiedere a Gemini dal testo (richiesta dell'utente)
9. **Selezione multipla nel testo:** nello Studio si toccano più parole o espressioni non estratte; un contatore mostra quante; «Chiedi a Gemini» le invia tutte in una sola chiamata (traduzione, significato, spiegazione, esempio, tipo, livello). L'app invita a leggere prima tutto il testo e a segnare tutto, così si spende una chiamata sola. Le voci tornano come chunk o parole normali, con le loro card.

## Fase 5 — Card e allenamenti in più (canvas: CardA, CardP, Feedback, CardNuance, Expand, Chorus, VocabTest, VocabResult)
10. Card P (produzione con correzione di Gemini e feedback), card A (ascolto), sfumature.
11. Espandi (famiglie di parole e varianti) e ritornello guidato.
12. Test di vocabolario e risultato (stima del vocabolario, in Progressi).

## Regole che restano
Quelle di `CLAUDE.md`: testi inventati nei test, tempo iniettato, niente rete nei test, colori dai token, bersagli ≥ 44 px, chiave Gemini solo in IndexedDB.
