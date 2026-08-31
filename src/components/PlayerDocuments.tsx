import { useRef, useState } from 'react'
import { FilePicker } from './FilePicker'
import { Button, ErrorNote } from './ui'
import { formatSize, formatUploaded, openDocument } from '../lib/documentStorage'
import {
  PLAYER_BUCKET,
  REQUIRED_DOC_TYPES,
  addPlayerDocument,
  deletePlayerDocument,
  missingTypes,
  requiredOnFile,
  type PlayerDocument,
} from '../lib/playerDocuments'

/**
 * The paperwork line under a player on the roster.
 *
 * Collapsed it is the count, which is the point of the whole feature: a coach
 * scanning the roster in August wants to see who is short a physical without
 * opening anything. Expanded it lists each required type, present or missing,
 * plus anything extra that has been filed.
 */
export function PlayerDocuments({
  programId,
  playerMemberId,
  playerName,
  documents,
  canManage,
  onChanged,
}: {
  programId: string
  playerMemberId: string
  playerName: string
  documents: PlayerDocument[]
  canManage: boolean
  onChanged: (updater: (current: PlayerDocument[]) => PlayerDocument[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  const onFile = requiredOnFile(documents)
  const missing = missingTypes(documents)
  const extras = documents.filter((d) => !REQUIRED_DOC_TYPES.includes(d.doc_type))
  const complete = missing.length === 0

  async function handleOpenDoc(document: PlayerDocument) {
    setError('')
    const result = await openDocument(PLAYER_BUCKET, document.storage_path)
    if (!result.ok || !result.url) {
      setError(result.message)
      return
    }
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(document: PlayerDocument) {
    setError('')
    const result = await deletePlayerDocument(document)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onChanged((current) => current.filter((d) => d.id !== document.id))
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 font-body text-xs transition hover:border-accent hover:text-ink"
        style={undefined}
      >
        <span
          className={
            complete
              ? 'font-mono text-[0.7rem] uppercase tracking-wider text-muted'
              : 'font-mono text-[0.7rem] uppercase tracking-wider text-accent'
          }
        >
          {onFile} of {REQUIRED_DOC_TYPES.length} docs
        </span>
        <span className="text-muted/70">{open ? '−' : '+'}</span>
      </button>

      {!complete && !open && (
        <span className="ml-2 font-body text-xs text-muted/70">
          missing {missing.join(', ')}
        </span>
      )}

      {open && (
        <div className="mt-3 rounded-lg border border-border bg-bg px-4 py-3">
          <ul className="space-y-2">
            {REQUIRED_DOC_TYPES.map((type) => {
              const document = documents.find((d) => d.doc_type === type)
              return (
                <DocumentRow
                  key={type}
                  label={type}
                  document={document}
                  canManage={canManage}
                  onOpen={handleOpenDoc}
                  onDelete={handleDelete}
                />
              )
            })}
            {extras.map((document) => (
              <DocumentRow
                key={document.id}
                label={document.doc_type}
                document={document}
                canManage={canManage}
                onOpen={handleOpenDoc}
                onDelete={handleDelete}
              />
            ))}
          </ul>

          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

          {canManage && (
            <UploadRow
              programId={programId}
              playerMemberId={playerMemberId}
              playerName={playerName}
              missing={missing}
              onAdded={(document) => onChanged((current) => [...current, document])}
            />
          )}
        </div>
      )}
    </div>
  )
}

function DocumentRow({
  label,
  document,
  canManage,
  onOpen,
  onDelete,
}: {
  label: string
  document: PlayerDocument | undefined
  canManage: boolean
  onOpen: (document: PlayerDocument) => void
  onDelete: (document: PlayerDocument) => void
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-body text-sm text-ink">{label}</p>
        {document ? (
          <button
            type="button"
            onClick={() => onOpen(document)}
            className="font-mono text-[0.7rem] uppercase tracking-wider text-muted underline underline-offset-4 transition hover:text-ink"
          >
            {formatUploaded(document.created_at)}
            {document.size_bytes ? ` · ${formatSize(document.size_bytes)}` : ''}
          </button>
        ) : (
          <p className="font-mono text-[0.7rem] uppercase tracking-wider text-accent">
            Not on file
          </p>
        )}
      </div>

      {document && canManage && (
        <button
          type="button"
          onClick={() => onDelete(document)}
          aria-label={`Remove ${label}`}
          className="shrink-0 font-body text-sm text-muted transition hover:text-accent"
        >
          ×
        </button>
      )}
    </li>
  )
}

function UploadRow({
  programId,
  playerMemberId,
  playerName,
  missing,
  onAdded,
}: {
  programId: string
  playerMemberId: string
  playerName: string
  missing: string[]
  onAdded: (document: PlayerDocument) => void
}) {
  const [docType, setDocType] = useState(missing[0] ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) return
    setBusy(true)
    setError('')
    const result = await addPlayerDocument({ programId, playerMemberId, docType, file })
    setBusy(false)
    if (!result.ok || !result.document) {
      setError(result.message)
      return
    }
    onAdded(result.document)
    setFile(null)
    setDocType('')
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <label htmlFor={`doctype-${playerMemberId}`} className="block">
        <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Document type
        </span>
        <input
          id={`doctype-${playerMemberId}`}
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          placeholder="Physical"
          maxLength={60}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 font-body text-base text-ink placeholder:text-muted/60 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      {/* The types this player is actually short of, one tap away. */}
      {missing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {missing.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setDocType(type)}
              className={`rounded-full border px-3 py-1.5 font-body text-xs transition ${
                docType === type
                  ? 'border-accent bg-accent/20 font-semibold text-ink'
                  : 'border-border text-muted hover:border-accent/50 hover:text-ink'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      <FilePicker
        file={file}
        onPick={setFile}
        inputRef={fileInput}
        label={`File for ${playerName.split(' ')[0]}`}
      />

      <ErrorNote>{error}</ErrorNote>

      <Button onClick={handleUpload} disabled={busy || !file || !docType.trim()}>
        {busy ? 'Uploading…' : 'Upload Document'}
      </Button>
    </div>
  )
}
