import {
  DocumentsIcon,
  EquipmentIcon,
  GameDayIcon,
  RegistrationIcon,
  ResourcesIcon,
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
 *
 * A section carrying `staffOnly` is hidden from players and families. That one
 * is only a tidiness measure -- the resource library is a list of public web
 * links, so there is nothing behind it to protect, and the page turns a family
 * away by itself rather than relying on the menu to do it.
 */
export const NAV = [
  { to: 'roster', label: 'Roster & Comms', short: 'Roster', Icon: RosterIcon },
  { to: 'tasks', label: 'Scheduled Tasks', short: 'Tasks', Icon: TasksIcon },
  { to: 'equipment', label: 'Equipment', short: 'Gear', Icon: EquipmentIcon },
  { to: 'game-day', label: 'Game-Day Ops', short: 'Games', Icon: GameDayIcon },
  { to: 'documents', label: 'Documents', short: 'Docs', Icon: DocumentsIcon },
  {
    to: 'registration',
    label: 'Registration',
    short: 'Signup',
    Icon: RegistrationIcon,
    feature: 'registration',
  },
  {
    to: 'resources',
    label: 'Resources',
    short: 'Learn',
    Icon: ResourcesIcon,
    staffOnly: true,
  },
] as const satisfies readonly {
  to: string
  label: string
  short: string
  Icon: (props: { size?: number }) => React.ReactElement
  feature?: Feature
  staffOnly?: boolean
}[]

/**
 * The sections this viewer actually has.
 *
 * `staff` covers org leaders as well as a program's own coaches: an athletic
 * director holds no role inside any single program, so asking isStaff() alone
 * would hide the library from the person most likely to want it.
 */
export function visibleNav(features: readonly Feature[], staff = false) {
  return NAV.filter((section) => {
    if ('feature' in section && !features.includes(section.feature)) return false
    if ('staffOnly' in section && section.staffOnly && !staff) return false
    return true
  })
}
