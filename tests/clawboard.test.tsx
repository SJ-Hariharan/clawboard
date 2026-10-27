import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

type Opts = { opens?: string[]; closes?: string[]; panes?: { id: string; isPlaced?: boolean }[]; commands?: unknown[]; store?: boolean; stored?: Record<string, unknown>; limits?: { kind: string; percentUsed: number; resetsAt?: string }[]; agents?: unknown[]; surfaces?: string[] }

function engine(on: On, opts: Opts = {}) {
  const clock = mock.clock(on)
  if (opts.store !== false) mock.store(on, opts.stored)
  on('command.register', (_, e) => {
    opts.commands?.push(e)
    return { value: { command: 'clawboard' } }
  })
  on('ui.open', (_, e) => {
    opts.opens?.push((e as { id: string }).id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    opts.closes?.push((e as { id: string }).id)
    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: (opts.panes ?? []) as never }))
  on('session.surfaces', () => ({ value: (opts.surfaces ?? ['desktop']) as never }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/clawboard-test' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 42000, window: 200000, percent: 21 }, rateLimits: opts.limits ?? [{ kind: 'five_hour', percentUsed: 37.5, resetsAt: '2026-10-27T23:00:00Z' }], cost: { usd: 0.42 } } }))
  on('agent.list', () => ({ value: (opts.agents ?? []) as never }))
  on('fs.list', (_, e) => ({ value: String((e as { path?: string }).path ?? '').endsWith('src') ? [{ name: 'App.tsx', kind: 'file', size: 10, mtimeMs: 0, isLink: false }] : [{ name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }, { name: 'package.json', kind: 'file', size: 10, mtimeMs: 0, isLink: false }] }))
  on('fs.read', (_, e) => ({ value: String((e as { path?: string }).path ?? '').endsWith('package.json') ? '{"dependencies":{"react":"18","express":"4"}}' : "import React from 'react'\n" }))
  return clock
}

const PANE = {
  plugin: 'clawboard',
  component: 'Pane',
  requestId: 'clawboard',
  props: {
    title: 'Clawboard',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('crabs follow real tool calls and every workspace draws', async ($, on) => {
  engine(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', (_, e) => {
    if (e.tool === 'Bash') return { result: {}, text: '3 passed, 1 failed', isError: true }
    return { result: {}, text: 'ok' }
  })

  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'Add a login form', wait: false, origin: { kind: 'composer' } } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/clawboard-test/src/components/Login.tsx', old_string: 'a', new_string: 'b\nc' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Clawboard/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Edited src\/components\/Login\.tsx/ })).toBeDefined()
    // The failing test run put the main crab into debugging.
    expect(await ui.find({ type: 'Text', text: /Debugging/ })).toBeDefined()
    for (const tab of ['tide', 'burrow', 'shell', 'house', 'crew']) {
      await ui.press({ key: `tab:${tab}` })
      expect(await ui.find({ type: 'Text', text: /Clawboard/ })).toBeDefined()
    }
    await ui.unmount()
  }
})

test('settings can rename and hide workspaces', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab:house' })
  await ui.input({ key: 'rename:tide', text: 'Token Tides' })
  expect(await ui.find({ key: 'tab:tide' })).toBeDefined()
  await ui.press({ key: 'hide:burrow' })
  expect(await ui.find({ key: 'tab:burrow' })).toBeUndefined()
  await ui.press({ key: 'reduced' })
  await ui.press({ key: 'tab:crew' })
  expect(await ui.find({ type: 'Text', text: /Clawde/ })).toBeDefined()
  await ui.unmount()
})

test('a limit the API did not report is shown as unavailable, never estimated', async ($, on) => {
  const clock = engine(on, { limits: [] })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await clock.advance(1000) // let the first usage poll land
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab:tide' })
  expect(await ui.find({ type: 'Text', text: /claude-opus-5-5/ })).toBeDefined() // the poll did run
  expect(await ui.find({ type: 'Text', text: /Five-hour limit/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Weekly limit/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Unavailable/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /% used/ })).toBeUndefined()
  await ui.unmount()
})

