import { createContext } from 'preact'
import type { ComponentChildren } from 'preact'
import { useContext } from 'preact/hooks'
import { db, type SinglishDB } from '../db/db'

export type AppDeps = {
  db: SinglishDB
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => Date
}

const defaultDeps: AppDeps = {
  db,
  fetch: (...args) => window.fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => new Date(),
}

export const AppDepsContext = createContext<AppDeps>(defaultDeps)

export function useDeps(): AppDeps {
  return useContext(AppDepsContext)
}

export function AppDepsProvider({ value, children }: { value: AppDeps; children: ComponentChildren }) {
  return <AppDepsContext.Provider value={value}>{children}</AppDepsContext.Provider>
}
