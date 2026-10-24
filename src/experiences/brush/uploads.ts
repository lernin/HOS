export const UPLOAD_BATCH_LIMIT = 100
export const UPLOAD_CONCURRENCY = 3
export const UPLOAD_ATTEMPTS = 5
export const THUMB_HEIGHT = 1080
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024

export type UploadStatus = 'preparing' | 'queued' | 'uploading' | 'done' | 'duplicate' | 'failed'

export type UploadJobView = {
  id: string
  name: string
  status: UploadStatus
  progress: number
  error: string
}

export type UploadSnapshot = {
  jobs: UploadJobView[]
  total: number
  completed: number
  added: number
  active: number
  percent: number
  overflow: number
}

export const EMPTY_UPLOADS: UploadSnapshot = {
  jobs: [], total: 0, completed: 0, added: 0, active: 0, percent: 0, overflow: 0,
}

export class SessionExpired extends Error {
  constructor() {
    super('The upload session expired. Starting that photo again.')
    this.name = 'SessionExpired'
  }
}

export function takeBatch<T>(files: T[]) {
  return {
    accepted: files.slice(0, UPLOAD_BATCH_LIMIT),
    overflow: Math.max(0, files.length - UPLOAD_BATCH_LIMIT),
  }
}

export function retryDelayMs(attempt: number) {
  return Math.min(30_000, 1000 * 3 ** Math.max(0, attempt - 1))
}

export async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function makeThumbnail(file: Blob) {
  const bitmap = await bitmapOf(file)
  const scale = Math.min(1, THUMB_HEIGHT / Math.max(1, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Could not make a preview.')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82))
  if (!blob) throw new Error('Could not make a preview.')
  return blob
}

async function bitmapOf(file: Blob) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(file)
  }
}

type StoredJob = {
  id: string
  name: string
  hash: string
  size: number
  mime: string
  blob: Blob
  status: UploadStatus
  attempts: number
  progress: number
  error: string
  nextAt: number
  uploadedBytes: number
  uploadUrl: string
  driveFileId: string
}

export type UploadClaim =
  | { duplicate: true, name: string }
  | { duplicate: false, uploadUrl: string }

export type UploadTransport = {
  claim: (input: { name: string, hash: string, mime: string, bytes: number }) => Promise<UploadClaim>
  put: (input: { blob: Blob, mime: string, uploadUrl: string, uploadedBytes: number, signal: AbortSignal, onBytes: (bytes: number) => void }) => Promise<{ id: string, name: string }>
  finish: (input: { driveFileId: string, name: string, hash: string, mime: string, bytes: number, thumbnail: Blob | null }) => Promise<{ duplicate?: boolean }>
}

function snapshotOf(jobs: StoredJob[], overflow: number): UploadSnapshot {
  const completed = jobs.filter(job => job.status === 'done' || job.status === 'duplicate').length
  const added = jobs.filter(job => job.status === 'done').length
  const active = jobs.filter(job => job.status === 'uploading').length
  const percent = jobs.length ? Math.round(jobs.reduce((sum, job) => sum + (job.status === 'done' || job.status === 'duplicate' ? 1 : job.progress), 0) / jobs.length * 100) : 0
  return {
    jobs: jobs.slice(-UPLOAD_BATCH_LIMIT).map(job => ({ id: job.id, name: job.name, status: job.status, progress: job.progress, error: job.error })),
    total: jobs.length,
    completed,
    added,
    active,
    percent,
    overflow,
  }
}

let attached: UploadQueue | null = null

export function attachQueue(queue: UploadQueue) {
  if (attached && attached !== queue) attached.pause()
  attached = queue
  return queue
}

export class UploadQueue {
  private jobs: StoredJob[] = []
  private overflow = 0
  private inflight = 0
  private stopped = true
  private listeners = new Set<(snapshot: UploadSnapshot) => void>()
  private aborts = new Set<AbortController>()
  private hashing = new Set<string>()
  private timer = 0
  private db: Promise<IDBDatabase> | null = null

  private transport: UploadTransport
  private dbName: string
  private onFinished?: () => void

  constructor(transport: UploadTransport, dbName: string, onFinished?: () => void) {
    this.transport = transport
    this.dbName = dbName
    this.onFinished = onFinished
  }

  subscribe(listener: (snapshot: UploadSnapshot) => void) {
    this.listeners.add(listener)
    listener(snapshotOf(this.jobs, this.overflow))
    return () => { this.listeners.delete(listener) }
  }

  pause() {
    this.stopped = true
    if (this.timer) window.clearTimeout(this.timer)
    this.timer = 0
    for (const abort of this.aborts) abort.abort()
    this.aborts.clear()
    for (const job of this.jobs) {
      if (job.status === 'uploading') job.status = 'queued'
    }
    this.emit()
  }

  async resume() {
    this.stopped = false
    const saved = await this.readAll().catch(() => [])
    const seen = new Set(this.jobs.map(job => job.id))
    for (const job of saved) {
      if (seen.has(job.id) || job.status === 'done') continue
      if (job.status === 'uploading') job.status = 'queued'
      this.jobs.push(job)
    }
    this.emit()
    void this.hashWaiting()
    this.pump()
  }

  enqueue(files: File[]) {
    this.jobs = this.jobs.filter(job => job.status !== 'done' && job.status !== 'duplicate')
    const batch = takeBatch(files)
    this.overflow = batch.overflow
    void this.ingest(batch.accepted)
    this.emit()
    return { accepted: batch.accepted.length, overflow: batch.overflow }
  }

  retry(id: string) {
    const job = this.jobs.find(item => item.id === id)
    if (!job || job.status !== 'failed') return
    job.status = 'queued'
    job.attempts = 0
    job.error = ''
    job.nextAt = 0
    void this.persist(job)
    this.pump()
  }

