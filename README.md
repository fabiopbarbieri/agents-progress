# agents-progress

A Claude Code mod, forked from [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) (MIT): a progress bar above the prompt and a live panel of subagents.

- **Agents panel** (`/agents-info` toggles it): opens by itself when any subagent starts, once per busy spell (a run started while none was running) or once per reported flow, so closing it sticks until then. Shows the session's subagents, across flows: running, the latest ten finished (a `+N earlier` button opens the rest) and the planned ones, with model, effort, task progress (percent and steps, once the run reports them), context, estimated cost and time; the totals count every run.
- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something calls `progress`, sits under any other plugin's band, and steps aside 10 seconds after the flow is reported finished.
- **Tiers** color each run and pick its crab: an agent type named after a tier (`careful`, `plugin:careful`) wins; otherwise the model decides: Fable is `fable`, Opus is `heavy` at xhigh or max effort and `careful` below, Sonnet is `medium`, Haiku is `light`.

## Tools and skill

- `mcp__agents-progress__progress`: the delegating session reports the plan, phase and accepted tasks.
- `mcp__agents-progress__step`: a subagent reports its own steps (`done`, `total`, `note`). The mod adds a paragraph asking for it to every subagent's prompt; a run that does not report shows its context fill in grey.
- Skill `agents-progress:reportar-progresso`: Claude loads it before any delegation to report the plan and each accepted task. It is not in the `/` menu.

Cost is a rough estimate from token counts and the `PRICES` table in `hooks/register.tsx`, not a bill.

## Settings

Set them in `/config`.

- `language`: `auto` (default), `en`, `pt` or `ru`.
- `stepBrief`: `on` (default) briefs every subagent to report its steps; `off` leaves prompts as written. Each report is one more model request in the subagent.

## Install

```bash
claude plugin marketplace add fabiopbarbieri/agents-progress
claude plugin install agents-progress@agents-progress-local
```

To work on it, add your clone as the marketplace instead (`claude plugin marketplace add <path to the clone>`): the entry's source is relative, so the session reads the plugin from that folder. Edit, then `/reload-plugins`.

## Checks

```bash
claude plugin validate . --strict
claude plugin test .
npx -p typescript@5 tsc -p .
```

`claude plugin test` runs `tests/*.test.ts` against the engine's own host, on the terminal and desktop surfaces; `tests/kit.ts` stands for the engine beneath the mod. It checks the hooks and the trees they return, not how a surface paints them.

`tsc` reads the API types the engine lays in `.claude-plugin/types/` (ignored by Git) when an interactive session loads the mod from its folder, as `claude --plugin-dir .` does; a `claude -p` run does not lay them. Tests stay out of it, as their fixtures are partial.

## Versioning

[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html), with `version` in `.claude-plugin/plugin.json` as the one source:

- **Major**: a change that breaks what others rely on: the tools' inputs or answers, the `$.state` contract in `types/index.d.ts`, a `userConfig` option removed or renamed, the `/agents-info` command.
- **Minor**: a feature that keeps all of that working.
- **Patch**: a fix, a performance gain or a docs change.

To release: move `version`, add its section to `CHANGELOG.md`, commit, then `claude plugin tag . --push` (tag `agents-progress--v<version>`) and a GitHub release from that section.
