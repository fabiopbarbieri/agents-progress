// The sample flow of the README's pictures: five planned tasks, two finished, two at work and
// one waiting. It prints each tree the mod draws as `@@<name>@@<json>` for render.py.
// build.sh runs it as tests/scene.test.ts in a scratch copy of the repo; named .ts here so
// `claude plugin test` leaves it out of the suite.

import { mock, test } from 'claude-code/testing'

import { BAND, PANE, engine, progress, spawn } from './kit'
import { render } from './layout'

declare const console: { log: (...a: unknown[]) => void }

const TASKS = [
  { title: 'Map the export code paths', tier: 'light', model: 'claude-haiku-5-5', effort: 'medium', tokens: [9000, 2500, 60000, 12000], steps: [4, 4, 'listed 6 entry points'], done: true },
  { title: 'Design the CSV writer', tier: 'careful', model: 'claude-opus-5-5', effort: 'high', tokens: [22000, 7000, 180000, 30000], steps: [5, 5, 'API agreed'], done: true },
  { title: 'Implement the CSV writer', tier: 'medium', model: 'claude-sonnet-5-5', effort: 'high', tokens: [30000, 11000, 260000, 40000], steps: [3, 6, 'streaming rows to disk'] },
  { title: 'Audit the upload limits', tier: 'heavy', model: 'claude-opus-5-5', effort: 'xhigh', tokens: [18000, 6000, 140000, 26000], steps: [2, 5, 'reading the size checks'] },
  { title: 'Document the export flags', tier: 'light' },
]

test('readme shot', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const models: Record<string, string> = {}
  for (const t of TASKS) if (t.model) models[t.title] = t.model
  engine(on, models)
  let usage: Record<string, unknown> = {}
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage }
  })
  await $.tool.call(progress({ title: 'Ship the CSV export', phase: 'delegate', tasks: TASKS.map(t => ({ title: t.title, tier: t.tier })) }))
  for (const t of TASKS) {
    if (!t.model) continue
    const id = `a-${t.title}`
    await $.agent.spawn({ ...spawn('x'), description: t.title, tool_use_id: `tu-${t.title}` } as never)
    const [i, o, cr, cc] = t.tokens!
    usage = { model: t.model, input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cc }
    for await (const _ of $.turn.step({ turnId: 't', index: 0, model: t.model, effort: t.effort, messageCount: 1, agentId: id } as never));
    const [done, total, note] = t.steps!
    await $.tool.call({ tool: 'mcp__agents-progress__step', done, total, note, agentId: id } as never)
    await clock.advance(t.done ? 95_000 : 140_000)
    if (t.done) await $.turn.complete({ agentId: id, reason: 'answer', answer: 'ok' } as never)
  }
  await $.tool.call(progress({ done: 2 }))

  const dump = async (name: string, surface: 'desktop' | 'terminal', req: any, cols?: number) => {
    const ui = await $.ui.mount({ plugin: 'agents-progress', surface, ...req })
    const tree = await ui.drawn()
    console.log(`@@${name}@@` + JSON.stringify(tree))
    if (cols) console.log(`@@${name}-text@@` + JSON.stringify(render(tree, cols)))
    await ui.unmount()
  }
  await dump('pane-desktop', 'desktop', { ...PANE, props: { ...PANE.props, bodyColumns: 56 } })
  await dump('band-desktop', 'desktop', { ...BAND, props: { ...BAND.props, bodyColumns: 84 } })
  await dump('pane-terminal', 'terminal', { ...PANE, props: { ...PANE.props, bodyColumns: 56 } }, 56)
  await dump('band-terminal', 'terminal', { ...BAND, props: { ...BAND.props, bodyColumns: 66 } }, 66)
})
