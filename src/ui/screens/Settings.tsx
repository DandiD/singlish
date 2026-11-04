import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { href, onBack } from '../../router'
import { bandForLevel, getSettings, saveSettings } from '../../domain/settings'
import { formatNumber } from '../format'
import { callGemini, GeminiError } from '../../domain/gemini/client'
import { geminiProblem } from '../errors'
import { reportError } from '../report'
import { downloadOrShare, exportBackup, importBackup, isBackup } from '../../domain/backup'
import type { Level, Settings as SettingsRow } from '../../db/types'
import { useInstall } from '../../pwa/install'
import { applyTheme } from '../theme'
import { Icon } from '../components/Icon'
import { InstallCard } from '../components/InstallCard'
import { noAutocorrect } from '../noAutocorrect'

const THEMES: { value: SettingsRow['theme']; label: string }[] = [
  { value: 'auto', label: 'Automatico' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
]

/** Esito della prova della chiave: `tone` decide il colore, `text` è la frase per l'utente. */
type KeyStatus = { tone: 'idle' | 'running' | 'ok' | 'error'; text: string }
type Msg = { tone: 'ok' | 'error'; text: string } | null
const IDLE: KeyStatus = { tone: 'idle', text: '' }

export function Settings() {
  const { db, fetch, sleep, now } = useDeps()
  const settings = useLive(() => getSettings(db), [db])
  const [typedKey, setTypedKey] = useState('')
  const [typedModel, setTypedModel] = useState<string | null>(null)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(IDLE)
  const [probing, setProbing] = useState(false)
  // Mentre si trascina il cursore della memoria l'etichetta lo segue; si salva al rilascio.
  const [dragRetention, setDragRetention] = useState<number | null>(null)
  const [pending, setPending] = useState<unknown>(undefined)
  const [hasPending, setHasPending] = useState(false)
  const [backupMsg, setBackupMsg] = useState<Msg>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const install = useInstall()

  // Il valore trascinato resta finché quello salvato non lo raggiunge: niente salto indietro al rilascio.
  const savedRetention = settings ? Math.round(settings.desiredRetention * 100) : null
  useEffect(() => {
    if (dragRetention !== null && dragRetention === savedRetention) setDragRetention(null)
  }, [dragRetention, savedRetention])

  if (!settings) return <main class="screen settings" aria-busy="true" />

  const model = typedModel ?? settings.model

  /**
   * Un campo numerico: un valore vuoto o non valido torna a quello salvato; uno fuori limite si ferma al limite.
   * Il campo mostra sempre il valore che è stato davvero salvato.
   */
  const numeric = (e: Event, current: number, min: number, max: number, apply: (n: number) => void) => {
    const input = e.currentTarget as HTMLInputElement
    const raw = input.value
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) {
      input.value = String(current)
      return
    }
    const v = Math.min(max, Math.max(min, Math.round(n)))
    input.value = String(v)
    if (v !== current) apply(v)
  }

  /** Ogni modifica si salva subito; se il salvataggio non riesce, l'avviso lo dice. */
  const store = (patch: Parameters<typeof saveSettings>[1]) => { saveSettings(db, patch).catch(reportError) }

  const setTheme = (theme: SettingsRow['theme']) => {
    applyTheme(theme)
    store({ theme })
  }

  const hasStored = settings.apiKey.trim() !== ''
  // Una chiave incollata porta spesso spazi o a capo: si prova e si salva senza.
  const effectiveKey = (typedKey.trim() !== '' ? typedKey : settings.apiKey).trim()

  const probe = async () => {
    if (!navigator.onLine) {
      const saved = await getSettings(db)
      const which = effectiveKey === saved.apiKey ? 'la chiave salvata non è stata provata' : 'la chiave non è stata provata né salvata'
      setKeyStatus({ tone: 'error', text: `Sei offline: ${which}. Il modello salvato è «${saved.model}».` })
      return
    }
    setKeyStatus({ tone: 'running', text: 'Provo la chiave…' })
    setProbing(true)
    // Si salva la chiave provata; se intanto nel campo è stato scritto altro, quel testo resta lì.
    const probed = effectiveKey
    const probedModel = model.trim() || settings.model
    const save = () => saveSettings(db, { apiKey: probed, model: probedModel }).then(() => {
      setTypedKey((cur) => (cur.trim() === probed ? '' : cur))
      setTypedModel(null)
    })
    try {
      await callGemini(
        {
          apiKey: probed,
          model: probedModel,
          system: 'Rispondi con {"ok": true}.',
          user: 'ping',
          schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } },
        },
        { fetch, sleep, retry: false },
      )
      await save()
      setKeyStatus({ tone: 'ok', text: 'Chiave valida, salvata.' })
    } catch (e) {
      const code = e instanceof GeminiError ? e.code : null
      try {
        // La chiave è stata accettata: Gemini ha risposto, anche se in modo strano o con il limite raggiunto.
        if (code === 'bad_json' || code === 'blocked') {
          await save()
          setKeyStatus({ tone: 'ok', text: 'Chiave valida, salvata.' })
        } else if (code === 'rate_limited') {
          await save()
          setKeyStatus({ tone: 'ok', text: 'Chiave salvata. Gemini però è occupato in questo momento: l\'analisi potrebbe dover aspettare qualche minuto.' })
        } else {
          const p = geminiProblem(e, probedModel)
          // Il modello si salva da solo come le altre preferenze (anche toccando Prova): si dice quale è salvato.
          const saved = await getSettings(db)
          // Provando la chiave già salvata non si salva nulla, ma la chiave salvata è proprio quella che non va.
          // Solo un rifiuto della chiave è colpa della chiave: per gli altri errori la chiave salvata non cambia.
          const keyNote = probed !== saved.apiKey ? 'La chiave non è stata salvata.'
            : code === 'bad_key' ? 'È la chiave salvata: sostituiscila con una che funziona.' : 'La chiave salvata non è cambiata.'
          setKeyStatus({ tone: 'error', text: `${p.title}. ${p.text} ${keyNote} Il modello salvato è «${saved.model}».` })
        }
      } catch (saveError) {
        reportError(saveError)
        setKeyStatus(IDLE)
      }
    } finally {
      setProbing(false)
    }
  }

  const doExport = async () => {
    try {
      await downloadOrShare(await exportBackup(db, now()))
      setBackupMsg(null)
    } catch {
      setBackupMsg({ tone: 'error', text: 'Esportazione non riuscita. Riprova.' })
    }
  }

  const NOT_BACKUP = 'Questo file non è un backup di Singlish. Scegli il file singlish-backup che hai esportato.'

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      data = null
    }
    if (!isBackup(data)) {
      setHasPending(false)
      setBackupMsg({ tone: 'error', text: NOT_BACKUP })
      return
    }
    setPending(data)
    setHasPending(true)
    setBackupMsg(null)
  }

  const confirmImport = async () => {
    const data = pending
    setHasPending(false)
    setPending(undefined)
    try {
      await importBackup(db, data)
      applyTheme((await getSettings(db)).theme)
      setBackupMsg({ tone: 'ok', text: 'Backup importato.' })
    } catch {
      setBackupMsg({ tone: 'error', text: 'Importazione non riuscita: i tuoi dati non sono cambiati. Il file potrebbe essere danneggiato.' })
    }
  }

  const cancelImport = () => {
    setHasPending(false)
    setPending(undefined)
  }

  return (
    <main class="screen settings">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'today' })} onClick={onBack({ name: 'today' })} aria-label="Indietro"><Icon name="back" /></a>
        <h1>Impostazioni</h1>
      </header>

      <section aria-labelledby="s-aspetto">
        <h2 class="section-label" id="s-aspetto">ASPETTO</h2>
        <div class="segmented" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <button
              type="button"
              role="radio"
              aria-checked={settings.theme === t.value}
              class={settings.theme === t.value ? 'on' : ''}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="s-gemini">
        <h2 class="section-label" id="s-gemini">GEMINI</h2>
        <label class="field">
          <span>Chiave API</span>
          <input
            type="password"
            autocomplete="off"
            value={typedKey}
            placeholder={settings.apiKey ? 'Chiave salvata' : ''}
            onInput={(e) => {
              setTypedKey((e.currentTarget as HTMLInputElement).value)
              if (!probing) setKeyStatus(IDLE)
            }}
          />
        </label>
        <div class="row">
          <label class="field grow">
            <span>Modello</span>
            <input
              type="text"
              value={model}
              autocapitalize="off"
              ref={noAutocorrect}
              onInput={(e) => setTypedModel((e.currentTarget as HTMLInputElement).value)}
              onChange={(e) => {
                // Si salva da solo come le altre impostazioni; vuoto non vale, torna quello salvato.
                const input = e.currentTarget as HTMLInputElement
                const v = input.value.trim()
                setTypedModel(null)
                input.value = v || settings.model
                if (v && v !== settings.model) store({ model: v })
              }}
            />
          </label>
          <button
            type="button"
            class="btn outline"
            disabled={probing || (typedKey.trim() === '' && !hasStored)}
            onClick={probe}
          >
            Prova
          </button>
        </div>
        <p role="status" class={keyStatus.tone === 'error' ? 'note danger' : 'note'}>{keyStatus.text}</p>
        {/* La chiave, a differenza degli altri campi, si salva solo dopo una prova riuscita: lo si dice. */}
        <p class="note">{typedKey.trim() !== '' ? 'La chiave si salva quando tocchi «Prova» e Gemini la accetta. Resta su questo telefono.' : 'La chiave resta su questo telefono.'}</p>
      </section>

      <section aria-labelledby="s-studio">
        <h2 class="section-label" id="s-studio">STUDIO</h2>
        <label class="field">
          <span>Livello</span>
          <select
            value={settings.level}
            onChange={(e) => store({ level: (e.currentTarget as HTMLSelectElement).value as Level })}
          >
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
          </select>
        </label>
        <p class="note">
          {`Fascia utile: ${formatNumber(settings.bandStart)}–${formatNumber(settings.bandEnd)}, ${
            settings.bandFromTest || bandForLevel(settings.level).join() !== `${settings.bandStart},${settings.bandEnd}` ? 'dal test di vocabolario' : `del livello ${settings.level}`
          }. Cambiare livello la riporta a quella del livello.`}
        </p>
        <label class="field">
          <span>Nuove al giorno</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            value={settings.newPerDay}
            onChange={(e) => numeric(e, settings.newPerDay, 1, 40, (n) => store({ newPerDay: n }))}
          />
        </label>
        <label class="field">
          <span>Memoria obiettivo: {((dragRetention ?? Math.round(settings.desiredRetention * 100)) / 100).toFixed(2).replace('.', ',')}</span>
          <input
            type="range"
            min={85}
            max={95}
            step={1}
            value={dragRetention ?? Math.round(settings.desiredRetention * 100)}
            onInput={(e) => setDragRetention(Number((e.currentTarget as HTMLInputElement).value))}
            onChange={(e) =>
              numeric(e, Math.round(settings.desiredRetention * 100), 85, 95, (n) => store({ desiredRetention: n / 100 }))
            }
          />
        </label>
      </section>

      <section aria-labelledby="s-timer">
        <h2 class="section-label" id="s-timer">TIMER (MINUTI)</h2>
        <div class="grid2">
          <label class="field">
            <span>Studio</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={settings.timerMinutes.study}
              onChange={(e) =>
                numeric(e, settings.timerMinutes.study, 1, 180, (n) => store({ timerMinutes: { ...settings.timerMinutes, study: n } }))
              }
            />
          </label>
          <label class="field">
            <span>Ripasso</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={settings.timerMinutes.review}
              onChange={(e) =>
                numeric(e, settings.timerMinutes.review, 1, 180, (n) => store({ timerMinutes: { ...settings.timerMinutes, review: n } }))
              }
            />
          </label>
        </div>
      </section>

      <section aria-labelledby="s-backup">
        <h2 class="section-label" id="s-backup">BACKUP</h2>
        <div class="grid2">
          <button type="button" class="btn primary" onClick={doExport}>Esporta</button>
          <button type="button" class="btn outline" onClick={() => fileRef.current?.click()}>Importa</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          aria-label="File di backup"
          onChange={onFile}
        />
        {hasPending && (
          <div class="confirm" role="alertdialog" aria-label="Conferma importazione">
            <p>Sostituire tutti i dati?</p>
            <div class="grid2">
              <button type="button" class="btn outline" onClick={cancelImport}>Annulla</button>
              <button type="button" class="btn primary" onClick={confirmImport}>Sostituisci</button>
            </div>
          </div>
        )}
        <p role="status" class={backupMsg?.tone === 'error' ? 'note danger' : 'note'}>{backupMsg?.text}</p>
      </section>

      <section aria-labelledby="s-app">
        <h2 class="section-label" id="s-app">APP</h2>
        <InstallCard state={install.state} onInstall={() => void install.install()} />
        <p class="note">{`Versione ${__APP_VERSION__}`}</p>
        <p class="note">
          Frequenze delle parole: <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noopener noreferrer">wordfreq</a> di Robyn Speer, licenza CC BY-SA 4.0.
        </p>
      </section>
    </main>
  )
}
