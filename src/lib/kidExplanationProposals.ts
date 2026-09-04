import type { Confidence, EditProposal, ThekonymRecord } from './thekonymViewer'

export type KidProposals = { options: string[]; nomination: number | null; reason: string }

// Only recognize the explicit proposal format. Ordinary numbered explanations stay intact.
export function parseKidProposals(value: string | null | undefined): KidProposals | null {
  if (!value) return null
  const text = value.replace(/\r\n?/g, '\n').trim()
  const heading = /^Proposed explanations\s*:?[ \t]*\n+/i.exec(text)
  if (!heading) return null
  const body = text.slice(heading[0].length)
  const nominationStart = /^Nomination\s*:/im.exec(body)
  const optionsText = nominationStart ? body.slice(0, nominationStart.index).trim() : body
  const starts = [...optionsText.matchAll(/^(\d+)\.[ \t]+/gm)]
  if (starts.length < 2 || starts.length > 20 || starts[0].index !== 0) return null
  if (starts.some((match, i) => Number(match[1]) !== i + 1)) return null
  const options = starts.map((match, i) => optionsText.slice(match.index! + match[0].length, starts[i + 1]?.index ?? optionsText.length).trim())
  if (options.some(option => !option)) return null
  const nominationText = nominationStart ? body.slice(nominationStart.index) : ''
  const nomination = /^Nomination\s*:\s*#?(\d+)\.?[ \t]*(?:\n|$)([\s\S]*)$/i.exec(nominationText)
  // Never silently discard an unrecognized nomination or trailing text.
  if (nominationStart && !nomination) return null
  const number = nomination ? Number(nomination[1]) : null
  if (number !== null && (number < 1 || number > options.length)) return null
  return { options, nomination: number, reason: nomination?.[2].trim() || '' }
}

export function kidChoiceEdit(record: ThekonymRecord, selected: number | null, confidence: Confidence): EditProposal {
  const proposals = parseKidProposals(record.kid_explanation)
  if (!proposals || selected === null || !Number.isInteger(selected) || selected < 0 || selected >= proposals.options.length) throw new Error('Choose an explanation first.')
  if (confidence === null || !Number.isInteger(confidence) || confidence < 0 || confidence > 3) throw new Error('Choose confidence 0, 1, 2, or 3.')
  return {
    changes: { kid_explanation: proposals.options[selected], kid_explanation_confidence: confidence },
    expected: { kid_explanation: record.kid_explanation, kid_explanation_confidence: record.kid_explanation_confidence ?? null },
    summary: `Ashley selected kid explanation ${selected + 1} and confidence ${confidence}.`,
  }
}
