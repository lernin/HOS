export type SoundPrefs = { ambience: number; voice: number; muted: boolean; reduced: boolean }
export const defaultSound: SoundPrefs = { ambience: 0.35, voice: 0.8, muted: false, reduced: false }
export function readSound(): SoundPrefs {
  try {
    const p = JSON.parse(localStorage.getItem('water-garden-sound-v1') || '{}')
    return {
      ambience: typeof p.ambience === 'number' && Number.isFinite(p.ambience) ? Math.max(0, Math.min(1, p.ambience)) : 0.35,
      voice: typeof p.voice === 'number' && Number.isFinite(p.voice) ? Math.max(0, Math.min(1, p.voice)) : 0.8,
      muted: p.muted === true,
      reduced: p.reduced === true || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    }
  } catch { return { ...defaultSound } }
}
/** Original synthesized soundscape. No recordings, uploads, microphone or API calls. */
export class GardenAudio {
  private context: AudioContext | null = null
  private main: GainNode | null = null
  private water: GainNode | null = null
  private pan: StereoPannerNode | null = null
  private birdTimer = 0
  private duckTimer = 0
  private ducked = false
  private hidden = false
  private prefs: SoundPrefs = defaultSound
  async start(prefs: SoundPrefs) {
    this.prefs = prefs
    if (!this.context) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.context = new AC()
      const c = this.context
      this.main = c.createGain(); this.main.gain.value = 0; this.main.connect(c.destination)
      const buffer = c.createBuffer(1, c.sampleRate * 6, c.sampleRate)
      const data = buffer.getChannelData(0)
      let brown = 0
      for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * 0.024) / 1.025; data[i] = brown * 3 }
      const source = c.createBufferSource(); source.buffer = buffer; source.loop = true
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1800
      this.water = c.createGain(); this.water.gain.value = 0.38
      this.pan = c.createStereoPanner()
      source.connect(filter).connect(this.water).connect(this.pan).connect(this.main); source.start()
      const wind = c.createBiquadFilter(); wind.type = 'lowpass'; wind.frequency.value = 220
      const windGain = c.createGain(); windGain.gain.value = 0.15
      source.connect(wind).connect(windGain).connect(this.main)
      this.birdTimer = window.setInterval(() => {
        if (!this.hidden && !this.prefs.muted && !this.ducked) {
          this.tone(1500 + Math.random() * 450, 0.12, 0.012, 0, 1.2)
          this.tone(2200, 0.18, 0.009, 0.18, 0.8)
        }
      }, 8500)
    }
    if (!this.hidden) await this.context.resume().catch(() => undefined)
    this.update(prefs)
  }
  update(prefs: SoundPrefs) {
    this.prefs = prefs
    if (this.main && this.context) this.main.gain.setTargetAtTime(this.hidden || prefs.muted ? 0 : prefs.ambience * (this.ducked ? 0.2 : 1), this.context.currentTime, 0.25)
    if (prefs.muted && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }
  position(x: number, z: number) {
    if (!this.context || !this.water || !this.pan) return
    const d = Math.hypot(x, z + 9)
    this.water.gain.setTargetAtTime(0.22 + 0.7 / (1 + d * 0.22), this.context.currentTime, 0.3)
    this.pan.pan.setTargetAtTime(Math.max(-0.6, Math.min(0.6, -x / 14)), this.context.currentTime, 0.3)
  }
  private tone(frequency: number, duration: number, volume: number, delay = 0, endRatio = 1) {
    if (!this.context || !this.main || this.prefs.muted || this.hidden) return
    const c = this.context, oscillator = c.createOscillator(), gain = c.createGain(), now = c.currentTime + delay
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(frequency * endRatio, now + duration)
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(this.main); oscillator.start(now); oscillator.stop(now + duration + 0.02)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }
  chime() { [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 1.1, 0.075, i * 0.15)) }
  step(wood: boolean) { this.tone(wood ? 130 : 90, 0.08, 0.07, 0, 0.65) }
  speak(text: string) {
    if (!('speechSynthesis' in window) || this.prefs.muted || this.prefs.voice === 0 || this.hidden) return
    window.speechSynthesis.cancel(); window.clearTimeout(this.duckTimer)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'; utterance.rate = 0.86; utterance.volume = this.prefs.voice
    const voices = window.speechSynthesis.getVoices()
    const english = voices.find(v => v.lang.startsWith('en') && v.localService) || voices.find(v => v.lang.startsWith('en'))
    if (english) utterance.voice = english
    this.ducked = true; this.update(this.prefs)
    const restore = () => { this.ducked = false; this.update(this.prefs) }
    utterance.onend = restore; utterance.onerror = restore
    this.duckTimer = window.setTimeout(restore, Math.max(5000, text.length * 140))
    window.speechSynthesis.speak(utterance)
  }
  visibility(hidden: boolean) {
    this.hidden = hidden; this.update(this.prefs)
    if (hidden) { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); void this.context?.suspend().catch(() => undefined) }
    else void this.context?.resume().catch(() => undefined)
  }
  dispose() {
    window.clearInterval(this.birdTimer); window.clearTimeout(this.duckTimer)
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    void this.context?.close().catch(() => undefined); this.context = null
  }
}
