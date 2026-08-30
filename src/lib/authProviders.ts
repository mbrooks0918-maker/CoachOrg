/**
 * Which third-party sign-in providers this project actually has switched on.
 *
 * Worth checking before starting a flow: signInWithOAuth does not fail when a
 * provider is disabled -- it navigates the browser to Supabase's authorize
 * endpoint, which answers with a raw JSON error page. Asking first means the
 * app can say something useful instead of dumping the user on that page.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

let cached: Record<string, boolean> | null = null

export async function enabledProviders(): Promise<Record<string, boolean>> {
  if (cached) return cached
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: ANON_KEY },
    })
    if (!response.ok) return {}
    const settings = await response.json()
    cached = (settings.external ?? {}) as Record<string, boolean>
    return cached
  } catch {
    // A network failure should not block the attempt; let the flow try.
    return {}
  }
}

export async function providerEnabled(provider: string): Promise<boolean> {
  const providers = await enabledProviders()
  // An empty map means the check itself failed; do not block on that.
  return Object.keys(providers).length === 0 || providers[provider] === true
}
