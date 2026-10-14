import { expect, mock, test } from 'claude-code/testing'

import { engine, finishRuns, progress, spawn } from './kit'

test('an idle session reads nothing on the clock; a run at work ticks it', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  let reads = 0
  let ticks = 0
  on('state.get', async (_$, e, next) => {
    reads++
    return next(e)
  })
  on('state.set', async (_$, e, next) => {
    if ((e as { key?: string }).key === 'now') ticks++
    return next(e)
  })

  reads = 0
  await clock.advance(5_000)
  expect(reads).toBe(0)

  await $.agent.spawn(spawn('1') as never)
  ticks = 0
  await clock.advance(3_000)
  expect(ticks).toBe(3)

  await $.turn.complete({ agentId: 'a-task 1', reason: 'answer', answer: 'ok' } as never)
  await clock.advance(1_000)
  reads = 0
  ticks = 0
  await clock.advance(5_000)
  expect(reads).toBe(0)
  expect(ticks).toBe(0)
})

test('a report that changes nothing writes nothing', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  const writes: string[] = []
  on('state.set', async (_$, e, next) => {
    writes.push((e as { key?: string }).key ?? '')
    return next(e)
  })
  await $.tool.call(progress({ title: 'Probe', phase: 'delegate', total: 2 }))
  await finishRuns($, 1)

  writes.length = 0
  await $.tool.call(progress({ title: 'Probe', phase: 'delegate', total: 2 }))
  await $.tool.call({ tool: 'mcp__agents-progress__step', done: 1, agentId: 'a-unknown' } as never)
  await $.turn.complete({ agentId: 'a-unknown', reason: 'answer', answer: 'ok' } as never)
  expect(writes).toEqual([])
})
