import * as T from 'three'
import { WORLD_HALF, assistedPoint, bridgeHeight, canStand, conceptById, floorHeight, getBridges, getPads, mainLoop, riverCenter, spawnFor, terrainHeight, waterHeight, zoneName, type ConceptId, type FlatPoint, type Point } from './world'

export type VillageV2Input = { x: number; z: number; yaw: number; pitch: number; paused: boolean }
export type VillageV2State = { position: Point; zone: string; fps: number }

function makeRibbon(points: T.Vector3[], width: number) {
  const positions:number[]=[]; const indices:number[]=[]
  for(let i=0;i<points.length;i++) {
    const prev=points[Math.max(0,i-1)], next=points[Math.min(points.length-1,i+1)]
    const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len
    positions.push(points[i].x+nx*width*.5,points[i].y,points[i].z+nz*width*.5)
    positions.push(points[i].x-nx*width*.5,points[i].y,points[i].z-nz*width*.5)
    if(i<points.length-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3)}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g
}

function sampledPath(id:ConceptId, points:FlatPoint[]) {
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p.x,0,p.z)),false,'catmullrom',.28)
  return curve.getPoints(320).map(p=>new T.Vector3(p.x,floorHeight(id,p.x,p.z)+.09,p.z))
}

function seeded(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function canvasTexture(kind:'grass'|'stone'){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256
  const ctx=canvas.getContext('2d')!,r=seeded(kind==='grass'?9137:4201)
  if(kind==='grass'){
    ctx.fillStyle='#768d58';ctx.fillRect(0,0,256,256)
    for(let i=0;i<4200;i++){
      const x=r()*256,y=r()*256,l=.8+r()*2.8
      ctx.strokeStyle=r()<.48?'rgba(47,82,41,.30)':r()<.72?'rgba(151,157,91,.23)':'rgba(92,105,53,.26)'
      ctx.lineWidth=.45+r()*.7;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(r()-.5)*2,y-l);ctx.stroke()
    }
    for(let i=0;i<180;i++){ctx.fillStyle='rgba(75,68,38,.10)';ctx.beginPath();ctx.arc(r()*256,r()*256,1+r()*3,0,Math.PI*2);ctx.fill()}
  }else{
    ctx.fillStyle='#8f8067';ctx.fillRect(0,0,256,256)
    ctx.strokeStyle='rgba(70,62,52,.48)';ctx.lineWidth=2
    const h=28
    for(let row=-1;row<11;row++){
      const y=row*h,offset=(row%2)*22
      for(let col=-2;col<9;col++){
        const x=col*46+offset+(r()-.5)*5,w=38+r()*9,hh=20+r()*5
        ctx.fillStyle=r()<.33?'#a79678':r()<.66?'#9d8c71':'#b0a083'
        ctx.beginPath();ctx.roundRect(x,y+(r()-.5)*3,w,hh,4+r()*4);ctx.fill();ctx.stroke()
      }
    }
    for(let i=0;i<420;i++){ctx.fillStyle='rgba(70,61,48,.14)';ctx.fillRect(r()*256,r()*256,.5+r()*1.8,.5+r()*1.8)}
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping
  texture.repeat.set(kind==='grass'?18:9,kind==='grass'?18:9);texture.anisotropy=4;return texture
}

export async function createWaterfallVillageV2(canvas:HTMLCanvasElement,input:VillageV2Input,conceptId:ConceptId,signal:AbortSignal,report:(state:VillageV2State)=>void) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
  const concept=conceptById(conceptId),scene=new T.Scene();scene.background=new T.Color('#b9d6df');scene.fog=new T.Fog('#c3d9dc',78,195)
  const camera=new T.PerspectiveCamera(64,1,.08,280);camera.rotation.order='YXZ'
  const hemi=new T.HemisphereLight('#ecf7ff','#697255',1.65),sun=new T.DirectionalLight('#fff0d0',2.65);sun.position.set(-38,65,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-85,right:85,top:85,bottom:-85,near:1,far:180});sun.shadow.bias=-.00015;sun.shadow.normalBias=.035;scene.add(hemi,sun)

  const grassTexture=canvasTexture('grass'),stoneTexture=canvasTexture('stone')
  grassTexture.repeat.set(20,20);stoneTexture.repeat.set(7,7)
  const terrainGeo=new T.PlaneGeometry(WORLD_HALF*2,WORLD_HALF*2,128,128);terrainGeo.rotateX(-Math.PI/2)
  const pos=terrainGeo.attributes.position as T.BufferAttribute
  for(let i=0;i<pos.count;i++)pos.setY(i,terrainHeight(conceptId,pos.getX(i),pos.getZ(i)))
  terrainGeo.computeVertexNormals()
  const terrainMat=new T.MeshStandardMaterial({map:grassTexture,color:conceptId==='gorge'?'#a6aa85':conceptId==='terraces'?'#a9ad86':'#a2ad83',roughness:1,metalness:0})
  const terrain=new T.Mesh(terrainGeo,terrainMat);terrain.receiveShadow=true;scene.add(terrain)

  const riverPoints:T.Vector3[]=[]
  for(let i=0;i<=200;i++){const z=-WORLD_HALF+i*(WORLD_HALF*2/200);riverPoints.push(new T.Vector3(riverCenter(conceptId,z),waterHeight(conceptId,z)+.05,z))}
  const riverGeo=makeRibbon(riverPoints,9.2),riverMat=new T.MeshStandardMaterial({color:'#4b9fb5',roughness:.18,metalness:.02,transparent:true,opacity:.9,side:T.DoubleSide})
  const river=new T.Mesh(riverGeo,riverMat);river.receiveShadow=true;scene.add(river)

  const route=sampledPath(conceptId,mainLoop(conceptId)),pathGeo=makeRibbon(route,3.25),pathMat=new T.MeshStandardMaterial({map:stoneTexture,color:'#c7b896',roughness:1,side:T.DoubleSide})
  const pathMesh=new T.Mesh(pathGeo,pathMat);pathMesh.receiveShadow=true;scene.add(pathMesh)

  const bridgeStone=new T.MeshStandardMaterial({map:stoneTexture,color:'#b4aa99',roughness:1}),woodMat=new T.MeshStandardMaterial({color:'#8f6c48',roughness:1}),railMat=new T.MeshStandardMaterial({color:'#66584a',roughness:1})
  const addBox=(x:number,y:number,z:number,w:number,h:number,d:number,mat:T.Material,parent:T.Object3D=scene)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
  for(const bridge of getBridges(conceptId)) {
    const group=new T.Group();scene.add(group)
    const steps=bridge.primary?38:28,step=(bridge.halfLength*2)/steps
    for(let i=0;i<steps;i++){
      const x=bridge.centerX-bridge.halfLength+(i+.5)*step,y=bridgeHeight(bridge,x)
      addBox(x,y-.12,bridge.z,step*1.1,.28,bridge.width,bridge.primary?bridgeStone:woodMat,group)
      if(bridge.primary && i%3===0){addBox(x,y+.5,bridge.z-bridge.width*.48,.22,1.2,.22,railMat,group);addBox(x,y+.5,bridge.z+bridge.width*.48,.22,1.2,.22,railMat,group)}
    }
    if(bridge.primary){
      for(const side of [-1,1])for(let i=0;i<steps;i++){
        const x=bridge.centerX-bridge.halfLength+(i+.5)*step,y=bridgeHeight(bridge,x)+.98
        addBox(x,y,bridge.z+side*bridge.width*.49,step*1.1,.16,.16,railMat,group)
      }
      addBox(bridge.centerX-bridge.halfLength-.55,bridge.baseY-1.0,bridge.z,1.6,2.2,bridge.width+1.3,bridgeStone,group)
      addBox(bridge.centerX+bridge.halfLength+.55,bridge.baseY-1.0,bridge.z,1.6,2.2,bridge.width+1.3,bridgeStone,group)
    }
  }

  const padMat=new T.MeshStandardMaterial({map:stoneTexture,color:'#d9cfad',roughness:1}),markerMat=new T.MeshStandardMaterial({color:concept.accent,roughness:.9})
  for(const pad of getPads(conceptId)){
    const y=terrainHeight(conceptId,pad.x,pad.z)
    const slab=new T.Mesh(new T.CylinderGeometry(pad.radius,pad.radius,.18,24),padMat);slab.position.set(pad.x,y+.08,pad.z);slab.receiveShadow=true;scene.add(slab)
    addBox(pad.x,y+.9,pad.z,.28,1.7,.28,markerMat)
  }

  const landmarkMat=new T.MeshStandardMaterial({color:'#687860',roughness:1})
  for(const [x,z,s] of [[-61,-54,1.2],[58,-47,1.5],[-60,12,1.1],[61,24,1.35],[22,-63,1.25]] as [number,number,number][]) {
    const y=terrainHeight(conceptId,x,z);const cone=new T.Mesh(new T.ConeGeometry(2.2*s,7*s,8),landmarkMat);cone.position.set(x,y+3.5*s,z);cone.castShadow=true;scene.add(cone)
  }

  let disposed=false,frame=0,observer:ResizeObserver|undefined,last=performance.now(),lastReport=0,frames=0
  let position:Point={...spawnFor(conceptId)}
  const cameraPosition=new T.Vector3(position.x,position.y+1.65,position.z)
  const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
  observer=new ResizeObserver(resize);observer.observe(canvas);resize()
  const reset=()=>{position={...spawnFor(conceptId)};input.yaw=.18;input.pitch=-.04;input.x=0;input.z=0;cameraPosition.set(position.x,position.y+1.65,position.z)}
  reset()

  function step(dx:number,dz:number){
    const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.075));let p={...position}
    for(let i=0;i<count;i++){
      const sx=dx/count,sz=dz/count
      const tryPoint=(x:number,z:number)=>{
        const assisted=assistedPoint(conceptId,x,z,.16)
        if(!canStand(conceptId,assisted.x,assisted.z))return null
        return {x:assisted.x,y:floorHeight(conceptId,assisted.x,assisted.z),z:assisted.z}
      }
      p=tryPoint(p.x+sx,p.z+sz)??tryPoint(p.x+sx,p.z)??tryPoint(p.x,p.z+sz)??p
    }
    position=p
  }

  const targetCamera=new T.Vector3()
  const tick=(now:number)=>{
    if(disposed)return
    const dt=Math.min(.04,(now-last)/1000);last=now
    if(!input.paused){
      const norm=Math.max(1,Math.hypot(input.x,input.z)),x=input.x/norm,z=input.z/norm
      const dx=(x*Math.cos(input.yaw)+z*Math.sin(input.yaw))*dt*5.0,dz=(-x*Math.sin(input.yaw)+z*Math.cos(input.yaw))*dt*5.0
      step(dx,dz);riverMat.opacity=.86+.04*Math.sin(now*.0014)
    }
    targetCamera.set(position.x,position.y+1.65,position.z);cameraPosition.lerp(targetCamera,1-Math.exp(-dt*18));camera.position.copy(cameraPosition);camera.rotation.set(input.pitch,input.yaw,0,'YXZ');renderer.render(scene,camera)
    frames++
    if(now-lastReport>220){report({position:{...position},zone:zoneName(conceptId,position),fps:Math.round(frames/Math.max(.001,(now-lastReport)/1000))});lastReport=now;frames=0}
    frame=requestAnimationFrame(tick)
  }
  frame=requestAnimationFrame(tick)

  const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer?.disconnect();scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});grassTexture.dispose();stoneTexture.dispose();renderer.dispose()}
  signal.addEventListener('abort',dispose,{once:true})
  return {dispose,reset,getPosition:()=>({...position})}
}
