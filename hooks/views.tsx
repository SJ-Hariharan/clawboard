import type { ElementTable, RenderElement, RenderSurface } from 'claude-code'
import type { IO } from './io'
import type { Crab, CrabLook, CrabState, Layer, Level, ProjectMap, BoardSettings, TimelineEvent, WorkspaceId } from '../types'
import * as act from './actions'
import { rel, short } from './classify'
import { ANIMS, COLORS, HATS, SHELLS, SKINS, STATES, STATE_COLOR, STATE_LABEL, colonySvg, crabAscii, crabSvg, esc } from './crabs'
import { LAYERS, LAYER_NAME } from './scan'
import { lookFor, nameFor } from './store'
import { aiGet, dbGet, dbSet } from './io'

export type Kit = Pick<ElementTable<'mobile'>, 'Box' | 'Text' | 'Button' | 'Markdown' | 'Code'> &
  Partial<Pick<ElementTable<'desktop'>, 'Svg' | 'Input' | 'Select'>>

export type PaneEvent = {
  surface: RenderSurface
  props: { bodyColumns: number }
  viewport?: { rows?: number; columns?: number }
}

type Ctx = {
  K: Kit
  surface: RenderSurface
  cols: number
  px: number
  now: number
  root: string
  settings: BoardSettings
  crabs: Crab[]
  busy: Record<string, boolean>
  ai: Record<string, string>
}

// ---------- small formatting helpers
function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
function until(ms: number): string {
  if (ms <= 0) return 'now'
  const m = Math.round(ms / 60000)
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `in ${h}h ${m % 60}m`
  return `in ${Math.floor(h / 24)}d ${h % 24}h`
}
function clockTime(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
function when(t: number): string {
  const d = new Date(t)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function n(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M'
  if (v >= 10_000) return Math.round(v / 1000) + 'k'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
  return String(v)
}
function bar(pct: number, width: number): string {
  const w = Math.max(4, width)
  const f = Math.max(0, Math.min(w, Math.round((pct / 100) * w)))
  return '█'.repeat(f) + '░'.repeat(w - f)
}

const KIND_ICON: Record<string, string> = {
  prompt: '💬', read: '📖', search: '🔍', edit: '✏️', write: '📝', command: '⌨️', test: '🧪', error: '❗', agent: '🦀', task: '☑️', turn: '🏁', web: '🌐', waiting: '⏳', other: '🔧',
}

// ---------- reusable pieces
function Section(c: Ctx, title: string, children: unknown, hint?: string): RenderElement {
  const { Box, Text } = c.K
  const deco = c.settings.layout === 'decorative'
  return (
    <Box flexDirection="column" marginTop={1} paddingX={deco ? 1 : 0} paddingY={deco ? 1 : 0} borderStyle={deco ? 'round' : undefined} borderColor={deco ? '#f4a582' : undefined} gap={deco ? 1 : 0}>
      <Box flexDirection="row" gap={1}>
        <Text weight="semibold" size={deco ? 'heading' : 'body'} bold>
          {title}
        </Text>
        {hint ? <Text dimColor size="caption">{hint}</Text> : null}
      </Box>
      {children as RenderElement}
    </Box>
  )
}

function Picker(c: Ctx, key: string, label: string, value: string, options: readonly { value: string; label: string }[], onPick: (v: string) => void): RenderElement {
  const { Box, Text, Button, Select } = c.K
  if (Select && c.surface !== 'terminal') {
    return <Select key={key} label={label} value={value} options={options} onSelect={v => onPick(v)} />
  }
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      <Text dimColor>{label}:</Text>
      {options.map(o => (
        <Button key={`${key}:${o.value}`} label={o.value === value ? `• ${o.label}` : o.label} variant={o.value === value ? 'primary' : undefined} onPress={() => onPick(o.value)} />
      ))}
    </Box>
  )
}

function Toggle(c: Ctx, key: string, label: string, on: boolean, flip: () => void): RenderElement {
  const { Box, Text, Button } = c.K
  return (
    <Box flexDirection="row" gap={1} alignItems="center">
      <Button key={key} label={on ? 'On' : 'Off'} variant={on ? 'primary' : undefined} onPress={() => flip()} />
      <Text>{label}</Text>
    </Box>
  )
}

function AiText(c: Ctx, key: string, empty?: string): RenderElement | null {
  const { Text, Markdown, Box } = c.K
  if (c.busy[key]) return <Text dimColor italic>🦀 Thinking…</Text>
  const t = c.ai[key]
  if (!t) return empty ? <Text dimColor>{empty}</Text> : null
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="#cbd5e1">
      <Markdown key={`md:${key}`} text={t} />
    </Box>
  )
}

function stateText(c: Ctx, s: CrabState): RenderElement {
  const { Text } = c.K
  return (
    <Text color={STATE_COLOR[s]} bold>
      {STATE_LABEL[s]}
    </Text>
  )
}

