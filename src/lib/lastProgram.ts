/**
 * The program this person was last looking at.
 *
 * Kept in localStorage rather than the database on purpose. It is a
 * convenience, not a fact about the organization: which team a coach had open
 * on their phone should not follow them to the laptop in the office, and it is
 * not worth a table, a policy and a round trip on every landing. Storage can
 * refuse (private windows, cleared site data), so every read and write is
 * guarded and a miss just falls through to the deterministic default.
 *
 * Keyed by user id so a shared device does not hand one person another's team.
 */
const KEY = 'teamops:last-program'

export function rememberLastProgram(userId: string, programId: string): void {
  try {
    localStorage.setItem(`${KEY}:${userId}`, programId)
  } catch {
    // Nothing to do: the fallback covers it.
  }
}

export function readLastProgram(userId: string): string | null {
  try {
    return localStorage.getItem(`${KEY}:${userId}`)
  } catch {
    return null
  }
}
