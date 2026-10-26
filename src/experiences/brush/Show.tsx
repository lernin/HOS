import type { ShowBanner } from './contend'
import type { BrushImage } from './types'

export function Confetti() {
  return (
    <div className="brush-confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => <i key={index} />)}
    </div>
  )
}

export function ShowCard({
  banner,
  roster,
  srcFor,
  onAdvance,
}: {
  banner: ShowBanner
  roster: BrushImage[]
  srcFor: (image: BrushImage) => string | null
  onAdvance: () => void
}) {
  const byId = new Map(roster.map(image => [image.id, image]))
  return (
    <button type="button" className={`brush-show is-${banner.kind}`} data-card={banner.kind} onClick={onAdvance}>
      {(banner.kind === 'reveal') && <Confetti />}
      <div className="brush-show-card">
        <p>{banner.kind === 'results' ? 'Results' : banner.kind === 'reveal' ? 'Top 16 Reveal' : 'Up next'}</p>
        <h2>{banner.title}</h2>
        {banner.detail && <span>{banner.detail}</span>}
        {banner.thumbs.length > 0 && (
          <div className="brush-show-thumbs">
            {banner.thumbs.slice(0, 12).map(id => {
              const image = byId.get(id)
              const src = image ? srcFor(image) : null
              return src ? <img key={id} src={src} alt="" /> : <i key={id} />
            })}
          </div>
        )}
      </div>
    </button>
  )
}
