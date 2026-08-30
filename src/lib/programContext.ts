import { createContext, use } from 'react'

export type Program = { id: string; name: string; sport: string }

export type ProgramContextValue = {
  program: Program
  /** The signed-in user's role in this program; null for an org admin. */
  role: string | null
}

/**
 * Lives apart from AppShell so that file exports only components, which is
 * what keeps fast refresh working during development.
 */
export const ProgramContext = createContext<ProgramContextValue | null>(null)

/** Program and role for the current route, loaded once by the shell. */
export function useProgram(): ProgramContextValue {
  const value = use(ProgramContext)
  if (!value) throw new Error('useProgram must be used inside AppShell')
  return value
}
