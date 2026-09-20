import { useMemo, useState } from 'react'
import {
  PHONICS_DECK,
  advanceWithoutEvidence,
  createInitialSession,
  recordAllOutcomeAndAdvance,
  recordObservation,
  recordStudentOutcome,
  undoSession,
} from './state'
import type { ObservationState, Outcome, StudentId } from './state'
import { useSwipe } from './useSwipe'
import type { SwipeDirection } from './useSwipe'

const STUDENTS: Array<{ id: StudentId; name: string; short: string }> = [
  { id: 'a', name: 'A', short: 'A' },
  { id: 'b', name: 'B', short: 'B' },
  { id: 'c', name: 'C', short: 'C' },
]

type AssessmentOutcome = Extract<
  Outcome,
  'produce_success' | 'produce_failure' | 'imitate_success' | 'imitate_failure'
>

type ObservationOutcome = Extract<
  Outcome,
  'watch_success' | 'watch_failure' | 'listen_success' | 'listen_failure'
>

const ASSESSMENT_BY_DIRECTION: Record<SwipeDirection, AssessmentOutcome> = {
  up: 'produce_success',
  down: 'produce_failure',
  right: 'imitate_success',
  left: 'imitate_failure',
}

const OBSERVATION_BY_DIRECTION: Record<SwipeDirection, ObservationOutcome> = {
  up: 'watch_success',
  down: 'watch_failure',
  right: 'listen_success',
  left: 'listen_failure',
}

const OUTCOME_COPY: Record<Outcome, string> = {
  produce_success: 'Produced ✓',
  produce_failure: 'Production missed',
  imitate_success: 'Imitated ✓',
  imitate_failure: 'Imitation missed',
  watch_success: 'Watched',
  watch_failure: 'Was not watching',
  listen_success: 'Listened',
  listen_failure: 'Was not listening',
}

type StudentChipProps = {
  id: StudentId
  name: string
  short: string
  productionFailed: boolean
  observation: ObservationState
  observing: boolean
  onSwipe: (id: StudentId, direction: SwipeDirection) => void
  onToggleObserve: (id: StudentId) => void
}

function StudentChip({
  id,
  name,
  short,
  productionFailed,
  observation,
  observing,
  onSwipe,
  onToggleObserve,
}: StudentChipProps) {
  const swipe = useSwipe({
    onCommit: (direction) => onSwipe(id, direction),
    onTap: () => onToggleObserve(id),
    shouldThrow: (direction) => !observing && direction !== 'down',
  })

  const classes = [
    'phonics-person',
    productionFailed ? 'phonics-production-pending' : '',
    observing ? 'phonics-observing' : '',
    observation.watch === 'positive' ? 'phonics-watch-positive' : '',
    observation.watch === 'negative' ? 'phonics-watch-negative' : '',
    observation.listen === 'positive' ? 'phonics-listen-positive' : '',
    observation.listen === 'negative' ? 'phonics-listen-negative' : '',
  ].filter(Boolean).join(' ')

  return (
    <button className={classes} type="button" style={swipe.style} {...swipe.handlers}>
      {observing ? <span className="phonics-observe-badge">OBSERVE</span> : null}
      <span className="phonics-avatar">{short}</span>
      <span className="phonics-person-name">{name}</span>
      {productionFailed ? <span className="phonics-pending-dot" aria-label="production missed once" /> : null}
    </button>
  )
}

type AllChipProps = {
  disabled: boolean
  onSwipe: (direction: SwipeDirection) => void
}

function AllChip({ disabled, onSwipe }: AllChipProps) {
  const swipe = useSwipe({
    disabled,
    onCommit: onSwipe,
    shouldThrow: (direction) => direction !== 'down',
  })

  return (
    <button
      className="phonics-person phonics-all"
      type="button"
      disabled={disabled}
      style={swipe.style}
      {...swipe.handlers}
    >
      <span className="phonics-avatar">ALL</span>
      <span className="phonics-person-name">Unresolved</span>
    </button>
  )
}

type MainCardProps = {
  cardId: string
  label: string
  onSwipe: (direction: SwipeDirection) => void
}

function MainCard({ cardId, label, onSwipe }: MainCardProps) {
  const swipe = useSwipe({ threshold: 52, onCommit: onSwipe })

  return (
    <div className="phonics-card-wrap" key={cardId}>
      <div className="phonics-card" style={swipe.style} {...swipe.handlers}>
        <div className="phonics-card-child-face">
          <strong>{label}</strong>
        </div>
      </div>
    </div>
  )
}

