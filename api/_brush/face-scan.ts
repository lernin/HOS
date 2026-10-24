import { rpc } from './db.js'
import { downloadPreview } from './drive.js'
import { detectFaceBoxFromBytes, type DetectedFace } from './face-detect.js'

type Target = { id: string, drive_file_id: string }

function asTargets(value: unknown): Target[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as { id?: unknown, drive_file_id?: unknown }
    const id = String(row.id || '')
    const driveId = String(row.drive_file_id || '')
    return id && driveId ? [{ id, drive_file_id: driveId }] : []
  })
}

export async function saveDetectedFace(lab: string, brush: string, imageId: string, bytes: Uint8Array) {
  let box: DetectedFace | null = null
  try {
    box = await detectFaceBoxFromBytes(bytes)
  } catch {
    box = null
  }
  await rpc('brush_set_face_box', { lab_pin: lab, brush_pin: brush, image_id: imageId, face_box: box })
  return box
}

export async function scanUnscannedFaces(lab: string, brush: string, driveIds: string[] | null, limit: number, budgetMs: number) {
  const queued = asTargets(await rpc('brush_face_queue', {
    lab_pin: lab,
    brush_pin: brush,
    drive_ids: driveIds,
    batch_limit: limit,
  }))
  const started = Date.now()
  let scanned = 0
  let withBox = 0
  for (const target of queued) {
    if (Date.now() - started > budgetMs) break
    try {
      const image = await downloadPreview(target.drive_file_id)
      const box = await saveDetectedFace(lab, brush, target.id, image.bytes)
      scanned += 1
      if (box) withBox += 1
    } catch {
      try {
        await rpc('brush_set_face_box', { lab_pin: lab, brush_pin: brush, image_id: target.id, face_box: null })
        scanned += 1
      } catch { /* a locked row stays in the queue for the next pass */ }
    }
  }
  const left = asTargets(await rpc('brush_face_queue', {
    lab_pin: lab,
    brush_pin: brush,
    drive_ids: driveIds,
    batch_limit: 1,
  }))
  return { scanned, withBox, remaining: left.length > 0 }
}
