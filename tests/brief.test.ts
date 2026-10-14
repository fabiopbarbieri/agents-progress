import { expect, mock, test } from 'claude-code/testing'

import { spawn } from './kit'

// The engine beneath, keeping the prompt each run was started with.
const recording = (on: Parameters<typeof mock.clock>[0]) => {
  const prompts: string[] = []
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('agent.spawn', async (_$, e) => {
    prompts.push(e.prompt)
    return { model: 'claude-haiku-5-5', agentId: `a-${e.description}` }
  })
  return prompts
}

test('every subagent is briefed to report its steps, once', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts = recording(on)
  await $.agent.spawn(spawn('1') as never)
  await $.agent.spawn({ ...spawn('2'), prompt: 'do it, and report with mcp__agents-progress__step' } as never)

  expect(prompts[0]).toStartWith('do it\n\nReport your progress with `mcp__agents-progress__step`')
  expect(prompts[1]).toBe('do it, and report with mcp__agents-progress__step')
})

test('stepBrief off leaves the prompts as written', { options: { stepBrief: 'off' } }, async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts = recording(on)
  await $.agent.spawn(spawn('1') as never)
  expect(prompts).toEqual(['do it'])
})
