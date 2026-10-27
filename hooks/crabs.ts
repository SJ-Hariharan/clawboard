// Pixel-art crabs drawn as SVG, animated with SMIL (no scripts).
import type { CrabLook, CrabState } from '../types'

export const COLORS: Record<string, string> = {
  coral: '#f26b4f',
  ruby: '#d63a3a',
  sunset: '#f59e0b',
  lemon: '#eab308',
  lime: '#84cc16',
  mint: '#34d399',
  lagoon: '#14b8a6',
  ocean: '#3b82f6',
  violet: '#8b5cf6',
  bubblegum: '#ec4899',
  sand: '#c9a46a',
  slate: '#64748b',
}
export const SHELLS = ['round', 'spiky', 'striped', 'spotted', 'spiral'] as const
export const HATS = ['none', 'party', 'tophat', 'crown', 'pirate', 'beanie', 'chef', 'propeller', 'wizard', 'flower'] as const
export const ANIMS = ['scuttle', 'bob', 'dance', 'still'] as const
export const SKINS = ['classic', 'pastel', 'glow', 'robot', 'ghost', 'shiny'] as const
export const STATES: CrabState[] = ['exploring', 'coding', 'debugging', 'testing', 'waiting', 'finished']

export const STATE_COLOR: Record<CrabState, string> = {
  exploring: '#3b82f6',
  coding: '#8b5cf6',
  debugging: '#ef4444',
  testing: '#f59e0b',
  waiting: '#64748b',
  finished: '#22c55e',
}
export const STATE_LABEL: Record<CrabState, string> = {
  exploring: 'Exploring',
  coding: 'Coding',
  debugging: 'Debugging',
  testing: 'Testing',
  waiting: 'Waiting',
  finished: 'Finished',
}
const GLYPH: Record<CrabState, string> = {
  exploring: '?',
  coding: '</>',
  debugging: '!',
  testing: 'test',
  waiting: '...',
  finished: 'done',
}

export const DEFAULT_LOOK: CrabLook = { color: 'coral', shell: 'round', hat: 'none', anim: 'scuttle', skin: 'classic' }

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => hex(v + ((pb[i] ?? 0) - v) * t)).join('')
}

/** Rows of characters -> merged <rect>s. */
function pixels(rows: string[], ox: number, oy: number, map: Record<string, string>): string {
  let out = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x] ?? '.'
      const fill = map[ch]
      if (!fill) {
        x++
        continue
      }
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      out += `<rect x="${ox + x}" y="${oy + y}" width="${end - x}" height="1" fill="${fill}"/>`
      x = end
    }
  })
  return out
}

const BODY = [
  '......SSSSSSSS......',
  '.....SHHSSSSSSS.....',
  '....SHHSSSSSSSSS....',
  '....SSSSSSSSSSSS....',
  '....SSSSMSSMSSSS....',
  '.....DSSSMMSSSD.....',
  '......DDDDDDDD......',
] // y 5..11

const SHELL_EXTRA: Record<string, string[]> = {
  spiky: ['.....X..X..X..X.....', '....................'], // drawn at y4
  striped: ['....................', '....................', '....DDDDDDDDDDDD....', '....................', '....................'],
  spotted: ['....................', '..........H.........', '.......H.......H....', '...........H........'],
  spiral: ['....................', '..........DDDD......', '.........D....D.....', '.........D..DD......', '..........D.........'],
}

const EYES = ['......EE....EE......', '......EE....EE......', '.......D....D.......', '.......D....D.......'] // y1..4

const CLAW_L = ['C.C.', 'CCC.', '.CC.', '..C.', '..C.', '...C'] // y1..6, x0..3
const CLAW_R = CLAW_L.map(r => r.split('').reverse().join('')) // x16..19