// ---------- Crab Crew
async function crewView(io: IO, c: Ctx): Promise<RenderElement> {
  const { K } = c
  const { Box, Text, Button, Svg, Markdown } = K
  const selectedId = (await dbGet(io, 'selected')) ?? 'main'
  const events = await io.log()
  const filter = await dbGet(io, 'filter')
  const todos = await dbGet(io, 'todos')
  const level = c.settings.level
  const crabs = c.crabs
  const selected = crabs.find(x => x.id === selectedId) ?? crabs[0]
  const main = crabs.find(x => x.id === 'main')
  const motion = !c.settings.reducedMotion
  const live = crabs.filter(x => x.kind === 'sub' && x.state !== 'finished').length

  // Colony drawing
  let colony: RenderElement
  if (Svg && c.surface !== 'terminal') {
    if (c.settings.layout === 'decorative') {
      const scene = colonySvg(
        crabs.map(x => ({ id: x.id, name: nameFor(x, c.settings), state: x.state, look: lookFor(x, c.settings), selected: x.id === selected?.id, title: `${nameFor(x, c.settings)} — ${STATE_LABEL[x.state]}: ${x.activity}` })),
        { layout: c.settings.colony, motion, idle: c.settings.idle, decorative: true, width: c.px },
      )
      colony = <Svg source={scene.svg} alt={`Crab colony: ${crabs.map(x => `${nameFor(x, c.settings)} is ${STATE_LABEL[x.state].toLowerCase()}`).join(', ')}`} width={scene.width} height={scene.height} isInteractive={motion ? true : undefined} />
    } else {
      colony = (
        <Box flexDirection={c.settings.colony === 'row' ? 'row' : 'row'} flexWrap="wrap" gap={1}>
          {crabs.map(x => (
            <Box flexDirection="column" alignItems="center">
              <Svg source={crabSvg({ look: lookFor(x, c.settings), state: x.state, motion, idle: c.settings.idle, seed: x.id }, `${nameFor(x, c.settings)}: ${x.activity}`, 2.2)} alt={`${nameFor(x, c.settings)} is ${STATE_LABEL[x.state]}`} width={66} height={53} isInteractive={motion ? true : undefined} />
            </Box>
          ))}
        </Box>
      )
    }
  } else {
    colony = (
      <Box flexDirection="column">
        {crabs.map(x => (
          <Text color={STATE_COLOR[x.state]}>
            {crabAscii(x.state)} {nameFor(x, c.settings)}
          </Text>
        ))}
      </Box>
    )
  }

  const crabButtons = (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {crabs.map(x => (
        <Button key={`crab:${x.id}`} variant={x.id === selected?.id ? 'primary' : undefined} onPress={() => dbSet(io, 'selected', () => x.id)}>
          {x.kind === 'main' ? '🦀 ' : '🦐 '}
          {nameFor(x, c.settings)} <Text color={STATE_COLOR[x.state]}>· {STATE_LABEL[x.state]}</Text>
        </Button>
      ))}
      {crabs.some(x => x.kind === 'sub' && x.state === 'finished') ? (
        <Button key="clear-finished" label="Clear finished helpers" onPress={() => dbSet(io, 'crabs', cur => Object.fromEntries(Object.entries(cur).filter(([, v]) => v.kind === 'main' || v.state !== 'finished')))} />
      ) : null}
    </Box>
  )

  // Selected crab card
  let card: RenderElement | null = null
  if (selected) {
    const mine = events.filter(e => e.agentId === selected.id && e.kind !== 'prompt').slice(-6).reverse()
    card = (
      <Box flexDirection="column" borderStyle="round" borderColor={STATE_COLOR[selected.state]} paddingX={1} gap={0}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text bold size="heading">
            {nameFor(selected, c.settings)}
          </Text>
          {stateText(c, selected.state)}
          <Text dimColor>
            {selected.kind === 'main' ? 'main agent' : `subagent · ${selected.agentType}`} · updated {ago(c.now - selected.updatedAt)}
          </Text>
        </Box>
        <Text>
          <Text bold>Task: </Text>
          {selected.task || (selected.kind === 'main' ? 'No request yet.' : selected.description || '—')}
        </Text>
        <Text>
          <Text bold>Doing now: </Text>
          {selected.activity}
        </Text>
        <Text dimColor>
          {selected.tools} tool call{selected.tools === 1 ? '' : 's'} · {selected.errors} error{selected.errors === 1 ? '' : 's'} · {n(selected.tokensIn)} in / {n(selected.tokensOut)} out tokens · started {ago(c.now - selected.startedAt)}
        </Text>
        <Text bold>Files modified ({selected.files.length})</Text>
        {selected.files.length ? (
          selected.files.slice(0, 12).map(f => (
            <Text mono size="caption">
              {'  '}
              {rel(f, c.root)}
            </Text>
          ))
        ) : (
          <Text dimColor> none yet</Text>
        )}
        <Text bold>Latest result</Text>
        {selected.lastResult ? <Markdown key={`res:${selected.id}`} text={short(selected.lastResult, 700)} dimColor /> : <Text dimColor> nothing reported yet</Text>}
        {mine.length ? <Text bold>Recent actions</Text> : null}
        {mine.map(e => (
          <Text color={e.isError ? 'error' : undefined} size="caption">
            {'  '}
            {KIND_ICON[e.kind] ?? '•'} {clockTime(e.t)} {short(e.title, 80)}
          </Text>
        ))}
        {selected.kind === 'sub' ? (
          <Box flexDirection="row" marginTop={1}>
            <Button key={`view:${selected.id}`} label="Open its transcript" onPress={() => void io.view(selected.id)} />
          </Box>
        ) : null}
      </Box>
    )
  }

  // Live activity
  const real = events.filter(e => e.kind !== 'read' && e.kind !== 'search' && e.kind !== 'web')
  const modified = new Set(events.filter(e => e.kind === 'edit' || e.kind === 'write').flatMap(e => e.files))
  const commands = events.filter(e => e.kind === 'command').length
  const tests = events.filter(e => e.kind === 'test')
  const testsFailed = tests.filter(e => e.isError).length
  const errors = events.filter(e => e.kind === 'error').length
  const doneTasks = todos.filter(t => t.status === 'completed').length
  const FILTERS: [string, string, (e: TimelineEvent) => boolean][] = [
    ['all', 'Meaningful', e => real.includes(e)],
    ['changes', 'Changes', e => e.kind === 'edit' || e.kind === 'write'],
    ['commands', 'Commands', e => e.kind === 'command'],
    ['tests', 'Tests', e => e.kind === 'test'],
    ['errors', 'Errors', e => e.kind === 'error' || !!e.isError],
    ['tasks', 'Tasks', e => e.kind === 'task' || e.kind === 'turn'],
    ['agents', 'Agents', e => e.kind === 'agent'],
    ['everything', 'Everything', () => true],
  ]
  const pass = (FILTERS.find(f => f[0] === filter) ?? FILTERS[0])?.[2] ?? (() => true)
  const shown = events.filter(pass).slice(-40).reverse()
  const nameOf = (id: string) => {
    const cr = crabs.find(x => x.id === id)
    return cr ? nameFor(cr, c.settings) : 'helper'
  }

  const stat = (label: string, value: string, color?: string) => (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="#e5e7eb" minWidth={12}>
      <Text size="title" bold color={color}>
        {value}
      </Text>
      <Text dimColor size="caption">
        {label}
      </Text>
    </Box>
  )

  const timeline = (
    <Box flexDirection="column" gap={0}>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {stat('files changed', String(modified.size))}
        {stat('commands run', String(commands))}
        {stat('test runs', tests.length ? `${tests.length - testsFailed}✓ ${testsFailed}✗` : '0', testsFailed ? '#ef4444' : undefined)}
        {stat('errors', String(errors), errors ? '#ef4444' : undefined)}
        {stat('tasks done', `${doneTasks}/${todos.length}`)}
      </Box>
      {todos.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Task list</Text>
          {todos.map(t => (
            <Text color={t.status === 'completed' ? 'success' : t.status === 'in_progress' ? 'warning' : undefined} strikethrough={t.status === 'completed'}>
              {t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '◐' : '☐'} {t.subject}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
        {FILTERS.map(([id, label]) => (
          <Button key={`filter:${id}`} label={label} variant={filter === id ? 'primary' : undefined} onPress={() => dbSet(io, 'filter', () => id)} />
        ))}
      </Box>
      {shown.length === 0 ? <Text dimColor>Nothing here yet. Activity appears as Claude works.</Text> : null}
      {shown.map(e => {
        const explainKey = `ev:${e.id}:${level}`
        const canExplain = (e.kind === 'edit' || e.kind === 'write') && !!e.diff
        return (
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Text dimColor mono size="caption">
                {clockTime(e.t)}
              </Text>
              <Text>{KIND_ICON[e.kind] ?? '•'}</Text>
              <Text bold={e.important} color={e.isError ? 'error' : undefined}>
                {short(e.title, 90)}
              </Text>
              <Text dimColor size="caption">
                {nameOf(e.agentId)}
              </Text>
            </Box>
            <Text dimColor size="footnote">
              {'   '}
              {short(e.plain, 220)}
              {e.detail && e.kind !== 'turn' ? ` (${short(e.detail, 140)})` : ''}
            </Text>
            {e.kind === 'turn' && e.detail ? (
              <Text dimColor size="footnote">
                {'   '}
                {e.detail}
              </Text>
            ) : null}
            {canExplain && !c.ai[explainKey] && !c.busy[explainKey] ? (
              <Box flexDirection="row" marginLeft={3}>
                <Button key={`explain:${e.id}`} label="Explain this change" plain onPress={() => act.explainEvent(io, e, level)} />
              </Box>
            ) : null}
            {canExplain ? AiText(c, explainKey) : null}
            {e.kind === 'turn' ? AiText(c, `turn:${e.id}`) : null}
          </Box>
        )
      })}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <Button key="explain-session" label="Explain this session in plain English" onPress={() => act.explainSession(io, level)} />
      </Box>
      {AiText(c, `session:${level}`)}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {Section(
        c,
        'Colony',
        <Box flexDirection="column" gap={1}>
          <Text>
            {main?.task ? (
              <Text>
                <Text bold>Working on: </Text>
                {short(main.task, 160)}
              </Text>
            ) : (
              <Text dimColor>Waiting for your first request.</Text>
            )}
          </Text>
          <Text dimColor>
            {main?.activity}
            {live ? ` · ${live} helper${live === 1 ? '' : 's'} at work` : ''}
          </Text>
          {colony}
          {crabButtons}
          {card}
        </Box>,
        'tap a crab to inspect it',
      )}
      {Section(c, 'Live activity', timeline, 'from real session events')}
    </Box>
  )
}

// ---------- The Tide
async function tideView(io: IO, c: Ctx): Promise<RenderElement> {
  const { K } = c
  const { Box, Text, Button, Svg } = K
  const usage = await dbGet(io, 'usage')
  const turns = await dbGet(io, 'turns')
  const history = await dbGet(io, 'history')
  const w = Math.max(10, Math.min(40, c.cols - 24))

  const ctxPct = usage?.contextPercent
  const contextBlock = (
    <Box flexDirection="column">
      {usage?.contextTokens !== undefined && ctxPct !== undefined ? (
        <Box flexDirection="column">
          <Text mono color={ctxPct > 85 ? 'error' : ctxPct > 65 ? 'warning' : 'success'}>
            {bar(ctxPct, w)} {ctxPct}%
          </Text>
          <Text>
            {usage.contextTokens.toLocaleString()} of {usage.contextWindow.toLocaleString()} tokens in the context window
          </Text>
          <Text dimColor size="caption">
            Remaining before the window is full: {(usage.contextWindow - usage.contextTokens).toLocaleString()} tokens
            {usage.autoCompactAt ? ` · auto-compact at ${usage.autoCompactAt.toLocaleString()}` : ''}
          </Text>
        </Box>
      ) : (
        <Text dimColor>Unavailable until the first model response of this context window{usage ? ` (window size: ${usage.contextWindow.toLocaleString()} tokens)` : ''}.</Text>
      )}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <Button key="breakdown" label={c.busy.breakdown ? 'Measuring…' : 'Break down by category'} onPress={() => act.refreshBreakdown(io)} />
      </Box>
      {usage?.breakdown?.length ? (
        <Box flexDirection="column" marginTop={1}>
          {usage.breakdown
            .slice()
            .sort((a, b) => b.tokens - a.tokens)
            .map(s => {
              const pct = usage.contextWindow ? Math.round((s.tokens / usage.contextWindow) * 1000) / 10 : 0
              return (
                <Text mono size="caption">
                  {bar(pct, Math.min(20, w))} {String(pct).padStart(5)}% {n(s.tokens).padStart(6)} {s.name}
                </Text>
              )
            })}
          <Text dimColor size="caption">
            Estimated locally, as /context does{usage.breakdownAt ? ` · ${ago(c.now - usage.breakdownAt)}` : ''}
          </Text>
        </Box>
      ) : null}
    </Box>
  )

  const LIMIT_NAMES: Record<string, string> = { five_hour: 'Five-hour limit', seven_day: 'Weekly limit', spend_limit: 'Spend limit' }
  const limits = usage?.rateLimits ?? []
  const limitCards = (['five_hour', 'seven_day'] as const).map(kind => {
    const r = limits.find(x => x.kind === kind)
    if (!r) {
      return (
        <Box flexDirection="column" borderStyle="single" borderColor="#e5e7eb" paddingX={1}>
          <Text bold>{LIMIT_NAMES[kind]}</Text>
          <Text dimColor>Unavailable</Text>
          <Text dimColor size="caption">
            Not reported by the last API response. Claude Code only receives this with a Claude subscription sign-in, after a response.
          </Text>
        </Box>
      )
    }
    const reset = r.resetsAt ? Date.parse(r.resetsAt) : NaN
    return (
      <Box flexDirection="column" borderStyle="single" borderColor={r.percentUsed > 85 ? '#ef4444' : '#e5e7eb'} paddingX={1}>
        <Text bold>{LIMIT_NAMES[kind]}</Text>
        <Text mono color={r.percentUsed > 85 ? 'error' : r.percentUsed > 60 ? 'warning' : 'success'}>
          {bar(r.percentUsed, Math.min(24, w))} {r.percentUsed}% used
        </Text>
        <Text>{Math.max(0, Math.round((100 - r.percentUsed) * 10) / 10)}% remaining</Text>
        <Text dimColor size="caption">
          {Number.isFinite(reset) ? `Resets ${when(reset)} (${until(reset - c.now)})` : 'Reset time not reported'}
        </Text>
      </Box>
    )
  })
  const otherLimits = limits.filter(x => x.kind !== 'five_hour' && x.kind !== 'seven_day')

  // Tokens by agent from real turn usage
  const byAgent = new Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number; turns: number }>()
  for (const t of turns) {
    const cur = byAgent.get(t.agentId) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 }
    cur.input += t.input
    cur.output += t.output
    cur.cacheRead += t.cacheRead
    cur.cacheWrite += t.cacheWrite
    cur.turns++
    byAgent.set(t.agentId, cur)
  }
  const tot = [...byAgent.values()].reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, turns: a.turns + b.turns }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 })
  const agentName = (id: string) => {
    const cr = c.crabs.find(x => x.id === id)
    return cr ? nameFor(cr, c.settings) : id === 'main' ? 'Clawde' : `helper ${id.slice(0, 6)}`
  }

  // Per-turn chart
  let chart: RenderElement | null = null
  const recent = turns.slice(-30)
  if (recent.length && Svg && c.surface !== 'terminal') {
    const W = 300
    const H = 70
    const max = Math.max(...recent.map(t => t.output), 1)
    const bw = W / Math.max(recent.length, 8)
    const bars = recent
      .map((t, i) => {
        const h = Math.max(1, (t.output / max) * (H - 12))
        const col = t.agentId === 'main' ? '#f26b4f' : '#3b82f6'
        return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${col}"><title>${esc(agentName(t.agentId))}: ${t.output} output, ${t.input + t.cacheRead + t.cacheWrite} input tokens</title></rect>`
      })
      .join('')
    chart = (
      <Svg
        source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${c.px}" height="${Math.round((c.px * H) / W)}"><text x="0" y="8" font-size="7" fill="#64748b" font-family="system-ui">output tokens per turn (max ${max.toLocaleString()}) · coral = main, blue = helpers</text>${bars}</svg>`}
        alt={`Output tokens for the last ${recent.length} turns`}
        width={c.px}
        height={Math.round((c.px * H) / W)}
        isInteractive
      />
    )
  } else if (recent.length) {
    const max = Math.max(...recent.map(t => t.output), 1)
    const blocks = '▁▂▃▄▅▆▇█'
    chart = <Text mono>{recent.map(t => blocks[Math.min(7, Math.floor((t.output / max) * 7.99))]).join('')} output/turn</Text>
  }

  // History chart (stored across sessions)
  let hist: RenderElement
  const pts = history.filter(h => h.fiveHour !== undefined || h.weekly !== undefined || h.context !== undefined)
  if (pts.length >= 2 && Svg && c.surface !== 'terminal') {
    const W = 300
    const H = 90
    const t0 = pts[0]?.t ?? 0
    const t1 = pts[pts.length - 1]?.t ?? 1
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - 10) + 5
    const y = (v: number) => H - 12 - (Math.min(100, v) / 100) * (H - 22)
    const line = (pick: (s: (typeof pts)[number]) => number | undefined, color: string, label: string, ly: number) => {
      const p = pts.filter(s => pick(s) !== undefined).map(s => `${x(s.t).toFixed(1)},${y(pick(s) ?? 0).toFixed(1)}`)
      return p.length >= 2 ? `<polyline points="${p.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5"/><text x="${W - 60}" y="${ly}" font-size="7" fill="${color}" font-family="system-ui">${label}</text>` : ''
    }
    const grid = [0, 50, 100].map(v => `<line x1="5" x2="${W - 5}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8f0" stroke-width="0.5"/><text x="0" y="${y(v) - 1}" font-size="6" fill="#94a3b8">${v}%</text>`).join('')
    const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${c.px}" height="${Math.round((c.px * H) / W)}">${grid}${line(s => s.fiveHour, '#f97316', 'five-hour', 10)}${line(s => s.weekly, '#8b5cf6', 'weekly', 18)}${line(s => s.context, '#0ea5e9', 'context', 26)}<text x="5" y="${H - 2}" font-size="6" fill="#94a3b8">${esc(when(t0))}</text><text x="${W - 5}" y="${H - 2}" font-size="6" fill="#94a3b8" text-anchor="end">${esc(when(t1))}</text></svg>`
    hist = <Svg source={src} alt="Usage history: five-hour, weekly and context percentages over time" width={c.px} height={Math.round((c.px * H) / W)} />
  } else {
    hist = <Text dimColor>History builds up as you work: a reading is saved every few minutes while rate-limit or context figures are reported ({pts.length} so far).</Text>
  }

  return (
    <Box flexDirection="column">
      <Text dimColor size="caption">
        Model {usage?.model ?? '…'}
        {usage?.costUsd !== undefined ? ` · session cost $${usage.costUsd.toFixed(2)} (as /cost reports)` : ''}
        {usage ? ` · updated ${ago(c.now - usage.at)}` : ''}
      </Text>
      {Section(c, 'Plan limits', <Box flexDirection="column" gap={1}>{limitCards}{otherLimits.map(r => <Text>{LIMIT_NAMES[r.kind] ?? r.kind}: {r.percentUsed}% used{r.resetsAt ? ` · resets ${when(Date.parse(r.resetsAt))}` : ''}</Text>)}</Box>, 'as reported by the API')}
      {Section(c, 'Context window', contextBlock)}
      {Section(
        c,
        'Tokens this session',
        <Box flexDirection="column">
          {tot.turns === 0 ? (
            <Text dimColor>No turns finished yet in this session.</Text>
          ) : (
            <Box flexDirection="column">
              <Text>
                <Text bold>{n(tot.output)}</Text> output · <Text bold>{n(tot.input)}</Text> uncached input · {n(tot.cacheRead)} cache read · {n(tot.cacheWrite)} cache write
              </Text>
              <Text dimColor size="caption">
                Summed over every API request of {tot.turns} turn{tot.turns === 1 ? '' : 's'} (each request re-sends context, so input adds up fast).
              </Text>
              <Text bold>By agent</Text>
              {[...byAgent].map(([id, v]) => (
                <Text mono size="caption">
                  {short(agentName(id), 14).padEnd(14)} {n(v.output).padStart(6)} out {n(v.input + v.cacheRead + v.cacheWrite).padStart(7)} in {String(v.turns).padStart(3)} turns
                </Text>
              ))}
              {chart}
            </Box>
          )}
        </Box>,
      )}
      {Section(c, 'Usage history', hist, 'kept across sessions')}
    </Box>
  )
}

