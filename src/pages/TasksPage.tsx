import { useProgram } from '../lib/programContext'
import { NotificationToggle } from '../components/NotificationToggle'
import { Reminders } from '../components/Reminders'
import { canSchedule } from '../lib/reminders'

/**
 * Scheduled tasks for the current program.
 *
 * The composer and queue are staff-only, exactly as they were on the old
 * dashboard; everyone else gets the device notification switch, which is what
 * makes the reminders they receive work at all.
 */
export default function TasksPage() {
  const { program, role } = useProgram()

  return (
    <div className="space-y-2">
      <NotificationToggle />

      {canSchedule(role) ? (
        <Reminders programId={program.id} />
      ) : (
        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
            Reminders
          </h2>
          <p className="mt-2 font-body text-sm text-muted">
            Your coaches schedule reminders for the team. Turn notifications on above and
            they will arrive on this device.
          </p>
        </section>
      )}
    </div>
  )
}
