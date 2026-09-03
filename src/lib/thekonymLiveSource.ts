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
  return {
    mode: 'live',
    async loadCatalogue(signal) { return await read(null, signal) as CatalogueTerm[] },
    async loadRecord(id, signal) { return await read(id, signal) as ThekonymRecord },
  }
}
