import { useState } from 'react'
import type { BrushAttribute, BrushImage, BrushTag, Insights, TurnOffs } from './types'
import { suggestRecipe } from './recipe'

export function ReasonSheet({
  kind, tags, selected, onToggle, onApprove, onReject, onSkip, onDone,
}: {
  kind: 'like' | 'bad'
  tags: BrushTag[]
  selected: string[]
  onToggle: (id: string) => void
  onApprove: (tag: BrushTag) => void
  onReject: (tag: BrushTag) => void
  onSkip: () => void
  onDone: () => void
}) {
  const live = tags.filter(tag => tag.status === 'live')
  const suggested = tags.filter(tag => tag.status === 'suggested')
  const categories = [...new Set(live.map(tag => tag.category))]
  return (
    <section className="brush-sheet" data-reason-sheet={kind} role="dialog" aria-label={kind === 'like' ? 'Why I liked it' : "Why it's bad"}>
      <h2>{kind === 'like' ? 'Why I liked it' : "Why it's bad"}</h2>
      <p className="brush-muted">Optional. Tap a tag, or skip. Nothing here is typed.</p>
      {categories.map(category => (
        <div key={category}>
          <strong>{category}</strong>
          <div className="brush-chips">
            {live.filter(tag => tag.category === category).map(tag => (
              <button key={tag.id} type="button" aria-pressed={selected.includes(tag.id)} onClick={() => onToggle(tag.id)}>{tag.label}</button>
            ))}
          </div>
        </div>
      ))}
      {suggested.length > 0 && (
        <div>
          <strong>Suggested</strong>
          <p className="brush-muted">These are not live until you approve them.</p>
          <div className="brush-chips">
            {suggested.map(tag => (
              <span key={tag.id} className="brush-inline">
                <button type="button" onClick={() => onApprove(tag)}>Approve {tag.label}</button>
                <button type="button" className="ghost" onClick={() => onReject(tag)}>Dismiss</button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="brush-sheet-actions">
        <button type="button" className="ghost" onClick={onSkip}>Skip</button>
        <button type="button" onClick={onDone}>Done</button>
      </div>
    </section>
  )
}

export function BackfillOffer({ label, onSkip, onRun }: { label: string, onSkip: () => void, onRun: () => void }) {
  return (
    <div className="brush-offer" data-backfill-offer>
      <section>
        <h2>Back-fill “{label}”?</h2>
        <p>Look through the library and note where this trait appears. This fills attributes only. It does not pick a winner, trash an image, or generate a picture.</p>
        <button type="button" onClick={onRun}>Back-fill</button>
        <button type="button" className="ghost" onClick={onSkip}>Not now</button>
      </section>
    </div>
  )
}

export function Leaderboard({ images, srcFor }: { images: BrushImage[], srcFor: (image: BrushImage) => string | null }) {
  const ranked = [...images].sort((a, b) => b.elo - a.elo)
  return (
    <div className="brush-scroll" data-screen="board">
      <h2>Leaderboard</h2>
      {ranked.map((image, index) => (
        <div className="brush-row" key={image.id}>
          <span>{index + 1}. {image.name}<br /><small className="brush-muted">{image.country || 'No country'}{image.trashed ? ' · trashed' : ''}</small></span>
          <strong>{Math.round(image.elo)} <small className="brush-muted">{image.wins}–{image.losses} · trash {image.trash_count}</small></strong>
          {srcFor(image) && <img src={srcFor(image) || ''} alt="" width={36} height={64} style={{ objectFit: 'cover', borderRadius: 6 }} />}
        </div>
      ))}
      {!ranked.length && <p>Sync or upload portraits to start the board.</p>}
    </div>
  )
}

function Bar({ value, max }: { value: number, max: number }) {
  return <div className="brush-bar" aria-hidden="true"><span style={{ width: `${max ? Math.max(6, (value / max) * 100) : 0}%` }} /></div>
}

export function InsightsScreen({
  insights, onPhrase, onApprove, onReject, phrasing,
}: {
  insights: Insights
  onPhrase: (draft: string) => void
  onApprove: (tag: BrushTag) => void
  onReject: (tag: BrushTag) => void
  phrasing: boolean
}) {
  const draft = insights.recipe?.body || suggestRecipe({
    tags: insights.tags,
    attributes: insights.attributes.map(attribute => ({
      trait: attribute.trait,
      value: attribute.value,
      wins: attribute.wins || 0,
      games: attribute.games || 0,
    })),
    turnOffs: insights.turn_offs.tags,
  })
  const turnOffs: TurnOffs = insights.turn_offs
  const maxOff = turnOffs.tags[0]?.images || 0
  const live = insights.tags.filter(tag => tag.status === 'live')
  const maxTag = Math.max(1, ...live.map(tag => tag.likes + tag.bads))
  return (
    <div className="brush-scroll" data-screen="love">
      <section className="brush-panel">
        <h2>What you love</h2>
        <p className="brush-muted">{insights.matches} decisions · {insights.active} still competing · {insights.trashed} flagged</p>
        {live.map(tag => (
          <div key={tag.id} className="brush-row">
            <span>{tag.label}<br /><small className="brush-muted">{tag.category} · {tag.likes} liked · {tag.bads} trashed</small></span>
            <span style={{ width: 90 }}><Bar value={tag.likes} max={maxTag} /></span>
          </div>
        ))}
      </section>
      <section className="brush-panel" data-turn-offs>
        <h2>Turn-offs</h2>
        <p className="brush-muted">Tags that show up most often on trashed images. {turnOffs.trashed} flagged in all.</p>
        {turnOffs.tags.map(tag => (
          <div key={tag.id} className="brush-row">
            <span>{tag.label}<br /><small className="brush-muted">{tag.images} of {turnOffs.trashed || tag.images}</small></span>
            <span style={{ width: 90 }}><Bar value={tag.images} max={maxOff} /></span>
          </div>
        ))}
        {!turnOffs.tags.length && <p>Tag trashed images in Trash Review and the pattern will show up here.</p>}
      </section>
      <section className="brush-panel">
        <h2>Strongest combinations</h2>
        {insights.combinations.map(pair => <div key={`${pair.left}-${pair.right}`} className="brush-row"><span>{pair.left} + {pair.right}</span><strong>{pair.together}</strong></div>)}
        {!insights.combinations.length && <p>Combinations appear after the same liked tags land together.</p>}
      </section>
      <section className="brush-panel">
        <h2>Suggested recipe</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{draft}</p>
        <div className="brush-inline">
          <button type="button" onClick={() => navigator.clipboard?.writeText(draft)}>Copy</button>
          <button type="button" className="ghost" disabled={phrasing} onClick={() => onPhrase(draft)}>{phrasing ? 'Phrasing…' : 'Phrase with the model'}</button>
        </div>
      </section>
      <section className="brush-panel">
        <h2>Suggested tags</h2>
        <div className="brush-chips">
          {insights.tags.filter(tag => tag.status === 'suggested').map(tag => (
            <span key={tag.id} className="brush-inline">
              <button type="button" onClick={() => onApprove(tag)}>Approve {tag.label}</button>
              <button type="button" className="ghost" onClick={() => onReject(tag)}>Dismiss</button>
            </span>
          ))}
        </div>
        {!insights.tags.some(tag => tag.status === 'suggested') && <p className="brush-muted">New tags from the vision pass or from Scout wait here.</p>}
      </section>
    </div>
  )
}

export function LibraryScreen({
  images, srcFor, countries, country, onCountry, onSync, onUpload, syncing,   onOpen, onAutoTag, onChangePin,
}: {
  images: BrushImage[]
  srcFor: (image: BrushImage) => string | null
  countries: string[]
  country: string
  onCountry: (country: string) => void
  onSync: () => void
  onUpload: (files: File[]) => void
  syncing: boolean
  onOpen: (image: BrushImage) => void
  onAutoTag: (image: BrushImage) => void
  onChangePin: () => void
}) {
  const visible = images.filter(image => !country || image.country === country)
  return (
    <div className="brush-scroll" data-screen="library">
      <div className="brush-inline">
        <button type="button" className="brush-upload" disabled={syncing} onClick={onSync}>{syncing ? 'Syncing…' : 'Sync Drive'}</button>
        <label className="brush-upload">Upload<input type="file" accept="image/*" multiple hidden onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) onUpload(files) }} /></label>
        <button type="button" className="ghost" onClick={onChangePin}>Change PIN</button>
      </div>
      <div className="brush-chips">
        <button type="button" aria-pressed={!country} onClick={() => onCountry('')}>All</button>
        {countries.map(item => <button key={item} type="button" aria-pressed={country === item} onClick={() => onCountry(item)}>{item}</button>)}
      </div>
      <div className="brush-grid">
        {visible.map(image => (
          <button key={image.id} type="button" className="brush-tile" onClick={() => onOpen(image)}>
            {srcFor(image) && <img src={srcFor(image) || ''} alt={image.name} />}
            <span>{image.country || image.name}{image.trashed ? ' · trash' : ''} · {Math.round(image.elo)}</span>
          </button>
        ))}
      </div>
      <div className="brush-chips">
        {visible.slice(0, 6).map(image => <button key={image.id} type="button" onClick={() => onAutoTag(image)}>Auto-tag {image.name}</button>)}
      </div>
    </div>
  )
}

export function DetailSheet({
  image, attributes, prompt, onPrompt, onSave, onClose, onAutoTag,
}: {
  image: BrushImage
  attributes: BrushAttribute[]
  prompt: string
  onPrompt: (value: string) => void
  onSave: () => void
  onClose: () => void
  onAutoTag: () => void
}) {
  return (
    <section className="brush-sheet" role="dialog" aria-label="Image details">
      <h2>{image.name}</h2>
      <p className="brush-muted">{image.country || 'No country'} · {image.trashed ? 'flagged, still in Drive' : 'in the contest'}</p>
      <label>Generation prompt, where known<textarea value={prompt} onChange={event => onPrompt(event.target.value)} rows={4} style={{ width: '100%', marginTop: 6 }} /></label>
      <div className="brush-inline">
        <button type="button" onClick={onSave}>Save prompt</button>
        <button type="button" className="ghost" onClick={onAutoTag}>Auto-tag</button>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </div>
      {attributes.map(attribute => <div key={`${attribute.trait}-${attribute.source}`} className="brush-row"><span>{attribute.trait}</span><strong>{attribute.value}</strong></div>)}
    </section>
  )
}

export function PinScreen({
  mode, message, onSubmit,
}: {
  mode: 'set' | 'enter' | 'change'
  message: string
  onSubmit: (current: string, next: string) => void
}) {
  const [local, setLocal] = useState('')
  return (
    <div className="brush-gate">
      <form onSubmit={event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const next = String(data.get('next') || '')
        if (mode === 'set' && next !== String(data.get('confirm') || '')) {
          setLocal('The two PINs do not match.')
          return
        }
        setLocal('')
        onSubmit(String(data.get('current') || ''), next)
      }}>
        <p className="brush-muted">Brush</p>
        <h2>{mode === 'enter' ? 'Brush PIN' : mode === 'change' ? 'Change Brush PIN' : 'Choose a Brush PIN'}</h2>
        <p>{mode === 'set' ? 'This PIN is separate from the Lab PIN. It is stored as a hash, not in the app. Use 4 to 8 digits.' : 'The Lab is already open. Brush asks for its own PIN.'}</p>
        {mode !== 'enter' && mode !== 'set' && <input name="current" inputMode="numeric" autoComplete="off" aria-label="Current Brush PIN" placeholder="Current PIN" />}
        <input name="next" inputMode="numeric" autoComplete="off" aria-label={mode === 'enter' ? 'Brush PIN' : 'New Brush PIN'} placeholder={mode === 'enter' ? 'PIN' : 'New PIN'} />
        {mode === 'set' && <input name="confirm" inputMode="numeric" autoComplete="off" aria-label="Confirm Brush PIN" placeholder="Confirm PIN" />}
        <button className="brush-upload" type="submit">{mode === 'enter' ? 'Open Brush' : 'Save PIN'}</button>
        {(local || message) && <p className="brush-note">{local || message}</p>}
      </form>
    </div>
  )
}
