export type StudentId = 'a' | 'b' | 'c'
export type DeckMode = 'alphabet' | 'blends' | 'digraphs' | 'trigraphs'
export type CardTone = 'vowel' | 'stop' | 'fricative' | 'affricate' | 'nasal' | 'approximant' | 'mixed' | 'blend'

export type PhonicsCard = {
  id: string
  label: string
  tone: CardTone
}

export type Outcome =
  | 'produce_success'
  | 'produce_failure'
  | 'imitate_success'
  | 'imitate_failure'
  | 'watch_success'
  | 'watch_failure'
  | 'listen_success'
  | 'listen_failure'

export type AssessmentOutcome = Extract<
  Outcome,
  'produce_success' | 'produce_failure' | 'imitate_success' | 'imitate_failure'
>

export type ObservationOutcome = Extract<
  Outcome,
  'watch_success' | 'watch_failure' | 'listen_success' | 'listen_failure'
>

export type AttentionValue = 'positive' | 'negative' | null

export type ObservationState = {
  watch: AttentionValue
  listen: AttentionValue
}

export type MockEvidenceEvent = {
  deckMode: DeckMode
  cardId: string
  studentId: StudentId
  outcome: Outcome
  createdAt: number
}

export type SessionSnapshot = {
  deckMode: DeckMode
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

const alphabet = (label: string, tone: CardTone): PhonicsCard => ({
  id: `alphabet-${label.toLowerCase()}`,
  label,
  tone,
})

export const PHONICS_DECKS: Record<DeckMode, PhonicsCard[]> = {
  alphabet: [
    alphabet('A', 'vowel'), alphabet('B', 'stop'), alphabet('C', 'mixed'), alphabet('D', 'stop'),
    alphabet('E', 'vowel'), alphabet('F', 'fricative'), alphabet('G', 'stop'), alphabet('H', 'fricative'),
    alphabet('I', 'vowel'), alphabet('J', 'affricate'), alphabet('K', 'stop'), alphabet('L', 'approximant'),
    alphabet('M', 'nasal'), alphabet('N', 'nasal'), alphabet('O', 'vowel'), alphabet('P', 'stop'),
    alphabet('Q', 'mixed'), alphabet('R', 'approximant'), alphabet('S', 'fricative'), alphabet('T', 'stop'),
    alphabet('U', 'vowel'), alphabet('V', 'fricative'), alphabet('W', 'approximant'), alphabet('X', 'mixed'),
    alphabet('Y', 'mixed'), alphabet('Z', 'fricative'),
  ],
  blends: ['BL', 'CL', 'FL', 'GL', 'PL', 'SL', 'BR', 'CR', 'DR', 'FR', 'GR', 'PR', 'TR', 'SK', 'SM', 'SN', 'SP', 'ST', 'SW'].map((label) => ({
    id: `blend-${label.toLowerCase()}`,
    label,
    tone: 'blend' as const,
  })),
  digraphs: [
    { id: 'digraph-ch', label: 'CH', tone: 'affricate' },
    { id: 'digraph-sh', label: 'SH', tone: 'fricative' },
    { id: 'digraph-th', label: 'TH', tone: 'fricative' },
    { id: 'digraph-ph', label: 'PH', tone: 'fricative' },
    { id: 'digraph-wh', label: 'WH', tone: 'approximant' },
    { id: 'digraph-ng', label: 'NG', tone: 'nasal' },
    { id: 'digraph-ck', label: 'CK', tone: 'stop' },
    { id: 'digraph-qu', label: 'QU', tone: 'mixed' },
  ],
  trigraphs: [
    { id: 'trigraph-tch', label: 'TCH', tone: 'affricate' },
    { id: 'trigraph-dge', label: 'DGE', tone: 'affricate' },
    { id: 'trigraph-igh', label: 'IGH', tone: 'vowel' },
  ],
}

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
  deckMode: state.deckMode,
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

export const getDeck = (mode: DeckMode) => PHONICS_DECKS[mode]

export const getCurrentCard = (state: SessionState) => {
  const deck = getDeck(state.deckMode)
  return deck[state.cardIndex] ?? deck[0]
}

export const getNextCard = (state: SessionState) => {
  const deck = getDeck(state.deckMode)
  return deck[(state.cardIndex + 1) % deck.length] ?? deck[0]
}

const nextCardIndex = (state: SessionState) => {
  const deck = getDeck(state.deckMode)
  return (state.cardIndex + 1) % deck.length
}

const resetMarkers = () => ({
  unresolved: [...STUDENT_IDS],
  productionFailed: [] as StudentId[],
  observations: emptyObservations(),
})

const resetForNextCard = (state: SessionState, events: MockEvidenceEvent[]): SessionSnapshot => ({
  deckMode: state.deckMode,
  cardIndex: nextCardIndex(state),
  ...resetMarkers(),
  events,
})

const removeLatestEvent = (
  events: MockEvidenceEvent[],
  predicate: (event: MockEvidenceEvent) => boolean,
) => {
  let index = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event && predicate(event)) {
      index = i
      break
    }
  }
  if (index < 0) return [...events]
  return [...events.slice(0, index), ...events.slice(index + 1)]
}

export const createInitialSession = (): SessionState => ({
  deckMode: 'alphabet',
  cardIndex: 0,
  ...resetMarkers(),
  events: [],
  history: [],
})

