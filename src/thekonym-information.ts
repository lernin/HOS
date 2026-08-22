import './thekonym-information.css'

type Term = {
  id: string
  term: string
  plain_definition: string | null
  status: string | null
  former_names?: string[]
  superseded_by?: string | null
  technical_definition?: string | null
  notes?: string | null
  review_note?: string | null
  definition_status?: string | null
}

type Tab = 'information' | 'comments' | 'sources' | 'research'

const CACHE_KEY = 'thekonym-terms-cache-v1'
const OVERLAY_ID = 'thekonym-information-overlay'

const sourceDocuments = [
  {
    title: 'Thekonym 4.5',
    role: 'Working terminology document',
    id: '1y5x0n4LzQEQqLslVfGklSE794fT-JQIj5V5uVe8G4iY',
    tabs: [
      ['START','t.0'],['Structural Navigation','t.eeze3idcu22b'],['Meaning & Identity','t.9v4d48hppchm'],['Change Record','t.kvh8fleqo3lh'],['Concept Identity & Naming','t.20d4jk5bzep9'],['Taxonomy & Tree Structure','t.lbad6be4wv51'],['Expression Structure & Distributed Meaning','t.m9422r9ojqj'],['Convention & Misleading Names','t.gcsbska3eotv'],['Learning & Proficiency','t.3fsy85hgckue'],['Migration Checklist','t.iv7t7c87fram'],['Membership, Composition & Comparison','t.eiudla7dunro'],['Development & Time','t.gyirrg6aekz8'],['Identity & Descriptive Relations','t.y5sts3y9f4s7'],['Context & Interpretation','t.dp5u21q21upj'],['Framework, Storage & Authority','t.qeoovc1pptt5'],['STAX Expression Architecture','t.yv7v9vz6ferc'],['Reference Architecture & Editorial Standard','t.puyf7x3ce233'],
    ]
  },
  {
    title: 'ARCHIVE — Procedia 4.5 Master — DO NOT EDIT',
    role: 'Preserved master source',
    id: '11Hmrb7eIaDai-YZyqXVexbZ2CI-35lm4QiT7XNtwyN8',
    tabs: [['ARCHITECTURE','t.70pm0i908r4j'],['PHASES','t.pg51aej2zb3'],['PHILOSOPHY','t.ys5ezxqf1tak'],['FEATURE','t.m3y4gwsjc47w'],['Reports','t.8gkmyt4p94qw'],['Taxonym implementation','t.ccac74qa29st'],['Revision process','t.pphjctqm5up7'],['How to knowledge graph','t.cjv4eeqv1tje']]
  },
  {
    title: 'ARCHIVE — Procedia 4.5 Appendix — DO NOT EDIT',
    role: 'Preserved appendix and white-paper tabs',
    id: '1qWjyYO3h_2pXAQOGR2YOU-Etm7IR1bFaNbgKy0Fzwm4',
    tabs: [['How to tree (eidonyms)','t.y3u45upg8ko'],['Is it a type?','t.jhvft3hnht2i'],['Saphonym','t.hhhtbwa04h7h'],['STAX Bridge','t.woz9o8g1fjy5'],['Diakonym','t.4roov2h24rzt'],['Cross Browser Continuity','t.qrn4f3p9wxe'],['Local-First AI Architecture','t.k6j0tdj23o2p'],['Apatonym and Nomizonym','t.q2gccv4ud3cr'],['Bathmonym — Ten-Level Vocabulary Model','t.czzyn51x74uj'],['Haptonym — The Atomic Link','t.roism9la7ohj']]
  }
]

function readTerms(): Term[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') as Term[] } catch { return [] }
}

function currentTerm(): Term | null {
  const title = document.querySelector<HTMLElement>('.app-shell .top h1')?.innerText.trim()
  if (!title) return null
  return readTerms().find(t => t.term === title) || null
}

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] || ch))
}

function googleDocUrl(id: string, tab?: string) {
  return `https://docs.google.com/document/d/${id}/edit${tab ? `?tab=${tab}` : ''}`
}

function closeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove()
}

