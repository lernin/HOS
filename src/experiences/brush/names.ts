const FILENAME_ATTRIBUTES: { pattern: RegExp, trait: string, value: string }[] = [
  { pattern: /blunt/i, trait: 'bangs (none/blunt/curtain)', value: 'blunt' },
  { pattern: /curtain/i, trait: 'bangs (none/blunt/curtain)', value: 'curtain' },
  { pattern: /silk/i, trait: 'hair softness/silkiness', value: 'silky' },
  { pattern: /shine|gloss/i, trait: 'hair shine', value: 'shiny' },
  { pattern: /studio/i, trait: 'setting/background', value: 'studio' },
  { pattern: /daylight|sunlight/i, trait: 'lighting', value: 'daylight' },
]

export function countryFromPath(folderPath: string) {
  const parts = folderPath.split('/').map(part => part.trim()).filter(Boolean)
  if (!parts.length) return ''
  if (parts[0] === 'Brush Uploads') return 'Uploads'
  return parts[0]
}

export function seriesFromName(name: string) {
  const match = name.match(/(?:^|[_\s-])((?:model|series)[_\s-]?[A-Za-z0-9]+)/i)
  return match ? match[1].replace(/[_-]+/g, ' ') : null
}

export function fileStem(name: string) {
  const base = name.split('/').pop() || name
  return base.replace(/\.[^.]+$/, '').replace(/\.prompt$/i, '')
}

export type GroupSource = {
  name: string
  folder_path?: string
  series?: string | null
}

/** Keys that mean "same model or series". Shared by the client queue and private.brush_group_keys. */
export function groupKeys(source: GroupSource) {
  const keys: string[] = []
  const stem = fileStem(source.name).toLowerCase()
  const stripped = stem.replace(/[_\s-]+\d+$/, '')
  if (stripped) keys.push(`stem:${stripped}`)
  const parts = stripped.split(/[_\s-]+/).filter(Boolean)
  if (parts.length >= 2) keys.push(`family:${parts[0]}_${parts[1]}`)
  else if (parts.length === 1) keys.push(`family:${parts[0]}`)
  if (stem.includes('redo3')) keys.push('series:redo3')
  if (stem.includes('pony')) keys.push('series:pony')
  const folderParts = (source.folder_path || '').split('/').map(part => part.trim().toLowerCase()).filter(Boolean)
  if (folderParts.length >= 2) keys.push(`folder:${folderParts.join('/')}`)
  const series = source.series?.trim().toLowerCase()
  if (series) keys.push(`label:${series}`)
  return keys
}

export function filenameAttributes(name: string) {
  return FILENAME_ATTRIBUTES
    .filter(item => item.pattern.test(name))
    .map(item => ({ trait: item.trait, value: item.value }))
}
