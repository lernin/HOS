import * as T from 'three'
import { createEstate, type EstateInput } from '../src/experiences/estate/scene'
import { destinations } from '../src/experiences/estate/plan'
const input:EstateInput={yaw:0,pitch:0,x:0,z:0,paused:true,speed:2.4,quality:1,lighting:'golden',lookedAt:0,fast:false}
const canvas=document.querySelector('canvas')!
const engine=await createEstate(canvas,input,new AbortController().signal,state=>{document.querySelector('output')!.textContent=JSON.stringify({state,diagnostics:engine?.diagnostics()})},()=>{})
const views:Record<string,number[][]>={
 arrival:[[1,7.1,29],[1,8,0]],great:[[7,7.65,4],[-2,7.6,-5]],ocean:[[3,7.65,-19],[0,6.5,-70]],courtyard:[[-8,7.65,25],[-17,8.2,20]],kitchen:[[-12.5,7.65,12],[-18,7.1,5]],suite:[[37,7.65,.2],[30,7.3,-10]],bath:[[32,7.65,4],[37,7.1,7]],exterior:[[8,10.5,-43],[2,8,0]],aerial:[[76,100,84],[0,3,3]],
 foyerFloor:[[1,9.2,20],[1,6.02,16]],foyerWall:[[1,8.2,12],[-5.8,8.2,12]],artHero:[[0,8.72,0],[-10.5,8.72,0]],
}
function center(){const r=canvas.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}}
window.estateQA={
 view(name:string){const q=views[name];engine.inspect({position:new T.Vector3(...q[0]),target:new T.Vector3(...q[1])})},
 diagnostics:engine.diagnostics,
 go(name:string){engine.inspect(null);input.paused=false;return engine.go(destinations.find(d=>d.name===name)!,name)},
 position:engine.getPosition,
 pause(){input.paused=true},
 preset(value:string){input.lighting=value as EstateInput['lighting']},
 editPickCenter(){const p=center();return engine.pickEditSurface(p.x,p.y)},
 artPickCenter(){const p=center(),was=input.paused;input.paused=false;const picked=engine.pick(p.x,p.y);input.paused=was;return picked},
}
document.body.classList.add('ready')
declare global {interface Window {estateQA:{view(name:string):void;diagnostics:typeof engine.diagnostics;go(name:string):boolean;position:typeof engine.getPosition;pause():void;preset(value:string):void;editPickCenter:typeof engine.pickEditSurface;artPickCenter:typeof engine.pick}}}
