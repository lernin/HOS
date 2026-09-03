import { thekonymReader as supabase } from './supabase'
import type { CatalogueTerm, ThekonymRecord, ViewerSource } from './thekonymViewer'
export function createThekonymLiveSource(pin: string): ViewerSource {
  async function read(id: string | null, signal: AbortSignal) {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(15000)])
    const { data, error } = await supabase.rpc('lab_thekonym_read', { pin, term_id: id }).abortSignal(bounded)
    if (error) throw new Error(error.message)
    if (!data) throw new Error('This Thekonym is no longer available.')
    return data
  }
  async function assistant(body: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch('/api/thekonym-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-review-pin': pin }, body: JSON.stringify(body), cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(75000)]) : AbortSignal.timeout(75000) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not complete this request.')
    return data
  }
  return {
    mode: 'live',
    async edit(id, changes, expected, requestId, reason) { return assistant({ action: 'apply', termId: id, changes, expected, requestId, reason }) },
    async chat(id, field, messages, signal) { return assistant({ action: 'chat', termId: id, field, messages }, signal) },
    async syncLogs(id) { return assistant({ action: 'sync', termId: id }) },
    async transcribe(audio, signal) {
      const form = new FormData(); form.append('audio', audio, 'recording.webm')
      const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'x-review-pin': pin }, body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(75000)]) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not transcribe.'); return data.text
    },
    async loadCatalogue(signal) { return await read(null, signal) as CatalogueTerm[] },
    async loadRecord(id, signal) { return await read(id, signal) as ThekonymRecord },
  }
}
