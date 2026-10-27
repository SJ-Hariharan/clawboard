// Scans the real project on disk: tech stack from manifests, components from
// paths, relationships from import statements.
import type { FsEntry } from 'claude-code'
import type { IO } from './io'
import type { Layer, MapComponent, MapEdge, ProjectMap, Tech } from '../types'
import { layerOf } from './classify'

type K = { name: string; category: string; what: string; layer?: Layer; integration?: boolean }

// Package name (or prefix ending in '/') → what it is.
const KNOWN: Record<string, K> = {
  react: { name: 'React', category: 'Frontend', what: 'Builds the user interface out of reusable components that redraw when data changes.', layer: 'frontend' },
  'react-dom': { name: 'React DOM', category: 'Frontend', what: 'Puts React components on a web page.', layer: 'frontend' },
  'react-native': { name: 'React Native', category: 'Frontend', what: 'Builds native iOS and Android apps with React.', layer: 'frontend' },
  next: { name: 'Next.js', category: 'Full-stack framework', what: 'A React framework that adds routing, server rendering and API routes.', layer: 'frontend' },
  vue: { name: 'Vue', category: 'Frontend', what: 'A UI framework where templates react to data automatically.', layer: 'frontend' },
  nuxt: { name: 'Nuxt', category: 'Full-stack framework', what: 'Vue framework with routing and server rendering.', layer: 'frontend' },
  svelte: { name: 'Svelte', category: 'Frontend', what: 'A UI framework that compiles components into small, fast JavaScript.', layer: 'frontend' },
  '@sveltejs/kit': { name: 'SvelteKit', category: 'Full-stack framework', what: 'Svelte framework with routing and server endpoints.', layer: 'frontend' },
  'solid-js': { name: 'Solid', category: 'Frontend', what: 'Reactive UI library with fine-grained updates.', layer: 'frontend' },
  '@angular/core': { name: 'Angular', category: 'Frontend', what: 'A full framework for building large web apps.', layer: 'frontend' },
  astro: { name: 'Astro', category: 'Frontend', what: 'Builds content-heavy sites that ship little JavaScript.', layer: 'frontend' },
  vite: { name: 'Vite', category: 'Build tool', what: 'Dev server and bundler: fast reloads while coding, optimized files for production.' },
  webpack: { name: 'webpack', category: 'Build tool', what: 'Bundles many source files into a few files for the browser.' },
  esbuild: { name: 'esbuild', category: 'Build tool', what: 'A very fast JavaScript/TypeScript bundler.' },
  typescript: { name: 'TypeScript', category: 'Language', what: 'JavaScript with types, so many mistakes are caught before the code runs.' },
  tailwindcss: { name: 'Tailwind CSS', category: 'Styling', what: 'Styles elements with small utility classes right in the markup.', layer: 'frontend' },
  'styled-components': { name: 'styled-components', category: 'Styling', what: 'Writes CSS inside JavaScript components.', layer: 'frontend' },
  sass: { name: 'Sass', category: 'Styling', what: 'CSS with variables, nesting and mixins.', layer: 'frontend' },
  redux: { name: 'Redux', category: 'State', what: 'Keeps app state in one store changed by actions.', layer: 'frontend' },
  '@reduxjs/toolkit': { name: 'Redux Toolkit', category: 'State', what: 'The standard, less-boilerplate way to use Redux.', layer: 'frontend' },
  zustand: { name: 'Zustand', category: 'State', what: 'A small store for sharing state between React components.', layer: 'frontend' },
  '@tanstack/react-query': { name: 'TanStack Query', category: 'Data fetching', what: 'Fetches, caches and refreshes server data in React.', layer: 'frontend' },
  swr: { name: 'SWR', category: 'Data fetching', what: 'React hooks for fetching and caching data.', layer: 'frontend' },
  'react-router': { name: 'React Router', category: 'Frontend', what: 'Maps URLs to React screens.', layer: 'frontend' },
  'react-router-dom': { name: 'React Router', category: 'Frontend', what: 'Maps URLs to React screens.', layer: 'frontend' },
  express: { name: 'Express', category: 'Backend', what: 'A minimal Node.js web server: routes requests to handler functions.', layer: 'backend' },
  fastify: { name: 'Fastify', category: 'Backend', what: 'A fast Node.js web server framework.', layer: 'backend' },
  koa: { name: 'Koa', category: 'Backend', what: 'A small Node.js web framework built on async middleware.', layer: 'backend' },
  hono: { name: 'Hono', category: 'Backend', what: 'A tiny web framework that runs on many runtimes, including edge.', layer: 'backend' },
  '@nestjs/core': { name: 'NestJS', category: 'Backend', what: 'A structured Node.js server framework with modules and dependency injection.', layer: 'backend' },
  '@trpc/server': { name: 'tRPC', category: 'API', what: 'Type-safe API calls between a TypeScript client and server, no schema files.', layer: 'api' },
  graphql: { name: 'GraphQL', category: 'API', what: 'An API where the client asks for exactly the fields it needs.', layer: 'api' },
  '@apollo/server': { name: 'Apollo Server', category: 'API', what: 'Serves a GraphQL API.', layer: 'api' },
  '@apollo/client': { name: 'Apollo Client', category: 'API', what: 'Calls a GraphQL API from the frontend and caches results.', layer: 'frontend' },
  axios: { name: 'axios', category: 'HTTP client', what: 'Makes HTTP requests to APIs.' },
  zod: { name: 'Zod', category: 'Validation', what: 'Checks that data has the expected shape at runtime.' },
  prisma: { name: 'Prisma', category: 'Database', what: 'A typed database toolkit: schema file, migrations and a query client.', layer: 'database' },
  '@prisma/client': { name: 'Prisma Client', category: 'Database', what: 'The generated, typed client used to query the database.', layer: 'database' },
  'drizzle-orm': { name: 'Drizzle ORM', category: 'Database', what: 'A lightweight typed SQL query builder.', layer: 'database' },
  typeorm: { name: 'TypeORM', category: 'Database', what: 'Maps classes to database tables.', layer: 'database' },
  sequelize: { name: 'Sequelize', category: 'Database', what: 'A Node.js ORM for SQL databases.', layer: 'database' },
  mongoose: { name: 'Mongoose', category: 'Database', what: 'Models and queries for MongoDB.', layer: 'database' },
  mongodb: { name: 'MongoDB driver', category: 'Database', what: 'Talks to a MongoDB document database.', layer: 'database' },
  pg: { name: 'PostgreSQL (pg)', category: 'Database', what: 'Connects Node.js to a PostgreSQL database.', layer: 'database' },
  mysql2: { name: 'MySQL', category: 'Database', what: 'Connects Node.js to a MySQL database.', layer: 'database' },
  'better-sqlite3': { name: 'SQLite', category: 'Database', what: 'A file-based SQL database embedded in the app.', layer: 'database' },
  redis: { name: 'Redis', category: 'Database', what: 'An in-memory store used for caching, queues and sessions.', layer: 'database' },
  ioredis: { name: 'Redis (ioredis)', category: 'Database', what: 'Redis client for caching, queues and sessions.', layer: 'database' },
  '@supabase/supabase-js': { name: 'Supabase', category: 'Integration', what: 'Hosted Postgres with auth and storage.', integration: true },
  firebase: { name: 'Firebase', category: 'Integration', what: 'Google’s hosted database, auth and hosting.', integration: true },
  'firebase-admin': { name: 'Firebase Admin', category: 'Integration', what: 'Server-side access to Firebase.', integration: true },
  stripe: { name: 'Stripe', category: 'Integration', what: 'Takes payments and manages subscriptions.', integration: true },
  '@stripe/stripe-js': { name: 'Stripe.js', category: 'Integration', what: 'Collects payment details in the browser securely.', integration: true },
  openai: { name: 'OpenAI SDK', category: 'Integration', what: 'Calls OpenAI models.', integration: true },
  '@anthropic-ai/sdk': { name: 'Anthropic SDK', category: 'Integration', what: 'Calls Claude models through the Anthropic API.', integration: true },
  '@anthropic-ai/claude-agent-sdk': { name: 'Claude Agent SDK', category: 'Integration', what: 'Builds agents on top of Claude Code.', integration: true },
  'aws-sdk': { name: 'AWS SDK', category: 'Integration', what: 'Talks to Amazon Web Services.', integration: true },
  '@aws-sdk/': { name: 'AWS SDK v3', category: 'Integration', what: 'Talks to Amazon Web Services (S3, DynamoDB, ...).', integration: true },
  '@sentry/': { name: 'Sentry', category: 'Integration', what: 'Reports errors and crashes from production.', integration: true },
  'posthog-js': { name: 'PostHog', category: 'Integration', what: 'Product analytics.', integration: true },
  '@clerk/': { name: 'Clerk', category: 'Integration', what: 'Hosted sign-in and user management.', integration: true },
  'next-auth': { name: 'NextAuth', category: 'Integration', what: 'Sign-in for Next.js apps.', integration: true },
  '@auth0/': { name: 'Auth0', category: 'Integration', what: 'Hosted authentication.', integration: true },
  twilio: { name: 'Twilio', category: 'Integration', what: 'Sends SMS and makes calls.', integration: true },
  '@sendgrid/mail': { name: 'SendGrid', category: 'Integration', what: 'Sends email.', integration: true },
  resend: { name: 'Resend', category: 'Integration', what: 'Sends email.', integration: true },
  'socket.io': { name: 'Socket.IO', category: 'Realtime', what: 'Two-way realtime messaging between browser and server.', layer: 'backend' },
  ws: { name: 'ws', category: 'Realtime', what: 'WebSocket server and client for Node.js.', layer: 'backend' },
  jest: { name: 'Jest', category: 'Testing', what: 'Runs JavaScript tests and reports which pass or fail.', layer: 'tests' },
  vitest: { name: 'Vitest', category: 'Testing', what: 'A fast test runner that shares Vite’s config.', layer: 'tests' },
  mocha: { name: 'Mocha', category: 'Testing', what: 'A JavaScript test runner.', layer: 'tests' },
  '@playwright/test': { name: 'Playwright', category: 'Testing', what: 'Drives real browsers to test the app end to end.', layer: 'tests' },
  cypress: { name: 'Cypress', category: 'Testing', what: 'End-to-end browser testing.', layer: 'tests' },
  '@testing-library/': { name: 'Testing Library', category: 'Testing', what: 'Tests UI the way a user would use it.', layer: 'tests' },
  eslint: { name: 'ESLint', category: 'Tooling', what: 'Finds bugs and style issues in JavaScript.' },
  prettier: { name: 'Prettier', category: 'Tooling', what: 'Formats code automatically.' },
  electron: { name: 'Electron', category: 'Desktop', what: 'Builds desktop apps with web technology.', layer: 'frontend' },
  // Python
  django: { name: 'Django', category: 'Backend', what: 'A batteries-included Python web framework with ORM and admin.', layer: 'backend' },
  flask: { name: 'Flask', category: 'Backend', what: 'A small Python web framework.', layer: 'backend' },
  fastapi: { name: 'FastAPI', category: 'Backend', what: 'A Python API framework with automatic validation and docs.', layer: 'api' },
  uvicorn: { name: 'Uvicorn', category: 'Backend', what: 'Runs Python async web apps.', layer: 'backend' },
  pydantic: { name: 'Pydantic', category: 'Validation', what: 'Validates data with Python type hints.' },
  sqlalchemy: { name: 'SQLAlchemy', category: 'Database', what: 'Python SQL toolkit and ORM.', layer: 'database' },
  alembic: { name: 'Alembic', category: 'Database', what: 'Database migrations for SQLAlchemy.', layer: 'database' },
  psycopg2: { name: 'PostgreSQL (psycopg)', category: 'Database', what: 'Connects Python to PostgreSQL.', layer: 'database' },
  'psycopg2-binary': { name: 'PostgreSQL (psycopg)', category: 'Database', what: 'Connects Python to PostgreSQL.', layer: 'database' },
  celery: { name: 'Celery', category: 'Backend', what: 'Runs background jobs from a queue.', layer: 'backend' },
  pytest: { name: 'pytest', category: 'Testing', what: 'Runs Python tests.', layer: 'tests' },
  numpy: { name: 'NumPy', category: 'Data', what: 'Fast arrays and math in Python.' },
  pandas: { name: 'pandas', category: 'Data', what: 'Tables of data (DataFrames) in Python.' },
  torch: { name: 'PyTorch', category: 'ML', what: 'Builds and trains neural networks.' },
  requests: { name: 'Requests', category: 'HTTP client', what: 'Makes HTTP requests from Python.' },
  anthropic: { name: 'Anthropic SDK', category: 'Integration', what: 'Calls Claude models from Python.', integration: true },
}

