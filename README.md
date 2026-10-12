# agents-progress

A local Claude Code mod, forked from [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) (MIT): a progress bar above the prompt and a live panel of subagents.

- **Agents panel** (`/agents-info` toggles it): opens by itself when any subagent starts, once per busy spell (a run started while none was running) or once per reported flow, so closing it sticks until then. Shows running, finished and planned subagents with model, effort, task progress, context, estimated cost and time.
- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something calls `progress`.
- **Tiers** color each run and pick its crab: an agent type named after a tier (`careful`, `plugin:careful`) wins; otherwise the model decides: Fable is `fable`, Opus is `heavy` at xhigh or max effort and `careful` below, Sonnet is `medium`, Haiku is `light`.

## Tools and skill

- `mcp__agents-progress__progress`: the delegating session reports the plan, phase and accepted tasks.
- `mcp__agents-progress__step`: a subagent reports its own steps (`done`, `total`, `note`). One that does not report shows its context fill in grey.
- Skill `agents-progress:reportar-progresso`: when and how to call both.

Cost is a rough estimate from token counts and the `PRICES` table in `hooks/register.tsx`, not a bill.

## Settings

`language`: `auto` (default), `en`, `pt` or `ru`. Set it in `/config`.

## Install (local)

```bash
claude plugin marketplace add /path/to/agents-progress
claude plugin install agents-progress@agents-progress-local
```

The marketplace is this folder and the entry's source is relative, so the session reads the plugin from here: edit, then `/reload-plugins`.
