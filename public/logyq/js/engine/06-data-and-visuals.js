  /* ======================= SAMPLE DATA ======================= */
  const dataManager = {
    generateTree(n=30){
      let seq=1;
      const root={ name:`Node ${String(seq).padStart(2,'0')}`, children:[] };
      const q=[root]; let toggle=true;
      while(seq<n && q.length){
        const p=q.shift(); const rem=n-seq; const k=Math.min(rem, toggle?3:2); toggle=!toggle;
        if(k<=0) continue; p.children=[];
        for(let i=0;i<k;i++){
          if(seq>=n) break; seq++;
          p.children.push({ name:`Node ${String(seq).padStart(2,'0')}` });
          q.push(p.children[p.children.length-1]);
        }
      }
      utils.assignUids(root); return root;
    }
  };

  /* ======================= VISUALS ======================= */
  const visual = {
    vLink(d){
      const x0=d.source.x, y0=d.source.y + (CONFIG.CARD_HEIGHT/2 - CONFIG.LINK_INSET);
      const x1=d.target.x, y1=d.target.y - (CONFIG.CARD_HEIGHT/2 - CONFIG.LINK_INSET);
      const k=0.6, c0y=y0 + k*(y1-y0), c1y=y1 - k*(y1-y0);
      return `M${x0},${y0}C${x0},${c0y} ${x1},${c1y} ${x1},${y1}`;
    },
    layoutMini(title){
      const w=CONFIG.CARD_WIDTH;
      d3.select(elements.dragMiniRect).attr("width", w).attr("height", CONFIG.CARD_HEIGHT);
      elements.dragMiniTitle.text(title).attr("x", w/2).attr("y", CONFIG.CARD_HEIGHT/2).style("font-size", `${CONFIG.FONT_SIZE}px`);
    }
  };

