import { expect, test } from 'claude-code/testing'
import type { IO } from '../hooks/io'
import { scanProject } from '../hooks/scan'

const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ dependencies: { react: '18', express: '4', stripe: '14' }, devDependencies: { vitest: '2' } }),
  'src/components/App.tsx': "import { getUsers } from '../api/client'\nimport React from 'react'\n",
  'src/api/client.ts': "import Stripe from 'stripe'\nexport const getUsers = () => new Stripe('x')\n",
  'server/index.ts': "import express from 'express'\nimport { getUsers } from '../src/api/client'\n",
  'tests/app.test.ts': "import { getUsers } from '../src/api/client'\n",
  'node_modules/react/index.js': 'ignored',
}

function fakeIo(): IO {
  const list = async (path: string) => {
    const dir = path.replace(/^\/p\/?/, '')
    const seen = new Map<string, 'file' | 'dir'>()
    for (const f of Object.keys(FILES)) {
      if (dir && !f.startsWith(dir + '/')) continue
      const rest = dir ? f.slice(dir.length + 1) : f
      const [head, ...tail] = rest.split('/')
      if (head) seen.set(head, tail.length ? 'dir' : 'file')
    }
    return [...seen].map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: 0, isLink: false }))
  }
  const readFile = async (path: string) => {
    const f = FILES[path.replace(/^\/p\//, '')]
    if (f === undefined) throw new Error('ENOENT')
    return f
  }
  return { list, readFile, now: async () => 1 } as unknown as IO
}

test('the scan reads the stack from manifests and ignores node_modules', async () => {
  const map = await scanProject(fakeIo(), '/p')
  const names = map.stack.map(t => t.name)
  for (const expected of ['React', 'Express', 'Stripe', 'Vitest']) expect(names).toContain(expected)
  expect(map.fileCount).toBe(5)
  expect(map.components.flatMap(c => c.files).some(f => f.includes('node_modules'))).toBe(false)
})

test('relationships come from real import statements', async () => {
  const map = await scanProject(fakeIo(), '/p')
  const edge = (from: string, to: string) => map.edges.find(e => e.from === from && e.to === to)
  expect(edge('frontend:src/components', 'api:src/api')).toBeDefined()
  expect(edge('api:src/api', 'pkg:stripe')).toBeDefined()
  expect(edge('tests:tests', 'api:src/api')).toBeDefined()
  // Nothing imports the frontend, so no edge may point at it.
  expect(map.edges.some(e => e.to === 'frontend:src/components')).toBe(false)
})
