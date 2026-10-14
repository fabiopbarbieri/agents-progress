import { expect, mock, test } from 'claude-code/testing'

import { PANE, engine, spawn } from './kit'

test("a run whose requests went unseen takes the answer's sum, missing fields as zero", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(spawn('1') as never)
  await $.turn.complete({
    agentId: 'a-task 1',
    reason: 'answer',
    answer: 'ok',
    usage: { model: 'claude-haiku-5-5', input_tokens: 100, output_tokens: 50 },
  } as never)
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /· 150 tokens ·/ })).toBeDefined()
  await ui.unmount()
})

test('an auto-open that fails is tried again by the next run', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let calls = 0
  on('ui.open', async () => {
    calls++
    if (calls === 1) throw new Error('no surface yet')
    return { value: { isPlaced: true } }
  })
  on('agent.spawn', async (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.description}` }))
  on('turn.complete', async (_$, e) => ({ text: e.answer ?? '' }) as never)

  await $.agent.spawn(spawn('1') as never)
  await $.turn.complete({ agentId: 'a-task 1', reason: 'answer', answer: 'ok' } as never)
  await $.agent.spawn(spawn('2') as never)
  expect(calls).toBe(2)
  // Opened now: the same spell does not open it again.
  await $.agent.spawn(spawn('3') as never)
  expect(calls).toBe(2)
})
