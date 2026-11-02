/**
 * UUID v4 generato sul dispositivo. `crypto.randomUUID` esiste solo nei contesti sicuri (HTTPS, localhost):
 * aprendo l'app in rete locale via http manca, mentre `crypto.getRandomValues` c'è sempre.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // versione 4
  b[8] = (b[8] & 0x3f) | 0x80 // variante RFC 4122
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
