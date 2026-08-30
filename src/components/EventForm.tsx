import { Field, TextArea } from './ui'

export type EventFormValues = {
  name: string
  startsAt: string
  opponent: string
  location: string
  notes: string
}

/**
 * The event's own fields, shared by the create and edit forms so the two can
 * never drift apart. Holds no state: the parent owns the values.
 */
export function EventFields({
  values,
  onChange,
  idPrefix = '',
}: {
  values: EventFormValues
  onChange: (patch: Partial<EventFormValues>) => void
  /** Keeps input ids unique when a create and an edit form share a page. */
  idPrefix?: string
}) {
  return (
    <>
      <Field
        label="Name"
        id={`${idPrefix}name`}
        name="name"
        value={values.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Week 3 — Home"
        maxLength={80}
        required
      />
      <Field
        label="Date and time"
        id={`${idPrefix}startsAt`}
        name="startsAt"
        type="datetime-local"
        value={values.startsAt}
        onChange={(e) => onChange({ startsAt: e.target.value })}
        required
      />
      <Field
        label="Opponent"
        id={`${idPrefix}opponent`}
        name="opponent"
        value={values.opponent}
        onChange={(e) => onChange({ opponent: e.target.value })}
        placeholder="Optional"
        maxLength={60}
      />
      <Field
        label="Location"
        id={`${idPrefix}location`}
        name="location"
        value={values.location}
        onChange={(e) => onChange({ location: e.target.value })}
        placeholder="Aggie Stadium"
        maxLength={80}
      />
      <TextArea
        label="Notes"
        id={`${idPrefix}notes`}
        name="notes"
        value={values.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Optional. Anything the team should know."
        maxLength={400}
      />
    </>
  )
}
