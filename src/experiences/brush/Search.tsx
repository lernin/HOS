import { useEffect, useState } from 'react'
import type { FunnelStop, SearchGroup, SearchLeader } from './contend'
import type { BrushImage } from './types'

export type SearchModel = {
  funnel: FunnelStop[]
  contention: number
  groups: SearchGroup[]
  leaders: SearchLeader[]
  eliminated: string[]
}

function funnelText(funnel: FunnelStop[]) {
  return funnel.map(stop => stop.count).join(' → ')
}

function Thumb({
  id,
  roster,
  srcFor,
  caption,
  faded = false,
}: {
  id: string
  roster: BrushImage[]
  srcFor: (image: BrushImage) => string | null
  caption?: string
  faded?: boolean
}) {
  const image = roster.find(item => item.id === id)
  const src = image ? srcFor(image) : null
  return (
    <figure className={faded ? 'is-faded' : undefined} data-search-id={id}>
      {src ? <img src={src} alt="" /> : <i />}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

export function SearchStrip({
  stage,
  model,
  roster,
  srcFor,
}: {
  stage: string
  model: SearchModel
  roster: BrushImage[]
  srcFor: (image: BrushImage) => string | null
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button type="button" className="brush-search-strip" data-search-strip data-funnel={funnelText(model.funnel)} onClick={() => setOpen(true)}>
        <span className="brush-funnel" aria-hidden="true">
          {model.funnel.map(stop => (
            <b key={`${stop.label}-${stop.count}-${stop.state}`} className={`is-${stop.state}`}>{stop.count}</b>
          ))}
        </span>
        {stage && <span className="brush-stage-line" data-stage>{stage}</span>}
        <span className="brush-stage-line" data-contention>{`${model.contention} still in contention`}</span>
      </button>
      {open && (
        <div className="brush-search-board" data-search-board role="dialog" aria-label="The Search" onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <div className="brush-search-sheet">
            <div className="brush-search-bar">
              <h2>The Search</h2>
              <button type="button" data-action="close-search" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="brush-search-funnel" data-funnel={funnelText(model.funnel)}>
              {model.funnel.map(stop => (
                <div key={`${stop.label}-${stop.count}`} className={`is-${stop.state}`}>
                  <strong>{stop.count}</strong>
                  <span>{stop.label}</span>
                </div>
              ))}
            </div>
            {stage && <p className="brush-stage-line" data-stage>{stage}</p>}
            <p data-contention>{`${model.contention} still in contention`}</p>
            <section>
              <h3>Leaders</h3>
              <div className="brush-search-row">
                {model.leaders.map(leader => (
                  <Thumb key={leader.id} id={leader.id} roster={roster} srcFor={srcFor} caption={leader.record} />
                ))}
              </div>
            </section>
            {model.groups.map(group => (
              <section key={group.label}>
                <h3>{`${group.label} · ${group.ids.length}`}</h3>
                <div className="brush-search-row">
                  {group.ids.map(id => <Thumb key={id} id={id} roster={roster} srcFor={srcFor} />)}
                </div>
              </section>
            ))}
            {model.eliminated.length > 0 && (
              <section>
                <h3>Eliminated</h3>
                <div className="brush-search-row">
                  {model.eliminated.map(id => <Thumb key={id} id={id} roster={roster} srcFor={srcFor} faded />)}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