// ---------- The Burrow
function mapSvg(map: ProjectMap, selected: string | null, px: number): { svg: string; h: number } {
  const W = 320
  const rowsOrder: Layer[][] = [['frontend'], ['api'], ['backend'], ['database', 'integrations'], ['tests', 'infra', 'config']]
  const ROW_H = 46
  const placed = new Map<string, { x: number; y: number; w: number; h: number }>()
  const parts: string[] = []
  const LAYER_COLOR: Record<Layer, string> = { frontend: '#3b82f6', api: '#8b5cf6', backend: '#f97316', database: '#10b981', integrations: '#ec4899', tests: '#eab308', infra: '#64748b', config: '#94a3b8' }
  let y = 16
  for (const row of rowsOrder) {
    const comps = map.components.filter(c => row.includes(c.layer)).sort((a, b) => b.fileCount - a.fileCount).slice(0, 6)
    if (!comps.length) continue
    parts.push(`<text x="4" y="${y - 4}" font-size="6.5" fill="#64748b" font-family="system-ui" font-weight="600">${row.map(l => LAYER_NAME[l].toUpperCase()).join(' · ')}</text>`)
    const gap = 6
    const bw = Math.min(90, (W - 8 - gap * (comps.length - 1)) / comps.length)
    const total = bw * comps.length + gap * (comps.length - 1)
    let x = (W - total) / 2
    for (const c of comps) {
      placed.set(c.id, { x, y, w: bw, h: 26 })
      x += bw + gap
    }
    y += ROW_H
  }
  const H = y - 10
  const edges = map.edges.filter(e => placed.has(e.from) && placed.has(e.to))
  const maxW = Math.max(1, ...edges.map(e => e.weight))
  for (const e of edges) {
    const a = placed.get(e.from)
    const b = placed.get(e.to)
    if (!a || !b) continue
    const hot = selected && (e.from === selected || e.to === selected)
    const ax = a.x + a.w / 2
    const bx = b.x + b.w / 2
    const down = b.y >= a.y
    const ay = down ? a.y + a.h : a.y
    const by = down ? b.y : b.y + b.h
    const my = (ay + by) / 2
    const sw = 0.6 + (e.weight / maxW) * 2.2
    parts.unshift(`<path d="M${ax.toFixed(1)} ${ay} C ${ax.toFixed(1)} ${my} ${bx.toFixed(1)} ${my} ${bx.toFixed(1)} ${by}" fill="none" stroke="${hot ? '#f97316' : '#cbd5e1'}" stroke-width="${sw.toFixed(2)}" opacity="${selected && !hot ? 0.35 : 0.9}" marker-end="url(#arr${hot ? 'h' : ''})"><title>${e.weight} import${e.weight === 1 ? '' : 's'}</title></path>`)
  }
  for (const c of map.components) {
    const p = placed.get(c.id)
    if (!p) continue
    const col = LAYER_COLOR[c.layer]
    const sel = c.id === selected
    const label = c.label.length > 16 ? c.label.slice(0, 15) + '…' : c.label
    parts.push(
      `<g><title>${esc(c.label)} — ${esc(c.summary)}</title><rect x="${p.x.toFixed(1)}" y="${p.y}" width="${p.w.toFixed(1)}" height="${p.h}" rx="5" fill="${sel ? col : '#ffffff'}" stroke="${col}" stroke-width="${sel ? 2 : 1.2}"/><text x="${(p.x + p.w / 2).toFixed(1)}" y="${p.y + 11}" font-size="7" text-anchor="middle" font-family="system-ui" font-weight="600" fill="${sel ? '#ffffff' : '#0f172a'}">${esc(label)}</text><text x="${(p.x + p.w / 2).toFixed(1)}" y="${p.y + 20}" font-size="5.6" text-anchor="middle" font-family="system-ui" fill="${sel ? '#f8fafc' : '#64748b'}">${c.id.startsWith('pkg:') ? 'package' : `${c.fileCount} files`}${c.tech[0] ? ' · ' + esc(short(c.tech[0], 12)) : ''}</text></g>`,
    )
  }
  const defs = `<defs><marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#cbd5e1"/></marker><marker id="arrh" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#f97316"/></marker></defs>`
  const h = Math.round((px * H) / W)
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${px}" height="${h}">${defs}${parts.join('')}</svg>`, h }
}

