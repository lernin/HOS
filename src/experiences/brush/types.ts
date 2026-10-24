import type { UploadJobView, UploadSnapshot, UploadStatus } from './uploads'

export type { UploadJobView, UploadSnapshot, UploadStatus }

export type FaceBox = { x: number, y: number, w: number, h: number }

export type BrushImage = {
  id: string
  drive_file_id: string
  name: string
  country: string
  folder_path: string
  series: string | null
  mime_type: string
  source: string
  prompt_text: string | null
  prompt_source?: string | null
  elo: number
  sigma: number
  games: number
  wins: number
  losses: number
  close_wins?: number
  close_losses?: number
  trash_count: number
  trashed: boolean
  archived?: boolean
  preview_url?: string
  has_thumbnail?: boolean
  createdAt?: number
  perceptual_hash?: string | null
  face_box?: FaceBox | null
  face_scanned?: boolean
  bad_tag_ids?: string[]
}

export type Margin = 'clear' | 'close'

export type ContestPhase = 'qualifying' | 'finals' | 'champion'

export type RoundMatch = {
  leftId: string
  rightId: string
  winnerId: string | null
}

export type ContestState = {
  phase: ContestPhase
  rounds: RoundMatch[][]
  championId: string | null
}

export type BrushTag = {
  id: string
  category: string
  label: string
  status: 'live' | 'suggested' | 'rejected'
  source: string
  sort: number
  likes: number
  bads: number
}

export type BrushAttribute = {
  trait: string
  value: string
  source: string
  confidence: number | null
  images?: number
  wins?: number
  games?: number
  trashes?: number
}

export type PairResult =
  | { ready: true, active: number, total: number, left: BrushImage, right: BrushImage }
  | { ready: false, reason: string, active: number, total: number }

export type TurnOffs = {
  trashed: number
  tags: { id: string, category: string, label: string, images: number }[]
}

export type Insights = {
  images: number
  active: number
  trashed: number
  matches: number
  tags: BrushTag[]
  attributes: BrushAttribute[]
  combinations: { left: string, right: string, together: number }[]
  turn_offs: TurnOffs
  recipe: { body: string, created_at: string } | null
}

export type TrashImage = BrushImage & { bad_tag_ids: string[] }

export type RecordInput = {
  leftId: string
  rightId: string
  decision: 'pick' | 'trash'
  winnerId?: string | null
  trashLeft?: boolean
  trashRight?: boolean
  tagIds: string[]
  decidedMs?: number
  margin?: Margin
}

export type BrushApi = {
  status: () => Promise<{ pin_set: boolean }>
  setPin: (current: string | null, next: string) => Promise<void>
  unlock: (brushPin: string) => Promise<void>
  nextPair: () => Promise<PairResult>
  record: (input: RecordInput) => Promise<{ match_id: string | null }>
  annotate: (matchId: string, tagIds: string[]) => Promise<void>
  contest: () => Promise<ContestState>
  saveContest: (state: ContestState) => Promise<void>
  setPhash: (imageId: string, hash: string) => Promise<void>
  setFaceBox: (imageId: string, faceBox: FaceBox | null) => Promise<void>
  leaderboard: () => Promise<BrushImage[]>
  library: () => Promise<BrushImage[]>
  tags: () => Promise<BrushTag[]>
  insights: () => Promise<Insights>
  trashed: () => Promise<TrashImage[]>
  saveTrashTags: (imageId: string, tagIds: string[]) => Promise<void>
  restore: (imageId: string) => Promise<void>
  reviewTag: (tagId: string, decision: 'approve' | 'reject') => Promise<void>
  suggestTag: (category: string, label: string, source: 'ai' | 'admin' | 'scout') => Promise<void>
  detail: (imageId: string) => Promise<{ image: BrushImage, attributes: BrushAttribute[] }>
  setPrompt: (imageId: string, prompt: string) => Promise<void>
  saveRecipe: (body: string) => Promise<void>
  sync: (onProgress: (message: string) => void) => Promise<void>
  subscribeUploads: (listener: (snapshot: UploadSnapshot) => void) => () => void
  enqueueUploads: (files: File[]) => { accepted: number, overflow: number }
  retryUpload: (id: string) => void
  resumeUploads: () => Promise<void>
  pauseUploads: () => void
  autoTag: (imageId: string) => Promise<{ suggested: number }>
  backfill: (tag: BrushTag, onProgress: (done: number, total: number) => void) => Promise<void>
}
