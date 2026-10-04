import * as T from 'three'
import { createEstateKit } from './kit'
import { architecture, landscape, waters } from './environment'
import { furnish } from './furniture'

export type EstatePlanBox={x:number;y:number;w:number;h:number}

export function createEstatePlanReality(canvas:HTMLCanvasElement){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
  renderer.outputColorSpace=T.SRGBColorSpace
  renderer.toneMapping=T.ACESFilmicToneMapping
  renderer.toneMappingExposure=1
  renderer.shadowMap.enabled=false
  const scene=new T.Scene()
  scene.background=new T.Color('#dceff2')
  scene.add(new T.HemisphereLight('#d5e5ef','#8c816d',1.35))
  const sun=new T.DirectionalLight('#fff1d4',2.2)
  sun.position.set(-45,80,-60)
  scene.add(sun)

  const kit=createEstateKit(scene)
  architecture(kit,{planCutaway:true})
  furnish(kit)
  landscape(kit)
  kit.finish()
  const water=waters(scene)
  water.update(0,'daylight')

  const camera=new T.OrthographicCamera(-50,50,50,-50,.1,300)
  camera.position.set(0,120,0)
  camera.up.set(0,0,-1)
  camera.lookAt(0,0,0)
  let current:EstatePlanBox={x:-50,y:-50,w:100,h:100}
  let disposed=false

  function render(box:EstatePlanBox=current){
    if(disposed)return
    current=box
    const w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight))
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25))
    renderer.setSize(w,h,false)
    camera.left=-(box.x+box.w)
    camera.right=-box.x
    camera.top=-box.y
    camera.bottom=-(box.y+box.h)
    camera.updateProjectionMatrix()

    // Match SVG preserveAspectRatio="xMidYMid meet" exactly so the live 3D
    // reality layer and all annotation overlays share one immutable transform.
    const viewAspect=box.w/box.h,canvasAspect=w/h
    let vx=0,vy=0,vw=w,vh=h
    if(canvasAspect>viewAspect){
      vw=h*viewAspect
      vx=(w-vw)/2
    }else{
      vh=w/viewAspect
      vy=(h-vh)/2
    }
    renderer.setScissorTest(false)
    renderer.setClearColor('#dceff2',1)
    renderer.clear(true,true,true)
    renderer.setViewport(Math.round(vx),Math.round(vy),Math.round(vw),Math.round(vh))
    renderer.setScissor(Math.round(vx),Math.round(vy),Math.round(vw),Math.round(vh))
    renderer.setScissorTest(true)
    renderer.render(scene,camera)
    renderer.setScissorTest(false)
  }

  const observer=new ResizeObserver(()=>render())
  observer.observe(canvas)
  render()

  return {
    render,
    dispose(){
      if(disposed)return
      disposed=true
      observer.disconnect()
      water.dispose()
      kit.dispose()
      renderer.dispose()
    },
  }
}
