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

test('a resumed run carries on in its own row: same start, totals, steps and round, its prompt as sent', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('agent.spawn', async (_$, e) => {
    prompts.push(e.prompt)
    return { model: 'claude-haiku-5-5', agentId: e.resume?.agentId ?? `a-${e.description}` }
  })
  on('turn.complete', async (_$, e) => ({ text: e.answer ?? '' }) as never)

  await $.agent.spawn(spawn('1') as never)
  await $.tool.call({ tool: 'mcp__agents-progress__step', done: 2, total: 4, agentId: 'a-task 1' } as never)
  await $.turn.complete({ agentId: 'a-task 1', reason: 'answer', answer: 'ok' } as never)
  await clock.advance(5000)
  await $.agent.spawn({ ...spawn('1'), prompt: 'your child answered', resume: { agentId: 'a-task 1' } } as never)

  expect(prompts[1]).toBe('your child answered')
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.findAll({ type: 'Text', text: /^task 1$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /round/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: / 50% · 2\/4$/ })).toBeDefined()
  // Timed from its first start, five seconds ago, and at work again.
  expect(await ui.find({ type: 'Text', text: / 0:05$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Running · 1' })).toBeDefined()
  await ui.unmount()
})

test('a run that answers before its last step reads full; a failed one keeps its count', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  for (const id of ['1', '2']) {
    await $.agent.spawn(spawn(id) as never)
    await $.tool.call({ tool: 'mcp__agents-progress__step', done: 2, total: 3, note: 'grep', agentId: `a-task ${id}` } as never)
  }
  await $.turn.complete({ agentId: 'a-task 1', reason: 'answer', answer: 'ok' } as never)
  await $.turn.complete({ agentId: 'a-task 2', reason: 'error' } as never)

  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.findAll({ type: 'Text', text: / 100% · 3\/3 · grep$/ })).toHaveLength(1)
  expect(await ui.findAll({ type: 'Text', text: / 67% · 2\/3 · grep$/ })).toHaveLength(1)
  await ui.unmount()
})

test('the totals time the runs at work, not the idle spell between them', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(spawn('1') as never)
  await clock.advance(2000)
  await $.turn.complete({ agentId: 'a-task 1', reason: 'answer', answer: 'ok' } as never)
  await clock.advance(60000)
  await $.agent.spawn(spawn('2') as never)
  await $.agent.spawn(spawn('3') as never)
  await clock.advance(3000)
  for (const id of ['2', '3']) await $.turn.complete({ agentId: `a-task ${id}`, reason: 'answer', answer: 'ok' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agents-progress', surface, ...PANE })
    const texts = [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Svg' }))].map(n => JSON.stringify(n))
    expect(texts.some(t => t.includes('0:05'))).toBe(true)
    expect(texts.some(t => t.includes('1:05'))).toBe(false)
    await ui.unmount()
  }
})