async function burrowView(io: IO, c: Ctx): Promise<RenderElement> {
  const { K } = c
  const { Box, Text, Button, Svg } = K
  const map = await io.map()
  const stale = await dbGet(io, 'mapStale')
  const selId = await dbGet(io, 'mapSelected')
  const level = c.settings.level
  const header = (
    <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
      <Button key="rescan" label={c.busy.scan ? 'Scanning…' : map ? 'Rescan project' : 'Scan project'} variant={stale ? 'primary' : undefined} onPress={() => act.runScan(io)} />
      {map ? (
        <Text dimColor size="caption">
          {rel(map.root, '')} · {map.fileCount.toLocaleString()} files{map.truncated ? ' (first 5,000)' : ''} · {map.importsScanned} files' imports read · scanned {ago(c.now - map.scannedAt)}
          {stale ? ' · files changed since' : ''}
        </Text>
      ) : null}
    </Box>
  )
  if (!map) {
    return (
      <Box flexDirection="column">
        {header}
        {AiText(c, 'scan')}
        <Text dimColor>{c.busy.scan ? 'Digging through the project…' : 'No scan yet.'}</Text>
      </Box>
    )
  }
  if (!map.components.length && !map.stack.length) {
    return (
      <Box flexDirection="column">
        {header}
        <Text>This folder has no recognizable source files yet ({map.fileCount} files). The map fills in as code is written; press Rescan.</Text>
      </Box>
    )
  }
  const sel = map.components.find(x => x.id === selId) ?? null
  const label = (id: string) => map.components.find(x => x.id === id)?.label ?? id
  let diagram: RenderElement
  if (Svg && c.surface !== 'terminal') {
    const d = mapSvg(map, sel?.id ?? null, c.px)
    diagram = <Svg source={d.svg} alt={`Architecture: ${map.components.length} components across ${new Set(map.components.map(x => x.layer)).size} layers`} width={c.px} height={d.h} isInteractive />
  } else {
    diagram = (
      <Box flexDirection="column">
        {LAYERS.map(l => {
          const cs = map.components.filter(x => x.layer === l)
          return cs.length ? (
            <Text>
              <Text bold>{LAYER_NAME[l]}: </Text>
              {cs.map(x => x.label).join(' · ')}
            </Text>
          ) : null
        })}
      </Box>
    )
  }
  const buttons = (
    <Box flexDirection="column" gap={0}>
      {LAYERS.map(l => {
        const cs = map.components.filter(x => x.layer === l)
        if (!cs.length) return null
        return (
          <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
            <Text dimColor size="caption">
              {LAYER_NAME[l]}
            </Text>
            {cs.map(x => (
              <Button key={`comp:${x.id}`} variant={x.id === sel?.id ? 'primary' : undefined} onPress={() => dbSet(io, 'mapSelected', cur => (cur === x.id ? null : x.id))}>
                {x.label} <Text dimColor>{x.id.startsWith('pkg:') ? 'pkg' : x.fileCount}</Text>
              </Button>
            ))}
          </Box>
        )
      })}
    </Box>
  )
  let detail: RenderElement | null = null
  if (sel) {
    const uses = map.edges.filter(e => e.from === sel.id).sort((a, b) => b.weight - a.weight)
    const usedBy = map.edges.filter(e => e.to === sel.id).sort((a, b) => b.weight - a.weight)
    const techs = sel.tech.map(t => map.stack.find(s => s.name === t)).filter(Boolean)
    detail = (
      <Box flexDirection="column" borderStyle="round" borderColor="#f97316" paddingX={1}>
        <Text bold size="heading">
          {sel.label}
        </Text>
        <Text dimColor>
          {LAYER_NAME[sel.layer]} · {sel.summary}
        </Text>
        {techs.length ? <Text bold>Technology</Text> : null}
        {techs.map(t => (
          <Text size="footnote">
            {'  '}
            <Text bold>{t?.name}</Text> — {t?.what}
          </Text>
        ))}
        <Text bold>Relationships</Text>
        {uses.length === 0 && usedBy.length === 0 ? <Text dimColor> No imports detected to or from other parts.</Text> : null}
        {uses.map(e => (
          <Text size="footnote">
            {'  '}→ uses {label(e.to)} ({e.weight} import{e.weight === 1 ? '' : 's'})
          </Text>
        ))}
        {usedBy.map(e => (
          <Text size="footnote">
            {'  '}← used by {label(e.from)} ({e.weight})
          </Text>
        ))}
        <Text bold>Files ({sel.fileCount})</Text>
        {sel.files.slice(0, 20).map(f => (
          <Text mono size="caption">
            {'  '}
            {f}
          </Text>
        ))}
        {sel.fileCount > 20 ? <Text dimColor size="caption"> …and {sel.fileCount - 20} more</Text> : null}
        <Box flexDirection="row" marginTop={1}>
          <Button key={`explain-comp:${sel.id}`} label="Explain how this is implemented" onPress={() => act.explainComponent(io, sel, level)} />
        </Box>
        {AiText(c, `comp:${sel.id}:${level}`)}
      </Box>
    )
  }
  const cats = new Map<string, typeof map.stack>()
  for (const t of map.stack) cats.set(t.category, [...(cats.get(t.category) ?? []), t])
  return (
    <Box flexDirection="column">
      {header}
      {Section(c, 'Architecture', <Box flexDirection="column" gap={1}>{diagram}{buttons}{detail}</Box>, 'arrows follow real imports')}
      {Section(
        c,
        'Tech stack',
        <Box flexDirection="column">
          {map.stack.length === 0 ? <Text dimColor>No manifests found (package.json, requirements.txt, go.mod…).</Text> : null}
          {[...cats].map(([cat, list]) => (
            <Box flexDirection="column" marginBottom={1}>
              <Text dimColor size="caption">
                {cat.toUpperCase()}
              </Text>
              {list.map(t => (
                <Text size="footnote">
                  <Text bold>{t.name}</Text> — {t.what} <Text dimColor>({t.evidence})</Text>
                </Text>
              ))}
            </Box>
          ))}
          {map.languages.length ? (
            <Text dimColor size="caption">
              Languages: {map.languages.slice(0, 6).map(l => `${l.name} ${l.files}`).join(' · ')}
            </Text>
          ) : null}
        </Box>,
      )}
    </Box>
  )
}

