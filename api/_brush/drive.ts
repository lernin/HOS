import { createSign } from 'node:crypto'
import { cleanDetail } from './http.ts'

// Trash is a database flag. This module lists, reads, and uploads. It does not
// delete Drive files or change their parents.

export const BEAUTY_CONTEST_FOLDER_ID = '1_WEDf6e7FCzUw5nelM1pZypaCBRq0s39'
export const UPLOADS_FOLDER_NAME = 'Brush Uploads'

const FOLDER = 'application/vnd.google-apps.folder'
const IMAGE = /^image\/(jpeg|png|webp|gif|heic|heif)$/i
const TEXT = /^(text\/|application\/json)/i

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  parents?: string[]
  appProperties?: { brushHash?: string }
}
type ServiceAccount = { client_email: string, private_key: string }

let tokenCache: { token: string, exp: number } | null = null
let uploadsFolderId: string | null = null

export function driveFolderId() {
  return process.env.BRUSH_DRIVE_FOLDER_ID?.trim() || BEAUTY_CONTEST_FOLDER_ID
}

export function readServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) {
    throw Object.assign(new Error('Google Drive is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON to the service-account JSON key.'), { status: 503 })
  }
  let parsed: ServiceAccount
  try {
    parsed = JSON.parse(raw) as ServiceAccount
  } catch {
    throw Object.assign(new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not valid JSON.'), { status: 503 })
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw Object.assign(new Error('The Drive service-account JSON needs client_email and private_key.'), { status: 503 })
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
  return parsed
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

async function accessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.token
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const assertion = `${header}.${claim}.${signer.sign(account.private_key).toString('base64url')}`
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const body = await response.json() as { access_token?: string, error?: string, error_description?: string }
  if (!response.ok || !body.access_token) {
    throw Object.assign(new Error(body.error_description || body.error || 'Drive refused the service account.'), { status: 502 })
  }
  tokenCache = { token: body.access_token, exp: now + 3500 }
  return body.access_token
}

function assertId(id: string) {
  if (!/^[\w-]+$/.test(id)) throw Object.assign(new Error('Unexpected Drive id.'), { status: 400 })
}

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.headers || {}) } })
  if (response.ok) return response
  const detail = cleanDetail(await response.text())
  const status = response.status === 401 || response.status === 403 ? 502 : response.status
  const message = response.status === 403 || response.status === 404
    ? `Drive denied this folder. Share the Beauty Contest folder with the service account as Editor. ${detail}`
    : `Drive request failed. ${detail}`
  throw Object.assign(new Error(message), { status })
}

export async function listChildren(folderId: string, pageToken?: string) {
  assertId(folderId)
  const account = readServiceAccount()
  const token = await accessToken(account)
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', `'${folderId}' in parents and trashed = false`)
  url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,appProperties)')
  url.searchParams.set('pageSize', '80')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  const response = await driveFetch(token, url.toString())
  const body = await response.json() as { nextPageToken?: string, files?: DriveFile[] }
  return { files: body.files || [], nextPageToken: body.nextPageToken || null, email: account.client_email }
}

export function isImage(file: DriveFile) {
  return IMAGE.test(file.mimeType)
}

export function isFolder(file: DriveFile) {
  return file.mimeType === FOLDER
}

export function isSidecar(file: DriveFile) {
  return TEXT.test(file.mimeType) || /\.(txt|json|md)$/i.test(file.name)
}

export async function readSidecar(fileId: string) {
  assertId(fileId)
  const token = await accessToken(readServiceAccount())
  const response = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`)
  const text = await response.text()
  return text.slice(0, 20000)
}

export async function ensureUploadsFolder() {
  if (uploadsFolderId) return uploadsFolderId
  const root = driveFolderId()
  const account = readServiceAccount()
  const token = await accessToken(account)
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', `'${root}' in parents and name = '${UPLOADS_FOLDER_NAME}' and mimeType = '${FOLDER}' and trashed = false`)
  url.searchParams.set('fields', 'files(id,name)')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  const listed = await driveFetch(token, url.toString())
  const found = await listed.json() as { files?: DriveFile[] }
  if (found.files?.[0]) {
    uploadsFolderId = found.files[0].id
    return uploadsFolderId
  }
  const created = await driveFetch(token, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: UPLOADS_FOLDER_NAME, mimeType: FOLDER, parents: [root] }),
  })
  const folder = await created.json() as { id: string }
  uploadsFolderId = folder.id
  return uploadsFolderId
}

export async function uploadJpeg(name: string, bytes: Uint8Array) {
  const parent = await ensureUploadsFolder()
  const token = await accessToken(readServiceAccount())
  const boundary = `brush${Date.now()}`
  const meta = JSON.stringify({ name, parents: [parent], mimeType: 'image/jpeg' })
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`
  const tail = `\r\n--${boundary}--`
  const headBytes = Buffer.from(head)
  const tailBytes = Buffer.from(tail)
  const body = Buffer.concat([headBytes, Buffer.from(bytes), tailBytes])
  const response = await driveFetch(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType', {
    method: 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return response.json() as Promise<{ id: string, name: string, mimeType: string }>
}

const UPLOAD_HOST = 'https://www.googleapis.com/upload/drive/'

export function isDriveUploadUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/upload/drive/')
  } catch {
    return false
  }
}

