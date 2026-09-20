import { useEffect, useMemo, useState } from 'react'
import './engagement-lab.css'

type Mode = 'Standalone' | 'Decompose' | 'Compose'
type Level = { level: number; label: string; short: string }
type PresetKey = 'umbrella' | 'pencil' | 'l-sound'

type Preset = {
  key: PresetKey
  label: string
  target: string
  cue: string
  korean: string
  letters: string[]
  chunks: string[]
  sentence: string
  sentenceGap: string
  choices2: string[]
  choices4: string[]
  definition: string
}

const MODES: Mode[] = ['Standalone', 'Decompose', 'Compose']

export const ENGAGEMENT_LEVELS: Level[] = [
  { level: 0, label: 'Ignore', short: 'Present, no attention' },
  { level: 1, label: 'Observe', short: 'Attend, no response' },
  { level: 2, label: 'Imitate', short: 'Copy the model' },
  { level: 3, label: 'Verify', short: 'True / false' },
  { level: 4, label: 'Choose from 2', short: 'Pick from two' },
  { level: 5, label: 'Choose from 4', short: 'Pick from four' },
  { level: 6, label: 'Match', short: 'Pair complete items' },
  { level: 7, label: 'Reorder with model', short: 'Rebuild while seeing it' },
  { level: 8, label: 'Reorder from concept cue', short: 'Rebuild from a cue' },
  { level: 9, label: 'Construct from supplied parts', short: 'Build from a bank' },
  { level: 10, label: 'Complete partial target', short: 'Fill missing parts' },
  { level: 11, label: 'Produce with form hint', short: 'Use a structural hint' },
  { level: 12, label: 'Produce from direct cue', short: 'Cue only' },
  { level: 13, label: 'Produce from context', short: 'Infer from context' },
  { level: 14, label: 'Recall', short: 'Minimal cue' },
  { level: 15, label: 'Apply', short: 'Use it in something new' },
]

const PRESETS: Record<PresetKey, Preset> = {
  umbrella: {
    key: 'umbrella',
    label: 'umbrella',
    target: 'umbrella',
    cue: '☂️',
    korean: '우산',
    letters: ['u', 'm', 'b', 'r', 'e', 'l', 'l', 'a'],
    chunks: ['um', 'brel', 'la'],
    sentence: 'I opened my umbrella because it started raining.',
    sentenceGap: 'I opened my ______ because it started raining.',
    choices2: ['umbrella', 'pencil'],
    choices4: ['umbrella', 'pencil', 'window', 'elephant'],
    definition: 'something you hold over your head to keep rain off',
  },
  pencil: {
    key: 'pencil',
    label: 'pencil',
    target: 'pencil',
    cue: '✏️',
    korean: '연필',
    letters: ['p', 'e', 'n', 'c', 'i', 'l'],
    chunks: ['pen', 'cil'],
    sentence: 'I wrote my name with a pencil.',
    sentenceGap: 'I wrote my name with a ______.',
    choices2: ['pencil', 'umbrella'],
    choices4: ['pencil', 'umbrella', 'bottle', 'window'],
    definition: 'a tool used for writing or drawing, usually with graphite inside',
  },
  'l-sound': {
    key: 'l-sound',
    label: 'L /l/',
    target: 'L /l/',
    cue: 'L',
    korean: 'ㄹ 소리와 비교해 보기',
    letters: ['L'],
    chunks: ['/l/'],
    sentence: 'The letter L can represent the /l/ sound.',
    sentenceGap: 'The letter ___ can represent the /l/ sound.',
    choices2: ['L', 'R'],
    choices4: ['L', 'R', 'M', 'N'],
    definition: 'the letter L and the /l/ sound studied as a target in their own right',
  },
}

const deterministicScramble = (parts: string[]) => {
  if (parts.length < 2) return parts
  return [...parts.slice(2), ...parts.slice(0, 2)]
}

const answerFor = (preset: Preset, mode: Mode) => {
  if (mode === 'Standalone') return preset.target
  if (mode === 'Decompose') return preset.letters.join(' ')
  return preset.sentence
}

const modePrompt = (preset: Preset, mode: Mode) => {
  if (mode === 'Standalone') return `Work with “${preset.target}” as the target itself.`
  if (mode === 'Decompose') return `Explore the internal parts of “${preset.target}”.`
  return `Build larger language outward from “${preset.target}”.`
}

