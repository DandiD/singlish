import { useEffect, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDayTick } from '../useDayTick'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { href } from '../../router'
import { buildSessionQueue } from '../../domain/queue'
import { getSettings, saveSettings } from '../../domain/settings'
import { activeSongs, LIMIT_NOTE, MAX_OPEN_SONGS } from '../../domain/ingest'
import { itemsInSong } from '../../domain/songItems'
import { rCardStates, unlockedLines } from '../../domain/unlocked'
import { finalListenDue } from '../../domain/finalListen'
import { localDayKey, loadWeekRhythm, markFreeDay, reviewDaysSince } from '../../domain/rhythm'
import { INTENSIVE } from '../../domain/readiness'
import { pendingProductions } from '../../domain/production'
import { pendingWords } from '../../domain/triage'
import { dayRing, doneToday, emptyAction, featuredInvite, type EmptyAction, type Invite } from '../../domain/today'
import { useAddGate } from '../components/UnlockSheet'
import { MilestoneSheet } from '../components/MilestoneSheet'
import { markMilestoneSeen, reachedMilestones, seedMilestonesSeen, type Milestone } from '../../domain/milestones'
import { Icon } from '../components/Icon'
import { Cover } from '../components/Cover'
import { DayRing } from '../components/DayRing'
import { WeekRhythm } from '../components/WeekRhythm'
import { songPath } from '../../domain/path'
import { SongCarousel, type CarouselItem } from '../components/SongCarousel'
import { emptyCta, ringLabel, ringWhy, songDetail, songLabel } from '../todayText'
import { useInstall } from '../../pwa/install'
import { InstallBanner } from '../components/InstallBanner'


const dayFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })
const dateFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const wordCount = (n: number) => (n === 1 ? '1 parola' : `${n} parole`)

/** L'invito coincide con l'azione principale (stesso obiettivo): si mostra solo l'azione. */
function sameTarget(invite: Invite, action: EmptyAction): boolean {
  if (invite.kind !== action.kind) return false
  if (invite.kind === 'correct') return true
  return 'song' in action && invite.song.id === action.song.id
}

function InviteCard({ invite }: { invite: Invite }) {
  switch (invite.kind) {
    case 'correct':
      return (
        <a class="card final-due" href={href({ name: 'feedback' })}>
          <span class="section-label">LE TUE FRASI</span>
          <strong>{invite.count === 1 ? '1 frase da correggere' : `${invite.count} frasi da correggere`}</strong>
          <span class="note">Una sola chiamata a Gemini le corregge tutte.</span>
        </a>
      )
    case 'final':
      return (
        <a class="card final-due" href={href({ name: 'finalListen', songId: invite.song.id })}>
          <span class="section-label">RIASCOLTO FINALE</span>
          <strong>{invite.song.title}</strong>
          <span class="note">Una settimana di studio: riascoltala senza testo e misura quanto capisci adesso.</span>
        </a>
      )
    case 'triage':
      return (
        <a class="card final-due" href={href({ name: 'triage', songId: invite.song.id })}>
          <span class="section-label">DA SMISTARE</span>
          <strong>{`${wordCount(invite.count)} da smistare in «${invite.song.title}»`}</strong>
        </a>
      )
    case 'study':
      return (
        <a class="card final-due" href={href({ name: 'study', songId: invite.song.id })}>
          <span class="section-label">DA STUDIARE</span>
          <strong>{`“${invite.song.title}” è da studiare`}</strong>
        </a>
      )
  }
}

