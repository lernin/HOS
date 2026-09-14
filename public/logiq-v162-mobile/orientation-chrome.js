(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc || !win.matchMedia('((pointer:coarse) and (max-width:1200px)),((hover:none) and (max-width:1200px))').matches) return

    const style = doc.createElement('style')
    style.id = 'logiq-v2-orientation-chrome'
    style.textContent = `
      @media (pointer:coarse) and (max-width:1200px) and (orientation:portrait),
             (hover:none) and (max-width:1200px) and (orientation:portrait){
        body.logiq-mobile-v2 #logiq-mobile-header{display:flex!important}
        body.logiq-mobile-v2 #logiq-v2-rail{display:none!important}
        body.logiq-mobile-v2 #Dock{bottom:66px!important}
        body.logiq-mobile-v2 #Hint{bottom:72px!important}
        body.logiq-mobile-v2 #logiq-mobile-panel{
          top:54px!important;
          left:8px!important;
          right:8px!important;
          bottom:auto!important;
          width:auto!important;
          max-width:none!important;
          overflow:visible!important;
        }
      }

      @media (pointer:coarse) and (max-width:1200px) and (orientation:landscape),
             (hover:none) and (max-width:1200px) and (orientation:landscape){
        body.logiq-mobile-v2 #logiq-mobile-header{display:none!important}
        body.logiq-mobile-v2 #logiq-v2-rail{display:flex!important}
      }
    `
    doc.head.appendChild(style)
  })
})()