export function PhonicsSwipeLab() {
  const [session, setSession] = useState(createInitialSession)
  const [observingStudent, setObservingStudent] = useState<StudentId | null>(null)
  const card = PHONICS_DECK[session.cardIndex] ?? PHONICS_DECK[0]
  const unresolved = useMemo(() => new Set(session.unresolved), [session.unresolved])
  const productionFailed = useMemo(() => new Set(session.productionFailed), [session.productionFailed])
  const latest = session.events.at(-1)

  const recordStudent = (studentId: StudentId, direction: SwipeDirection) => {
    if (observingStudent === studentId) {
      setSession((current) => recordObservation(current, studentId, OBSERVATION_BY_DIRECTION[direction]))
      return
    }

    setSession((current) => recordStudentOutcome(current, studentId, ASSESSMENT_BY_DIRECTION[direction]))
    if (direction !== 'down') setObservingStudent(null)
  }

  const recordAll = (direction: SwipeDirection) => {
    setObservingStudent(null)
    setSession((current) => recordAllOutcomeAndAdvance(current, ASSESSMENT_BY_DIRECTION[direction]))
  }

  const advanceCard = (_direction: SwipeDirection) => {
    setObservingStudent(null)
    setSession((current) => advanceWithoutEvidence(current))
  }

  const toggleObserve = (studentId: StudentId) => {
    setObservingStudent((current) => current === studentId ? null : studentId)
  }

  const observingName = observingStudent
    ? STUDENTS.find((student) => student.id === observingStudent)?.name ?? observingStudent
    : null

  return (
    <main className="phonics-lab-shell">
      <header className="phonics-teacher-bar">
        <div>
          <span className="phonics-eyebrow">LAB PROTOTYPE</span>
          <h1>Phonics swipe</h1>
        </div>
        <button
          className="phonics-undo"
          type="button"
          disabled={session.history.length === 0}
          onClick={() => setSession((current) => undoSession(current))}
        >
          ↶ Undo
        </button>
      </header>

      <section className="phonics-stage" aria-label="Current learning card">
        <MainCard cardId={card.id} label={card.label} onSwipe={advanceCard} />
        <div className="phonics-card-help">Swipe the card anywhere to move on — nothing is inferred.</div>
      </section>

      <section className="phonics-teacher-panel" aria-label="Teacher evidence controls">
        {observingStudent ? (
          <div className="phonics-mode-banner">
            Observe {observingName}: ↑ watched · ↓ not watching · ← not listening · listened → · tap again to exit
          </div>
        ) : (
          <div className="phonics-mode-banner phonics-mode-banner-muted">
            Tap a name for watch/listen evidence
          </div>
        )}

        <div className="phonics-legend" aria-label="Swipe meanings">
          {observingStudent ? (
            <>
              <span>← Listen ×</span>
              <span>↑ Watch ✓</span>
              <span>↓ Watch ×</span>
              <span>Listen ✓ →</span>
            </>
          ) : (
            <>
              <span>← Imitate ×</span>
              <span>↑ Produce ✓</span>
              <span>↓ Produce ×</span>
              <span>Imitate ✓ →</span>
            </>
          )}
        </div>

        <div className="phonics-people">
          <AllChip disabled={session.unresolved.length === 0} onSwipe={recordAll} />
          {STUDENTS.map((student) =>
            unresolved.has(student.id) ? (
              <StudentChip
                key={student.id}
                {...student}
                productionFailed={productionFailed.has(student.id)}
                observation={session.observations[student.id]}
                observing={observingStudent === student.id}
                onSwipe={recordStudent}
                onToggleObserve={toggleObserve}
              />
            ) : (
              <div className="phonics-person-placeholder" key={student.id} aria-label={`${student.name} recorded`} />
            ),
          )}
        </div>

        <div className="phonics-status" aria-live="polite">
          <div>
            <span className="phonics-status-label">Captured</span>
            <strong>{session.events.length}</strong>
          </div>
          <p>
            {latest
              ? `${STUDENTS.find((student) => student.id === latest.studentId)?.name ?? latest.studentId}: ${OUTCOME_COPY[latest.outcome]}`
              : 'Nothing recorded yet. Sparse evidence is allowed.'}
          </p>
        </div>
      </section>
    </main>
  )
}
