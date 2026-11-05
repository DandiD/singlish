import type { ActivityDay } from '../../domain/progress'

const dayFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })
const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Le ultime 12 settimane: una colonna per settimana (lunedì in alto), un quadrato per giorno. I giorni futuri non si disegnano. */
export function ActivityCalendar({ weeks }: { weeks: ActivityDay[][] }) {
  const days = weeks.flat().filter((d) => !d.future)
  const active = days.filter((d) => d.reviews > 0).length
  const rows = days.filter((d) => d.reviews > 0 || d.free)
  return (
    <>
      <div class="cal" role="img" aria-label={`Ultime 12 settimane: ${active} ${active === 1 ? 'giorno' : 'giorni'} con ripassi`}>
        {days.map((d) => (
          <span key={d.key} class="cal-cell" data-day={d.key} data-level={d.level} data-free={d.free && d.reviews === 0 ? 'true' : 'false'} />
        ))}
      </div>
      <table class="visually-hidden" aria-label="Ripassi per giorno">
        <thead><tr><th>Giorno</th><th>Ripassi</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.key}><td>{dayFmt.format(parseKey(d.key))}</td><td>{d.free && d.reviews === 0 ? `${d.reviews}, giorno libero` : d.reviews}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
