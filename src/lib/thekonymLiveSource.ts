import { thekonymReader as supabase } from './supabase'
import type { CatalogueTerm, ThekonymRecord, ViewerSource } from './thekonymViewer'

export const thekonymLiveSource: ViewerSource = {
  mode: 'live',
  async loadCatalogue(signal) {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)])
    const { data, error } = await supabase.from('thekonyms')
      .select('id,term,definition,greek_root_meaning,former_names,status,is_child_of')
      .order('term').limit(1000).abortSignal(boundedSignal)
    if (error) throw new Error(`Could not read production Thekonyms: ${error.message}`)
    return data as CatalogueTerm[]
  },
  async loadRecord(id, signal) {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)])
    const { data, error } = await supabase.from('thekonyms')
      .select('*,has_fields').eq('id', id).abortSignal(boundedSignal).single()
    if (error) throw new Error(error.code === 'PGRST116'
      ? 'This record is unavailable, deleted, or not accessible to this account.'
      : `Could not refresh this record: ${error.message}`)
    return data as unknown as ThekonymRecord
  },
}
