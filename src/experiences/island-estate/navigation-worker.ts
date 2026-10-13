import { createNavigator } from './navigation'
import type { WorldPoint } from './layout'

const navigator=createNavigator()
self.postMessage({type:'ready',nodes:navigator.nodeCount})
self.onmessage=(e:MessageEvent<{id:number;start:WorldPoint;end:WorldPoint}>)=>{
  const {id,start,end}=e.data
  try { self.postMessage({type:'path',id,route:navigator.path(start,end)}) }
  catch { self.postMessage({type:'path',id,route:null}) }
}
