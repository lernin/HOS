const SUPABASE_URL = 'https://jzaghifuhinkzzhiojre.supabase.co'
const SUPABASE_KEY = 'sb_publishable_rQDzA5bYlbzvaTjyo-uTXw_LiiIAddI'

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  })
}

async function readTable(path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Curriculum read failed (${response.status}): ${message.slice(0, 180)}`)
  }
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('Curriculum response was not a list.')
  return payload
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return json({ message: 'Method not allowed.' }, 405)
    try {
      const [levels, nodes, lexonyms] = await Promise.all([
        readTable('logiq_word_curriculum_levels?select=id,level_key,sequence,band,title,relation_family,relation_code,guide_direction,pedagogical_focus,difficulty_score,difficulty_features&is_active=eq.true&is_curated=eq.true&order=sequence.asc'),
        readTable('logiq_word_curriculum_nodes?select=id,level_id,node_key,parent_node_key,sibling_order,lexonym_id,relation_code,starts_on_board,bank_order&order=level_id.asc,sibling_order.asc,bank_order.asc.nullsfirst'),
        readTable('logiq_word_curriculum_lexonyms?select=id,lexonym_key,surface,atomonym_id,inflection_eclogonym_id,translation_ko,gloss_en&status=eq.active'),
      ])
      return Response.json({ levels, nodes, lexonyms }, {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
      })
    } catch (error) {
      return json({ message: error instanceof Error ? error.message : 'Could not load curriculum.' }, 503)
    }
  },
}