  private emit() {
    const snapshot = snapshotOf(this.jobs, this.overflow)
    for (const listener of this.listeners) listener(snapshot)
  }

  private async ingest(files: File[]) {
    for (const file of files) {
      const job: StoredJob = {
        id: crypto.randomUUID(),
        name: file.name || 'photo',
        hash: '',
        size: file.size,
        mime: file.type || 'image/jpeg',
        blob: file,
        status: 'preparing',
        attempts: 0,
        progress: 0,
        error: '',
        nextAt: 0,
        uploadedBytes: 0,
        uploadUrl: '',
        driveFileId: '',
      }
      this.jobs.push(job)
      await this.persist(job).catch(error => {
        job.status = 'failed'
        job.error = error instanceof Error ? error.message : 'Could not save that photo on this phone.'
      })
      this.emit()
    }
    await this.hashWaiting()
    this.pump()
  }

  private async hashWaiting() {
    for (const job of this.jobs) {
      if (this.stopped) return
      if (job.hash || this.hashing.has(job.id) || job.status === 'failed' || job.status === 'duplicate' || job.status === 'done') continue
      this.hashing.add(job.id)
      try {
        job.hash = await sha256Hex(await job.blob.arrayBuffer())
        const prior = this.jobs.find(item => item !== job && item.hash === job.hash && item.status !== 'failed')
        if (prior) {
          job.status = 'duplicate'
          job.progress = 1
          job.error = prior.status === 'done' || prior.status === 'duplicate' ? 'Already added.' : 'Already in this batch.'
          await this.forget(job)
        } else {
          job.status = 'queued'
          await this.persist(job)
        }
      } catch (error) {
        job.status = 'failed'
        job.error = error instanceof Error ? error.message : 'Could not read that photo.'
        await this.persist(job)
      } finally {
        this.hashing.delete(job.id)
      }
      this.emit()
      this.pump()
    }
  }

  private pump() {
    if (this.stopped) return
    const now = Date.now()
    while (this.inflight < UPLOAD_CONCURRENCY) {
      const job = this.jobs.find(item => item.status === 'queued' && item.hash && item.nextAt <= now)
      if (!job) {
        const waiting = this.jobs.filter(item => item.status === 'queued' && item.hash && item.nextAt > now)
        if (waiting.length && !this.timer) {
          const delay = Math.min(...waiting.map(item => item.nextAt - now))
          this.timer = window.setTimeout(() => {
            this.timer = 0
            this.pump()
          }, delay + 25)
        }
        break
      }
      job.status = 'uploading'
      this.inflight += 1
      void this.run(job).finally(() => {
        this.inflight -= 1
        this.pump()
      })
    }
    this.emit()
  }

  private async run(job: StoredJob) {
    const abort = new AbortController()
    this.aborts.add(abort)
    try {
      if (!job.driveFileId) {
        if (!job.uploadUrl) {
          const claim = await this.transport.claim({ name: job.name, hash: job.hash, mime: job.mime, bytes: job.size })
          if (claim.duplicate) {
            job.status = 'duplicate'
            job.progress = 1
            job.error = `Already in the library${claim.name ? `: ${claim.name}` : ''}.`
            await this.forget(job)
            return
          }
          job.uploadUrl = claim.uploadUrl
          await this.persist(job)
        }
        const saved = await this.transport.put({
          blob: job.blob,
          mime: job.mime,
          uploadUrl: job.uploadUrl,
          uploadedBytes: job.uploadedBytes,
          signal: abort.signal,
          onBytes: bytes => {
            job.uploadedBytes = bytes
            job.progress = job.size ? Math.min(0.9, bytes / job.size) : 0.9
            this.emit()
            void this.persist(job)
          },
        })
        job.driveFileId = saved.id
        job.name = saved.name || job.name
        job.uploadedBytes = job.size
        await this.persist(job)
      }
      const thumbnail = await makeThumbnail(job.blob).catch(() => null)
      const registered = await this.transport.finish({
        driveFileId: job.driveFileId,
        name: job.name,
        hash: job.hash,
        mime: job.mime,
        bytes: job.size,
        thumbnail,
      })
      if (registered.duplicate) {
        job.status = 'duplicate'
        job.error = 'Already in the library.'
      } else {
        job.status = 'done'
        job.error = ''
        this.onFinished?.()
      }
      job.progress = 1
      await this.forget(job)
    } catch (error) {
      if (this.stopped || abort.signal.aborted) {
        job.status = 'queued'
        await this.persist(job)
        return
      }
      if (error instanceof SessionExpired) {
        job.uploadUrl = ''
        job.uploadedBytes = 0
      }
      job.attempts += 1
      job.error = error instanceof Error ? error.message : 'Upload failed.'
      if (job.attempts >= UPLOAD_ATTEMPTS) job.status = 'failed'
      else {
        job.status = 'queued'
        job.nextAt = Date.now() + retryDelayMs(job.attempts)
      }
      await this.persist(job)
    } finally {
      this.aborts.delete(abort)
      this.emit()
    }
  }

  private database() {
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return this.db
  }

  private async persist(job: StoredJob) {
    const db = await this.database()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('jobs', 'readwrite')
      tx.objectStore('jobs').put(job)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async forget(job: StoredJob) {
    const db = await this.database()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('jobs', 'readwrite')
      tx.objectStore('jobs').delete(job.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async readAll() {
    const db = await this.database()
    return new Promise<StoredJob[]>((resolve, reject) => {
      const tx = db.transaction('jobs', 'readonly')
      const request = tx.objectStore('jobs').getAll()
      request.onsuccess = () => resolve(request.result as StoredJob[])
      request.onerror = () => reject(request.error)
    })
  }
}
