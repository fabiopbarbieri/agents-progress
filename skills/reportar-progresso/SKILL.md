---
name: reportar-progresso
description: Reports delegated work to the agents-progress bar and panel through mcp__agents-progress__progress, and tells each subagent to report its own steps through mcp__agents-progress__step. Use when about to delegate two or more tasks to subagents (Agent tool), when planning a multi-step delegated job, or when the user asks to see progress of subagents.
---

# Reportar progresso

The agents panel opens by itself for any subagent and shows model, context, cost and time with no calls. These two tools add the plan and each task's own progress.

If a tool is listed only by name (deferred), load it first with ToolSearch (`select:mcp__agents-progress__progress,mcp__agents-progress__step`).

## As the session that delegates

Call `mcp__agents-progress__progress` at these moments. Fields left out keep their value.

1. After presenting the plan, before the first Agent call: `title` (a few words), `phase: "delegate"`, `tasks` in order.
   - Each task's `title` must equal the `description` you will pass to the Agent tool, word for word; that is how the panel matches a run to its task.
   - `tier` names the model the task runs on: `fable` = Fable, `heavy` = Opus for hard work, `careful` = Opus for delicate work, `medium` = Sonnet, `light` = Haiku.
   - `after` lists the numbers (from 1) of tasks it waits for.
2. Each time you accept a task's result: `done` with the count accepted so far.
3. On a phase change (`plan`, `design`, `delegate`, `review`, `close`) or a re-plan: `phase`, or the new `tasks`.
4. At the end: `finished: true`.

A single quick subagent needs none of this.

## In each brief you hand a subagent

Add this paragraph to the Agent prompt, so the panel shows the task's own bar instead of its context fill:

> Report your progress with `mcp__agents-progress__step`: right after reading this brief, call it with `total` (your plan in 3 to 8 steps) and `done: 0`; call it again with the new `done` and a short `note` as each step finishes.
