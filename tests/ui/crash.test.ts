import { afterEach, expect, test } from 'vitest'
import { installCrashFallback } from '../../src/ui/crash'

let stop: (() => void) | undefined
afterEach(() => { stop?.(); document.body.innerHTML = '' })

function setup(content = '') {
  const root = document.createElement('div')
  root.innerHTML = content
  document.body.appendChild(root)
  stop = installCrashFallback(window, root)
  return root
}

const fire = (error: unknown) => window.dispatchEvent(new ErrorEvent('error', { error, message: String(error) }))

test('app sparita per un errore: al posto del nero una pagina che lo dice, con i dettagli e Ricarica', () => {
  const root = setup()
  fire(new TypeError('x is undefined'))
  expect(root.querySelector('h1')!.textContent).toBe('L\'app si è bloccata')
  expect(root.querySelector('details')!.textContent).toContain('TypeError: x is undefined')
  expect(root.querySelector('button')!.textContent).toBe('Ricarica')
})

test('app ancora a schermo: un errore non la sostituisce', () => {
  const root = setup('<main>Oggi</main>')
  fire(new TypeError('x'))
  expect(root.textContent).toBe('Oggi')
})
