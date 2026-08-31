import { ACCEPT, formatSize } from '../lib/documentStorage'

/** Shared file chooser: a styled button plus the chosen file's name. */
export function FilePicker({
  file,
  onPick,
  inputRef,
  label = 'File',
}: {
  file: File | null
  onPick: (file: File | null) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  label?: string
}) {
  return (
    <div>
      <span className="font-body text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="sr-only"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-border bg-bg px-4 py-2.5 font-body text-sm text-ink transition hover:border-accent"
        >
          {file ? 'Choose a different file' : 'Choose a file'}
        </button>
        {file && (
          <span className="min-w-0 font-body text-sm text-muted">
            {file.name} <span className="text-muted/60">{formatSize(file.size)}</span>
          </span>
        )}
      </div>
      <p className="mt-1.5 font-body text-xs text-muted">
        PDF, photo or document. Up to 10 MB.
      </p>
    </div>
  )
}
