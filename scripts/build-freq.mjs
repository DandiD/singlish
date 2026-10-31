#!/usr/bin/env node
// Usage: node scripts/build-freq.mjs <input.tsv> [--top 20000]
// Input lines: lemma<TAB>rank. Writes public/freq.json (array of lemmas ordered by rank).
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const topIdx = args.indexOf('--top')
let top = 20000
if (topIdx !== -1) {
  top = Number(args[topIdx + 1])
  args.splice(topIdx, 2)
}
const input = args[0]
if (!input || !Number.isInteger(top) || top < 1) {
  console.error('Usage: node scripts/build-freq.mjs <input.tsv> [--top 20000]')
  process.exit(1)
}

const rows = []
for (const line of readFileSync(input, 'utf8').split(/\r?\n/)) {
  const [lemmaRaw, rankRaw] = line.split('\t')
  const lemma = lemmaRaw?.trim().toLowerCase()
  const rank = Number(rankRaw)
  if (!lemma || rankRaw === undefined || rankRaw.trim() === '' || !Number.isFinite(rank)) continue
  rows.push({ lemma, rank })
}
rows.sort((a, b) => a.rank - b.rank)

const seen = new Set()
const lemmas = []
for (const { lemma } of rows) {
  if (seen.has(lemma)) continue
  seen.add(lemma)
  lemmas.push(lemma)
  if (lemmas.length >= top) break
}

writeFileSync(new URL('../public/freq.json', import.meta.url), JSON.stringify(lemmas) + '\n')
console.log(`wrote ${lemmas.length} lemmas to public/freq.json`)
