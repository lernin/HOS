  function beginCanvasPointer(event) {
    if (!isPhoneUi() || event.target.closest?.('g.node.is-outlined')) return
    app.canvasPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      started: performance.now(),
      moved: false,
      multi: app.canvasPointers.size > 0,
    })
    if (app.canvasPointers.size > 1) app.canvasPointers.forEach((pointer) => { pointer.multi = true })
  }

  function moveCanvasPointer(event) {
    const pointer = app.canvasPointers.get(event.pointerId)
    if (!pointer) return
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 9) pointer.moved = true
  }

  function finishCanvasPointer(event) {
    const pointer = app.canvasPointers.get(event.pointerId)
    app.canvasPointers.delete(event.pointerId)
    if (!pointer || pointer.multi || pointer.moved || performance.now() - pointer.started > 450) return
    const candidates = Array.from(document.querySelectorAll('g.node')).filter((node) => {
      const rect = node.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return ar.width * ar.height - br.width * br.height
    })
    const uid = candidates[0]?.__data__?.data?._uid
    if (uid) bridge.selectByUid(uid)
    else bridge.clearFocusSelection()
    requestAnimationFrame(updateContextActions)
  }

  function cancelCanvasPointer(event) {
    app.canvasPointers.delete(event.pointerId)
  }

  function directionFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
    return dy < 0 ? 'up' : 'down'
  }

  function directionLabel(direction) {
    return ({ up: '↑ Insert parent', left: '← Older sibling', down: '↓ Add child', right: 'Younger sibling →' })[direction]
  }

  function beginSpawnGesture(event) {
    if (app.recorder || !bridge.getSelectedUid()) return
    event.preventDefault()
    try { ui.spawnPuck.setPointerCapture?.(event.pointerId) } catch (_error) {}
    app.spawnGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now(), direction: null }
    ui.spawnPuck.classList.add('is-dragging')
  }

  function moveSpawnGesture(event) {
    const gesture = app.spawnGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    const distance = Math.hypot(dx, dy)
    if (distance < 22) return
    gesture.direction = directionFromDelta(dx, dy)
    ui.spawnGhost.textContent = directionLabel(gesture.direction)
    ui.spawnGhost.style.left = `${event.clientX}px`
    ui.spawnGhost.style.top = `${event.clientY}px`
    ui.spawnGhost.classList.add('is-visible')
    if (!gesture.threshold && distance >= 48) {
      gesture.threshold = true
      navigator.vibrate?.(18)
    }
  }

  async function finishSpawnGesture(event) {
    const gesture = app.spawnGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y)
    const elapsed = performance.now() - gesture.started
    const direction = gesture.direction
    cancelSpawnGesture()
    if (!direction || distance < 48 || elapsed > 850) {
      showMobileToast('Flick the + toward parent, sibling, or child')
      return
    }
    const uid = bridge.createRelative(direction)
    if (!uid) {
      showMobileToast(direction === 'up' || direction === 'left' || direction === 'right' ? 'The root card cannot have a sibling or inserted parent' : 'Could not create card')
      return
    }
    requestAnimationFrame(updateContextActions)
    await startVoiceCapture(uid)
  }

  function cancelSpawnGesture() {
    app.spawnGesture = null
    ui.spawnPuck.classList.remove('is-dragging')
    ui.spawnGhost.classList.remove('is-visible')
  }

  function showMobileToast(message) {
    const toast = document.getElementById('Toast')
    if (!toast) return
    toast.textContent = message
    toast.style.display = 'inline-flex'
    clearTimeout(showMobileToast.timer)
    showMobileToast.timer = setTimeout(() => { toast.style.display = 'none' }, 1800)
  }

  async function startVoiceCapture(uid) {
    if (app.recorder) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showMobileToast('Voice capture is not available in this browser')
      if (uid) bridge.editSelected({ wipe: true })
      return
    }
    const pin = await getPin(true)
    if (!pin) {
      if (uid) bridge.editSelected({ wipe: true })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      app.recorder = recorder
      app.recordingStream = stream
      app.recordingChunks = []
      app.recordingUid = uid
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) app.recordingChunks.push(event.data) })
      recorder.addEventListener('stop', transcribeRecording, { once: true })
      recorder.start()
      ui.voiceStatus.textContent = uid ? 'Listening for card…' : 'Listening…'
      ui.voiceBar.classList.add('is-visible')
    } catch (_error) {
      showMobileToast('Microphone permission is needed for voice entry')
      if (uid) bridge.editSelected({ wipe: true })
    }
  }

  function stopVoiceCapture() {
    if (!app.recorder || app.recorder.state === 'inactive') return
    ui.voiceStatus.textContent = 'Transcribing…'
    app.recorder.stop()
  }

  async function transcribeRecording() {
    const uid = app.recordingUid
    const recorder = app.recorder
    const chunks = app.recordingChunks.slice()
    app.recordingStream?.getTracks?.().forEach((track) => track.stop())
    app.recorder = null
    app.recordingStream = null
    app.recordingChunks = []
    app.recordingUid = null
    try {
      const audio = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      const form = new FormData()
      form.append('audio', audio, 'logyq-card.webm')
      const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'x-review-pin': await getPin(false) }, body: form })
      const result = await response.json()
      if (!response.ok || !result?.text?.trim()) throw new Error(result?.error || 'No speech detected')
      const text = result.text.trim()
      if (uid) bridge.renameNode(uid, text)
      else {
        ui.mobileInput.value = text
        ui.mobileInput.focus()
      }
      showMobileToast(uid ? `Added “${text}”` : 'Voice text ready')
    } catch (_error) {
      showMobileToast('Could not transcribe. Type the card instead.')
      if (uid) bridge.editSelected({ wipe: true })
    } finally {
      ui.voiceBar.classList.remove('is-visible')
      requestAnimationFrame(updateContextActions)
    }
  }

