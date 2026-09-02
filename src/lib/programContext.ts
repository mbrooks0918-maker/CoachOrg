import { createContext, use } from 'react'
import type { Feature } from './features'

export type Program = { id: string; name: string; sport: string; organization_id: string }

export type ProgramContextValue = {
  program: Program
  /** The signed-in user's role in this program; null for an org admin. */
  role: string | null
  /** The viewer's own program_members.id; null for an org admin. */
  memberId: string | null
  /** The viewer's auth user id. */
  userId: string | null
  /** Capabilities this program's organization has unlocked. */
  features: Feature[]
  /**
   * Owner or athletic director of the organization above this program.
   * Deliberately not "runs a team": a head coach of every program in the park
   * is still not the person the organization-level view is for.
   */
  orgLeader: boolean
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

/**
 * "Is this capability switched on for this organization?"
 *
 * Hiding a screen is a courtesy, not a lock -- every feature is also enforced
 * by the database policies behind it, so a determined user gains nothing by
 * getting the interface to render.
 */
export function useHasFeature(feature: Feature): boolean {
  return useProgram().features.includes(feature)
}
