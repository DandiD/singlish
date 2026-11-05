import { useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { href } from '../../router'
import { composition, coverage, lexicon, strength, TOPICS, type LexChip, type LexEntry } from '../../domain/lexicon'
import { TYPE_ORDER } from '../../domain/legend'
import { CHUNK_CLASS } from '../../domain/songItems'
import { Icon } from '../components/Icon'
import { useAddGate } from '../components/UnlockSheet'
import { plural } from '../plural'

const CHIPS: [LexChip, string][] = [
  ['tutti', 'Tutti'], ['B1', 'B1'], ['B2', 'B2'], ['C1', 'C1'], ['attivi', 'Attivi'], ['solo canzone', 'Solo canzone'], ['parole', 'Parole'],
]

const barClass = (e: LexEntry) => (e.type === 'word' ? 'w' : CHUNK_CLASS[e.type])

export function Lexicon() {
  const { db } = useDeps()
  const data = useLive(async () => {
    const [songs, chunks, words, cards] = await Promise.all([db.songs.toArray(), db.chunks.toArray(), db.words.toArray(), db.cards.toArray()])
    return { songs, chunks, words, cards }
  }, [db])
  const [q, setQ] = useState('')
  const [chip, setChip] = useState<LexChip>('tutti')
  const [topic, setTopic] = useState('')
  const [type, setType] = useState<LexEntry['type'] | null>(null)
  const gate = useAddGate()

  if (!data) return <main class="screen lexicon" aria-busy="true" />
  const all = lexicon(data, {})
  const shown = lexicon(data, { q, chip, topic: topic || undefined, type: type ?? undefined })
  const nChunks = all.filter((e) => e.kind === 'chunk').length
  const nWords = all.length - nChunks
  const comp = composition(all).filter((c) => c.count > 0)
  const clsOf = (t: LexEntry['type']) => TYPE_ORDER.find((x) => x.type === t)!.cls
  const cov = coverage(all)
  const least = cov.slice(0, 3)
  const most = cov.slice(-2).reverse().filter((t) => t.count > 0)

  return (
    <main class="screen lexicon">
      <header class="lexicon-head">
        <div class="lexicon-title">
          <h1>Lessico</h1>
          <span class="note">{`${plural(nChunks, 'chunk', 'chunk')} · ${plural(nWords, 'parola', 'parole')}`}</span>
        </div>
        {all.length > 0 && (
          <>
            <label class="search">
              <Icon name="search" size={18} />
              <input
                type="search"
                aria-label="Cerca nel lessico"
                placeholder="Cerca in inglese o in italiano"
                autocapitalize="off"
                value={q}
                onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <div class="chips-row" role="group" aria-label="Filtri">
              {CHIPS.map(([value, label]) => (
                <button key={value} type="button" class="filter-chip" aria-pressed={chip === value} onClick={() => setChip(value)}>{label}</button>
              ))}
              <label class="filter-chip select">
                <select aria-label="Tema" value={topic} onChange={(e) => setTopic((e.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Tema</option>
                  {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <div class="comp" role="group" aria-label="Composizione">
              <div class="comp-strip">
                {comp.map((c) => (
                  <button
                    key={c.type}
                    type="button"
                    class={`comp-seg ${clsOf(c.type)}`}
                    style={{ flexGrow: c.count }}
                    aria-label={`${c.label}: ${c.count}`}
                    aria-pressed={type === c.type}
                    onClick={() => setType(type === c.type ? null : c.type)}
                  ><span class="comp-fill" aria-hidden="true" /></button>
                ))}
              </div>
              <ul class="legend" aria-label="Legenda dei tipi">
                {comp.map((c) => <li key={c.type}><span class={`swatch hl ${clsOf(c.type)}`} aria-hidden="true" />{`${c.label} ${c.count}`}</li>)}
              </ul>
            </div>
            <div class="coverage">
              <span class="coverage-title">Aree scoperte</span>
              <span class="note">
                {`${least.map((t) => `${t.label} ${t.count}`).join(' · ')}.`}
                {most.length > 0 && ` Le più coperte: ${most.map((t) => `${t.label.toLowerCase()} ${t.count}`).join(', ')}.`}
              </span>
            </div>
          </>
        )}
      </header>

      {all.length === 0 ? (
        <div class="empty">
          <p class="note">Il lessico si riempie con le espressioni e le parole delle tue canzoni.</p>
          <a class="btn primary cta" href={href({ name: 'addSong' })} onClick={(e) => { e.preventDefault(); gate.request() }}><Icon name="plus" size={18} />Aggiungi una canzone</a>
        </div>
      ) : (
        <>
          {shown.length === 0 && <p class="note">Nessuna voce con questi filtri.</p>}
          <ul class="lex-list" aria-label="Voci del lessico">
            {shown.map((e) => (
              <li key={e.id}>
                <a class="lex-row" href={href({ name: 'study', songId: e.songId, itemId: e.id })}>
                  <span class={`lex-bar ${barClass(e)}`} aria-hidden="true" />
                  <span class="lex-main">
                    <span class="lex-title" lang="en">{e.title}</span>
                    <span class="note">{`${e.meaning}${e.where ? ` · ${e.where}` : ''}`}</span>
                  </span>
                  <span class="lex-ticks" aria-hidden="true">
                    {[1, 2, 3].map((n) => <span key={n} class={n <= strength(e.status) ? 'on' : ''} />)}
                  </span>
                  <span class={e.status === 'attivo' ? 'lex-status on' : 'lex-status'}>{`${e.cefr} · ${e.status}`}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {gate.sheet}
    </main>
  )
}
