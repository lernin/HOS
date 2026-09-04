import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { heightAt, paths, placements, move, spawn, type Placement } from './world'
export type Input={x:number;z:number;yaw:number;pitch:number;paused:boolean}
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
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=kind.startsWith('tree')||kind==='pine'||kind==='rock';scene.add(mesh);batches.push(mesh)}
      });progress((n+1)/kinds.length)
    }
    let position={x:spawn.x,z:spawn.z},previous=performance.now()
    const render=(now:number)=>{if(disposed)return;const dt=(now-previous)/1000;previous=now;if(!input.paused)position=move(position,input.x,input.z,input.yaw,dt,solids)
      camera.position.set(position.x,heightAt(position.x,position.z)+1.68,position.z);camera.rotation.set(input.pitch,input.yaw,0)
      sun.position.set(position.x-35,70,position.z+25);sun.target.position.set(position.x,0,position.z);sun.target.updateMatrixWorld()
      for(const b of batches){const p=b.boundingSphere!.center;b.visible=Math.hypot(p.x-position.x,p.z-position.z)<145+b.boundingSphere!.radius}
      renderer.render(scene,camera);frame=requestAnimationFrame(render)
    };frame=requestAnimationFrame(render)
    return {dispose,reset:()=>{position={x:spawn.x,z:spawn.z};input.yaw=spawn.yaw;input.pitch=0}}
  }catch(error){dispose();throw error}
}
