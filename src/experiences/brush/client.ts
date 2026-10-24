import { supabase } from '../../lib/supabase'
import type { BrushApi, BrushAttribute, BrushImage, BrushTag, ContestState, Insights, PairResult, RecordInput, TrashImage } from './types'
import { pairKey } from './pair'
import { attachQueue, SessionExpired, UPLOAD_CHUNK_BYTES, UploadQueue, type UploadClaim, type UploadTransport } from './uploads'

export class BrushError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const imageUrls = new Map<string, string>()

async function call<T>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    throw new BrushError(error.code || 'error', error.code === '28000' ? 'Wrong PIN.' : error.message)
  }
  return data as T
}

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: string }
    return body.error || `Request failed (${response.status}).`
  } catch {
    return `Request failed (${response.status}).`
  }
}

function headers(labPin: string, brushPin: string) {
  return { 'x-lab-pin': labPin, 'x-brush-pin': brushPin }
}

export async function loadDriveImage(driveId: string, labPin: string, brushPin: string) {
  const cached = imageUrls.get(driveId)
  if (cached) return cached
  const response = await fetch(`/api/brush-image?id=${encodeURIComponent(driveId)}`, { headers: headers(labPin, brushPin) })
  if (!response.ok) throw new BrushError(String(response.status), await readError(response))
  const url = URL.createObjectURL(await response.blob())
  imageUrls.set(driveId, url)
  return url
}

export async function loadThumb(imageId: string, labPin: string, brushPin: string) {
  const key = `thumb:${imageId}`
  const cached = imageUrls.get(key)
  if (cached) return cached
  const response = await fetch(`/api/brush-thumb?id=${encodeURIComponent(imageId)}`, { headers: headers(labPin, brushPin) })
  if (!response.ok) throw new BrushError(String(response.status), await readError(response))
  const url = URL.createObjectURL(await response.blob())
  imageUrls.set(key, url)
  return url
}