export function Today() {
  const { db, now } = useDeps()
  const gate = useAddGate()
  const install = useInstall()
  // Lasciata aperta la sera, Oggi si ricalcola al mattino (ritorno in primo piano o mezzanotte).
  const day = useDayTick(now)
  // Un solo foglio di traguardo per apertura. Prima si semina (utenti esistenti: nessuna raffica), poi si decide.
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const n = now()
      if (await seedMilestonesSeen(db, n)) return
      const [reached, settings] = await Promise.all([reachedMilestones(db, n), getSettings(db)])
      const first = reached.find((m) => !settings.milestonesSeen?.[m.id])
      if (live && first) setMilestone(first)
    })().catch(reportError)
    return () => { live = false }
  }, [db])
  const closeMilestone = () => {
    if (!milestone) return
    void markMilestoneSeen(db, milestone.id, now()).catch(reportError)
    setMilestone(null)
  }
  const data = useLive(async () => {
    const n = now()
    const [queue, settings, songs, chunks, words, done, hasSongs, rhythm, reviewedToday, hasUnlocked] = await Promise.all([
      buildSessionQueue(db, n),
      getSettings(db),
      activeSongs(db),
      db.chunks.toArray(),
      db.words.toArray(),
      doneToday(db, n),
      db.songs.count().then((c) => c > 0),
      loadWeekRhythm(db, n),
      reviewDaysSince(db, new Date(n.getFullYear(), n.getMonth(), n.getDate())).then((d) => d.size > 0),
      // Un giorno può essere libero solo se c'è materiale di studio sbloccato.
      db.cards.filter((c) => c.unlocked === 1).first().then((c) => c !== undefined),
    ])
    const rState = await rCardStates(db)
    const pendingIds = new Set(words.filter((w) => w.triage === 'pending').map((w) => w.id))
    // Le parole da smistare di una canzone sono quelle che Smista mostra: una sola fonte.
    const toTriageIn = async (songId: string) => (await pendingWords(db, songId)).length
    const progress = await Promise.all(songs
      .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
      .map(async (song) => {
        // Le voci che lo Studio evidenzia e conta, meno le parole ancora da smistare.
        const placed = itemsInSong(song, chunks, words)
        const ids = [...placed.chunks, ...[...placed.words].filter((id) => !pendingIds.has(id))]
        const { unlocked, total: lines } = unlockedLines(song, chunks, words, rState)
        // Voci della canzone tolte dal ripasso con Sospendi: le dice quando non resta altro.
        const suspended = [...chunks, ...words].filter((x) => x.suspended && x.contexts.some((c) => c.songId === song.id)).length
        return { song, items: ids.length, lines, unlocked, toTriage: await toTriageIn(song.id), suspended }
      }))
    // Canzoni completate con parole mai smistate: non contano fra le aperte, ma Oggi le nomina (lo sblocco e la Sessione vuota ne parlano).
    const doneLeft = (await Promise.all((await db.songs.where('status').equals('done').toArray())
      .map(async (song) => ({ song, toTriage: await toTriageIn(song.id) }))))
      .filter((x) => x.toTriage > 0)
    return { asOf: n, hasUnlocked, rhythm, reviewedToday, dayKey: localDayKey(n), queue, settings, progress, doneLeft, done, hasSongs, finalDue: finalListenDue(songs, n), toCorrect: (await pendingProductions(db)).length }
  }, [db, day])

  // Prima apertura del giorno con coda vuota e nessun ripasso: giorno libero. Una volta per chiave di giorno.
  const freeDue = data !== undefined && data !== null && data.hasUnlocked && data.queue.items.length === 0 && !data.reviewedToday
  const freeKey = freeDue ? data.dayKey : null
  useEffect(() => {
    if (freeKey === null || !data) return
    // Il giorno è quello della query che ha prodotto la chiave, non quello dell'istante dell'effetto.
    void markFreeDay(db, data.asOf).catch(reportError)
  }, [db, freeKey])

  if (!data) return <main class="screen" aria-busy="true" />
  const { rhythm, queue, settings, progress, doneLeft, done, hasSongs, finalDue, toCorrect } = data
  const minutes = settings.timerMinutes.review
  const full = progress.length >= MAX_OPEN_SONGS
  const ring = dayRing({ done, left: queue.items.length, blocked: queue.newBlockedByLoad })

  // Le stesse fonti della Sessione vuota: smistare nelle canzoni in studio o completate, studiare le «Da studiare», analizzare bozze e code.
  const toTriage = [
    ...progress.filter((p) => p.song.status === 'studying').map((p) => ({ song: p.song, count: p.toTriage })),
    ...doneLeft.map((d) => ({ song: d.song, count: d.toTriage })),
  ]
  const toStudy = progress.filter((p) => p.song.status === 'analyzed').map((p) => p.song)
  const toAnalyze = progress.filter((p) => p.song.status === 'draft' || p.song.status === 'queued').map((p) => p.song)
  const action = queue.items.length > 0 ? null : emptyAction({ hasSongs, toCorrect, toTriage, toStudy, toAnalyze })
  const cta = action && emptyCta(action)
  const candidate = featuredInvite({ toCorrect, finalDue, toTriage, toStudy })
  const invite = candidate && !(action && sameTarget(candidate, action)) ? candidate : null
  const invitedSong = invite && invite.kind !== 'correct' ? invite.song.id : null

  const items: CarouselItem[] = progress.map((row) => {
    const { song, lines, unlocked, toTriage: pending } = row
    // Un riascolto pronto che non è l'invito si apre dalla copertina, se no resterebbe irraggiungibile.
    const finalReady = song.id !== invitedSong && finalDue.some((s) => s.id === song.id)
    const target = song.status === 'draft' || song.status === 'queued'
      ? href({ name: 'analyzing', songId: song.id })
      : finalReady ? href({ name: 'finalListen', songId: song.id }) : href({ name: 'study', songId: song.id })
    // Il pallino del riascolto segue `finalListenDue`, anche quando l'invito lo mostra altrove.
    const stages = songPath({ song, toTriage: pending, unlocked, lines, finalReady: finalDue.some((s) => s.id === song.id), now: now() }).map((s) => s.state)
    return { song, href: target, label: songLabel(row, finalReady), detail: songDetail(row), progress: lines > 0 ? unlocked / lines : null, stages }
  })
  const leftToTriage = doneLeft.filter((d) => d.song.id !== invitedSong)

  return (
    <main class="screen today">
      <header class="today-head">
        <span class="wordmark">Singlish</span>
        <span class="head-actions">
          <a class="icon-btn" href={href({ name: 'progress' })} aria-label="Diario"><Icon name="chart" /></a>
          <a class="icon-btn" href={href({ name: 'settings' })} aria-label="Impostazioni"><Icon name="settings" /></a>
        </span>
      </header>
      <p class="note">{capitalize(dateFmt.format(now()))}</p>

      {!settings.installBannerDismissed && (
        <InstallBanner
          state={install.state}
          onInstall={() => void install.install()}
          onDismiss={() => void saveSettings(db, { installBannerDismissed: true }).catch(() => {})}
        />
      )}

      <section class="card today-card">
        <h1>Ripasso di oggi</h1>
        <DayRing
          ring={ring}
          estMinutes={queue.estMinutes}
          timerMinutes={minutes}
          label={ringLabel(ring, toCorrect)}
          why={ringWhy(ring, { blocked: queue.newBlockedByLoad, minutes, toCorrect })}
          dayKey={localDayKey(now())}
          haptics={settings.haptics}
        />
        <WeekRhythm rhythm={rhythm} weekKey={rhythm.days[0].key} />
        <div class="stats">
          <div class="stat"><span class="stat-num mono">{queue.dueCount}</span><span class="note">in scadenza</span></div>
          <div class="stat"><span class="stat-num mono">{queue.newCount}</span><span class="note">nuove</span></div>
          <div class="stat"><span class="stat-num mono">{`~${queue.estMinutes}′`}</span><span class="note">stimati</span></div>
        </div>
        {settings.intensiveUntil && settings.intensiveUntil > now() && (
          <p class="note">{`Modalità intensiva fino al ${dayFmt.format(settings.intensiveUntil)}: fino a ${Math.max(INTENSIVE.newPerDay, settings.newPerDay)} nuove al giorno.`}</p>
        )}
      </section>

      {invite && <InviteCard invite={invite} />}

      <div class="today-songs-head">
        <h2>Canzoni e testi aperti <span class="note">{`${progress.length} di ${MAX_OPEN_SONGS}`}</span></h2>
      </div>
      {full && <p class="note">{LIMIT_NOTE}</p>}
      <SongCarousel items={items} onAdd={full ? null : () => gate.request()} addHref={href({ name: 'addSong' })} />

      {/* Completate con parole mai smistate: fuori dalle aperte, sotto un loro titolo (se non sono già l'invito). */}
      {leftToTriage.length > 0 && (
        <>
          <div class="today-songs-head"><h2>Da smistare nelle canzoni completate</h2></div>
          <ul class="song-list done-left">
            {leftToTriage.map(({ song, toTriage }) => (
              <li key={song.id}>
                <a class="song-card left-to-triage" href={href({ name: 'study', songId: song.id })}>
                  <div class="song-card-top"><Cover song={song} size="md" /><h3>{song.title}</h3></div>
                  <p class="note">{`${song.kind === 'text' ? 'Completato' : 'Completata'} · ${wordCount(toTriage)} da smistare`}</p>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {queue.items.length > 0 ? (
        <a class="btn primary cta today-cta" href={href({ name: 'session' })}><Icon name="play" size={18} />{done === 0 ? 'Inizia il giro' : 'Continua il giro'}</a>
      ) : cta && action?.kind === 'add' ? (
        <a class="btn primary cta today-cta" href={href(cta.route)} onClick={(e) => { e.preventDefault(); gate.request() }}><Icon name="plus" size={18} />{cta.text}</a>
      ) : cta ? (
        <a class="btn primary cta today-cta" href={href(cta.route)}>{cta.text}</a>
      ) : null}
      {gate.sheet}
      {milestone && <MilestoneSheet milestone={milestone} onClose={closeMilestone} haptics={settings.haptics} />}
    </main>
  )
}
