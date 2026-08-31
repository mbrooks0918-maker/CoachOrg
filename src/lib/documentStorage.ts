import { supabase } from './supabaseClient'

/** Both buckets cap uploads here; checked first so the message is friendly. */
export const MAX_BYTES = 10 * 1024 * 1024

export const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.csv,.doc,.docx,.xls,.xlsx'

/**
 * Turns a filename into something safe to put in a storage key, keeping the
 * extension so the browser still knows what it is on the way back out.
 */
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(-80)
}

export function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatUploaded(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function checkFile(file: File): string | null {
  if (file.size === 0) return 'That file looks empty.'
  if (file.size > MAX_BYTES) return `That file is too big. The limit is ${formatSize(MAX_BYTES)}.`
  return null
}

export async function uploadTo(
  bucket: string,
  path: string,
  file: File,
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })

  if (error) {
    // The bucket's own mime allow-list produces this, and the wording it uses
    // is not something to show a coach.
    if (/mime type|not supported/i.test(error.message)) {
      return { ok: false, message: 'That file type is not accepted. Try a PDF, photo or document.' }
    }
    if (/exceeded the maximum|too large/i.test(error.message)) {
      return { ok: false, message: `That file is too big. The limit is ${formatSize(MAX_BYTES)}.` }
    }
    if (/row-level security|Unauthorized|403/i.test(error.message)) {
      return { ok: false, message: 'You do not have permission to upload that here.' }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true, message: 'Uploaded.' }
}

/**
 * Both buckets are private, so opening a file means minting a short-lived
 * signed URL. The signing call is itself subject to the storage policies, so
 * someone who may not read the file simply cannot get a link.
 */
export async function openDocument(
  bucket: string,
  path: string,
): Promise<{ ok: boolean; message: string; url?: string }> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data) {
    return { ok: false, message: 'That file could not be opened. It may have been removed.' }
  }
  return { ok: true, message: '', url: data.signedUrl }
}

/** Best-effort: the metadata row is already gone, so a stray file is invisible. */
export async function removeFile(bucket: string, path: string): Promise<void> {
  await supabase.storage.from(bucket).remove([path])
}
