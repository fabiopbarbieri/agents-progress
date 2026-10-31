# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

agents-progress is a Claude Code mod: a progress band above the prompt and an agents pane (`/agents-info`). The README is the source of truth for user-facing behaviour, settings, install and SemVer rules. Keep it in step with every behaviour change.

## Checks

```bash
claude plugin validate . --strict
claude plugin test .              # every tests/*.test.ts, terminal and desktop surfaces
npx -p typescript@5 tsc -p .      # hooks/ and types/ only
```

- `claude plugin test` takes only a folder: there is no per-test or per-file filter, so the whole suite runs.
- `tsc` extends `.claude-plugin/types/tsconfig.json`, which Git ignores. The engine writes it only when an interactive session loads the mod from this folder (`claude --plugin-dir .`). A `claude -p` run does not write it, so `tsc` fails until the folder has been loaded once.
- To try a change live, add the clone as the marketplace, edit, then `/reload-plugins`.

## Architecture

All the code lives in one module, `hooks/register.tsx`, which `hooks/hooks.json` loads. It exports `register(on, options)`, which hooks engine events:

- `session.start`: picks the language, checks which engine APIs exist, re-arms the step-aside timer of a finished flow (a reload drops timers), and registers the two MCP tools (`progress`, `step`) through `$.tool.register`.
- `tool.call` on `progress` / `step` / `Workflow`: writes the flow, a run's self-reported steps, and a workflow run's name.
- `agent.spawn`, `turn.start`, `turn.step`, `turn.complete`: follow each subagent run: start or resume, live context, tokens, cost, end status. `agent.spawn` also appends `STEP_BRIEF` to the prompt and opens the pane once per flow or busy spell. A resume keeps its row. A workflow script's agents get no brief.
- `ui.render`: `Pane` (the pane), `AbovePrompt` (the band, stacked under any other plugin's band, which comes from `next(e)`), and `ToolUse` / `ToolResult` (an empty `Box` for successful `progress` / `step` calls).

**State** sits in the atoms at the top of the file, one per key. `types/index.d.ts` types it as `PluginState['agents-progress']`, and that contract is public: breaking it is a major release. Write through `patchFlow` / `patchAgents` (or the `same` check), because `update` redraws every reader even when the value is unchanged. Module-scope `lang` and `canView` are fine only because `session.start` sets them again on each reload.

**Two surfaces, two drawings.** The desktop draws each row as an SVG string (`rowSvg`, `agentSvg`, `headerSvg`, the crab costumes). The terminal draws the same rows as `Text`/`Box`, four rows per run. Branch on `e.surface !== 'terminal' && 'Svg' in ui`, since the terminal's resolver also returns the name `Svg`. A visual change usually needs both branches.

**Engine version gates.** The desktop app runs its own engine, which can lag behind the CLI. Gate a newer API with `engineSince($, [major, minor, patch])` (see `VIEW_SINCE`, `LISTED_SINCE`), and degrade quietly on older engines: hide the control, keep the old registration. Give the reason and the version in the commit body.

**Workflow runs** fold into a synthetic row whose id starts with `wf:` (`standIn`, `unitsOf`, `layout`). The band and the pane count a workflow once. `prune` caps the list at `MAX_RUNS` (200), and finished workflow agents leave first.

**Strings** live in `STRINGS` with `en`, `pt` and `ru`. Every new string needs all three.

Cost is an estimate from the `PRICES` table, and tiers come from `TIER_MODEL` / `tierOf`. Update both when a model family changes.

## Tests

`tests/kit.ts` stands in for the engine beneath the mod: `engine(on, models, below, opens)` places panes, answers spawns with `a-<description>` agent ids, and draws an optional band underneath. `spawn`, `finishRuns`, `progress`, `BAND` and `PANE` build the events and render requests. Tests import from `claude-code/testing` (`test`, `expect`, `mock.clock`), mount with `$.ui.mount({ plugin, surface, ...PANE })`, and look up elements with `ui.find`. They check hook output trees, not how a surface paints them. The fixtures are partial, which is why tests are not type-checked.

## Skill

`skills/reportar-progresso/SKILL.md` is written in pt-BR and set to `user-invocable: false`. It tells the delegating session when to call `progress`. A task's `title` must match the Agent `description` word for word, because that match is how the pane pairs runs with planned tasks. Keep it consistent with the tool schema in `session.start`.

## Commits and releases

- Messages use gitmoji plus a conventional type and scope (`✨ feat(pane): …`, `🐛 fix(mod): …`, `⚡ perf(band): …`, `📝 docs(skill): …`). The subject is lowercase and says what changed. The body says why, naming the Claude Code versions involved.
- A user-facing change adds its entry under `## [Unreleased]` in `CHANGELOG.md`.
- The release commit (`🔖 release: <version>, <summary>`) moves `version` in `.claude-plugin/plugin.json` and renames `[Unreleased]` to `[<version>] - <date>`. Then run `claude plugin tag . --push` and create a GitHub release from that section.
- `main` has a ruleset that blocks force-push and deletion. Direct pushes are allowed.
