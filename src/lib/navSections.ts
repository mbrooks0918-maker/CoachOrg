import {
  DocumentsIcon,
  EquipmentIcon,
  GameDayIcon,
  RegistrationIcon,
  RosterIcon,
  TasksIcon,
} from '../components/navItems'
import type { Feature } from './features'

/**
 * The sections of a program, in order.
 *
 * Shared by the navigation shell and the home screen so a section cannot
 * appear in the tab bar and go missing from the tiles, or vice versa.
 *
 * A section carrying `feature` exists only for an organization that has that
 * capability unlocked. Leaving it out of the navigation is a courtesy: the
 * policies behind the section check the same thing, so a typed URL finds
 * nothing to read or write.
 */
export const NAV = [
  { to: 'roster', label: 'Roster & Comms', short: 'Roster', Icon: RosterIcon },
  { to: 'tasks', label: 'Scheduled Tasks', short: 'Tasks', Icon: TasksIcon },
  { to: 'equipment', label: 'Equipment', short: 'Gear', Icon: EquipmentIcon },
  { to: 'game-day', label: 'Game-Day Ops', short: 'Game Day', Icon: GameDayIcon },
  { to: 'documents', label: 'Documents', short: 'Docs', Icon: DocumentsIcon },
  {
    to: 'registration',
    label: 'Registration',
    short: 'Sign-ups',
    Icon: RegistrationIcon,
    feature: 'registration',
  },
] as const satisfies readonly {
  to: string
  label: string
  short: string
  Icon: (props: { size?: number }) => React.ReactElement
  feature?: Feature
}[]

/** The sections this organization actually has. */
export function visibleNav(features: readonly Feature[]) {
  return NAV.filter((section) => !('feature' in section) || features.includes(section.feature))
}
