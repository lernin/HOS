export function forestAudio(){
  const context=new AudioContext(),nature=context.createGain()
  nature.connect(context.destination)
  const birds=new Audio('/woodland/forest-birds.mp3')
  birds.loop=true
  birds.preload='auto'
  context.createMediaElementSource(birds).connect(nature)

  let active=false
  function setLevel(value:number){nature.gain.setTargetAtTime(Math.max(0,Math.min(1,value)),context.currentTime,.25)}
  async function start(){active=true;await context.resume();await birds.play()}
  function pauseAmbient(){active=false;birds.pause()}
  function pause(){pauseAmbient();void context.suspend()}
  function dispose(){pauseAmbient();birds.removeAttribute('src');birds.load();void context.close()}

  return {levels:setLevel,start,pause,pauseAmbient,dispose,isActive:()=>active}
}
