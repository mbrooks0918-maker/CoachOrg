import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { CODE_TYPES } from '../lib/codes'
import { CodeTile } from '../components/ui'

type Program = { id: string; name: string; sport: string }
type Code = { id: string; code: string; code_type: string }

export default function ProgramDashboard() {
  const { programId } = useParams<{ programId: string }>()
  const [program, setProgram] = useState<Program | null>(null)
  const [codes, setCodes] = useState<Code[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!programId) return
    let active = true

    ;(async () => {
      const [programResult, codesResult] = await Promise.all([
        supabase
          .from('programs')
          .select('id, name, sport')
          .eq('id', programId)
          .single(),
        supabase
          .from('program_codes')
          .select('id, code, code_type')
          .eq('program_id', programId),
      ])

      if (!active) return

      if (programResult.error) setError(programResult.error.message)
      else setProgram(programResult.data)

      if (codesResult.data) setCodes(codesResult.data)
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [programId])

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p className="font-body text-muted">Loading…</p>
      </main>
    )
  }

  if (error || !program) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p
          role="alert"
          className="max-w-md rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 font-body text-sm text-ink"
        >
          {error || 'Program not found.'}
        </p>
      </main>
    )
  }

  // Render in the fixed family / player / staff order rather than whatever
  // order the rows came back in.
  const ordered = CODE_TYPES.map((t) => ({
    ...t,
    row: codes.find((c) => c.code_type === t.type),
  }))

  return (
    <main className="min-h-svh px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
          {program.sport}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
          {program.name}
        </h1>

        <h2 className="mt-12 font-display text-xl font-semibold uppercase tracking-wide text-ink">
          Join codes
        </h2>
        <p className="mt-2 font-body text-sm text-muted">
          Share the right code with each group. Anyone with a code can join.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {ordered.map((t) => (
            <CodeTile
              key={t.type}
              label={t.label}
              blurb={t.blurb}
              code={t.row?.code ?? '—'}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
