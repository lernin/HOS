/** localStorage key for chosen OpenAI TTS voice on /desk/speaking. */
export const TTS_VOICE_STORAGE_KEY = 'procedia-desk-speaking-tts-voice'

/**
 * Built-in voices for `gpt-4o-mini-tts` (must match `/api/tts` proxy in `vite.config.ts`).
 * Order: roughly neutral → expressive; Marin/Cedar last as “newer” presets.
 */
export const TTS_VOICE_IDS = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const

export type TtsVoiceId = (typeof TTS_VOICE_IDS)[number]

export const DEFAULT_TTS_VOICE: TtsVoiceId = 'verse'

export function isTtsVoiceId(v: string): v is TtsVoiceId {
  return (TTS_VOICE_IDS as readonly string[]).includes(v)
}

export function normalizeStoredTtsVoice(raw: string | null): TtsVoiceId {
  if (!raw) return DEFAULT_TTS_VOICE
  const lower = raw.trim().toLowerCase()
  return isTtsVoiceId(lower) ? lower : DEFAULT_TTS_VOICE
}
