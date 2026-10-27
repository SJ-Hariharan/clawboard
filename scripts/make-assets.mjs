// Generates the README artwork with Clawboard's own crab renderer (hooks/crabs.ts).
//
//   node scripts/make-assets.mjs          write assets/*.svg
//   node scripts/make-assets.mjs --check  fail if the committed files are out of date
//
// Needs Node 22.18+ (it imports the TypeScript renderer directly) and nothing else.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STATES, STATE_COLOR, STATE_LABEL, colonySvg, crabGroup, esc } from '../hooks/crabs.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'assets')
const check = process.argv.includes('--check')

const look = (color, extra = {}) => ({ color, shell: 'round', hat: 'none', anim: 'scuttle', skin: 'classic', ...extra })
const crab = (id, state, l, x, y, scale) =>
  `<g transform="translate(${x} ${y}) scale(${scale})" shape-rendering="crispEdges">${crabGroup({ look: l, state, motion: true, idle: true, seed: id })}</g>`

// --- banner / social preview (1280x640) ---
function banner() {
  const W = 1280
  const H = 640
  const wave = (y, color, dur, amp) => {
    let d = `M -80 ${y}`
    for (let x = -80; x <= W + 80; x += 80) d += ` Q ${x + 20} ${y - amp} ${x + 40} ${y} T ${x + 80} ${y}`
    d += ` L ${W + 80} ${y + 60} L -80 ${y + 60} Z`
    return `<path d="${d}" fill="${color}"><animateTransform attributeName="transform" type="translate" values="0 0;-80 0" dur="${dur}s" repeatCount="indefinite"/></path>`
  }
  const crabs = [
    crab('main', 'coding', look('coral', { hat: 'party' }), 640, 330, 8),
    crab('pinchy', 'exploring', look('ocean', { hat: 'beanie', anim: 'bob' }), 870, 410, 8),
    crab('snips', 'debugging', look('mint', { hat: 'wizard' }), 1060, 320, 8),
    crab('kelp', 'testing', look('violet', { hat: 'chef', anim: 'dance' }), 690, 505, 6),
    crab('shelly', 'finished', look('bubblegum', { hat: 'crown' }), 1060, 480, 6),
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Clawboard: a crab colony for Claude Code">
<title>Clawboard</title>
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient>
<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f3c97a"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sand)"/>
<rect width="${W}" height="250" fill="url(#sky)"/>
<circle cx="1170" cy="80" r="42" fill="#fde047"/>
<g fill="#fff" opacity="0.9"><ellipse cx="330" cy="70" rx="70" ry="20"/><ellipse cx="390" cy="58" rx="46" ry="20"/><animateTransform attributeName="transform" type="translate" values="0 0;60 0;0 0" dur="40s" repeatCount="indefinite"/></g>
${wave(236, '#38bdf8', 7, 9)}${wave(262, '#0ea5e9', 10, 11)}
<path d="M0 292 Q 640 312 1280 292 L 1280 306 L 0 306 Z" fill="#fef3c7"/>
<text x="70" y="168" font-family="ui-rounded,'SF Pro Rounded',ui-sans-serif,system-ui,sans-serif" font-size="112" font-weight="800" fill="#0c4a6e">Clawboard</text>
<text x="74" y="214" font-family="ui-sans-serif,system-ui,sans-serif" font-size="30" font-weight="600" fill="#075985">A crab colony for Claude Code</text>
<g font-family="ui-sans-serif,system-ui,sans-serif" font-size="27" font-weight="600" fill="#7c2d12">
<text x="74" y="400">🦀  See what Claude is doing, live</text>
<text x="74" y="446">🌊  Context, tokens and plan limits</text>
<text x="74" y="492">🗺️  A map of your project</text>
<text x="74" y="538">🐚  Lessons from the code being built</text>
</g>
${crabs}
</svg>
`
}

// --- the colony, as the panel draws it ---
function colony() {
  const crabs = [
    { id: 'main', name: 'Clawde', state: 'coding', look: look('coral', { hat: 'party' }) },
    { id: 'pinchy', name: 'Pinchy', state: 'exploring', look: look('ocean', { hat: 'beanie', anim: 'bob' }) },
    { id: 'snips', name: 'Snips', state: 'debugging', look: look('mint', { hat: 'wizard' }) },
    { id: 'kelp', name: 'Kelp', state: 'testing', look: look('violet', { hat: 'chef', anim: 'dance' }) },
  ].map((c, i) => ({ ...c, title: `${c.name}: ${STATE_LABEL[c.state]}`, selected: i === 0 }))
  return colonySvg(crabs, { layout: 'beach', motion: true, idle: true, decorative: true, width: 900 }).svg + '\n'
}

// --- square icon (rendered to .claude-plugin/icon.png by scripts/render-png.swift) ---
function icon() {
  const size = 512
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Clawboard crab icon"><title>Clawboard</title><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bae6fd"/><stop offset="0.55" stop-color="#e0f2fe"/><stop offset="0.56" stop-color="#fde68a"/><stop offset="1" stop-color="#f3c97a"/></linearGradient></defs><rect width="${size}" height="${size}" rx="96" fill="url(#bg)"/><g transform="translate(70 120) scale(18)" shape-rendering="crispEdges">${crabGroup({ look: look('coral', { hat: 'party' }), state: 'finished', motion: false, idle: false, seed: 'icon', bubble: false })}</g></svg>
`
}

// --- the six states ---
function states() {
  const cell = 150
  const W = cell * STATES.length
  const H = 205
  const cells = STATES.map((s, i) => {
    const x = i * cell + cell / 2
    return `${crab(`state-${s}`, s, look('coral', { hat: 'party' }), x - 48, 62, 4.8)}<text x="${x}" y="188" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="17" font-weight="700" fill="${STATE_COLOR[s]}">${esc(STATE_LABEL[s])}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="The six crab states: exploring, coding, debugging, testing, waiting, finished"><title>Crab states</title><rect width="${W}" height="${H}" rx="16" fill="#fef3c7"/>${cells}</svg>\n`
}

const files = { 'banner.svg': banner(), 'colony.svg': colony(), 'states.svg': states(), 'icon.svg': icon() }
let stale = 0
mkdirSync(out, { recursive: true })
for (const [name, svg] of Object.entries(files)) {
  const path = join(out, name)
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== svg) {
      console.error(`out of date: assets/${name}`)
      stale++
    }
  } else {
    writeFileSync(path, svg)
    console.log(`wrote assets/${name} (${(svg.length / 1024).toFixed(0)} KB)`)
  }
}
if (stale) {
  console.error('Run: node scripts/make-assets.mjs')
  process.exit(1)
}
