import { expect, mock, test } from 'claude-code/testing'

import { PANE, engine, spawn } from './kit'

const viewing = (agentId?: string) => ({ ...PANE, props: { ...PANE.props, view: agentId ? { agentId } : {} } })

test("pressing a run puts its transcript in the main view, and the run in view brings the main one back", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  const asked: unknown[] = []
  on('ui.view', async (_$, e) => {
    asked.push(e)
    return { value: {} } as never
  })
  await $.agent.spawn(spawn('1') as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agents-progress', surface, ...viewing() })
    expect(await ui.find({ type: 'Button', key: 'main' })).toBeUndefined()
    await ui.press({ key: 'view-a-task 1' })
    await ui.unmount()
  }
  expect(asked).toEqual([{ agentId: 'a-task 1' }, { agentId: 'a-task 1' }])

  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...viewing('a-task 1') })
  expect(await term.find({ type: 'Text', text: '▶' })).toBeDefined()
  expect(await term.find({ type: 'Button', key: 'main' })).toMatchObject({ props: { label: '↩ Main conversation', hotkey: 'm' } })
  await term.press({ key: 'view-a-task 1' })
  await term.press({ key: 'main' })
  await term.unmount()
  expect(asked.slice(2)).toEqual([{}, {}])

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...viewing('a-task 1') })
  const row = (await desk.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('task 1:'))
  expect(String(row?.props.alt)).toMatch(/, in view$/)
  expect(String(row?.props.source)).toContain('class="tile"')
  expect(await desk.find({ type: 'Button', key: 'view-a-task 1' })).toMatchObject({ props: { label: '↩' } })
  await desk.unmount()
})

test('a view the engine refuses says why in a toast', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  on('ui.view', async () => ({ value: { deny: 'no agent holds the id' } }) as never)
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined } as never
  })
  await $.agent.spawn(spawn('1') as never)
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...viewing() })
  await ui.press({ key: 'view-a-task 1' })
  await ui.unmount()
  await new Promise(done => setTimeout(done, 0))
  expect(toasts).toEqual(['no agent holds the id'])
})

test('a run another subagent started sits under it, indented', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(spawn('1') as never)
  await $.agent.spawn(spawn('2') as never)
  await $.agent.spawn({ ...spawn('1.1'), parentAgentId: 'a-task 1' } as never)

  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  const names = (await term.findAll({ type: 'Text', text: /^task [\d.]+$/ })).map(t => t.text)
  // Newest first, each child right under its parent.
  expect(names).toEqual(['task 2', 'task 1', 'task 1.1'])
  expect(await term.find({ type: 'Text', text: '↳' })).toBeDefined()
  expect(await term.find({ type: 'Box', key: 'a-task 1.1' })).toMatchObject({ props: { paddingLeft: 2 } })
  expect(await term.find({ type: 'Box', key: 'a-task 1' })).toMatchObject({ props: { paddingLeft: 0 } })
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...PANE })
  const rows = (await desk.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).startsWith('task '))
  expect(rows.map(r => String(r.props.alt).split(':')[0])).toEqual(['task 2', 'task 1', 'task 1.1'])
  expect(String(rows[2]?.props.source)).toContain('translate(16,0)')
  expect(String(rows[1]?.props.source)).toContain('translate(0,0)')
  await desk.unmount()
})

test("Escape closes the pane: every open asks for it", async ($, on) => {
  mock.clock(on, { now: 1000 })
  const opens: unknown[] = []
  engine(on, {}, undefined, opens)
  // No pane is up, so the command opens it.
  on('ui.panes', async () => ({ value: [] }) as never)
  await $.agent.spawn(spawn('1') as never)
  await $.command.run({ command: 'agents-info', args: '' } as never)
  await new Promise(done => setTimeout(done, 0))
  expect(opens).toHaveLength(2)
  expect(opens.every(o => (o as { closeOnEscape?: boolean }).closeOnEscape === true)).toBe(true)
})

test("the pane's toggles answer their hotkeys", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  for (let i = 1; i <= 12; i++) {
    await $.agent.spawn(spawn(String(i)) as never)
    await $.turn.complete({ agentId: `a-task ${i}`, reason: 'answer', answer: 'ok' } as never)
  }
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Button', key: 'compact' })).toMatchObject({ props: { hotkey: 'c' } })
  expect(await ui.find({ type: 'Button', key: 'done' })).toMatchObject({ props: { hotkey: 'f' } })
  expect(await ui.find({ type: 'Button', key: 'earlier' })).toMatchObject({ props: { hotkey: 'e' } })
  await ui.unmount()
})

test('/agents-info opens a pane that waits undrawn or sits behind a tab, and closes one in sight', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const opens: unknown[] = []
  engine(on, {}, undefined, opens)
  let pane = { id: 'agents-progress', title: 'Agents', isShown: false, isFocused: false, isPlaced: false }
  on('ui.panes', async () => ({ value: [pane] }) as never)
  const closed: string[] = []
  on('ui.close', async (_$, e) => {
    closed.push(e.id)
    return { value: undefined } as never
  })
  const run = async () => (await $.command.run({ command: 'agents-info', args: '' } as never)) as { text: string }

  // Opened unasked on a narrow terminal: listed, never drawn.
  expect((await run()).text).toBe('Agents panel opened.')
  pane = { ...pane, isPlaced: true }
  // Placed, behind another pane's tab.
  expect((await run()).text).toBe('Agents panel opened.')
  expect(closed).toEqual([])
  pane = { ...pane, isShown: true }
  expect((await run()).text).toBe('Agents panel closed.')
  expect(closed).toEqual(['agents-progress'])
  expect(opens).toHaveLength(2)
})
