# public/freq.json

I 20.000 lemmi inglesi più frequenti (solo parole fatte di lettere), in ordine di rango.

Fonte: wordfreq 3.1.1 di Robyn Speer, lista `best` per l'inglese — https://github.com/rspeer/wordfreq
Licenza dei dati: Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) — https://creativecommons.org/licenses/by-sa/4.0/
Anche questa lista derivata è distribuita con la stessa licenza.

Rigenerare: `pip install wordfreq`, poi esportare `top_n_list('en', 40000, wordlist='best')` filtrando le parole di sole lettere
in un TSV `lemma<TAB>rango` e lanciare `node scripts/build-freq.mjs <file.tsv> --top 20000`.
