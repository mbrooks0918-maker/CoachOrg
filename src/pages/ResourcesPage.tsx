import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, ErrorNote, Field, TextArea } from '../components/ui'
import { ResourcesIcon } from '../components/navItems'
import { useProgram } from '../lib/programContext'
import { isStaff } from '../lib/roster'
import {
  addResource,
  deleteCategory,
  deleteResource,
  extractYouTubeId,
  loadResources,
  normaliseUrl,
  renameCategory,
  type Resource,
  type ResourceCategory,
} from '../lib/resources'

/**
 * The coaching library.
 *
 * Organization-scoped, not scoped to the program whose navigation you arrived
 * through -- a coach looking up concussion guidance should not have to
 * remember which team they were looking at.
 *
 * Staff curate it, and there is no author check anywhere on this screen: it is
 * shared organization content, so the assistant who deletes the head coach's
 * dead link is doing the job, not overstepping.
 *
 * Videos are not framed until asked for. A page that mounts an iframe per
 * video on load pulls in several hundred kilobytes and lets Google set cookies
 * on a screen otherwise full of children's names, so each one starts as a
 * poster and becomes a player on a click.
 */
export default function ResourcesPage() {
  const { program, role, orgLeader } = useProgram()
  const organizationId = program.organization_id

  // Staff, and org leaders too: an athletic director carries no role in any
  // single program, so isStaff() alone would lock them out of their own
  // organization's library.
  const staff = isStaff(role) || orgLeader

  const [categories, setCategories] = useState<ResourceCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    const { categories, error } = await loadResources(organizationId)
    setCategories(categories)
    setError(error)
    setLoading(false)
  }, [organizationId])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { categories, error } = await loadResources(organizationId)
      if (!active) return
      setCategories(categories)
      setError(error)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [organizationId])

  if (!staff) {
    return (
      <div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Resources
        </h2>
        <p className="mt-2 font-body text-sm text-muted">
          The coaching library is for your team's staff. Ask a coach if there is
          something in it you need.
        </p>
      </div>
    )
  }

  if (loading) return <p className="font-body text-muted">Loading…</p>

  const total = categories.reduce((sum, category) => sum + category.items.length, 0)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Resources
        </h2>
        <span className="font-body text-sm text-muted">
          {total} {total === 1 ? 'link' : 'links'}
        </span>
      </div>
      <p className="mt-2 font-body text-sm text-muted">
        Training, certification and drills for youth coaches. The whole library
        is here whatever program you came in through — safety applies to
        everyone, and next season may be a different sport. Anything you add is
        visible to every coach in your organization.
      </p>

      <ErrorNote>{error}</ErrorNote>

      {adding ? (
        <AddForm
          organizationId={organizationId}
          categories={categories}
          onCancel={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false)
            await refresh()
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setError('')
            setAdding(true)
          }}
          className="mt-6 w-full rounded-xl border border-dashed border-border px-5 py-4 font-body text-sm text-muted transition hover:border-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          + Add a resource
        </button>
      )}

      {categories.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            Icon={ResourcesIcon}
            title="Nothing in the library"
            line="Add a course, a drill video or a link you keep sending people, and every coach in your organization will find it here."
          />
        </div>
      ) : (
        categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            onChanged={refresh}
            onError={setError}
          />
        ))
      )}

      <p className="mt-12 font-body text-xs text-muted">
        Links open on the provider's own site.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ section */