export async function beginResumableUpload(name: string, mime: string, bytes: number, hash: string) {
  const parent = await ensureUploadsFolder()
  const token = await accessToken(readServiceAccount())
  const safeName = name.replace(/[^\w.\- ]+/g, '').slice(0, 180) || 'photo'
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': mime,
      'x-upload-content-length': String(bytes),
    },
    body: JSON.stringify({
      name: safeName,
      parents: [parent],
      mimeType: mime,
      appProperties: { brushHash: hash },
    }),
  })
  const location = response.headers.get('location') || ''
  if (!response.ok || !isDriveUploadUrl(location)) {
    const detail = cleanDetail(await response.text())
    throw Object.assign(new Error(detail || 'Drive did not start the upload.'), { status: 502 })
  }
  return location
}

export async function forwardUploadChunk(uploadUrl: string, bytes: Uint8Array, range: string, mime: string) {
  if (!isDriveUploadUrl(uploadUrl) || !uploadUrl.startsWith(UPLOAD_HOST)) {
    throw Object.assign(new Error('Upload session is not a Drive URL.'), { status: 400 })
  }
  const token = await accessToken(readServiceAccount())
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    redirect: 'manual',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': mime,
      'content-range': range,
    },
    body: bytes,
  })
  if (response.status === 308) {
    const next = response.headers.get('location') || ''
    return { complete: false as const, uploadUrl: isDriveUploadUrl(next) ? next : uploadUrl }
  }
  if (response.status === 404 || response.status === 410) {
    throw Object.assign(new Error('Upload session expired.'), { status: 410 })
  }
  if (response.status !== 200 && response.status !== 201) {
    const detail = cleanDetail(await response.text())
    throw Object.assign(new Error(`Drive upload failed. ${detail}`), { status: 502 })
  }
  const file = await response.json() as { id?: string, name?: string }
  if (!file.id) throw Object.assign(new Error('Drive finished the upload without a file id.'), { status: 502 })
  return { complete: true as const, file: { id: file.id, name: file.name || '' } }
}

export async function uploadsFile(fileId: string) {
  assertId(fileId)
  const parent = await ensureUploadsFolder()
  const token = await accessToken(readServiceAccount())
  const response = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,parents,mimeType,size,appProperties&supportsAllDrives=true`)
  const file = await response.json() as DriveFile
  if (!file.parents?.includes(parent)) {
    throw Object.assign(new Error('That file is not in Brush Uploads.'), { status: 400 })
  }
  return file
}

export async function downloadPreview(fileId: string) {
  assertId(fileId)
  const token = await accessToken(readServiceAccount())
  const metaResponse = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,mimeType&supportsAllDrives=true`)
  const meta = await metaResponse.json() as { thumbnailLink?: string, mimeType?: string }
  if (meta.thumbnailLink) {
    const larger = meta.thumbnailLink.replace(/=s\d+/, '=s1600')
    const thumb = await fetch(larger)
    if (thumb.ok) {
      const bytes = new Uint8Array(await thumb.arrayBuffer())
      return { bytes, mediaType: thumb.headers.get('content-type') || 'image/jpeg' }
    }
  }
  const media = await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`)
  const length = Number(media.headers.get('content-length') || 0)
  if (length > 3_500_000) throw Object.assign(new Error('That Drive original is too large to preview. Sync again after Drive has made a thumbnail.'), { status: 413 })
  const bytes = new Uint8Array(await media.arrayBuffer())
  if (bytes.byteLength > 3_500_000) throw Object.assign(new Error('That Drive original is too large to preview.'), { status: 413 })
  return { bytes, mediaType: meta.mimeType || media.headers.get('content-type') || 'image/jpeg' }
}
