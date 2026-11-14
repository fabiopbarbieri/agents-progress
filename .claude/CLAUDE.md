# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

agents-progress is a Claude Code mod: a progress band above the prompt and an agents pane (`/agents-info`). The README is the source of truth for user-facing behaviour, settings, install and SemVer rules. Keep it in step with every behaviour change, and `README.pt-BR.md` in step with it: same sections, same facts. The pictures in `assets/` show the pane and the band for a sample flow: when either changes look, redraw them with `scripts/readme-images/build.sh`.

## Checks

```bash
claude plugin validate . --strict  # also type-checks hooks/ and tests/ from 2.1.323
claude plugin test .              # every tests/*.test.ts, terminal and desktop surfaces
npx -p typescript@5 tsc -p .      # hooks/ and types/ only
```

- From 2.1.323 `validate` type-checks `hooks/register.tsx` and `tests/*.test.ts` (with what they import) against the engine's bundled API types, without `.claude-plugin/types/`, and `--strict` fails on any type error. A test fixture must carry every prop the render site's type requires.
- Run `validate --strict` with Claude Code 2.1.323 or later. An older CLI does not know `engines` in `plugin.json`, warns "Unknown field 'engines'", and `--strict` fails on that warning (seen on 2.1.322); it still loads the mod.

- `claude plugin test` takes only a folder: there is no per-test or per-file filter, so the whole suite runs.
- `tsc` (not `validate`) extends `.claude-plugin/types/tsconfig.json`, which Git ignores. The engine writes it only when an interactive session loads the mod from this folder (`claude --plugin-dir .`). A `claude -p` run does not write it, so `tsc` fails until the folder has been loaded once.
- To try a change live, add the clone as the marketplace, edit, then `/reload-plugins`.

## Architecture

All the code lives in one module, `hooks/register.tsx`, which `hooks/hooks.json` loads. It exports `register(on, options)`, which hooks engine events:

