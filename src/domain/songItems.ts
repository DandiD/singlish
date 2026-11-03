import type { Chunk, Song, Word } from '../db/types'

export interface Span { text: string; id: string; className: string }
export type Segment = { text: string } | Span

const fold = (s: string): string => s.replace(/[’‘]/g, "'").toLowerCase()

/** La prima forma che compare davvero nel verso (es. forma del verso, forma originale, forma base); altrimenti la prima. */
export function formIn(line: string, forms: (string | undefined)[]): string {
  const hay = fold(line)
  const list = forms.filter((f): f is string => !!f && !!f.trim())
  return list.find((f) => hay.includes(fold(f).trim())) ?? list[0] ?? ''
}

/** Divide la riga in segmenti: testo semplice e span evidenziati (primo match per span, il più lungo vince). */
export function highlightLine(line: string, spans: Span[]): Segment[] {
  const hay = fold(line)
  const found: { start: number; end: number; span: Span }[] = []
  for (const span of spans) {
    const needle = fold(span.text).trim()
    if (!needle) continue
    const start = hay.indexOf(needle)
    if (start >= 0) found.push({ start, end: start + needle.length, span })
  }
  found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)
  const chosen: typeof found = []
  for (const f of found) {
    if (chosen.every((c) => f.end <= c.start || f.start >= c.end)) chosen.push(f)
  }
  chosen.sort((a, b) => a.start - b.start)

  const out: Segment[] = []
  let pos = 0
  for (const c of chosen) {
    if (c.start > pos) out.push({ text: line.slice(pos, c.start) })
    out.push({ text: line.slice(c.start, c.end), id: c.span.id, className: c.span.className })
    pos = c.end
  }
  if (pos < line.length) out.push({ text: line.slice(pos) })
  return out
}

export const CHUNK_CLASS: Record<Chunk['type'], string> = {
  phrasal_verb: 'pv', idiom: 'id', collocation: 'co', fixed_phrase: 'fp', slang: 'sl',
}

/**
 * Le voci di una canzone, verso per verso: chunk non sospesi e parole non sospese e non note che compaiono
 * davvero nel verso (forma del verso, forma originale o forma base) e che l'evidenziazione mostra (fra voci
 * sovrapposte vince la più lunga, come nel testo). Lo Studio evidenzia e conta queste; Oggi conta queste.
 */
export function itemsInSong(song: Song, chunks: Chunk[], words: Word[]): {
  spansByLine: Span[][]
  chunks: Set<string>
  words: Set<string>
} {
  const spansByLine: Span[][] = song.lines.map(() => [])
  const place = (item: Chunk | Word, className: string) => {
    for (const ctx of item.contexts) {
      if (ctx.songId !== song.id || !spansByLine[ctx.lineIndex]) continue
      const form = formIn(song.lines[ctx.lineIndex], [ctx.surfaceForm, item.surfaceForm, 'type' in item ? item.baseForm : item.lemma])
      if (form && fold(song.lines[ctx.lineIndex]).includes(fold(form).trim())) {
        spansByLine[ctx.lineIndex].push({ text: form, id: item.id, className })
      }
    }
  }
  for (const c of chunks) if (!c.suspended) place(c, CHUNK_CLASS[c.type])
  for (const w of words) if (!w.suspended && w.triage !== 'known') place(w, 'w')
  song.connectedSpeech.forEach((cs, k) => spansByLine[cs.lineIndex]?.push({ text: cs.written, id: `cs:${k}`, className: 'cs' }))

  const shown = new Set<string>()
  spansByLine.forEach((spans, i) => {
    for (const seg of highlightLine(song.lines[i], spans)) if ('id' in seg) shown.add(seg.id)
  })
  const chunkIds = new Set(chunks.map((c) => c.id))
  const wordIds = new Set(words.map((w) => w.id))
  return {
    spansByLine,
    chunks: new Set([...shown].filter((id) => chunkIds.has(id))),
    words: new Set([...shown].filter((id) => wordIds.has(id))),
  }
}
