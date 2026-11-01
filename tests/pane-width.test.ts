import { expect, mock, test } from 'claude-code/testing'

import { PANE, engine, progress, spawn } from './kit'
import { render } from './layout'

// Since Claude Code 2.1.305 a docked pane stays within 45% of the terminal, 24 columns
// at least: 48 at 110 columns, 53 at 120, 70 from 160. Inline it takes the terminal
// less its frame: 76 at 80 columns, 96 at 100.
const WIDTHS = [24, 32, 40, 48, 53, 70, 76, 96]

const at = (w: number) => ({ ...PANE, props: { ...PANE.props, bodyColumns: w } })

// A flow with a long name, and a run that has reported steps and spent tokens.
const scene = async ($: any, on: any) => {
  mock.clock(on, { now: 1000 })
  engine(on, { 'task 1': 'claude-opus-5-5' })
  on('turn.step', async function* () {
    return {
      turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn',
      usage: { model: 'claude-opus-5-5', input_tokens: 30000, output_tokens: 9000, cache_read_input_tokens: 400000, cache_creation_input_tokens: 50000 },
    }
  })
  await $.tool.call(progress({ title: 'Review the agents pane width', phase: 'delegate', tasks: [{ title: 'task 1', tier: 'careful' }] }))
  await $.agent.spawn(spawn('1'))
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a-task 1' }));
  await $.tool.call({ tool: 'mcp__agents-progress__step', done: 2, total: 5, note: 'reading hooks/register.tsx', agentId: 'a-task 1' })
}

test('at every width a pane takes, the header keeps its buttons whole, a cell after the totals', async ($, on) => {
  await scene($, on)
  for (const w of WIDTHS) {
    const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...at(w) })
    const [header] = render(await ui.drawn(), w)
    expect({ w, header }).toEqual({ w, header: expect.stringMatching(/^\[ \? \] .*\S +\[ ○ \] \[ − \]$/) })
    await ui.press({ key: 'compact' })
    const [compact] = render(await ui.drawn(), w)
    expect({ w, compact }).toEqual({ w, compact: expect.stringMatching(/^\[ \? \] .*\S +\[ \+ \]$/) })
    await ui.press({ key: 'compact' })
    await ui.unmount()
  }
})

test("the header drops the flow's name before its totals, then the totals narrow", async ($, on) => {
  await scene($, on)
  const header = async (w: number) => {
    const ui = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...at(w) })
    const [line] = render(await ui.drawn(), w)
    await ui.unmount()
    return line
  }
  expect(await header(96)).toMatch(/^\[ \? \] Review the agents pane width ≈\$0\.63 · 489k tokens · 0:00 +\[ ○ \]/)
  // The name keeps the full totals while it has 12 cells, then takes the shorter ones.
  expect(await header(70)).toMatch(/^\[ \? \] Review the agents pane … ≈\$0\.63 · 489k tokens · 0:00 \[ ○ \]/)
  expect(await header(53)).toMatch(/^\[ \? \] Review the ag… ≈\$0\.63 · 489k · 0:00 \[ ○ \]/)
  // Fewer cells than that: the name goes (the band names the flow), the totals stay whole.
  expect(await header(48)).toMatch(/^\[ \? \] ≈\$0\.63 · 489k tokens · 0:00 +\[ ○ \]/)
  expect(await header(40)).toMatch(/^\[ \? \] ≈\$0\.63 · 489k · 0:00 +\[ ○ \]/)
  expect(await header(32)).toMatch(/^\[ \? \] ≈\$0\.63 · 0:00 +\[ ○ \]/)
  expect(await header(24)).toBe('[ ? ] ≈$0.63 [ ○ ] [ − ]')
})

test("a narrow run row drops the context's tokens before the time", async ($, on) => {
  await scene($, on)
  const wide = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...at(76) })
  expect(await wide.find({ type: 'Text', text: /^ {2}49% · 489k · ≈\$0\.63 · 0:00$/ })).toBeDefined()
  await wide.unmount()
  const narrow = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...at(24) })
  expect(await narrow.find({ type: 'Text', text: /^ {2}49% · ≈\$0\.63 · 0:00$/ })).toBeDefined()
  // The bar keeps its steps; the step's note is what gives way.
  const rows = render(await narrow.drawn(), 24)
  expect(rows).toContain('  ██░░░░ 40% · 2/5 · re…')
  await narrow.unmount()
})

test('the simple view keeps the rows a narrow pane cuts, and the desktop is unchanged', async ($, on) => {
  await scene($, on)
  const term = await $.ui.mount({ plugin: 'agents-progress', surface: 'terminal', ...at(48) })
  await term.press({ key: 'simple' })
  const rows = render(await term.drawn(), 48)
  expect(rows).toContain('▣ task 1 ●')
  expect(rows.some(r => /^ {2}█+░+ 40% · 2\/5 · reading/.test(r))).toBe(true)
  await term.unmount()
  const desk = await $.ui.mount({ plugin: 'agents-progress', surface: 'desktop', ...at(48) })
  expect(String((await desk.findAll({ type: 'Svg' }))[0]?.props.alt)).toMatch(/^Review the agents pane width: ≈\$0\.63, 489k tokens, 0:00$/)
  await desk.unmount()
})
