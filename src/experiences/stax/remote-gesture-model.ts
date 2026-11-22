/** Isolated STAX Remote gesture sandbox. No mutations to actual STAX molecules.
 * One initial blue foam circle; users add shapes in the sandbox to learn controls.
 * Magnetic relations are intentionally not fabricated here: integrate via the
 * canonical molecule engine only after verifying the eyes-free gestures.
 */
export const REMOTE_KINDS=['circle','triangle','rectangle','oval','square','diamond','hexagon'] as const
export type RemoteKind=typeof REMOTE_KINDS[number]
export type RemoteDirection='left'|'right'|'up'|'down'
export type RemotePort='right'|'below'|'left'|'above'
export const REMOTE_PORTS=['right','below','left','above'] as const
export type RemoteAction='navigate'|'select'|'center'|'fit'|'add'|'cycle_kind'|'cycle_port'|'delete_arm'|'delete_confirm'|'delete_cancel'|'detach'|'undo'|'redo'|'zoom_in'|'zoom_out'|'move_start'|'move_end'|'reset'|'seed'|'spine'|'modify'|'theme_next'|'theme_prev'
export type RemoteGesture={type:'gesture';action:RemoteAction;dir?:RemoteDirection;seq:number}
export type RemoteMotion={type:'move';dx:number;dy:number;seq:number}
export type RemoteView={type:'view';dx:number;dy:number;scale:number;seq:number}
export type RemoteInput=RemoteGesture|RemoteMotion|RemoteView
export type RemotePiece={id:number;kind:RemoteKind;x:number;y:number}
type Snapshot={pieces:RemotePiece[];focus:number|null;selected:number|null;nextId:number}
export type RemoteBoard={
 pieces:RemotePiece[];focus:number|null;selected:number|null;nextId:number
 palette:RemoteKind;port:RemotePort;panX:number;panY:number;zoom:number
 deleteArmed:boolean;dragActive:boolean;dragRecorded:boolean
 undo:Snapshot[];redo:Snapshot[];updates:number;notice:string
}
const first:RemotePiece={id:1,kind:'circle',x:0,y:0}
export function initialRemoteBoard():RemoteBoard{
 return {pieces:[{...first}],focus:1,selected:1,nextId:2,palette:'triangle',
  port:'right',panX:0,panY:0,zoom:1,deleteArmed:false,dragActive:false,
  dragRecorded:false,undo:[],redo:[],updates:0,notice:'One blue circle. Hold B and tap the pad to add another shape.'}
}
function snapshot(s:RemoteBoard):Snapshot{return {pieces:s.pieces.map(p=>({...p})),focus:s.focus,selected:s.selected,nextId:s.nextId}}
function commit(s:RemoteBoard,patch:Partial<RemoteBoard>):RemoteBoard{
 return {...s,...patch,undo:[...s.undo,snapshot(s)].slice(-40),redo:[],deleteArmed:false}
}
function step<T>(items:readonly T[],current:T,amount:number):T{
 return items[((items.indexOf(current)+amount)%items.length+items.length)%items.length]
}
function navigate(s:RemoteBoard,dir:RemoteDirection):RemoteBoard{
 const focus=s.pieces.find(p=>p.id===s.focus)??s.pieces[0]
 if(!focus)return {...s,notice:'No shapes. Hold B and tap to add one.'}
 const eligible=s.pieces.filter(p=>{
  if(p.id===focus.id)return false
  const dx=p.x-focus.x,dy=p.y-focus.y
  return dir==='left'?dx< -15:dir==='right'?dx>15:dir==='up'?dy< -15:dy>15
 })
 if(!eligible.length)return {...s,notice:'No shape '+dir+'.'}
 eligible.sort((a,b)=>{
  const cost=(p:RemotePiece)=>{
   const dx=p.x-focus.x,dy=p.y-focus.y
   const primary=dir==='left'||dir==='right'?Math.abs(dx):Math.abs(dy)
   const secondary=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx)
   return primary+secondary*2
  }
  return cost(a)-cost(b)
 })
 return {...s,focus:eligible[0].id,selected:null,deleteArmed:false,notice:'Focused '+eligible[0].kind}
}
const finite=(n:number)=>Number.isFinite(n)?n:0
export function reduceRemoteBoard(s:RemoteBoard,event:RemoteInput):RemoteBoard{
 if(event.type==='move'){
  const id=s.selected??s.focus
  if(!s.dragActive||id===null)return s
  const dx=Math.max(-95,Math.min(95,finite(event.dx)))/s.zoom
  const dy=Math.max(-95,Math.min(95,finite(event.dy)))/s.zoom
  if(!dx&&!dy)return s
  const undo=s.dragRecorded?s.undo:[...s.undo,snapshot(s)].slice(-40)
  return {...s,pieces:s.pieces.map(p=>p.id===id?{...p,x:p.x+dx,y:p.y+dy}:p),
   selected:id,dragRecorded:true,undo,redo:s.dragRecorded?s.redo:[],
   updates:s.updates+1,notice:'Moving selected '+(s.pieces.find(p=>p.id===id)?.kind||'shape')}
 }
 if(event.type==='view'){
  const scale=Number.isFinite(event.scale)?Math.max(.8,Math.min(1.25,event.scale)):1
  return {...s,panX:s.panX+Math.max(-85,Math.min(85,finite(event.dx))),
   panY:s.panY+Math.max(-85,Math.min(85,finite(event.dy))),zoom:Math.max(.4,Math.min(3.6,s.zoom*scale))}
 }
 const action=event.action,dir=event.dir
 if(action==='navigate'&&dir)return navigate(s,dir)
 if(action==='select')return {...s,selected:s.focus,deleteArmed:false,notice:'Selected '+(s.pieces.find(p=>p.id===s.focus)?.kind||'none')}
 if(action==='cycle_kind'){
  const next=step(REMOTE_KINDS,s.palette,dir==='left'?-1:1)
  return {...s,palette:next,notice:'Ready to add '+next}
 }
 if(action==='cycle_port'){
  const next=step(REMOTE_PORTS,s.port,dir==='up'?-1:1)
  return {...s,port:next,notice:'Attach '+next+' of focused shape'}
 }
 if(action==='add'){
  const anchor=s.pieces.find(p=>p.id===s.focus)??{x:0,y:0}
  const offset=s.port==='left'?{x:-150,y:0}:s.port==='right'?{x:150,y:0}:s.port==='above'?{x:0,y:-150}:{x:0,y:150}
  let x=anchor.x+offset.x,y=anchor.y+offset.y
  let attempts=0
  while(s.pieces.some(p=>Math.hypot(p.x-x,p.y-y)<95)&&attempts++<12){x+=52;y+=attempts%2===0?20:-20}
  const next:RemotePiece={id:s.nextId,kind:s.palette,x,y}
  return commit(s,{pieces:[...s.pieces,next],focus:next.id,selected:next.id,nextId:s.nextId+1,notice:'Added '+next.kind+' '+s.port})
 }
 if(action==='delete_arm')return {...s,deleteArmed:true,notice:'Delete armed. Tap with A-shift to confirm, or swipe up to cancel.'}
 if(action==='delete_cancel')return {...s,deleteArmed:false,notice:'Delete cancelled.'}
 if(action==='delete_confirm'){
  if(!s.deleteArmed)return {...s,notice:'First arm deletion with A-shift swipe down.'}
  const id=s.selected??s.focus
  if(id===null)return {...s,deleteArmed:false}
  const pieces=s.pieces.filter(p=>p.id!==id)
  return commit(s,{pieces,focus:pieces.at(-1)?.id??null,selected:pieces.at(-1)?.id??null,notice:'Deleted shape. Undo restores it.'})
 }
 if(action==='move_start')return {...s,dragActive:true,dragRecorded:false,deleteArmed:false}
 if(action==='move_end')return {...s,dragActive:false,dragRecorded:false}
 if(action==='undo'){
  if(!s.undo.length)return {...s,notice:'Nothing to undo.'}
  const previous=s.undo.at(-1)!
  return {...s,...previous,undo:s.undo.slice(0,-1),redo:[...s.redo,snapshot(s)].slice(-40),
   dragActive:false,dragRecorded:false,deleteArmed:false,notice:'Undone.'}
 }
 if(action==='redo'){
  if(!s.redo.length)return {...s,notice:'Nothing to redo.'}
  const next=s.redo.at(-1)!
  return {...s,...next,undo:[...s.undo,snapshot(s)].slice(-40),redo:s.redo.slice(0,-1),
   dragActive:false,dragRecorded:false,deleteArmed:false,notice:'Redone.'}
 }
 if(action==='zoom_in'||action==='zoom_out')
  return {...s,zoom:Math.max(.4,Math.min(3.6,s.zoom*(action==='zoom_in'?1.2:1/1.2))),notice:action==='zoom_in'?'Zoom in':'Zoom out'}
 if(action==='fit'){
  if(!s.pieces.length)return {...s,panX:0,panY:0,zoom:1}
  const xs=s.pieces.map(p=>p.x),ys=s.pieces.map(p=>p.y)
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
  const zoom=Math.max(.45,Math.min(2.2,Math.min(680/Math.max(220,maxX-minX+140),430/Math.max(180,maxY-minY+140))))
  return {...s,zoom,panX:-(minX+maxX)/2*zoom,panY:-(minY+maxY)/2*zoom,notice:'Fit all shapes'}
 }
 if(action==='center'){
  const p=s.pieces.find(p=>p.id===(s.selected??s.focus))
  return p?{...s,panX:-p.x*s.zoom,panY:-p.y*s.zoom,notice:'Centered '+p.kind}:s
 }
 if(action==='reset')return initialRemoteBoard()
 if(action==='seed'){
  const items:RemotePiece[]=[{...first},{id:2,kind:'triangle',x:150,y:0},{id:3,kind:'circle',x:300,y:0}]
  return commit(s,{pieces:items,focus:1,selected:1,nextId:4,panX:0,panY:0,zoom:1,notice:'Three-piece gesture test loaded'})
 }
 return s
}