export function EngagementLab({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<Mode>('Standalone')
  const [level, setLevel] = useState(12)
  const [presetKey, setPresetKey] = useState<PresetKey>('umbrella')
  const [response, setResponse] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selectedTokens, setSelectedTokens] = useState<string[]>([])
  const [matched, setMatched] = useState<string[]>([])

  const preset = PRESETS[presetKey]
  const currentLevel = ENGAGEMENT_LEVELS[level]

  const resetExperience = () => {
    setResponse('')
    setFeedback('')
    setSelectedTokens([])
    setMatched([])
  }

  useEffect(() => resetExperience(), [mode, level, presetKey])

  const parts = useMemo(() => {
    if (mode === 'Compose') return preset.sentence.replace(/[.,]/g, '').split(' ')
    if (mode === 'Decompose') return preset.letters
    return preset.letters
  }, [mode, preset])

  const scrambled = useMemo(() => deterministicScramble(parts), [parts])
  const bank = useMemo(() => [...scrambled, ...(mode === 'Compose' ? ['blue', 'quickly'] : ['x', 't'])], [scrambled, mode])

  const checkText = (expected: string) => {
    const clean = (value: string) => value.toLowerCase().replace(/[^a-z/ ]/g, '').replace(/\s+/g, ' ').trim()
    setFeedback(clean(response) === clean(expected) ? 'Correct.' : `Try again. Target: ${expected}`)
  }

  const choose = (value: string, expected: string) => {
    setResponse(value)
    setFeedback(value.toLowerCase() === expected.toLowerCase() ? 'Correct.' : 'Not this one. Try again.')
  }

  const addToken = (token: string, sourceIndex: number) => {
    setSelectedTokens(current => [...current, token])
    setMatched(current => [...current, `${token}:${sourceIndex}`])
    setFeedback('')
  }

  const tokenUsed = (token: string, index: number) => matched.includes(`${token}:${index}`)

  const checkTokens = (expected: string[]) => {
    const actual = selectedTokens.join(' ').toLowerCase()
    const goal = expected.join(' ').toLowerCase()
    setFeedback(actual === goal ? 'Correct.' : `Not yet. You built: ${selectedTokens.join(' ') || 'nothing'}`)
  }

  const clearTokens = () => {
    setSelectedTokens([])
    setMatched([])
    setFeedback('')
  }

  function renderPassive() {
    if (level === 0) return (
      <div className="el-demo passive ignore-demo">
        <div className="el-background-copy">Today we are exploring the Lab. Somewhere on this page is <span>{preset.target}</span>, but nothing asks you to notice it.</div>
        <div className="el-note">No learner action. The target is merely present.</div>
      </div>
    )
    return (
      <div className="el-demo passive observe-demo">
        <div className="el-cue">{preset.cue}</div>
        <div className="el-model">{mode === 'Decompose' ? preset.letters.join(' · ') : mode === 'Compose' ? preset.sentence : preset.target}</div>
        <div className="el-note">Look and attend. No response is required.</div>
      </div>
    )
  }

  function renderInteraction() {
    if (level <= 1) return renderPassive()

    if (level === 2) {
      const model = mode === 'Standalone' ? preset.target : mode === 'Decompose' ? preset.letters.join(' ') : preset.sentence
      return <div className="el-demo"><div className="el-model">{model}</div><label>Copy the model<input value={response} onChange={e => setResponse(e.target.value)} placeholder="Type exactly what you see" /></label><button onClick={() => checkText(model)}>Check</button></div>
    }

    if (level === 3) {
      const statement = mode === 'Standalone'
        ? `${preset.cue} means “${preset.target}”.`
        : mode === 'Decompose'
          ? `The letters shown belong to “${preset.target}”: ${preset.letters.join(' · ')}`
          : `This uses “${preset.target}” naturally: “${preset.sentence}”`
      return <div className="el-demo"><div className="el-question">{statement}</div><div className="el-choice-row"><button onClick={() => choose('True', 'True')}>True</button><button onClick={() => choose('False', 'True')}>False</button></div></div>
    }

    if (level === 4 || level === 5) {
      const base = level === 4 ? preset.choices2 : preset.choices4
      const choices = mode === 'Standalone'
        ? base
        : mode === 'Decompose'
          ? level === 4 ? [preset.letters[0], 'z'] : [preset.letters[0], 'z', 'q', 'v']
          : level === 4 ? [preset.sentence, `I ${preset.target} the rain.`] : [preset.sentence, `The ${preset.target} quickly blue.`, `I am ${preset.target} yesterday.`, `${preset.target} because pencil.`]
      const expected = choices[0]
      return <div className="el-demo"><div className="el-cue">{preset.cue}</div><div className="el-question">Choose the best answer.</div><div className="el-choice-grid">{choices.map(choice => <button key={choice} onClick={() => choose(choice, expected)}>{choice}</button>)}</div></div>
    }

    if (level === 6) {
      const pairs = mode === 'Standalone'
        ? [[preset.cue, preset.target], ['✏️', 'pencil'], ['🐘', 'elephant']]
        : mode === 'Decompose'
          ? [[preset.letters[0], `first part of ${preset.target}`], [preset.letters.at(-1) || '', `last part of ${preset.target}`], [String(preset.letters.length), 'number of letters']]
          : [[preset.target, preset.sentence], ['rain', 'It started raining.'], ['write', 'I wrote my name.']]
      return <div className="el-demo"><div className="el-question">Match each left item to its partner. For this prototype, tap the correct complete pair.</div><div className="el-match-grid">{pairs.map(([a,b], index) => <button key={`${a}-${b}`} onClick={() => { setMatched([String(index)]); setFeedback(index === 0 ? 'That is the target pair.' : 'Good pair. Try the target pair too.') }}><strong>{a}</strong><span>↔</span><span>{b}</span></button>)}</div></div>
    }

    if (level === 7 || level === 8 || level === 9) {
      const source = level === 9 ? bank : scrambled
      const expected = parts
      return <div className="el-demo">
        {level === 7 && <div className="el-model">Model: {mode === 'Compose' ? preset.sentence : mode === 'Decompose' ? preset.letters.join(' ') : preset.target}</div>}
        {level >= 8 && <div className="el-cue-row"><span className="el-cue">{preset.cue}</span><span>{level === 8 ? 'Concept cue only' : 'Build from the supplied bank'}</span></div>}
        <div className="el-built">{selectedTokens.length ? selectedTokens.join(mode === 'Standalone' ? '' : ' ') : 'Tap parts to build here'}</div>
        <div className="el-token-bank">{source.map((token, index) => <button className="token" key={`${token}-${index}`} disabled={tokenUsed(token,index)} onClick={() => addToken(token,index)}>{token}</button>)}</div>
        <div className="el-actions"><button onClick={() => checkTokens(expected)}>Check</button><button className="secondary" onClick={clearTokens}>Reset</button></div>
      </div>
    }

    if (level === 10) {
      const shown = mode === 'Standalone' ? `${preset.target.slice(0, Math.max(1, preset.target.length - 3))}___` : mode === 'Decompose' ? `${preset.letters.slice(0, -2).join(' ')} __ __` : preset.sentenceGap
      const expected = answerFor(preset, mode)
      return <div className="el-demo"><div className="el-cue">{preset.cue}</div><div className="el-partial">{shown}</div><label>Complete it<input value={response} onChange={e => setResponse(e.target.value)} placeholder="Enter the complete target" /></label><button onClick={() => checkText(expected)}>Check</button></div>
    }

    if (level === 11) {
      const hint = mode === 'Standalone'
        ? `Starts with “${preset.target[0]}” · ${preset.target.replace(/[^A-Za-z]/g,'').length} letters/characters in the main written form`
        : mode === 'Decompose'
          ? `${preset.letters.length} written parts · first is “${preset.letters[0]}”`
          : `Make one grammatical sentence that includes “${preset.target}”.`
      return <div className="el-demo"><div className="el-cue">{preset.cue}</div><div className="el-hint">Hint: {hint}</div><label>Produce it<input value={response} onChange={e => setResponse(e.target.value)} /></label><button onClick={() => mode === 'Compose' ? setFeedback(response.toLowerCase().includes(preset.target.toLowerCase()) ? 'Contains the target. Now judge whether your sentence makes sense.' : `Use “${preset.target}” in your sentence.`) : checkText(answerFor(preset,mode))}>Check</button></div>
    }

    if (level === 12) {
      const directCue = mode === 'Standalone' ? `${preset.cue}  ${preset.korean}` : mode === 'Decompose' ? `${preset.cue}  Break “${preset.target}” into written parts.` : `Target word: ${preset.target}`
      return <div className="el-demo"><div className="el-direct-cue">{directCue}</div><label>{mode === 'Compose' ? 'Make a sentence' : 'Produce the target'}<input value={response} onChange={e => setResponse(e.target.value)} /></label><button onClick={() => mode === 'Compose' ? setFeedback(response.toLowerCase().includes(preset.target.toLowerCase()) ? 'Target used.' : `Include “${preset.target}”.`) : checkText(answerFor(preset,mode))}>Check</button></div>
    }

    if (level === 13) {
      const context = mode === 'Standalone' ? preset.sentenceGap : mode === 'Decompose' ? `Without seeing the spelling, think of “${preset.target}” and write its parts.` : `Situation: ${preset.definition}. Say something natural that uses “${preset.target}”.`
      return <div className="el-demo"><div className="el-context">{context}</div><label>Your answer<input value={response} onChange={e => setResponse(e.target.value)} /></label><button onClick={() => mode === 'Compose' ? setFeedback(response.toLowerCase().includes(preset.target.toLowerCase()) ? 'Applied in context.' : `Try to include “${preset.target}”.`) : checkText(answerFor(preset,mode))}>Check</button></div>
    }

    if (level === 14) {
      const recallCue = mode === 'Standalone' ? preset.definition : mode === 'Decompose' ? `Recall the internal written structure of the learned target: ${preset.korean}` : `Recall a natural sentence using the learned target. No model is shown.`
      return <div className="el-demo"><div className="el-context minimal">{recallCue}</div><label>Recall<input value={response} onChange={e => setResponse(e.target.value)} autoComplete="off" /></label><button onClick={() => mode === 'Compose' ? setFeedback(response.toLowerCase().includes(preset.target.toLowerCase()) ? 'Retrieved and used.' : `Use the recalled target in your sentence.`) : checkText(answerFor(preset,mode))}>Check</button></div>
    }

    const applyPrompt = mode === 'Standalone'
      ? `New situation: You are leaving home and it is raining. Write what you need or what you will do, using “${preset.target}” naturally.`
      : mode === 'Decompose'
        ? `Apply the same kind of analysis to a related unfamiliar example. For the prototype, explain one useful spelling/sound pattern you notice around “${preset.target}”.`
        : `Create a new sentence or two that uses “${preset.target}” in a situation different from the example you saw.`
    return <div className="el-demo"><div className="el-context apply">{applyPrompt}</div><label>Apply it<textarea value={response} onChange={e => setResponse(e.target.value)} /></label><button onClick={() => setFeedback(response.trim().length > 8 ? 'Good: this is open production. The important question is whether the target knowledge works in the new situation.' : 'Give it a little more language so there is something to judge.')}>Reflect</button></div>
  }

  return (
    <main className="engagement-lab">
      <header className="el-header">
        <button className="el-back" onClick={onExit}>← Lab</button>
        <div><div className="el-eyebrow">Procedia learning experiment</div><h1>Engagement Matrix</h1></div>
      </header>

      <section className="el-controls">
        <div className="el-control-block"><span>Target</span><div className="el-preset-row">{Object.values(PRESETS).map(item => <button key={item.key} className={presetKey === item.key ? 'active' : ''} onClick={() => setPresetKey(item.key)}>{item.label}</button>)}</div></div>
        <div className="el-control-block"><span>Structural mode</span><div className="el-mode-row">{MODES.map(item => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item}</button>)}</div></div>
      </section>

      <section className="el-ladder" aria-label="Engagement levels">
        {ENGAGEMENT_LEVELS.map(item => <button key={item.level} className={level === item.level ? 'active' : ''} onClick={() => setLevel(item.level)}><b>{item.level}</b><span>{item.label}</span></button>)}
      </section>

      <section className="el-matrix-summary">
        <div><small>MODE</small><strong>{mode}</strong></div>
        <div><small>LEVEL</small><strong>{level} · {currentLevel.label}</strong></div>
        <div><small>TARGET</small><strong>{preset.label}</strong></div>
      </section>

      <section className="el-experience-card">
        <div className="el-card-head"><div><div className="el-kicker">{currentLevel.short}</div><h2>{currentLevel.label}</h2></div><div className="el-level-badge">{level}</div></div>
        <p className="el-mode-prompt">{modePrompt(preset, mode)}</p>
        {renderInteraction()}
        {feedback && <div className={`el-feedback${feedback.startsWith('Correct') || feedback.includes('Target used') || feedback.includes('Retrieved') || feedback.includes('Applied') || feedback.startsWith('Good') ? ' good' : ''}`} role="status">{feedback}</div>}
      </section>

      <section className="el-why">
        <strong>What this Lab is testing</strong>
        <p>The vertical ladder changes how much the learner must do. The structural mode changes whether the Atomonym is studied in its own right, broken into parts, or used to build something larger. Not every cell needs to become a permanent learning activity.</p>
      </section>
    </main>
  )
}

export default EngagementLab
