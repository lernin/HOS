export function forestAudio(){
  const context=new AudioContext()
  const nature=context.createGain()
  nature.connect(context.destination)

  const birds=new Audio('/woodland/forest-birds.mp3')
  birds.loop=true
  birds.preload='auto'
  context.createMediaElementSource(birds).connect(nature)

  function levels(value:number){
    nature.gain.setTargetAtTime(Math.max(0,Math.min(1,value)),context.currentTime,.25)
  }

  async function start(){
    await context.resume()
    await birds.play()
  }

  function pauseAmbient(){
    birds.pause()
  }

  function pause(){
    pauseAmbient()
    void context.suspend()
  }

  function dispose(){
    pauseAmbient()
    birds.removeAttribute('src')
    birds.load()
    void context.close()
  }

  return {levels,start,pause,pauseAmbient,dispose}
}
