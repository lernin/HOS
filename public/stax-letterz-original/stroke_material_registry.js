/* Letterz material contract: the tracer owns geometry/progress, the host owns time,
 * one material instance owns only its visual state. No reward or scoring logic here. */
(function(){
'use strict';
const registrations=new Map();
function register(id,name,create){
 if(!Number.isInteger(id)||id<1||typeof name!=='string'||typeof create!=='function'||registrations.has(id))
  throw Error('Invalid or duplicate Letterz material '+id);
 registrations.set(id,Object.freeze({id,name,create}));
}
function instantiate(id,host){
 const entry=registrations.get(id);if(!entry)throw Error('Unknown Letterz material '+id);
 const material=entry.create(host);
 if(!material||typeof material.draw!=='function')throw Error('Material has no draw method: '+id);
 return material;
}
window.LetterzMaterialRegistry={register,instantiate,has:id=>registrations.has(id),
 list:()=>Array.from(registrations.values(),x=>({id:x.id,name:x.name}))};
const {Scene,effects}=window.LetterzStrokeEngine;
effects.forEach((effect,index)=>register(index+1,effect[0],host=>{
 Object.setPrototypeOf(host,Scene.prototype);
 return host;
}));
})();