// ---------- Under the Shell
async function shellView(io: IO, c: Ctx): Promise<RenderElement> {
  const { K } = c
  const { Box, Text, Button, Markdown } = K
  const level = c.settings.level
  const events = await io.log()
  const lessons = await aiGet(io, 'lessons')
  const edits = events.filter(e => (e.kind === 'edit' || e.kind === 'write') && e.diff).slice(-8).reverse()
  const LEVELS: { value: Level; label: string }[] = [
    { value: 'beginner', label: '🐣 Beginner' },
    { value: 'intermediate', label: '🦀 Intermediate' },
    { value: 'advanced', label: '🦞 Advanced' },
  ]
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {LEVELS.map(l => (
          <Button key={`level:${l.value}`} label={l.label} variant={level === l.value ? 'primary' : undefined} onPress={() => act.saveSettings(io, s => ({ ...s, level: l.value }))} />
        ))}
      </Box>
      {Section(
        c,
        'The big picture',
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button key="why-session" label="What changed and why" onPress={() => act.explainSession(io, level)} />
            <Button key="why-decisions" label="Engineering decisions" onPress={() => act.explainDecisions(io, level)} />
          </Box>
          {AiText(c, `session:${level}`)}
          {AiText(c, `decisions:${level}`)}
        </Box>,
        'read from this session’s own transcript',
      )}
      {Section(
        c,
        'Recent code changes',
        <Box flexDirection="column" gap={1}>
          {edits.length === 0 ? <Text dimColor>No code changes yet in this session.</Text> : null}
          {edits.map(e => (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text bold>{short(e.title, 70)}</Text>
                <Text dimColor size="caption">
                  {e.detail} · {clockTime(e.t)}
                </Text>
                {!c.ai[`ev:${e.id}:${level}`] && !c.busy[`ev:${e.id}:${level}`] ? <Button key={`learn:${e.id}`} label="Explain" plain onPress={() => act.explainEvent(io, e, level)} /> : null}
              </Box>
              {AiText(c, `ev:${e.id}:${level}`)}
            </Box>
          ))}
        </Box>,
      )}
      {Section(
        c,
        'Lessons & quizzes',
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1}>
            <Button key="gen-lesson" label={c.busy.lesson ? 'Writing a lesson…' : 'Generate a lesson from this code'} variant="primary" onPress={() => act.generateLesson(io, level)} />
          </Box>
          {c.ai.lesson ? <Text color="warning">{c.ai.lesson}</Text> : null}
          {lessons.length === 0 ? <Text dimColor>Lessons are written from the code changed in this session (or the project’s files) at your chosen level, with a short quiz.</Text> : null}
          {lessons.slice(0, 4).map((l, li) => {
            const answered = l.answers.filter(a => a !== null).length
            const score = l.quiz.filter((q, i) => l.answers[i] === q.answer).length
            return (
              <Box flexDirection="column" borderStyle="round" borderColor="#a78bfa" paddingX={1} gap={1}>
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  <Text bold size="heading">
                    {l.title}
                  </Text>
                  <Text dimColor size="caption">
                    {l.level} · {ago(c.now - l.t)}
                    {answered ? ` · score ${score}/${l.quiz.length}` : ''}
                  </Text>
                </Box>
                {li === 0 ? <Markdown key={`lesson:${l.id}`} text={l.body} /> : <Text dimColor>{short(l.body.replace(/[#*`]/g, ''), 160)}</Text>}
                {li === 0
                  ? l.quiz.map((q, qi) => {
                      const a = l.answers[qi]
                      return (
                        <Box flexDirection="column">
                          <Text bold>
                            Q{qi + 1}. {q.q}
                          </Text>
                          <Box flexDirection="column">
                            {q.options.map((o, oi) =>
                              a === null || a === undefined ? (
                                <Button key={`q:${l.id}:${qi}:${oi}`} plain label={`${String.fromCharCode(65 + oi)}. ${o}`} onPress={() => act.answerQuiz(io, l.id, qi, oi)} />
                              ) : (
                                <Text color={oi === q.answer ? 'success' : oi === a ? 'error' : undefined} dimColor={oi !== q.answer && oi !== a}>
                                  {oi === q.answer ? '✓' : oi === a ? '✗' : ' '} {String.fromCharCode(65 + oi)}. {o}
                                </Text>
                              ),
                            )}
                          </Box>
                          {a !== null && a !== undefined ? (
                            <Text dimColor size="footnote">
                              {a === q.answer ? 'Correct! ' : 'Not quite. '}
                              {q.why}
                            </Text>
                          ) : null}
                        </Box>
                      )
                    })
                  : null}
              </Box>
            )
          })}
        </Box>,
      )}
    </Box>
  )
}

// ---------- Crab House
async function houseView(io: IO, c: Ctx): Promise<RenderElement> {
  const { K } = c
  const { Box, Text, Button, Input, Svg } = K
  const s = c.settings
  const editing = await dbGet(io, 'editingCrab')
  const previewState = await dbGet(io, 'previewState')
  const save = (fn: (s: BoardSettings) => BoardSettings) => act.saveSettings(io, fn)

  const move = (i: number, d: number) =>
    save(cur => {
      const ws = cur.workspaces.slice()
      const j = i + d
      if (j < 0 || j >= ws.length) return cur
      const a = ws[i]
      const b = ws[j]
      if (!a || !b) return cur
      ws[i] = b
      ws[j] = a
      return { ...cur, workspaces: ws }
    })

  const workspaces = (
    <Box flexDirection="column" gap={1}>
      {s.workspaces.map((w, i) => (
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Text dimColor mono>
            {i + 1}.
          </Text>
          {Input && c.surface !== 'mobile' ? (
            <Input key={`rename:${w.id}`} value={w.name} placeholder={w.name} submitLabel="Rename" onSubmit={v => save(cur => ({ ...cur, workspaces: cur.workspaces.map(x => (x.id === w.id ? { ...x, name: v.trim().slice(0, 40) || x.name } : x)) }))} />
          ) : (
            <Text bold>{w.name}</Text>
          )}
          <Button key={`up:${w.id}`} label="↑" onPress={() => move(i, -1)} />
          <Button key={`down:${w.id}`} label="↓" onPress={() => move(i, 1)} />
          {w.id === 'house' ? (
            <Text dimColor size="caption">
              always shown
            </Text>
          ) : (
            <Button key={`hide:${w.id}`} label={w.hidden ? 'Show' : 'Hide'} onPress={() => save(cur => ({ ...cur, workspaces: cur.workspaces.map(x => (x.id === w.id ? { ...x, hidden: !x.hidden } : x)) }))} />
          )}
        </Box>
      ))}
    </Box>
  )

  const display = (
    <Box flexDirection="column" gap={1}>
      {Picker(c, 'layout', 'Layout', s.layout, [{ value: 'decorative', label: 'Decorative' }, { value: 'compact', label: 'Compact' }], v => save(cur => ({ ...cur, layout: v === 'compact' ? 'compact' : 'decorative' })))}
      {Picker(c, 'colony', 'Colony layout', s.colony, [{ value: 'beach', label: 'Beach' }, { value: 'row', label: 'Row' }, { value: 'grid', label: 'Grid' }], v => save(cur => ({ ...cur, colony: v === 'row' || v === 'grid' ? v : 'beach' })))}
      {Toggle(c, 'reduced', 'Reduced motion (no animation)', s.reducedMotion, () => save(cur => ({ ...cur, reducedMotion: !cur.reducedMotion })))}
      {Toggle(c, 'idle', 'Idle animations (blinking, bubbles, snoozing)', s.idle, () => save(cur => ({ ...cur, idle: !cur.idle })))}
      {Toggle(c, 'auto-explain', 'Explain each turn’s code changes automatically (uses your model quota)', s.autoExplain, () => save(cur => ({ ...cur, autoExplain: !cur.autoExplain })))}
    </Box>
  )

  // Crab customizer: the main crab, each live helper, each helper type seen
  const targets: { value: string; label: string }[] = [{ value: 'main', label: `Main crab (${nameFor(c.crabs.find(x => x.id === 'main') ?? ({ name: 'Clawde', id: 'main', key: 'main' } as Crab), s)})` }]
  for (const cr of c.crabs.filter(x => x.kind === 'sub')) targets.push({ value: cr.id, label: `This helper: ${nameFor(cr, s)}` })
  const types = new Set([...c.crabs.filter(x => x.kind === 'sub').map(x => x.key), ...Object.keys(s.looks).filter(k => k.startsWith('type:'))])
  for (const t of types) targets.push({ value: t, label: `Every ${t.slice(5)} helper` })
  const target = targets.some(t => t.value === editing) ? editing : 'main'
  const sample: Crab = c.crabs.find(x => x.id === target) ?? ({ id: target, key: target, kind: target === 'main' ? 'main' : 'sub', name: target === 'main' ? 'Clawde' : 'Helper' } as Crab)
  const look: CrabLook = s.looks[target] ?? lookFor(sample, s)
  const setLook = (patch: Partial<CrabLook>) => save(cur => ({ ...cur, looks: { ...cur.looks, [target]: { ...(cur.looks[target] ?? look), ...patch } } }))
  const opts = (xs: readonly string[]) => xs.map(x => ({ value: x, label: x[0]?.toUpperCase() + x.slice(1) }))

  const preview =
    Svg && c.surface !== 'terminal' ? (
      <Svg source={crabSvg({ look, state: previewState, motion: !s.reducedMotion, idle: s.idle, seed: target }, `Preview: ${previewState}`, 5)} alt={`Preview of the crab ${previewState}`} width={150} height={120} isInteractive={!s.reducedMotion ? true : undefined} />
    ) : (
      <Text>{crabAscii(previewState)}</Text>
    )

  const customizer = (
    <Box flexDirection="column" gap={1}>
      {Picker(c, 'target', 'Customize', target, targets, v => dbSet(io, 'editingCrab', () => v))}
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        <Box flexDirection="column" alignItems="center">
          {preview}
          <Box flexDirection="row" flexWrap="wrap" gap={0}>
            {STATES.map(st => (
              <Button key={`pv:${st}`} plain label={st === previewState ? `[${st}]` : st} onPress={() => dbSet(io, 'previewState', () => st)} />
            ))}
          </Box>
        </Box>
        <Box flexDirection="column" gap={1} flexGrow={1}>
          {Input && c.surface !== 'mobile' ? (
            <Input key={`name:${target}`} label="Name" value={look.name ?? ''} placeholder={nameFor(sample, s)} submitLabel="Save" onSubmit={v => setLook({ name: v.trim().slice(0, 24) || undefined })} />
          ) : null}
          {Picker(c, 'color', 'Color', look.color, Object.keys(COLORS).map(k => ({ value: k, label: k[0]?.toUpperCase() + k.slice(1) })), v => setLook({ color: v }))}
          {Picker(c, 'shell', 'Shell', look.shell, opts(SHELLS), v => setLook({ shell: v }))}
          {Picker(c, 'hat', 'Hat', look.hat, opts(HATS), v => setLook({ hat: v }))}
          {Picker(c, 'skin', 'Skin', look.skin, opts(SKINS), v => setLook({ skin: v }))}
          {Picker(c, 'anim', 'Animation', look.anim, opts(ANIMS), v => setLook({ anim: v }))}
          <Box flexDirection="row" gap={1}>
            <Button
              key="reset-crab"
              label="Reset this crab"
              onPress={() =>
                save(cur => {
                  const looks = { ...cur.looks }
                  delete looks[target]
                  return { ...cur, looks }
                })
              }
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column">
      {Section(c, 'Workspaces', workspaces, 'rename, reorder, hide')}
      {Section(c, 'Display', display)}
      {Section(c, 'Crab wardrobe', customizer)}
      <Box flexDirection="row" marginTop={1}>
        <Button key="reset-all" label="Reset all Clawboard settings" onPress={() => act.saveSettings(io, () => ({ workspaces: [], layout: 'decorative', reducedMotion: false, idle: true, colony: 'beach', level: 'beginner', autoExplain: false, looks: {} }))} />
      </Box>
    </Box>
  )
}

// ---------- the pane
export async function renderPane(io: IO, K: Kit, e: PaneEvent): Promise<RenderElement> {
  const { Box, Text, Button } = K
  const [settings, crabMap, busy, ai, tabRaw, now, root] = await Promise.all([io.settings(), dbGet(io, 'crabs'), aiGet(io, 'busy'), aiGet(io, 'text'), dbGet(io, 'tab'), io.now(), io.cwd()])
  const cols = e.props.bodyColumns || 60
  const crabs = Object.values(crabMap).sort((a, b) => (a.kind === 'main' ? -1 : b.kind === 'main' ? 1 : a.startedAt - b.startedAt))
  const c: Ctx = { K, surface: e.surface, cols, px: Math.round(Math.max(260, Math.min(760, cols * 7.4))), now, root, settings, crabs, busy, ai }

  const visible = settings.workspaces.filter(w => !w.hidden)
  const tab: WorkspaceId = visible.some(w => w.id === tabRaw) ? tabRaw : (visible[0]?.id ?? 'house')
  const main = crabs.find(x => x.id === 'main')
  const usage = await dbGet(io, 'usage')
  const five = usage?.rateLimits.find(r => r.kind === 'five_hour')

  const tabs = (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {visible.map((w, i) => (
        <Button key={`tab:${w.id}`} label={w.name} hotkey={String(i + 1)} variant={w.id === tab ? 'primary' : undefined} onPress={() => dbSet(io, 'tab', () => w.id)} />
      ))}
    </Box>
  )

  let body: RenderElement
  if (tab === 'crew') body = await crewView(io, c)
  else if (tab === 'tide') body = await tideView(io, c)
  else if (tab === 'burrow') body = await burrowView(io, c)
  else if (tab === 'shell') body = await shellView(io, c)
  else body = await houseView(io, c)

  const decorative = settings.layout === 'decorative'
  return (
    <Box flexDirection="column" gap={decorative ? 1 : 0}>
      <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
        <Text bold size={decorative ? 'title' : 'body'} color="#e8590c">
          🦀 Clawboard
        </Text>
        {main ? (
          <Text dimColor size="caption">
            {nameFor(main, settings)} is {STATE_LABEL[main.state].toLowerCase()}
            {usage?.contextPercent !== undefined ? ` · context ${usage.contextPercent}%` : ''}
            {five ? ` · 5h ${five.percentUsed}%` : ''}
          </Text>
        ) : null}
      </Box>
      {tabs}
      {body}
    </Box>
  )
}
