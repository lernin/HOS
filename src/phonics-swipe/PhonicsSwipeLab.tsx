import { useMemo, useState } from 'react'
import {
  PHONICS_DECK,
  advanceWithoutEvidence,
  createInitialSession,
  recordAllOutcomeAndAdvance,
  recordStudentOutcome,
  undoSession,
} from './state'
import type { Outcome, StudentId } from './state'
import { useSwipe } from './useSwipe'
import type { SwipeDirection } from './useSwipe'

const STUDENTS: Array<{ id: StudentId; name: string; short: string }> = [
  { id: 'a', name: 'Child A', short: 'A' },
  { id: 'b', name: 'Child B', short: 'B' },
  { id: 'c', name: 'Child C', short: 'C' },
]

const OUTCOME_BY_DIRECTION: Record<SwipeDirection, Outcome> = {
  up: 'produce_success',
  down: 'produce_failure',
  right: 'imitate_success',
  left: 'imitate_failure',
}

const OUTCOME_COPY: Record<Outcome, string> = {
  produce_success: 'Produced ✓',
  produce_failure: 'Produce ×',
  imitate_success: 'Imitated ✓',
  imitate_failure: 'Imitate ×',
}

type StudentChipProps = {
  id: StudentId
  name: string
  short: string
  onSwipe: (id: StudentId, direction: SwipeDirection) => void
}

function StudentChip({ id, name, short, onSwipe }: StudentChipProps) {
  const swipe = useSwipe({ onCommit: (direction) => onSwipe(id, direction) })

  return (
    <button className="phonics-person" type="button" style={swipe.style} {...swipe.handlers}>
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
  const swipe = useSwipe({ disabled, onCommit: onSwipe })

  return (
    <button
      className="phonics-person phonics-all"
      type="button"
      disabled={disabled}
      style={swipe.style}
      {...swipe.handlers}
    >
      <span className="phonics-avatar">ALL</span>
      <span className="phonics-person-name">Everyone left</span>
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
          <span className="phonics-card-kicker">PHONICS</span>
          <strong>{label}</strong>
          <span className="phonics-card-note">Say the sound</span>
        </div>
      </div>
    </div>
  )
}

export function PhonicsSwipeLab() {
  const [session, setSession] = useState(createInitialSession)
  const card = PHONICS_DECK[session.cardIndex] ?? PHONICS_DECK[0]
  const unresolved = useMemo(() => new Set(session.unresolved), [session.unresolved])
  const latest = session.events.at(-1)

  const recordStudent = (studentId: StudentId, direction: SwipeDirection) => {
    setSession((current) => recordStudentOutcome(current, studentId, OUTCOME_BY_DIRECTION[direction]))
  }

  const recordAll = (direction: SwipeDirection) => {
    setSession((current) => recordAllOutcomeAndAdvance(current, OUTCOME_BY_DIRECTION[direction]))
  }

  const advanceCard = (_direction: SwipeDirection) => {
    setSession((current) => advanceWithoutEvidence(current))
  }

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

      <section className="phonics-stage" aria-label="Current phonics card">
        <div className="phonics-child-edge">CHILDREN</div>
        <MainCard cardId={card.id} label={card.label} onSwipe={advanceCard} />
        <div className="phonics-card-help">Swipe the big card anywhere to move on — no judgment recorded.</div>
      </section>

      <section className="phonics-teacher-panel" aria-label="Teacher evidence controls">
        <div className="phonics-legend" aria-label="Swipe meanings">
          <span>← Imitate ×</span>
          <span>↑ Produce ✓</span>
          <span>↓ Produce ×</span>
          <span>Imitate ✓ →</span>
        </div>

        <div className="phonics-people">
          <AllChip disabled={session.unresolved.length === 0} onSwipe={recordAll} />
          {STUDENTS.map((student) =>
            unresolved.has(student.id) ? (
              <StudentChip key={student.id} {...student} onSwipe={recordStudent} />
            ) : (
              <div className="phonics-person-placeholder" key={student.id} aria-label={`${student.name} recorded`}>
                <span>✓</span>
                <small>{student.name}</small>
              </div>
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