export const setDeckMode = (state: SessionState, deckMode: DeckMode): SessionState => {
  if (state.deckMode === deckMode) return state
  return withHistory(state, {
    deckMode,
    cardIndex: 0,
    ...resetMarkers(),
    events: [...state.events],
  })
}

export const recordStudentOutcome = (
  state: SessionState,
  studentId: StudentId,
  outcome: AssessmentOutcome,
  createdAt = Date.now(),
): SessionState => {
  if (!state.unresolved.includes(studentId)) return state

  const card = getCurrentCard(state)

  if (outcome === 'produce_failure' && state.productionFailed.includes(studentId)) {
    return withHistory(state, {
      ...snapshot(state),
      productionFailed: state.productionFailed.filter((id) => id !== studentId),
      events: removeLatestEvent(
        state.events,
        (event) => event.deckMode === state.deckMode && event.cardId === card.id && event.studentId === studentId && event.outcome === 'produce_failure',
      ),
    })
  }

  const event: MockEvidenceEvent = {
    deckMode: state.deckMode,
    cardId: card.id,
    studentId,
    outcome,
    createdAt,
  }
  const events = [...state.events, event]

  if (outcome === 'produce_failure') {
    return withHistory(state, {
      deckMode: state.deckMode,
      cardIndex: state.cardIndex,
      unresolved: [...state.unresolved],
      productionFailed: [...state.productionFailed, studentId],
      observations: cloneObservations(state.observations),
      events,
    })
  }

  const unresolved = state.unresolved.filter((id) => id !== studentId)
  if (unresolved.length === 0) {
    return withHistory(state, resetForNextCard(state, events))
  }

  return withHistory(state, {
    deckMode: state.deckMode,
    cardIndex: state.cardIndex,
    unresolved,
    productionFailed: state.productionFailed.filter((id) => id !== studentId),
    observations: cloneObservations(state.observations),
    events,
  })
}

export const recordObservations = (
  state: SessionState,
  studentId: StudentId,
  outcomes: ObservationOutcome[],
  createdAt = Date.now(),
): SessionState => {
  if (!state.unresolved.includes(studentId) || outcomes.length === 0) return state

  const card = getCurrentCard(state)
  const observations = cloneObservations(state.observations)
  let events = [...state.events]

  for (const outcome of outcomes) {
    const isWatch = outcome.startsWith('watch_')
    const value: AttentionValue = outcome.endsWith('_success') ? 'positive' : 'negative'
    const key = isWatch ? 'watch' : 'listen'
    const previous = observations[studentId][key]
    const relatedOutcomes: Outcome[] = isWatch
      ? ['watch_success', 'watch_failure']
      : ['listen_success', 'listen_failure']

    events = removeLatestEvent(
      events,
      (event) => event.deckMode === state.deckMode && event.cardId === card.id && event.studentId === studentId && relatedOutcomes.includes(event.outcome),
    )

    if (previous === value) {
      observations[studentId][key] = null
    } else {
      observations[studentId][key] = value
      events = [...events, { deckMode: state.deckMode, cardId: card.id, studentId, outcome, createdAt }]
    }
  }

  return withHistory(state, {
    deckMode: state.deckMode,
    cardIndex: state.cardIndex,
    unresolved: [...state.unresolved],
    productionFailed: [...state.productionFailed],
    observations,
    events,
  })
}

export const recordObservation = (
  state: SessionState,
  studentId: StudentId,
  outcome: ObservationOutcome,
  createdAt = Date.now(),
): SessionState => recordObservations(state, studentId, [outcome], createdAt)

export const advanceWithoutEvidence = (state: SessionState): SessionState =>
  withHistory(state, resetForNextCard(state, [...state.events]))

export const recordAllOutcomeAndAdvance = (
  state: SessionState,
  outcome: AssessmentOutcome,
  createdAt = Date.now(),
): SessionState => {
  if (state.unresolved.length === 0) return state

  const card = getCurrentCard(state)

  if (outcome === 'produce_failure' && state.unresolved.every((id) => state.productionFailed.includes(id))) {
    let events = [...state.events]
    for (const studentId of state.unresolved) {
      events = removeLatestEvent(
        events,
        (event) => event.deckMode === state.deckMode && event.cardId === card.id && event.studentId === studentId && event.outcome === 'produce_failure',
      )
    }
    return withHistory(state, {
      deckMode: state.deckMode,
      cardIndex: state.cardIndex,
      unresolved: [...state.unresolved],
      productionFailed: state.productionFailed.filter((id) => !state.unresolved.includes(id)),
      observations: cloneObservations(state.observations),
      events,
    })
  }

  const events = state.unresolved.map((studentId) => ({
    deckMode: state.deckMode,
    cardId: card.id,
    studentId,
    outcome,
    createdAt,
  } as MockEvidenceEvent))
  const nextEvents = [...state.events, ...events]

  if (outcome === 'produce_failure') {
    return withHistory(state, {
      deckMode: state.deckMode,
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
    deckMode: previous.deckMode,
    cardIndex: previous.cardIndex,
    unresolved: [...previous.unresolved],
    productionFailed: [...previous.productionFailed],
    observations: cloneObservations(previous.observations),
    events: previous.events.map((event) => ({ ...event })),
    history: state.history.slice(0, -1),
  }
}
