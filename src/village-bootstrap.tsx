import { createRoot, type Root } from 'react-dom/client'
import { Village } from './experiences/Village'

let villageRoot: Root | null = null
let host: HTMLDivElement | null = null

function closeVillage() {
  villageRoot?.unmount()
  villageRoot = null
  host?.remove()
  host = null
}

function openVillage() {
  if (host) return
  host = document.createElement('div')
  host.id = 'village-lab-host'
  document.body.appendChild(host)
  villageRoot = createRoot(host)
  villageRoot.render(<Village onBack={closeVillage} />)
}

function installCard() {
  const grid = document.querySelector('.experience-grid')
  if (!grid || grid.querySelector('[data-village-lab]')) return

  const card = document.createElement('article')
  card.className = 'experience-card'
  card.dataset.villageLab = 'true'
  card.innerHTML = '<span class="experience-icon">Vg</span><span class="experience-copy"><strong>Village</strong><small>A storybook valley with a creek, bridge, paths, nature, and an enterable cottage.</small></span><button class="experience-go" type="button">Go</button>'
  card.querySelector('button')?.addEventListener('click', openVillage)

  const ocean = grid.querySelector('.experience-card')
  ocean?.insertAdjacentElement('afterend', card)
}

const observer = new MutationObserver(installCard)
observer.observe(document.documentElement, { childList: true, subtree: true })
queueMicrotask(installCard)
