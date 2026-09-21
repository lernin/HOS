  function bindCanvasGestures(_canvas) {
    // Retired. Old tap-vs-pan capture raced the v162 layer. Header-mic voice stays below.
  }

  function bindSpawnGestures(_puck) {
    // Retired. Spawn-puck auto-voice raced direct-flick createRelative.
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

  attach('gestures', {
    constants: null,
    bindCanvas: bindCanvasGestures,
    bindSpawn: bindSpawnGestures,
    startVoiceCapture,
    stopVoiceCapture,
  });
