import { Field } from './ui'
import { CATEGORIES, type ItemInput } from '../lib/equipment'

/**
 * The fields of one equipment item, shared by the add and edit forms so the
 * two cannot drift apart. Holds no state: the parent owns the values.
 */
export function EquipmentFields({
  values,
  onChange,
  idPrefix = '',
}: {
  values: ItemInput
  onChange: (patch: Partial<ItemInput>) => void
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
        placeholder="Riddell helmet"
        maxLength={80}
        required
      />

      <div>
        <Field
          label="Category"
          id={`${idPrefix}category`}
          name="category"
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="Helmets"
          maxLength={40}
          required
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onChange({ category })}
              className={`rounded-full border px-3 py-1.5 font-body text-xs transition ${
                values.category === category
                  ? 'border-accent bg-accent/20 font-semibold text-ink'
                  : 'border-border text-muted hover:border-accent/50 hover:text-ink'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <Field
        label="How many"
        id={`${idPrefix}totalQuantity`}
        name="totalQuantity"
        type="number"
        min={1}
        step={1}
        value={values.totalQuantity}
        onChange={(e) => onChange({ totalQuantity: e.target.value })}
        hint="Total the program owns, not how many are free right now."
        required
      />

      <Field
        label="Condition or notes"
        id={`${idPrefix}condition`}
        name="condition"
        value={values.condition}
        onChange={(e) => onChange({ condition: e.target.value })}
        placeholder="Optional. Reconditioned 2025."
        maxLength={200}
      />

      <Field
        label="Purchase date"
        id={`${idPrefix}purchaseDate`}
        name="purchaseDate"
        type="date"
        value={values.purchaseDate}
        onChange={(e) => onChange({ purchaseDate: e.target.value })}
        hint="Optional."
      />
    </>
  )
}
