import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TopBar } from '../components/ui'
import { Empty, EventList, ProgramCard, Section, Shell, Stat } from '../components/overview'
import { loadGroupOverview, type GroupOverview as Overview } from '../lib/groupOverview'

/**
 * What the person running one sport sees.
 *
 * Organization Overview one level down: the same snapshot, scoped to a group
 * rather than a park. A Program Admin holds soccer across every age division
 * and nothing else, so this page shows every division of theirs and no route
 * to anybody else's.
 *
 * A snapshot, not a control panel -- the same decision the director's view
 * makes. Anything that changes something lives inside the division it belongs
 * to, where the person doing it can see what they are changing.
 */
export default function ProgramGroupOverview() {
  const { groupId = '' } = useParams<{ groupId: string }>()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { overview, error } = await loadGroupOverview(groupId)
      if (!active) return
      if (error) setError(error)
      else setOverview(overview ?? null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [groupId])

  if (loading) {
    return (
      <Shell>
        <p className="font-body text-muted">Loading…</p>
      </Shell>
    )
  }

  if (error || !overview) {
    return (
      <Shell>
        <TopBar />
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink">
          Not your overview
        </h1>
        <p className="mt-3 max-w-md font-body text-base text-muted">{error}</p>
        <Link
          to="/"
          className="mt-8 inline-block font-body text-sm text-accent underline underline-offset-4"
        >
          Back to your team
        </Link>
      </Shell>
    )
  }

  const { group, totals, programs, upcoming_events: events, equipment } = overview

  return (
    <Shell>
      <TopBar />
      <p className="font-body text-xs font-medium uppercase tracking-[0.3em] text-muted">
        Program overview
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-5xl">
        {group.name}
      </h1>
      <p className="mt-3 font-body text-base text-muted">
        Every division of {group.name.toLowerCase()} in one place. Your coaches see only their own.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Children" value={totals.children} note={`${totals.signups} sign-ups`} />
        <Stat label="Confirmed" value={totals.confirmed} />
        <Stat
          label="Waiting"
          value={totals.waitlisted}
          note={totals.waitlisted > 0 ? 'needs a decision' : 'nobody waiting'}
          urgent={totals.waitlisted > 0}
        />
        <Stat
          label="On rosters"
          value={totals.players}
          note={`${totals.programs} divisions`}
        />
      </div>

      <Section title="Divisions" count={programs.length}>
        {programs.length === 0 ? (
          <Empty>No divisions in this group yet.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {programs.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
        )}
      </Section>

      <Section title="What is coming up" count={events.length}>
        <EventList events={events} emptyLine="Nothing scheduled across any division." />
      </Section>

      <Section title="Equipment">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Kinds of item" value={equipment.items} />
          <Stat label="Total pieces" value={equipment.total_quantity} />
          <Stat
            label="Checked out"
            value={equipment.checked_out}
            note={equipment.checked_out > 0 ? 'with players and families' : 'all in the cupboard'}
          />
        </div>
      </Section>
    </Shell>
  )
}
