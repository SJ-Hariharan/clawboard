import { expect, test } from 'claude-code/testing'
import { classify, isTestCommand, layerOf, rel, testSummary } from '../hooks/classify'

test('an Edit makes the crab code and records the file', () => {
  const c = classify('Edit', { file_path: '/p/src/components/Login.tsx', old_string: 'a', new_string: 'b\nc' }, '/p')
  expect(c.state).toBe('coding')
  expect(c.kind).toBe('edit')
  expect(c.modifies).toBe(true)
  expect(c.files).toEqual(['/p/src/components/Login.tsx'])
  expect(c.title).toBe('Edited src/components/Login.tsx')
  expect(c.plain).toContain('1 → 2 lines')
})

test('reading and searching make the crab explore without marking files modified', () => {
  for (const [tool, input] of [['Read', { file_path: '/p/a.ts' }], ['Grep', { pattern: 'foo' }], ['Glob', { pattern: '**/*.ts' }]] as const) {
    const c = classify(tool, input, '/p')
    expect(c.state).toBe('exploring')
    expect(c.modifies).toBeUndefined()
    expect(c.files).toEqual([])
  }
})

test('test commands are recognised across runners', () => {
  for (const cmd of ['npm test', 'npx vitest run', 'pytest -q', 'go test ./...', 'cargo test', 'claude plugin test .']) {
    expect(isTestCommand(cmd)).toBe(true)
  }
  for (const cmd of ['ls -la', 'git status', 'echo contest', 'npm install']) {
    expect(isTestCommand(cmd)).toBe(false)
  }
  expect(classify('Bash', { command: 'npm test' }, '/p').state).toBe('testing')
  expect(classify('Bash', { command: 'git status' }, '/p').state).toBe('exploring')
})

test('test output is parsed into pass and fail counts, or left unknown', () => {
  expect(testSummary('3 passed, 1 failed')).toEqual({ passed: 3, failed: 1 })
  expect(testSummary('Tests: 1 failed, 4 passed, 5 total')).toEqual({ passed: 4, failed: 1 })
  expect(testSummary('all good')).toEqual({ passed: undefined, failed: undefined })
})

test('files are placed in architecture layers', () => {
  expect(layerOf('src/components/Login.tsx')).toBe('frontend')
  expect(layerOf('src/api/users.ts')).toBe('api')
  expect(layerOf('prisma/schema.prisma')).toBe('database')
  expect(layerOf('tests/login.test.ts')).toBe('tests')
  expect(layerOf('Dockerfile')).toBe('infra')
  expect(layerOf('package.json')).toBe('config')
  expect(layerOf('notes.txt')).toBeNull()
})

test('paths are shown relative to the project and never leak the home folder', () => {
  expect(rel('/p/src/a.ts', '/p')).toBe('src/a.ts')
  expect(rel('/Users/someone/other/b.ts', '/p')).toBe('~/other/b.ts')
})
