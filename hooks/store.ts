import type { Crab, CrabLook, CrabState, Db, BoardSettings, Workspace } from '../types'
import { COLORS, DEFAULT_LOOK, hash } from './crabs'

export function defaultDb(): Db {
  return {
    tab: 'crew',
    crabs: {},
    selected: 'main',
    filter: 'all',
    turns: [],
    usage: null,
    history: [],
    todos: [],
    editingCrab: 'main',
    previewState: 'coding',
    mapSelected: null,
    mapStale: false,
    paneClosed: false,
    lastClose: null,
  }
}

export const DEFAULT_WORKSPACES: Workspace[] = [
  { id: 'crew', name: 'Crab Crew', hidden: false },
  { id: 'tide', name: 'The Tide', hidden: false },
  { id: 'burrow', name: 'The Burrow', hidden: false },
  { id: 'shell', name: 'Under the Shell', hidden: false },
  { id: 'house', name: 'Crab House', hidden: false },
]

export function defaultSettings(): BoardSettings {
  return {
    workspaces: DEFAULT_WORKSPACES.map(w => ({ ...w })),
    layout: 'decorative',
    reducedMotion: false,
    idle: true,
    colony: 'beach',
    level: 'beginner',
    autoExplain: false,
    autoOpen: true,
    strip: true,
    looks: { main: { ...DEFAULT_LOOK, hat: 'party' } },
  }
}

/** Merge stored settings over defaults so new fields always exist. */
export function mergeSettings(stored: unknown): BoardSettings {
  const d = defaultSettings()
  if (!stored || typeof stored !== 'object') return d
  const s = stored as Partial<BoardSettings>
  const ws: Workspace[] = []
  for (const w of s.workspaces ?? []) {
    const def = d.workspaces.find(x => x.id === w.id)
    if (def && !ws.some(x => x.id === w.id)) ws.push({ id: w.id, name: String(w.name || def.name).slice(0, 40), hidden: w.id === 'house' ? false : !!w.hidden })
  }
  for (const def of d.workspaces) if (!ws.some(x => x.id === def.id)) ws.push(def)
  return {
    workspaces: ws,
    layout: s.layout === 'compact' ? 'compact' : 'decorative',
    reducedMotion: !!s.reducedMotion,
    idle: s.idle !== false,
    colony: s.colony === 'row' || s.colony === 'grid' ? s.colony : 'beach',
    level: s.level === 'intermediate' || s.level === 'advanced' ? s.level : 'beginner',
    autoExplain: !!s.autoExplain,
    autoOpen: s.autoOpen !== false,
    strip: s.strip !== false,
    looks: { ...d.looks, ...(s.looks ?? {}) },
  }
}

const SUB_COLORS = Object.keys(COLORS).filter(c => c !== 'coral')

export function lookFor(crab: Pick<Crab, 'id' | 'key' | 'kind'>, settings: BoardSettings): CrabLook {
  const own = settings.looks[crab.id]
  if (own) return own
  const typed = settings.looks[crab.key]
  if (typed) return typed
  if (crab.kind === 'main') return { ...DEFAULT_LOOK, hat: 'party' }
  const h = hash(crab.id)
  return { ...DEFAULT_LOOK, color: SUB_COLORS[h % SUB_COLORS.length] ?? 'ocean', anim: (['scuttle', 'bob', 'dance'] as const)[h % 3] ?? 'bob' }
}

export function nameFor(crab: Crab, settings: BoardSettings): string {
  return settings.looks[crab.id]?.name || settings.looks[crab.key]?.name || crab.name
}

const NAMES = ['Pinchy', 'Clawdia', 'Snips', 'Bubbles', 'Shelly', 'Coral', 'Barnacle', 'Kelp', 'Nibbles', 'Scuttle', 'Pebble', 'Marina', 'Clacks', 'Sandy', 'Tidus', 'Brine', 'Krill', 'Nautilus']

export function autoName(id: string, taken: string[]): string {
  const h = hash(id)
  for (let i = 0; i < NAMES.length; i++) {
    const n = NAMES[(h + i) % NAMES.length] ?? 'Crab'
    if (!taken.includes(n)) return n
  }
  return `Crab ${taken.length + 1}`
}

export function newCrab(id: string, now: number, partial: Partial<Crab>, taken: string[]): Crab {
  const isMain = id === 'main'
  const agentType = partial.agentType || (isMain ? 'main' : 'general-purpose')
  return {
    id,
    key: isMain ? 'main' : `type:${agentType}`,
    name: isMain ? 'Clawde' : autoName(id, taken),
    kind: isMain ? 'main' : 'sub',
    agentType,
    description: '',
    state: 'waiting' as CrabState,
    task: '',
    activity: isMain ? 'Waiting for your first message' : 'Starting up',
    files: [],
    lastResult: '',
    startedAt: now,
    updatedAt: now,
    tools: 0,
    errors: 0,
    status: isMain ? 'idle' : 'running',
    tokensIn: 0,
    tokensOut: 0,
    ...partial,
  }
}
