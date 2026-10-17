export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  phase: Phase
  isFinished: boolean
  /** When the flow began; runs from before it are not its tasks. */
  startedAt?: number
  /** When the flow was reported finished; its band steps aside a little after. */
  finishedAt?: number
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** The agentId of the subagent that started this one; absent when the main loop did. */
  parentId?: string
  /** Set when a workflow script's `agent()` started it: its run and place in it, from 1. */
  workflow?: { runId: string; index: number }
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  /** The terminal draws each run without its grey rows; absent in a panel held from before. */
  isSimple?: boolean
  /** Every finished run drawn, not only the latest ten; absent in a panel held from before. */
  isEarlierShown?: boolean
  autoOpenedFor: string
  /** Workflow runs drawn with their agents beneath; the rest show as one row. */
  openGroups?: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'agents-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      /** Each workflow run's name, by run id, as the Workflow tool answered it. */
      workflows: Record<string, string>
    }
  }
}
