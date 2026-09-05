import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { heightAt, paths, placements, move, spawn, type Placement } from './world'
export type Input={x:number;z:number;yaw:number;pitch:number;paused:boolean;moveAcceleration:number;viewMode:number}
export async function createWoodland(canvas:HTMLCanvasElement,input:Input,signal:AbortSignal,progress:(n:number)=>void){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
  const scene=new T.Scene();scene.background=new T.Color('#bbdce6');scene.fog=new T.Fog('#b7d4cf',60,145)
  const camera=new T.PerspectiveCamera(68,1,.1,170);camera.rotation.order='YXZ'
  scene.add(new T.HemisphereLight('#e6f4ff','#587741',2.1))
  const sun=new T.DirectionalLight('#fff0c9',3);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:150});sun.shadow.bias=-.0003;sun.shadow.normalBias=.04;scene.add(sun,sun.target)
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>()
  function track(root:T.Object3D){root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v)}}})}
  let disposed=false,frame=0
  const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());sun.shadow.map?.dispose();renderer.dispose()}
  const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize()
  signal.addEventListener('abort',dispose,{once:true})
  try{
    const ground=new T.PlaneGeometry(440,440,180,180);ground.rotateX(-Math.PI/2)
    const pos=ground.attributes.position,colors=[];const c=new T.Color()
    for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,heightAt(x,z));c.setHSL(.235+Math.sin(x*.04)*.015,.34,.26+.045*Math.sin(z*.03+x*.02));colors.push(c.r,c.g,c.b)}
    ground.setAttribute('color',new T.Float32BufferAttribute(colors,3));ground.computeVertexNormals()
    const earth=new T.Mesh(ground,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));earth.receiveShadow=true;scene.add(earth);track(earth)
    for(const line of paths){const vertices=[],indices=[];for(let i=0;i<line.length;i++){const p=line[i],a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;for(const side of [-1,1]){const x=p.x-dz/l*2.25*side,z=p.z+dx/l*2.25*side;vertices.push(x,heightAt(x,z)+.035,z)}if(i<line.length-1){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const trail=new T.Mesh(geo,new T.MeshStandardMaterial({color:'#b6a276',roughness:1,side:T.DoubleSide}));trail.receiveShadow=true;scene.add(trail);track(trail)}
    const all=placements(),solids=all.filter(p=>p.solid),kinds=['tree','tree-b','pine','bush','fern','grass','rock','clover'],loader=new GLTFLoader(),batches:T.InstancedMesh[]=[]
    for(let n=0;n<kinds.length;n++){
      const kind=kinds[n],response=await fetch(`/woodland/${kind}.glb`,{signal});if(!response.ok)throw Error(`Could not load ${kind}`)
      const gltf=await loader.parseAsync(await response.arrayBuffer(),'');track(gltf.scene);if(signal.aborted){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());throw new DOMException('Aborted','AbortError')}
      gltf.scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(gltf.scene),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),cells=new Map<string,Placement[]>()
      for(const p of all.filter(p=>p.kind===kind)){const key=`${Math.floor(p.x/64)},${Math.floor(p.z/64)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(p)}
      gltf.scene.traverse(obj=>{if(!(obj instanceof T.Mesh))return
        const geometry=obj.geometry.clone();geometry.applyMatrix4(obj.matrixWorld);geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1/size.y,1/size.y,1/size.y);geometries.add(geometry)
        for(const list of cells.values()){
        const mesh=new T.InstancedMesh(geometry,obj.material,list.length),dummy=new T.Object3D()
        list.forEach((p,i)=>{dummy.position.set(p.x,heightAt(p.x,p.z)-.04,p.z);dummy.rotation.y=p.angle;dummy.scale.setScalar(p.height);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)})
        mesh.userData.kind=kind;mesh.userData.list=list
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=kind.startsWith('tree')||kind==='pine'||kind==='rock';scene.add(mesh);batches.push(mesh)}
      });progress((n+1)/kinds.length)
    }
    const avatar=new T.Group()
    const skin=new T.MeshStandardMaterial({color:'#f0c7a4',roughness:.9})
    const shirt=new T.MeshStandardMaterial({color:'#e08b62',roughness:.9})
    const pants=new T.MeshStandardMaterial({color:'#496f70',roughness:.95})
    const hair=new T.MeshStandardMaterial({color:'#4d392d',roughness:1})
    const head=new T.Mesh(new T.SphereGeometry(.32,18,14),skin);head.position.y=1.48
    const hairCap=new T.Mesh(new T.SphereGeometry(.325,16,10,0,Math.PI*2,0,Math.PI*.48),hair);hairCap.position.y=1.53
    const body=new T.Mesh(new T.CylinderGeometry(.28,.34,.66,10),shirt);body.position.y=.92
    const legL=new T.Mesh(new T.CylinderGeometry(.09,.1,.52,8),pants),legR=legL.clone();legL.position.set(-.13,.34,0);legR.position.set(.13,.34,0)
    const marker=new T.Mesh(new T.ConeGeometry(.1,.28,8),shirt);marker.rotation.x=-Math.PI/2;marker.position.set(0,1.04,-.38)
    avatar.add(head,hairCap,body,legL,legR,marker);avatar.visible=false;scene.add(avatar);track(avatar)

    const bgNormal=new T.Color('#bbdce6'),bgCute=new T.Color('#cfe7d7'),fogNormal=new T.Color('#b7d4cf'),fogCute=new T.Color('#c7dfce')
    const fpPos=new T.Vector3(),overviewPos=new T.Vector3(),lookTarget=new T.Vector3(),up=new T.Vector3(0,1,0)
    const fpQuat=new T.Quaternion(),overviewQuat=new T.Quaternion(),lookMatrix=new T.Matrix4(),styleDummy=new T.Object3D()
    let position={x:spawn.x,z:spawn.z},previous=performance.now(),moveSpeed=0,avatarYaw=spawn.yaw,lastStyle=-1

    function restyle(cute:number){
      for(const mesh of batches){
        const kind=mesh.userData.kind as string,list=mesh.userData.list as Placement[]
        const tree=kind==='tree'||kind==='tree-b'||kind==='pine',soft=kind==='bush'||kind==='fern'||kind==='grass'||kind==='clover'
        const width=tree?1+.26*cute:soft?1+.38*cute:1+.15*cute
        const height=tree?1-.14*cute:soft?1-.08*cute:1-.06*cute
        list.forEach((p,i)=>{styleDummy.position.set(p.x,heightAt(p.x,p.z)-.04,p.z);styleDummy.rotation.set(0,p.angle,0);styleDummy.scale.set(p.height*width,p.height*height,p.height*width);styleDummy.updateMatrix();mesh.setMatrixAt(i,styleDummy.matrix)})
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere()
      }
    }

    const render=(now:number)=>{if(disposed)return;const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now
      const beforeX=position.x,beforeZ=position.z
      if(!input.paused){
        const intent=Math.min(1,Math.hypot(input.x,input.z))
        const boost=Math.max(0,Math.min(10,input.moveAcceleration))
        const cruise=3.1+boost*.9
        const target=intent*cruise
        const accel=5+boost*3.5
        const decel=10+boost*2
        const rate=target>moveSpeed?accel:decel
        const step=rate*dt
        moveSpeed=Math.abs(target-moveSpeed)<=step?target:moveSpeed+Math.sign(target-moveSpeed)*step
        position=move(position,input.x,input.z,input.yaw,dt,solids,moveSpeed)
      }else moveSpeed=0

      const movedX=position.x-beforeX,movedZ=position.z-beforeZ
      if(Math.hypot(movedX,movedZ)>.0005)avatarYaw=Math.atan2(-movedX,-movedZ)

      const view=Math.max(0,Math.min(1,input.viewMode/10)),pull=view*view*(3-2*view),groundY=heightAt(position.x,position.z)
      avatar.visible=view>.035
      avatar.position.set(position.x,groundY+.02,position.z);avatar.rotation.y=avatarYaw;avatar.scale.setScalar(.82+.34*pull)

      if(Math.abs(pull-lastStyle)>.025){restyle(pull);lastStyle=pull}
      ;(scene.background as T.Color).lerpColors(bgNormal,bgCute,pull)
      ;(scene.fog as T.Fog).color.lerpColors(fogNormal,fogCute,pull)

      fpPos.set(position.x,groundY+1.68,position.z)
      overviewPos.set(position.x+Math.sin(input.yaw)*18,groundY+18.4,position.z+Math.cos(input.yaw)*18)
      lookTarget.set(position.x,groundY+.85,position.z)
      fpQuat.setFromEuler(new T.Euler(input.pitch,input.yaw,0,'YXZ'))
      lookMatrix.lookAt(overviewPos,lookTarget,up);overviewQuat.setFromRotationMatrix(lookMatrix)
      camera.position.lerpVectors(fpPos,overviewPos,pull);camera.quaternion.copy(fpQuat).slerp(overviewQuat,pull)
      const nextFov=68-12*pull;if(Math.abs(camera.fov-nextFov)>.05){camera.fov=nextFov;camera.updateProjectionMatrix()}

      sun.position.set(position.x-35,70,position.z+25);sun.target.position.set(position.x,0,position.z);sun.target.updateMatrixWorld()
      const sight=145+70*pull
      for(const b of batches){const p=b.boundingSphere!.center;b.visible=Math.hypot(p.x-position.x,p.z-position.z)<sight+b.boundingSphere!.radius}
      renderer.render(scene,camera);frame=requestAnimationFrame(render)
    };frame=requestAnimationFrame(render)
    return {dispose,getPosition:()=>({...position}),getHeading:()=>avatarYaw,setPosition:(next:{x:number;z:number})=>{position={x:next.x,z:next.z};moveSpeed=0},reset:()=>{position={x:spawn.x,z:spawn.z};moveSpeed=0;avatarYaw=spawn.yaw;input.yaw=spawn.yaw;input.pitch=0}}
  }catch(error){dispose();throw error}
}