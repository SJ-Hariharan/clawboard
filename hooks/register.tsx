import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { IO } from './io'
import type { Crab, CrabState, TimelineEvent, TokenTurn, UsageSample } from '../types'
import { explainTurnEdits, runScan, saveSettings } from './actions'
import { classify, short, testSummary } from './classify'
import { defaultDb, defaultSettings, mergeSettings, newCrab } from './store'
import { aiSet, dbGet, dbSet } from './io'
import { renderPane } from './views'
import type { Kit } from './views'

const PANE = 'clawboard'
// Prompt origins that are not the person typing: a message from one of these must not count as asking for the panel.
const AUTOMATED: readonly string[] = ['task-notification', 'scheduled-trigger', 'peer', 'peer-send-message', 'projects-relay', 'coordinator', 'observer', 'observer-activity', 'auto-continuation', 'plugin']
const DB = atom({ plugin: 'clawboard', key: 'db' } as const, defaultDb())
const LOG = atom({ plugin: 'clawboard', key: 'log' } as const, [])
const MAP = atom({ plugin: 'clawboard', key: 'map' } as const, null)
const AI = atom({ plugin: 'clawboard', key: 'ai' } as const, { text: {}, busy: {}, lessons: [] })
const SETTINGS = atom({ plugin: 'clawboard', key: 'settings' } as const, defaultSettings())
let root = ''
let bg: IO | undefined
let seq = 0
// Agent tool calls in flight, waiting for their subagent's first event.
const pendingAgents: { desc: string; type: string; prompt: string }[] = []

async function now(io: IO): Promise<number> {
  return io.now()
}

async function pushEvent(io: IO, ev: Omit<TimelineEvent, 'id' | 't'> & { t?: number }): Promise<string> {
  const t = ev.t ?? (await now(io))
  const id = `${t.toString(36)}-${(++seq).toString(36)}`
  await io.setLog(list => [...list, { ...ev, id, t }].slice(-400))
  return id
}

async function patchEvent(io: IO, id: string, patch: Partial<TimelineEvent>) {
  await io.setLog(list => list.map(e => (e.id === id ? { ...e, ...patch } : e)))
}

async function ensureCrab(io: IO, id: string, partial: Partial<Crab> = {}): Promise<void> {
  const crabs = await dbGet(io, 'crabs')
  if (crabs[id]) return
  const t = await now(io)
  let extra: Partial<Crab> = { ...partial }
  if (id !== 'main') {
    try {
      const info = (await io.agents()).find(a => a.id === id)
      if (info) extra = { agentType: info.type, description: info.description, task: info.description, status: info.status, parentId: info.parentId, ...extra }
    } catch {
      /* listing unavailable */
    }
    const pending = pendingAgents.shift()
    if (pending) extra = { agentType: extra.agentType || pending.type, description: extra.description || pending.desc, task: extra.task || pending.desc, ...extra }
  }
  await dbSet(io, 'crabs', cur => {
    if (cur[id]) return cur
    const taken = Object.values(cur).map(c => c.name)
    return { ...cur, [id]: newCrab(id, t, { ...extra, state: id === 'main' ? 'waiting' : 'exploring' }, taken) }
  })
}

async function patchCrab(io: IO, id: string, fn: (c: Crab) => Crab) {
  const t = await now(io)
  await dbSet(io, 'crabs', cur => {
    const c = cur[id]
    if (!c) return cur
    return { ...cur, [id]: { ...fn(c), updatedAt: t } }
  })
}

async function pollUsage(io: IO): Promise<void> {
  try {
    const [u, model, t] = await Promise.all([io.usage(), io.model(), now(io)])
    await dbSet(io, 'usage', prev => ({
      ...(prev ?? {}),
      at: t,
      model,
      contextTokens: u.context.tokens,
      contextWindow: u.context.window,
      contextPercent: u.context.percent,
      rateLimits: u.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
      costUsd: u.cost?.usd,
    }))
    const five = u.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed
    const week = u.rateLimits.find(r => r.kind === 'seven_day')?.percentUsed
    const sample: UsageSample = { t, fiveHour: five, weekly: week, context: u.context.percent }
    if (five === undefined && week === undefined && u.context.percent === undefined) return
    const hist = await dbGet(io, 'history')
    const last = hist[hist.length - 1]
    const changed = !last || last.fiveHour !== five || last.weekly !== week || last.context !== sample.context
    if (!last || (changed && t - last.t > 60_000) || t - last.t > 15 * 60_000) {
      const next = await dbSet(io, 'history', h => [...h, sample].slice(-600))
      await io.storeSet('history', next)
    }
  } catch {
    /* usage not available on this host */
  }
}

