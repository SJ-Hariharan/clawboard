import { expect, test } from 'claude-code/testing'
import { sameUsage } from '../hooks/store'

const reading = { model: 'm', contextTokens: 1000, contextWindow: 200000, contextPercent: 1, costUsd: 0.1, rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: 'x' }] }

test('an unchanged usage reading is recognised, so the panel is not redrawn for nothing', () => {
  expect(sameUsage(reading, { ...reading, rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: 'x' }] })).toBe(true)
})

test('any change in context, cost, model or a limit counts as new', () => {
  expect(sameUsage(reading, { ...reading, contextTokens: 1001 })).toBe(false)
  expect(sameUsage(reading, { ...reading, costUsd: 0.2 })).toBe(false)
  expect(sameUsage(reading, { ...reading, model: 'other' })).toBe(false)
  expect(sameUsage(reading, { ...reading, rateLimits: [{ kind: 'five_hour', percentUsed: 11, resetsAt: 'x' }] })).toBe(false)
  expect(sameUsage(reading, { ...reading, rateLimits: [] })).toBe(false)
})
