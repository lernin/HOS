export type RoyAudioJob = {
  id: string
  itemIndex: number
  createdAt: number
  attempts: number
  transcriptionMode?: 'openai-mini' | 'openai-full'
  blob: Blob
}

const DATABASE = 'roy-vocabulary'
const STORE = 'audio-jobs'

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('itemIndex', 'itemIndex', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error || new Error('Could not open the local recording queue.')))
  })
}

function finishTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('The local recording queue was interrupted.')))
    transaction.addEventListener('error', () => reject(transaction.error || new Error('Could not update the local recording queue.')))
  })
}

export async function listRoyAudioJobs() {
  const database = await openQueue()
  try {
    const transaction = database.transaction(STORE, 'readonly')
    const done = finishTransaction(transaction)
    const request = transaction.objectStore(STORE).getAll()
    const jobs = await new Promise<RoyAudioJob[]>((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result as RoyAudioJob[]))
      request.addEventListener('error', () => reject(request.error || new Error('Could not read saved recordings.')))
    })
    await done
    return jobs.sort((a, b) => a.createdAt - b.createdAt)
  } finally {
    database.close()
  }
}

export async function saveRoyAudioJob(job: RoyAudioJob) {
  const database = await openQueue()
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    const done = finishTransaction(transaction)
    const store = transaction.objectStore(STORE)
    const existingRequest = store.index('itemIndex').getAllKeys(job.itemIndex)
    const existingKeys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      existingRequest.addEventListener('success', () => resolve(existingRequest.result))
      existingRequest.addEventListener('error', () => reject(existingRequest.error || new Error('Could not check saved recordings.')))
    })
    existingKeys.forEach(key => store.delete(key))
    store.put(job)
    await done
  } finally {
    database.close()
  }
}

export async function updateRoyAudioJob(job: RoyAudioJob) {
  const database = await openQueue()
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    const done = finishTransaction(transaction)
    transaction.objectStore(STORE).put(job)
    await done
  } finally {
    database.close()
  }
}

export async function deleteRoyAudioJob(id: string) {
  const database = await openQueue()
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    const done = finishTransaction(transaction)
    transaction.objectStore(STORE).delete(id)
    await done
  } finally {
    database.close()
  }
}

export async function clearRoyAudioJobs() {
  const database = await openQueue()
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    const done = finishTransaction(transaction)
    transaction.objectStore(STORE).clear()
    await done
  } finally {
    database.close()
  }
}
