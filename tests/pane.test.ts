import { expect, mock, test } from 'claude-code/testing'

import { PANE, engine, finishRuns, spawn } from './kit'

test('the pane draws the latest ten finished runs and counts the rest', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await finishRuns($, 13)

  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  const names = (await term.findAll({ type: 'Text', text: /^task \d+$/ })).map(t => t.text)
  expect(names).toEqual(['task 13', 'task 12', 'task 11', 'task 10', 'task 9', 'task 8', 'task 7', 'task 6', 'task 5', 'task 4'])
  expect(await term.find({ type: 'Button', key: 'earlier' })).toMatchObject({ props: { label: '+3 earlier' } })
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...PANE })
  const rows = (await desk.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).startsWith('task '))
  expect(rows).toHaveLength(10)
  expect(await desk.find({ type: 'Button', key: 'earlier' })).toMatchObject({ props: { label: '+3 earlier' } })
  await desk.unmount()
})

test('a finished row carries no animation and a walking one only its costume', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on, { 'task 2': 'claude-haiku-5-5' })
  await finishRuns($, 1)
  await $.agent.spawn(spawn('2') as never)

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...PANE })
  const source = async (name: string) =>
    String((await desk.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith(name))?.props.source)
  const done = await source('task 1:')
  const walking = await source('task 2:')
  expect(done).not.toMatch(/@keyframes st/)
  expect(walking).toMatch(/@keyframes st/)
  expect(walking).toMatch(/\.c-light\.run/)
  expect(walking).not.toMatch(/\.c-medium\.run|\.c-fable\.run/)
  expect((done.match(/<rect /g) ?? []).length).toBeLessThan(10)
  await desk.unmount()
})

test('the earlier runs open and close from their button', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await finishRuns($, 12)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agents-progress', surface, ...PANE })
    const drawn = async () =>
      surface === 'terminal'
        ? (await ui.findAll({ type: 'Text', text: /^task \d+$/ })).length
        : (await ui.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).startsWith('task ')).length
    expect(await drawn()).toBe(10)
    await ui.press({ key: 'earlier' })
    expect(await drawn()).toBe(12)
    expect(await ui.find({ type: 'Button', key: 'earlier' })).toMatchObject({ props: { label: '▴ Show fewer' } })
    await ui.press({ key: 'earlier' })
    expect(await drawn()).toBe(10)
    await ui.unmount()
  }
})
