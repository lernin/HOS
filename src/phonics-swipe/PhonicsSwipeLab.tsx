import { useEffect, useMemo, useState } from 'react'
import {
  advanceWithoutEvidence,
  createInitialSession,
  getCurrentCard,
  getDeck,
  getNextCard,
  recordAllOutcomeAndAdvance,
  recordObservations,
  recordStudentOutcome,
  setDeckMode,
  undoSession,
} from './state'
import type {
  AssessmentOutcome,
  DeckMode,
  ObservationOutcome,
  ObservationState,
  Outcome,
  PhonicsCard,
  StudentId,
} from './state'
import { styleForSwipeMotion, useSwipe } from './useSwipe'
import type { SwipeDirection, SwipeMotion } from './useSwipe'

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

const ASSESSMENT_BY_DIRECTION: Partial<Record<SwipeDirection, AssessmentOutcome>> = {
  up: 'produce_success',
  down: 'produce_failure',
  right: 'imitate_success',
  left: 'imitate_failure',
}

const OBSERVATION_BY_DIRECTION: Record<SwipeDirection, ObservationOutcome[]> = {
  up: ['watch_success'],
  down: ['watch_failure'],
  right: ['listen_success'],
  left: ['listen_failure'],
  'up-right': ['watch_success', 'listen_success'],
  'up-left': ['watch_success', 'listen_failure'],
  'down-right': ['watch_failure', 'listen_success'],
  'down-left': ['watch_failure', 'listen_failure'],
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

const isActiveMotion = (motion: SwipeMotion | null) =>
  Boolean(motion && (motion.dragging || motion.throwing || motion.x !== 0 || motion.y !== 0))

type StudentChipProps = {
  id: StudentId
  name: string
  short: string
  productionFailed: boolean
  observation: ObservationState
  observing: boolean
  mirrorCard: boolean
  onSwipe: (id: StudentId, direction: SwipeDirection) => void
  onToggleObserve: (id: StudentId) => void
  onMirrorMotion: (motion: SwipeMotion) => void
}

function StudentChip({
  id,
  name,
  short,
  productionFailed,
  observation,
  observing,
  mirrorCard,
  onSwipe,
  onToggleObserve,
  onMirrorMotion,
}: StudentChipProps) {
  const swipe = useSwipe({
    onCommit: (direction) => onSwipe(id, direction),
    onTap: () => onToggleObserve(id),
    shouldThrow: (direction) => !observing && direction !== 'down',
  })

  useEffect(() => {
    if (mirrorCard) onMirrorMotion(swipe.motion)
  }, [mirrorCard, onMirrorMotion, swipe.motion])

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
      {observing ? <span className="phonics-observe-badge">LISTEN</span> : null}
      <span className="phonics-avatar">{short}</span>
      <span className="phonics-person-name">{name}</span>
    </button>
  )
}

type AllChipProps = {
  disabled: boolean
  count: number
  onSwipe: (direction: SwipeDirection) => void
  onMirrorMotion: (motion: SwipeMotion) => void
}

function AllChip({ disabled, count, onSwipe, onMirrorMotion }: AllChipProps) {
  const swipe = useSwipe({
    disabled,
    onCommit: onSwipe,
    shouldThrow: (direction) => direction !== 'down',
  })

  useEffect(() => {
    onMirrorMotion(swipe.motion)
  }, [onMirrorMotion, swipe.motion])

  return (
    <button
      className="phonics-all-bar"
      type="button"
      disabled={disabled}
      style={swipe.style}
      {...swipe.handlers}
    >
      <strong>ALL</strong>
      <span>{count} unresolved</span>
    </button>
  )
}

type MainCardProps = {
  card: PhonicsCard
  nextCard: PhonicsCard
  diagnosing: boolean
  mirroredMotion: SwipeMotion | null
  canUndo: boolean
  onAdvance: (direction: SwipeDirection) => void
  onDiagnoseSwipe: (direction: SwipeDirection) => void
  onExitDiagnosis: () => void
  onUndo: () => void
}

