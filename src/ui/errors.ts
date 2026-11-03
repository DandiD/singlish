import { GeminiError } from '../domain/gemini/client'
import { DEFAULT_SETTINGS } from '../domain/settings'

/** Un errore spiegato all'utente: cosa è successo (titolo), perché e cosa fare (testo), e dove rimediare. */
export type Problem = { title: string; text: string; fix?: 'settings' | 'retry' }

export function geminiProblem(e: unknown, model: string): Problem {
  const storage = storageProblem(e)
  if (storage) return storage
  if (!(e instanceof GeminiError)) {
    return { title: 'Analisi non riuscita', text: 'Qualcosa si è interrotto a metà. Riprova tra poco.', fix: 'retry' }
  }
  switch (e.code) {
    case 'no_key':
      return { title: 'Manca la chiave Gemini', text: 'Aggiungila in Impostazioni, poi riprova.', fix: 'settings' }
    case 'bad_key':
      return {
        title: 'La chiave Gemini non funziona',
        text: 'Google l\'ha rifiutata. Controlla di averla copiata intera da Google AI Studio, o creane una nuova.',
        fix: 'settings',
      }
    case 'bad_model':
      return {
        title: `Il modello «${model}» non esiste`,
        text: `Controlla il nome in Impostazioni, o rimetti quello predefinito: ${DEFAULT_SETTINGS.model}.`,
        fix: 'settings',
      }
    case 'blocked':
      return {
        title: 'Gemini non ha analizzato questo testo',
        text: 'L\'hanno fermato i filtri di Gemini sui contenuti. Riprova; se succede ancora, prova con un\'altra canzone.',
        fix: 'retry',
      }
    case 'bad_json':
      return { title: 'Risposta di Gemini incompleta', text: 'Capita ogni tanto. Riprova.', fix: 'retry' }
    case 'rate_limited':
      return {
        title: 'Gemini è occupato',
        text: 'Hai raggiunto il limite di richieste gratuite, o il servizio è sovraccarico. Riprova tra qualche minuto.',
        fix: 'retry',
      }
    case 'network':
      return { title: 'Gemini non risponde', text: 'Controlla la connessione e riprova.', fix: 'retry' }
    case 'http':
      if ((e.status ?? 0) >= 500) {
        return {
          title: 'Gemini non risponde',
          text: `Il servizio ha un problema (errore ${e.status}). Riprova tra qualche minuto.`,
          fix: 'retry',
        }
      }
      return {
        title: 'Gemini ha rifiutato la richiesta',
        text: `Errore ${e.status ?? 'sconosciuto'}. Riprova; se succede ancora, controlla il modello in Impostazioni.`,
        fix: 'retry',
      }
  }
}

const OPEN_FAILURES = [
  'OpenFailedError', 'MissingAPIError', 'DatabaseClosedError', 'InvalidStateError', 'VersionError', 'UpgradeError',
  'SecurityError', // Safari con i dati dei siti bloccati
  'UnknownError', // Safari che perde la connessione al database
]

/** Errori di IndexedDB (anche avvolti da Dexie in `inner`): spazio pieno o database che non si apre. */
export function storageProblem(e: unknown): Problem | null {
  const names: string[] = []
  for (let x = e as { name?: unknown; inner?: unknown } | null, i = 0; x && i < 4; x = x.inner as typeof x, i++) {
    if (typeof x.name === 'string') names.push(x.name)
  }
  if (names.includes('QuotaExceededError')) {
    return {
      title: 'Spazio esaurito',
      text: 'Il telefono non ha più spazio per i dati dell\'app. Libera spazio e riprova.',
    }
  }
  if (names.some((n) => OPEN_FAILURES.includes(n))) {
    return {
      title: 'Non riesco ad aprire i dati dell\'app',
      text: 'Il browser non dà spazio all\'app: succede in navigazione privata o con i dati dei siti bloccati. Apri Singlish in una finestra normale.',
    }
  }
  return null
}

/** «Canzone non salvata. Riprova.» — o, se il motivo è noto, «… Spazio esaurito: il telefono …». */
export function failedMessage(what: string, e: unknown): string {
  const p = storageProblem(e)
  if (!p) return `${what}. Riprova.`
  return `${what}. ${p.title}: ${p.text.charAt(0).toLowerCase()}${p.text.slice(1)}`
}

/** Testo breve per un'azione che non è andata a buon fine (un salvataggio, un voto, una conferma). */
export function actionMessage(e: unknown): string {
  const p = storageProblem(e)
  if (p) return `${p.title}. ${p.text}`
  return 'Non salvato. Riprova; se succede ancora, chiudi e riapri l\'app.'
}
