import { useMemo, useState } from 'react'
import {
  advanceWithoutEvidence,
  createInitialSession,
  getCurrentCard,
  getNextCard,
  recordAllOutcomeAndAdvance,
  recordObservation,
  recordStudentOutcome,
  setDeckMode,
  undoSession,
} from './state'
import type { DeckMode, ObservationState, Outcome, PhonicsCard, StudentId } from './state'
import { useSwipe } from './useSwipe'
import type { SwipeDirection } from './useSwipe'

const STUDENTS: Array<{ id: StudentId; name: string; short: string }> = [
  { id: 'a', name: 'A', short: 'A' },
  { id: 'b', name: 'B', short: 'B' },
  { id: 'c', name: 'C', short: 'C' },
]

const DECK_LABELS: Record<DeckMode, string> = {
  alphabet: 'Alphabet',
  blends: 'Blends',
  digraphs: 'Digraphs',
  trigraphs: 'Trigraphs',
}

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
  card: PhonicsCard
  nextCard: PhonicsCard
  canUndo: boolean
  onSwipe: (direction: SwipeDirection) => void
  onUndo: () => void
}

function MainCard({ card, nextCard, canUndo, onSwipe, onUndo }: MainCardProps) {
  const swipe = useSwipe({ threshold: 52, onCommit: onSwipe })

  return (
    <div className="phonics-card-wrap" key={`${card.id}-${nextCard.id}`}>
      <div
        className={`phonics-card phonics-card-under phonics-tone-${nextCard.tone}`}
        aria-hidden="true"
      >
        <div className="phonics-card-child-face">
          <strong>{nextCard.label}</strong>
        </div>
      </div>

      <div
        className={`phonics-card phonics-card-current phonics-tone-${card.tone}`}
        style={swipe.style}
        {...swipe.handlers}
      >
        <div className="phonics-card-child-face">
          <strong>{card.label}</strong>
        </div>
      </div>

      <button
        className="phonics-undo"
        type="button"
        aria-label="Undo last action"
        disabled={!canUndo}
        onClick={onUndo}
      >
        ↶
      </button>
    </div>
  )
}

export function PhonicsSwipeLab() {
  const [session, setSession] = useState(createInitialSession)
  const [observingStudent, setObservingStudent] = useState<StudentId | null>(null)
  const card = getCurrentCard(session)
  const nextCard = getNextCard(session)
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

  const changeDeck = (deckMode: DeckMode) => {
    setObservingStudent(null)
    setSession((current) => setDeckMode(current, deckMode))
  }

  const observingName = observingStudent
    ? STUDENTS.find((student) => student.id === observingStudent)?.name ?? observingStudent
    : null

  return (
    <main className="phonics-lab-shell">
      <section className="phonics-stage" aria-label="Current learning card">
        <MainCard
          card={card}
          nextCard={nextCard}
          canUndo={session.history.length > 0}
          onSwipe={advanceCard}
          onUndo={() => setSession((current) => undoSession(current))}
        />
      </section>

      <section className="phonics-teacher-panel" aria-label="Teacher evidence controls">
        <div className="phonics-deck-row">
          <label className="phonics-deck-select">
            <span>Set</span>
            <select
              value={session.deckMode}
              onChange={(event) => changeDeck(event.currentTarget.value as DeckMode)}
            >
              {(Object.keys(DECK_LABELS) as DeckMode[]).map((mode) => (
                <option key={mode} value={mode}>{DECK_LABELS[mode]}</option>
              ))}
            </select>
          </label>
          <span className="phonics-card-position">{session.cardIndex + 1}</span>
        </div>

        {observingStudent ? (
          <div className="phonics-mode-banner">
            Observe {observingName}: ↑ watched · ↓ not watching · ← not listening · listened → · repeat a swipe to clear it
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