const HAT: Record<string, { rows: string[]; y: number; map: Record<string, string> }> = {
  party: {
    y: -6,
    rows: ['....YY....', '....PP....', '...PYYP...', '...PPPP...', '..PYYYYP..', '..PPPPPP..'],
    map: { P: '#ff5fa2', Y: '#ffd23f' },
  },
  tophat: {
    y: -6,
    rows: ['...KKKK...', '...KKKK...', '...KKKK...', '...RRRR...', '.KKKKKKKK.'],
    map: { K: '#1f2937', R: '#dc2626' },
  },
  crown: {
    y: -4,
    rows: ['..G.GG.G..', '..GGGGGG..', '..GJGGJG..', '..GGGGGG..'],
    map: { G: '#facc15', J: '#e11d48' },
  },
  pirate: {
    y: -4,
    rows: ['...KKKK...', '..KKWWKK..', '.KKKKKKKK.'],
    map: { K: '#111827', W: '#f9fafb' },
  },
  beanie: {
    y: -5,
    rows: ['....WW....', '...BBBB...', '..BBBBBB..', '..WWWWWW..'],
    map: { B: '#2563eb', W: '#f8fafc' },
  },
  chef: {
    y: -6,
    rows: ['..WWWWWW..', '.WWWWWWWW.', '..WWWWWW..', '..GGGGGG..'],
    map: { W: '#ffffff', G: '#d1d5db' },
  },
  propeller: {
    y: -5,
    rows: ['....KK....', '...YBYB...', '..BYBYBY..', '..BBBBBB..'],
    map: { K: '#374151', B: '#2563eb', Y: '#facc15' },
  },
  wizard: {
    y: -8,
    rows: ['.....V....', '....VV....', '....VY....', '...VVVV...', '...VYVV...', '..VVVVVV..', '.VVVVVVVV.'],
    map: { V: '#6d28d9', Y: '#fde047' },
  },
  flower: {
    y: -4,
    rows: ['....F.....', '...FYF....', '....F.....', '....G.....'],
    map: { F: '#f472b6', Y: '#fde047', G: '#16a34a' },
  },
}

export type CrabDrawOpts = {
  look: CrabLook
  state: CrabState
  motion: boolean
  idle: boolean
  seed: string
  bubble?: boolean
}

function anim(type: string, values: string, dur: number, seed: number, extra = ''): string {
  const begin = -((seed % 1000) / 1000) * dur
  return `<animateTransform attributeName="transform" type="${type}" values="${values}" dur="${dur}s" begin="${begin.toFixed(2)}s" repeatCount="indefinite" ${extra}/>`
}