function MainCard({
  card,
  nextCard,
  diagnosing,
  mirroredMotion,
  canUndo,
  onAdvance,
  onDiagnoseSwipe,
  onExitDiagnosis,
  onUndo,
}: MainCardProps) {
  const swipe = useSwipe({
    threshold: 52,
    allowDiagonals: diagnosing,
    onCommit: diagnosing ? onDiagnoseSwipe : onAdvance,
    onTap: diagnosing ? onExitDiagnosis : undefined,
    shouldThrow: () => !diagnosing,
  })

  const currentStyle = isActiveMotion(mirroredMotion)
    ? styleForSwipeMotion(mirroredMotion as SwipeMotion)
    : swipe.style

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
        className={`phonics-card phonics-card-current phonics-tone-${card.tone}${diagnosing ? ' phonics-card-diagnosing' : ''}`}
        style={currentStyle}
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
  const [mirroredMotion, setMirroredMotion] = useState<SwipeMotion | null>(null)
  const card = getCurrentCard(session)
  const nextCard = getNextCard(session)
  const deck = getDeck(session.deckMode)
  const unresolved = useMemo(() => new Set(session.unresolved), [session.unresolved])
  const productionFailed = useMemo(() => new Set(session.productionFailed), [session.productionFailed])
  const latest = session.events.at(-1)
  const cardsLeft = Math.max(0, deck.length - session.cardIndex - 1)

  const recordStudent = (studentId: StudentId, direction: SwipeDirection) => {
    if (observingStudent === studentId) {
      setSession((current) => recordObservations(current, studentId, OBSERVATION_BY_DIRECTION[direction]))
      return
    }

    const outcome = ASSESSMENT_BY_DIRECTION[direction]
    if (!outcome) return

    setSession((current) => recordStudentOutcome(current, studentId, outcome))
    if (direction !== 'down') setObservingStudent(null)
    setMirroredMotion(null)
  }

  const recordAll = (direction: SwipeDirection) => {
    const outcome = ASSESSMENT_BY_DIRECTION[direction]
    if (!outcome) return

    setObservingStudent(null)
    setSession((current) => recordAllOutcomeAndAdvance(current, outcome))
    setMirroredMotion(null)
  }

  const advanceCard = (_direction: SwipeDirection) => {
    setObservingStudent(null)
    setMirroredMotion(null)
    setSession((current) => advanceWithoutEvidence(current))
  }

  const diagnoseFromCard = (direction: SwipeDirection) => {
    if (!observingStudent) return
    setSession((current) => recordObservations(current, observingStudent, OBSERVATION_BY_DIRECTION[direction]))
  }

  const toggleObserve = (studentId: StudentId) => {
    setMirroredMotion(null)
    setObservingStudent((current) => current === studentId ? null : studentId)
  }

  const exitObserve = () => {
    setObservingStudent(null)
    setMirroredMotion(null)
  }

  const changeDeck = (deckMode: DeckMode) => {
    setObservingStudent(null)
    setMirroredMotion(null)
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
          diagnosing={observingStudent !== null}
          mirroredMotion={mirroredMotion}
          canUndo={session.history.length > 0}
          onAdvance={advanceCard}
          onDiagnoseSwipe={diagnoseFromCard}
          onExitDiagnosis={exitObserve}
          onUndo={() => {
            setMirroredMotion(null)
            setSession((current) => undoSession(current))
          }}
        />
      </section>

      <section className="phonics-teacher-panel" aria-label="Teacher evidence controls">
        <button
          className="phonics-lab-back"
          type="button"
          onClick={() => { window.location.href = '/' }}
        >
          ← The Lab
        </button>
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
          <span className="phonics-card-position">
            {session.cardIndex + 1}/{deck.length} · {cardsLeft} left
          </span>
        </div>

        {observingStudent ? (
          <div className="phonics-mode-banner">
            Listening diagnosis · {observingName} · swipe the big card ↑ watch ✓ · ↓ watch × · ← listen × · listen ✓ → · diagonals combine · tap card/name to exit
          </div>
        ) : (
          <div className="phonics-mode-banner phonics-mode-banner-muted">
            Tap a child only when you want a closer watch/listen diagnosis
          </div>
        )}

        <div className="phonics-legend" aria-label="Swipe meanings">
          {observingStudent ? (
            <>
              <span>↖ ✓ watch / × listen</span>
              <span>↗ ✓ watch / ✓ listen</span>
              <span>↙ × watch / × listen</span>
              <span>↘ × watch / ✓ listen</span>
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
          {STUDENTS.map((student) =>
            unresolved.has(student.id) ? (
              <StudentChip
                key={student.id}
                {...student}
                productionFailed={productionFailed.has(student.id)}
                observation={session.observations[student.id]}
                observing={observingStudent === student.id}
                mirrorCard={session.unresolved.length === 1 && observingStudent === null}
                onSwipe={recordStudent}
                onToggleObserve={toggleObserve}
                onMirrorMotion={setMirroredMotion}
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

        <AllChip
          disabled={session.unresolved.length === 0 || observingStudent !== null}
          count={session.unresolved.length}
          onSwipe={recordAll}
          onMirrorMotion={setMirroredMotion}
        />
      </section>
    </main>
  )
}