function CategorySection({
  category,
  onChanged,
  onError,
}: {
  category: ResourceCategory
  onChanged: () => Promise<void>
  onError: (message: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(category.title)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const empty = category.items.length === 0

  async function save() {
    const next = name.trim()
    if (!next) {
      onError('A section needs a name.')
      return
    }
    if (next === category.title) {
      setRenaming(false)
      return
    }
    setBusy(true)
    const result = await renameCategory(category.id, next)
    setBusy(false)
    if (!result.ok) {
      onError(result.message)
      return
    }
    setRenaming(false)
    onError('')
    await onChanged()
  }

  return (
    <section className="mt-10">
      {renaming ? (
        <div className="rounded-xl border border-accent/40 bg-surface p-4">
          <Field
            label="Section name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="mt-3 flex gap-3">
            <Button className="py-2 text-sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button
              variant="outline"
              className="py-2 text-sm"
              disabled={busy}
              onClick={() => {
                setName(category.title)
                setRenaming(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 className="font-body text-xs font-medium uppercase tracking-[0.25em] text-muted">
            {category.title}
          </h3>

          {confirmingDelete ? (
            <span className="flex items-center gap-3 font-body text-xs">
              <span className="text-ink">Delete this section?</span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await deleteCategory(category.id)
                  setBusy(false)
                  setConfirmingDelete(false)
                  if (!result.ok) {
                    onError(result.message)
                    return
                  }
                  onError('')
                  await onChanged()
                }}
                className="font-medium uppercase tracking-wider text-danger underline-offset-4 hover:underline"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="uppercase tracking-wider text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Keep
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-3 font-body text-xs">
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="uppercase tracking-wider text-muted underline-offset-4 transition hover:text-accent hover:underline"
              >
                Rename
              </button>
              {/* Only offered once the section is empty. The foreign key says
                  the same thing, so this is the polite half of a rule that is
                  enforced either way. */}
              {empty && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="uppercase tracking-wider text-muted underline-offset-4 transition hover:text-danger hover:underline"
                >
                  Delete section
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {category.blurb && !renaming && (
        <p className="mt-2 font-body text-sm text-ink/80">{category.blurb}</p>
      )}

      {empty ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-5 py-6 text-center font-body text-sm text-muted">
          Nothing in this section yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {category.items.map((item) => (
            <ResourceCard
              key={item.id}
              item={item}
              onChanged={onChanged}
              onError={onError}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/* --------------------------------------------------------------------- card */

function ResourceCard({
  item,
  onChanged,
  onError,
}: {
  item: Resource
  onChanged: () => Promise<void>
  onError: (message: string) => void
}) {
  const [playing, setPlaying] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-surface transition hover:border-accent/60">
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-base font-semibold uppercase tracking-wide text-ink underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {item.title}
          </a>
          {item.tag && (
            <span className="rounded-full border border-accent/40 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-accent">
              {item.tag}
            </span>
          )}
        </div>

        {item.description && (
          <p className="mt-2 font-body text-sm text-muted">{item.description}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-wider text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Open
            <span aria-hidden="true">↗</span>
          </a>

          {/* Confirm in place rather than in a system dialog: the row says
              what is about to happen and the same thumb answers it. */}
          {confirming ? (
            <span className="flex items-center gap-3 font-body text-xs">
              <span className="text-ink">Delete this?</span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const result = await deleteResource(item.id)
                  setBusy(false)
                  setConfirming(false)
                  if (!result.ok) {
                    onError(result.message)
                    return
                  }
                  onError('')
                  await onChanged()
                }}
                className="font-medium uppercase tracking-wider text-danger underline-offset-4 hover:underline"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="uppercase tracking-wider text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${item.title}`}
              className="font-body text-xs uppercase tracking-wider text-muted underline-offset-4 transition hover:text-danger hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {item.youtube_id && (
        <div className="border-t border-border p-5 pt-4">
          {playing ? (
            <div className="aspect-video overflow-hidden rounded-lg bg-bg">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${item.youtube_id}?autoplay=1&rel=0`}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <img
                src={`https://i.ytimg.com/vi/${item.youtube_id}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg/80 text-accent backdrop-blur transition group-hover:bg-accent group-hover:text-bg">
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9.2 7.4 17 12l-7.8 4.6Z" fill="currentColor" />
                  </svg>
                </span>
              </span>
              <span className="sr-only">Play {item.title}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- form */

/** Sentinel for the "somewhere new" option in the category dropdown. */
const NEW_CATEGORY = '__new__'

function AddForm({
  organizationId,
  categories,
  onCancel,
  onAdded,
}: {
  organizationId: string
  categories: ResourceCategory[]
  onCancel: () => void
  onAdded: () => Promise<void>
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? NEW_CATEGORY)
  const [newCategory, setNewCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [youtube, setYoutube] = useState('')
  const [tag, setTag] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  const makingNew = categoryId === NEW_CATEGORY

  async function submit() {
    setProblem('')

    if (!title.trim()) {
      setProblem('Give the resource a title.')
      return
    }

    // Required either way: pick one, or name one. There is no third option.
    if (makingNew && !newCategory.trim()) {
      setProblem('Name the new section, or choose an existing one.')
      return
    }

    const cleanUrl = normaliseUrl(url)
    if (!cleanUrl) {
      setProblem('That does not look like a web address. It should start with https://')
      return
    }

    // A pasted YouTube link is the obvious thing to put in a YouTube field, so
    // unwrap it. Only something that holds no id at all is an error.
    let videoId = ''
    if (youtube.trim()) {
      const found = extractYouTubeId(youtube)
      if (!found) {
        setProblem('That is not a YouTube video link or id. Leave it blank to just link out.')
        return
      }
      videoId = found
    }

    setBusy(true)
    const result = await addResource(organizationId, {
      categoryId: makingNew ? null : categoryId,
      newCategory: makingNew ? newCategory : '',
      title,
      description,
      url: cleanUrl,
      youtubeId: videoId,
      tag,
    })
    setBusy(false)

    if (!result.ok) {
      setProblem(result.message)
      return
    }
    await onAdded()
  }

  return (
    <div className="mt-6 rounded-xl border border-accent/40 bg-surface p-5">
      <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
        Add a resource
      </h3>
      <p className="mt-1 font-body text-sm text-muted">
        Every coach in your organization will see it.
      </p>

      <div className="mt-4 space-y-4">
        <Field
          label="Title"
          value={title}
          maxLength={120}
          placeholder="Jr. NBA Instructional Curriculum"
          onChange={(event) => setTitle(event.target.value)}
        />

        <Field
          label="Link"
          hint="Where it lives. Opens on their site, in a new tab."
          value={url}
          placeholder="https://…"
          onChange={(event) => setUrl(event.target.value)}
        />

        <TextArea
          label="Description"
          hint="Optional. One line on what it is and what it costs."
          value={description}
          rows={2}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div>
          <label
            htmlFor="resource-category"
            className="block font-body text-xs font-medium uppercase tracking-[0.2em] text-muted"
          >
            Section
          </label>
          <select
            id="resource-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-raised px-4 py-3 font-body text-base text-ink focus:border-accent focus:outline-none"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ New section…</option>
          </select>
          {makingNew && (
            <div className="mt-3">
              <Field
                label="New section name"
                hint="It becomes a heading on this page straight away."
                value={newCategory}
                maxLength={60}
                placeholder="Baseball"
                onChange={(event) => setNewCategory(event.target.value)}
              />
            </div>
          )}
        </div>

        <Field
          label="YouTube video"
          hint="Optional. Paste a video link and it plays on this page."
          value={youtube}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(event) => setYoutube(event.target.value)}
        />

        <Field
          label="Tag"
          hint="Optional. Something short: Free, Free course, Video."
          value={tag}
          maxLength={20}
          placeholder="Free"
          onChange={(event) => setTag(event.target.value)}
        />
      </div>

      <ErrorNote>{problem}</ErrorNote>

      <div className="mt-5 flex gap-3">
        <Button disabled={busy} onClick={submit}>
          {busy ? 'Adding…' : 'Add resource'}
        </Button>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
