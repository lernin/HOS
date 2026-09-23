  const utils = (() => {
    let UID = 1;
    const usedUids = new Set();
    const noteUid = (id)=>{
      const key = String(id);
      usedUids.add(key);
      const match = /^n(\d+)$/.exec(key);
      if(match) UID = Math.max(UID, Number(match[1]) + 1);
    };
    const mintUid = ()=>{
      let id = `n${UID++}`;
      while(usedUids.has(id)) id = `n${UID++}`;
      usedUids.add(id);
      return id;
    };
    // Saved maps already carry n1, n2, … . A fresh counter would hand the
    // next blank the root's id, and Enter would rename the root.
    const assignUids = (n)=>{
      const seen = new Set();
      const walk = (node)=>{
        if(!node || typeof node !== 'object') return;
        if(!node._uid || seen.has(String(node._uid))) node._uid = mintUid();
        else noteUid(node._uid);
        seen.add(String(node._uid));
        (node.children||[]).forEach(walk);
      };
      walk(n);
    };
    const deepClone = (o)=> JSON.parse(JSON.stringify(o));
    const pathToUid = (data, target, path=[])=>{ if(!data) return null; path.push(data._uid); if(data._uid===target) return path.slice(); for(const c of (data.children||[])){ const p=pathToUid(c,target,path); if(p) return p; } path.pop(); return null; };
    const findByPath = (data, path)=>{ let cur = (path[0]===data._uid)? data : null; if(!cur) return null; for(let i=1;i<path.length;i++){ const u=path[i]; cur=(cur.children||[]).find(x=>x._uid===u); if(!cur) return null; } return cur; };
    const findByUid = (data, uid)=>{ if(!data) return null; if(data._uid===uid) return data; for(const c of (data.children||[])){ const r=findByUid(c, uid); if(r) return r; } return null; };
    const uidInSubtree = (root, uid)=>{ if(!root) return false; if(root._uid===uid) return true; for(const c of (root.children||[])) if(uidInSubtree(c, uid)) return true; return false; };
    const assignIds=(h)=>{ let id=0; h.descendants().forEach(d=>d.id=++id); };
    const clamp=(v,lo,hi)=> Math.max(lo, Math.min(hi, v));
    return { assignUids, deepClone, pathToUid, findByPath, findByUid, uidInSubtree, assignIds, clamp };
  })();
  attach('utils', utils)

