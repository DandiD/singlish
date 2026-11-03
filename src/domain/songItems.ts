import type { Chunk, Song, Word } from '../db/types'

export interface Span { text: string; id: string; className: string }
export type Segment = { text: string } | Span

const fold = (s: string): string => s.replace(/[’‘]/g, "'").toLowerCase()

// Forme irregolari comuni (verbi e plurali): servono solo per i dati salvati senza la forma del verso,
// per riconoscere «ran out of» quando la voce è «run out of». Corrispondenza esatta, parola intera.
const IRREGULAR_LIST = `be:am,is,are,was,were,been,being;become:became;begin:began,begun;bend:bent;bet:bet;bite:bit,bitten;
bleed:bled;blow:blew,blown;break:broke,broken;bring:brought;build:built;burn:burnt;buy:bought;catch:caught;
choose:chose,chosen;come:came;cost:cost;creep:crept;cut:cut;deal:dealt;dig:dug;do:did,done,does;draw:drew,drawn;
dream:dreamt;drink:drank,drunk;drive:drove,driven;eat:ate,eaten;fall:fell,fallen;feed:fed;feel:felt;fight:fought;
find:found;flee:fled;fly:flew,flown;forget:forgot,forgotten;forgive:forgave,forgiven;freeze:froze,frozen;
get:got,gotten;give:gave,given;go:went,gone,goes;grow:grew,grown;hang:hung;have:had,has;hear:heard;hide:hid,hidden;
hit:hit;hold:held;hurt:hurt;keep:kept;kneel:knelt;know:knew,known;lay:laid;lead:led;lean:leant;leap:leapt;
learn:learnt;leave:left;lend:lent;let:let;lie:lay,lain;light:lit;lose:lost;make:made;mean:meant;meet:met;pay:paid;
put:put;quit:quit;read:read;ride:rode,ridden;ring:rang,rung;rise:rose,risen;run:ran;say:said;see:saw,seen;
seek:sought;sell:sold;send:sent;set:set;shake:shook,shaken;shine:shone;shoot:shot;show:shown;shut:shut;
sing:sang,sung;sink:sank,sunk;sit:sat;sleep:slept;slide:slid;speak:spoke,spoken;spend:spent;spin:spun;
spit:spat;split:split;spread:spread;stand:stood;steal:stole,stolen;stick:stuck;sting:stung;strike:struck;
swear:swore,sworn;sweep:swept;swim:swam,swum;swing:swung;take:took,taken;teach:taught;tear:tore,torn;tell:told;
think:thought;throw:threw,thrown;understand:understood;wake:woke,woken;wear:wore,worn;weep:wept;win:won;
wind:wound;write:wrote,written;child:children;man:men;woman:women;foot:feet;tooth:teeth;mouse:mice;
person:people;life:lives;wife:wives;knife:knives;leaf:leaves;wolf:wolves;half:halves;self:selves`
const IRREGULAR = new Map(
  IRREGULAR_LIST.replace(/\s+/g, '').split(';').map((e) => {
    const [lemma, forms] = e.split(':')
    return [lemma, forms.split(',')] as const
  }),
)

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasWords = (hay: string, phrase: string) => new RegExp(`(^|[^a-z'])${escapeRe(phrase)}($|[^a-z'])`).test(hay)

/** Le forme irregolari di una voce: il primo termine (verbo del chunk o parola) nelle sue forme irregolari. */
function irregularVariants(base: string): string[] {
  const [head, ...rest] = fold(base).trim().split(/\s+/)
  return (IRREGULAR.get(head) ?? []).map((f) => [f, ...rest].join(' '))
}

/**
 * La forma con cui la voce compare nel verso: una delle forme date a parola intera, poi una forma irregolare
 * della forma base (parola intera), poi una delle forme date come pezzo di parola. Se nessuna compare, la prima.
 */
export function formIn(line: string, forms: (string | undefined)[]): string {
  const hay = fold(line)
  const list = forms.filter((f): f is string => !!f && !!f.trim())
  const base = list[list.length - 1]
  return (
    list.find((f) => hasWords(hay, fold(f).trim())) ?? // parola intera: «children», non «child» dentro «children»
    (base ? irregularVariants(base).find((v) => hasWords(hay, v)) : undefined) ??
    list.find((f) => hay.includes(fold(f).trim())) ?? // pezzo di parola: «wander» dentro «wandered»
    list[0] ??
    ''
  )
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
 * Le voci di una canzone: chunk non sospesi e parole non sospese e non note con un verso nella canzone.
 * `spansByLine` sono le evidenziazioni (forma trovata nel verso; fra voci sovrapposte vince la più lunga, come
 * nel testo); `unshown` le voci che il testo non riesce a evidenziare, da mostrare a parte perché restino
 * raggiungibili. Lo Studio conta tutte le voci (evidenziate + a parte); Oggi conta le stesse.
 */
export function itemsInSong(song: Song, chunks: Chunk[], words: Word[]): {
  spansByLine: Span[][]
  chunks: Set<string>
  words: Set<string>
  unshown: (Chunk | Word)[]
} {
  const inSong = (i: Chunk | Word) => i.contexts.some((x) => x.songId === song.id)
  const myChunks = chunks.filter((c) => !c.suspended && inSong(c))
  const myWords = words.filter((w) => !w.suspended && w.triage !== 'known' && inSong(w))

  const spansByLine: Span[][] = song.lines.map(() => [])
  const place = (item: Chunk | Word, className: string) => {
    for (const ctx of item.contexts) {
      if (ctx.songId !== song.id || !spansByLine[ctx.lineIndex]) continue
      const line = song.lines[ctx.lineIndex]
      const form = formIn(line, [ctx.surfaceForm, item.surfaceForm, 'type' in item ? item.baseForm : item.lemma])
      if (form && fold(line).includes(fold(form).trim())) spansByLine[ctx.lineIndex].push({ text: form, id: item.id, className })
    }
  }
  for (const c of myChunks) place(c, CHUNK_CLASS[c.type])
  for (const w of myWords) place(w, 'w')
  song.connectedSpeech.forEach((cs, k) => spansByLine[cs.lineIndex]?.push({ text: cs.written, id: `cs:${k}`, className: 'cs' }))

  const shown = new Set<string>()
  spansByLine.forEach((spans, i) => {
    for (const seg of highlightLine(song.lines[i], spans)) if ('id' in seg) shown.add(seg.id)
  })
  return {
    spansByLine,
    chunks: new Set(myChunks.map((c) => c.id)),
    words: new Set(myWords.map((w) => w.id)),
    unshown: [...myChunks, ...myWords].filter((i) => !shown.has(i.id)),
  }
}
