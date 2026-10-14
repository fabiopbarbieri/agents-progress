import { expect, mock, test } from 'claude-code/testing'

import { BAND, engine, progress } from './kit'

test('the band draws its bar as text on the terminal and as one drawing on the desktop', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'Probe', phase: 'delegate', total: 4, done: 1 }))

  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...BAND })
  expect(await term.find({ type: 'Text', text: 'Tasks 1/4' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /^█+░+$/ })).toBeDefined()
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...BAND })
  expect((await desk.find({ type: 'Svg' }))?.props.alt).toBe('Probe: Tasks 1/4, 25%')
  await desk.unmount()
})

test("another plugin's band stays, with the flow's under it", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on, {}, 'tests: 3/10')
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'tests: 3/10' })).toBeDefined()

  await $.tool.call(progress({ title: 'Probe', phase: 'delegate', total: 2 }))
  expect(await ui.find({ type: 'Text', text: 'tests: 3/10' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Tasks 0/2' })).toBeDefined()
  await ui.unmount()
})

test('a finished flow leaves the band by itself', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'Probe', phase: 'delegate', total: 2, done: 2 }))
  expect(await $.tool.call(progress({ finished: true }))).toEqual({ result: 'ok: Done' })

  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'Done' })).toBeDefined()
  await clock.advance(9_000)
  expect(await ui.find({ type: 'Text', text: 'Done' })).toBeDefined()
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Text', text: 'Done' })).toBeUndefined()
  await ui.unmount()
})

test('a flow reported again after it finished keeps its band', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'First', finished: true }))
  await clock.advance(5_000)
  await $.tool.call(progress({ title: 'Second', phase: 'delegate', total: 3 }))
  await clock.advance(10_000)
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'Tasks 0/3' })).toBeDefined()
  await ui.unmount()
})
