import type { BrushTag, TrashImage } from './types'
import { ReasonSheet } from './Sheets'

export function TrashReview({
  images, index, tags, selected, src, onToggle, onApprove, onReject, onSave, onStep, onRestore,
}: {
  images: TrashImage[]
  index: number
  tags: BrushTag[]
  selected: string[]
  src: string | null
  onToggle: (id: string) => void
  onApprove: (tag: BrushTag) => void
  onReject: (tag: BrushTag) => void
  onSave: () => void
  onStep: (delta: number) => void
  onRestore: () => void
}) {
  const image = images[index]
  if (!image) {
    return <div className="brush-scroll" data-screen="trash"><h2>Trash Review</h2><p>Nothing is flagged. Trash stays in Drive and is only marked here.</p></div>
  }
  return (
    <div className="brush-trash-layout" data-screen="trash" data-trash-review>
      <div className="brush-trash-photo">
        {src ? <img src={src} alt={image.name} /> : null}
        <div className="brush-card-meta">
          <strong>{index + 1} / {images.length}</strong>
          <small>{image.name}<br />{image.country || 'No country'} · flagged {image.trash_count}</small>
        </div>
        <div className="brush-card-actions">
          <button className="brush-choice" type="button" onClick={() => onStep(-1)} disabled={index === 0}>Previous</button>
          <button className="brush-choice" type="button" onClick={() => onStep(1)} disabled={index >= images.length - 1}>Next</button>
          <button className="brush-choice" type="button" onClick={onRestore}>Put back</button>
        </div>
      </div>
      <ReasonSheet
        kind="bad"
        tags={tags}
        selected={selected}
        onToggle={onToggle}
        onApprove={onApprove}
        onReject={onReject}
        onSkip={() => onStep(1)}
        onDone={onSave}
      />
    </div>
  )
}
