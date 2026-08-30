// Icons for the four sections of a program. The list that pairs them with
// routes lives in lib/navSections, which keeps this file exporting components
// only.
//
// Icons are inline so the app keeps no icon dependency. All four share a
// square box and inherit colour from whatever renders them, which is what
// drives the nav's active state and the tiles' hover state alike.

type IconProps = { size?: number }

function shared(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

export const RosterIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="8" r="3.25" />
    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.38M15.6 5.2a3.25 3.25 0 0 1 0 5.6" />
  </svg>
)

export const TasksIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <path d="M18 9a6 6 0 1 0-12 0c0 4.5-1.75 5.75-1.75 5.75h15.5S18 13.5 18 9Z" />
    <path d="M10.4 18.5a2 2 0 0 0 3.2 0" />
  </svg>
)

export const EquipmentIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <path d="M3.5 8.5 12 4l8.5 4.5v7L12 20l-8.5-4.5v-7Z" />
    <path d="M3.5 8.5 12 13l8.5-4.5M12 13v7" />
  </svg>
)

export const GameDayIcon = ({ size = 22 }: IconProps) => (
  <svg {...shared(size)}>
    <path d="M5 21V4" />
    <path d="M5 5h11.5l-1.75 3.25L16.5 11.5H5" />
  </svg>
)
