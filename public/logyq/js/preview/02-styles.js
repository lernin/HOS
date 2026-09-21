  function injectStyles() {
    const style = document.createElement('style')
    style.id = 'logyq-preview-styles'
    style.textContent = `
      .logiq-save-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap}
      .logiq-save-state::before{content:"";width:7px;height:7px;border-radius:50%;background:#22c55e}
      .logiq-save-state[data-state="saving"]::before{background:#f59e0b;animation:logiq-pulse 900ms ease-in-out infinite}
      .logiq-save-state[data-state="offline"]::before{background:#94a3b8}
      @keyframes logiq-pulse{50%{opacity:.35}}
      .logiq-backdrop{position:fixed;inset:0;z-index:5000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.36);backdrop-filter:blur(4px)}
      .logiq-backdrop.is-open{display:flex}
      .logiq-modal{width:min(680px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.24);color:#334155}
      .logiq-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:16px;background:rgba(255,255,255,.96);border-bottom:1px solid #e2e8f0}
      .logiq-modal-head h2{font-size:18px;margin:0;flex:1}
      .logiq-icon-btn{width:38px;height:38px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-size:18px;cursor:pointer}
      .logiq-primary{border:0;border-radius:10px;background:#16a34a;color:#fff;padding:9px 13px;font-weight:750;cursor:pointer}
      .logiq-library-body{padding:12px 16px 18px}
      .logiq-library-note{margin:0 0 12px;color:#64748b;font-size:13px}
      .logiq-map-list{display:grid;gap:9px}
      .logiq-map-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
      .logiq-map-row.is-current{border-color:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,.12)}
      .logiq-map-name{font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .logiq-map-time{font-size:12px;color:#94a3b8;margin-top:3px}
      .logiq-map-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .logiq-map-actions button,.logiq-inline-rename button{border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:6px 9px;color:#334155;cursor:pointer}
      .logiq-map-actions .danger{color:#dc2626}
      .logiq-inline-rename{display:none;grid-column:1/-1;gap:8px;grid-template-columns:1fr auto}
      .logiq-inline-rename.is-open{display:grid}
      .logiq-inline-rename input,.logiq-pin-card input{height:38px;border:1px solid #cbd5e1;border-radius:9px;padding:0 10px;font:inherit}
      .logiq-empty{padding:28px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px}
      .logiq-pin-card{width:min(360px,100%);padding:20px;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,.24);display:grid;gap:12px;color:#334155}
      .logiq-pin-card h2,.logiq-pin-card p{margin:0}.logiq-pin-card p{font-size:13px;color:#64748b}
      .logiq-pin-actions{display:flex;justify-content:flex-end;gap:8px}
      .logiq-pin-error{display:none;color:#dc2626;font-size:12px}.logiq-pin-error.is-visible{display:block}
      #logiq-mobile-header,#logiq-mobile-panel,#logiq-voice-bar{display:none}

      /* Ghost-hold is not media-query gated: desktop drag-mode hides is-others (opacity:0),
         which makes the tree look like it collapsed around the moving card. While a finger
         hold-drag is latched, keep the live map in place and ghost the origin branch. */
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.is-others{opacity:1!important;visibility:visible!important}
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.v2-branch-origin-ghost,
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.v2-branch-origin-ghost.hover-adopt-sub,
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.v2-branch-origin-ghost.hover-adopt,
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.v2-branch-origin-ghost.drop-target{opacity:.44!important;visibility:visible!important}
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.v2-branch-origin-ghost rect:not(.grabzone),
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.v2-branch-origin-ghost.drop-target rect:not(.grabzone){fill:#fff!important;stroke:#94a3b8!important;stroke-width:2px!important;stroke-dasharray:5 4!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.08))!important}
      body.v2-branch-drag svg.dragging-mode g.nodes g.node.v2-branch-origin-ghost text{fill:#64748b!important;opacity:.82!important}
      body.v2-branch-drag svg.dragging-mode g.links path.link{opacity:1!important;stroke:var(--link-color)!important;transition:none!important}
      body.v2-branch-drag svg.dragging-mode g.links path.link.is-sub-link,body.v2-branch-drag svg.dragging-mode g.links path.link.is-parent-link{opacity:.38!important;stroke:#94a3b8!important}
      body.v2-branch-drag .drag-mini,body.v2-branch-drag g.drag-mini{display:none!important;opacity:0!important;visibility:hidden!important}
      body.v2-branch-drag.v2-dock-target #Dock{outline:3px solid #22c55e;outline-offset:2px;background:rgba(220,252,231,.72)}

      @media (max-width:700px), (pointer:coarse) and (max-width:1200px), (hover:none) and (max-width:1200px){
        html,body{width:100%;max-width:100%;overflow:hidden}
        body>header{display:none!important}
        svg#canvas{position:fixed;inset:0;width:100%;height:100dvh;max-width:none;touch-action:none;overflow:visible;z-index:0}
        #trash{display:none!important;visibility:hidden!important;pointer-events:none!important}
        #Dock{left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));padding:0 4px;max-height:25dvh;overflow:auto;justify-content:flex-start;flex-wrap:wrap}
        #Dock.dock-left{top:54px;bottom:max(8px,env(safe-area-inset-bottom));left:8px;right:auto;width:min(220px,72vw);padding:8px}
        #Toast{bottom:72px;max-width:calc(100vw - 36px);text-align:center}
        #logiq-mobile-header{position:fixed;display:flex;top:0;left:0;right:0;z-index:3000;height:48px;box-sizing:border-box;align-items:center;gap:5px;padding:5px 7px;background:rgba(255,255,255,.95);border-bottom:1px solid rgba(226,232,240,.9);box-shadow:0 1px 4px rgba(15,23,42,.1);backdrop-filter:blur(8px)}
        #logiq-mobile-header img{width:28px;height:28px;flex:0 0 auto}
        .logiq-mobile-entry{height:36px;min-width:66px;flex:1;border:1px solid #dbe3ec;border-radius:10px;padding:0 9px;font:inherit;font-size:14px;background:rgba(255,255,255,.9)}
        #logiq-mobile-header .logiq-icon-btn{width:36px;height:36px;flex:0 0 36px;border-radius:10px;font-size:17px;padding:0}
        #logiq-mobile-header .logiq-icon-btn svg{width:19px;height:19px;display:block;margin:auto;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
        #logyq-paint-btn.is-paint-on{border-color:#0f172a;box-shadow:inset 0 0 0 3px var(--paint-active,#fde68a)}
        #logyq-paint-strip{position:fixed;display:none;z-index:3200;top:54px;left:8px;right:8px;align-items:center;gap:8px;padding:8px;overflow-x:auto;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.22)}
        #logyq-paint-strip.is-open{display:flex}
        .logyq-swatch{flex:0 0 32px;width:32px;height:32px;border:2px solid #e2e8f0;border-radius:999px;background:#fff;color:#334155;font-size:16px;line-height:1;padding:0}
        .logyq-swatch.is-active{border-color:#0f172a;box-shadow:0 0 0 2px rgba(15,23,42,.18)}
        #logiq-mobile-header .logiq-save-state{width:9px;overflow:hidden;gap:0;flex:0 0 9px;color:transparent}
        #logiq-mobile-header .logiq-save-state::before{flex:0 0 8px;width:8px;height:8px}
        #logiq-mobile-panel{position:fixed;display:none;z-index:3100;top:54px;right:8px;left:8px;padding:12px;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.22)}
        #logiq-mobile-panel.is-open{display:block}
        .logiq-mobile-tools{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.logiq-mobile-tools button{min-height:42px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-weight:650}
        #logiq-voice-bar{position:fixed;z-index:3300;left:50%;bottom:70px;transform:translateX(-50%);align-items:center;gap:9px;max-width:calc(100vw - 20px);padding:8px 9px 8px 13px;border-radius:999px;background:#111827;color:#fff;box-shadow:0 12px 34px rgba(15,23,42,.35);font-size:13px;font-weight:700;white-space:nowrap}
        #logiq-voice-bar.is-visible{display:flex}
        #logiq-voice-stop{border:0;border-radius:999px;background:#ef4444;color:#fff;padding:8px 13px;font-weight:800}
        svg#canvas g.node:not(.is-outlined){pointer-events:none}
        body.logyq-mobile-v162 svg#canvas g.node{pointer-events:none!important}
        #logyq-v162-action{position:fixed;z-index:3950;display:none;place-items:center;width:40px;height:40px;padding:0;border:2px solid #fff;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 7px 20px rgba(15,23,42,.26);font:800 10px/1 system-ui;touch-action:none}
        #logyq-v162-action.show{display:grid}#logyq-v162-action.rec{background:#ef4444}
        #logyq-v162-action.rec::before{content:"";position:absolute;inset:-5px;border:2px solid rgba(239,68,68,.35);border-radius:50%;animation:logyq-v162-pulse 1.05s ease-out infinite}
        @keyframes logyq-v162-pulse{0%{transform:scale(.72);opacity:.95}100%{transform:scale(1.28);opacity:0}}
        .logiq-backdrop{padding:8px;align-items:flex-end}.logiq-modal{max-height:88dvh;border-radius:18px 18px 10px 10px}.logiq-map-row{grid-template-columns:1fr}.logiq-map-actions{justify-content:flex-start}
      }
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        body.logyq-mobile-v162 #logiq-v2-drag-card,body.logyq-mobile-v162 .drag-mini,body.logyq-mobile-v162 g.drag-mini{display:none!important;opacity:0!important;visibility:hidden!important}
        body.logyq-mobile-v162.v2-branch-drag .drag-mini{display:none!important;opacity:0!important}
        #logyq-v162-branch-preview{position:fixed;inset:0;z-index:3940;pointer-events:none;overflow:visible;transform:translate3d(0,0,0);will-change:transform}
        #logyq-v162-branch-preview svg{position:absolute;overflow:visible;pointer-events:none}
        body.logyq-mobile-v162.v2-cancel #logyq-v162-branch-preview g.node rect:not(.grabzone){stroke:#ef4444!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost{opacity:.44!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost rect:not(.grabzone){fill:#fff!important;stroke:#94a3b8!important;stroke-width:2px!important;stroke-dasharray:5 4!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.08))!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost text{fill:#64748b!important;opacity:.82!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.nodes g.node.is-others{opacity:1!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link{opacity:1!important;stroke:var(--link-color)!important;transition:none!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link.is-sub-link,body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link.is-parent-link{opacity:.38!important;stroke:#94a3b8!important}
        body.logyq-mobile-v162.v2-branch-drag{--det-node:transparent!important;--det-sib:transparent!important;--det-cousin-l:transparent!important;--det-cousin-r:transparent!important;--det-edge:transparent!important}
        body.logyq-mobile-v162.v2-branch-drag g.node.drop-target rect:not(.grabzone){fill:#22c55e!important;stroke:#22c55e!important;filter:drop-shadow(0 0 7px rgba(34,197,94,.28))!important}
        body.logyq-mobile-v162.v2-branch-drag g.node.drop-target text{fill:#fff!important;opacity:1!important}
        body.logyq-mobile-v162.v2-branch-drag .caret-dot{fill:#22c55e!important}
        body.logyq-mobile-v162.v2-branch-drag #trash{display:block!important;position:fixed!important;left:-10000px!important;right:auto!important;top:-10000px!important;bottom:auto!important}
      }
      @media (hover:none) and (pointer:coarse) and (max-height:500px){
        #logiq-mobile-header{height:44px;padding-top:4px;padding-bottom:4px}
        #logiq-mobile-panel{top:48px;left:auto;width:min(310px,calc(100vw - 16px))}
        #logiq-voice-bar{bottom:62px}
      }
    `
    document.head.append(style)
  }

