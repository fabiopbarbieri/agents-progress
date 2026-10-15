import { expect, test } from 'claude-code/testing'

import { engine } from './kit'

const row = (component: 'ToolUse' | 'ToolResult', tool: string, isErrored = false) => ({
  plugin: 'agents-progress',
  surface: 'terminal' as const,
  component,
  requestId: 'tu-1',
  props:
    component === 'ToolUse'
      ? { tool_use_id: 'tu-1', tool, input: {}, isRunning: false, isErrored, isInterrupted: false, output: 'ok' }
      : { tool_use_id: 'tu-1', tool, output: 'ok', isErrored },
})

// An empty Box: the row takes no line.
const empty = (el: { type: string; children?: unknown[] }): boolean => el.type === 'Box' && !el.children?.length

test("the mod's own calls draw no row in the transcript, unless they failed", async ($, on) => {
  engine(on)
  // The engine's own rows, beneath the mod.
  const own = async () => ({ type: 'Text', props: {}, children: ['row'] }) as never
  on('ui.render', { component: 'ToolUse' }, own)
  on('ui.render', { component: 'ToolResult' }, own)
  for (const component of ['ToolUse', 'ToolResult'] as const) {
    for (const tool of ['mcp__agents-progress__progress', 'mcp__agents-progress__step']) {
      const quiet = await $.ui.mount(row(component, tool) as never)
      expect(empty(await quiet.drawn())).toBe(true)
      await quiet.unmount()
      const failed = await $.ui.mount(row(component, tool, true) as never)
      expect(empty(await failed.drawn())).toBe(false)
      await failed.unmount()
    }
    const other = await $.ui.mount(row(component, 'Bash') as never)
    expect(empty(await other.drawn())).toBe(false)
    await other.unmount()
  }
})
