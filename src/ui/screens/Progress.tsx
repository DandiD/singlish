import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { href, onBack } from '../../router'
import { getSettings } from '../../domain/settings'
import { estimateAvgSeconds } from '../../domain/queue'
import { LEVEL_UP, progressStats } from '../../domain/progress'
import { averageGain } from '../../domain/finalListen'
import { Icon } from '../components/Icon'
import { formatNumber } from '../format'

const dayFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })
const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'long' })
const comma = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',')

/** Una serie sola: la comprensione al primo ascolto, canzone per canzone, con la soglia del livello successivo. */
function ComprehensionChart({ points, threshold }: { points: { title: string; pct: number }[]; threshold: number }) {
  const W = 350, H = 110, pad = { l: 8, r: 10, t: 22, b: 10 }
  const x = (i: number) => (points.length === 1 ? W / 2 : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1))
  // L'asse va da poco sotto il valore più basso a poco sopra il più alto (soglia compresa): da 0 a 100 sembrerebbe piatto.
  const lo = Math.max(0, Math.floor((Math.min(threshold, ...points.map((p) => p.pct)) - 10) / 10) * 10)
  const hi = Math.min(100, Math.ceil((Math.max(threshold, ...points.map((p) => p.pct)) + 10) / 10) * 10)
  const y = (pct: number) => pad.t + ((hi - pct) * (H - pad.t - pad.b)) / (hi - lo)
  const label = `Comprensione al primo ascolto per canzone: ${points.map((p) => p.pct).join(', ')} per cento`
  return (
    <svg class="chart" role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line class="chart-threshold" x1="0" y1={y(threshold)} x2={W} y2={y(threshold)} />
      <text class="chart-note" x={W} y={y(threshold) - 6} text-anchor="end">{`${threshold}% soglia`}</text>
      <polyline class="chart-line" points={points.map((p, i) => `${x(i)},${y(p.pct)}`).join(' ')} />
      {points.map((p, i) => (
        <circle key={i} class="chart-dot" cx={x(i)} cy={y(p.pct)} r="5">
          <title>{`${p.title}: ${p.pct}%`}</title>
        </circle>
      ))}
    </svg>
  )
}

export function Progress() {
  const { db, now } = useDeps()
  const data = useLive(async () => {
    const [settings, songs, chunks, words, cards, reviews, avgSeconds] = await Promise.all([
      getSettings(db), db.songs.toArray(), db.chunks.toArray(), db.words.toArray(), db.cards.toArray(), db.reviews.toArray(), estimateAvgSeconds(db),
    ])
    return { settings, gain: averageGain(songs), stats: progressStats({ settings, songs, chunks, words, cards, reviews, avgSeconds }, now()) }
  }, [db])

  if (!data) return <main class="screen progress" aria-busy="true" />
  const { settings, gain, stats: p } = data
  const minutes = settings.timerMinutes.review
  const lastTest = settings.vocabTests?.at(-1)

  return (
    <main class="screen progress">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'today' })} onClick={onBack({ name: 'today' })} aria-label="Indietro"><Icon name="back" /></a>
        <h1>Progressi</h1>
      </header>

      <section class="card progress-chart">
        <div class="progress-chart-head">
          <h2>Comprensione al primo ascolto</h2>
          {p.currentComprehension !== null && <span class="big-num">{`${p.currentComprehension}%`}</span>}
        </div>
        {p.comprehension.length === 0 ? (
          <p class="note">Segna quanto capisci al primo ascolto quando aggiungi una canzone: qui vedrai come cresce.</p>
        ) : (
          <>
            <ComprehensionChart points={p.comprehension.slice(-9)} threshold={LEVEL_UP.comprehension} />
            <p class="note">{`Ultime ${Math.min(9, p.comprehension.length)} canzoni, dalla più vecchia`}</p>
            <table class="visually-hidden" aria-label="Comprensione per canzone">
              <thead><tr><th>Canzone</th><th>Capita al primo ascolto</th></tr></thead>
              <tbody>{p.comprehension.map((c, i) => <tr key={i}><td>{c.title}</td><td>{`${c.pct}%`}</td></tr>)}</tbody>
            </table>
          </>
        )}
      </section>

      <div class="tiles">
        <section class="tile">
          <span class="note">Lessico attivo</span>
          <span class="tile-num">{p.active}</span>
          <span class="tile-sub">{`${settings.level}: ${p.activeAtLevel} di ${LEVEL_UP.active} per salire`}</span>
        </section>
        <section class="tile">
          <span class="note">Memoria reale</span>
          <span class="tile-num">{p.retention === null ? '—' : comma(p.retention)}</span>
          <span class="tile-sub">{`obiettivo ${comma(settings.desiredRetention)}`}</span>
        </section>
        <section class="tile">
          <span class="note">Guadagno medio</span>
          <span class="tile-num">{gain === null ? '—' : gain > 0 ? `+${gain}` : String(gain)}</span>
          <span class="tile-sub">{gain === null ? 'dopo il riascolto finale' : 'punti a canzone'}</span>
        </section>
        <section class="tile">
          <span class="note">Carico</span>
          <span class="tile-num">{`${Math.round(p.loadMinutesPerDay)}′`}</span>
          <span class="tile-sub">{`al giorno su ${minutes}, prossimi 7`}</span>
        </section>
      </div>

      <a class="tile vt-tile" href={href({ name: 'vocabTest' })}>
        <span class="note">Vocabolario stimato</span>
        {lastTest ? (
          <>
            <span class="tile-num">{`≈ ${formatNumber(lastTest.estimate)} parole`}</span>
            <span class="tile-sub">{`test del ${dayFmt.format(lastTest.at)} · prossimo a ${monthFmt.format(new Date(lastTest.at.getTime() + 90 * 86400000))}`}</span>
          </>
        ) : (
          <span class="tile-sub">Fai il test: 80 parole, circa 4 minuti</span>
        )}
      </a>

      {p.nextLevel && (
        <section class="level-up">
          <h2>{`Verso il ${p.nextLevel}`}</h2>
          <div class="bar" role="progressbar" aria-label={`Verso il ${p.nextLevel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.levelProgress * 100)}>
            <div class="bar-fill" style={{ transform: `scaleX(${p.levelProgress})` }} />
          </div>
          <p class="note">{`Servono ${LEVEL_UP.active} chunk e parole ${settings.level} attivi e il ${LEVEL_UP.comprehension}% al primo ascolto. Quando ci sei, puoi alzare il livello nelle Impostazioni.`}</p>
        </section>
      )}
    </main>
  )
}
