import { useLiveQuery } from 'dexie-react-hooks'
import { State } from 'ts-fsrs'
import { useDeps } from '../deps'
import { href } from '../../router'
import { buildSessionQueue } from '../../domain/queue'
import { getSettings } from '../../domain/settings'
import { Icon } from '../components/Icon'
import { plural } from '../plural'

const MAX_OPEN = 4

const dateFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Today() {
  const { db, now } = useDeps()
  const data = useLiveQuery(async () => {
    const [queue, settings, songs, chunks, words] = await Promise.all([
      buildSessionQueue(db, now()),
      getSettings(db),
      db.songs.where('status').anyOf('analyzed', 'studying').toArray(),
      db.chunks.toArray(),
      db.words.toArray(),
    ])
    const rCards = await db.cards.where('kind').equals('R').toArray()
    const rState = new Map(rCards.map((c) => [c.itemId, c.fsrs.state]))
    const progress = songs
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
      .map((song) => {
        const ids = [
          ...chunks.filter((c) => !c.suspended && (c.songId === song.id || c.contexts.some((x) => x.songId === song.id))).map((c) => c.id),
          ...words.filter((w) => !w.suspended && w.triage === 'learn' && (w.songId === song.id || w.contexts.some((x) => x.songId === song.id))).map((w) => w.id),
        ]
        const done = ids.filter((id) => {
          const s = rState.get(id)
          return s !== undefined && s !== State.New
        }).length
        return { song, total: ids.length, done }
      })
    return { queue, settings, progress }
  }, [db])

  if (!data) return <main class="screen" aria-busy="true" />
  const { queue, settings, progress } = data
  const minutes = settings.timerMinutes.review

  return (
    <main class="screen today">
      <header class="today-head">
        <span class="wordmark">Singlish</span>
        <a class="icon-btn" href={href({ name: 'settings' })} aria-label="Impostazioni"><Icon name="settings" /></a>
      </header>
      <p class="note">{capitalize(dateFmt.format(now()))}</p>

      <section class="card today-card">
        <h1>Ripasso di oggi</h1>
        <div class="stats">
          <div class="stat"><span class="stat-num mono">{queue.dueCount}</span><span class="note">in scadenza</span></div>
          <div class="stat"><span class="stat-num mono">{queue.newCount}</span><span class="note">nuove</span></div>
          <div class="stat"><span class="stat-num mono">{`~${queue.estMinutes}′`}</span><span class="note">stimati</span></div>
        </div>
        <p class="note">{`su ${plural(minutes, 'minuto', 'minuti')}`}</p>
        {queue.newBlockedByLoad && <p class="note">{`Oggi niente card nuove: ripasso oltre ${minutes === 1 ? 'il minuto' : `i ${minutes} minuti`}`}</p>}
        {queue.items.length > 0 ? (
          <a class="btn primary cta" href={href({ name: 'session' })}><Icon name="play" size={18} />Inizia sessione</a>
        ) : progress.length === 0 ? (
          <a class="btn primary cta" href={href({ name: 'addSong' })}><Icon name="plus" size={18} />Aggiungi una canzone</a>
        ) : (
          <p class="note">Niente da ripassare oggi.</p>
        )}
      </section>

      <div class="today-songs-head">
        <h2>Canzoni aperte <span class="note">{`${progress.length} di ${MAX_OPEN}`}</span></h2>
        <a class="link-add" href={href({ name: 'addSong' })}><Icon name="plus" size={18} />Aggiungi</a>
      </div>
      <ul class="song-list">
        {progress.map(({ song, total, done }) => (
          <li key={song.id}>
            <a class="song-card" href={href({ name: 'study', songId: song.id })}>
              <h3>{song.title}</h3>
              <p class="note">{`${done} di ${total} chunk e parole nel ripasso`}</p>
              <div class="bar" aria-hidden="true"><div class="bar-fill" style={{ transform: `scaleX(${total ? done / total : 0})` }} /></div>
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}
