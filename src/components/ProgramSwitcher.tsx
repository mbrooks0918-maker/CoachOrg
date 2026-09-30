import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { MyProgram } from '../lib/program'

/**
 * The program name, and a way out of it.
 *
 * Everything in the app hangs off one program at a time, and plenty of people
 * belong to more than one -- a director coaching four teams, a parent with two
 * children in four sports between them. Until this existed the app picked one
 * for you on the way in and there was no control anywhere to change it, which
 * made the other teams effectively invisible.
 *
 * With a single program there is nothing to choose, so the name stays a plain
 * link to that program's home and no menu is built. The affordance appears
 * only when it means something.
 *
 * Selecting a program goes to its home rather than to the same section you
 * were on. Sections are not identical between programs -- registration and
 * resources come and go with the organization's plan and your role -- so
 * carrying the path across can land on a section that is not there. Home
 * always exists.
 */
export function ProgramSwitcher({
  programs,
  currentId,
  sport,
  name,
  variant,
}: {
  programs: MyProgram[]
  currentId: string
  sport: string
  name: string
  variant: 'sidebar' | 'header'
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // A menu that cannot be dismissed by clicking away or pressing Escape is a
  // trap on a phone, where there is no obvious "outside" to aim at otherwise.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const sidebar = variant === 'sidebar'

  /**
   * The chevron rides with the program NAME, not with the block.
   *
   * The two layouts order their lines differently -- the sidebar leads with the
   * name, the mobile header leads with the sport -- so a chevron aligned to the
   * top of the block lands beside the name in one and beside the sport in the
   * other, where it reads as belonging to nothing. Putting it on the name's own
   * line is the only placement that is right in both.
   */
  function label(withChevron: boolean) {
    const chevron = withChevron ? (
      <span
        aria-hidden="true"
        className={`shrink-0 font-mono text-xs text-muted transition ${open ? 'rotate-180' : ''}`}
      >
        ▾
      </span>
    ) : null

    return sidebar ? (
      <>
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate font-display text-xl font-bold uppercase leading-tight tracking-tight text-ink">
            {name}
          </span>
          {chevron}
        </span>
        <span className="mt-1 block font-body text-xs uppercase tracking-wider text-muted">
          {sport}
        </span>
      </>
    ) : (
      <>
        <span className="block font-body text-[0.65rem] font-medium uppercase tracking-[0.3em] text-muted">
          {sport}
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="min-w-0 truncate font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">
            {name}
          </span>
          {chevron}
        </span>
      </>
    )
  }

  // Nothing to switch between: the name behaves exactly as it always did.
  if (programs.length < 2) {
    return (
      <Link
        to=""
        className={
          sidebar
            ? 'block border-b border-border px-6 py-5 transition hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'
            : 'block min-w-0 focus-visible:outline-none'
        }
      >
        {label(false)}
      </Link>
    )
  }

  return (
    <div ref={boxRef} className={sidebar ? 'relative border-b border-border' : 'relative min-w-0'}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          sidebar
            ? 'block w-full px-6 py-5 text-left transition hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'
            : 'block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        }
      >
        {label(true)}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-40 overflow-hidden rounded-xl border border-border bg-raised shadow-xl ${
            sidebar ? 'left-3 right-3 top-full mt-1' : 'left-0 right-0 top-full mt-2'
          }`}
        >
          <p className="border-b border-border px-4 py-2.5 font-body text-[0.6rem] font-medium uppercase tracking-[0.25em] text-muted">
            Your programs
          </p>
          <ul className="max-h-72 overflow-y-auto py-1">
            {programs.map((p) => {
              const current = p.id === currentId
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      navigate(`/program/${p.id}`)
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left font-body text-sm transition hover:bg-accent/10 focus-visible:outline-none focus-visible:bg-accent/10 ${
                      current ? 'text-accent' : 'text-ink'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {current && (
                      <span aria-label="Currently open" className="shrink-0 font-mono text-xs">
                        ●
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
