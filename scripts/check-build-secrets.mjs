// Dopo la build: la chiave Gemini di .env / .env.local non deve mai finire nei file costruiti.
// Non stampa mai la chiave.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const keys = ['.env', '.env.local', '.env.production', '.env.production.local']
  .filter((f) => existsSync(f))
  .flatMap((f) => readFileSync(f, 'utf8').split('\n'))
  .map((l) => /^\s*VITE_GEMINI_API_KEY\s*=\s*['"]?([^'"\s#]+)/.exec(l)?.[1])
  .filter((k) => k && k.length >= 8)

const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? files(p) : [p]
})

const leaks = existsSync('dist') ? files('dist').filter((f) => keys.some((k) => readFileSync(f, 'latin1').includes(k))) : []
if (leaks.length) {
  console.error(`La chiave Gemini è finita nella build (${leaks.join(', ')}). Non pubblicare questa build.`)
  process.exit(1)
}
console.log(keys.length ? 'Build controllata: nessuna chiave Gemini nei file costruiti.' : 'Build controllata: nessuna chiave in .env da cercare.')