function stateForStatus(status: string): CrabState | null {
  if (status === 'completed' || status === 'failed' || status === 'killed') return 'finished'
  if (status === 'waiting' || status === 'idle' || status === 'pending') return 'waiting'
  return null
}

async function syncAgents(io: IO): Promise<void> {
  let list: Awaited<ReturnType<typeof io.agents>>
  try {
    list = await io.agents()
  } catch {
    return
  }
  const crabs = await dbGet(io, 'crabs')
  for (const a of list) {
    if (!crabs[a.id]) {
      if (a.status !== 'running' && a.status !== 'pending') continue
      await ensureCrab(io, a.id, { agentType: a.type, description: a.description, task: a.description, status: a.status })
    }
    const c = (await dbGet(io, 'crabs'))[a.id]
    if (!c || c.status === a.status) continue
    const s = stateForStatus(a.status)
    await patchCrab(io, a.id, x => ({
      ...x,
      status: a.status,
      state: s ?? (x.state === 'finished' || x.state === 'waiting' ? 'exploring' : x.state),
      activity: a.status === 'completed' ? 'Done' : a.status === 'failed' ? 'Failed' : a.status === 'killed' ? 'Stopped' : s === 'waiting' ? 'Idle, waiting' : x.activity,
    }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const io: IO = {
      now: () => $.clock.now(),
      db: () => read($, DB),
      setDb: fn => update($, DB, fn),
      log: () => read($, LOG),
      setLog: fn => update($, LOG, fn),
      map: () => read($, MAP),
      setMap: fn => update($, MAP, fn),
      ai: () => read($, AI),
      setAi: fn => update($, AI, fn),
      settings: () => read($, SETTINGS),
      setSettings: fn => update($, SETTINGS, fn),
      cwd: () => $.session.cwd(),
      model: () => $.session.model(),
      complete: r => $.model.complete(r),
      fork: r => $.model.fork(r),
      usage: a => $.session.usage(a),
      agents: () => $.agent.list(),
      list: p => $.fs.list(p),
      readFile: p => $.fs.read(p),
      storeGet: k => $.store.get(k),
      storeSet: (k, v) => $.store.set(k, v),
      view: id => $.ui.view({ agentId: id }),
    }
    bg = io
    root = e.cwd ?? (await $.session.cwd())
    // immediate: runs at once, even while Claude is mid-turn, instead of queueing behind it.
    await $.command.register({ name: 'clawboard', description: 'Open, close or toggle the Clawboard crab colony panel', argumentHint: '[open|close|toggle|scan|reset]', immediate: true })

    const stored = await $.store.get('settings')
    const settings = await io.setSettings(() => mergeSettings(stored))
    // Ask for the pane first, so nothing slower below can hold it up. Unasked, the engine seats
    // it only on a wide window (144 columns, 110 once you have opened it yourself); the first
    // message (below) is the moment it is placed at any width. The terminal opens it on /clawboard.
    if (settings.autoOpen && e.surface !== 'terminal') void $.ui.open({ id: PANE, title: 'Clawboard' }).catch(() => undefined)
    const hist = await $.store.get('history')
    if (Array.isArray(hist)) await dbSet(io, 'history', h => (h.length ? h : (hist as UsageSample[]).slice(-600)))
    const lessons = await $.store.get(`lessons:${root}`)
    if (Array.isArray(lessons)) await aiSet(io, 'lessons', l => (l.length ? l : lessons))
    await ensureCrab(io, 'main')

    $.clock.every(5000, () => void pollUsage(io))
    $.clock.every(3000, () => void syncAgents(io))
    $.clock.after(800, () => void pollUsage(io))
    $.clock.after(1500, async () => {
      if (!(await io.map())) await runScan(io)
    })
    return next(e)
  })

  // /clear ends the conversation without a new session.start: reset what the old one left.
  on('session.end', async (_$, e, next) => {
    const io = bg
    if (io && e.reason === 'clear') {
      await io.setDb(d => ({ ...defaultDb(), tab: d.tab, selected: 'main', paneClosed: d.paneClosed, autoOpened: d.autoOpened }))
      await io.setLog(() => [])
      await io.setAi(a => ({ ...a, text: {}, busy: {} }))
      pendingAgents.length = 0
      await ensureCrab(io, 'main')
    }
    return next(e)
  })

  // The desktop app joins after the session starts: ask for the pane again once it has.
  on('session.attach', async ($, e, next) => {
    const io = bg
    if (io && e.surface !== 'terminal') {
      const [settings, closed] = await Promise.all([io.settings(), dbGet(io, 'paneClosed')])
      if (settings.autoOpen && !closed) void $.ui.open({ id: PANE, title: 'Clawboard' }).catch(() => undefined)
    }
    return next(e)
  })

  // Closing the pane yourself means you do not want it back this session.
  on('ui.close', async (_$, e, next) => {
    if (bg && e.id === PANE && e.origin.kind === 'person') await dbSet(bg, 'paneClosed', () => true)
    return next(e)
  })

  on('command.run', { command: 'clawboard' }, async ($, e) => {
    const io = bg
    if (!io) return { text: 'Clawboard is still starting.' }
    const arg = e.args.trim()
    if (arg === 'reset') {
      await saveSettings(io, () => defaultSettings())
      return { text: 'Clawboard settings reset to defaults.' }
    }
    if (arg === 'scan') {
      void runScan(io)
      await dbSet(io, 'tab', () => 'burrow')
    }
    // An open but undrawn pane (waiting for a wide enough window) does not count as open.
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE && p.isPlaced)
    if (arg === 'close' || (arg === 'toggle' && isOpen)) {
      await dbSet(io, 'paneClosed', () => true)
      await $.ui.close({ id: PANE })
      return { text: 'Clawboard closed. /clawboard opens it again.' }
    }
    await dbSet(io, 'paneClosed', () => false)
    await $.ui.open({ id: PANE, title: 'Clawboard' })
    return { text: arg === 'scan' ? 'Clawboard is rescanning the project.' : 'Clawboard opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const io = bg
    if (!io) return next(e)
    if (!e.isMeta && e.text.trim()) {
      // A message you send counts as asking, so the pane is placed at any width, once per session.
      const [settings, db] = await Promise.all([io.settings(), io.db()])
      if (settings.autoOpen && !db.paneClosed && !db.autoOpened && !AUTOMATED.includes(e.origin?.kind ?? '') && (await $.session.surfaces()).some(s => s !== 'terminal')) {
        await dbSet(io, 'autoOpened', () => true)
        await $.ui.open({ id: PANE, title: 'Clawboard' }).catch(() => undefined)
      }
      await ensureCrab(io, 'main')
      const text = short(e.text, 240)
      await patchCrab(io, 'main', c => ({ ...c, state: 'exploring', task: text, activity: 'Reading your request', status: 'running', lastResult: c.lastResult }))
      await pushEvent(io, { agentId: 'main', kind: 'prompt', title: `You asked: ${short(e.text, 70)}`, detail: '', plain: 'A new request started a turn.', files: [] })
    }
    return next(e)
  })

  on('turn.start', async (_$, e, next) => {
    const io = bg
    if (!io) return next(e)
    if (e.agentId) {
      await ensureCrab(io, e.agentId)
      await patchCrab(io, e.agentId, c => ({ ...c, task: c.task || short(e.text, 240), state: c.state === 'finished' || c.state === 'waiting' ? 'exploring' : c.state, status: 'running', activity: c.activity === 'Starting up' ? 'Getting oriented' : c.activity }))
    } else {
      await patchCrab(io, 'main', c => ({ ...c, state: c.state === 'finished' || c.state === 'waiting' ? 'exploring' : c.state, status: 'running' }))
    }
    return next(e)
  })

  on('tool.call', async (_$, e, next) => {
    const io = bg
    if (!io) return next(e)
    const agentId = e.agentId ?? 'main'
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const c = classify(tool, input, root)
    await ensureCrab(io, agentId)
    if (tool === 'Agent') pendingAgents.push({ desc: String(input.description ?? ''), type: String(input.subagent_type ?? 'general-purpose'), prompt: String(input.prompt ?? '') })

    await patchCrab(io, agentId, x => ({
      ...x,
      // A crab that is debugging stays so until it edits or tests again.
      state: x.state === 'debugging' && c.state === 'exploring' ? 'debugging' : c.state,
      activity: c.activity,
      tools: x.tools + 1,
      files: c.modifies ? [...new Set([...c.files, ...x.files])].slice(0, 30) : x.files,
      status: 'running',
    }))
    const evId = await pushEvent(io, { agentId, kind: c.kind, title: c.title, detail: c.detail, plain: c.plain, files: c.files, diff: c.diff, important: c.important })
    if (c.modifies) await dbSet(io, 'mapStale', () => true)

    const ran = await next(e)

    if ('deny' in ran && ran.deny !== undefined) {
      await patchEvent(io, evId, { detail: `Blocked: ${short(String(ran.deny), 120)}`, isError: true })
      return ran
    }
    const text = typeof ran.text === 'string' ? ran.text : ''
    if (ran.isError) {
      await patchEvent(io, evId, { isError: true })
      await pushEvent(io, { agentId, kind: 'error', title: `${tool} failed`, detail: short(text, 400), plain: `Something went wrong running ${tool}. ${c.kind === 'test' ? 'Some tests failed, so the crab is debugging.' : 'The crab will look into it.'}`, files: c.files, isError: true, important: true })
      await patchCrab(io, agentId, x => ({ ...x, state: 'debugging', errors: x.errors + 1, activity: `Fixing: ${short(text.split('\n')[0] ?? '', 60)}`, lastResult: short(text, 600) }))
    } else if (c.isTest) {
      const s = testSummary(text)
      const failed = (s.failed ?? 0) > 0
      const label = s.passed !== undefined || s.failed !== undefined ? `${s.passed ?? 0} passed${s.failed ? `, ${s.failed} failed` : ''}` : 'Tests finished'
      await patchEvent(io, evId, { detail: label, isError: failed })
      await patchCrab(io, agentId, x => ({ ...x, state: failed ? 'debugging' : 'testing', activity: failed ? 'Investigating failing tests' : `Tests: ${label}`, lastResult: label }))
    } else if (tool === 'Agent') {
      const result = (ran as { result?: { agentId?: string; content?: { text?: string }[]; totalTokens?: number; status?: string } }).result
      const sub = result?.agentId
      const answer = (result?.content ?? []).map(b => b.text ?? '').join('\n')
      if (sub && answer) {
        await ensureCrab(io, sub)
        await patchCrab(io, sub, x => ({ ...x, state: 'finished', status: 'completed', activity: 'Done', lastResult: short(answer, 800) }))
        await pushEvent(io, { agentId: sub, kind: 'agent', title: `Subagent finished: ${short(String(input.description ?? ''), 50)}`, detail: short(answer, 300), plain: 'A helper agent finished and reported back.', files: [], important: true })
      }
    } else if (tool === 'TaskCreate') {
      const task = (ran as { result?: { task?: { id?: string; subject?: string } } }).result?.task
      if (task?.id) await dbSet(io, 'todos', l => [...l.filter(x => x.id !== task.id), { id: String(task.id), subject: String(task.subject ?? input.subject ?? ''), status: 'pending' }])
    } else if (tool === 'TaskUpdate') {
      const id = String(input.taskId ?? '')
      const status = String(input.status ?? '')
      const todos = await dbSet(io, 'todos', l => (status === 'deleted' ? l.filter(x => x.id !== id) : l.map(x => (x.id === id ? { ...x, status: status || x.status, subject: String(input.subject ?? x.subject) } : x))))
      const subj = todos.find(x => x.id === id)?.subject
      if (subj) await patchEvent(io, evId, { title: status === 'completed' ? `Completed: ${short(subj, 60)}` : `${status === 'in_progress' ? 'Started' : 'Updated'}: ${short(subj, 60)}` })
    } else if (c.kind === 'waiting') {
      await patchCrab(io, agentId, x => ({ ...x, state: 'exploring', activity: 'Got your answer' }))
    }
    return ran
  }).catch((_$, e, next) => next(e))

  on('classic.Notification', async (_$, e, next) => {
    const io = bg
    if (!io) return next(e)
    const type = String(e.notification_type ?? '')
    if (type.includes('permission')) {
      await patchCrab(io, 'main', c => ({ ...c, state: 'waiting', activity: 'Waiting for your permission' }))
      await pushEvent(io, { agentId: 'main', kind: 'waiting', title: 'Needs your permission', detail: short(String(e.message ?? ''), 160), plain: 'Claude paused until you approve or deny a tool.', files: [] })
    } else if (type.includes('idle')) {
      await patchCrab(io, 'main', c => ({ ...c, state: c.state === 'finished' ? 'finished' : 'waiting', activity: 'Waiting for your next message' }))
    }
    return next(e)
  })

  on('turn.complete', async (_$, e, next) => {
    const io = bg
    if (!io) return next(e)
    const t = await now(io)
    const agentId = e.agentId ?? 'main'
    if (e.usage) {
      const u = e.usage
      const turn: TokenTurn = { t, agentId, input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens, model: u.model, durationMs: e.durationMs }
      await dbSet(io, 'turns', l => [...l, turn].slice(-500))
      await ensureCrab(io, agentId)
      await patchCrab(io, agentId, c => ({ ...c, tokensIn: c.tokensIn + u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens, tokensOut: c.tokensOut + u.output_tokens }))
    }
    const outcome = e.reason === 'aborted' ? 'Interrupted' : e.reason === 'error' ? 'Stopped on an API error' : e.reason === 'refusal' ? 'Declined' : 'Done'
    if (e.agentId) {
      await patchCrab(io, e.agentId, c => ({ ...c, state: 'finished', activity: outcome, lastResult: e.answer ? short(e.answer, 800) : c.lastResult }))
    } else {
      await patchCrab(io, 'main', c => ({ ...c, state: e.reason === 'error' ? 'debugging' : 'finished', status: 'idle', activity: `${outcome} — waiting for your next message`, lastResult: e.answer ? short(e.answer, 800) : c.lastResult }))
      const events = await io.log()
      const startIdx = events.map(x => x.kind).lastIndexOf('prompt')
      const thisTurn = events.slice(Math.max(0, startIdx))
      const edits = thisTurn.filter(x => (x.kind === 'edit' || x.kind === 'write') && x.agentId === 'main')
      const changed = new Set(thisTurn.flatMap(x => x.files)).size
      const turnId = await pushEvent(io, {
        agentId: 'main',
        kind: 'turn',
        title: `${outcome} in ${Math.round(e.durationMs / 1000)}s`,
        detail: `${thisTurn.filter(x => x.kind !== 'prompt').length} actions, ${changed} file${changed === 1 ? '' : 's'} changed${e.usage ? `, ${e.usage.output_tokens.toLocaleString()} output tokens` : ''}`,
        plain: e.answer ? short(e.answer, 300) : 'The turn ended.',
        files: [...new Set(edits.flatMap(x => x.files))],
        important: true,
      })
      const settings = await io.settings()
      if (settings.autoExplain && edits.length) void explainTurnEdits(io, `turn:${turnId}`, edits, settings.level)
      void pollUsage(io)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Reads go through this render's own $, so the pane redraws when they change.
    const io: IO = {
      now: () => $.clock.now(),
      db: () => read($, DB),
      setDb: fn => update($, DB, fn),
      log: () => read($, LOG),
      setLog: fn => update($, LOG, fn),
      map: () => read($, MAP),
      setMap: fn => update($, MAP, fn),
      ai: () => read($, AI),
      setAi: fn => update($, AI, fn),
      settings: () => read($, SETTINGS),
      setSettings: fn => update($, SETTINGS, fn),
      cwd: () => $.session.cwd(),
      model: () => $.session.model(),
      complete: r => $.model.complete(r),
      fork: r => $.model.fork(r),
      usage: a => $.session.usage(a),
      agents: () => $.agent.list(),
      list: p => $.fs.list(p),
      readFile: p => $.fs.read(p),
      storeGet: k => $.store.get(k),
      storeSet: (k, v) => $.store.set(k, v),
      view: id => $.ui.view({ agentId: id }),
    }
    const K = $.ui.resolve(e) as unknown as Kit
    return renderPane(io, K, e)
  })
}

