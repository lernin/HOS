import { countryFromPath, fileStem, filenameAttributes, seriesFromName } from '../src/experiences/brush/names.ts'
import { rpc } from './_brush/db.ts'
import { driveFolderId, isFolder, isImage, isSidecar, listChildren, readSidecar } from './_brush/drive.ts'
import { cleanDetail, json, pins } from './_brush/http.ts'

export const maxDuration = 60

type Job = { id: string, path: string, pageToken?: string }
type ImagePayload = {
  drive_file_id: string
  name: string
  folder_path: string
  country: string
  series: string | null
  mime_type: string
  source: 'drive'
  prompt_text: string | null
  prompt_source: string | null
  attributes: { trait: string, value: string }[]
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      const body = await request.json() as { runId?: string, pending?: Job[], prompts?: Record<string, string> }
      const gate = await rpc<{ ok: boolean }>('brush_gate', { lab_pin: lab, brush_pin: brush })
      if (!gate.ok) return json({ error: 'Wrong PIN.' }, 401)

      let runId = body.runId
      if (!runId) {
        const begun = await rpc<{ run_id: string }>('brush_sync_begin', { lab_pin: lab, brush_pin: brush })
        runId = begun.run_id
      }
      const pending = body.pending?.length ? [...body.pending] : [{ id: driveFolderId(), path: '' }]
      const prompts = { ...(body.prompts || {}) }
      const job = pending.shift()
      if (!job) {
        const finished = await rpc<{ seen: number, archived: number }>('brush_sync_finish', { lab_pin: lab, brush_pin: brush, run_id: runId })
        return json({ runId, pending: [], prompts, imported: 0, done: true, archived: finished.archived })
      }

      const page = await listChildren(job.id, job.pageToken)
      const images: ImagePayload[] = []
      for (const file of page.files) {
        if (isFolder(file)) {
          const path = job.path ? `${job.path}/${file.name}` : file.name
          pending.push({ id: file.id, path })
          continue
        }
        const stem = fileStem(file.name)
        const key = `${job.path}/${stem}`
        if (isSidecar(file) && Number(file.size || 0) < 32000) {
          try { prompts[key] = await readSidecar(file.id) } catch { /* a missing note should not stop the sync */ }
          continue
        }
        if (!isImage(file)) continue
        const prompt = prompts[key] || null
        images.push({
          drive_file_id: file.id,
          name: file.name,
          folder_path: job.path,
          country: countryFromPath(job.path),
          series: seriesFromName(file.name),
          mime_type: file.mimeType,
          source: 'drive',
          prompt_text: prompt,
          prompt_source: prompt ? 'sidecar' : null,
          attributes: filenameAttributes(file.name),
        })
      }
      if (page.nextPageToken) pending.unshift({ ...job, pageToken: page.nextPageToken })
      const saved = images.length
        ? await rpc<{ inserted: number, updated: number }>('brush_upsert_images', {
          lab_pin: lab, brush_pin: brush, images, run_id: runId,
        })
        : { inserted: 0, updated: 0 }

      return json({
        runId,
        pending,
        prompts,
        imported: saved.inserted + saved.updated,
        done: false,
        folder: job.path || 'Beauty Contest',
      })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: error instanceof Error ? error.message : cleanDetail(error) }, status || 500)
    }
  },
}