function liveTransport(labPin: string, brushPin: string): UploadTransport {
  return {
    async claim(input) {
      const response = await fetch('/api/brush-upload-session', {
        method: 'POST',
        headers: { ...headers(labPin, brushPin), 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(await readError(response))
      return response.json() as Promise<UploadClaim>
    },
    async put({ blob, mime, uploadUrl, uploadedBytes, signal, onBytes }) {
      let url = uploadUrl
      let offset = uploadedBytes
      const total = blob.size
      while (offset < total) {
        const end = Math.min(total, offset + UPLOAD_CHUNK_BYTES) - 1
        const response = await fetch('/api/brush-upload-chunk', {
          method: 'POST',
          headers: {
            ...headers(labPin, brushPin),
            'content-type': 'application/octet-stream',
            'x-upload-url': url,
            'x-content-range': `bytes ${offset}-${end}/${total}`,
            'x-upload-mime': mime,
          },
          body: blob.slice(offset, end + 1),
          signal,
        })
        if (response.status === 410) throw new SessionExpired()
        if (!response.ok) throw new Error(await readError(response))
        const body = await response.json() as { complete?: boolean, uploadUrl?: string, file?: { id: string, name: string } }
        offset = end + 1
        onBytes(offset)
        if (body.uploadUrl) url = body.uploadUrl
        if (body.complete && body.file?.id) return { id: body.file.id, name: body.file.name || '' }
      }
      throw new Error('Drive finished the upload without a file id.')
    },
    async finish(input) {
      const form = new FormData()
      form.set('driveFileId', input.driveFileId)
      form.set('name', input.name)
      form.set('hash', input.hash)
      form.set('mime', input.mime)
      form.set('bytes', String(input.bytes))
      if (input.thumbnail) form.set('thumbnail', input.thumbnail, `${input.hash}.webp`)
      const response = await fetch('/api/brush-upload-finish', { method: 'POST', headers: headers(labPin, brushPin), body: form })
      if (!response.ok) throw new Error(await readError(response))
      return response.json() as Promise<{ duplicate?: boolean }>
    },
  }
}

export function createLiveClient(labPin: string, brushPin: string): BrushApi {
  const pinArgs = { lab_pin: labPin, brush_pin: brushPin }
  const queue = attachQueue(new UploadQueue(liveTransport(labPin, brushPin), 'brush-uploads'))
  return {
    status: () => call<{ pin_set: boolean }>('brush_status', { lab_pin: labPin }),
    async setPin(current, next) {
      await call('brush_set_pin', { lab_pin: labPin, current_pin: current, new_pin: next })
    },
    async unlock(next) {
      await call('brush_gate', { lab_pin: labPin, brush_pin: next })
    },
    nextPair: () => call<PairResult>('brush_next_pair', pinArgs),
    async record(input: RecordInput) {
      const data = await call<{ match_id?: string | null }>('brush_record', {
        ...pinArgs,
        left_id: input.leftId,
        right_id: input.rightId,
        decision: input.decision,
        winner_id: input.winnerId ?? null,
        trash_left: Boolean(input.trashLeft),
        trash_right: Boolean(input.trashRight),
        tag_ids: input.tagIds,
        decided_ms: input.decidedMs ?? null,
        margin: input.margin || 'clear',
      })
      return { match_id: data?.match_id ?? null }
    },
    async annotate(matchId, tagIds) {
      await call('brush_annotate', { ...pinArgs, match_id: matchId, tag_ids: tagIds })
    },
    async contest() {
      const data = await call<{ phase: ContestState['phase'], rounds: ContestState['rounds'], champion_id: string | null, recent?: string[][] }>('brush_contest_get', pinArgs)
      const recent = Array.isArray(data?.recent) ? data.recent : []
      const recentKeys = recent
        .filter(pair => Array.isArray(pair) && pair[0] && pair[1])
        .map(pair => pairKey(String(pair[0]), String(pair[1])))
      return { phase: data?.phase || 'qualifying', rounds: data?.rounds || [], championId: data?.champion_id || null, recentKeys }
    },
    async saveContest(state) {
      await call('brush_contest_put', { ...pinArgs, phase: state.phase, rounds: state.rounds, champion_id: state.championId })
    },
    async setPhash(imageId, hash) {
      await call('brush_set_phash', { ...pinArgs, image_id: imageId, perceptual_hash: hash })
    },
    async setFaceBox(imageId, faceBox) {
      await call('brush_set_face_box', { ...pinArgs, image_id: imageId, face_box: faceBox })
    },
    async flagUnreadable(imageId) {
      await call('brush_flag_unreadable', { ...pinArgs, image_id: imageId })
    },
    leaderboard: () => call<BrushImage[]>('brush_leaderboard', pinArgs),
    library: () => call<BrushImage[]>('brush_library', pinArgs),
    tags: () => call<BrushTag[]>('brush_tags', pinArgs),
    insights: () => call<Insights>('brush_insights', pinArgs),
    trashed: () => call<TrashImage[]>('brush_trashed', pinArgs),
    async saveTrashTags(imageId, tagIds) {
      await call('brush_save_trash_tags', { ...pinArgs, image_id: imageId, tag_ids: tagIds })
    },
    async restore(imageId) {
      await call('brush_restore', { ...pinArgs, image_id: imageId })
    },
    async reviewTag(tagId, decision) {
      await call('brush_review_tag', { ...pinArgs, tag_id: tagId, tag_decision: decision })
    },
    async suggestTag(category, label, source) {
      await call('brush_suggest_tag', { ...pinArgs, category, label, tag_source: source })
    },
    detail: (imageId) => call<{ image: BrushImage, attributes: BrushAttribute[] }>('brush_image_detail', { ...pinArgs, image_id: imageId }),
    async setPrompt(imageId, prompt) {
      await call('brush_set_prompt', { ...pinArgs, image_id: imageId, prompt_text: prompt, prompt_source: 'manual' })
    },
    async saveRecipe(body) {
      await call('brush_save_recipe', { ...pinArgs, body, basis: { kind: 'suggestion' } })
    },
    async sync(onProgress) {
      let runId: string | undefined
      let pending: { id: string, path: string, pageToken?: string }[] | undefined
      let prompts: Record<string, string> = {}
      let label = 'Beauty Contest'
      for (let step = 0; step < 500; step += 1) {
        onProgress(pending?.length ? `Syncing ${pending[0].path || label}` : `Syncing ${label}`)
        const response = await fetch('/api/brush-sync', {
          method: 'POST',
          headers: { ...headers(labPin, brushPin), 'content-type': 'application/json' },
          body: JSON.stringify({ runId, pending, prompts }),
        })
        if (!response.ok) throw new BrushError(String(response.status), await readError(response))
        const body = await response.json() as {
          runId: string
          pending: { id: string, path: string, pageToken?: string }[]
          prompts: Record<string, string>
          imported: number
          done: boolean
          archived?: number
          folder?: string
        }
        runId = body.runId
        pending = body.pending
        prompts = body.prompts || {}
        if (body.folder) label = body.folder
        if (body.done) {
          onProgress(`Sync finished. ${body.imported} images, ${body.archived ?? 0} missing files flagged archived.`)
          return
        }
      }
      throw new Error('Sync is still running. Start it again to continue.')
    },
    subscribeUploads: listener => queue.subscribe(listener),
    enqueueUploads: files => queue.enqueue(files),
    retryUpload: id => queue.retry(id),
    resumeUploads: () => queue.resume(),
    pauseUploads: () => { queue.pause() },
    async autoTag(imageId) {
      const response = await fetch('/api/brush-vision', {
        method: 'POST',
        headers: { ...headers(labPin, brushPin), 'content-type': 'application/json' },
        body: JSON.stringify({ imageId }),
      })
      if (!response.ok) throw new BrushError(String(response.status), await readError(response))
      const body = await response.json() as { suggested?: number }
      return { suggested: body.suggested || 0 }
    },
    async backfill(tag, onProgress) {
      const images = await call<BrushImage[]>('brush_library', pinArgs)
      for (let index = 0; index < images.length; index += 1) {
        onProgress(index, images.length)
        const response = await fetch('/api/brush-vision', {
          method: 'POST',
          headers: { ...headers(labPin, brushPin), 'content-type': 'application/json' },
          body: JSON.stringify({ imageId: images[index].id, focus: { category: tag.category, label: tag.label } }),
        })
        if (!response.ok) throw new BrushError(String(response.status), await readError(response))
      }
      onProgress(images.length, images.length)
    },
  }
}
