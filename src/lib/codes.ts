// Join-code generation.
//
// Codes get read aloud across a parking lot and typed by parents on phones, so
// the alphabet drops every glyph pair that looks alike in a condensed face:
// no I/1, no L, no O/0. What is left is 31 symbols.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const CODE_TYPES = [
  { type: 'family', segment: 'FAM', label: 'Family', blurb: 'Parents and guardians' },
  { type: 'player', segment: 'PLYR', label: 'Player', blurb: 'Athletes on the roster' },
  { type: 'staff', segment: 'STAFF', label: 'Staff', blurb: 'Assistant coaches and managers' },
] as const

export type CodeType = (typeof CODE_TYPES)[number]['type']

/**
 * Random suffix drawn uniformly from ALPHABET.
 *
 * Values at or above the largest whole multiple of the alphabet length are
 * discarded rather than folded with `%`, which would quietly make the first
 * few letters more likely than the rest.
 */
export function randomSuffix(length = 4): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  let out = ''
  while (out.length < length) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b >= limit) continue
      out += ALPHABET[b % ALPHABET.length]
      if (out.length === length) break
    }
  }
  return out
}

/** "Albertville High School" -> "ALB". Falls back to ORG for nameless input. */
export function orgPrefix(organizationName: string): string {
  const letters = organizationName.toUpperCase().replace(/[^A-Z]/g, '')
  return letters ? letters.slice(0, 3).padEnd(3, 'X') : 'ORG'
}

/** e.g. ALB-FAM-7K2Q */
export function buildCode(prefix: string, segment: string): string {
  return `${prefix}-${segment}-${randomSuffix()}`
}
