// The engine calls Clawboard's helpers need. Each hook builds one of these
// from its own `$` (the engine wants `$` spelled only at the call site).
import type {
  AgentInfo,
  FsEntry,
  ModelCompleteRequest,
  ModelCompleteResult,
  ModelForkRequest,
  ModelForkResult,
  SessionUsage,
  SessionUsageArgs,
} from 'claude-code'
import type { AiState, Db, ProjectMap, BoardSettings, TimelineEvent } from '../types'

export type IO = {
  now: () => Promise<number>
  db: () => Promise<Db>
  setDb: (fn: (v: Db) => Db) => Promise<Db>
  log: () => Promise<TimelineEvent[]>
  setLog: (fn: (v: TimelineEvent[]) => TimelineEvent[]) => Promise<TimelineEvent[]>
  map: () => Promise<ProjectMap | null>
  setMap: (fn: (v: ProjectMap | null) => ProjectMap | null) => Promise<ProjectMap | null>
  ai: () => Promise<AiState>
  setAi: (fn: (v: AiState) => AiState) => Promise<AiState>
  settings: () => Promise<BoardSettings>
  setSettings: (fn: (v: BoardSettings) => BoardSettings) => Promise<BoardSettings>
  cwd: () => Promise<string>
  model: () => Promise<string>
  complete: (r: ModelCompleteRequest) => Promise<ModelCompleteResult>
  fork: (r: ModelForkRequest) => Promise<ModelForkResult>
  usage: (a?: SessionUsageArgs) => Promise<SessionUsage>
  agents: () => Promise<AgentInfo[]>
  list: (path: string) => Promise<FsEntry[]>
  readFile: (path: string) => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  view: (agentId: string) => Promise<unknown>
}

export async function dbGet<K extends keyof Db>(io: IO, k: K): Promise<Db[K]> {
  return (await io.db())[k]
}
export async function dbSet<K extends keyof Db>(io: IO, k: K, fn: (v: Db[K]) => Db[K]): Promise<Db[K]> {
  return (await io.setDb(d => ({ ...d, [k]: fn(d[k]) })))[k]
}
export async function aiGet<K extends keyof AiState>(io: IO, k: K): Promise<AiState[K]> {
  return (await io.ai())[k]
}
export async function aiSet<K extends keyof AiState>(io: IO, k: K, fn: (v: AiState[K]) => AiState[K]): Promise<AiState[K]> {
  return (await io.setAi(d => ({ ...d, [k]: fn(d[k]) })))[k]
}