test('a limit the API reported is shown as reported', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab:tide' })
  expect(await ui.find({ type: 'Text', text: /37\.5% used/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /62\.5% remaining/ })).toBeDefined()
  await ui.unmount()
})

test('a subagent gets its own crab and a one-agent session gets one', async ($, on) => {
  engine(on, { agents: [{ id: 'sub1', type: 'Explore', description: 'find the auth code', status: 'running' }] })
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'crab:main' })).toBeDefined()
  expect(await ui.find({ key: 'crab:sub1' })).toBeUndefined()
  await $.tool.call({ tool: 'Read', file_path: '/tmp/clawboard-test/a.ts', agentId: 'sub1' } as never)
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'crab:sub1' })).toBeDefined()
  await ui.unmount()
})

test('settings persist across sessions', async ($, on) => {
  engine(on, { store: false })
  on('store.get', () => ({ value: undefined }))
  const writes: Record<string, unknown> = {}
  on('store.set', (_, e) => {
    writes[(e as { key: string }).key] = (e as { value: unknown }).value
    return { value: undefined }
  })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab:house' })
  await ui.input({ key: 'rename:crew', text: 'The Colony' })
  const saved = writes.settings as { workspaces: { id: string; name: string }[] }
  expect(saved.workspaces.find(w => w.id === 'crew')?.name).toBe('The Colony')
  await ui.unmount()
})

test('/clear starts the colony over', async ($, on) => {
  engine(on)
  on('session.end', () => ({ sessionId: 's1' }) as never)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/clawboard-test/a.ts', old_string: 'a', new_string: 'b' })
  await $.session.end({ reason: 'clear' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Edited a\.ts/ })).toBeUndefined()
  await ui.unmount()
})

test('saved lessons come back when a session starts', async ($, on) => {
  const lesson = { id: 'L1', t: 1, level: 'beginner', title: 'Why tests come first', body: 'The idea', quiz: [{ q: 'Why?', options: ['a', 'b'], answer: 0, why: 'because' }], answers: [null] }
  engine(on, { stored: { 'lessons:/tmp/clawboard-test': [lesson] } })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab:shell' })
  expect(await ui.find({ type: 'Text', text: /Why tests come first/ })).toBeDefined()
  await ui.unmount()
})

test('quiz answers are saved with the lesson', async ($, on) => {
  const lesson = { id: 'L1', t: 1, level: 'beginner', title: 'Why tests come first', body: 'The idea', quiz: [{ q: 'Why?', options: ['a', 'b'], answer: 0, why: 'because' }], answers: [null] }
  engine(on, { store: false })
  on('store.get', (_, e) => ({ value: (e as { key: string }).key === 'lessons:/tmp/clawboard-test' ? [lesson] : undefined }))
  const writes: Record<string, unknown> = {}
  on('store.set', (_, e) => {
    writes[(e as { key: string }).key] = (e as { value: unknown }).value
    return { value: undefined }
  })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab:shell' })
  await ui.press({ key: 'q:L1:0:1' })
  const saved = writes['lessons:/tmp/clawboard-test'] as { answers: (number | null)[] }[]
  expect(saved[0]?.answers).toEqual([1])
  await ui.unmount()
})

test('/clawboard is registered to run at once, even mid-turn', async ($, on) => {
  const commands: unknown[] = []
  engine(on, { commands })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  expect((commands[0] as { name: string; immediate?: boolean }).name).toBe('clawboard')
  expect((commands[0] as { immediate?: boolean }).immediate).toBe(true)
})

test('the panel opens by itself at start, and on every message while it is not showing', async ($, on) => {
  const opens: string[] = []
  engine(on, { opens }) // no pane is listed, so nothing is showing
  on('prompt.submit', (_, e) => ({ text: e.text }))
  const say = (text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } } as never)
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  expect(opens).toEqual(['clawboard'])
  await say('hello')
  await say('again')
  expect(opens).toEqual(['clawboard', 'clawboard', 'clawboard'])
})

