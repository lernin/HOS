const endpoint = 'https://jzaghifuhinkzzhiojre.supabase.co'
const publicKey = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'

export class ReaderError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status } }
export async function readerRpc<T = any>(pin: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${endpoint}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, ...args }), cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  const data = await response.json() as any
  if (!response.ok) throw new ReaderError(data.code === '28000' ? 'Incorrect Lab password.' : data.code === '40001' ? 'This field changed elsewhere. Close and reopen it before saving.' : data.message || 'The request failed.', data.code === '28000' ? 401 : data.code === '40001' ? 409 : 400)
  return data
}
