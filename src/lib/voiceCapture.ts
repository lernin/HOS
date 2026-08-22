export type RecordingSession = {
  stop: () => void
  blobPromise: Promise<Blob>
}

type RecordingOptions = { keepStreamAlive?: boolean }
let reusableStream: MediaStream | null = null

function preferredMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  return candidates.find(type => MediaRecorder.isTypeSupported(type))
}

export function releaseRecordingStream() {
  reusableStream?.getTracks().forEach(track => track.stop())
  reusableStream = null
}

export async function startRecordingSession(options: RecordingOptions = {}): Promise<RecordingSession> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Audio recording is not supported by this browser.')
  }

  const reusableIsLive = reusableStream?.getAudioTracks().some(track => track.readyState === 'live')
  const stream = options.keepStreamAlive && reusableIsLive
    ? reusableStream!
    : await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  if (options.keepStreamAlive) reusableStream = stream

  const mimeType = preferredMimeType()
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  let stopped = false

  const blobPromise = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('dataavailable', event => {
      if (event.data.size) chunks.push(event.data)
    })
    recorder.addEventListener('error', event => {
      if (options.keepStreamAlive) releaseRecordingStream()
      else stream.getTracks().forEach(track => track.stop())
      reject(new Error((event as ErrorEvent).message || 'The recording failed.'))
    })
    recorder.addEventListener('stop', () => {
      if (!options.keepStreamAlive) stream.getTracks().forEach(track => track.stop())
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
