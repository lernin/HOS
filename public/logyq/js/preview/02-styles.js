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
      #logiq-mobile-header,#logiq-mobile-panel,#logiq-mobile-context,#logiq-spawn-puck,#logiq-spawn-ghost,#logiq-voice-bar{display:none}

      @media (max-width:700px), (pointer:coarse) and (max-width:1200px), (hover:none) and (max-width:1200px){
        body>header{display:none!important}
        svg#canvas{height:100dvh;touch-action:none}
        #trash{display:none!important}
        #Dock{left:8px;right:8px;bottom:66px;padding:0 4px;max-height:25dvh;overflow:auto;justify-content:flex-start;flex-wrap:wrap}
        #Dock.dock-left{top:54px;bottom:66px;width:min(220px,72vw);padding:8px}
        #Hint{bottom:72px}
        #Toast{bottom:122px;max-width:calc(100vw - 36px);text-align:center}
        #logiq-mobile-header{position:fixed;display:flex;top:0;left:0;right:0;z-index:3000;height:48px;box-sizing:border-box;align-items:center;gap:5px;padding:5px 7px;background:rgba(255,255,255,.95);border-bottom:1px solid rgba(226,232,240,.9);box-shadow:0 1px 4px rgba(15,23,42,.1);backdrop-filter:blur(8px)}
        #logiq-mobile-header img{width:28px;height:28px;flex:0 0 auto}
        .logiq-mobile-entry{height:36px;min-width:66px;flex:1;border:1px solid #dbe3ec;border-radius:10px;padding:0 9px;font:inherit;font-size:14px;background:rgba(255,255,255,.9)}
        #logiq-mobile-header .logiq-icon-btn{width:36px;height:36px;flex:0 0 36px;border-radius:10px;font-size:17px;padding:0}
        #logiq-mobile-header .logiq-icon-btn svg{width:19px;height:19px;display:block;margin:auto;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
        #logiq-mobile-header .logiq-save-state{width:9px;overflow:hidden;gap:0;flex:0 0 9px;color:transparent}
        #logiq-mobile-header .logiq-save-state::before{flex:0 0 8px;width:8px;height:8px}
        #logiq-mobile-panel{position:fixed;display:none;z-index:3100;top:54px;right:8px;left:8px;padding:12px;background:rgba(255,255,255,.98);border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.22)}
        #logiq-mobile-panel.is-open{display:block}
        .logiq-mobile-tools{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.logiq-mobile-tools button{min-height:42px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#334155;font-weight:650}
        #logiq-mobile-context{position:fixed;display:none;z-index:3000;left:8px;right:8px;bottom:8px;min-height:52px;padding:6px;background:rgba(255,255,255,.96);border:1px solid #e2e8f0;border-radius:15px;box-shadow:0 12px 36px rgba(15,23,42,.2);backdrop-filter:blur(8px);grid-template-columns:repeat(6,1fr);gap:5px}
        #logiq-mobile-context.is-visible{display:grid}
        #logiq-mobile-context button{min-width:0;height:40px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#334155;font-size:12px;font-weight:700;padding:2px}
        #logiq-mobile-context button[data-action="delete"]{color:#dc2626}
        #logiq-mobile-context button.is-active{background:#dcfce7;border-color:#22c55e;color:#166534}
        #logiq-spawn-puck{position:fixed;z-index:3200;width:38px;height:38px;border:2px solid #fff;border-radius:50%;background:#16a34a;color:#fff;box-shadow:0 5px 16px rgba(15,23,42,.3);font-size:24px;line-height:30px;align-items:center;justify-content:center;touch-action:none;user-select:none}
        #logiq-spawn-puck.is-visible{display:none!important}
        #logiq-spawn-puck.is-dragging{transform:scale(1.08);background:#15803d}
        #logiq-spawn-ghost{position:fixed;z-index:3190;min-width:92px;padding:7px 10px;border-radius:999px;background:rgba(15,23,42,.9);color:#fff;text-align:center;font-size:12px;font-weight:750;pointer-events:none;transform:translate(-50%,-50%)}
        #logiq-spawn-ghost.is-visible{display:none!important}
        #logiq-voice-bar{position:fixed;z-index:3300;left:50%;bottom:70px;transform:translateX(-50%);align-items:center;gap:9px;max-width:calc(100vw - 20px);padding:8px 9px 8px 13px;border-radius:999px;background:#111827;color:#fff;box-shadow:0 12px 34px rgba(15,23,42,.35);font-size:13px;font-weight:700;white-space:nowrap}
        #logiq-voice-bar.is-visible{display:flex}
        #logiq-voice-stop{border:0;border-radius:999px;background:#ef4444;color:#fff;padding:8px 13px;font-weight:800}
        svg#canvas g.node:not(.is-outlined){pointer-events:none}
        .logiq-backdrop{padding:8px;align-items:flex-end}.logiq-modal{max-height:88dvh;border-radius:18px 18px 10px 10px}.logiq-map-row{grid-template-columns:1fr}.logiq-map-actions{justify-content:flex-start}
      }
      @media (hover:none) and (pointer:coarse) and (max-height:500px){
        #logiq-mobile-header{height:44px;padding-top:4px;padding-bottom:4px}
        #logiq-mobile-panel{top:48px;left:auto;width:min(310px,calc(100vw - 16px))}
        #logiq-mobile-context{left:auto;width:min(360px,calc(100vw - 16px))}
        #logiq-voice-bar{bottom:62px}
      }
    `
    document.head.append(style)
  }

