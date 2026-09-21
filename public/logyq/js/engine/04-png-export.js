  /* ======================= PNG EXPORTER ======================= */
  const PngExport = (() => {
    function copyInlineStylesRecursive(src, dst){
      // Copy a conservative set of presentation attributes so the snapshot matches the live view.
      const css = window.getComputedStyle(src);
      const set = (prop, attr = prop) => {
        const val = css.getPropertyValue(prop);
        if (val && val.trim()) dst.setAttribute(attr, val.trim());
      };
      // paint / geometry
      set('fill'); set('stroke'); set('stroke-width'); set('stroke-opacity'); set('fill-opacity'); set('opacity');
      // text
      set('font-size'); set('font-family'); set('font-weight');
      // svg-specific text layout (may not show up in all browsers via computedStyle; also set as attributes)
      const ta = css.getPropertyValue('text-anchor'); if (ta) dst.setAttribute('text-anchor', ta.trim());
      const db = css.getPropertyValue('dominant-baseline'); if (db) dst.setAttribute('dominant-baseline', db.trim());
      // remove any hidden measuring nodes
      if (dst.classList && dst.classList.contains('__measure')) dst.remove();

      // recurse
      const srcKids = Array.from(src.childNodes || []);
      const dstKids = Array.from(dst.childNodes || []);
      for (let i = 0; i < srcKids.length; i++){
        const s = srcKids[i], d = dstKids[i];
        if (s && d && s.nodeType === 1) copyInlineStylesRecursive(s, d);
      }
    }

    function cloneSvgForViewport(svgEl, width, height){
      // Deep clone and set explicit box
      const clone = svgEl.cloneNode(true);
      clone.removeAttribute('id');
      clone.setAttribute('width', String(width));
      clone.setAttribute('height', String(height));
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

      // Inline styles so classes/vars are baked
      copyInlineStylesRecursive(svgEl, clone);

      // Hide transient overlays that shouldn't appear unless visible
      // Ensure caret visibility matches live state (already baked via inline)
      return clone;
    }

    function svgString(svgNode){
      const serializer = new XMLSerializer();
      let str = serializer.serializeToString(svgNode);
      // Fix for Safari <foreignObject> xmlns (not used here, but harmless)
      if (!str.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)){
        str = str.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!str.match(/^<svg[^>]+"http:\/\/www.w3.org\/1999\/xlink"/)){
        str = str.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }
      return str;
    }

    function drawPageGradient(ctx, W, H){
      // Mimic: radial-gradient(60rem 60rem at 50% -20%, #f7fafc 30%, var(--background-color) 100%)
      const root = getComputedStyle(document.documentElement);
      const outer = (root.getPropertyValue('--background-color') || '#eef1f5').trim();
      const inner = '#f7fafc';
      const cx = W / 2;
      const cy = -0.2 * H;       // center above the top, like CSS
      const r  = Math.max(W, H) * 0.9;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0.30, inner);
      g.addColorStop(1.00, outer);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    async function exportCurrentView({ scale = 2, filename, withBackground = true } = {}){
      const svgEl = elements.svg.node();
      if (!svgEl){ return; }

      // Use the visible viewport and keep the current d3-zoom’ed transform baked into the <g>
      const W = Math.max(1, svgEl.clientWidth);
      const H = Math.max(1, svgEl.clientHeight);

      const clone = cloneSvgForViewport(svgEl, W, H);
      const svgData = svgString(clone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      // Ensure crisp text on Safari
      img.decoding = 'async';
      img.onload = () => {
        try{
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(W * scale);
          canvas.height = Math.round(H * scale);
          const ctx = canvas.getContext('2d');
          ctx.setTransform(scale, 0, 0, scale, 0, 0);

          if (withBackground) drawPageGradient(ctx, W, H);

          ctx.drawImage(img, 0, 0, W, H);

          const out = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.download = filename || `tree-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
          a.href = out;
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast('PNG exported', 1100);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        alert('Sorry, PNG export failed to render this view.');
      };
      img.src = url;
    }

  /* [patch] png-only exportFullPNG override start */
  exportFullPNG__legacy = function(opts){ /* [patch] legacy-exportFullPNG-rename */
    opts = opts||{}; const pad = (opts.pad!=null?opts.pad:24); let s = (opts.scale||2);
    const minLabelPx = (opts.minLabelPx||0); const maxSide = (opts.maxSide||8192); const filename = opts.filename; const withBackground = !!opts.withBackground;
    const svgEl = elements.svg.node(); if(!svgEl) return; const bbox = getContentBBox(pad); if(!bbox) return;
    const clone = svgEl.cloneNode(true); clone.removeAttribute("id");
    const g = clone.querySelector("svg > g"); if(g) g.setAttribute("transform","translate(0,0) scale(1)");
    copyInlineStylesRecursive(svgEl, clone);
    const vbX=bbox.x, vbY=bbox.y, vbW=bbox.width, vbH=bbox.height;
    clone.setAttribute("width", String(Math.max(1,vbW))); clone.setAttribute("height", String(Math.max(1,vbH)));
    clone.setAttribute("viewBox", vbX+" "+vbY+" "+vbW+" "+vbH);
    clone.setAttribute("xmlns","http://www.w3.org/2000/svg"); clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");
    if(minLabelPx && CONFIG && CONFIG.FONT_SIZE){ s = Math.max(s, minLabelPx/CONFIG.FONT_SIZE); }
    let targetW = Math.round(vbW*s), targetH = Math.round(vbH*s); const max = Math.max(targetW,targetH);
    if(max>maxSide){ const f=maxSide/max; targetW=Math.round(targetW*f); targetH=Math.round(targetH*f); s*=f; }
    const svgData = svgString(clone); const svgBlob = new Blob([svgData], { type:"image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(svgBlob);
    const img = new Image(); img.decoding = "async";
    img.onload = ()=>{ try{
      const c=document.createElement("canvas"); c.width=targetW; c.height=targetH; const ctx=c.getContext("2d");
      /* translate so content bbox maps to canvas (fixes left black band/offset) */
      ctx.setTransform(s,0,0,s,0,0); /* [patch] export-full-no-double-offset-1 */
      if(withBackground){ /* fill whole canvas in page coords, not bbox coords */
        ctx.save(); ctx.setTransform(1,0,0,1,0,0); drawPageGradient(ctx, targetW, targetH); ctx.restore();
      }
      ctx.drawImage(img,0,0);
      const out=c.toDataURL("image/png"); const a=document.createElement("a");
      a.download = filename || ("tree-full-"+new Date().toISOString().replace(/[:.]/g,"-")+".png"); a.href=out; document.body.appendChild(a); a.click(); a.remove();
      showToast("Full PNG exported",1100);
    } finally { URL.revokeObjectURL(url); } };
    img.onerror = ()=>{ URL.revokeObjectURL(url); alert("Sorry, full-map PNG export failed."); };
    img.src = url;
  };
  /* [/patch] png-only exportFullPNG override end */
/* [patch] full-export-fns start */      function getContentBBox(pad){        pad = (typeof pad === "number" ? pad : 24);        try{          const nb = elements.gNodes.node() && elements.gNodes.node().getBBox();          const lb = elements.gLinks.node() && elements.gLinks.node().getBBox();          if(!nb && !lb) return null;          const merge = (a,b)=>{ if(!a||!a.width||!a.height) return b; if(!b||!b.width||!b.height) return a;             const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y); const r=Math.max(a.x+a.width,b.x+b.width), bt=Math.max(a.y+a.height,b.y+b.height);             return { x:x-pad, y:y-pad, width:(r-x)+2*pad, height:(bt-y)+2*pad }; };          return merge(nb,lb);        }catch(_e){ return null; }      }      function injectTitleIntoClone(clone, bbox, opts){        const add = !!(opts && opts.addTitle); if(!add) return { vbX:bbox.x, vbY:bbox.y, vbW:bbox.width, vbH:bbox.height };        const title = (opts.titleText || 'LOGiC');        const baseSize = (CONFIG && CONFIG.FONT_SIZE ? CONFIG.FONT_SIZE : 18);        const fs = Math.max(18, Math.round(baseSize*1.25));        const extraTop = Math.round(fs*1.8);        const vbX = bbox.x, vbY = bbox.y - extraTop, vbW = bbox.width, vbH = bbox.height + extraTop;        const t = document.createElementNS('http://www.w3.org/2000/svg','text');        t.setAttribute('x', String(vbX + vbW/2));        t.setAttribute('y', String(vbY + Math.max(18, fs)));        t.setAttribute('text-anchor','middle');        t.setAttribute('font-weight','700');        t.setAttribute('font-size', String(fs));        t.setAttribute('fill', '#334155');        t.textContent = title;        clone.insertBefore(t, clone.firstChild);        return { vbX, vbY, vbW, vbH };      }      function exportFullPNG(opts){        opts = opts||{}; const pad = (opts.pad!=null?opts.pad:24); let s = (opts.scale||2);         const minLabelPx = (opts.minLabelPx||0), maxSide = (opts.maxSide||8192); const filename = opts.filename; const withBackground = !!opts.withBackground;         const svgEl = elements.svg.node(); if(!svgEl) return; const bbox = getContentBBox(pad); if(!bbox) return;         const clone = svgEl.cloneNode(true); clone.removeAttribute("id");        const g = clone.querySelector("svg > g"); if(g) g.setAttribute("transform","translate(0,0) scale(1)");        copyInlineStylesRecursive(svgEl, clone);        if(minLabelPx && CONFIG && CONFIG.FONT_SIZE){ s = Math.max(s, minLabelPx/CONFIG.FONT_SIZE); }        const titled = injectTitleIntoClone(clone, bbox, opts);        clone.setAttribute("width", String(Math.max(1,titled.vbW))); clone.setAttribute("height", String(Math.max(1,titled.vbH)));        clone.setAttribute("viewBox", titled.vbX+" "+titled.vbY+" "+titled.vbW+" "+titled.vbH);        clone.setAttribute("xmlns","http://www.w3.org/2000/svg"); clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");        let targetW = Math.round(titled.vbW*s), targetH = Math.round(titled.vbH*s);        const max = Math.max(targetW,targetH); if(max>maxSide){ const f=maxSide/max; targetW=Math.round(targetW*f); targetH=Math.round(targetH*f); s*=f; }        const svgData = svgString(clone); const svgBlob = new Blob([svgData], { type:"image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(svgBlob);        const img = new Image(); img.decoding = "async";        img.onload = ()=>{ try{ const c=document.createElement("canvas"); c.width=targetW; c.height=targetH; const ctx=c.getContext("2d");          ctx.setTransform(s,0,0,s,0,0); /* [patch] export-full-no-double-offset-2 */
      /* [patch] png-bg-fix start */
      if(withBackground){ ctx.save(); ctx.setTransform(1,0,0,1,0,0); drawPageGradient(ctx, targetW, targetH); ctx.restore(); }
      /* [patch] png-bg-fix end */          ctx.drawImage(img,0,0); const out=c.toDataURL("image/png"); const a=document.createElement("a");          a.download = filename || ("tree-full-"+new Date().toISOString().replace(/[:.]/g,"-")+".png"); a.href=out; document.body.appendChild(a); a.click(); a.remove();          showToast("Full PNG exported",1100); } finally { URL.revokeObjectURL(url); } };        img.onerror = ()=>{ URL.revokeObjectURL(url); alert("Sorry, full-map PNG export failed."); };        img.src = url;      }      function exportSVG(opts){        opts = opts||{}; const pad = (opts.pad!=null?opts.pad:24); const filename = opts.filename;        const svgEl = elements.svg.node(); if(!svgEl) return; const bbox = getContentBBox(pad) || {x:0,y:0,width:svgEl.clientWidth||1000,height:svgEl.clientHeight||800};        const clone = svgEl.cloneNode(true); clone.removeAttribute("id"); const g=clone.querySelector("svg > g"); if(g) g.setAttribute("transform","translate(0,0) scale(1)");        copyInlineStylesRecursive(svgEl, clone);        const titled = injectTitleIntoClone(clone, bbox, opts);        clone.setAttribute("width", String(Math.max(1,titled.vbW))); clone.setAttribute("height", String(Math.max(1,titled.vbH)));        clone.setAttribute("viewBox", titled.vbX+" "+titled.vbY+" "+titled.vbW+" "+titled.vbH);        clone.setAttribute("xmlns","http://www.w3.org/2000/svg"); clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");        const str = svgString(clone); const blob = new Blob([str], { type:"image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(blob);        const a=document.createElement("a"); a.download = filename || ("tree-"+new Date().toISOString().replace(/[:.]/g,"-")+".svg"); a.href=url; document.body.appendChild(a); a.click(); a.remove();        setTimeout(()=>URL.revokeObjectURL(url),0); showToast("SVG exported (vector)",1100);      }      /* [patch] full-export-fns end */
    return { exportCurrentView, exportFullPNG, exportSVG, getContentBBox };
  })();

