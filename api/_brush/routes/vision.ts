import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'
import { rpc } from '../db.ts'
import { downloadPreview } from '../drive.ts'
import { cleanDetail, json, parseJson, pins } from '../http.ts'

const MODEL = 'openai/gpt-4o-mini'

type Tag = { category: string, label: string, status: string }
type Focus = { category?: string, label?: string }
type Suggestion = { category: string, label: string }

function asSuggestions(value: unknown): Suggestion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const record = item as { category?: unknown, label?: unknown }
    const category = String(record.category || 'Other').trim()
    const label = String(record.label || '').trim()
    return category && label ? [{ category, label }] : []
  }).slice(0, 8)
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const { lab, brush } = pins(request)
    try {
      const body = await request.json() as { imageId?: string, focus?: Focus }
      const imageId = String(body.imageId || '')
      if (!imageId) return json({ error: 'Choose an image to tag.' }, 400)
      const detail = await rpc<{ image: { drive_file_id: string }, attributes: unknown }>('brush_image_detail', {
        lab_pin: lab, brush_pin: brush, image_id: imageId,
      })
      const tags = await rpc<Tag[]>('brush_tags', { lab_pin: lab, brush_pin: brush })
      const live = tags.filter(tag => tag.status === 'live')
      const image = await downloadPreview(detail.image.drive_file_id)
      const mediaType = image.mediaType.startsWith('image/png') ? 'image/png' : image.mediaType.startsWith('image/webp') ? 'image/webp' : 'image/jpeg'
      const focusLabel = body.focus?.label?.trim()
      const listed = live.map(tag => `- ${tag.category}: ${tag.label}`).join('\n')
      const prompt = focusLabel
        ? [
          'Judge one portrait trait for a private taste study.',
          `Trait: ${body.focus?.category || 'Other'} / ${focusLabel}`,
          'Return ONLY JSON: {"present":true,"value":"short phrase","confidence":0.8,"suggested_tags":[{"category":"Hair","label":"new trait"}]}',
          'present is true only when that trait is visibly relevant. value says what you see.',
          'If you notice a different beauty trait that is not in the live list, add it under suggested_tags.',
          'Do not repeat a live label as a suggestion. Do not generate an image.',
          '',
          'Live traits:',
          listed,
        ].join('\n')
        : [
          'Describe one portrait for a private taste study.',
          'Return ONLY JSON: {"attributes":[{"trait":"exact live label","value":"short phrase","confidence":0.8}],"suggested_tags":[{"category":"Hair","label":"new trait"}]}',
          'attributes.trait must be copied exactly from the live list. Omit traits you cannot see.',
          'If you notice a beauty-relevant trait that is NOT in the live list, put it only in suggested_tags.',
          'Do not generate an image.',
          '',
          'Live traits:',
          listed,
        ].join('\n')

      const result = await generateText({
        model: gateway(MODEL),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'file', data: image.bytes, mediaType },
          ],
        }],
      })
      const parsed = parseJson(result.text)
      const suggestions = asSuggestions(parsed.suggested_tags)
      const known = new Set(tags.map(tag => tag.label.toLowerCase()))
      let suggested = 0
      for (const item of suggestions) {
        if (known.has(item.label.toLowerCase())) continue
        const saved = await rpc<{ created: boolean }>('brush_suggest_tag', {
          lab_pin: lab, brush_pin: brush, category: item.category, label: item.label, tag_source: 'ai',
        })
        if (saved.created) suggested += 1
        known.add(item.label.toLowerCase())
      }

      if (focusLabel) {
        if (parsed.present === true && String(parsed.value || '').trim()) {
          await rpc('brush_upsert_attribute', {
            lab_pin: lab,
            brush_pin: brush,
            image_id: imageId,
            trait: focusLabel,
            value: String(parsed.value),
            attribute_source: 'vision',
            confidence: Number(parsed.confidence) || null,
          })
        }
        return json({ mode: 'backfill', present: parsed.present === true, suggested })
      }

      const liveLabels = new Set(live.map(tag => tag.label.toLowerCase()))
      const attributes = Array.isArray(parsed.attributes) ? parsed.attributes.flatMap(item => {
        if (!item || typeof item !== 'object') return []
        const record = item as { trait?: unknown, value?: unknown, confidence?: unknown }
        const trait = String(record.trait || '').trim()
        const value = String(record.value || '').trim()
        if (!trait || !value || !liveLabels.has(trait.toLowerCase())) return []
        const canonical = live.find(tag => tag.label.toLowerCase() === trait.toLowerCase())?.label || trait
        return [{ trait: canonical, value, confidence: Number(record.confidence) || null }]
      }) : []
      await rpc('brush_save_attributes', {
        lab_pin: lab, brush_pin: brush, image_id: imageId, attributes, attribute_source: 'vision',
      })
      return json({ mode: 'vision', attributes: attributes.length, suggested })
    } catch (error) {
      const detail = cleanDetail(error)
      const busy = /rate.?limit|429/i.test(detail)
      const status = busy ? 429 : typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500
      return json({ error: busy ? 'The vision model is busy. Try this image again in a moment.' : (error instanceof Error ? error.message : detail) }, status || 500)
    }
  },
}
