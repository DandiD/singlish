import { useRef, useState } from 'preact/hooks'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeps } from '../deps'
import { getSettings, saveSettings } from '../../domain/settings'
import { callGemini } from '../../domain/gemini/client'
import { downloadOrShare, exportBackup, importBackup } from '../../domain/backup'
import type { Level, Settings as SettingsRow } from '../../db/types'

const THEMES: { value: SettingsRow['theme']; label: string }[] = [
  { value: 'auto', label: 'Automatico' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
]

type KeyStatus = 'idle' | 'running' | 'valid' | 'invalid'

export function Settings() {
  const { db, fetch, sleep, now } = useDeps()
  const settings = useLiveQuery(() => getSettings(db), [db])
  const [typedKey, setTypedKey] = useState('')
  const [typedModel, setTypedModel] = useState<string | null>(null)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('idle')
  const [pending, setPending] = useState<unknown>(undefined)
  const [hasPending, setHasPending] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (!settings) return <main class="screen settings" aria-busy="true" />

  const model = typedModel ?? settings.model

  const numeric = (raw: string, apply: (n: number) => void) => {
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) return
    apply(n)
  }

  const setTheme = (theme: SettingsRow['theme']) => {
    document.documentElement.dataset.theme = theme
    void saveSettings(db, { theme })
  }

  const probe = async () => {
    setKeyStatus('running')
    try {
      await callGemini(
        {
          apiKey: typedKey,
          model,
          system: 'Rispondi con {"ok": true}.',
          user: 'ping',
          schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } },
        },
        { fetch, sleep },
      )
      await saveSettings(db, { apiKey: typedKey, model })
      setTypedKey('')
      setTypedModel(null)
      setKeyStatus('valid')
    } catch {
      setKeyStatus('invalid')
    }
  }

  const doExport = async () => {
    try {
      await downloadOrShare(await exportBackup(db, now()))
      setBackupMsg('')
    } catch {
      setBackupMsg('Esportazione non riuscita')
    }
  }

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      setPending(JSON.parse(await file.text()))
      setHasPending(true)
      setBackupMsg('')
    } catch {
      setBackupMsg('Backup non valido')
    }
  }

  const confirmImport = async () => {
    const data = pending
    setHasPending(false)
    setPending(undefined)
    try {
      await importBackup(db, data)
      setBackupMsg('Backup importato')
    } catch {
      setBackupMsg('Backup non valido')
    }
  }

  const cancelImport = () => {
    setHasPending(false)
    setPending(undefined)
  }

  return (
    <main class="screen settings">
      <header class="settings-head">
        <a class="icon-btn" href="#/" aria-label="Indietro">‹</a>
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
              setKeyStatus('idle')
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
              autocorrect="off"
              spellcheck={false}
              onInput={(e) => setTypedModel((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <button
            type="button"
            class="btn outline"
            disabled={keyStatus === 'running' || typedKey.trim() === ''}
            onClick={probe}
          >
            Prova
          </button>
        </div>
        <p role="status" class={keyStatus === 'invalid' ? 'note danger' : 'note'}>
          {keyStatus === 'valid' && 'Chiave valida'}
          {keyStatus === 'invalid' && 'Chiave non valida, nulla salvato'}
        </p>
        <p class="note">La chiave resta su questo telefono.</p>
      </section>

      <section aria-labelledby="s-studio">
        <h2 class="section-label" id="s-studio">STUDIO</h2>
        <label class="field">
          <span>Livello</span>
          <select
            value={settings.level}
            onChange={(e) => void saveSettings(db, { level: (e.currentTarget as HTMLSelectElement).value as Level })}
          >
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
          </select>
        </label>
        <label class="field">
          <span>Nuove al giorno</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            value={settings.newPerDay}
            onChange={(e) =>
              numeric((e.currentTarget as HTMLInputElement).value, (n) => void saveSettings(db, { newPerDay: n }))
            }
          />
        </label>
        <label class="field">
          <span>Memoria obiettivo: {settings.desiredRetention.toFixed(2).replace('.', ',')}</span>
          <input
            type="range"
            min={85}
            max={95}
            step={1}
            value={Math.round(settings.desiredRetention * 100)}
            onChange={(e) =>
              numeric(
                (e.currentTarget as HTMLInputElement).value,
                (n) => void saveSettings(db, { desiredRetention: n / 100 }),
              )
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
                numeric(
                  (e.currentTarget as HTMLInputElement).value,
                  (n) =>
                    void saveSettings(db, {
                      timerMinutes: { ...settings.timerMinutes, study: Math.max(1, Math.round(n)) },
                    }),
                )
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
                numeric(
                  (e.currentTarget as HTMLInputElement).value,
                  (n) =>
                    void saveSettings(db, {
                      timerMinutes: { ...settings.timerMinutes, review: Math.max(1, Math.round(n)) },
                    }),
                )
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
        <p role="status" class={backupMsg.includes('non') ? 'note danger' : 'note'}>{backupMsg}</p>
      </section>
    </main>
  )
}
