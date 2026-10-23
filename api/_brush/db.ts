import { createClient } from '@supabase/supabase-js'
import { json } from './http.ts'

const url = process.env.SUPABASE_URL || 'https://jzaghifuhinkzzhiojre.supabase.co'
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'

export const brushDb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

export async function gate(labPin: string, brushPin: string) {
  const { error } = await brushDb.rpc('brush_gate', { lab_pin: labPin, brush_pin: brushPin })
  if (!error) return null
  const status = error.code === '28000' ? 401 : 400
  return json({ error: error.code === '28000' ? 'Wrong PIN.' : error.message }, status)
}

export async function rpc<T>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await brushDb.rpc(fn, args)
  if (error) {
    const status = error.code === '28000' ? 401 : 400
    throw Object.assign(new Error(error.code === '28000' ? 'Wrong PIN.' : error.message), { status })
  }
  return data as T
}
