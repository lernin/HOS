export const MUSIC_AUDIO_CACHE = 'hos-music-audio-v1'

export async function deleteLocalAudio(url: string) {
  if (!url || !('caches' in window)) return false
  const cache = await caches.open(MUSIC_AUDIO_CACHE)
  return cache.delete(url)
}
