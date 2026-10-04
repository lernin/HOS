import * as T from 'three'
import { createEstateKit } from './kit'
import { architecture, landscape, waters } from './environment'
import { furnish } from './furniture'

export type EstatePlanBox={x:number;y:number;w:number;h:number}
export type EstatePlanPick={
  kind:'floor'
  id:string
  code:string|null
  name:string
  use:string
  x1:number;x2:number;z1:number;z2:number
}

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
  architecture(kit)
  furnish(kit)
  landscape(kit)
  kit.finish()
  for(const mesh of scene.children)if(mesh.userData.estatePlanOccluder)mesh.visible=false
  const water=waters(scene)
  water.update(0,'daylight')

  const camera=new T.OrthographicCamera(-50,50,50,-50,.1,300)
  camera.position.set(0,120,0)
  camera.up.set(0,0,-1)
  camera.lookAt(0,0,0)
  let current:EstatePlanBox={x:-50,y:-50,w:100,h:100}
  let disposed=false
  const raycaster=new T.Raycaster()
  const ndc=new T.Vector2()

  function render(box:EstatePlanBox=current){
    if(disposed)return
    current=box
    const w=Math.max(1,Math.round(canvas.clientWidth)),h=Math.max(1,Math.round(canvas.clientHeight))
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25))
    renderer.setSize(w,h,false)
    camera.left=box.x
    camera.right=box.x+box.w
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

  function pick(clientX:number,clientY:number):EstatePlanPick|null{
    const rect=canvas.getBoundingClientRect()
    if(!rect.width||!rect.height)return null
    const viewAspect=current.w/current.h,canvasAspect=rect.width/rect.height
    let vx=0,vy=0,vw=rect.width,vh=rect.height
    if(canvasAspect>viewAspect){vw=rect.height*viewAspect;vx=(rect.width-vw)/2}
    else{vh=rect.width/viewAspect;vy=(rect.height-vh)/2}
    // The overhead camera uses world X directly, matching the walkthrough.
    const localX=clientX-rect.left,localY=clientY-rect.top
    if(localX<vx||localX>vx+vw||localY<vy||localY>vy+vh)return null
    ndc.set(((localX-vx)/vw)*2-1,1-((localY-vy)/vh)*2)
    raycaster.setFromCamera(ndc,camera)
    for(const hit of raycaster.intersectObjects(scene.children,true)){
      let obj:T.Object3D|null=hit.object
      while(obj){
        const data=obj.userData?.estatePlan as EstatePlanPick|undefined
        if(data?.kind==='floor')return data
        obj=obj.parent
      }
    }
    return null
  }

  return {
    render,
    pick,
    snapshot(){
      // Copy immediately after render; the WebGL drawing buffer is transient.
      render()
      const viewport=renderer.getViewport(new T.Vector4()),ratio=renderer.getPixelRatio()
      const copy=document.createElement('canvas')
      copy.width=Math.max(1,Math.round(viewport.z*ratio))
      copy.height=Math.max(1,Math.round(viewport.w*ratio))
      const context=copy.getContext('2d')
      if(!context)throw new Error('Could not capture the estate plan')
      context.drawImage(canvas,viewport.x*ratio,(canvas.clientHeight-viewport.y-viewport.w)*ratio,viewport.z*ratio,viewport.w*ratio,0,0,copy.width,copy.height)
      return copy.toDataURL('image/png')
    },
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
