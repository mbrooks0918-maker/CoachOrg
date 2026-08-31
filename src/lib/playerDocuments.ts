import { supabase } from './supabaseClient'
import { checkFile, removeFile, safeFileName, uploadTo } from './documentStorage'

export const PLAYER_BUCKET = 'player-documents'

export type PlayerDocument = {
  id: string
  player_member_id: string
  doc_type: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

/**
 * The paperwork every player is expected to have. This list is what the
 * "2 of 3 on file" count on the roster is measured against; anything a coach
 * adds beyond it is extra, not missing.
 */
export const REQUIRED_DOC_TYPES = ['Physical', 'Emergency Contact Form', 'Medical Release']

const COLUMNS =
  'id, player_member_id, doc_type, storage_path, file_name, mime_type, size_bytes, created_at'

/** RLS narrows this to the players the caller is allowed to see. */
export async function listPlayerDocuments(programId: string) {
  const { data, error } = await supabase
    .from('player_documents')
    .select(COLUMNS)
    .eq('program_id', programId)
    .order('doc_type')
  return { documents: (data ?? []) as PlayerDocument[], error: error?.message ?? null }
}

export function byPlayer(documents: PlayerDocument[]): Map<string, PlayerDocument[]> {
  const map = new Map<string, PlayerDocument[]>()
  for (const doc of documents) {
    map.set(doc.player_member_id, [...(map.get(doc.player_member_id) ?? []), doc])
  }
  return map
}

/** How many of the required types this player has on file. */
export function requiredOnFile(documents: PlayerDocument[]): number {
  return REQUIRED_DOC_TYPES.filter((type) => documents.some((d) => d.doc_type === type)).length
}

export function missingTypes(documents: PlayerDocument[]): string[] {
  return REQUIRED_DOC_TYPES.filter((type) => !documents.some((d) => d.doc_type === type))
}

export async function addPlayerDocument(input: {
  programId: string
  playerMemberId: string
  docType: string
  file: File
}): Promise<{ ok: boolean; message: string; document?: PlayerDocument }> {
  const docType = input.docType.trim()
  if (!docType) return { ok: false, message: 'Say what this document is.' }

  const problem = checkFile(input.file)
  if (problem) return { ok: false, message: problem }

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, message: 'You need to be logged in.' }

  // Program then player: the storage policy reads the player id out of the
  // second path segment to decide who may open the file.
  const path = `${input.programId}/${input.playerMemberId}/${crypto.randomUUID()}-${safeFileName(input.file.name)}`

  const uploaded = await uploadTo(PLAYER_BUCKET, path, input.file)
  if (!uploaded.ok) return uploaded

  const { data, error } = await supabase
    .from('player_documents')
    .insert({
      program_id: input.programId,
      player_member_id: input.playerMemberId,
      doc_type: docType,
      storage_path: path,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      uploaded_by: userId,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    await removeFile(PLAYER_BUCKET, path)
    if (error.code === '23505') {
      return {
        ok: false,
        message: `There is already a ${docType} on file. Remove it first to replace it.`,
      }
    }
    return { ok: false, message: error.message }
  }
  return { ok: true, message: 'Uploaded.', document: data as PlayerDocument }
}

export async function deletePlayerDocument(
  document: PlayerDocument,
): Promise<{ ok: boolean; message: string }> {
  const { error, count } = await supabase
    .from('player_documents')
    .delete({ count: 'exact' })
    .eq('id', document.id)

  if (error) return { ok: false, message: error.message }
  if (!count) {
    return { ok: false, message: 'Only a coach or a linked parent can remove this.' }
  }

  await removeFile(PLAYER_BUCKET, document.storage_path)
  return { ok: true, message: 'Removed.' }
}
