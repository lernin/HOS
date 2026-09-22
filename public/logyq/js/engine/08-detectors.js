  /* ======================= DETECTOR ENGINE ======================= */
  const Detectors = (()=>{
    const PRIORITY = { rootAbove:0 /* [patch] rootAbove-lowest */, rightCousin:5, leftCousin:4, sibling:3, node:2, edgeSibling:1 };

    function makeRect(kind, x, y, w, h, depth, extra){
      return Object.assign({ kind, x, y, width:w, height:h, depth }, extra||{});
    }

    function build(root){
      const CONFIG = logyq.config
      if(!root) return [];
      const dets=[];
      const byDepth = d3.groups(root.descendants(), d=>d.depth).sort((a,b)=>a[0]-b[0]);

      // --- new: root-above detector (large horizontal target above the root row)
      const r = root;
      const aboveH = (Math.max(16, CONFIG.CARD_HEIGHT * 0.9) * 13); /* [patch] rootAbove-bigger */
      const aboveW = (CONFIG.CARD_WIDTH * 18); /* [patch] rootAbove-bigger */
      const aboveY = (r.y - CONFIG.CARD_HEIGHT/2 + (CONFIG.DETECTOR_OVERLAP_PX||2)) - aboveH; /* [patch] rootAbove-overlap */
      dets.push(makeRect("rootAbove", r.x - aboveW/2, aboveY, aboveW, aboveH, -1, { rowY: aboveY + aboveH }));




      






      for(const [depth, nodes] of byDepth){
        const sorted = nodes.slice().sort((a,b)=>a.x-b.x);
        const laneY = logyq.layout.laneYForDepth(depth);
        const laneH = logyq.layout.laneHeightForDepth(depth);

        // anchor detectors to lane top so they can extend downward by factor
        const rectY = laneY - (CONFIG.CARD_HEIGHT/2) + (CONFIG.LANE_Y_OFFSET||11);
        const detH = Math.max(laneH, laneH * Math.max(1, CONFIG.DETECTOR_DEPTH_FACTOR)) + CONFIG.DETECTOR_OVERLAP_PX;








        const lapelPad = CONFIG.CARD_WIDTH / CONFIG.LAPEL_LEVER;

        // Precompute neighbor gaps for shoulders
        const gaps = new Map();
        for(let i=0;i<sorted.length;i++){
          const n=sorted[i]; const left=sorted[i-1], right=sorted[i+1];
          const leftGap = left ? (n.x - left.x) : 0;
          const rightGap = right ? (right.x - n.x) : 0;
          gaps.set(n, { leftGap, rightGap, hasLeft:!!left, hasRight:!!right, left, right });
        }

        // Node detectors + edge-sibling detectors
        for(let i=0;i<sorted.length;i++){
          const n=sorted[i]; const g=gaps.get(n);
          const edgePad = 2; let leftShoulder  = g.hasLeft ? (g.leftGap*0.5 + lapelPad) : (CONFIG.CARD_WIDTH/2 + edgePad);
          let rightShoulder = g.hasRight ? (g.rightGap*0.5 + lapelPad) : (CONFIG.CARD_WIDTH/2 + edgePad);
  /* [patch] root-wide-hitbox start */
  if (!n.parent && n.children && n.children.length){
    try{
      const childLeft = Math.min(...n.children.map(c => c.x - CONFIG.CARD_WIDTH/2));
      const childRight = Math.max(...n.children.map(c => c.x + CONFIG.CARD_WIDTH/2));
      leftShoulder = Math.max(leftShoulder, n.x - childLeft);
      rightShoulder = Math.max(rightShoulder, childRight - n.x);
    }catch(_e){}
  }
  /* [patch] root-wide-hitbox end */
          const ndw = leftShoulder + rightShoulder;

          dets.push(makeRect('node', n.x - leftShoulder, rectY, ndw, detH, depth, {
            targetUid:n.data._uid
          }));

          // Edge siblings (use shoulders)
          const edgeW = CONFIG.CARD_WIDTH * CONFIG.EDGE_SIBLING_LEVER;
          if(!g.hasLeft && n.parent){
            dets.push(makeRect('edgeSibling', n.x - CONFIG.CARD_WIDTH/2 - edgeW, rectY, edgeW, detH, depth, {
              parentUid:n.parent.data._uid, prevUid:null, nextUid:n.data._uid
            }));
          }
          if(!g.hasRight && n.parent){
            dets.push(makeRect('edgeSibling', n.x + CONFIG.CARD_WIDTH/2, rectY, edgeW, detH, depth, {
              parentUid:n.parent.data._uid, prevUid:n.data._uid, nextUid:null
            }));
          }
        }

        // Gap detectors between adjacent nodes in this lane
        for(let i=0;i<sorted.length-1;i++){
          const L=sorted[i], R=sorted[i+1];
          const gap = R.x - L.x;
          const hole = Math.max(0, gap - CONFIG.CARD_WIDTH);
          const hgr  = 1 - (CONFIG.CARD_WIDTH / gap);
          const famMin = CONFIG.CARD_WIDTH / CONFIG.FAMILY_MIN_LEVER;
          const centerX = (L.x + R.x)/2;
          const sameParent = !!(L.parent && R.parent && L.parent===R.parent);

          const baseWidth = (()=> {
            if (sameParent){
              if(hole < famMin) return famMin;
              if(hgr >= CONFIG.SIBLING_SHARE_THRESHOLD) return gap * CONFIG.SIBLING_SHARE_THRESHOLD;
              return hole;
            } else {
              const cousinMin = CONFIG.CARD_WIDTH / (CONFIG.COUSIN_MIN_LEVER || CONFIG.FAMILY_MIN_LEVER);
              if(hole < cousinMin) return cousinMin;
              if(hgr >= CONFIG.COUSIN_SHARE_THRESHOLD) return gap * CONFIG.COUSIN_SHARE_THRESHOLD;
              return hole;
            }
          })();

          const gdw = Math.min(baseWidth, gap);
          if (gdw <= 0) continue;

          if (sameParent){
            dets.push(makeRect('sibling', centerX - gdw/2, rectY, gdw, detH, depth, {
              parentUid: L.parent ? L.parent.data._uid : null,
              prevUid: L.data._uid,
              nextUid: R.data._uid,
              centerX, rowY: laneY
            }));
          } else {
            const half = gdw/2;
            const overlap = CONFIG.DETECTOR_OVERLAP_PX;

            const leftX  = centerX - half;
            const leftW  = half + overlap;

            const rightX = centerX - overlap/2;
            const rightW = half + overlap;

            dets.push(makeRect('leftCousin',  leftX,  rectY, leftW,  detH, depth, {
              parentUid: L.parent ? L.parent.data._uid : null,
              prevUid: L.data._uid, nextUid: R.data._uid,
              centerX, rowY: laneY
            }));
            dets.push(makeRect('rightCousin', rightX, rectY, rightW, detH, depth, {
              parentUid: R.parent ? R.parent.data._uid : null,
              prevUid: L.data._uid, nextUid: R.data._uid,
              centerX, rowY: laneY
            }));
          }
        }
      }

      return dets;
    }

    function contains(d, x, y){ return (x>=d.x && x<=d.x+d.width && y>=d.y && y<=d.y+d.height); }

    // Hold-drag: mute side-insert only on the origin ghost (and gaps
    // whose both sides are the ghosted subtree). A ghost↔neighbor
    // channel is put-back on the ghost's half and side-insert on the
    // neighbor's — cousin/sibling/edge on other cards stay live.
    function putBackGhost(drop, originUid){
      return { type: 'node', targetUid: originUid, _hit: drop._hit };
    }

    function remapHoldDragGhostDrop(drop, originUid, ghostUids, point){
      if (!drop || drop.type !== 'gap' || !originUid) return drop;
      const ids = ghostUids instanceof Set ? ghostUids : new Set(ghostUids || []);
      if (!ids.size) ids.add(originUid);
      const prevGhost = ids.has(drop.prevUid);
      const nextGhost = ids.has(drop.nextUid);
      if (!prevGhost && !nextGhost) return drop;
      if (prevGhost && nextGhost) return putBackGhost(drop, originUid);

      const hit = drop._hit || {};
      const kind = hit.kind;

      // Outer edge of a ghosted card — no neighbor owns that slot.
      if (kind === 'edgeSibling') return putBackGhost(drop, originUid);

      // Cousin detectors are side-owned: leftCousin → L, rightCousin → R.
      if (kind === 'leftCousin') return prevGhost ? putBackGhost(drop, originUid) : drop;
      if (kind === 'rightCousin') return nextGhost ? putBackGhost(drop, originUid) : drop;

      // Sibling hole: closer to the ghost is home; closer to the
      // neighbor keeps between-insert. Midpoint ties go home.
      const mid = Number.isFinite(hit.centerX)
        ? hit.centerX
        : (Number.isFinite(hit.x) && Number.isFinite(hit.width) ? hit.x + hit.width / 2 : null);
      const x = point?.x;
      if (mid != null && Number.isFinite(x)) {
        const onGhostSide = prevGhost ? x <= mid : x >= mid;
        return onGhostSide ? putBackGhost(drop, originUid) : drop;
      }

      // No geometry: do not steal the neighbor's side-insert.
      return drop;
    }

    function holdDragGhostContext(){
      const { state } = logyq
      if (typeof document === 'undefined' || !document.body?.classList?.contains('v2-branch-drag')) return null;
      const originUid = state.selectedUid;
      if (!originUid) return null;
      const origin = state.root?.descendants?.().find(n => n.data?._uid === originUid);
      const ghostUids = new Set();
      if (origin && typeof origin.descendants === 'function') {
        for (const n of origin.descendants()) {
          if (n?.data?._uid) ghostUids.add(n.data._uid);
        }
      } else {
        ghostUids.add(originUid);
      }
      return { originUid, ghostUids };
    }

    function pick(point){
      const { state } = logyq
      const x=point.x, y=point.y; const hits=[];
      for(const d of state.detectors){ if(contains(d,x,y)) hits.push(d); }
      if(!hits.length) return null;
      hits.sort((a,b)=>{
        if (a.depth!==b.depth) return b.depth - a.depth; // deeper first
        const pa = ( {rootAbove:0 /* [patch] rootAbove-lowest */, rightCousin:5, leftCousin:4, sibling:3, node:2, edgeSibling:1} )[a.kind]||0;
        const pb = ( {rootAbove:0 /* [patch] rootAbove-lowest */, rightCousin:5, leftCousin:4, sibling:3, node:2, edgeSibling:1} )[b.kind]||0;
        if (pa!==pb) return pb - pa; // higher priority first
        const ac = a.x + a.width/2, bc = b.x + b.width/2;
        return Math.abs(x-ac) - Math.abs(x-bc); // closer center
      });
      const top = hits[0];
      let result;
      if (top.kind === "rootAbove") result = { type:"rootAbove", _hit: top };
      else if (top.kind==='node') result = { type:'node', targetUid: top.targetUid, _hit: top };
      else result = { type:'gap', parentUid: top.parentUid||null, prevUid: top.prevUid||null, nextUid: top.nextUid||null, _hit: top };
      const ghost = holdDragGhostContext();
      return ghost ? remapHoldDragGhostDrop(result, ghost.originUid, ghost.ghostUids, point) : result;
    }

    function draw(){
      const { state, elements, config: CONFIG } = logyq
      if(!elements.gDetectors) return;
      elements.gDetectors.selectAll('*').remove();
      if(!CONFIG.SHOW_DETECTORS) return;
      const sel = elements.gDetectors.selectAll('rect').data(state.detectors);
      sel.enter().append('rect')
        .attr('x', d=>d.x).attr('y', d=>d.y).attr('width', d=>d.width).attr('height', d=>d.height)
        .attr('class', d=>`det-rect ${
          d.kind==='node' ? 'det-node' :
          d.kind==='sibling' ? 'det-sibling' :
          d.kind==='leftCousin' ? 'det-cousin-l' :
          d.kind==='rightCousin' ? 'det-cousin-r' : 'det-edge'}`);
    }

    return { build, pick, draw, remapHoldDragGhostDrop };
  })();
  attach('detectors', Detectors)

