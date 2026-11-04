import { useLive } from '../useLive'
import { useDayTick } from '../useDayTick'
import { State } from 'ts-fsrs'
import { useDeps } from '../deps'
import { href } from '../../router'
import { buildSessionQueue } from '../../domain/queue'
import { getSettings } from '../../domain/settings'
import { activeSongs, LIMIT_NOTE, MAX_OPEN_SONGS } from '../../domain/ingest'
import { itemsInSong } from '../../domain/songItems'
import { finalListenDue } from '../../domain/finalListen'
import { INTENSIVE } from '../../domain/readiness'
import { pendingProductions } from '../../domain/production'
import { useAddGate } from '../components/UnlockSheet'
import { Icon } from '../components/Icon'
import { plural } from '../plural'


const dayFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })
const dateFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Today() {
  const { db, now } = useDeps()
  const gate = useAddGate()
  // Lasciata aperta la sera, Oggi si ricalcola al mattino (ritorno in primo piano o mezzanotte).
  const day = useDayTick(now)
  const data = useLive(async () => {
    const [queue, settings, songs, chunks, words] = await Promise.all([
      buildSessionQueue(db, now()),
      getSettings(db),
      activeSongs(db),
      db.chunks.toArray(),
      db.words.toArray(),
    ])
    const rCards = await db.cards.where('kind').equals('R').toArray()
    const rState = new Map(rCards.map((c) => [c.itemId, c.fsrs.state]))
    const pendingIds = new Set(words.filter((w) => w.triage === 'pending').map((w) => w.id))
    const progress = songs
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
      .map((song) => {
        // Le voci che lo Studio evidenzia e conta, meno le parole ancora da smistare.
        const placed = itemsInSong(song, chunks, words)
        const ids = [...placed.chunks, ...[...placed.words].filter((id) => !pendingIds.has(id))]
        const done = ids.filter((id) => {
          const s = rState.get(id)
          return s !== undefined && s !== State.New
        }).length
        const toTriage = [...placed.words].filter((id) => pendingIds.has(id)).length
        // Voci della canzone tolte dal ripasso con Sospendi: le dice quando non resta altro.
        const suspended = [...chunks, ...words].filter((x) => x.suspended && x.contexts.some((c) => c.songId === song.id)).length
        return { song, total: ids.length, done, toTriage, suspended }
      })
    // Canzoni completate con parole mai smistate: non contano fra le aperte, ma Oggi le nomina (lo sblocco e la Sessione vuota ne parlano).
    const doneLeft = (await db.songs.where('status').equals('done').toArray())
      .map((song) => ({ song, toTriage: [...itemsInSong(song, chunks, words).words].filter((id) => pendingIds.has(id)).length }))
      .filter((x) => x.toTriage > 0)
    return { queue, settings, progress, doneLeft, finalDue: finalListenDue(songs, now()), toCorrect: (await pendingProductions(db)).length }
  }, [db, day])

  if (!data) return <main class="screen" aria-busy="true" />
  const { queue, settings, progress, doneLeft, finalDue, toCorrect } = data
  const minutes = settings.timerMinutes.review
  const full = progress.length >= MAX_OPEN_SONGS

  return (
    <main class="screen today">
      <header class="today-head">
        <span class="wordmark">Singlish</span>
        <span class="head-actions">
          <a class="icon-btn" href={href({ name: 'progress' })} aria-label="Progressi"><Icon name="chart" /></a>
          <a class="icon-btn" href={href({ name: 'settings' })} aria-label="Impostazioni"><Icon name="settings" /></a>
        </span>
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
        {settings.intensiveUntil && settings.intensiveUntil > now() && (
          <p class="note">{`Modalità intensiva fino al ${dayFmt.format(settings.intensiveUntil)}: fino a ${Math.max(INTENSIVE.newPerDay, settings.newPerDay)} nuove al giorno.`}</p>
        )}
        {queue.newBlockedByLoad && <p class="note">{`Per ora niente card nuove: il ripasso in scadenza supera ${minutes === 1 ? 'il minuto' : `i ${minutes} minuti`}. Arrivano quando scende sotto.`}</p>}
        {queue.items.length > 0 ? (
          <a class="btn primary cta" href={href({ name: 'session' })}><Icon name="play" size={18} />Inizia sessione</a>
        ) : progress.length === 0 ? (
          <a class="btn primary cta" href={href({ name: 'addSong' })} onClick={(e) => { e.preventDefault(); gate.request() }}><Icon name="plus" size={18} />Aggiungi una canzone</a>
        ) : (
          <p class="note">{toCorrect > 0 ? 'Niente da ripassare per ora: le voci con una frase da correggere tornano nel ripasso dopo la correzione.' : 'Niente da ripassare oggi.'}</p>
        )}
      </section>

      {toCorrect > 0 && (
        <a class="card final-due" href={href({ name: 'feedback' })}>
          <span class="section-label">LE TUE FRASI</span>
          <strong>{toCorrect === 1 ? '1 frase da correggere' : `${toCorrect} frasi da correggere`}</strong>
          <span class="note">Una sola chiamata a Gemini le corregge tutte.</span>
        </a>
      )}

      {finalDue.map((s) => (
        <a key={s.id} class="card final-due" href={href({ name: 'finalListen', songId: s.id })}>
          <span class="section-label">RIASCOLTO FINALE</span>
          <strong>{s.title}</strong>
          <span class="note">Una settimana di studio: riascoltala senza testo e misura quanto capisci adesso.</span>
        </a>
      ))}

      <div class="today-songs-head">
        <h2>Canzoni e testi aperti <span class="note">{`${progress.length} di ${MAX_OPEN_SONGS}`}</span></h2>
        {!full && <a class="link-add" href={href({ name: 'addSong' })} onClick={(e) => { e.preventDefault(); gate.request() }}><Icon name="plus" size={18} />Aggiungi</a>}
      </div>
      {full && <p class="note">{LIMIT_NOTE}</p>}
      <ul class="song-list">
        {progress.map(({ song, total, done, toTriage, suspended }) =>
          song.status === 'draft' || song.status === 'queued' ? (
            <li key={song.id}>
              <a class="song-card" href={href({ name: 'analyzing', songId: song.id })}>
                <h3>{song.title}</h3>
                <p class="note">Da analizzare</p>
              </a>
            </li>
          ) : (
            <li key={song.id}>
              <a class="song-card" href={href({ name: 'study', songId: song.id })}>
                <h3>{song.title}</h3>
                <p class="note">{song.status === 'analyzed'
                  ? (total === 0 && toTriage > 0 ? `Da studiare · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : total === 0 ? 'Da studiare · nessuna voce da ripassare' : `Da studiare · ${total} chunk e parole${toTriage > 0 ? ` · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : ''}`)
                  : total === 0 && toTriage > 0 ? `${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare nello Studio`
                  : total === 0 ? (suspended > 0 ? 'Nessuna voce nel ripasso: le trovi sospese nel Lessico' : 'Nessuna voce da ripassare in questa canzone')
                  // Le parole lasciate da smistare si nominano anche quando la canzone ha altre voci nel ripasso.
                  : `${done} di ${total} chunk e parole nel ripasso${toTriage > 0 ? ` · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : ''}`}</p>
                <div class="bar" aria-hidden="true"><div class="bar-fill" style={{ transform: `scaleX(${total ? done / total : 0})` }} /></div>
              </a>
            </li>
          ),
        )}
        {doneLeft.map(({ song, toTriage }) => (
          <li key={song.id}>
            <a class="song-card left-to-triage" href={href({ name: 'study', songId: song.id })}>
              <h3>{song.title}</h3>
              <p class="note">{`${song.kind === 'text' ? 'Completato' : 'Completata'} · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare`}</p>
            </a>
          </li>
        ))}
      </ul>
      {gate.sheet}
    </main>
  )
}
