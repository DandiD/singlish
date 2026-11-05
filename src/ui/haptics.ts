import type { Settings } from '../db/types'

/** Una vibrazione brevissima, se l'impostazione non è spenta e il dispositivo la sa fare (iPhone no). Mai errori. */
export function buzz(
  settings: Pick<Settings, 'haptics'>,
  nav: { vibrate?: (ms: number) => boolean } = typeof navigator === 'undefined' ? {} : navigator,
): void {
  if (settings.haptics === false) return
  try {
    if (typeof nav.vibrate === 'function') nav.vibrate(10)
  } catch {
    /* la vibrazione è un di più */
  }
}
