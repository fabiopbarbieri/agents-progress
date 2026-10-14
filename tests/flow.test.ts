import { expect, mock, test } from 'claude-code/testing'

import { BAND, PANE, engine, finishRuns, progress, spawn } from './kit'

const step = (input: Record<string, unknown>) => ({ tool: 'mcp__agents-progress__step', ...input }) as never

// One model request of run `task <id>`, answered with `usage`.
const request = async ($: { turn: unknown }, id: string) => {
  const stream = ($.turn as { step: (e: unknown) => AsyncIterable<unknown> }).step({
    turnId: 't',
    index: 0,
    model: 'claude-sonnet-5-5',
    messageCount: 1,
    agentId: `a-task ${id}`,
  })
  for await (const _ of stream);
}

test('a new title starts a clean flow; the same title keeps its count and re-plans', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'First', phase: 'delegate', tasks: [{ title: 'a', tier: 'light' }, { title: 'b', tier: 'medium' }] }))
  expect(await $.tool.call(progress({ done: 5 }))).toEqual({ result: 'ok: Tasks 2/2' })
  expect(await $.tool.call(progress({ title: 'First', tasks: [{ title: 'a', tier: 'light' }, { title: 'b', tier: 'medium' }, { title: 'c', tier: 'heavy' }] }))).toEqual({
    result: 'ok: Tasks 2/3',
  })

  await finishRuns($, 1)
  await $.agent.spawn(spawn('2') as never)
  expect(await $.tool.call(progress({ title: 'Second', phase: 'review', total: 1 }))).toEqual({ result: 'ok: Review 0/1' })

  // The finished run left with the old flow; the one still at work stayed.
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'task 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'task 1' })).toBeUndefined()
  await ui.unmount()
})

test('planned tasks wait in the pane until a run of the same description starts', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'Plan', phase: 'delegate', tasks: [{ title: 'Task 1', tier: 'light' }, { title: 'task 2', tier: 'heavy', after: [1] }] }))
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /1\. Task 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /heavy · Opus · after 1/ })).toBeDefined()

  await $.agent.spawn(spawn('1') as never)
  expect(await ui.find({ type: 'Text', text: /1\. Task 1/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /2\. task 2/ })).toBeDefined()
  await ui.unmount()
})

test("a worker's steps draw its own bar; a call from outside a subagent is ignored", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(spawn('1') as never)
  expect(await $.tool.call(step({ done: 0, total: 5 }))).toEqual({ result: 'ignored: only subagents report steps' })
  expect(await $.tool.call(step({ done: 2, total: 5, note: 'reading', agentId: 'a-task 1' }))).toEqual({ result: 'ok' })
  expect(await $.tool.call(step({ done: 9, agentId: 'a-task 1' }))).toEqual({ result: 'ok' })

  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /5\/5 · ctx/ })).toBeDefined()
  await ui.unmount()
})

test("each model request adds the run's tokens and estimated cost", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  on('turn.step', async function* () {
    return {
      turnId: 't',
      index: 0,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 20000, cache_creation_input_tokens: 3000 },
    } as never
  })
  await $.agent.spawn(spawn('1') as never)
  await request($, '1')
  await request($, '1')

  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  // Sonnet: 1000×2 + 500×10 + 20000×0.2 + 3000×2.5 per million = $0.0185 a request.
  expect(await ui.find({ type: 'Text', text: /ctx 2% · 25k ≈\$0\.04/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /≈\$0\.04 · 49k tokens/ })).toBeDefined()
  await ui.unmount()
})

test('a run that ends without an answer is marked failed', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(spawn('1') as never)
  await $.turn.complete({ agentId: 'a-task 1', reason: 'error' } as never)
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: '✗' })).toBeDefined()
  await ui.unmount()
})

test('the language option draws the band and the pane in Portuguese', { options: { language: 'pt' } }, async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
  expect(await $.tool.call(progress({ title: 'Teste', phase: 'delegate', total: 2 }))).toEqual({ result: 'ok: Tarefas 0/2' })
  const band = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Text', text: 'Tarefas 0/2' })).toBeDefined()
  await band.unmount()
  const pane = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await pane.find({ type: 'Text', text: 'Nenhum subagente ainda.' })).toBeDefined()
  await pane.unmount()
})
