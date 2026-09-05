// Section icons.
//
// Drawn to the Huddle mark's language rather than pulled from an icon set:
// rounded geometry, generous corner radii, and a filled dot wherever a dot
// carries meaning -- a head, a centre spot, a clock's pivot. The mark itself is
// four dots ringing a space, and these are meant to look like they came from
// the same hand.
//
// Two consequences of that, both deliberate. The stroke is heavier than a
// generic outline set (2 rather than 1.75) so the icons hold their weight
// beside semibold Instrument Sans instead of looking wiry. And several read as
// a plan seen from above -- the pitch especially -- which is the same view the
// mark takes of a huddle.
//
// Everything inherits currentColor, which is what drives the nav's active
// state and the tiles' hover state alike. The list pairing them with routes
// lives in lib/navSections, keeping this file exporting components only.

type IconProps = { size?: number }

function shared(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

/** Two people. The heads are filled, which is the mark's dot doing the work. */
export const RosterIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <circle cx="9.2" cy="8.4" r="3" fill="currentColor" stroke="none" />
    <path d="M3.6 19.6v-1.4a4.4 4.4 0 0 1 4.4-4.4h2.4a4.4 4.4 0 0 1 4.4 4.4v1.4" />
    <circle cx="17.6" cy="9.8" r="2.2" fill="currentColor" stroke="none" />
    <path d="M17 14a3.6 3.6 0 0 1 3.4 3.6v2" />
  </svg>
)

/** A clock, pivoting on a filled dot. */
export const TasksIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 12V7.4M12 12l3.4 2.1" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

/** A kit bag. The dot is the ball inside it. */
export const EquipmentIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <path d="M9 7.4v-.9a2.1 2.1 0 0 1 2.1-2.1h1.8A2.1 2.1 0 0 1 15 6.5v.9" />
    <rect x="3.4" y="7.4" width="17.2" height="11.6" rx="2.8" />
    <circle cx="12" cy="13.2" r="1.9" fill="currentColor" stroke="none" />
  </svg>
)

/** A pitch from above: halfway line, centre spot. The mark's own point of view. */
export const GameDayIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.6" />
    <path d="M3.4 12h17.2" />
    <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
  </svg>
)

/** A page, told apart from the sign-up form by its folded corner. */
export const DocumentsIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <path d="M13.9 3.6H7.7a2.1 2.1 0 0 0-2.1 2.1v12.6a2.1 2.1 0 0 0 2.1 2.1h8.6a2.1 2.1 0 0 0 2.1-2.1V8.2Z" />
    <path d="M13.7 3.7v3.3a1.2 1.2 0 0 0 1.2 1.2h3.4" />
    <path d="M9.2 13.4h5.6M9.2 16.6h3.4" />
  </svg>
)

/** Somebody joining: a person, and a plus. Not another rectangle with lines. */
export const RegistrationIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <circle cx="9.4" cy="8" r="2.9" fill="currentColor" stroke="none" />
    <path d="M3.8 19.6v-1.4a4.4 4.4 0 0 1 4.4-4.4h2.4a4.4 4.4 0 0 1 4.4 4.4v1.4" />
    <path d="M18.4 13.8v5.2M15.8 16.4h5.2" />
  </svg>
)
