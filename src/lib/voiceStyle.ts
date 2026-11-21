import { DEFAULT_TTS_VOICE } from './ttsVoices'

/** Logical tone bucket chosen from lightweight keyword heuristics. */
export type VoiceTone = 'calm' | 'happy' | 'caring' | 'serious' | 'excited' | 'sad'

export type VoiceStyleResult = {
  tone: VoiceTone
  /** Fallback voice id; TTS callers use app default (e.g. `DEFAULT_TTS_VOICE`). */
  voice: string
  /** Natural-language instructions for models that support them (e.g. gpt-4o-mini-tts). */
  style: string
  speed: number
}

const DEFAULT_VOICE = DEFAULT_TTS_VOICE

const PRESET: Record<VoiceTone, { style: string; speed: number }> = {
  calm: { style: 'soft, steady, relaxed delivery', speed: 0.9 },
  happy: { style: 'light, playful, slightly upbeat', speed: 1.05 },
  caring: { style: 'warm, gentle, reassuring', speed: 0.85 },
  serious: { style: 'clear, focused, direct', speed: 1.0 },
  excited: { style: 'energetic, expressive, lively', speed: 1.1 },
  sad: { style: 'soft, slow, emotional, quiet', speed: 0.8 },
}

/** ±4% multiplicative jitter so consecutive lines in the same tone don’t sound identical. */
const SPEED_JITTER = 0.04

function jitterSpeed(base: number): number {
  const factor = 1 + (Math.random() - 0.5) * 2 * SPEED_JITTER
  return Math.min(4, Math.max(0.25, Math.round(base * factor * 1000) / 1000))
}

type Matcher = { tone: VoiceTone; re: RegExp; w: number }

/** Higher-weight / more specific patterns should appear earlier when they disambiguate. */
const MATCHERS: Matcher[] = [
  {
    tone: 'caring',
    re: /\b(sorry to hear|sorry you('?ve)?|here for you|thinking of you|take care|proud of you|you'?ve got this|you can do it|don'?t worry|i'?m with you|get well|hope you('?re)? (?:feeling )?(?:okay|better|alright))\b/i,
    w: 3,
  },
  { tone: 'sad', re: /\b(heartbreak|heartbroken|grief|mourning|devastat|passed away|no hope|hopeless|in tears)\b/i, w: 4 },
  { tone: 'sad', re: /\b(so sad|very sad|feeling (?:down|low|blue)|lonely|depressed|miss you)\b/i, w: 2 },
  { tone: 'serious', re: /\b(important:|critical|urgent:|action required|must (?:read|complete|not)|legal matter|confidential|compliance|caveat|deadline:|warning:|caution:|strictly speaking)\b/i, w: 3 },
  { tone: 'serious', re: /\b(in summary|to conclude|key (?:points?|takeaways?)|precisely|requirements?:)\b/i, w: 1 },
  { tone: 'excited', re: /[!]{2,}/, w: 2 },
  { tone: 'excited', re: /\b(wow[!?.]*|awesome|amazing|incredible|fantastic|let'?s go|yahoo|woohoo|so excited|pumped|thrilled|unbelievable)\b/i, w: 2 },
  { tone: 'excited', re: /[🎉✨🚀💪]/, w: 2 },
  { tone: 'happy', re: /\b(haha|hehe|\byay\b|fun[!.,]?|playful|delighted|glad to|happy to|great news|well done|nice work|wonderful|good job)\b/i, w: 2 },
  { tone: 'happy', re: /[😊😄🙌]/, w: 1 },
  { tone: 'calm', re: /\b(relax|peaceful|steady|calmly|no rush|take your time|breathe|gentle pace)\b/i, w: 2 },
  { tone: 'sad', re: /\b(sorry|apolog|unfortunately|regret|alas)\b/i, w: 1 },
]

/** When scores tie, prefer the first tone in this list (more emotive / specific first). */
const TIEBREAK: VoiceTone[] = ['sad', 'serious', 'excited', 'happy', 'caring', 'calm']

/**
 * Detect a coarse emotional tone from assistant text and map it to TTS voice / instruction / speed.
 * Heuristic only — no network, tuned for English phrases and a few emoji.
 */
export function getVoiceStyle(text: string): VoiceStyleResult {
  const sample = text.trim()
  const lower = sample.toLowerCase()

  const scores: Record<VoiceTone, number> = {
    calm: 0,
    happy: 0,
    caring: 0,
    serious: 0,
    excited: 0,
    sad: 0,
  }

  for (const { tone, re, w } of MATCHERS) {
    if (re.test(lower)) {
      scores[tone] += w
    }
  }

  let best: VoiceTone = 'calm'
  let bestScore = -1
  for (const tone of TIEBREAK) {
    if (scores[tone] > bestScore) {
      bestScore = scores[tone]
      best = tone
    }
  }
  if (bestScore <= 0) {
    best = 'calm'
  }

  const { style, speed: baseSpeed } = PRESET[best]
  return {
    tone: best,
    voice: DEFAULT_VOICE,
    style,
    speed: jitterSpeed(baseSpeed),
  }
}
