// Original water/footstep synthesis plus the Lab's existing credited CC0 forest recording.
export function villageAudio() {
  const context = new AudioContext()
  const master = context.createGain(); master.gain.value = .5; master.connect(context.destination)
  const waterGain = context.createGain(); waterGain.gain.value = .05; waterGain.connect(master)
  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate)
  const samples = buffer.getChannelData(0); let previous = 0
  for (let i = 0; i < samples.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .025) / 1.025; samples[i] = previous * 7 }
  const water = context.createBufferSource(); water.buffer = buffer; water.loop = true
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1600
  water.connect(filter); filter.connect(waterGain); water.start()
  const birds = new Audio('/woodland/forest-birds.mp3'); birds.loop = true; birds.volume = .22
  let volume = .5, disposed = false, lastStep = 0
  return {
    async play() { if (disposed) return; await context.resume(); await birds.play().catch(() => {}) },
    pause() { birds.pause(); if (!disposed) void context.suspend() },
    volume(value: number) { volume = value; master.gain.setTargetAtTime(value, context.currentTime, .1); birds.volume = value * .44 },
    update(x: number, z: number, inside: boolean, walking: boolean, boating: boolean) {
      if (disposed || context.state !== 'running') return
      const distance = Math.min(Math.hypot(x - 1, z + 2.5), Math.hypot(x - 2, z + 21))
      waterGain.gain.setTargetAtTime((.035 + .2 / (1 + distance * .05)) * (inside ? .25 : 1), context.currentTime, .4)
      birds.volume = volume * (inside ? .12 : .44)
      if (walking && !boating && context.currentTime - lastStep > .52) {
        lastStep = context.currentTime
        const sound = context.createBufferSource(); sound.buffer = buffer
        const gain = context.createGain(), low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 320
        gain.gain.setValueAtTime(.11, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .12)
        sound.connect(low); low.connect(gain); gain.connect(master); sound.start(0, .3, .14)
        sound.onended = () => { sound.disconnect(); low.disconnect(); gain.disconnect() }
      }
    },
    dispose() { if (disposed) return; disposed = true; birds.pause(); birds.removeAttribute('src'); birds.load(); water.stop(); water.disconnect(); filter.disconnect(); waterGain.disconnect(); master.disconnect(); void context.close() },
  }
}
