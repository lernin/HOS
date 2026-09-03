import { readerRpc } from './thekonym-data.js'

const repository = 'lernin/Procedia'
const token = () => process.env.PROCEDIA_GITHUB_TOKEN || process.env.GITHUB_TOKEN
export const githubConfigured = () => Boolean(token())
export async function github(path: string, method = 'GET', body?: unknown): Promise<any> {
  if (!token()) throw new Error('GitHub access has not been connected to this app.')
  const r = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    method, headers: { Authorization: `Bearer ${token()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000), cache: 'no-store',
  })
  if (!r.ok) throw new Error(`GitHub request failed (${r.status}).`)
  return r.json()
}
export async function readGithubDocument(path: string) {
  if (!(path === 'AGENTS.md' || path.startsWith('docs/')) || path.includes('..') || !path.endsWith('.md')) throw new Error('Only Procedia documentation can be read here.')
  const file = await github(`contents/${path.split('/').map(encodeURIComponent).join('/')}`)
  if (file.type !== 'file' || file.size > 150000) throw new Error('Choose a smaller document.')
  return { path, url: file.html_url, content: Buffer.from(file.content, 'base64').toString('utf8') }
}
export async function searchGithubDocuments(query: string) {
  const tree = await github('git/trees/main?recursive=1')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return tree.tree.filter((f: { path: string; type: string }) => f.type === 'blob' && f.path.startsWith('docs/') && f.path.endsWith('.md') && words.some(w => f.path.toLowerCase().includes(w))).slice(0, 30).map((f: { path: string }) => f.path)
}

// Only accepted database edits are publishable. The full before/after remains in the private audit table.
export async function syncEditLog(pin: string, eventId: string) {
  if (!githubConfigured()) return { status: 'pending', message: 'Saved in Supabase. GitHub follow-up is queued in your AI work list.' }
  try {
    const events = await readerRpc(pin, 'lab_thekonym_edit_log', { event_id: eventId })
    const event = events[0]
    if (!event) throw new Error('Edit log not found.')
    if (event.github_status === 'synced') return { status: 'synced', url: event.github_url }
    const branch = `lab/thekonym-edit-${event.id}`
    const marker = `<!-- lab-thekonym-edit:${event.id} -->`
    const docPath = 'docs/operations/ACTIVITY_LOG.md'
    const main = await github('git/ref/heads/main')
    const file = await github(`contents/${docPath}?ref=${main.object.sha}`)
    const original = Buffer.from(file.content, 'base64').toString('utf8')
    if (original.includes(marker)) {
      const url = `https://github.com/${repository}/commit/${main.object.sha}`
      await readerRpc(pin, 'lab_thekonym_edit_log', { event_id: event.id, synced_url: url })
      return { status: 'synced', url }
    }
    // Recover a previously created branch/PR after an interrupted request.
    const existing = await github(`pulls?state=all&head=lernin:${encodeURIComponent(branch)}`)
    let pr = existing[0]
    if (!pr) {
      try { await github('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: main.object.sha }) }
      catch { await github(`git/ref/heads/${branch}`) }
      const branchFile = await github(`contents/${docPath}?ref=${encodeURIComponent(branch)}`)
      const branchText = Buffer.from(branchFile.content, 'base64').toString('utf8')
      const fields = Object.keys(event.after_values).join(', ')
      const safeTerm = String(event.term).replace(/[\r\n#<>]/g, ' ').slice(0, 120)
      const entry = `${marker}\n### ${new Date(event.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })} KST — ${safeTerm} reviewed in The Lab\n\n**Context:** Ashley accepted a field edit in the Thekonym viewer.\n\n**Outcome:** Updated ${fields}. Exact before/after values and the decision note are retained in the private Supabase audit record.\n\n**Where:** production public.thekonyms, record ${event.term_id}; edit ${event.id}.\n\n**Next:** None.\n\n`
      if (!branchText.includes(marker)) {
        const content = branchText.includes('## Entries\n') ? branchText.replace('## Entries\n', `## Entries\n\n${entry}`) : `${branchText}\n${entry}`
        await github(`contents/${docPath}`, 'PUT', { branch, sha: branchFile.sha, message: `Log accepted ${safeTerm} edit`, content: Buffer.from(content).toString('base64') })
      }
      pr = await github('pulls', 'POST', { head: branch, base: 'main', title: `Log accepted ${safeTerm} edit`, body: `Records the user-approved viewer edit ${event.id}. Full before/after remains in the private database audit. No conceptual source documents are rewritten.` })
    }
    if (!pr.merged_at) { const merged = await github(`pulls/${pr.number}/merge`, 'PUT', { sha: pr.head.sha, merge_method: 'squash' }); if (!merged.merged) throw new Error('GitHub log awaits merge.') }
    await readerRpc(pin, 'lab_thekonym_edit_log', { event_id: event.id, synced_url: pr.html_url })
    return { status: 'synced', url: pr.html_url }
  } catch {
    return { status: 'pending', message: 'Saved in Supabase. GitHub follow-up is queued in your AI work list.' }
  }
}
