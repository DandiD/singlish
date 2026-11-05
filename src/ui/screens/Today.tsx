import { useEffect, useRef, useState } from 'preact/hooks'
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
import { dayRing, doneToday, emptyAction, featuredInvite, todaySong, type EmptyAction, type Invite } from '../../domain/today'
import { useAddGate } from '../components/UnlockSheet'
import { MilestoneSheet } from '../components/MilestoneSheet'
import { MILESTONE_ORDER, markMilestoneSeen, seedMilestonesSeen, unseenReached, type Milestone } from '../../domain/milestones'
import { Icon } from '../components/Icon'
import { Cover } from '../components/Cover'
import { DayRing, ringWillPulse } from '../components/DayRing'
import { WeekRhythm } from '../components/WeekRhythm'
import { TodayHero } from '../components/TodayHero'
import { songPath } from '../../domain/path'
import { SongCarousel, type CarouselItem } from '../components/SongCarousel'
import { emptyCta, ringLabel, ringWhy, songDetail, songLabel } from '../todayText'
import { useInstall } from '../../pwa/install'
import { songLook } from '../cover'
import { InstallBanner } from '../components/InstallBanner'


/** Al massimo un foglio di traguardo per avvio dell'app, non per ogni ritorno su Oggi. */
let milestoneShown = false
export function resetMilestoneSheet() {
  milestoneShown = false
}

const dayFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })
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
  // Il primo traguardo raggiunto e non visto (`undefined` finché non si sa). Prima si semina (utenti esistenti: nessuna raffica).
  const [nextMilestone, setNextMilestone] = useState<Milestone | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void (async () => {
      const n = now()
      if (await seedMilestonesSeen(db, n)) return null
      const seen = (await getSettings(db)).milestonesSeen ?? {}
      // Tutti già visti: niente da ricalcolare.
      if (MILESTONE_ORDER.every((id) => seen[id])) return null
      return (await unseenReached(db, n, seen))[0] ?? null
    })().then((m) => { if (live) setNextMilestone(m) }, (e) => { reportError(e); if (live) setNextMilestone(null) })
    return () => { live = false }
  }, [db])
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [decided, setDecided] = useState(false)
  // L'anello completo pulsa (e vibra) in questo montaggio: il traguardo non gli si sovrappone, aspetta un'altra apertura.
  const ringPulsed = useRef(false)
  const gateOpen = gate.sheet !== null
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
    // La canzone di ogni card in coda (il primo verso della voce), per scegliere la canzone del giorno.
    const itemSong = new Map<string, string>()
    for (const x of chunks) itemSong.set(`chunk:${x.id}`, x.contexts[0]?.songId ?? x.songId)
    for (const x of words) itemSong.set(`word:${x.id}`, x.contexts[0]?.songId ?? x.songId)
    const queueSongIds = queue.items.map((q) => itemSong.get(`${q.card.itemType}:${q.card.itemId}`) ?? '')
    return { asOf: n, queueSongIds, hasUnlocked, rhythm, reviewedToday, dayKey: localDayKey(n), queue, settings, progress, doneLeft, done, hasSongs, finalDue: finalListenDue(songs, n), toCorrect: (await pendingProductions(db)).length }
  }, [db, day])

  // Si decide a dati pronti (anello noto) e senza il foglio dello sblocco aperto: allora un solo foglio, o nessuno.
  const ready = data !== undefined && data !== null
  useEffect(() => {
    if (decided || nextMilestone === undefined || !ready || gateOpen) return
    setDecided(true)
    if (!nextMilestone || ringPulsed.current || milestoneShown) return
    milestoneShown = true
    setMilestone(nextMilestone)
  }, [decided, nextMilestone, ready, gateOpen])

  // Prima apertura del giorno con coda vuota e nessun ripasso: giorno libero. Una volta per chiave di giorno.
  const freeDue = data !== undefined && data !== null && data.hasUnlocked && data.queue.items.length === 0 && !data.reviewedToday
  const freeKey = freeDue ? data.dayKey : null
  useEffect(() => {
    if (freeKey === null || !data) return
    // Il giorno è quello della query che ha prodotto la chiave, non quello dell'istante dell'effetto.
    void markFreeDay(db, data.asOf).catch(reportError)
  }, [db, freeKey])

  if (!data) return <main class="screen" aria-busy="true" />
  const { rhythm, queue, settings, progress, doneLeft, done, hasSongs, finalDue, toCorrect, queueSongIds } = data
  const minutes = settings.timerMinutes.review
  const full = progress.length >= MAX_OPEN_SONGS
  const ring = dayRing({ done, left: queue.items.length, blocked: queue.newBlockedByLoad })
  // Prima che DayRing si disegni (e segni il giorno come già pulsato).
  if (ringWillPulse(localDayKey(now()), ring.state)) ringPulsed.current = true

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
  // L'invito in evidenza conta anche quando coincide con l'azione principale (e quindi non si mostra).
  const hero = todaySong({ queueSongIds, invite: candidate, songs: progress.map((p) => p.song) })
  const heroHref = hero && href(hero.status === 'draft' || hero.status === 'queued' ? { name: 'analyzing', songId: hero.id } : { name: 'study', songId: hero.id })

  return (
    // La tinta della canzone del giorno colora la cima della schermata (sfondo di <main>, sotto la testata).
    <main class={`screen today${hero ? ` today--tinted song-hue-${songLook(hero.id).hue}` : ''}`} data-milestones-checked={decided ? 'true' : undefined}>
      <header class="today-head">
        <span class="wordmark">Singlish</span>
        <span class="head-actions">
          <a class="icon-btn" href={href({ name: 'progress' })} aria-label="Diario"><Icon name="chart" /></a>
          <a class="icon-btn" href={href({ name: 'settings' })} aria-label="Impostazioni"><Icon name="settings" /></a>
        </span>
      </header>
      {!settings.installBannerDismissed && (
        <InstallBanner
          state={install.state}
          onInstall={() => void install.install()}
          onDismiss={() => void saveSettings(db, { installBannerDismissed: true }).catch(() => {})}
        />
      )}

      <TodayHero song={hero} href={heroHref} now={now()}>
        <DayRing
          compact
          ring={ring}
          estMinutes={queue.estMinutes}
          timerMinutes={minutes}
          label={ringLabel(ring, toCorrect)}
          why={ringWhy(ring, { blocked: queue.newBlockedByLoad, minutes, toCorrect })}
          dayKey={localDayKey(now())}
          haptics={settings.haptics}
          details={
            <div class="stats">
              <div class="stat"><span class="stat-num mono">{queue.dueCount}</span><span class="note">in scadenza</span></div>
              <div class="stat"><span class="stat-num mono">{queue.newCount}</span><span class="note">nuove</span></div>
              <div class="stat"><span class="stat-num mono">{`~${queue.estMinutes}′`}</span><span class="note">stimati</span></div>
            </div>
          }
        />
        <WeekRhythm rhythm={rhythm} weekKey={rhythm.days[0].key} />
        {settings.intensiveUntil && settings.intensiveUntil > now() && (
          <p class="note">{`Modalità intensiva fino al ${dayFmt.format(settings.intensiveUntil)}: fino a ${Math.max(INTENSIVE.newPerDay, settings.newPerDay)} nuove al giorno.`}</p>
        )}
      </TodayHero>

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