function renderPanel(root: HTMLElement, term: Term, tab: Tab) {
  const body = root.querySelector<HTMLElement>('.dossier-scroll')!
  root.querySelectorAll<HTMLButtonElement>('.dossier-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab))
  const related = [...(term.former_names || []), ...(term.superseded_by ? [term.superseded_by] : [])]

  if (tab === 'information') {
    body.innerHTML = `
      <section class="preservation-banner"><strong>Read-only workspace</strong><span>Nothing here changes your judgment.</span></section>
      <div class="dossier-panel-stack">
        <section class="dossier-card"><div class="card-heading"><strong>Current stored labels</strong><span>Existing record</span></div><div class="dossier-content record-facts">
          <div><span>Term judgment</span><strong>${esc(term.status || 'No judgment recorded')}</strong></div>
          <div><span>Definition check</span><strong>${esc((term.definition_status || 'Not reviewed').replace('_',' '))}</strong></div>
        </div></section>
        <section class="dossier-card"><div class="card-heading"><strong>Existing stored material</strong><span>Preserved</span></div><div class="dossier-content">
          <div class="dossier-label">Plain-language text</div><p>${esc(term.plain_definition || 'No plain-language text is stored.')}</p>
          ${term.technical_definition ? `<div class="dossier-label">Technical text</div><p>${esc(term.technical_definition)}</p>` : ''}
          <div class="dossier-label">Registry notes and provenance</div><p>${esc(term.notes || 'No registry note is stored.')}</p>
        </div></section>
        <section class="dossier-card"><div class="card-heading"><strong>Names and connections already attached</strong><span>No inference</span></div><div class="dossier-content">${related.length ? `<div class="related-list">${related.map(name => `<span>${esc(name)}</span>`).join('')}</div>` : '<p>No former or replacement names are attached to this record.</p>'}</div></section>
      </div>`
    return
  }

  if (tab === 'comments') {
    body.innerHTML = `<section class="preservation-banner"><strong>My comments</strong><span>Current saved review note</span></section><section class="dossier-card"><div class="dossier-content"><div class="dossier-label">Your note</div><p>${esc(term.review_note || 'No review comment has been saved for this term yet.')}</p></div></section>`
    return
  }

  if (tab === 'sources') {
    body.innerHTML = `<section class="preservation-banner"><strong>Source library</strong><span>Open the exact working or preserved documents.</span></section><div class="source-list">${sourceDocuments.map(doc => `<section class="source-group"><div class="source-group-head"><strong>${esc(doc.title)}</strong><span>${esc(doc.role)}</span></div><div class="source-tabs">${doc.tabs.map(([name,id]) => `<a target="_blank" rel="noreferrer" href="${googleDocUrl(doc.id,id)}">${esc(name)}</a>`).join('')}</div></section>`).join('')}<section class="dossier-card"><div class="card-heading"><strong>GitHub source snapshots</strong><span>Preserved markdown</span></div><div class="dossier-content github-sources"><a class="github-source" target="_blank" rel="noreferrer" href="https://github.com/lernin/Procedia/blob/feature/thekonym-review/docs/source-of-truth/procedia-4.5/4.5%20Procedia%20Master%20(BACKUP%20pre-Thekonym).md"><span>Procedia 4.5 Master</span><small>backup</small></a><a class="github-source" target="_blank" rel="noreferrer" href="https://github.com/lernin/Procedia/blob/feature/thekonym-review/docs/source-of-truth/procedia-4.5/4.5%20Procedia%20Appendix%20(BACKUP%20pre-Thekonym).md"><span>Procedia 4.5 Appendix</span><small>backup</small></a></div></section></div>`
    return
  }

  const query = encodeURIComponent(`site:docs.google.com ${term.term} Procedia`)
  const githubQuery = encodeURIComponent(`${term.term} repo:lernin/Procedia`)
  body.innerHTML = `<section class="preservation-banner"><strong>Research</strong><span>Look outward without changing the record.</span></section><section class="dossier-card"><div class="dossier-content"><div class="dossier-label">Term to investigate</div><p><strong>${esc(term.term)}</strong></p><div class="source-tabs"><a target="_blank" rel="noreferrer" href="https://www.google.com/search?q=${query}">Search web/docs</a><a target="_blank" rel="noreferrer" href="https://github.com/search?q=${githubQuery}&type=code">Search Procedia code</a></div><p class="research-placeholder">Use this area to compare the stored definition against source material before deciding whether it is canonical, provisional, contested, or unclear.</p></div></section>`
}

function openOverlay() {
  const term = currentTerm()
  if (!term) return
  closeOverlay()
  const shell = document.querySelector<HTMLElement>('.app-shell')
  const overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.className = 'shell dossier-shell'
  overlay.dataset.theme = shell?.dataset.theme || 'terminal-cream'
  overlay.innerHTML = `
    <header class="dossier-top"><button class="dossier-back" aria-label="Back">←</button><div><div class="eyebrow">Thekonym information workspace</div><h1>${esc(term.term)}</h1></div></header>
    <nav class="dossier-tabs" aria-label="Information sections"><button data-tab="information">Information</button><button data-tab="comments">My comments</button><button data-tab="sources">Sources</button><button data-tab="research">Research</button></nav>
    <div class="dossier-scroll"></div>`
  document.body.appendChild(overlay)
  overlay.querySelector('.dossier-back')?.addEventListener('click', closeOverlay)
  overlay.querySelectorAll<HTMLButtonElement>('.dossier-tabs button').forEach(btn => btn.addEventListener('click', () => renderPanel(overlay, term, btn.dataset.tab as Tab)))
  renderPanel(overlay, term, 'information')
}

function ensureButton() {
  if (location.pathname !== '/thekonym') { closeOverlay(); return }
  const row = document.querySelector<HTMLElement>('.app-shell .definition-row')
  if (!row || row.querySelector('.deep-review-button')) return
  row.classList.add('has-information')
  const button = document.createElement('button')
  button.className = 'deep-review-button'
  button.innerHTML = '<span>Information</span><strong>Open the full workspace →</strong>'
  button.addEventListener('click', openOverlay)
  row.appendChild(button)
}

const observer = new MutationObserver(ensureButton)
observer.observe(document.documentElement, { subtree: true, childList: true })
window.addEventListener('popstate', () => setTimeout(ensureButton, 0))
window.addEventListener('load', ensureButton)
ensureButton()
