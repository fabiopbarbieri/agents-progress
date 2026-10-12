import { expect, mock, test } from 'claude-code/testing'

const spawn = (id: string, type: string) => ({
  tool_use_id: `tu-${id}`,
  prompt: 'do it',
  description: `task ${id}`,
  subagentType: type,
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
})

test('any subagent opens the panel once per busy spell', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('agent.spawn', async (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.description}` }))
  on('turn.complete', async (_$, e) => ({ text: e.answer ?? '' }) as never)

  await $.agent.spawn(spawn('1', 'general-purpose') as never)
  expect(opened).toEqual(['agents-progress'])

  // A second run while the first still runs: same spell, no reopen.
  await $.agent.spawn(spawn('2', 'Explore') as never)
  expect(opened.length).toBe(1)

  // Both finish; the next run starts a new spell and opens again.
  for (const id of ['a-task 1', 'a-task 2']) {
    await $.turn.complete({ agentId: id, reason: 'answer', answer: 'ok' } as never)
  }
  await $.agent.spawn(spawn('3', 'general-purpose') as never)
  expect(opened.length).toBe(2)
})

test('a run with no tier in its type takes the tier of its model', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  const models: Record<string, string> = {
    'task 1': 'claude-sonnet-5-5',
    'task 2': 'claude-haiku-5-5',
    'task 3': 'claude-fable-5-1',
    'task 4': 'claude-opus-5-5',
  }
  on('agent.spawn', async (_$, e) => ({ model: models[e.description] ?? '', agentId: `a-${e.description}` }))
  for (const id of ['1', '2', '3', '4']) await $.agent.spawn(spawn(id, 'general-purpose') as never)

  const ui = await $.ui.mount({
    plugin: 'agents-progress',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agents-progress',
    props: { title: 'Agents', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: undefined as never },
  })
  expect(await ui.find({ type: 'Text', text: /medium · Sonnet 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /light · Haiku 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /fable · Fable 5\.1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /careful · Opus 5\.5/ })).toBeDefined()
  await ui.unmount()
})
