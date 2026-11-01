import { expect, mock, test } from 'claude-code/testing'

import { engine, PANE, progress, spawn } from './kit'

// One model request of run `task <id>`, at the effort the engine resolved for it.
const request = async ($: { turn: unknown }, id: string, effort: unknown) => {
  const stream = ($.turn as { step: (e: unknown) => AsyncIterable<unknown> }).step({
    turnId: 't',
    index: 0,
    model: 'claude-opus-5-5',
    ...(effort === undefined ? {} : { effort }),
    messageCount: 1,
    agentId: `a-task ${id}`,
  })
  for await (const _ of stream);
}

// turn.step carries the level the request ran at: the Agent call's effort, else
// CLAUDE_CODE_SUBAGENT_EFFORT (2.1.316), else the session's, as observed on 2.1.316.
test("a run's effort and tier follow the level each request ran at", async ($, on) => {
  mock.clock(on, { now: 1000 })
  engine(on, { 'task 1': 'claude-opus-5-5', 'task 2': 'claude-opus-5-5', 'task 3': 'claude-opus-5-5' })
  on('turn.step', async function* () {
    return {
      turnId: 't',
      index: 0,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { model: 'claude-opus-5-5', input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as never
  })
  for (const id of ['1', '2', '3']) await $.agent.spawn(spawn(id) as never)
  await request($, '1', 'medium')
  await request($, '2', 'xhigh')
  // A level the mod cannot name keeps the one seen before.
  await request($, '3', 'high')
  await request($, '3', 3)

  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5 medium \| careful/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5 xhigh \| heavy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5 high \| careful/ })).toBeDefined()
  await ui.unmount()

  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...PANE })
  const svg = (await desk.findAll({ type: 'Svg' })).map(s => String(s.props.source)).join('\n')
  expect(svg).toContain('Opus 5.5 · medium')
  expect(svg).toContain('Opus 5.5 · xhigh')
  await desk.unmount()
})

type Heavy = { release?: string; forced?: string; effort?: string }

// A flow planning `task 1` heavy and `task 2` careful, both run on Opus; each
// request reaches the engine at `effort` unless the mod raises it. Returns the
// effort each request was sent with, by run.
const heavyFlow = async ($: any, on: any, { release = '2.1.316', forced, effort = 'medium' }: Heavy = {}) => {
  mock.clock(on, { now: 1000 })
  engine(on, { 'task 1': 'claude-opus-5-5', 'task 2': 'claude-opus-5-5' })
  on('session.version', async () => ({ value: { version: release, base: release } }) as never)
  on('settings.read', async () => ({ value: {} }) as never)
  on('env.get', async (_$: unknown, e: { name: string }) => ({ value: e.name === 'CLAUDE_CODE_EFFORT_LEVEL' ? forced : undefined }) as never)
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.register', async (_$: unknown, e: { name: string }) => ({ value: { tool: `mcp__agents-progress__${e.name}` } }) as never)
  const sent: Record<string, unknown> = {}
  on('turn.step', async function* (_$: unknown, e: { agentId: string; effort?: unknown }) {
    sent[e.agentId] = e.effort
    return {
      turnId: 't',
      index: 0,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { model: 'claude-opus-5-5', input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as never
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
  await $.tool.call(progress({ title: 'Plan', phase: 'delegate', tasks: [{ title: 'task 1', tier: 'heavy' }, { title: 'task 2', tier: 'careful' }] }))
  for (const id of ['1', '2']) await $.agent.spawn(spawn(id) as never)
  await request($, '1', effort)
  await request($, '2', effort)
  return sent
}

test('a task planned heavy runs at xhigh, and reads heavy; the others keep their effort', async ($, on) => {
  const sent = await heavyFlow($, on)
  expect(sent).toEqual({ 'a-task 1': 'xhigh', 'a-task 2': 'medium' })
  const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5 xhigh \| heavy/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5 medium \| careful/ })).toBeDefined()
  await ui.unmount()
})

test('a heavy task already at max stays at max', async ($, on) => {
  expect((await heavyFlow($, on, { effort: 'max' }))['a-task 1']).toBe('max')
})

test('heavyEffort off leaves a heavy task at the effort Claude Code picked', { options: { heavyEffort: 'off' } }, async ($, on) => {
  expect((await heavyFlow($, on))['a-task 1']).toBe('medium')
})

test('an engine before 2.1.309 is not asked for another effort', async ($, on) => {
  expect((await heavyFlow($, on, { release: '2.1.308' }))['a-task 1']).toBe('medium')
})

test('CLAUDE_CODE_EFFORT_LEVEL forcing a level keeps a heavy task at it', async ($, on) => {
  expect((await heavyFlow($, on, { forced: 'high' }))['a-task 1']).toBe('medium')
})

test('CLAUDE_CODE_EFFORT_LEVEL auto still lets a heavy task rise', async ($, on) => {
  expect((await heavyFlow($, on, { forced: 'auto' }))['a-task 1']).toBe('xhigh')
})
