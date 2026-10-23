import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || 'https://jzaghifuhinkzzhiojre.supabase.co'

let admin: SupabaseClient | null | undefined

export function storageAdmin() {
  if (admin !== undefined) return admin
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  admin = key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null
  return admin
}

export function thumbPath(hash: string) {
  const path = `${hash}.webp`
  if (!/^[a-f0-9]{64}\.webp$/.test(path)) {
    throw Object.assign(new Error('Preview path is not valid.'), { status: 400 })
  }
  return path
}

export async function putThumb(hash: string, bytes: Uint8Array) {
  const client = storageAdmin()
  if (!client) return false
  const path = thumbPath(hash)
  const { error } = await client.storage.from('brush-thumbs').upload(path, bytes, {
    contentType: 'image/webp',
    upsert: true,
  })
  return !error
}

export async function getThumb(path: string) {
  const client = storageAdmin()
  if (!client) throw Object.assign(new Error('Preview storage is not configured.'), { status: 503 })
  if (!/^[a-f0-9]{64}\.webp$/.test(path)) throw Object.assign(new Error('Preview path is not valid.'), { status: 400 })
  const { data, error } = await client.storage.from('brush-thumbs').download(path)
  if (error || !data) throw Object.assign(new Error('Cached preview is missing.'), { status: 404 })
  return new Uint8Array(await data.arrayBuffer())
}
