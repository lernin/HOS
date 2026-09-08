const MUSIC_AUDIO_INDEX_KEY = 'hos-music-audio-cache-index-v1'

type AudioIndex = Record<string, string[]>

function readAudioIndex(): AudioIndex {
  try {
    return JSON.parse(localStorage.getItem(MUSIC_AUDIO_INDEX_KEY) || '{}') as AudioIndex
  } catch {
    return {}
  }
}

function writeAudioIndex(index: AudioIndex) {
  localStorage.setItem(MUSIC_AUDIO_INDEX_KEY, JSON.stringify(index))
}

export function rememberLocalAudio(musicId: string, url: string) {
  if (!musicId || !url) return
  const index = readAudioIndex()
  const urls = new Set(index[musicId] || [])
  urls.add(url)
  index[musicId] = [...urls]
  writeAudioIndex(index)
}

export function commonsRedirectForSourcePage(sourcePage: string) {
  try {
    const url = new URL(sourcePage)
    if (url.hostname !== 'commons.wikimedia.org' || !url.pathname.startsWith('/wiki/File:')) return ''
    const fileName = decodeURIComponent(url.pathname.slice('/wiki/File:'.length))
    return 'https://commons.wikimedia.org/wiki/Special:Redirect/file/' + encodeURIComponent(fileName)
  } catch {
    return ''
  }
}

export async function deleteLocalAudioForItem(musicId: string, knownUrls: string[] = []) {
  if (!musicId || !('caches' in window)) return 0

  const index = readAudioIndex()
  const targets = new Set([...(index[musicId] || []), ...knownUrls].filter(Boolean))
  if (!targets.size) return 0

  let deleted = 0
  for (const cacheName of await caches.keys()) {
    const cache = await caches.open(cacheName)
    for (const request of await cache.keys()) {
      if (!targets.has(request.url)) continue
      if (await cache.delete(request, { ignoreVary:true })) deleted += 1
    }
  }

  if (deleted) {
    delete index[musicId]
    writeAudioIndex(index)
  }
  return deleted
}