test('a message does not reopen a panel that is already showing', async ($, on) => {
  const opens: string[] = []
  engine(on, { opens, panes: [{ id: 'clawboard', isPlaced: true }] })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } } as never)
  expect(opens).toEqual(['clawboard']) // only the one from session start
})

test('the terminal does not open the panel by itself', async ($, on) => {
  const opens: string[] = []
  engine(on, { opens, surfaces: ['terminal'] })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'terminal', isInteractive: true })
  expect(opens).toEqual([])
})

test('auto-open can be switched off in Crab House settings', async ($, on) => {
  const opens: string[] = []
  engine(on, { opens, stored: { settings: { autoOpen: false } } })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } } as never)
  expect(opens).toEqual([])
})

test('/clawboard close keeps the panel closed until /clawboard brings it back', async ($, on) => {
  const opens: string[] = []
  const closes: string[] = []
  engine(on, { opens, closes, panes: [{ id: 'clawboard', isPlaced: true }] })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  const run = (args: string) => $.command.run({ command: 'clawboard', args, origin: { kind: 'user' }, presentation: {} } as never)
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await run('close')
  expect(closes).toEqual(['clawboard'])
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } } as never)
  expect(opens).toEqual(['clawboard']) // only the one from session start
  await run('')
  expect(opens).toEqual(['clawboard', 'clawboard'])
  await run('toggle') // it is open, so toggle closes it
  expect(closes).toEqual(['clawboard', 'clawboard'])
})

test('toggle opens a panel that exists but was never drawn, instead of closing it', async ($, on) => {
  const opens: string[] = []
  const closes: string[] = []
  engine(on, { opens, closes, panes: [{ id: 'clawboard', isPlaced: false }] })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'clawboard', args: 'toggle', origin: { kind: 'user' }, presentation: {} } as never)
  expect(closes).toEqual([])
  expect(opens).toEqual(['clawboard', 'clawboard'])
})

test('a background notification or another plugin does not count as you asking for the panel', async ($, on) => {
  const opens: string[] = []
  engine(on, { opens })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'a task finished', wait: false, origin: { kind: 'task-notification' } } as never)
  await $.prompt.submit({ text: 'from a plugin', wait: false, origin: { kind: 'plugin', name: 'other' } } as never)
  expect(opens).toEqual(['clawboard']) // only session start
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } } as never)
  expect(opens).toEqual(['clawboard', 'clawboard'])
})

const BAND = {
  plugin: 'clawboard',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

test('the strip above the prompt is always there, shows live state, and a click opens the panel', async ($, on) => {
  const opens: string[] = []
  const clock = engine(on, { opens })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await clock.advance(1000)
  for (const surface of ['desktop', 'terminal'] as const) {
    const before = opens.length
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /is waiting/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /context 21%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h 37\.5%/ })).toBeDefined()
    await ui.press({ key: 'open-clawboard' })
    expect(opens.length).toBe(before + 1)
    await ui.unmount()
  }
})

test('a click on the strip also works while Claude is busy, and re-enables a /clawboard close', async ($, on) => {
  const opens: string[] = []
  engine(on, { opens, panes: [{ id: 'clawboard', isPlaced: true }] })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'clawboard', args: 'close', origin: { kind: 'user' }, presentation: {} } as never)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true }, surface: 'desktop' })
  const before = opens.length
  await ui.press({ key: 'open-clawboard' })
  expect(opens.length).toBe(before + 1)
  await ui.unmount()
})

test('the strip can be switched off in Crab House and then leaves the prompt to the engine', async ($, on) => {
  engine(on, { stored: { settings: { strip: false } } })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'open-clawboard' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('Crab House says who closed the panel last', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp/clawboard-test', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab:house' })
  expect(await ui.find({ type: 'Text', text: /has not been closed in this session/ })).toBeDefined()
  await $.command.run({ command: 'clawboard', args: 'close', origin: { kind: 'user' }, presentation: {} } as never)
  expect(await ui.find({ type: 'Text', text: /Last time the panel closed/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /by \/clawboard close or toggle/ })).toBeDefined()
  await ui.unmount()
})