const LANG: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', swift: 'Swift', rb: 'Ruby', php: 'PHP',
  cs: 'C#', c: 'C', cc: 'C++', cpp: 'C++', h: 'C/C++', dart: 'Dart', vue: 'Vue', svelte: 'Svelte',
  html: 'HTML', css: 'CSS', scss: 'SCSS', sql: 'SQL', sh: 'Shell', ex: 'Elixir', scala: 'Scala',
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', 'coverage', 'venv', '.venv', 'env', '__pycache__', 'target', 'vendor', '.turbo', '.cache', '.idea', '.vscode', 'Pods', 'DerivedData', '.gradle', '.dart_tool', '.pytest_cache', '.mypy_cache', '.claude-plugin', '.parcel-cache', 'tmp', '.expo'])
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|mts|cts|vue|svelte|py)$/

function lookup(pkg: string): K | undefined {
  if (KNOWN[pkg]) return KNOWN[pkg]
  for (const key of Object.keys(KNOWN)) if (key.endsWith('/') && pkg.startsWith(key)) return KNOWN[key]
  return undefined
}

function pkgOf(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/')
  return spec.split('/')[0] ?? spec
}

const LAYER_NAME: Record<Layer, string> = {
  frontend: 'Frontend', api: 'API', backend: 'Backend', database: 'Database',
  integrations: 'Integrations', infra: 'Infra & CI', tests: 'Tests', config: 'Config',
}