- `session.start`: picks the language, checks which engine APIs exist, re-arms the step-aside timer of a finished flow (a reload drops timers), and registers the two MCP tools (`progress`, `step`) through `$.tool.register`.
- `tool.call` on `progress` / `step` / `Workflow`: writes the flow, a run's self-reported steps, and a workflow run's name.
- `agent.spawn`, `turn.start`, `turn.step`, `turn.complete`: follow each subagent run: start or resume, live context, tokens, cost, end status. `agent.spawn` also appends `STEP_BRIEF` to the prompt and opens the pane once per flow or busy spell. A resume keeps its row. A workflow script's agents get it too from Claude Code 2.1.300 (`WF_BRIEF_SINCE`), unless `stepBrief` is `agents`. The brief names ToolSearch only where `step` is not listed (`LISTED_SINCE`). `agent.spawn` keeps the tier of the planned task a run matched (`plannedTier`), and `turn.step` sends each request of a `heavy` one at xhigh (`RAISE_SINCE`, the `heavyEffort` setting), standing aside while `CLAUDE_CODE_EFFORT_LEVEL` forces a level.
- `ui.render`: `Pane` (the pane), `AbovePrompt` (the band, stacked under any other plugin's band, which comes from `next(e)`), and `ToolUse` / `ToolResult` (an empty `Box` for successful `progress` / `step` calls).

**State** sits in the atoms at the top of the file, one per key. `types/index.d.ts` types it as `PluginState['agents-progress']`, and that contract is public: breaking it is a major release. Write through `patchFlow` / `patchAgents` (or the `same` check), because `update` redraws every reader even when the value is unchanged. Module-scope `lang` and `canView` are fine only because `session.start` sets them again on each reload.

**Two surfaces, two drawings.** The desktop draws each row as an SVG string (`rowSvg`, `agentSvg`, `headerSvg`, the crab costumes). The terminal draws the same rows as `Text`/`Box`, four rows per run. Branch on `e.surface !== 'terminal' && 'Svg' in ui`, since the terminal's resolver also returns the name `Svg`. A visual change usually needs both branches.

**Engine version gates.** The desktop app runs its own engine, which can lag behind the CLI. `engines["claude-code"]` in `plugin.json` is the floor (`>=2.1.286`: mods run from 2.1.286 in the desktop app, 2.1.287 in the terminal); the gates cover what is newer. Claude Code reads that range only from 2.1.323 and compares its own version, so the floor never keeps an older engine (the desktop app's included) from loading the mod; do not raise it to a feature's version. Gate a newer API with `engineSince($, [major, minor, patch])` (see `VIEW_SINCE`, `LISTED_SINCE`, `WF_BRIEF_SINCE`, `RAISE_SINCE`), and degrade quietly on older engines: hide the control, keep the old registration. Give the reason and the version in the commit body.

**Workflow runs** fold into a synthetic row whose id starts with `wf:` (`standIn`, `unitsOf`, `layout`). The band and the pane count a workflow once. `prune` caps the list at `MAX_RUNS` (200), and finished workflow agents leave first. The desktop app 4.4212.0 (engine 2.1.309) offers no `Workflow` tool, so workflow runs can be tried only in the CLI.

**Prompt covered.** `Pane`'s `isPromptCovered` (2.1.323, sent only when true) says a dialog, or a field above the prompt while the pane is not focused, covers the prompt. It needs no gate: older engines leave it out. The terminal's `?` help then swaps `keysWhen` for `keysWhenCovered` (focus the pane once the prompt is free); the desktop draws no keys.

**Strings** live in `STRINGS` with `en`, `pt` and `ru`. Every new string needs all three.

Cost is an estimate from the `PRICES` table, and tiers come from `TIER_MODEL` / `tierOf`. Update both when a model family changes.

## Tests

`tests/kit.ts` stands in for the engine beneath the mod: `engine(on, models, below, opens)` places panes, answers spawns with `a-<description>` agent ids, and draws an optional band underneath. `spawn`, `finishRuns`, `progress`, `BAND` and `PANE` build the events and render requests. Tests import from `claude-code/testing` (`test`, `expect`, `mock.clock`), mount with `$.ui.mount({ plugin, surface, ...PANE })`, and look up elements with `ui.find`. They check hook output trees, not how a surface paints them. `validate` type-checks the tests from 2.1.323, so `BAND` and `PANE` carry every prop of their render site (`scroll`, `view`, `maxRows`, …) even where the mod ignores it; spread them and override a prop instead of writing props inline. `Pane`'s `isPromptCovered` is typed `true` or absent: pass `true as const`, never `false`. The host has timers but no typings for them: use `settle()` from the kit, not `setTimeout`.

`tests/layout.ts` lays a terminal tree out in text (`render(tree, columns)`), so a test can read what a pane of that width shows: a framed `Button` keeps its width, a `Box` or `Text` gives way, `truncate-end` cuts with `…`, and the rest is clipped at the edge. It was checked against the 2.1.316 terminal, not guaranteed by the engine.

## Skill

`skills/reportar-progresso/SKILL.md` is written in pt-BR and set to `user-invocable: false`. It tells the delegating session when to call `progress`. A task's `title` must match the Agent `description` word for word, because that match is how the pane pairs runs with planned tasks. Keep it consistent with the tool schema in `session.start`.

## Commits and releases

- Messages use gitmoji plus a conventional type and scope (`✨ feat(pane): …`, `🐛 fix(mod): …`, `⚡ perf(band): …`, `📝 docs(skill): …`). The subject is lowercase and says what changed. The body says why, naming the Claude Code versions involved.
- A user-facing change adds its entry under `## [Unreleased]` in `CHANGELOG.md`.
- The release commit (`🔖 release: <version>, <summary>`) moves `version` in `.claude-plugin/plugin.json` and renames `[Unreleased]` to `[<version>] - <date>`. Then run `claude plugin tag . --push` and create a GitHub release from that section.
- `main` has a ruleset that blocks force-push and deletion. Direct pushes are allowed.
