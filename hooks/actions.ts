// Things the panel's buttons do. Every explanation is generated on demand
// from real session data: diffs, the transcript, or the files on disk.
import type { IO } from './io'
import type { Level, Lesson, MapComponent, QuizQ, BoardSettings, TimelineEvent } from '../types'
import { layerOf, rel } from './classify'
import { scanProject } from './scan'
import { mergeSettings } from './store'
import { aiGet, aiSet, dbSet } from './io'

const LEVEL_GUIDE: Record<Level, string> = {
  beginner:
    'The reader is new to programming. Use plain everyday words, one short analogy, and define any technical term the first time you use it. Keep it to about 120 words.',
  intermediate:
    'The reader is a working developer. Name the patterns and trade-offs involved and how the pieces connect. Keep it to about 150 words.',
  advanced:
    'The reader is a senior engineer. Cover architectural implications, edge cases, failure modes, performance and the alternatives that were not taken. Be dense and precise, about 180 words.',
}

async function setBusy(io: IO, key: string, on: boolean) {
  await aiSet(io, 'busy', b => {
    const next = { ...b }
    if (on) next[key] = true
    else delete next[key]
    return next
  })
}

async function setAi(io: IO, key: string, text: string) {
  await aiSet(io, 'text', m => ({ ...m, [key]: text }))
}

function failure(r: { reason?: string; status?: number }): string {
  if (r.reason === 'nothing-to-fork') return 'Nothing to explain yet: the session has no turns.'
  if (r.reason === 'aborted') return 'The request was cancelled or timed out. Try again.'
  return `The model did not answer (${r.reason ?? 'unknown'}${r.status ? ' ' + r.status : ''}). Try again.`
}

/** One text completion, stored under `key`. */
async function complete(io: IO, key: string, prompt: string, system: string, maxTokens = 900): Promise<string | null> {
  await setBusy(io, key, true)
  try {
    const model = await io.model()
    const r = await io.complete({ model, prompt, system, maxTokens, timeoutMs: 90000 })
    if (r.isAnswered) {
      await setAi(io, key, r.text.trim())
      return r.text
    }
    await setAi(io, key, '⚠️ ' + failure(r as { reason?: string; status?: number }))
    return null
  } catch (err) {
    await setAi(io, key, `⚠️ Could not reach the model: ${String(err).slice(0, 200)}`)
    return null
  } finally {
    await setBusy(io, key, false)
  }
}

/** A question over this session's own transcript (served from the prompt cache). */
async function fork(io: IO, key: string, prompt: string): Promise<void> {
  await setBusy(io, key, true)
  try {
    const r = await io.fork({ prompt })
    await setAi(io, key, r.isAnswered ? r.text.trim() : '⚠️ ' + failure(r as { reason?: string }))
  } catch (err) {
    await setAi(io, key, `⚠️ Could not reach the model: ${String(err).slice(0, 200)}`)
  } finally {
    await setBusy(io, key, false)
  }
}

async function stackLine(io: IO): Promise<string> {
  const map = await io.map()
  if (!map) return 'Tech stack: not scanned yet.'
  const comps = map.components.slice(0, 14).map(c => `${c.layer}/${c.label} (${c.fileCount} files)`).join('; ')
  return `Tech stack: ${map.stack.map(t => t.name).join(', ') || 'unknown'}. Components: ${comps || 'none found'}.`
}

const SYSTEM = 'You are the friendly guide inside Clawboard, a panel that explains what a coding agent is doing in the user’s project. Be accurate, concrete and specific to the code shown; never invent files or facts that are not in the material. Use Markdown with short headings or bullets when helpful.'

