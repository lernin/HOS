import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jzaghifuhinkzzhiojre.supabase.co'
const supabasePublishableKey = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'

const PERSON_ID_KEY = 'procedia_person_id'
const DEVICE_ID_KEY = 'procedia_device_id'

const procediaHeaderFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers || {})
  try {
    const personId = localStorage.getItem(PERSON_ID_KEY) || ''
    const deviceId = localStorage.getItem(DEVICE_ID_KEY) || ''
    if (personId) headers.set('x-person-id', personId)
    if (deviceId) headers.set('x-device-id', deviceId)
  } catch {
    // Ignore localStorage failures and send the request without extra headers.
  }
  const requestUrl = input instanceof Request ? input.url : String(input)
  const isViewerRead = new URL(requestUrl).pathname === '/rest/v1/thekonyms'
  return fetch(input, { ...init, headers, ...(isViewerRead ? { cache: 'no-store' as const } : {}) })
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  global: {
    fetch: procediaHeaderFetch,
  },
})
