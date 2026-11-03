import { useEffect, useState } from 'preact/hooks'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { useFailure } from '../useFailure'
import { href, goBackTo, onBack } from '../../router'
import { applyTriage, pendingWords } from '../../domain/triage'
import type { Song, Word } from '../../db/types'
import { Icon } from '../components/Icon'
import { plural } from '../plural'

export function Triage({ songId }: { songId: string }) {
  const { db, now } = useDeps()
  const fail = useFailure()
  const [song, setSong] = useState<Song | null>(null)
  const [words, setWords] = useState<Word[] | null>(null)
  const [choice, setChoice] = useState<Record<string, 'known' | 'learn'>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [s, w] = await Promise.all([db.songs.get(songId), pendingWords(db, songId)])
      if (!alive) return
      setSong(s ?? null)
      setWords(w)
      setChoice(Object.fromEntries(w.map((x) => [x.id, 'learn' as const])))
    })().catch(fail)
    return () => { alive = false }
  }, [db, songId])

  const learn = Object.values(choice).filter((c) => c === 'learn').length
  const known = Object.values(choice).filter((c) => c === 'known').length

  const confirm = async () => {
    setBusy(true)
    try {
      await applyTriage(db, choice, now())
      goBackTo({ name: 'study', songId })
    } catch (e) {
      reportError(e)
      setBusy(false)
    }
  }

  return (
    <main class="screen triage" aria-busy={words === null ? 'true' : undefined}>
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'study', songId })} onClick={onBack({ name: 'study', songId })} aria-label="Indietro"><Icon name="back" /></a>
        <div>
          <h1>Smista parole</h1>
          {song && <p class="note">{song.title}</p>}
        </div>
      </header>
      <p class="intro">
        Le parole che sai non tornano più. Il numero è il rango di frequenza: più è basso, più la parola è comune.
      </p>
      {words && words.length === 0 && <p class="note">Nessuna parola da smistare.</p>}
      <ul class="triage-list">
        {(words ?? []).map((w) => (
          <li key={w.id}>
            <div class="triage-top">
              <span class="triage-word">{w.lemma}</span>
              <span class="mono note">#{w.freqRank.toLocaleString('it-IT')}</span>
            </div>
            <div class="triage-meaning">{w.meaningIt}</div>
            <div class="radios" role="radiogroup" aria-label={w.lemma}>
              {(['known', 'learn'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={choice[w.id] === v}
                  class={choice[w.id] === v ? 'on' : ''}
                  onClick={() => setChoice((c) => ({ ...c, [w.id]: v }))}
                >
                  {v === 'known' ? 'La so' : 'Da imparare'}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <footer class="triage-foot">
        <p class="note center">{`${learn} da imparare · ${plural(known, 'nota, aggiunta', 'note, aggiunte')} al tuo profilo`}</p>
        <button type="button" class="btn primary cta" disabled={busy || !words} onClick={confirm}>Conferma</button>
      </footer>
    </main>
  )
}
