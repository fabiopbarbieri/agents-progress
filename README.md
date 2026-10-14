# agents-progress

A local Claude Code mod, forked from [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) (MIT): a progress bar above the prompt and a live panel of subagents.

- **Agents panel** (`/agents-info` toggles it): opens by itself when any subagent starts, once per busy spell (a run started while none was running) or once per reported flow, so closing it sticks until then. Shows running, the latest ten finished and planned subagents with model, effort, task progress, context, estimated cost and time; the totals count every run.
- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something calls `progress`, sits under any other plugin's band, and steps aside 10 seconds after the flow is reported finished.
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

## Checks

```bash
claude plugin validate . --strict
claude plugin test .
npx -p typescript@5 tsc -p .
```

`claude plugin test` runs `tests/*.test.ts` against the engine's own host, on the terminal and desktop surfaces; `tests/kit.ts` stands for the engine beneath the mod. It checks the hooks and the trees they return, not how a surface paints them.

`tsc` reads the API types the engine lays in `.claude-plugin/types/` (ignored by Git) when an interactive session loads the mod from its folder, as `claude --plugin-dir .` does; a `claude -p` run does not lay them. Tests stay out of it, as their fixtures are partial.
