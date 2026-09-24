  function injectStyles() {
    const style = document.createElement('style')
    style.id = 'logyq-preview-styles'
    style.textContent = `
      .logiq-save-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#64748b;white-space:nowrap}
      .logiq-save-state::before{content:"";width:7px;height:7px;border-radius:50%;background:#22c55e}
      .logiq-save-state[data-state="saving"]::before{background:#f59e0b;animation:logiq-pulse 900ms ease-in-out infinite}
      .logiq-save-state[data-state="offline"]::before{background:#94a3b8}
      .logyq-db-bubble{position:fixed;z-index:6500;transform:translate(-50%,calc(-100% - 4px));pointer-events:none;border-radius:999px;padding:5px 10px;background:#14532d;color:#fff;font:600 12px/1.3 system-ui,sans-serif;box-shadow:0 4px 12px rgba(15,23,42,.16);max-width:min(240px,calc(100vw - 24px));text-align:center}
      .logyq-db-bubble[data-anchor="field"]{position:relative;left:auto!important;top:auto!important;transform:none;z-index:1;align-self:center;margin:0 16px 8px;width:max-content;max-width:calc(100vw - 32px)}
      .logyq-db-bubble[hidden]{display:none}
      @keyframes logiq-pulse{50%{opacity:.35}}
      .logiq-backdrop{position:fixed;inset:0;z-index:5000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.36);backdrop-filter:blur(4px)}
      .logiq-backdrop.is-open{display:flex}
      #logiq-pin.is-open{z-index:6400}
      .logiq-modal{width:min(680px,100%);max-height:min(760px,calc(100dvh - 36px));overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.24);color:#334155}
      body.logyq-home #logiq-library{display:flex;align-items:stretch;justify-content:stretch;padding:0;background:#f8fafc;z-index:4500}
      body.logyq-home #logiq-library .logiq-modal{width:100%;max-width:none;max-height:none;height:100%;border:0;border-radius:0;box-shadow:none}
      body.logyq-home:not(.logyq-map-open) #logiq-library-close{display:none}
      #logyq-home-btn svg{width:18px;height:18px;display:block;margin:auto;fill:none;stroke:currentColor;stroke-width:1.8}
      .logyq-choice-card,.logyq-chooser{display:none!important}
      .logiq-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:16px;background:rgba(255,255,255,.96);border-bottom:1px solid #e2e8f0}
      .logiq-modal-head h2{font-size:18px;margin:0;flex:1}
      .logyq-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .logyq-home-tabs{display:flex;align-items:center;gap:4px;flex:1;min-width:0}
      .logyq-home-tab{border:0;background:transparent;color:#64748b;font:750 16px/1.2 system-ui,sans-serif;padding:6px 10px;border-radius:999px;cursor:pointer}
      .logyq-home-tab.is-active{color:#14532d;background:#dcfce7}
      #logiq-library[data-shelf="curriculum"] #logiq-new-map,
      #logiq-library[data-shelf="curriculum"] #logiq-map-list,
      #logyq-curriculum{display:none}
      #logiq-library[data-shelf="curriculum"] #logyq-curriculum{display:block}
      #logyq-curriculum .logiq-empty p{margin:0}
      .logyq-level-intro{margin:4px 0 14px;color:#64748b;font-size:13px}
      #logyq-level-path{list-style:none;margin:0 auto 28px;padding:8px 0 12px;width:min(440px,100%);display:grid;gap:16px;position:relative}
      #logyq-level-path::before{content:"";position:absolute;left:50%;top:28px;bottom:28px;width:4px;border-radius:999px;background:#bbf7d0;transform:translateX(-50%)}
      .logyq-level{position:relative;display:flex;z-index:1}
      .logyq-level:nth-child(odd){justify-content:flex-start;padding-left:4%}
      .logyq-level:nth-child(even){justify-content:flex-end;padding-right:4%}
      .logyq-level button{display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:6px 14px 6px 6px;font:700 15px/1.2 system-ui,sans-serif;color:#14532d;cursor:pointer;box-shadow:0 6px 16px rgba(15,23,42,.06)}
      .logyq-level-num{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#16a34a;color:#fff;font-weight:800}
      .logyq-level.is-cleared .logyq-level-num{background:#14532d}
      .logyq-level.is-locked button{color:#94a3b8;cursor:not-allowed;box-shadow:none}
      .logyq-level.is-locked .logyq-level-num{background:#e2e8f0;color:#64748b}
      .logyq-level-lock{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8}
      #logyq-curriculum-bar{position:fixed;z-index:42;top:74px;left:12px;right:12px;display:none;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 8px 24px rgba(15,23,42,.08)}
      body.logyq-curriculum:not(.logyq-home) #logyq-curriculum-bar{display:flex}
      #logyq-curriculum-status{margin:0;flex:1;min-width:0;font-size:13px;font-weight:650;color:#334155}
      #logyq-curriculum-status[data-tone="clear"]{color:#14532d}
      #logyq-curriculum-status[data-tone="wait"]{color:#64748b}
      #logyq-curriculum-check,#logyq-curriculum-levels,#logyq-curriculum-mix{border:0;border-radius:10px;background:#16a34a;color:#fff;padding:8px 12px;font-weight:750;cursor:pointer}
      #logyq-curriculum-levels,#logyq-curriculum-mix{background:#fff;color:#14532d;border:1px solid #bbf7d0}
      .logiq-icon-btn{width:38px;height:38px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-size:18px;cursor:pointer}
      .logiq-primary{border:0;border-radius:10px;background:#16a34a;color:#fff;padding:9px 13px;font-weight:750;cursor:pointer}
      .logiq-library-body{padding:12px 16px 18px}
      .logiq-library-note{margin:0 0 12px;color:#64748b;font-size:13px}
      .logiq-map-list{display:grid;gap:9px}
      .logiq-map-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer}
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
      .logiq-empty p{margin:0 0 14px}
      .logiq-empty .logiq-primary{min-width:148px}
      .logiq-pin-card{width:min(360px,100%);padding:20px;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,.24);display:grid;gap:12px;color:#334155}
      .logiq-pin-card h2,.logiq-pin-card p{margin:0}.logiq-pin-card p{font-size:13px;color:#64748b}
      .logiq-pin-actions{display:flex;justify-content:flex-end;gap:8px}
      .logiq-pin-error{display:none;color:#dc2626;font-size:12px}.logiq-pin-error.is-visible{display:block}
      #logiq-mobile-header,#logiq-mobile-panel,#logiq-voice-bar{display:none}
      #logyq-map-title{position:fixed;z-index:40;top:58px;left:14px;max-width:min(240px,46vw);pointer-events:none;color:#94a3b8;font:500 12px/1.2 system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      body.logyq-home #logyq-map-title{display:none}

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
      #logyq-v162-branch-preview{opacity:0.55}
      body.v2-branch-drag.v2-dock-target #Dock{outline:3px solid #22c55e;outline-offset:2px;background:rgba(220,252,231,.72)}

      @media (max-width:700px), (pointer:coarse) and (max-width:1200px), (hover:none) and (max-width:1200px){
        html,body{width:100%;max-width:100%;overflow:hidden}
        body>header{display:none!important}
        svg#canvas{position:fixed;inset:0;width:100%;height:100dvh;max-width:none;touch-action:none;overflow:visible;z-index:0}
        #trash{display:none!important;visibility:hidden!important;pointer-events:none!important}
        #Dock,#Dock.dock-left{box-sizing:border-box;left:0;right:0;top:auto;bottom:0;width:auto;height:calc(56px + env(safe-area-inset-bottom));min-height:calc(56px + env(safe-area-inset-bottom));max-height:none;padding:8px 10px calc(8px + env(safe-area-inset-bottom));overflow-x:auto;overflow-y:hidden;display:flex!important;flex-direction:row;flex-wrap:nowrap;justify-content:flex-start;align-items:center;column-width:auto;column-count:auto;gap:8px;border-radius:0;background:rgba(255,255,255,.96);border:0;border-top:1px solid rgba(226,232,240,.95);box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 -10px 24px rgba(15,23,42,.06);touch-action:none;scrollbar-width:none}
        #Dock.dock-hidden{display:none!important}
        #Dock .chip,#Dock.dock-left .chip{touch-action:none;-webkit-user-drag:none;display:inline-flex;margin:0}
        #logyq-warehouse{display:flex;position:fixed;z-index:30;width:44px;height:44px;left:10px;right:auto;top:auto;bottom:calc(56px + env(safe-area-inset-bottom) + 8px)}
        #logyq-bank-trash{display:none;position:fixed;z-index:30;width:44px;height:44px;right:10px;left:auto;top:auto;bottom:calc(56px + env(safe-area-inset-bottom) + 8px)}
        body:has(#Dock.dock-hidden) #logyq-warehouse,body:has(#Dock.dock-hidden) #logyq-bank-trash,body.logyq-home:not(.logyq-map-open) #logyq-warehouse,body.logyq-home:not(.logyq-map-open) #logyq-bank-trash{display:none!important}
        body.logyq-chip-drag #logyq-bank-trash,body.v2-branch-drag #logyq-bank-trash,body:has(#Dock.dock-hidden).logyq-chip-drag #logyq-bank-trash,body:has(#Dock.dock-hidden).v2-branch-drag #logyq-bank-trash{display:flex!important}
        #logyq-warehouse.is-bank-empty{display:none!important}
        #Toast{bottom:72px;max-width:calc(100vw - 36px);text-align:center}
        #logiq-mobile-header{position:fixed;display:flex;top:0;left:0;right:0;z-index:3000;height:48px;box-sizing:border-box;align-items:center;justify-content:space-between;gap:5px;padding:5px 7px;background:rgba(255,255,255,.95);border-bottom:1px solid rgba(226,232,240,.9);box-shadow:0 1px 4px rgba(15,23,42,.1);backdrop-filter:blur(8px);overflow:hidden;flex-wrap:nowrap}
        #logyq-map-title{top:52px;left:12px}
        #logyq-corner-cluster{display:contents}
        #logyq-select-strip{display:none!important}
        #logiq-mobile-header img{width:28px;height:28px;flex:0 0 auto;order:2}
        #logyq-home-btn{order:1}
        #logiq-mobile-header [data-tool="undo"]{order:5}
        #logiq-mobile-header [data-tool="fit"]{order:6}
        #logyq-paint-btn{order:7}
        #logiq-mobile-header .logiq-save-state{display:inline-flex;align-items:center;width:9px;overflow:hidden;gap:0;flex:0 0 9px;color:transparent;order:8}
        #logiq-mobile-header .logiq-save-state::before{flex:0 0 8px;width:8px;height:8px}
        #logiq-mobile-menu-btn{order:9}
        #logiq-mobile-header .logiq-icon-btn{width:36px;height:36px;flex:0 0 36px;border-radius:10px;font-size:17px;padding:0}
        #logiq-mobile-header .logiq-icon-btn svg{width:19px;height:19px;display:block;margin:auto;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
        #logyq-paint-btn.is-paint-on{border-color:#0f172a;box-shadow:inset 0 0 0 3px var(--paint-active,#fde68a)}
        #logyq-paint-strip{position:fixed;display:none;z-index:3200;top:54px;left:auto;right:8px;width:max-content;max-width:calc(100vw - 16px);align-items:center;gap:8px;padding:8px;overflow-x:auto;flex-wrap:nowrap;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.22)}
        #logyq-paint-strip.is-open{display:flex}
        .logyq-swatch{flex:0 0 32px;width:32px;height:32px;border:2px solid #e2e8f0;border-radius:999px;background:#fff;color:#334155;font-size:16px;line-height:1;padding:0}
        .logyq-swatch.is-active{border-color:#0f172a;box-shadow:0 0 0 2px rgba(15,23,42,.18)}
        #logiq-mobile-panel{position:fixed;display:none;z-index:3100;top:54px;left:auto;right:8px;width:min(310px,calc(100vw - 16px));padding:12px;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.22)}
        #logiq-mobile-panel.is-open{display:block}
        .logiq-mobile-tools{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.logiq-mobile-tools button{min-height:42px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-weight:650}
        #logiq-voice-bar{position:fixed;z-index:3300;left:50%;bottom:70px;transform:translateX(-50%);align-items:center;gap:9px;max-width:calc(100vw - 20px);padding:8px 9px 8px 13px;border-radius:999px;background:#111827;color:#fff;box-shadow:0 12px 34px rgba(15,23,42,.35);font-size:13px;font-weight:700;white-space:nowrap}
        #logiq-voice-bar.is-visible{display:flex}
        #logiq-voice-stop{border:0;border-radius:999px;background:#ef4444;color:#fff;padding:8px 13px;font-weight:800}
        svg#canvas g.node:not(.is-outlined){pointer-events:none}
        body.logyq-mobile-v162 svg#canvas g.node,body.logyq-mobile-v162 svg#canvas g.node *{pointer-events:none!important}
        body.logyq-mobile-v162 svg#canvas g.node>rect:not(.grabzone),body.logyq-mobile-v162 svg#canvas g.node>text{pointer-events:auto!important}
        body.logyq-mobile-v162 svg#canvas g.node>rect.logyq-smite-glow{pointer-events:none!important;animation:none!important;filter:none!important}
        body.logyq-mobile-v162 svg#canvas g.node>rect.logyq-smite-wash{pointer-events:none!important;fill:none!important;fill-opacity:0!important;stroke-width:3.5px!important;stroke-linecap:round;vector-effect:non-scaling-stroke}
        body.logyq-mobile-v162 svg#canvas g.node>rect.logyq-edit-focus{pointer-events:none!important;fill:none!important;fill-opacity:0!important;stroke:#16a34a!important;stroke-width:3.5px!important;stroke-linecap:round;vector-effect:non-scaling-stroke;filter:none!important;animation:none!important}
        body.logyq-mobile-v162 svg#canvas g.node>rect.logyq-smite-wash[data-smite-outline="ants"]{stroke-dasharray:8 6!important;animation:logyq-smite-march 1.4s linear infinite!important}
        body.logyq-mobile-v162 svg#canvas g.links path.link[data-smite-edge="1"]{opacity:1!important;stroke-opacity:1!important;stroke-width:3.5px!important;stroke-linecap:round;stroke-dasharray:none!important;animation:none!important;transition:none!important;vector-effect:non-scaling-stroke}
        body.logyq-mobile-v162 svg#canvas g.links path.logyq-smite-ant{fill:none!important;stroke-linecap:round;stroke-dasharray:8 6!important;animation:logyq-smite-march 1.4s linear infinite!important;pointer-events:none!important;transition:none!important;vector-effect:non-scaling-stroke}
        body.logyq-mobile-v162 svg#canvas g.node>path.logyq-smite-clock{fill:none!important;stroke-width:3.5px!important;stroke-linecap:round;stroke-linejoin:round;pointer-events:none!important;animation:none!important;transition:none!important;vector-effect:none}
        body.logyq-mobile-v162 svg#canvas g.node>path.logyq-smite-clock.logyq-smite-red,body.logyq-mobile-v162 svg#canvas g.node>path.logyq-smite-clock.logyq-smite-amber{filter:none}
        .logyq-smite-scar{position:fixed;z-index:40;width:18px;height:18px;margin:-9px 0 0 -9px;padding:0;border:3px solid #dc2626;border-radius:999px;background:transparent;box-shadow:0 0 6px rgba(239,68,68,.55);touch-action:manipulation;pointer-events:auto;transform-origin:center}
        .logyq-smite-scar.is-covered{pointer-events:none!important}
        body.logyq-mobile-v162.logyq-layout-settling svg#canvas g.node,body.logyq-mobile-v162.logyq-layout-settling svg#canvas g.node *,body.logyq-mobile-v162.logyq-layout-settling svg#canvas g.node>rect:not(.grabzone),body.logyq-mobile-v162.logyq-layout-settling svg#canvas g.node>text{pointer-events:none!important}
        #logyq-v162-action{position:fixed;z-index:3950;display:none;place-items:center;width:40px;height:40px;padding:0;border:2px solid #fff;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 7px 20px rgba(15,23,42,.26);font:800 10px/1 system-ui;touch-action:none}
        #logyq-v162-action.show{display:grid}#logyq-v162-action.rec{background:#ef4444}
        #logyq-v162-action.rec::before{content:"";position:absolute;inset:-5px;border:2px solid rgba(239,68,68,.35);border-radius:50%;animation:logyq-v162-pulse 1.05s ease-out infinite}
        @keyframes logyq-v162-pulse{0%{transform:scale(.72);opacity:.95}100%{transform:scale(1.28);opacity:0}}
        @keyframes logyq-smite-march{from{stroke-dashoffset:0}to{stroke-dashoffset:-14px}}
        .logiq-backdrop{padding:8px;align-items:flex-end}.logiq-modal{max-height:88dvh;border-radius:18px 18px 10px 10px}.logiq-map-row{grid-template-columns:1fr}.logiq-map-actions{justify-content:flex-start}
      }
      @media (pointer:coarse) and (max-width:1200px),(hover:none) and (max-width:1200px){
        body.logyq-mobile-v162 #logiq-v2-drag-card,body.logyq-mobile-v162 .drag-mini,body.logyq-mobile-v162 g.drag-mini{display:none!important;opacity:0!important;visibility:hidden!important}
        body.logyq-mobile-v162.v2-branch-drag .drag-mini{display:none!important;opacity:0!important}
        #logyq-v162-branch-preview{position:fixed;inset:0;z-index:3940;pointer-events:none;overflow:visible;transform:translate3d(0,0,0);will-change:transform;opacity:0.55}
        #logyq-v162-branch-preview svg{position:absolute;overflow:visible;pointer-events:none}
        #logyq-v162-branch-preview g.node text,#logyq-v162-branch-preview g.node text.label{fill:#374151!important}
        body.logyq-mobile-v162.v2-cancel #logyq-v162-branch-preview g.node rect:not(.grabzone){stroke:#ef4444!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost{opacity:.44!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost rect:not(.grabzone){fill:#fff!important;stroke:#94a3b8!important;stroke-width:2px!important;stroke-dasharray:5 4!important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.08))!important}
        body.logyq-mobile-v162 .v2-branch-origin-ghost text{fill:#64748b!important;opacity:.82!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.nodes g.node.is-others{opacity:1!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link{opacity:1!important;stroke:var(--link-color)!important;transition:none!important}
        body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link.is-sub-link,body.logyq-mobile-v162.v2-branch-drag svg.dragging-mode g.links path.link.is-parent-link{opacity:.38!important;stroke:#94a3b8!important}
        body.logyq-mobile-v162.v2-branch-drag{--det-node:transparent!important;--det-sib:transparent!important;--det-cousin-l:transparent!important;--det-cousin-r:transparent!important;--det-edge:transparent!important}
        body.logyq-mobile-v162.v2-branch-drag svg#canvas g.node.drop-target rect:not(.grabzone){fill:#22c55e!important;stroke:#22c55e!important;filter:drop-shadow(0 0 7px rgba(34,197,94,.28))!important}
        body.logyq-mobile-v162.v2-branch-drag svg#canvas g.node.drop-target text{fill:#fff!important;opacity:1!important}
        body.logyq-mobile-v162.v2-branch-drag .caret-dot{fill:#22c55e!important}
        body.logyq-mobile-v162.v2-branch-drag #trash{display:block!important;position:fixed!important;left:-10000px!important;right:auto!important;top:-10000px!important;bottom:auto!important}
      }
      @media (hover:none) and (pointer:coarse) and (max-height:500px){
        #logiq-voice-bar{bottom:62px}
      }
      @media (orientation:landscape) and (max-width:700px),(orientation:landscape) and (pointer:coarse) and (max-width:1200px),(orientation:landscape) and (hover:none) and (max-width:1200px){
        #logiq-mobile-header{display:contents;position:static;height:auto;background:none;border:0;box-shadow:none;padding:0;overflow:visible}
        #logyq-map-title{top:max(8px,env(safe-area-inset-top));left:calc(148px + env(safe-area-inset-left) + 12px)}
        #logyq-corner-cluster{display:flex;flex-direction:column;align-items:center;gap:6px;position:fixed;z-index:3000;top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));left:auto;bottom:auto;width:max-content;height:auto;max-height:calc(100dvh - 16px);padding:6px;border-radius:18px;background:rgba(255,255,255,.94);border:1px solid rgba(226,232,240,.9);box-shadow:0 10px 28px rgba(15,23,42,.16);overflow:auto}
        #logyq-corner-cluster img,#logyq-select-strip,#logyq-home-btn{display:none}
        #logyq-paint-btn{order:-1}
        #logyq-corner-cluster .logiq-icon-btn{width:44px;height:44px;flex:0 0 44px;touch-action:manipulation}
        #logyq-corner-cluster .logiq-save-state{display:none}
        svg#canvas{left:0;right:0;top:0;width:100%;height:100dvh}
        #logyq-paint-strip{top:max(8px,env(safe-area-inset-top));left:auto;right:max(72px,calc(env(safe-area-inset-right) + 8px));width:max-content;max-width:min(420px,calc(100vw - 88px))}
        #logiq-mobile-panel{top:max(8px,env(safe-area-inset-top));left:auto;right:max(72px,calc(env(safe-area-inset-right) + 8px));width:min(310px,calc(100vw - 88px))}
        #Dock,#Dock.dock-left{box-sizing:border-box;left:0;right:auto;top:0;bottom:0;width:calc(148px + env(safe-area-inset-left));height:auto;min-height:0;max-height:none;padding:10px 10px 10px calc(10px + env(safe-area-inset-left));overflow-x:hidden;overflow-y:auto;flex-direction:column;align-items:stretch;border-radius:0;border-top:0;border-right:1px solid rgba(226,232,240,.95);box-shadow:inset -1px 0 0 rgba(255,255,255,.8),8px 0 24px rgba(15,23,42,.05);touch-action:none}
        #Dock .chip,#Dock.dock-left .chip{touch-action:none;width:100%;max-width:100%}
        #logyq-map-title{left:calc(148px + env(safe-area-inset-left) + 12px)}
        #logyq-warehouse,#logyq-bank-trash{left:calc(148px + env(safe-area-inset-left) + 8px);right:auto}
        #logyq-warehouse{top:max(8px,env(safe-area-inset-top));bottom:auto}
        #logyq-bank-trash{top:auto;bottom:max(8px,env(safe-area-inset-bottom))}
        body.logyq-home #logiq-library .logiq-modal{display:flex;flex-direction:column}
        body.logyq-home #logiq-library .logiq-modal-head{flex-direction:row;width:auto;height:auto;border-right:0;border-bottom:1px solid #e2e8f0}
      }
      body.logyq-curriculum #Dock,
      body.logyq-curriculum #Dock.dock-left,
      body.logyq-curriculum #logyq-warehouse,
      body.logyq-curriculum #logyq-bank-trash,
      body.logyq-curriculum #logyq-warehouse-sheet,
      body.logyq-curriculum #trash,
      body.logyq-curriculum .word-tools,
      body.logyq-curriculum #logyq-select-strip,
      body.logyq-curriculum #logyq-paint-btn,
      body.logyq-curriculum #logyq-paint-strip,
      body.logyq-curriculum #logyq-thekonym-ask,
      body.logyq-curriculum #logiq-mobile-panel [data-tool="add"],
      body.logyq-curriculum #logiq-mobile-panel [data-tool="add-child"],
      body.logyq-curriculum #logiq-mobile-panel [data-tool="paint"],
      body.logyq-curriculum #logiq-mobile-panel [data-tool="dock"],
      body.logyq-mobile-v162.logyq-curriculum.v2-branch-drag #trash,
      body.logyq-curriculum.logyq-chip-drag #logyq-bank-trash,
      body.logyq-curriculum.v2-branch-drag #logyq-bank-trash{display:none!important;visibility:hidden!important;pointer-events:none!important}
      body.logyq-curriculum g.node.logyq-pile,
      body.logyq-curriculum g.hit-slot.logyq-pile,
      body.logyq-curriculum path.link.logyq-pile-link{display:none!important;pointer-events:none!important}
      #logyq-thekonym-ask{display:none}
      body.logyq-thekonym #logyq-thekonym-ask{display:grid;place-items:center;position:fixed;z-index:3300;top:58px;right:10px;width:36px;height:36px;border:1px solid #3c4d43;border-radius:10px;background:#162e27;color:#faf8f1;font:18px Georgia,serif;padding:0}
      #logyq-thekonym-mobile{grid-column:1 / -1}
      #logyq-thekonym-mobile[aria-pressed="true"]{background:#162e27;color:#faf8f1;border-color:#162e27}
      body.logyq-thekonym svg#canvas g.node text.label{dominant-baseline:alphabetic}
      body.logyq-thekonym svg#canvas g.node text.label tspan.logyq-onym{fill:#1c3329;font-family:'Roboto Condensed',system-ui,sans-serif;font-weight:400;font-synthesis:none;stroke:none;stroke-width:0}
      body.logyq-thekonym svg#canvas g.node text.label tspan.logyq-essence{fill:#66706a;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:500;stroke:none}
      body.logyq-thekonym svg#canvas g.node>rect.logyq-tk-heat{pointer-events:none;stroke:none;filter:none}
      body.logyq-thekonym svg#canvas g.node[data-tk-heat="red"]>rect.logyq-tk-heat{fill:rgba(214,64,64,.18)}
      body.logyq-thekonym svg#canvas g.node[data-tk-heat="amber"]>rect.logyq-tk-heat{fill:rgba(214,148,42,.22)}
      .logyq-tk-scrim{position:fixed;inset:0;z-index:6200;display:none;align-items:center;justify-content:center;background:transparent;padding:5dvh 5vw;touch-action:none}
      #logyq-tk-frost{position:fixed;inset:0;z-index:6150;pointer-events:none;opacity:0;background:rgba(244,241,228,.36);backdrop-filter:blur(14px) saturate(1.08);-webkit-backdrop-filter:blur(14px) saturate(1.08)}
      body:has(#logyq-thekonym-card.is-open) #logyq-tk-frost{opacity:1}
      .logyq-tk-scrim.is-open{display:flex}
      .logyq-tk-scrim.is-flipping{perspective:1400px}
      .logyq-tk-scrim.is-flipping .logyq-tk-card{transform-style:preserve-3d;backface-visibility:hidden}
      .logyq-tk-card{position:relative;box-sizing:border-box;width:90vw;height:90dvh;max-width:720px;overflow:hidden;display:flex;flex-direction:column;text-align:center;padding:0;background:#f7f5e9;color:#29382f;border-radius:18px;box-shadow:0 24px 70px rgba(22,46,39,.28);font-family:'DM Sans',system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}
      .logyq-tk-input{user-select:text;-webkit-user-select:text;touch-action:manipulation}
      .logyq-tk-x{position:absolute;top:8px;right:8px;z-index:1;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:#162e27;font-size:22px;line-height:1}
      .logyq-tk-body{box-sizing:border-box;width:100%;flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:16px 22px 14px}
      .logyq-tk-body.is-miss{justify-content:center}
      .logyq-tk-kicker{margin:0;letter-spacing:.18em;font-size:11px;font-weight:650;text-transform:uppercase;color:#284f38}
      .logyq-tk-kicker::after{content:"";display:block;width:22px;height:1px;margin:8px auto 0;background:#9a7846}
      .logyq-tk-onym{margin:8px 0 0;max-width:100%;font-family:'Roboto Condensed',system-ui,sans-serif;font-weight:400;font-synthesis:none;font-size:clamp(40px,10vw,64px);line-height:1.05;color:#162e27;overflow-wrap:anywhere}
      .logyq-tk-pron{margin:7px 0 0;max-width:100%;font-family:Georgia,serif;font-size:15px;line-height:1.3;color:#737969}
      .logyq-tk-essence{margin:8px 0 0;max-width:16em;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:500;font-size:clamp(22px,5.6vw,32px);line-height:1.2;color:#66706a}
      .logyq-tk-essence.is-blank{min-height:1.15em}
      .logyq-tk-fields{width:100%;margin-top:14px;display:flex;flex-direction:column;gap:10px;text-align:left}
      .logyq-tk-block h2{margin:0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:650;color:#6d6248}
      .logyq-tk-block p{margin:2px 0 0;font-size:15.5px;line-height:1.32;color:#29382f}
      .logyq-tk-technical.is-fade p{max-height:4.5em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 58%,transparent);mask-image:linear-gradient(#000 58%,transparent)}
      .logyq-tk-examples{margin:2px 0 0;padding:0 0 0 1.05em}
      .logyq-tk-examples li{margin:1px 0;font-size:15.5px;line-height:1.3;color:#29382f}
      .logyq-tk-empty{margin:14px 0 0;font-family:'DM Sans',system-ui,sans-serif;font-weight:500;font-size:clamp(26px,6vw,40px);line-height:1.2;color:#73786e}
      .logyq-tk-input{width:min(100%,16em);box-sizing:border-box;text-align:center;background:#fffef8;border:1px solid #b6bdac;border-radius:6px;padding:6px 10px;color:#29382f;font:inherit}
      .logyq-tk-browser{position:fixed;inset:0;z-index:6100;display:none;flex-direction:column;background:#f7f5e9;color:#29382f;font-family:'DM Sans',system-ui,sans-serif}
      .logyq-tk-browser.is-open{display:flex}
      .logyq-tk-browser header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:#162e27;color:#eeeadd;flex:0 0 auto}
      .logyq-tk-browser h2{margin:0;font-family:'DM Sans',system-ui,sans-serif;font-weight:500;font-size:26px}
      .logyq-tk-browser header button{border:0;background:transparent;color:inherit;width:40px;height:40px;font-size:22px}
      .logyq-tk-az{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;padding:12px 14px;border-bottom:1px solid #d8d8c9;flex:0 0 auto}
      .logyq-tk-az button{border:0;background:transparent;min-height:40px;border-radius:3px;color:#3e5142;font-family:Georgia,serif;font-size:18px}
      .logyq-tk-az button[aria-pressed="true"]{background:#284f38;color:#fff}
      .logyq-tk-az button:disabled{opacity:.25}
      .logyq-tk-list{flex:1;min-height:0;overflow:auto;padding:6px 12px 28px}
      .logyq-tk-prompt,.logyq-tk-none{margin:18px 8px;color:#73786e;font-size:15px}
      .logyq-tk-item{display:flex;align-items:center;gap:8px;border-bottom:1px solid #e6e5db}
      .logyq-tk-row{flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:54px;padding:8px 4px;border:0;background:transparent;text-align:left;color:#29382f}
      .logyq-tk-row span{font-family:Georgia,serif;font-size:19px}
      .logyq-tk-row small{font-size:12px;color:#73786e}
      .logyq-tk-add{flex:0 0 auto;border:1px solid #b6bdac;border-radius:6px;background:#faf8f1;color:#284e43;min-height:36px;padding:6px 8px;font:600 12px/1.2 'DM Sans',system-ui,sans-serif}
      @media (orientation:landscape) and (max-width:700px),(orientation:landscape) and (pointer:coarse) and (max-width:1200px),(orientation:landscape) and (hover:none) and (max-width:1200px){
        body.logyq-thekonym #logyq-thekonym-ask{top:8px;left:8px;right:auto}
      }
      @media (min-width:701px){
        body.logyq-thekonym #logyq-thekonym-ask{top:12px;right:12px}
      }
    `
    document.head.append(style)
  }

