// Turns real tool calls into crab states and plain-English timeline entries.
import type { CrabState, EventKind, Layer } from '../types'

export type Classified = {
  state: CrabState
  kind: EventKind
  title: string
  detail: string
  plain: string
  activity: string
  files: string[]
  diff?: string
  important?: boolean
  isTest?: boolean
  modifies?: boolean
}

export function rel(path: string, root: string): string {
  if (!path) return ''
  if (root && path.startsWith(root + '/')) return path.slice(root.length + 1)
  const home = path.match(/^\/Users\/[^/]+\/(.*)$/)
  return home ? '~/' + home[1] : path
}

export function short(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

const TEST_RE =
  /\b(jest|vitest|mocha|ava|jasmine|karma|playwright|cypress|pytest|unittest|nose2|rspec|minitest|phpunit|go test|cargo (nextest|test)|dotnet test|mvn (-\S+ )*test|gradle(w)? test|swift test|xcodebuild .*test|deno test|bun test|npm (run )?test|npm t\b|pnpm (run )?test|yarn (run )?test|tox|ctest|claude plugin test)\b/

export function isTestCommand(cmd: string): boolean {
  return TEST_RE.test(cmd)
}

const LAYER_WORDS: Record<Layer, string> = {
  frontend: 'part of the user interface',
  api: 'part of the API layer, where requests come in',
  backend: 'part of the server-side logic',
  database: 'part of the data layer (models, schema or queries)',
  integrations: 'an integration with an outside service',
  infra: 'build, deploy or CI setup',
  tests: 'a test that checks the code still works',
  config: 'project configuration',
}

/** Guess which architectural layer a path belongs to. */
export function layerOf(path: string, hasFrontendFramework = true): Layer | null {
  const p = path.toLowerCase()
  const name = p.split('/').pop() ?? p
  if (/(^|\/)(tests?|__tests__|spec|specs|e2e|cypress|playwright)\//.test(p) || /(\.|_)(test|spec)\.[a-z]+$/.test(name) || /^test_.*\.py$/.test(name) || /_test\.go$/.test(name))
    return 'tests'
  if (/(^|\/)\.github\/|(^|\/)(docker|deploy|infra|terraform|k8s|helm|\.circleci)\//.test(p) || /^(dockerfile|docker-compose.*\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|procfile|makefile|.*\.tf|serverless\.ya?ml|app\.yaml)$/.test(name))
    return 'infra'
  if (/(^|\/)(prisma|migrations?|db|database|models?|schemas?|entities|repositories|sql|drizzle|alembic)\//.test(p) || /\.(sql|prisma)$/.test(name))
    return 'database'
  if (/(^|\/)(api|apis|routes?|routers?|controllers?|endpoints|handlers|graphql|resolvers|trpc|rpc)\//.test(p) || /^(openapi|swagger).*\.(ya?ml|json)$/.test(name) || /\.(proto|graphql|gql)$/.test(name))
    return 'api'
  if (/(^|\/)(server|backend|services?|workers?|jobs|cmd|internal|pkg|cli|bin|hooks)\//.test(p) && !/(^|\/)(src\/)?hooks\/use/.test(p))
    return 'backend'
  if (/\.(tsx|jsx|vue|svelte|astro|html|css|scss|sass|less|styl)$/.test(name) || /(^|\/)(components?|pages|views|ui|public|styles|layouts|frontend|client|web|screens|widgets|static|assets)\//.test(p))
    return 'frontend'
  if (/\.(swift|kt|dart)$/.test(name)) return 'frontend'
  if (/^(package\.json|tsconfig.*\.json|pyproject\.toml|requirements.*\.txt|go\.mod|cargo\.toml|gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?|\.env\.example|.*\.config\.[cm]?[jt]s|\.eslintrc.*|\.prettierrc.*|plugin\.json|hooks\.json)$/.test(name))
    return 'config'
  if (/\.(py|go|rs|java|rb|php|cs|ex|exs|scala|clj|c|cc|cpp|h|hpp)$/.test(name)) return 'backend'
  if (/\.(ts|js|mjs|cjs|mts|cts)$/.test(name)) return hasFrontendFramework ? 'frontend' : 'backend'
  return null
}

export function roleSentence(path: string): string {
  const layer = layerOf(path)
  return layer ? `This file is ${LAYER_WORDS[layer]}.` : ''
}

function lines(s: string): number {
  return s ? s.split('\n').length : 0
}

function commandPlain(cmd: string, description?: string): string {
  const c = cmd.trim()
  const map: [RegExp, string][] = [
    [/^(npm|pnpm|yarn|bun) (i|install|add)\b/, 'Installed JavaScript packages so the code can use them.'],
    [/^pip3? install|^uv (pip|add)|^poetry add/, 'Installed Python packages.'],
    [/^cargo (build|check)/, 'Compiled the Rust code to check it builds.'],
    [/^(npm|pnpm|yarn|bun) (run )?(build|tsc)|^tsc\b|^npx tsc/, 'Built or type-checked the project to catch mistakes before running it.'],
    [/^(npm|pnpm|yarn|bun) (run )?(dev|start)|^(npx )?vite\b|^next dev/, 'Started the app locally to try it out.'],
    [/^(npm|pnpm|yarn|bun) (run )?lint|^eslint|^ruff|^flake8|^golangci/, 'Ran a linter to check code style and common bugs.'],
    [/^git (status|diff|log|show)/, 'Checked the git history or pending changes.'],
    [/^git commit/, 'Saved the changes as a git commit.'],
    [/^git (push)/, 'Pushed commits to the remote repository.'],
    [/^git (checkout|switch|branch)/, 'Switched or created a git branch.'],
    [/^(ls|find|tree|fd)\b/, 'Looked around the folder structure.'],
    [/^(cat|head|tail|less|sed -n|wc)\b/, 'Read part of a file.'],
    [/^(grep|rg|ag)\b/, 'Searched the code for text.'],
    [/^(mkdir|touch|cp|mv)\b/, 'Created or moved files and folders.'],
    [/^rm\b/, 'Deleted files.'],
    [/^(curl|wget|http)\b/, 'Made a web request.'],
    [/^(docker|docker-compose|podman)\b/, 'Worked with containers.'],
    [/^(python3?|node|deno|ruby|go run)\b/, 'Ran a script.'],
    [/^claude plugin validate/, 'Validated a Claude Code mod.'],
  ]
  for (const [re, text] of map) if (re.test(c)) return text
  if (isTestCommand(c)) return 'Ran the tests to check that everything still works.'
  return description ? `${description}.` : 'Ran a shell command.'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Classify a tool call before it runs. */
export function classify(tool: string, input: Record<string, unknown>, root: string): Classified {
  const file = str(input.file_path) || str(input.notebook_path) || str(input.path)
  const r = rel(file, root)
  switch (tool) {
    case 'Read':
      return { state: 'exploring', kind: 'read', title: `Read ${r}`, detail: '', plain: `Looked at ${r} to understand it. ${roleSentence(file)}`.trim(), activity: `Reading ${r}`, files: [] }
    case 'Grep': {
      const pat = str(input.pattern)
      return { state: 'exploring', kind: 'search', title: `Searched for “${short(pat, 40)}”`, detail: str(input.path), plain: `Searched the code for “${short(pat, 60)}” to find where something is used.`, activity: `Searching for ${short(pat, 30)}`, files: [] }
    }
    case 'Glob':
      return { state: 'exploring', kind: 'search', title: `Listed ${short(str(input.pattern), 40)}`, detail: '', plain: 'Listed matching files to see how the project is laid out.', activity: 'Listing files', files: [] }
    case 'Edit': {
      const oldS = str(input.old_string)
      const newS = str(input.new_string)
      const a = lines(oldS)
      const b = lines(newS)
      const verb = b > a ? 'Added code to' : b < a ? 'Trimmed code in' : 'Changed code in'
      return {
        state: 'coding',
        kind: 'edit',
        title: `Edited ${r}`,
        detail: `${a} line${a === 1 ? '' : 's'} → ${b} line${b === 1 ? '' : 's'}`,
        plain: `${verb} ${r} (${a} → ${b} lines). ${roleSentence(file)}`.trim(),
        activity: `Editing ${r}`,
        files: [file],
        diff: unifiedish(oldS, newS),
        important: true,
        modifies: true,
      }
    }
    case 'Write': {
      const content = str(input.content)
      const n = lines(content)
      return {
        state: 'coding',
        kind: 'write',
        title: `Wrote ${r}`,
        detail: `${n} lines`,
        plain: `Wrote ${r} (${n} lines). ${roleSentence(file)}`.trim(),
        activity: `Writing ${r}`,
        files: [file],
        diff: content.split('\n').slice(0, 60).map(l => '+' + l).join('\n'),
        important: true,
        modifies: true,
      }
    }
    case 'NotebookEdit':
      return { state: 'coding', kind: 'edit', title: `Edited notebook ${r}`, detail: '', plain: `Changed a cell in the notebook ${r}.`, activity: `Editing ${r}`, files: [file], important: true, modifies: true }
    case 'Bash': {
      const cmd = str(input.command)
      const desc = str(input.description)
      const test = isTestCommand(cmd)
      return {
        state: test ? 'testing' : /^(ls|find|cat|head|tail|grep|rg|git (status|diff|log|show)|wc|tree|pwd)\b/.test(cmd.trim()) ? 'exploring' : 'coding',
        kind: test ? 'test' : 'command',
        title: test ? `Ran tests: ${short(cmd, 50)}` : `$ ${short(cmd, 60)}`,
        detail: desc,
        plain: commandPlain(cmd, desc),
        activity: test ? 'Running tests' : desc || `Running ${short(cmd, 30)}`,
        files: [],
        important: test || /^git (commit|push)|install|build/.test(cmd),
        isTest: test,
      }
    }
    case 'Agent': {
      const d = str(input.description)
      return { state: 'coding', kind: 'agent', title: `Sent a subagent: ${short(d, 50)}`, detail: str(input.subagent_type) || 'general-purpose', plain: `Handed part of the work to a helper agent (${str(input.subagent_type) || 'general-purpose'}) so it can run on its own: ${d}.`, activity: `Waiting on subagent: ${short(d, 30)}`, files: [], important: true }
    }
    case 'WebFetch':
    case 'WebSearch':
      return { state: 'exploring', kind: 'web', title: tool === 'WebSearch' ? `Searched the web: ${short(str(input.query), 40)}` : `Fetched ${short(str(input.url), 50)}`, detail: '', plain: 'Looked something up on the web.', activity: 'Researching on the web', files: [] }
    case 'TaskCreate':
      return { state: 'coding', kind: 'task', title: `Planned: ${short(str(input.subject), 60)}`, detail: str(input.description), plain: `Added “${short(str(input.subject), 60)}” to the task list.`, activity: 'Planning', files: [] }
    case 'TaskUpdate': {
      const status = str(input.status)
      return {
        state: 'coding',
        kind: 'task',
        title: status === 'completed' ? `Completed task ${str(input.taskId)}` : `Task ${str(input.taskId)} → ${status || 'updated'}`,
        detail: str(input.subject),
        plain: status === 'completed' ? 'Finished one of the planned tasks.' : 'Updated the task list.',
        activity: str(input.activeForm) || 'Working through tasks',
        files: [],
        important: status === 'completed',
      }
    }
    case 'AskUserQuestion':
    case 'ExitPlanMode':
      return { state: 'waiting', kind: 'waiting', title: tool === 'ExitPlanMode' ? 'Asked you to approve a plan' : 'Asked you a question', detail: '', plain: 'Paused to get your input before going on.', activity: 'Waiting for your answer', files: [] }
    case 'Skill':
      return { state: 'exploring', kind: 'other', title: `Loaded skill ${str(input.skill)}`, detail: '', plain: 'Loaded a skill with instructions for this kind of task.', activity: `Using skill ${str(input.skill)}`, files: [] }
    case 'ToolSearch':
      return { state: 'exploring', kind: 'other', title: 'Looked up tools', detail: '', plain: 'Loaded the definitions of tools it needs.', activity: 'Looking up tools', files: [] }
    default: {
      const nice = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(' › ') : tool
      return { state: 'coding', kind: 'other', title: `Used ${nice}`, detail: '', plain: `Used the ${nice} tool.`, activity: `Using ${nice}`, files: [] }
    }
  }
}

function unifiedish(a: string, b: string): string {
  const out = [...a.split('\n').slice(0, 30).map(l => '-' + l), ...b.split('\n').slice(0, 30).map(l => '+' + l)]
  return out.join('\n')
}

/** Read pass/fail counts out of test output. */
export function testSummary(text: string): { passed?: number; failed?: number } {
  const t = text.slice(-6000)
  const num = (re: RegExp) => {
    const m = t.match(re)
    return m ? Number(m[1]) : undefined
  }
  const passed = num(/(\d+)\s+(?:tests?\s+)?pass(?:ed|ing)?\b/i) ?? num(/Tests:.*?(\d+) passed/i) ?? num(/ok\s+\d+.*?(\d+) tests?/i)
  const failed = num(/(\d+)\s+(?:tests?\s+)?fail(?:ed|ing|ures?)?\b/i) ?? num(/Tests:.*?(\d+) failed/i)
  return { passed, failed }
}