export async function explainEvent(io: IO, ev: TimelineEvent, level: Level): Promise<void> {
  const root = await io.cwd()
  const file = ev.files[0] ?? ''
  const layer = file ? layerOf(file) : null
  const prompt = [
    `Explain this code change. ${LEVEL_GUIDE[level]}`,
    'Structure: **What changed**, **Why it matters**, **How it fits the architecture**.',
    `File: ${rel(file, root)}${layer ? ` (looks like ${layer} code)` : ''}`,
    await stackLine(io),
    `Change summary: ${ev.title} — ${ev.detail}`,
    'Diff (- removed, + added):',
    '```',
    (ev.diff ?? '(no diff captured)').slice(0, 5000),
    '```',
  ].join('\n')
  await complete(io, `ev:${ev.id}:${level}`, prompt, SYSTEM)
}

export async function explainTurnEdits(io: IO, key: string, edits: TimelineEvent[], level: Level): Promise<void> {
  const root = await io.cwd()
  const body = edits
    .slice(0, 8)
    .map(e => `### ${rel(e.files[0] ?? '', root)}\n${e.title} (${e.detail})\n\`\`\`\n${(e.diff ?? '').slice(0, 1500)}\n\`\`\``)
    .join('\n\n')
  const prompt = `These edits were just made in one turn. In plain English, explain what changed overall, why it matters, and how it fits the project’s architecture. ${LEVEL_GUIDE[level]}\n${await stackLine(io)}\n\n${body}`
  await complete(io, key, prompt, SYSTEM)
}

export async function explainSession(io: IO, level: Level): Promise<void> {
  await fork(
    io,
    `session:${level}`,
    `Step outside the task for a moment. For the person watching, explain in plain English the important changes made in this session so far: **What changed**, **Why it matters**, **How the architecture fits together** (name the main parts and how data flows between them). ${LEVEL_GUIDE[level]} Answer only with the explanation.`,
  )
}

export async function explainDecisions(io: IO, level: Level): Promise<void> {
  await fork(
    io,
    `decisions:${level}`,
    `For the person learning from this session: list the 2-4 most important engineering decisions made so far. For each, say what was decided, what the realistic alternatives were, and why this choice fits this project. ${LEVEL_GUIDE[level]} Answer only with the explanation.`,
  )
}

export async function explainComponent(io: IO, comp: MapComponent, level: Level): Promise<void> {
  const map = await io.map()
  const root = map?.root ?? (await io.cwd())
  const label = (id: string) => map?.components.find(c => c.id === id)?.label ?? id
  const uses = map?.edges.filter(e => e.from === comp.id).map(e => `${label(e.to)} (${e.weight} imports)`) ?? []
  const usedBy = map?.edges.filter(e => e.to === comp.id).map(e => `${label(e.from)} (${e.weight} imports)`) ?? []
  const excerpts: string[] = []
  for (const f of comp.files.slice(0, 4)) {
    try {
      const text = (await io.readFile(`${root}/${f}`)) as string
      excerpts.push(`### ${f}\n\`\`\`\n${text.slice(0, 1800)}\n\`\`\``)
    } catch {
      /* unreadable */
    }
  }
  const prompt = [
    `Explain how the "${comp.label}" part of this project (${comp.layer} layer, ${comp.fileCount} files) is implemented and what role it plays. ${LEVEL_GUIDE[level]}`,
    await stackLine(io),
    `It uses: ${uses.join(', ') || 'nothing detected'}. It is used by: ${usedBy.join(', ') || 'nothing detected'}.`,
    `Files: ${comp.files.slice(0, 20).join(', ')}`,
    excerpts.join('\n\n') || '(no readable source files; this is an external package)',
  ].join('\n')
  await complete(io, `comp:${comp.id}:${level}`, prompt, SYSTEM)
}

