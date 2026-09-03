export type Confidence = 0 | 1 | 2 | 3 | null

export type FieldDescription = {
  name: string
  type: string
  nullable: boolean
  generated: boolean
  path: string
  thekonyms: { id: string; term: string }[]
}

export type HasFields = {
  table: string | null
  matched_by: string | null
  fields: FieldDescription[]
}

export type CatalogueTerm = {
  id: string
  term: string
  definition: string | null
  greek_root_meaning: string | null
  former_names: string[] | null
  status: string | null
  is_child_of: string | null
}

export type ThekonymRecord = CatalogueTerm & {
  term_pronunciation: string | null
  greek_root: string | null
  greek_root_meaning_confidence: Confidence
  greek_root_explanation: string | null
  definition_confidence: Confidence
  technical_definition: string | null
  technical_definition_confidence: Confidence
  example: string | null
  example_confidence: Confidence
  confidence_score: number | null
  ashleys_fluency: Confidence
  maturity: number | null
  priority: number | null
  target_phase: number | null
  application_priority: number | null
  is_table: boolean | null
  is_field_of: string[] | null
  is_emergent: boolean | null
  is_derivable: boolean | null
  is_physonym: boolean | null
  is_member_of: string[] | null
  is_related_to: string[] | null
  anonym_confidence: Confidence
  sibling_order: number | null
  sibling_order_confidence: Confidence
  superseded_by: string | null
  superseded_by_thekonym_id: string | null
  supersession_confidence: Confidence
  suggested_status: string | null
  canonical_paper_path: string | null
  github_quality: string | null
  github_quality_score: Confidence
  google_docs_quality: string | null
  google_docs_quality_score: Confidence
  google_docs_migration_level: number | null
  google_docs_migration_status: string | null
  significance: number | null
  notes: string | null
  review_note: string | null
  structure_note: string | null
  concept_rationale: string | null
  github_review_note: string | null
  google_docs_review_note: string | null
  created_at: string | null
  updated_at: string | null
  has_fields?: HasFields
  [key: string]: unknown
}

export type ViewerSource = {
  mode: 'live' | 'snapshot'
  capturedAt?: string
  loadCatalogue(signal: AbortSignal): Promise<CatalogueTerm[]>
  loadRecord(id: string, signal: AbortSignal): Promise<ThekonymRecord>
}

export const confidenceNames = ['No confidence', 'Low', 'Medium', 'High']
export const fluencyNames = ['No fluency', 'Vague awareness', 'Understood', 'Fluent']
export const maturityNames = ['', 'Unformed', 'Emerging', 'Usable', 'Integrated', 'Stable']

export function score(value: number | null | undefined): string {
  return value == null ? '—' : String(value)
}

export function pronunciation(value: string | null): string {
  // Display normalization only: preserve the stored spelling and stress.
  return value?.replace(/\s*[•·]\s*|\s*[-–]\s*/g, ' • ').trim() || 'Pronunciation not recorded'
}

export function searchCatalogue(terms: CatalogueTerm[], query: string): CatalogueTerm[] {
  const q = query.normalize('NFKC').trim().toLocaleLowerCase()
  if (!q) return terms
  const matches = terms.filter(t => [t.term, ...(t.former_names || []), t.greek_root_meaning, t.definition]
    .some(value => value?.normalize('NFKC').toLocaleLowerCase().includes(q)))
  return matches.sort((a, b) => {
    const rank = (t: CatalogueTerm) => t.term.toLowerCase() === q ? 0 : t.term.toLowerCase().startsWith(q) ? 1 : 2
    return rank(a) - rank(b) || a.term.localeCompare(b.term)
  })
}

export function calculatedPriority(t: ThekonymRecord): number {
  if (t.target_phase == null || t.target_phase <= 0 || t.is_table == null || t.application_priority == null) return 0
  return (((t.is_table ? 5 : 1) * (t.is_field_of?.length ? 2 : 1)) + t.application_priority) / t.target_phase
}

export function checkedAgo(value: string | null, now: number): string {
  if (!value) return 'Not checked yet'
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000))
  return minutes < 1 ? 'Checked just now' : `Checked ${minutes} minute${minutes === 1 ? '' : 's'} ago`
}

export function priorityExplanation(t: ThekonymRecord): string {
  if (t.target_phase == null || t.is_table == null || t.application_priority == null) {
    const missing = [t.target_phase == null && 'target phase', t.is_table == null && 'table assessment', t.application_priority == null && 'application priority'].filter(Boolean)
    return `0 · Missing ${missing.join(', ')}.`
  }
  return `((${t.is_table ? 5 : 1} × ${t.is_field_of?.length ? 2 : 1}) + ${t.application_priority}) ÷ ${t.target_phase}`
}

export function examples(value: string | null): string[] {
  if (!value?.trim()) return []
  const numbered = value.replace(/^Examples:\s*/i, '').split(/(?:^|;\s*)\(\d+\)\s*/).filter(Boolean)
  return numbered.length > 1 ? numbered.map(s => s.trim()) : value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
}

export function paperUrl(path: string | null): string | null {
  if (!path) return null
  if (/^https:\/\/github\.com\/lernin\/Procedia\//.test(path)) return path
  if (!path.startsWith('docs/') || path.split('/').some(p => p === '..')) return null
  return `https://github.com/lernin/Procedia/blob/main/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function copyText(t: ThekonymRecord, capturedAt: string, mode: ViewerSource['mode']): string {
  const source = mode === 'live' ? 'Fresh database read' : 'PREVIEW SNAPSHOT — not a live database read'
  return [
    `Procedia · ${t.term}`,
    source,
    'Source: production Supabase · public.thekonyms',
    `Retrieved at: ${capturedAt}`,
    `Record ID: ${t.id}`,
    '',
    `Thekonym: ${t.term}`,
    `Pronunciation: ${pronunciation(t.term_pronunciation)}`,
    `Greek: ${t.greek_root || 'Not recorded'}`,
    `Greek meaning [${score(t.greek_root_meaning_confidence)}]: ${t.greek_root_meaning || 'Not recorded'}`,
    `Definition [${score(t.definition_confidence)}]: ${t.definition || 'Not recorded'}`,
    `Technical definition [${score(t.technical_definition_confidence)}]: ${t.technical_definition || 'Not recorded'}`,
    `Examples [${score(t.example_confidence)}]: ${t.example || 'Not recorded'}`,
    `Combined confidence: ${score(t.confidence_score)} / 27`,
    `Priority: ${calculatedPriority(t)}. ${priorityExplanation(t)}`,
    '',
    'Complete record (stored values preserved; has_fields is derived):',
    JSON.stringify(t, null, 2),
    '',
    'This is a timestamped readout. Re-read the database before applying changes; preserve existing values and do not infer missing confidence scores.',
  ].join('\n')
}

export async function freshCopy(source: ViewerSource, id: string, signal: AbortSignal) {
  const record = await source.loadRecord(id, signal)
  if (signal.aborted) throw new DOMException('Read cancelled', 'AbortError')
  if (record.id !== id) throw new Error('The returned record does not match the selected Thekonym.')
  const capturedAt = source.mode === 'snapshot' ? source.capturedAt || '' : new Date().toISOString()
  return { record, capturedAt, text: copyText(record, capturedAt, source.mode) }
}

export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return } catch { /* Use the selection fallback. */ }
  }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.style.cssText = 'position:fixed;left:-9999px;top:0'
  area.setAttribute('readonly', '')
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  previous?.focus()
  if (!copied) throw new Error('Clipboard access was blocked. Use “Select text” below.')
}
