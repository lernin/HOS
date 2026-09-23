import * as THREE from 'three';
const root=document.querySelector('#app')!;
const scene=new THREE.Scene(); scene.background=new THREE.Color(0xcfe8ff); scene.fog=new THREE.Fog(0xcfe8ff,16,34);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,100); camera.position.set(8,5,10); camera.lookAt(0,1,0);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; root.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x496b45,2.2)); const sun=new THREE.DirectionalLight(0xffffff,2.4);sun.position.set(5,10,4);sun.castShadow=true;scene.add(sun);
const ground=new THREE.Mesh(new THREE.CircleGeometry(18,48),new THREE.MeshStandardMaterial({color:0x8fbd68,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const flat=(c:number)=>new THREE.MeshStandardMaterial({color:c,flatShading:true,roughness:.85});
function mesh(g:THREE.BufferGeometry,m:THREE.Material,p=[0,0,0] as number[]){const x=new THREE.Mesh(g,m);x.position.set(p[0],p[1],p[2]);x.castShadow=x.receiveShadow=true;return x}
function apple(){const g=new THREE.Group();const body=mesh(new THREE.IcosahedronGeometry(1.05,2),flat(0xd9342b),[0,1.05,0]);body.scale.set(1, .92, 1);g.add(body);const stem=mesh(new THREE.CylinderGeometry(.09,.12,.55,6),flat(0x684225),[0,2.03,0]);stem.rotation.z=-.15;g.add(stem);const leaf=mesh(new THREE.ConeGeometry(.3,.72,5),flat(0x4e8b3c),[.3,2.18,0]);leaf.rotation.z=-1.05;g.add(leaf);g.position.set(0,0,-1);return g} scene.add(apple());
const dog=new THREE.Group();dog.position.set(-4,0,1.7);scene.add(dog); const tan=flat(0xb87535),white=flat(0xf2e5cf),dark=flat(0x30231d),red=flat(0xb83a32);
const torso=mesh(new THREE.IcosahedronGeometry(1,1),tan,[0,1.35,0]);torso.scale.set(1.35,.75,.65);dog.add(torso);
const head=mesh(new THREE.IcosahedronGeometry(.72,1),tan,[1.2,1.85,0]);dog.add(head);const muzzle=mesh(new THREE.IcosahedronGeometry(.42,1),white,[1.72,1.7,0]);muzzle.scale.set(.85,.7,.85);dog.add(muzzle);const nose=mesh(new THREE.IcosahedronGeometry(.17,1),dark,[2.03,1.78,0]);dog.add(nose);
for(const z of [-.42,.42]){const ear=mesh(new THREE.ConeGeometry(.35,.75,5),tan,[1.12,2.18,z]);ear.rotation.z=.28;dog.add(ear);const eye=mesh(new THREE.SphereGeometry(.09,8,6),dark,[1.68,2.02,z*.58]);dog.add(eye)}
const collar=mesh(new THREE.TorusGeometry(.55,.08,6,12),red,[1.05,1.55,0]);collar.rotation.y=Math.PI/2;dog.add(collar);
const legs:THREE.Mesh[]=[];for(const x of [-.72,.72])for(const z of [-.43,.43]){const l=mesh(new THREE.CylinderGeometry(.16,.2,.85,5),tan,[x,.62,z]);dog.add(l);legs.push(l)}
const tail=mesh(new THREE.CylinderGeometry(.12,.2,.9,5),tan,[-1.35,1.65,0]);tail.rotation.z=-.9;dog.add(tail);
let running=false;(document.querySelector('#speed') as HTMLButtonElement).onclick=()=>{running=!running;(document.querySelector('#speed') as HTMLButtonElement).textContent='Dog: '+(running?'run':'walk')};
const clock=new THREE.Clock();let angle=Math.PI;
function animate(){requestAnimationFrame(animate);const t=clock.getElapsedTime(), speed=running?1.15:.58;angle+=.008*speed;dog.position.set(Math.cos(angle)*4,0,Math.sin(angle)*3);dog.rotation.y=-angle;const gait=Math.sin(t*(running?10:6))*(running?.55:.32);legs[0].rotation.z=gait;legs[3].rotation.z=gait;legs[1].rotation.z=-gait;legs[2].rotation.z=-gait;head.position.y=1.85+Math.abs(Math.sin(t*(running?10:6)))*.08;tail.rotation.x=Math.sin(t*7)*.35;renderer.render(scene,camera)}animate();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});