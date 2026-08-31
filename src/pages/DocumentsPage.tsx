import { useEffect, useRef, useState } from 'react'
import { Button, ErrorNote, Field, TextArea } from '../components/ui'
import { FilePicker } from '../components/FilePicker'
import { useProgram } from '../lib/programContext'
import { isStaff } from '../lib/roster'
import { formatSize, formatUploaded, openDocument } from '../lib/documentStorage'
import {
  CATEGORIES,
  LIBRARY_BUCKET,
  addDocument,
  deleteDocument,
  listDocuments,
  type ProgramDocument,
} from '../lib/documents'

export default function DocumentsPage() {
  const { program, role } = useProgram()
  const staff = isStaff(role)

  const [documents, setDocuments] = useState<ProgramDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { documents, error } = await listDocuments(program.id)
      if (!active) return
      setDocuments(documents)
      if (error) setError(error)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [program.id])

  async function handleOpen(document: ProgramDocument) {
    setError('')
    const result = await openDocument(LIBRARY_BUCKET, document.storage_path)
    if (!result.ok || !result.url) {
      setError(result.message)
      return
    }
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(document: ProgramDocument) {
    setError('')
    const result = await deleteDocument(document)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setDocuments((current) => current.filter((d) => d.id !== document.id))
  }

  if (loading) return <p className="font-body text-muted">Loading…</p>

  const categories = [...new Set(documents.map((d) => d.category))].sort()

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Documents
        </h2>
        <span className="font-body text-sm text-muted">
          {documents.length} {documents.length === 1 ? 'file' : 'files'}
        </span>
      </div>
      <p className="mt-2 font-body text-sm text-muted">
        {staff
          ? 'Forms and handouts everyone on the team can open.'
          : 'Forms and handouts from your coaches. Tap one to open it.'}
      </p>

      <ErrorNote>{error}</ErrorNote>

      {staff &&
        (adding ? (
          <UploadForm
            programId={program.id}
            onCancel={() => setAdding(false)}
            onAdded={(document) => {
              setDocuments((current) =>
                [...current, document].sort(
                  (a, b) =>
                    a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
                ),
              )
              setAdding(false)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-6 w-full rounded-xl border border-dashed border-border px-5 py-4 font-body text-sm text-muted transition hover:border-accent hover:text-ink"
          >
            + Upload a document
          </button>
        ))}

      {documents.length === 0 ? (
        <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-6 text-center font-body text-sm text-muted">
          {staff ? 'Nothing uploaded yet.' : 'Your coaches have not shared anything yet.'}
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="font-body text-xs font-medium uppercase tracking-[0.22em] text-muted">
                {category}
                <span className="ml-2 text-muted/60">
                  {documents.filter((d) => d.category === category).length}
                </span>
              </h3>
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {documents
                  .filter((d) => d.category === category)
                  .map((document) => (
                    <li
                      key={document.id}
                      className="flex items-start justify-between gap-3 px-4 py-3.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpen(document)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block font-body text-base font-medium text-ink underline-offset-4 hover:underline">
                          {document.title}
                        </span>
                        {document.description && (
                          <span className="mt-1 block font-body text-sm text-muted">
                            {document.description}
                          </span>
                        )}
                        <span className="mt-1 block font-mono text-[0.7rem] uppercase tracking-wider text-muted/70">
                          {formatUploaded(document.created_at)}
                          {document.size_bytes ? ` · ${formatSize(document.size_bytes)}` : ''}
                        </span>
                      </button>

                      {staff && (
                        <button
                          type="button"
                          onClick={() => handleDelete(document)}
                          aria-label={`Remove ${document.title}`}
                          className="shrink-0 font-body text-sm text-muted transition hover:text-accent"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UploadForm({
  programId,
  onCancel,
  onAdded,
}: {
  programId: string
  onCancel: () => void
  onAdded: (document: ProgramDocument) => void
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Choose a file first.')
      return
    }
    setBusy(true)
    setError('')
    const result = await addDocument({ programId, title, category, description, file })
    setBusy(false)
    if (!result.ok || !result.document) {
      setError(result.message)
      return
    }
    onAdded(result.document)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 space-y-5 rounded-xl border border-border bg-surface px-5 py-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-base font-semibold uppercase tracking-wide text-ink">
          Upload a document
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="font-body text-xs uppercase tracking-wider text-muted transition hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <Field
        label="Title"
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="2026 Participation Waiver"
        maxLength={100}
        required
      />

      <div>
        <Field
          label="Category"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Waivers"
          maxLength={40}
          required
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              className={`rounded-full border px-3 py-1.5 font-body text-xs transition ${
                category === option
                  ? 'border-accent bg-accent/20 font-semibold text-ink'
                  : 'border-border text-muted hover:border-accent/50 hover:text-ink'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <TextArea
        label="Description"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional. What is this for, and who needs to sign it?"
        maxLength={300}
      />

      <FilePicker file={file} onPick={setFile} inputRef={fileInput} />

      <ErrorNote>{error}</ErrorNote>

      <Button type="submit" disabled={busy || !file}>
        {busy ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  )
}
