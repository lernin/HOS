(() => {
  'use strict'

  const frame = document.getElementById('app')
  if (!frame) return

  const SESSION_PIN_KEY = 'logiq_lab_pin_v1'
  const DEVICE_PIN_KEY = 'logiq_owner_device_pin_v1'

  frame.addEventListener('load', () => {
    const win = frame.contentWindow
    const doc = frame.contentDocument
    if (!win || !doc) return

    const sessionPin = win.sessionStorage.getItem(SESSION_PIN_KEY)
    const devicePin = win.localStorage.getItem(DEVICE_PIN_KEY)

    // Promote an already-authenticated browser session to a remembered owner device.
    if (sessionPin && !devicePin) win.localStorage.setItem(DEVICE_PIN_KEY, sessionPin)
    if (!sessionPin && devicePin) win.sessionStorage.setItem(SESSION_PIN_KEY, devicePin)

    // If the backend rejects a remembered owner PIN, clear the remembered copy too.
    if (!win.__logiqOwnerStoragePatch) {
      win.__logiqOwnerStoragePatch = true
      const nativeRemove = win.Storage.prototype.removeItem
      win.Storage.prototype.removeItem = function removeItem(key) {
        const result = nativeRemove.call(this, key)
        if (this === win.sessionStorage && key === SESSION_PIN_KEY) {
          nativeRemove.call(win.localStorage, DEVICE_PIN_KEY)
        }
        return result
      }
    }

    const form = doc.getElementById('logiq-pin-form')
    const input = doc.getElementById('logiq-pin-input')
    const panel = doc.getElementById('logiq-pin')
    if (!form || !input || !panel) return

    // This is an owner code, not a website password. Do not invoke password managers.
    form.setAttribute('autocomplete', 'off')
    input.type = 'text'
    input.inputMode = 'numeric'
    input.autocomplete = 'off'
    input.name = 'logiq-owner-code'
    input.pattern = '[0-9]*'
    input.maxLength = 12
    input.setAttribute('autocapitalize', 'off')
    input.setAttribute('spellcheck', 'false')
    input.setAttribute('data-lpignore', 'true')
    input.setAttribute('data-1p-ignore', 'true')

    const title = form.querySelector('h2')
    const copy = form.querySelector('p')
    if (title) title.textContent = 'Owner access'
    if (copy) copy.textContent = 'Enter the owner PIN once on this device. Paper will remember this device.'

    const persistSession = () => {
      const value = win.sessionStorage.getItem(SESSION_PIN_KEY)
      if (value) win.localStorage.setItem(DEVICE_PIN_KEY, value)
    }

    // Base LOGiQ stores the accepted value in sessionStorage. Persist it after that handler runs.
    form.addEventListener('submit', () => win.setTimeout(persistSession, 0))
    new win.MutationObserver(() => {
      if (!panel.classList.contains('is-open')) persistSession()
    }).observe(panel, { attributes: true, attributeFilter: ['class'] })

    win.LOGiQOwnerDevice = Object.freeze({
      remembered: () => !!win.localStorage.getItem(DEVICE_PIN_KEY),
      forget: () => {
        win.localStorage.removeItem(DEVICE_PIN_KEY)
        win.sessionStorage.removeItem(SESSION_PIN_KEY)
      },
    })
  })
})()
