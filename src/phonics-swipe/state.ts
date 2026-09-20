export type StudentId = 'a' | 'b' | 'c'

export type Outcome =
  | 'produce_success'
  | 'produce_failure'
  | 'imitate_success'
  | 'imitate_failure'
  | 'watch_success'
  | 'watch_failure'
  | 'listen_success'
  | 'listen_failure'

export type AttentionValue = 'positive' | 'negative' | null

export type ObservationState = {
  watch: AttentionValue
  listen: AttentionValue
}

export type MockEvidenceEvent = {
  cardId: string
  studentId: StudentId
  outcome: Outcome
  createdAt: number
}

export type SessionSnapshot = {
  cardIndex: number
  unresolved: StudentId[]
  productionFailed: StudentId[]
  observations: Record<StudentId, ObservationState>
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

const emptyObservations = (): Record<StudentId, ObservationState> => ({
  a: { watch: null, listen: null },
  b: { watch: null, listen: null },
  c: { watch: null, listen: null },
})

const cloneObservations = (observations: Record<StudentId, ObservationState>) => ({
  a: { ...observations.a },
  b: { ...observations.b },
  c: { ...observations.c },
})

const snapshot = (state: SessionState): SessionSnapshot => ({
  cardIndex: state.cardIndex,
  unresolved: [...state.unresolved],
  productionFailed: [...state.productionFailed],
  observations: cloneObservations(state.observations),
  events: state.events.map((event) => ({ ...event })),
})

const withHistory = (state: SessionState, next: SessionSnapshot): SessionState => ({
  ...next,
  history: [...state.history, snapshot(state)],
})

const nextCardIndex = (index: number) => (index + 1) % PHONICS_DECK.length

const currentCardId = (state: SessionState) => PHONICS_DECK[state.cardIndex]?.id ?? PHONICS_DECK[0].id

const resetForNextCard = (state: SessionState, events: MockEvidenceEvent[]): SessionSnapshot => ({
  cardIndex: nextCardIndex(state.cardIndex),
  unresolved: [...STUDENT_IDS],
  productionFailed: [],
  observations: emptyObservations(),
  events,
})

export const createInitialSession = (): SessionState => ({
  cardIndex: 0,
  unresolved: [...STUDENT_IDS],
  productionFailed: [],
  observations: emptyObservations(),
  events: [],
  history: [],
})

export const recordStudentOutcome = (
  state: SessionState,
  studentId: StudentId,
  outcome: Extract<Outcome, 'produce_success' | 'produce_failure' | 'imitate_success' | 'imitate_failure'>,
  createdAt = Date.now(),
): SessionState => {
  if (!state.unresolved.includes(studentId)) return state

  const event = { cardId: currentCardId(state), studentId, outcome, createdAt }
  const events = [...state.events, event]

  if (outcome === 'produce_failure') {
    return withHistory(state, {
      cardIndex: state.cardIndex,
      unresolved: [...state.unresolved],
      productionFailed: state.productionFailed.includes(studentId)
        ? [...state.productionFailed]
        : [...state.productionFailed, studentId],
      observations: cloneObservations(state.observations),
      events,
    })
  }

  return withHistory(state, {
    cardIndex: state.cardIndex,
    unresolved: state.unresolved.filter((id) => id !== studentId),
    productionFailed: state.productionFailed.filter((id) => id !== studentId),
    observations: cloneObservations(state.observations),
    events,
  })
}

export const recordObservation = (
  state: SessionState,
  studentId: StudentId,
  outcome: Extract<Outcome, 'watch_success' | 'watch_failure' | 'listen_success' | 'listen_failure'>,
  createdAt = Date.now(),
): SessionState => {
  if (!state.unresolved.includes(studentId)) return state

  const observations = cloneObservations(state.observations)
  if (outcome === 'watch_success') observations[studentId].watch = 'positive'
  if (outcome === 'watch_failure') observations[studentId].watch = 'negative'
  if (outcome === 'listen_success') observations[studentId].listen = 'positive'
  if (outcome === 'listen_failure') observations[studentId].listen = 'negative'

  return withHistory(state, {
    cardIndex: state.cardIndex,
    unresolved: [...state.unresolved],
    productionFailed: [...state.productionFailed],
    observations,
    events: [
      ...state.events,
      { cardId: currentCardId(state), studentId, outcome, createdAt },
    ],
  })
}

export const advanceWithoutEvidence = (state: SessionState): SessionState =>
  withHistory(state, resetForNextCard(state, [...state.events]))

export const recordAllOutcomeAndAdvance = (
  state: SessionState,
  outcome: Extract<Outcome, 'produce_success' | 'produce_failure' | 'imitate_success' | 'imitate_failure'>,
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
  const nextEvents = [...state.events, ...events]

  if (outcome === 'produce_failure') {
    return withHistory(state, {
      cardIndex: state.cardIndex,
      unresolved: [...state.unresolved],
      productionFailed: Array.from(new Set([...state.productionFailed, ...state.unresolved])),
      observations: cloneObservations(state.observations),
      events: nextEvents,
    })
  }

  return withHistory(state, resetForNextCard(state, nextEvents))
}

export const undoSession = (state: SessionState): SessionState => {
  const previous = state.history.at(-1)
  if (!previous) return state

  return {
    cardIndex: previous.cardIndex,
    unresolved: [...previous.unresolved],
    productionFailed: [...previous.productionFailed],
    observations: cloneObservations(previous.observations),
    events: previous.events.map((event) => ({ ...event })),
    history: state.history.slice(0, -1),
  }
}
