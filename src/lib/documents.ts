import { supabase } from './supabaseClient'
import { checkFile, removeFile, safeFileName, uploadTo } from './documentStorage'

export const LIBRARY_BUCKET = 'program-documents'

export type ProgramDocument = {
  id: string
  title: string
  category: string
  description: string | null
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

/** Offered as quick picks; the field itself is free text. */
export const CATEGORIES = ['Waivers', 'Code of Conduct', 'Forms', 'General Resources']

const COLUMNS =
  'id, title, category, description, storage_path, file_name, mime_type, size_bytes, created_at'

export async function listDocuments(programId: string) {
  const { data, error } = await supabase
    .from('program_documents')
    .select(COLUMNS)
    .eq('program_id', programId)
    .order('category')
    .order('title')
  return { documents: (data ?? []) as ProgramDocument[], error: error?.message ?? null }
}

export async function addDocument(input: {
  programId: string
  title: string
  category: string
  description: string
  file: File
}): Promise<{ ok: boolean; message: string; document?: ProgramDocument }> {
  const title = input.title.trim()
  if (!title) return { ok: false, message: 'Give the document a title.' }
  if (!input.category.trim()) return { ok: false, message: 'Pick or type a category.' }

  const problem = checkFile(input.file)
  if (problem) return { ok: false, message: problem }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  // The program id leads the path because the storage policy reads it straight
  // off the object name to decide who may touch the file.
  const path = `${input.programId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`

  const uploaded = await uploadTo(LIBRARY_BUCKET, path, input.file)
  if (!uploaded.ok) return uploaded

  const { data, error } = await supabase
    .from('program_documents')
    .insert({
      program_id: input.programId,
      title,
      category: input.category.trim(),
      description: input.description.trim() || null,
      storage_path: path,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      uploaded_by: userId,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    // Do not leave a file behind that nothing points at.
    await removeFile(LIBRARY_BUCKET, path)
    return { ok: false, message: error.message }
  }
  return { ok: true, message: 'Uploaded.', document: data as ProgramDocument }
}

/**
 * Removes the record first, then the file.
 *
 * That order matters: the record is what the policies guard and what the list
 * is built from. If the second step fails the file is orphaned but invisible,
 * which is far better than a listed document that will not open.
 */
export async function deleteDocument(
  document: ProgramDocument,
): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('program_documents')
    .delete({ count: 'exact' })
    .eq('id', document.id)

  if (error) return { ok: false, message: error.message }
  if (!count) return { ok: false, message: 'Only a coach can remove a document.' }

  await removeFile(LIBRARY_BUCKET, document.storage_path)
  return { ok: true, message: 'Removed.' }
}
