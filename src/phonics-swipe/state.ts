export type StudentId = 'a' | 'b' | 'c'

export type Outcome =
  | 'produce_success'
  | 'produce_failure'
  | 'imitate_success'
  | 'imitate_failure'

export type MockEvidenceEvent = {
  cardId: string
  studentId: StudentId
  outcome: Outcome
  createdAt: number
}

export type SessionSnapshot = {
  cardIndex: number
  unresolved: StudentId[]
  events: MockEvidenceEvent[]
}

export type SessionState = SessionSnapshot & {
  history: SessionSnapshot[]
}

export const STUDENT_IDS: StudentId[] = ['a', 'b', 'c']

export const PHONICS_DECK = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'f', label: 'F' },
  { id: 'l', label: 'L' },
  { id: 'r', label: 'R' },
  { id: 's', label: 'S' },
  { id: 'ch', label: 'CH' },
  { id: 'sh', label: 'SH' },
  { id: 'th', label: 'TH' },
] as const

const snapshot = (state: SessionState): SessionSnapshot => ({
  cardIndex: state.cardIndex,
  unresolved: [...state.unresolved],
  events: state.events.map((event) => ({ ...event })),
})

const withHistory = (state: SessionState, next: SessionSnapshot): SessionState => ({
  ...next,
  history: [...state.history, snapshot(state)],
})

const nextCardIndex = (index: number) => (index + 1) % PHONICS_DECK.length

const currentCardId = (state: SessionState) => PHONICS_DECK[state.cardIndex]?.id ?? PHONICS_DECK[0].id

export const createInitialSession = (): SessionState => ({
  cardIndex: 0,
  unresolved: [...STUDENT_IDS],
  events: [],
  history: [],
})

export const recordStudentOutcome = (
  state: SessionState,
  studentId: StudentId,
  outcome: Outcome,
  createdAt = Date.now(),
): SessionState => {
  if (!state.unresolved.includes(studentId)) return state

  return withHistory(state, {
    cardIndex: state.cardIndex,
    unresolved: state.unresolved.filter((id) => id !== studentId),
    events: [
      ...state.events,
      { cardId: currentCardId(state), studentId, outcome, createdAt },
    ],
  })
}

export const advanceWithoutEvidence = (state: SessionState): SessionState =>
  withHistory(state, {
    cardIndex: nextCardIndex(state.cardIndex),
    unresolved: [...STUDENT_IDS],
    events: [...state.events],
  })

export const recordAllOutcomeAndAdvance = (
  state: SessionState,
  outcome: Outcome,
  createdAt = Date.now(),
): SessionState => {
  if (state.unresolved.length === 0) return state

  const cardId = currentCardId(state)
  const events = state.unresolved.map((studentId) => ({
    cardId,
    studentId,
    outcome,
    createdAt,
  }))

  return withHistory(state, {
    cardIndex: nextCardIndex(state.cardIndex),
    unresolved: [...STUDENT_IDS],
    events: [...state.events, ...events],
  })
}

export const undoSession = (state: SessionState): SessionState => {
  const previous = state.history.at(-1)
  if (!previous) return state

  return {
    cardIndex: previous.cardIndex,
    unresolved: [...previous.unresolved],
    events: previous.events.map((event) => ({ ...event })),
    history: state.history.slice(0, -1),
  }
}
