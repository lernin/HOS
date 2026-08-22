export type RecordingSession = {
  stop: () => void
  blobPromise: Promise<Blob>
}

function preferredMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  return candidates.find(type => MediaRecorder.isTypeSupported(type))
}

export async function startRecordingSession(): Promise<RecordingSession> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Audio recording is not supported by this browser.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  const mimeType = preferredMimeType()
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  let stopped = false

  const blobPromise = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('dataavailable', event => {
      if (event.data.size) chunks.push(event.data)
    })
    recorder.addEventListener('error', event => {
      stream.getTracks().forEach(track => track.stop())
      reject(new Error((event as ErrorEvent).message || 'The recording failed.'))
    })
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach(track => track.stop())
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
    })
  })

  recorder.start(1000)

  return {
    stop() {
      if (stopped) return
      stopped = true
      if (recorder.state !== 'inactive') recorder.stop()
    },
    blobPromise,
  }
}