export async function generateLesson(io: IO, level: Level): Promise<void> {
  const key = 'lesson'
  const events = await io.log()
  const root = await io.cwd()
  const edits = events.filter(e => (e.kind === 'edit' || e.kind === 'write') && e.diff).slice(-6)
  let material = edits.map(e => `### ${rel(e.files[0] ?? '', root)}\n\`\`\`\n${(e.diff ?? '').slice(0, 1400)}\n\`\`\``).join('\n\n')
  if (!material) {
    const map = await io.map()
    const files = (map?.components ?? []).filter(c => c.files.length && !c.id.startsWith('pkg:')).flatMap(c => c.files.slice(0, 1)).slice(0, 3)
    for (const f of files) {
      try {
        material += `### ${f}\n\`\`\`\n${((await io.readFile(`${root}/${f}`)) as string).slice(0, 1600)}\n\`\`\`\n\n`
      } catch {
        /* skip */
      }
    }
  }
  if (!material.trim()) {
    await setAi(io, key, 'Nothing to learn from yet: no code has been changed in this session and no project files were found. Make some changes (or open a project folder) and try again.')
    return
  }
  const prompt = [
    `Write a short lesson that teaches one important concept using the code below from the user's project. ${LEVEL_GUIDE[level]}`,
    await stackLine(io),
    'Return ONLY JSON, no code fence, in this shape:',
    '{"title": string, "body": string (Markdown, sections "The idea", "In this project", "Try it yourself"), "quiz": [{"q": string, "options": [4 strings], "answer": index 0-3, "why": string}] (exactly 3 questions about this project\'s code)}',
    '',
    material,
  ].join('\n')
  const text = await complete(io, key, prompt, SYSTEM, 1800)
  if (!text) return
  try {
    const json = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()) as { title?: string; body?: string; quiz?: QuizQ[] }
    const quiz = (json.quiz ?? []).filter(q => q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length >= 2).slice(0, 5)
    const lesson: Lesson = {
      id: `L${(await io.now()).toString(36)}`,
      t: await io.now(),
      level,
      title: String(json.title ?? 'Lesson'),
      body: String(json.body ?? ''),
      quiz: quiz.map(q => ({ q: q.q, options: q.options.map(String), answer: Math.max(0, Math.min(q.options.length - 1, Number(q.answer) || 0)), why: String(q.why ?? '') })),
      answers: quiz.map(() => null),
    }
    await aiSet(io, 'lessons', l => [lesson, ...l].slice(0, 12))
    await setAi(io, key, '')
    await io.storeSet(`lessons:${root}`, (await aiGet(io, 'lessons')).slice(0, 12))
  } catch {
    await setAi(io, key, '⚠️ The lesson came back in an unexpected format. Try again.')
  }
}

export async function answerQuiz(io: IO, lessonId: string, qi: number, oi: number): Promise<void> {
  const lessons = await aiSet(io, 'lessons', list => list.map(l => (l.id === lessonId ? { ...l, answers: l.answers.map((a, i) => (i === qi && a === null ? oi : a)) } : l)))
  await io.storeSet(`lessons:${await io.cwd()}`, lessons.slice(0, 12))
}

export async function runScan(io: IO): Promise<void> {
  const busy = await aiGet(io, 'busy')
  if (busy.scan) return
  await setBusy(io, 'scan', true)
  try {
    const root = await io.cwd()
    const map = await scanProject(io, root)
    await io.setMap(() => map)
    await dbSet(io, 'mapStale', () => false)
  } catch (err) {
    await setAi(io, 'scan', `⚠️ Scan failed: ${String(err).slice(0, 200)}`)
  } finally {
    await setBusy(io, 'scan', false)
  }
}

export async function refreshBreakdown(io: IO): Promise<void> {
  await setBusy(io, 'breakdown', true)
  try {
    const u = await io.usage({ breakdown: 'summary' })
    const b = u.context.breakdown
    if (b) {
      const now = await io.now()
      await dbSet(io, 'usage', s =>
        s
          ? {
              ...s,
              breakdown: b.categories.filter(c => c.tokens > 0).map(c => ({ name: c.name, tokens: c.tokens, kind: String(c.kind) })),
              autoCompactAt: b.autoCompactThreshold,
              breakdownAt: now,
            }
          : s,
      )
    }
  } finally {
    await setBusy(io, 'breakdown', false)
  }
}

export async function saveSettings(io: IO, fn: (s: BoardSettings) => BoardSettings): Promise<void> {
  const next = await io.setSettings(s => mergeSettings(fn(s)))
  await io.storeSet('settings', next)
}
