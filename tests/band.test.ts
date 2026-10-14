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
