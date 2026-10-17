import { expect, mock, test } from 'claude-code/testing'

import { PANE, engine, finishRuns, progress, spawn } from './kit'

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

test('the simple view drops the grey rows on the terminal, and the desktop draws no such button', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'Flow', phase: 'delegate', tasks: [{ title: 'task 1', tier: 'medium' }, { title: 'later', tier: 'light' }] }))
  await $.agent.spawn(spawn('1') as never)
  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Button', key: 'simple' })).toMatchObject({ props: { label: '○', hotkey: 's' } })
  // Framed, so the terminal draws `[ ○ ]` and not `s: ○`; the key stays.
  expect((await term.find({ type: 'Button', key: 'simple' }))?.props.plain).toBeUndefined()
  expect(await term.find({ type: 'Button', key: 'compact' })).toMatchObject({ props: { label: '−', hotkey: 'c' } })
  expect(await term.find({ type: 'Text', text: /Sonnet 5\.5 \| medium/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /≈\$/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /light · Haiku/ })).toBeDefined()
  await term.press({ key: 'simple' })
  expect(await term.find({ type: 'Button', key: 'simple' })).toMatchObject({ props: { label: '●' } })
  expect(await term.find({ type: 'Text', text: /Sonnet 5\.5 \| medium/ })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: /^ {2}\d+% · / })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: /light · Haiku/ })).toBeUndefined()
  // Name and bar stay.
  expect(await term.find({ type: 'Text', text: /^task 1$/ })).toBeDefined()
  await term.press({ key: 'simple' })
  expect(await term.find({ type: 'Text', text: /Sonnet 5\.5 \| medium/ })).toBeDefined()
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...PANE })
  expect(await desk.find({ type: 'Button', key: 'simple' })).toBeUndefined()
  await desk.unmount()
})

test("the terminal's ? lists the pane's keys; the desktop draws no ?", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(spawn('1') as never)
  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Button', key: 'help' })).toMatchObject({ props: { label: '?' } })
  expect((await term.find({ type: 'Button', key: 'help' }))?.props.plain).toBeUndefined()
  expect(await term.find({ type: 'Text', text: 'With the pane focused (ctrl+x tab):' })).toBeUndefined()
  await term.press({ key: 'help' })
  expect(await term.find({ type: 'Text', text: 'With the pane focused (ctrl+x tab):' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /s simple view · c collapse/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /m main conversation · Esc close/ })).toBeDefined()
  await term.press({ key: 'help' })
  expect(await term.find({ type: 'Text', text: 'With the pane focused (ctrl+x tab):' })).toBeUndefined()
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...PANE })
  expect(await desk.find({ type: 'Button', key: 'help' })).toBeUndefined()
  await desk.unmount()
})
