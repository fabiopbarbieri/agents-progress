import { expect, mock, test } from 'claude-code/testing'

import { BAND, PANE, engine, progress, spawn } from './kit'

test('the flow counts runs still at work, though the Agent tool already answered', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  expect(await $.tool.call(progress({ title: 'Probe', phase: 'delegate' }))).toEqual({ result: 'ok: Tasks running: 0' })

  await $.agent.spawn(spawn('1') as never)
  await $.agent.spawn(spawn('2') as never)
  expect(await $.tool.call(progress({}))).toEqual({ result: 'ok: Tasks running: 2' })

  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'Tasks running: 2' })).toBeDefined()

  await $.turn.complete({ agentId: 'a-task 1', reason: 'answer', answer: 'ok' } as never)
  expect(await ui.find({ type: 'Text', text: 'Tasks running: 1' })).toBeDefined()
  await ui.unmount()
})

test('a run started while the flow still plans moves it to delegating', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  expect(await $.tool.call(progress({ title: 'Probe', total: 2 }))).toEqual({ result: 'ok: Plan' })
  await $.agent.spawn(spawn('1') as never)
  expect(await $.tool.call(progress({}))).toEqual({ result: 'ok: Tasks 0/2' })
})

test('runs at work under a planned flow fill the faint layer of the bar', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'Probe', phase: 'delegate', total: 2 }))
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...BAND })
  const faint = async () => /opacity="0.45">([^<]|<(?!\/g>))+<\/g>/.test(String((await ui.find({ type: 'Svg' }))?.props.source))
  expect(await faint()).toBe(false)
  await $.agent.spawn(spawn('1') as never)
  expect(await faint()).toBe(true)
  await ui.unmount()
})

test('a run woken after it answered is at work from its turn start', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  await $.agent.spawn(spawn('1') as never)
  await $.turn.complete({ agentId: 'a-task 1', reason: 'answer', answer: 'ok' } as never)

  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Text', text: /Running/ })).toBeUndefined()
  await $.turn.start({ text: 'one more thing', turnId: 't-2', agentId: 'a-task 1' } as never)
  expect(await term.find({ type: 'Text', text: /Running · 1/ })).toBeDefined()
  // The main loop's turns and unknown agents change nothing.
  await $.turn.start({ text: 'hi', turnId: 't-3' } as never)
  await $.turn.start({ text: 'hi', turnId: 't-4', agentId: 'a-nobody' } as never)
  expect(await term.find({ type: 'Text', text: /Running · 1/ })).toBeDefined()
  await term.unmount()
})
