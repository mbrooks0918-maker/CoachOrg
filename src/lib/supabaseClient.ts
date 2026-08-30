import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // All three are the library defaults. They are spelled out because the
    // app depends on them: the session has to outlive a closed tab, refresh
    // itself before the hour is up, and pick up the code Google sends back.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
