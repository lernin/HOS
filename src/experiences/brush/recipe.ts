type RecipeTag = { label: string, likes: number, bads: number, status: string }
type RecipeAttribute = { trait: string, value: string, wins: number, games: number }
type TurnOff = { label: string, images: number }

export function suggestRecipe(input: {
  tags: RecipeTag[]
  attributes: RecipeAttribute[]
  turnOffs?: TurnOff[]
}) {
  const live = input.tags.filter(tag => tag.status === 'live')
  const loved = live
    .filter(tag => tag.likes > tag.bads && tag.likes > 0)
    .sort((a, b) => (b.likes - b.bads) - (a.likes - a.bads))
    .slice(0, 8)
  const strong = input.attributes
    .filter(attribute => attribute.games >= 2 && attribute.wins / attribute.games >= 0.6)
    .sort((a, b) => b.wins / b.games - a.wins / a.games)
    .slice(0, 6)
  const turnOffs = (input.turnOffs || [])
    .filter(tag => tag.images > 0)
    .slice(0, 6)

  const lines = [
    'Suggested portrait recipe for Ashley to review.',
    'This is a suggestion only. Brush does not generate an image.',
    '',
    'One person, face visible, vertical 9:16 frame. Describe hair and light before the dress and the room.',
  ]
  if (loved.length) lines.push(`Lean into: ${loved.map(tag => tag.label).join(', ')}.`)
  else lines.push('Lean into the traits that pull ahead once a few contests are in. Nothing has separated yet.')
  if (strong.length) lines.push(`Attributes on images that win: ${strong.map(attribute => `${attribute.trait} (${attribute.value})`).join(', ')}.`)
  if (turnOffs.length) lines.push(`Turn away from: ${turnOffs.map(tag => tag.label).join(', ')}.`)
  return lines.join('\n')
}
