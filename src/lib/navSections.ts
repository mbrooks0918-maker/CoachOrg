import {
  DocumentsIcon,
  EquipmentIcon,
  GameDayIcon,
  RosterIcon,
  TasksIcon,
} from '../components/navItems'

/**
 * The four sections of a program, in order.
 *
 * Shared by the navigation shell and the home screen so a section cannot
 * appear in the tab bar and go missing from the tiles, or vice versa.
 */
export const NAV = [
  { to: 'roster', label: 'Roster & Comms', short: 'Roster', Icon: RosterIcon },
  { to: 'tasks', label: 'Scheduled Tasks', short: 'Tasks', Icon: TasksIcon },
  { to: 'equipment', label: 'Equipment', short: 'Gear', Icon: EquipmentIcon },
  { to: 'game-day', label: 'Game-Day Ops', short: 'Game Day', Icon: GameDayIcon },
  { to: 'documents', label: 'Documents', short: 'Docs', Icon: DocumentsIcon },
] as const