/** One crab, in grid units: body spans x 0..19, y -8..13. */
export function crabGroup(o: CrabDrawOpts): string {
  const { look, state, motion, idle } = o
  const seed = hash(o.seed)
  let base = COLORS[look.color] ?? look.color
  if (!/^#[0-9a-f]{6}$/i.test(base)) base = COLORS.coral ?? '#f26b4f'
  if (look.skin === 'pastel') base = mix(base, '#ffffff', 0.45)
  if (look.skin === 'robot') base = mix(base, '#9aa5b1', 0.6)
  const dark = mix(base, '#000000', 0.35)
  const light = mix(base, '#ffffff', 0.45)
  const claw = mix(base, '#000000', 0.12)
  const map: Record<string, string> = { S: base, H: light, D: dark, M: mix(base, '#000000', 0.6), C: claw, X: dark }

  const finished = state === 'finished'
  const coding = state === 'coding'

  // Legs
  const legA = `<g>${pixels(['X'], 3, 9, map)}${pixels(['X'], 2, 10, map)}${pixels(['X'], 1, 11, map)}${pixels(['X'], 14, 11, map)}${pixels(['X'], 15, 12, map)}${pixels(['X'], 16, 13, map)}${
    motion ? anim('translate', '0 0;0 -0.8;0 0', 0.5, seed) : ''
  }</g>`
  const legB = `<g>${pixels(['X'], 16, 9, map)}${pixels(['X'], 17, 10, map)}${pixels(['X'], 18, 11, map)}${pixels(['X'], 5, 11, map)}${pixels(['X'], 4, 12, map)}${pixels(['X'], 3, 13, map)}${
    motion ? anim('translate', '0 -0.8;0 0;0 -0.8', 0.5, seed) : ''
  }</g>`

  // Body + shell decoration
  let body = pixels(BODY, 0, 5, map)
  const extra = SHELL_EXTRA[look.shell]
  if (extra) body += pixels(extra, 0, look.shell === 'spiky' ? 4 : 5, map)
  if (look.skin === 'robot') {
    body += pixels(['.....H........H.....'], 0, 8, { H: '#e5e7eb' })
  }
  if (look.skin === 'shiny') {
    const twinkle = (values: string, dur: number) => (motion ? `<animate attributeName="opacity" values="${values}" dur="${dur}s" repeatCount="indefinite"/>` : '')
    body += `<g fill="#ffffff"><rect x="6" y="6" width="1" height="1">${twinkle('0;1;0', 2.2)}</rect><rect x="13" y="7" width="0.6" height="0.6">${twinkle('1;0;1', 1.7)}</rect></g>`
  }

  // Eyes, pupils, blink
  const eyes = pixels(EYES, 0, 1, { E: '#ffffff', D: dark })
  const pupilShift = state === 'exploring' && motion ? anim('translate', '0 0;-1 0;-1 0;0 0;0 0', 2.4, seed) : ''
  const pupils = `<g fill="#111827"><rect x="7" y="2" width="1" height="1"/><rect x="13" y="2" width="1" height="1"/>${pupilShift}</g>`
  const lids =
    motion && idle
      ? `<g fill="${base}" opacity="0"><rect x="6" y="1" width="2" height="2"/><rect x="12" y="1" width="2" height="2"/><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.93;0.96;1" dur="${(4 + (seed % 3)).toFixed(0)}s" repeatCount="indefinite"/></g>`
      : state === 'waiting' && !motion
        ? `<g fill="${base}"><rect x="6" y="1" width="2" height="1"/><rect x="12" y="1" width="2" height="1"/></g>`
        : ''
  const antenna = look.skin === 'robot' ? `<rect x="9.5" y="-1" width="1" height="2" fill="#9ca3af"/><rect x="9" y="-2" width="2" height="1" fill="#ef4444"/>` : ''

  // Claws (raised when finished, tapping when coding)
  const clawMotion = (left: boolean) => {
    if (!motion) return ''
    if (coding) return anim('translate', left ? '0 0;0 1.2;0 0' : '0 1.2;0 0;0 1.2', 0.35, seed)
    if (finished || look.anim === 'dance')
      return anim('rotate', left ? '0 3 6;-18 3 6;0 3 6' : '0 16 6;18 16 6;0 16 6', 0.9, seed)
    return anim('rotate', left ? '0 3 6;-6 3 6;0 3 6' : '0 16 6;6 16 6;0 16 6', 2.6, seed)
  }
  const raise = finished && !motion ? (left: boolean) => `transform="rotate(${left ? -18 : 18} ${left ? 3 : 16} 6)"` : () => ''
  const clawL = `<g ${raise(true)}>${pixels(CLAW_L, 0, 1, map)}${clawMotion(true)}</g>`
  const clawR = `<g ${raise(false)}>${pixels(CLAW_R, 16, 1, map)}${clawMotion(false)}</g>`

  // Hat
  let hat = ''
  const hd = HAT[look.hat]
  if (hd) {
    hat = pixels(hd.rows, 5, hd.y, hd.map)
    if (look.hat === 'propeller') {
      hat += motion
        ? `<rect x="7" y="-6" width="6" height="1" fill="#ef4444"><animate attributeName="x" values="7;9.5;7" dur="0.3s" repeatCount="indefinite"/><animate attributeName="width" values="6;1;6" dur="0.3s" repeatCount="indefinite"/></rect>`
        : `<rect x="7" y="-6" width="6" height="1" fill="#ef4444"/>`
    }
  }

  // Props per state
  let prop = ''
  if (coding) {
    prop = `<rect x="6" y="9" width="8" height="3" rx="0.3" fill="#1f2937"/><rect x="7" y="9.6" width="3" height="0.5" fill="#4ade80"${motion ? '><animate attributeName="width" values="1;5;3;6;1" dur="1.6s" repeatCount="indefinite"/></rect>' : '/>'}<rect x="7" y="10.6" width="4" height="0.5" fill="#60a5fa"/><rect x="5" y="12" width="10" height="1" fill="#6b7280"/>`
  } else if (state === 'debugging') {
    prop = `<circle cx="20" cy="0" r="2" fill="#bfdbfe" fill-opacity="0.5" stroke="#374151" stroke-width="0.7"/><rect x="18.2" y="1.6" width="0.8" height="2.6" fill="#374151" transform="rotate(35 18.6 2)"/>`
  } else if (state === 'testing') {
    prop = `<rect x="-1" y="-3" width="2" height="5" rx="0.6" fill="#e0f2fe" stroke="#0369a1" stroke-width="0.3"/><rect x="-0.7" y="-0.5" width="1.4" height="2.2" fill="#22c55e"${motion ? '><animate attributeName="height" values="2.2;1.2;2.2" dur="1.2s" repeatCount="indefinite"/></rect>' : '/>'}`
  } else if (finished) {
    prop = `<rect x="19" y="-6" width="0.6" height="8" fill="#6b7280"/><path d="M19.6 -6 L24 -4.8 L19.6 -3.6 Z" fill="#22c55e"/>`
  }

  // Bubble
  let bubble = ''
  if (o.bubble !== false) {
    const g = GLYPH[state]
    const w = Math.max(5, g.length * 2.6 + 2)
    const fill = state === 'debugging' ? '#fee2e2' : state === 'finished' ? '#dcfce7' : '#ffffff'
    const col = STATE_COLOR[state]
    const float = motion && idle ? anim('translate', '0 0;0 -0.8;0 0', 2, seed) : ''
    bubble = `<g>${float}<rect x="13" y="-9" width="${w}" height="5" rx="1.6" fill="${fill}" stroke="${col}" stroke-width="0.4"/><path d="M14.5 -4.1 L14 -2.6 L16 -4.1 Z" fill="${fill}" stroke="${col}" stroke-width="0.3"/><text x="${13 + w / 2}" y="-5.4" font-size="3.4" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill="${col}">${esc(g)}</text></g>`
    if (state === 'waiting' && motion && idle) {
      bubble += `<text x="-2" y="-2" font-size="3" font-family="ui-monospace,monospace" fill="#94a3b8">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;-1 -3" dur="2.4s" repeatCount="indefinite"/></text>`
    }
  }

  // Whole-body motion
  let outer = ''
  let inner = ''
  if (motion) {
    const style = state === 'exploring' ? 'scuttle' : look.anim
    const slow = state === 'waiting' ? 2 : 1
    if (style === 'scuttle') outer = anim('translate', '0 0;2.5 0;0 0;-2.5 0;0 0', 3.2 * slow, seed)
    else if (style === 'bob') outer = anim('translate', '0 0;0 -1.2;0 0', 1.6 * slow, seed)
    else if (style === 'dance') outer = anim('rotate', '-5 10 12;5 10 12;-5 10 12', 1.1 * slow, seed)
    if (state === 'debugging') inner = anim('translate', '0 0;-0.6 0;0.6 0;0 0;0 0;0 0', 0.9, seed)
    if (finished) inner = anim('translate', '0 0;0 -2.5;0 0;0 0', 1.2, seed)
    if (state === 'testing' && style !== 'bob') inner = anim('translate', '0 0;0 -0.8;0 0', 1.2, seed)
  }
  const glow =
    look.skin === 'glow' ? `<ellipse cx="10" cy="8" rx="11" ry="7" fill="${base}" opacity="0.28"/>` : ''
  const opacity = look.skin === 'ghost' ? ' opacity="0.6"' : ''
  return `<g${opacity}><g>${outer}<g>${inner}${glow}${legA}${legB}${body}${clawL}${clawR}${eyes}${pupils}${lids}${antenna}${hat}${prop}</g></g>${bubble}</g>`
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A standalone crab SVG (for compact cards and previews). */
export function crabSvg(o: CrabDrawOpts, title: string, px = 4): string {
  const w = 30
  const h = 24
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -10 ${w} ${h}" width="${w * px}" height="${h * px}" shape-rendering="crispEdges"><title>${esc(title)}</title>${crabGroup(o)}</svg>`
}

export type SceneCrab = { id: string; name: string; state: CrabState; look: CrabLook; title: string; selected: boolean }

/** The colony: a beach scene with every crab placed by the chosen layout. */
export function colonySvg(
  crabs: SceneCrab[],
  opts: { layout: 'beach' | 'row' | 'grid'; motion: boolean; idle: boolean; decorative: boolean; width: number; calm?: boolean },
): { svg: string; width: number; height: number } {
  // Waves and clouds are big shapes that animate forever; the calm scene leaves them still (the crabs still move).
  const scenery = opts.motion && !opts.calm
  const W = 300
  const cell = 46
  const n = Math.max(1, crabs.length)
  let positions: { x: number; y: number }[] = []
  const sandTop = opts.decorative ? 46 : 8
  if (opts.layout === 'row' || n === 1) {
    const gap = Math.min(cell + 10, (W - 20) / n)
    const start = (W - gap * (n - 1)) / 2
    positions = crabs.map((_, i) => ({ x: start + i * gap, y: sandTop + 22 }))
  } else if (opts.layout === 'grid') {
    const cols = Math.max(1, Math.floor((W - 10) / (cell + 6)))
    const usedCols = Math.min(cols, n)
    const start = (W - (usedCols - 1) * (cell + 6)) / 2
    positions = crabs.map((_, i) => ({ x: start + (i % cols) * (cell + 6), y: sandTop + 22 + Math.floor(i / cols) * 44 }))
  } else {
    // beach: scattered but stable, two staggered rows
    const perRow = Math.max(1, Math.ceil(n / 2))
    positions = crabs.map((c, i) => {
      const row = n <= 3 ? 0 : i % 2
      const idx = n <= 3 ? i : Math.floor(i / 2)
      const span = n <= 3 ? n : perRow
      const gap = (W - 40) / Math.max(1, span)
      const jitter = ((hash(c.id) % 13) - 6) * 0.8
      return { x: 20 + gap * (idx + 0.5) + (row ? gap / 2 : 0) - (row ? 10 : 0) + jitter, y: sandTop + 22 + row * 40 + (hash(c.id) % 7) }
    })
  }
  const maxY = Math.max(...positions.map(p => p.y))
  const H = Math.round(maxY + 34)
  const parts: string[] = []
  if (opts.decorative) {
    parts.push(
      `<defs><linearGradient id="cb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient><linearGradient id="cb-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f5d08a"/></linearGradient></defs>`,
      `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#cb-sand)"/>`,
      `<rect x="0" y="0" width="${W}" height="${sandTop - 6}" fill="url(#cb-sky)"/>`,
      `<circle cx="${W - 34}" cy="14" r="8" fill="#fde047"/>`,
      `<g fill="#ffffff" opacity="0.9"><ellipse cx="50" cy="12" rx="12" ry="4"/><ellipse cx="60" cy="10" rx="8" ry="4"/>${scenery ? '<animateTransform attributeName="transform" type="translate" values="0 0;20 0;0 0" dur="30s" repeatCount="indefinite"/>' : ''}</g>`,
    )
    const wave = (y: number, color: string, dur: number, amp: number) => {
      let d = `M -40 ${y}`
      for (let x = -40; x <= W + 40; x += 20) d += ` Q ${x + 5} ${y - amp} ${x + 10} ${y} T ${x + 20} ${y}`
      d += ` L ${W + 40} ${y + 10} L -40 ${y + 10} Z`
      return `<path d="${d}" fill="${color}">${scenery ? `<animateTransform attributeName="transform" type="translate" values="0 0;-20 0" dur="${dur}s" repeatCount="indefinite"/>` : ''}</path>`
    }
    parts.push(wave(sandTop - 12, '#38bdf8', 3, 2), wave(sandTop - 8, '#0ea5e9', 4.5, 2.5), `<path d="M0 ${sandTop - 3} Q ${W / 2} ${sandTop + 2} ${W} ${sandTop - 3} L ${W} ${sandTop} L 0 ${sandTop} Z" fill="#fef3c7"/>`)
    // shells and pebbles
    for (let i = 0; i < 7; i++) {
      const x = (hash('pebble' + i) % (W - 20)) + 10
      const y = sandTop + 8 + (hash('pbl' + i) % Math.max(10, H - sandTop - 12))
      parts.push(`<ellipse cx="${x}" cy="${y}" rx="1.6" ry="1" fill="#d6b67a"/>`)
    }
  } else {
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="#fef7e6"/>`)
  }
  crabs.forEach((c, i) => {
    const p = positions[i] ?? { x: 20, y: 30 }
    const s = 1.6
    const sel = c.selected
      ? `<ellipse cx="${p.x}" cy="${p.y + 22}" rx="20" ry="3.5" fill="#f97316" opacity="0.35"/>`
      : `<ellipse cx="${p.x}" cy="${p.y + 22}" rx="14" ry="2.5" fill="#000000" opacity="0.08"/>`
    parts.push(
      `<g><title>${esc(c.title)}</title>${sel}<g transform="translate(${p.x - 10 * s} ${p.y}) scale(${s})" shape-rendering="crispEdges">${crabGroup({ look: c.look, state: c.state, motion: opts.motion, idle: opts.idle, seed: c.id })}</g><text x="${p.x}" y="${p.y + 31}" font-size="6.5" font-family="ui-sans-serif,system-ui,sans-serif" font-weight="${c.selected ? 700 : 500}" text-anchor="middle" fill="#7c2d12">${esc(c.name)}</text></g>`,
    )
  })
  const width = Math.max(200, opts.width)
  const height = Math.round((width * H) / W)
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${width}" height="${height}">${parts.join('')}</svg>`,
    width,
    height,
  }
}

/** A terminal stand-in, since the terminal draws no SVG. */
export function crabAscii(state: CrabState): string {
  const face: Record<CrabState, string> = {
    exploring: '(\\/)(°,,°)(\\/)  ?',
    coding: '(\\/)(°,,°)(\\/) </>',
    debugging: '(\\/)(ಠ,,ಠ)(\\/)  !',
    testing: '(\\/)(°,,°)(\\/) ✓?',
    waiting: '(\\/)(-,,-)(\\/)  …',
    finished: '\\(\\/)(^,,^)(\\/)/ ✓',
  }
  return face[state]
}
