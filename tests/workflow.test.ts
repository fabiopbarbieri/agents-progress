import { expect, mock, test } from 'claude-code/testing'

import { BAND, PANE, engine, progress, spawn } from './kit'

// What agent.spawn gets from a workflow script's `agent()`, the `n`th of run `runId`.
const wfSpawn = (runId: string, n: number) => ({
  ...spawn(`${runId}.${n}`),
  tool_use_id: `tu-${runId}`,
  workflow: { runId, agentIndex: n },
})

// The engine beneath: the Workflow tool answers as a launched run named `name`.
const workflowTool = (on: Parameters<typeof mock.clock>[0], runId: string, name: string) =>
  on('tool.call', { tool: 'Workflow' }, async () =>
    ({ result: { status: 'async_launched', taskId: 't-1', runId, workflowName: name } }) as never,
  )

test('a workflow agent keeps the prompt its script wrote', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('agent.spawn', async (_$, e) => {
    prompts.push(e.prompt)
    return { model: 'claude-haiku-5-5', agentId: `a-${e.description}` }
  })
  await $.agent.spawn(wfSpawn('wf_1', 1) as never)
  expect(prompts).toEqual(['do it'])
})

test('a workflow run is one row, named by the Workflow tool, its agents opening beneath it', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  workflowTool(on, 'wf_1', 'Review')
  await $.tool.call({ tool: 'Workflow', name: 'review' } as never)
  await $.agent.spawn(spawn('solo') as never)
  for (const n of [1, 2, 3]) await $.agent.spawn(wfSpawn('wf_1', n) as never)
  await $.turn.complete({ agentId: 'a-task wf_1.1', reason: 'answer', answer: 'ok' } as never)

  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Text', text: /Running · 2/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /Review/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /workflow · 3 agents/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /33% · 1\/3 · 2 running/ })).toBeDefined()
  expect(await term.findAll({ type: 'Text', text: /^task wf_1\.\d$/ })).toHaveLength(0)

  await term.press({ key: 'open-wf:wf_1' })
  expect((await term.findAll({ type: 'Text', text: /^task wf_1\.\d$/ })).map(t => t.text)).toEqual([
    'task wf_1.1',
    'task wf_1.2',
    'task wf_1.3',
  ])
  await term.press({ key: 'open-wf:wf_1' })
  expect(await term.findAll({ type: 'Text', text: /^task wf_1\.\d$/ })).toHaveLength(0)
  await term.unmount()

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...PANE })
  const rows = (await desk.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(rows).toContain('Review: workflow, 1/3 agents, running')
  expect(await desk.find({ type: 'Button', key: 'open-wf:wf_1' })).toMatchObject({ props: { label: '▸ 3' } })
  await desk.unmount()
})

test('a run a workflow agent started stays with its run', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(wfSpawn('wf_1', 1) as never)
  await $.agent.spawn({ ...spawn('child'), parentAgentId: 'a-task wf_1.1' } as never)

  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Text', text: /workflow · 2 agents/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: 'task child' })).toBeUndefined()
  await term.unmount()
})

test('the band counts a workflow run once', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.tool.call(progress({ title: 'Probe', phase: 'delegate' }))
  for (const n of [1, 2, 3, 4]) await $.agent.spawn(wfSpawn('wf_1', n) as never)
  await $.agent.spawn(spawn('solo') as never)
  expect(await $.tool.call(progress({}))).toEqual({ result: 'ok: Tasks running: 2' })

  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Button', key: 'agents-pane' })).toMatchObject({ props: { label: '×2' } })
  await ui.unmount()
})

test('past the cap, finished workflow agents leave before any other run', async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on)
  await $.agent.spawn(spawn('solo') as never)
  for (let n = 1; n <= 200; n++) {
    await $.agent.spawn(wfSpawn('wf_1', n) as never)
    await $.turn.complete({ agentId: `a-task wf_1.${n}`, reason: 'answer', answer: 'ok' } as never)
  }
  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await term.find({ type: 'Text', text: 'task solo' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /workflow · 199 agents/ })).toBeDefined()
  await term.unmount()
})
