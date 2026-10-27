export type CrabState = 'exploring' | 'coding' | 'debugging' | 'testing' | 'waiting' | 'finished'

export type Crab = {
  id: string
  /** Customization key: 'main' or 'type:<agentType>' */
  key: string
  name: string
  kind: 'main' | 'sub'
  agentType: string
  description: string
  state: CrabState
  task: string
  activity: string
  files: string[]
  lastResult: string
  startedAt: number
  updatedAt: number
  tools: number
  errors: number
  status: string
  parentId?: string
  tokensIn: number
  tokensOut: number
}

export type EventKind =
  | 'prompt'
  | 'read'
  | 'search'
  | 'edit'
  | 'write'
  | 'command'
  | 'test'
  | 'error'
  | 'agent'
  | 'task'
  | 'turn'
  | 'web'
  | 'waiting'
  | 'other'

export type TimelineEvent = {
  id: string
  t: number
  agentId: string
  kind: EventKind
  title: string
  detail: string
  plain: string
  files: string[]
  isError?: boolean
  diff?: string
  important?: boolean
}

export type TokenTurn = {
  t: number
  agentId: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  model: string
  durationMs: number
}

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type ContextSlice = { name: string; tokens: number; kind: string }

export type UsageSnap = {
  at: number
  model: string
  contextTokens?: number
  contextWindow: number
  contextPercent?: number
  rateLimits: RateLimit[]
  costUsd?: number
  breakdown?: ContextSlice[]
  autoCompactAt?: number
  breakdownAt?: number
}

export type UsageSample = { t: number; fiveHour?: number; weekly?: number; context?: number }

export type Layer =
  | 'frontend'
  | 'api'
  | 'backend'
  | 'database'
  | 'integrations'
  | 'infra'
  | 'tests'
  | 'config'

export type MapComponent = {
  id: string
  layer: Layer
  label: string
  files: string[]
  fileCount: number
  tech: string[]
  summary: string
}

export type MapEdge = { from: string; to: string; weight: number }

export type Tech = { name: string; category: string; what: string; evidence: string }

export type ProjectMap = {
  root: string
  scannedAt: number
  fileCount: number
  truncated: boolean
  components: MapComponent[]
  edges: MapEdge[]
  stack: Tech[]
  languages: { name: string; files: number }[]
  importsScanned: number
}

export type Level = 'beginner' | 'intermediate' | 'advanced'

export type QuizQ = { q: string; options: string[]; answer: number; why: string }

export type Lesson = {
  id: string
  t: number
  level: Level
  title: string
  body: string
  quiz: QuizQ[]
  answers: (number | null)[]
}

export type WorkspaceId = 'crew' | 'tide' | 'burrow' | 'shell' | 'house'

export type Workspace = { id: WorkspaceId; name: string; hidden: boolean }

export type CrabLook = {
  name?: string
  color: string
  shell: string
  hat: string
  anim: string
  skin: string
}

export type BoardSettings = {
  workspaces: Workspace[]
  layout: 'compact' | 'decorative'
  reducedMotion: boolean
  idle: boolean
  colony: 'beach' | 'row' | 'grid'
  level: Level
  autoExplain: boolean
  /** Open the panel by itself: when the desktop app attaches, and again on every message if it is not showing. */
  autoOpen: boolean
  /** Show the clickable strip above the prompt box. */
  strip: boolean
  looks: Record<string, CrabLook>
}

export type TodoItem = { id: string; subject: string; status: string }

export type Db = {
  tab: WorkspaceId
  crabs: Record<string, Crab>
  selected: string | null
  filter: string
  turns: TokenTurn[]
  usage: UsageSnap | null
  history: UsageSample[]
  todos: TodoItem[]
  editingCrab: string
  previewState: CrabState
  mapSelected: string | null
  mapStale: boolean
  /** Closed with `/clawboard close`: stay closed until the person opens it again. */
  paneClosed: boolean
  /** Who closed the pane last and when, shown in Crab House so a vanishing panel can be explained. */
  lastClose: { by: string; at: number } | null
}

export type AiState = {
  text: Record<string, string>
  busy: Record<string, boolean>
  lessons: Lesson[]
}

declare module 'claude-code' {
  interface PluginState {
    clawboard: {
      db: Db
      log: TimelineEvent[]
      map: ProjectMap | null
      ai: AiState
      settings: BoardSettings
    }
  }
}
