/* LOGYQ development learner context.
   Lab uses synthetic learner UUIDs; Procedia can later supply a real person UUID through the same API. */
(() => {
  'use strict'

  const BASE = 'https://jzaghifuhinkzzhiojre.supabase.co'
  const API = BASE + '/functions/v1/logyq-learning'
  const LEARNER_KEY = 'logyq_dev_learner_v1'
  const PIN_KEYS = ['logyq_lab_pin', 'logyq_lab_pin_v1']
  const GAME_KEY = 'logyq_game_progress_v2'
  const CURRICULUM_KEY = 'logyq_curriculum_progress_v1'
  const GRADE_LABELS = ['1','2','3A','3B','3C','4A','4B','4C','5A','5B','5C','6']
  let learner = readJson(LEARNER_KEY, null)
  let attempts = []
  let loading = null

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null')
      return value ?? fallback
    } catch (_error) {
      return fallback
    }
  }
  function saveLearner(value) {
    learner = value || null
    try {
      if (learner) localStorage.setItem(LEARNER_KEY, JSON.stringify(learner))
      else localStorage.removeItem(LEARNER_KEY)
    } catch (_error) {}
    render()
    window.dispatchEvent(new CustomEvent('logyq-learner-updated', { detail: learner }))
    return learner
  }
  function pin({ promptIfMissing = false } = {}) {
    for (const key of PIN_KEYS) {
      try {
        const value = localStorage.getItem(key)
        if (value) return value
      } catch (_error) {}
    }
    if (!promptIfMissing) return ''
    const value = window.prompt?.('Lab PIN') || ''
    if (value) {
      try {
        localStorage.setItem(PIN_KEYS[0], value)
        localStorage.setItem(PIN_KEYS[1], value)
      } catch (_error) {}
    }
    return value
  }
  async function call(body, { promptIfMissing = false } = {}) {
    const reviewPin = pin({ promptIfMissing })
    if (!reviewPin) throw new Error('Lab PIN required')
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-review-pin': reviewPin },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      for (const key of PIN_KEYS) {
        try { localStorage.removeItem(key) } catch (_error) {}
      }
      throw new Error('Wrong Lab PIN')
    }
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Learning service failed')
    return data
  }
  function gradeLabel(index = learner?.game_grade_index || 1) {
    return GRADE_LABELS[Math.max(0, Math.min(GRADE_LABELS.length - 1, Number(index || 1) - 1))]
  }
  function clearLocalLearning() {
    try {
      localStorage.removeItem(GAME_KEY)
      localStorage.removeItem(CURRICULUM_KEY)
    } catch (_error) {}
  }
  async function refresh() {
    if (!learner?.id || !pin()) return learner
    if (loading) return loading
    loading = call({ action: 'get_learner', learner_id: learner.id })
      .then((data) => {
        attempts = Array.isArray(data.attempts) ? data.attempts : []
        return saveLearner(data.learner)
      })
      .catch(() => learner)
      .finally(() => { loading = null })
    return loading
  }
  async function ensure({ promptIfMissing = true } = {}) {
    if (learner?.id) return learner
    const data = await call({ action: 'create_learner' }, { promptIfMissing })
    attempts = []
    return saveLearner(data.learner)
  }
  async function createNew() {
    const data = await call({ action: 'create_learner' }, { promptIfMissing: true })
    clearLocalLearning()
    attempts = []
    saveLearner(data.learner)
    window.location.reload()
    return data.learner
  }
  async function resetCurrent() {
    const current = await ensure({ promptIfMissing: true })
    if (!window.confirm?.('Reset this tester to a completely fresh Curriculum and Game state?')) return current
    const data = await call({ action: 'reset_learner', learner_id: current.id }, { promptIfMissing: true })
    clearLocalLearning()
    attempts = []
    saveLearner(data.learner)
    window.location.reload()
    return data.learner
  }
  async function recordGame(payload = {}) {
    const current = await ensure({ promptIfMissing: true })
    const data = await call({ action: 'record_game', learner_id: current.id, ...payload }, { promptIfMissing: true })
    if (data.attempt) attempts = [data.attempt, ...attempts].slice(0, 12)
    saveLearner(data.learner)
    return data
  }
  async function recordCurriculum(payload = {}) {
    const current = await ensure({ promptIfMissing: true })
    const data = await call({ action: 'record_curriculum', learner_id: current.id, ...payload }, { promptIfMissing: true })
    if (data.attempt) attempts = [data.attempt, ...attempts].slice(0, 12)
    saveLearner(data.learner)
    return data
  }

  function percent(value) {
    const n = Number(value)
    return Number.isFinite(n) ? Math.round(n * 100) + '%' : '—'
  }
  function ensureUi() {
    if (document.getElementById('logyq-tester-pill')) return
    const pill = document.createElement('button')
    pill.type = 'button'
    pill.id = 'logyq-tester-pill'
    pill.setAttribute('aria-haspopup', 'dialog')
    document.body.appendChild(pill)

    const panel = document.createElement('div')
    panel.id = 'logyq-tester-panel'
    panel.hidden = true
    panel.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="logyq-tester-title">
        <header><h2 id="logyq-tester-title">Test learner</h2><button type="button" data-close aria-label="Close">×</button></header>
        <div id="logyq-tester-summary"></div>
        <div class="logyq-tester-actions">
          <button type="button" data-new>New tester</button>
          <button type="button" data-reset>Reset current</button>
        </div>
        <div id="logyq-tester-recent"></div>
      </section>`
    document.body.appendChild(panel)

    const style = document.createElement('style')
    style.textContent = `
      #logyq-tester-pill{position:fixed;z-index:4700;right:12px;top:max(68px,calc(env(safe-area-inset-top) + 58px));min-height:34px;padding:0 12px;border:1px solid #cbd5e1;border-radius:999px;background:rgba(255,255,255,.94);color:#334155;box-shadow:0 4px 14px rgba(15,23,42,.1);font:700 12px/1 system-ui}
      body:not(.logyq-home) #logyq-tester-pill{display:none}
      #logyq-tester-panel{position:fixed;inset:0;z-index:7000;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.35);backdrop-filter:blur(8px)}
      #logyq-tester-panel[hidden]{display:none!important}
      #logyq-tester-panel>section{box-sizing:border-box;width:min(390px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:18px;border-radius:22px;background:#fff;color:#0f172a;box-shadow:0 24px 70px rgba(15,23,42,.28);font:14px/1.35 system-ui}
      #logyq-tester-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px}
      #logyq-tester-panel h2{margin:0;font-size:21px}
      #logyq-tester-panel header button{width:38px;height:38px;border:0;border-radius:11px;background:#f1f5f9;font-size:24px}
      #logyq-tester-summary{margin:14px 0;padding:13px;border-radius:15px;background:#f8fafc}
      #logyq-tester-summary strong{font-size:18px}.logyq-tester-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.logyq-tester-metrics span{display:grid;gap:2px;padding:8px;border-radius:11px;background:#fff;text-align:center}.logyq-tester-metrics b{font-size:15px}
      .logyq-tester-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.logyq-tester-actions button{min-height:44px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;font-weight:750}.logyq-tester-actions [data-new]{background:#0f172a;color:#fff;border-color:#0f172a}
      #logyq-tester-recent{margin-top:14px;color:#64748b;font-size:12px}.logyq-tester-attempt{padding:7px 0;border-top:1px solid #e2e8f0}
    `
    document.head.appendChild(style)

    pill.addEventListener('click', async () => {
      panel.hidden = false
      await refresh()
      render()
    })
    panel.addEventListener('click', (event) => {
      if (event.target === panel || event.target.closest('[data-close]')) panel.hidden = true
    })
    panel.querySelector('[data-new]')?.addEventListener('click', () => createNew().catch(error => alert(error.message)))
    panel.querySelector('[data-reset]')?.addEventListener('click', () => resetCurrent().catch(error => alert(error.message)))
  }
  function render() {
    ensureUi()
    const pill = document.getElementById('logyq-tester-pill')
    const summary = document.getElementById('logyq-tester-summary')
    const recent = document.getElementById('logyq-tester-recent')
    if (pill) pill.textContent = learner ? `Tester ${learner.lab_number} · ${gradeLabel()}` : 'Start tester'
    if (summary) {
      if (!learner) {
        summary.innerHTML = '<strong>No tester yet</strong><p>Start a fresh synthetic learner before handing the phone to a child.</p>'
      } else {
        summary.innerHTML = `
          <strong>Tester ${learner.lab_number}</strong>
          <div>Game grade <b>${gradeLabel()}</b> · Curriculum stage <b>${learner.curriculum_stage}</b></div>
          <div class="logyq-tester-metrics">
            <span><small>Efficiency</small><b>${percent(learner.recent_efficiency)}</b></span>
            <span><small>Success</small><b>${percent(learner.recent_success_rate)}</b></span>
            <span><small>Hints</small><b>${Number.isFinite(Number(learner.recent_hint_rate)) ? Number(learner.recent_hint_rate).toFixed(1) : '—'}</b></span>
          </div>`
      }
    }
    if (recent) {
      recent.innerHTML = attempts.length
        ? '<strong>Recent evidence</strong>' + attempts.slice(0, 6).map(row => {
            const moves = row.minimum_moves == null ? `${row.actual_moves} moves` : `${row.actual_moves}/${row.minimum_moves} moves`
            return `<div class="logyq-tester-attempt">${row.mode} · ${row.item_id} · ${row.solved ? 'solved' : 'attempt'} · ${moves} · ${row.hints_used || 0} hints</div>`
          }).join('')
        : '<span>No attempts recorded yet.</span>'
    }
  }

  ensureUi()
  render()
  if (learner?.id && pin()) refresh()

  window.LOGYQLearner = Object.freeze({
    current: () => learner,
    attempts: () => attempts.slice(),
    gradeIndex: () => Math.max(1, Number(learner?.game_grade_index || 1)),
    gradeLabel,
    curriculumStage: () => Math.max(1, Number(learner?.curriculum_stage || 1)),
    ensure,
    refresh,
    createNew,
    resetCurrent,
    recordGame,
    recordCurriculum,
  })
})()
