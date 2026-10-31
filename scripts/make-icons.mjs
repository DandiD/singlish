// Genera public/icons/icon-192.png e icon-512.png senza dipendenze (solo node:zlib).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [0x11, 0x13, 0x17]
const FG = [0xff, 0x8a, 0x4c]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// Distanza da un segmento, per disegnare la "S" come tre archi/tratti spessi.
const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Polilinea della S in coordinate normalizzate 0..1 (entro la zona sicura maskable).
const pts = []
const arc = (cx, cy, r, a0, a1, n = 24) => {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
}
// arco superiore (da destra-alto, in senso antiorario, fino al centro) poi arco inferiore (orario)
arc(0.5, 0.38, 0.12, -0.15 * Math.PI, -1.5 * Math.PI)
const upper = pts.splice(0)
arc(0.5, 0.62, 0.12, -0.5 * Math.PI, 0.85 * Math.PI)
const lower = pts.splice(0)
const path = [...upper, ...lower]

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  const w = 0.04
  const aa = 1.5 / size
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size, py = (y + 0.5) / size
      let d = Infinity
      for (let i = 1; i < path.length; i++) {
        d = Math.min(d, distSeg(px, py, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]))
      }
      const cov = Math.max(0, Math.min(1, (w - d) / aa + 0.5))
      const o = y * (size * 3 + 1) + 1 + x * 3
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * cov)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s))