export async function scanProject(io: IO, root: string): Promise<ProjectMap> {
  const files: string[] = []
  let truncated = false
  const queue: { dir: string; depth: number }[] = [{ dir: '', depth: 0 }]
  while (queue.length) {
    const next = queue.shift()
    if (!next) break
    let entries: FsEntry[] = []
    try {
      entries = await io.list(next.dir ? `${root}/${next.dir}` : root)
    } catch {
      continue
    }
    for (const en of entries) {
      const path = next.dir ? `${next.dir}/${en.name}` : en.name
      if (en.kind === 'dir') {
        if (SKIP.has(en.name) || (en.name.startsWith('.') && en.name !== '.github')) continue
        if (next.depth < 7) queue.push({ dir: path, depth: next.depth + 1 })
      } else if (en.kind === 'file') {
        if (files.length >= 5000) {
          truncated = true
          break
        }
        files.push(path)
      }
    }
    if (files.length >= 5000) break
  }

  // ----- tech stack from manifests
  const stack = new Map<string, Tech>()
  const deps = new Set<string>()
  const addTech = (t: Tech) => {
    if (!stack.has(t.name)) stack.set(t.name, t)
  }
  const read = async (p: string): Promise<string> => {
    try {
      return (await io.readFile(`${root}/${p}`)) as string
    } catch {
      return ''
    }
  }
  const has = (name: string) => files.find(f => f === name || f.endsWith('/' + name))
  for (const pj of files.filter(f => /(^|\/)package\.json$/.test(f)).slice(0, 12)) {
    try {
      const j = JSON.parse(await read(pj)) as Record<string, Record<string, string> | undefined>
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const name of Object.keys(j[section] ?? {})) deps.add(name)
      }
      addTech({ name: 'Node.js / npm', category: 'Runtime', what: 'Runs JavaScript outside the browser and manages packages.', evidence: pj })
    } catch {
      /* not JSON */
    }
  }
  const pyText = (await Promise.all(files.filter(f => /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|Pipfile)$/.test(f)).slice(0, 6).map(read))).join('\n')
  if (pyText) {
    addTech({ name: 'Python', category: 'Language', what: 'A readable general-purpose language, common for servers, scripts and data.', evidence: 'requirements / pyproject' })
    for (const m of pyText.matchAll(/^\s*["']?([A-Za-z0-9_.-]+)\s*(?:[<>=~!\[;"']|$)/gm)) if (m[1]) deps.add(m[1].toLowerCase())
  }
  if (has('go.mod')) addTech({ name: 'Go', category: 'Language', what: 'A compiled language built for simple, fast servers and tools.', evidence: 'go.mod' })
  if (has('Cargo.toml')) addTech({ name: 'Rust', category: 'Language', what: 'A fast compiled language that prevents memory bugs at compile time.', evidence: 'Cargo.toml' })
  if (has('Gemfile')) addTech({ name: 'Ruby', category: 'Language', what: 'A dynamic language, often used with Rails.', evidence: 'Gemfile' })
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) addTech({ name: 'JVM (Maven/Gradle)', category: 'Language', what: 'Java/Kotlin project built with Maven or Gradle.', evidence: 'pom.xml / build.gradle' })
  if (has('Package.swift') || files.some(f => f.endsWith('.xcodeproj/project.pbxproj') || f.endsWith('.swift'))) addTech({ name: 'Swift', category: 'Language', what: 'Apple’s language for iOS and macOS apps.', evidence: '.swift files' })
  if (has('pubspec.yaml')) addTech({ name: 'Flutter / Dart', category: 'Frontend', what: 'Builds mobile and desktop apps from one Dart codebase.', evidence: 'pubspec.yaml' })
  if (has('Dockerfile')) addTech({ name: 'Docker', category: 'Infra', what: 'Packages the app and its environment into a container that runs the same everywhere.', evidence: 'Dockerfile' })
  if (files.some(f => f.startsWith('.github/workflows/'))) addTech({ name: 'GitHub Actions', category: 'Infra', what: 'Runs tests and deploys automatically on each push.', evidence: '.github/workflows' })
  if (has('vercel.json')) addTech({ name: 'Vercel', category: 'Infra', what: 'Hosts and deploys web apps.', evidence: 'vercel.json' })
  if (has('netlify.toml')) addTech({ name: 'Netlify', category: 'Infra', what: 'Hosts and deploys web apps.', evidence: 'netlify.toml' })
  if (files.some(f => f.endsWith('.tf'))) addTech({ name: 'Terraform', category: 'Infra', what: 'Describes cloud infrastructure as code.', evidence: '*.tf' })
  const compose = files.find(f => /docker-compose[^/]*\.ya?ml$/.test(f))
  if (compose) {
    const text = await read(compose)
    for (const [re, k] of [[/image:\s*postgres/i, 'pg'], [/image:\s*redis/i, 'redis'], [/image:\s*mongo/i, 'mongodb'], [/image:\s*mysql/i, 'mysql2']] as const)
      if (re.test(text)) deps.add(k)
  }
  const prisma = files.find(f => f.endsWith('schema.prisma'))
  if (prisma) {
    deps.add('prisma')
    const m = (await read(prisma)).match(/provider\s*=\s*"(postgresql|mysql|sqlite|mongodb|sqlserver|cockroachdb)"/)
    if (m) addTech({ name: `Database: ${m[1]}`, category: 'Database', what: 'The database Prisma is configured to talk to.', evidence: prisma })
  }
  if (files.some(f => f.endsWith('.claude-plugin/plugin.json') || f === '.claude-plugin/plugin.json' || /(^|\/)hooks\/hooks\.json$/.test(f)))
    addTech({ name: 'Claude Code plugin', category: 'Integration', what: 'Extends Claude Code with hooks, panes, commands or tools.', evidence: 'plugin.json / hooks.json' })

  const integrationPkgs = new Map<string, K>()
  for (const d of deps) {
    const k = lookup(d)
    if (!k) continue
    addTech({ name: k.name, category: k.category, what: k.what, evidence: d })
    if (k.integration || k.layer === 'database') integrationPkgs.set(pkgOf(d), k)
  }
  const hasFrontend = [...stack.values()].some(t => t.category === 'Frontend' || t.category === 'Full-stack framework' || t.category === 'Styling')

  // ----- languages
  const langs = new Map<string, number>()
  for (const f of files) {
    const ext = f.split('.').pop()?.toLowerCase() ?? ''
    const l = LANG[ext]
    if (l) langs.set(l, (langs.get(l) ?? 0) + 1)
  }
  for (const [l] of [...langs].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    if (l === 'TypeScript') addTech({ name: 'TypeScript', category: 'Language', what: KNOWN.typescript?.what ?? '', evidence: '.ts files' })
  }

  // ----- components: layer + folder
  const compOf = new Map<string, string>()
  const comps = new Map<string, MapComponent>()
  for (const f of files) {
    const layer = layerOf(f, hasFrontend)
    if (!layer) continue
    const segs = f.split('/')
    const dirs = segs.slice(0, -1)
    const skipTop = ['src', 'app', 'lib', 'packages', 'apps'].includes(dirs[0] ?? '') ? 2 : 1
    let group = dirs.slice(0, Math.min(dirs.length, skipTop)).join('/') || '(root)'
    if (layer === 'config' || layer === 'infra') group = LAYER_NAME[layer]
    const id = `${layer}:${group}`
    let c = comps.get(id)
    if (!c) {
      c = { id, layer, label: group === LAYER_NAME[layer] ? group : group, files: [], fileCount: 0, tech: [], summary: '' }
      comps.set(id, c)
    }
    c.fileCount++
    if (c.files.length < 60) c.files.push(f)
    compOf.set(f, id)
  }
  // Collapse tiny groups per layer into "other"
  const byLayer = new Map<Layer, MapComponent[]>()
  for (const c of comps.values()) byLayer.set(c.layer, [...(byLayer.get(c.layer) ?? []), c])
  for (const [layer, list] of byLayer) {
    list.sort((a, b) => b.fileCount - a.fileCount)
    if (list.length <= 5) continue
    const keep = list.slice(0, 4)
    const rest = list.slice(4)
    const other: MapComponent = { id: `${layer}:other`, layer, label: `other ${LAYER_NAME[layer].toLowerCase()}`, files: [], fileCount: 0, tech: [], summary: '' }
    for (const r of rest) {
      other.fileCount += r.fileCount
      other.files.push(...r.files.slice(0, 60 - other.files.length))
      for (const f of r.files) compOf.set(f, other.id)
      comps.delete(r.id)
    }
    comps.set(other.id, other)
    byLayer.set(layer, [...keep, other])
  }
  // Integrations as their own components
  for (const [pkg, k] of integrationPkgs) {
    const layer: Layer = k.layer === 'database' ? 'database' : 'integrations'
    comps.set(`pkg:${pkg}`, { id: `pkg:${pkg}`, layer, label: k.name, files: [], fileCount: 0, tech: [k.name], summary: k.what })
  }

  // ----- relationships from imports
  const edges = new Map<string, number>()
  const fileSet = new Set(files)
  const sources = files.filter(f => SOURCE.test(f) && compOf.has(f)).slice(0, 450)
  let scanned = 0
  for (let i = 0; i < sources.length; i += 20) {
    const batch = sources.slice(i, i + 20)
    const texts = await Promise.all(batch.map(read))
    batch.forEach((f, j) => {
      const text = (texts[j] ?? '').slice(0, 60000)
      scanned++
      const from = compOf.get(f)
      if (!from) return
      const specs: string[] = []
      for (const m of text.matchAll(/(?:import\s[^'"]*?from\s*|import\s*|require\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]/g)) if (m[1]) specs.push(m[1])
      if (f.endsWith('.py')) for (const m of text.matchAll(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+))/gm)) specs.push((m[1] ?? m[2] ?? '').replace(/^\./, './'))
      for (const spec of specs) {
        let to: string | undefined
        if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('~/')) {
          const base = spec.startsWith('@/') || spec.startsWith('~/') ? 'src/' + spec.slice(2) : joinPath(f, spec)
          to = resolve(base, fileSet)
          if (to) to = compOf.get(to)
        } else if (f.endsWith('.py') && fileSet.has(spec.replace(/\./g, '/') + '.py')) {
          to = compOf.get(spec.replace(/\./g, '/') + '.py')
        } else {
          const pkg = pkgOf(spec)
          if (integrationPkgs.has(pkg)) {
            to = `pkg:${pkg}`
            const c = comps.get(to)
            if (c && c.files.length < 40 && !c.files.includes(f)) {
              c.files.push(f)
              c.fileCount++
            }
          }
          const k = lookup(pkg) ?? lookup(spec.split('.')[0] ?? '')
          const fc = comps.get(from)
          if (k && fc && !fc.tech.includes(k.name)) fc.tech.push(k.name)
        }
        if (to && to !== from) edges.set(`${from}→${to}`, (edges.get(`${from}→${to}`) ?? 0) + 1)
      }
    })
  }

  for (const c of comps.values()) {
    if (!c.summary) c.summary = `${c.fileCount} file${c.fileCount === 1 ? '' : 's'} of ${LAYER_NAME[c.layer].toLowerCase()} code${c.tech.length ? ', using ' + c.tech.slice(0, 4).join(', ') : ''}.`
  }

  const edgeList: MapEdge[] = [...edges].map(([k, weight]) => {
    const [from = '', to = ''] = k.split('→')
    return { from, to, weight }
  })
  return {
    root,
    scannedAt: await io.now(),
    fileCount: files.length,
    truncated,
    components: [...comps.values()],
    edges: edgeList,
    stack: [...stack.values()],
    languages: [...langs].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, files: n })),
    importsScanned: scanned,
  }
}

function joinPath(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1)
  for (const s of spec.split('/')) {
    if (s === '.' || s === '') continue
    if (s === '..') parts.pop()
    else parts.push(s)
  }
  return parts.join('/')
}

function resolve(base: string, files: Set<string>): string | undefined {
  const clean = base.replace(/\.(js|mjs|cjs)$/, '')
  const tries = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte', '.py', '.d.ts'].map(e => clean + e), ...['/index.ts', '/index.tsx', '/index.js', '/__init__.py'].map(e => clean + e)]
  return tries.find(t => files.has(t))
}

export const LAYERS: Layer[] = ['frontend', 'api', 'backend', 'database', 'integrations', 'tests', 'infra', 'config']
export { LAYER_NAME }
