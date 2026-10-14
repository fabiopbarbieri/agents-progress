import type { On } from 'claude-code'

// What the Agent tool hands agent.spawn for a run described `task <id>`.
export const spawn = (id: string, type = 'general-purpose') => ({
  tool_use_id: `tu-${id}`,
  prompt: 'do it',
  description: `task ${id}`,
  subagentType: type,
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
})

// The engine beneath the plugin: panes always place, each run gets `a-<description>`
// on the model `models` names for it (Sonnet otherwise), a turn answers, and the
// band beneath is blank unless `below` draws one.
export const engine = (on: On, models: Record<string, string> = {}, below?: string): string[] => {
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('agent.spawn', async (_$, e) => ({ model: models[e.description] ?? 'claude-sonnet-5-5', agentId: `a-${e.description}` }))
  on('turn.complete', async (_$, e) => ({ text: e.answer ?? '' }) as never)
  on('ui.render', { component: 'AbovePrompt' }, async () =>
    (below === undefined ? { type: 'Box', props: {}, children: [] } : { type: 'Text', props: {}, children: [below] }) as never,
  )
  return opened
}

type Runs = {
  agent: { spawn: (e: never) => Promise<unknown> }
  turn: { complete: (e: never) => Promise<unknown> }
}

// Starts runs `task 1` to `task <n>`, then lets each answer.
export const finishRuns = async ($: Runs, n: number): Promise<void> => {
  for (let i = 1; i <= n; i++) await $.agent.spawn(spawn(String(i)) as never)
  for (let i = 1; i <= n; i++) await $.turn.complete({ agentId: `a-task ${i}`, reason: 'answer', answer: 'ok' } as never)
}

export const progress = (input: Record<string, unknown>) => ({ tool: 'mcp__agents-progress__progress', ...input }) as never

export const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, bodyColumns: 100 } } as const

export const PANE = {
  component: 'Pane',
  requestId: 'agents-progress',
  props: { title: 'Agents', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: undefined as never },
} as const
