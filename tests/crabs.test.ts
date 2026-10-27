import { expect, test } from 'claude-code/testing'
import { STATES, colonySvg, crabSvg } from '../hooks/crabs'

const LOOK = { color: 'coral', shell: 'round', hat: 'none', anim: 'scuttle', skin: 'classic' }

test('every state draws a different crab', () => {
  const drawn = new Set(STATES.map(state => crabSvg({ look: LOOK, state, motion: false, idle: false, seed: 'a' }, state)))
  expect(drawn.size).toBe(STATES.length)
})

test('reduced motion draws no animation at all', () => {
  for (const state of STATES) {
    const still = crabSvg({ look: { ...LOOK, hat: 'propeller', skin: 'shiny' }, state, motion: false, idle: true, seed: 'a' }, state)
    expect(still.includes('<animate')).toBe(false)
  }
  expect(crabSvg({ look: LOOK, state: 'coding', motion: true, idle: true, seed: 'a' }, 'coding').includes('<animate')).toBe(true)
})

test('names and titles are escaped, so a helper cannot inject markup into the colony', () => {
  const scene = colonySvg(
    [{ id: 'x', name: '<script>alert(1)</script>', state: 'coding', look: LOOK, title: 'a "quoted" & <tag>', selected: false }],
    { layout: 'beach', motion: false, idle: false, decorative: true, width: 400 },
  )
  expect(scene.svg.includes('<script>')).toBe(false)
  expect(scene.svg.includes('&lt;script&gt;')).toBe(true)
})

test('every layout places every crab', () => {
  const crabs = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: `Crab-${id}`, state: 'waiting' as const, look: LOOK, title: id, selected: false }))
  for (const layout of ['beach', 'row', 'grid'] as const) {
    const { svg } = colonySvg(crabs, { layout, motion: false, idle: false, decorative: false, width: 400 })
    for (const c of crabs) expect(svg.includes(c.name)).toBe(true)
  }
})
