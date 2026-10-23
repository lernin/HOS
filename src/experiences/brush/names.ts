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

export function filenameAttributes(name: string) {
  return FILENAME_ATTRIBUTES
    .filter(item => item.pattern.test(name))
    .map(item => ({ trait: item.trait, value: item.value }))
}
