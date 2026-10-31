# Changelog

All notable changes to agents-progress. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); see *Versioning* in the README.

## [1.4.0] - 2026-10-31

### Fixed

- Pressing a run opens its transcript again. The press read the tasks list before asking for the view, and Claude Code refused the view as `not person-initiated` once the press had been awaited past. The view is now asked first, and the tasks list is read only to explain a refusal.

## [1.3.0] - 2026-10-17

### Added

- A simple view on the terminal: the pane's `[ ○ ]` button (`s`) draws each run and planned task without its grey rows, leaving the name, status and bar. `[ ● ]` brings them back. The choice is kept in `panel.isSimple`.
- A `[ ? ]` at the top left of the terminal's pane, on one row with the totals and the buttons, lists its keys (`s`, `c`, `f`, `e`, `m`, `Esc`) under the header, and hides them again. The buttons and their keys stay where they were. Kept in `panel.isHelpShown`.

### Changed

- On the terminal, a run's second row reads model, effort, then tier (`Opus 5.5 high | careful`), the tier named in the panel's language (`cuidadoso`, `тщательный`). Its last row drops the `ctx` label before the context share.
- On the terminal the pane's buttons are framed (`[ − ]`, `[ ▾ Finished (3) ]`) instead of plain, so their keys stay without a `c:` prefix before each label; collapse and expand read `−` and `+`.
- The pane's sections give their count in parentheses: `Running (1)`, `Finished (3)`, `Planned (2)`.

## [1.2.0] - 2026-10-16

### Added

- A workflow run (the Workflow tool) is one row in the pane, named after the workflow: its agents answered out of started as the bar, with their summed tokens, cost and time. Its `▸` button (the title on the terminal) opens its agents beneath it, runs they started included. The band counts the run once, and the pane opens once per run. Since Claude Code 2.1.292 `agent.spawn` raises a workflow's agents, and each one showed as a loose run.
- A run that answered and is woken again (a message to it, a teammate's turn) shows as running from the start of its new turn, not only once its first model request returns (Claude Code 2.1.299).

### Changed

- A workflow's agents keep the prompts their script wrote: the step brief is no longer added to them.
- Past the 200 runs the session keeps, finished workflow agents leave before any other run.
- From Claude Code 2.1.293, `mcp__agents-progress__step` is listed from the first prompt (`isDeferred: false`), so a subagent reports its steps without a ToolSearch round first. `progress` stays behind tool search.

## [1.1.3] - 2026-10-15

### Changed

- The band no longer draws the orange `▣` before the crew button.

### Fixed

- Pressing a run that had ended more than about 30 seconds before said `no agent under that id`: Claude Code drops a finished subagent from its tasks list then, and `$.ui.view` finds only the ones still there. A run is pressable only while `$.agent.list()` holds it (the run in view keeps its way back), the pane redraws once the list lets a run go, and a press on a run let go in between says why in the panel's language.

## [1.1.2] - 2026-10-15

### Fixed

- On an engine before Claude Code 2.1.300, as the desktop app's own can be, a run's `View` button (the title on the terminal) did nothing and said nothing, as `$.ui.view` is not there: the pane now draws no such press, and the desktop row takes the button's room.
- The totals' time ran from the session's first run to its last, idle spells between flows included (5:17 for a few seconds of work): it now counts the time some run was at work, runs side by side once.

## [1.1.1] - 2026-10-14

### Fixed

- A resumed run (a parent woken when its background child answers) kept its row but read as a new one: `round 2`, its clock, tokens, cost and steps started over, and its waking message got the step brief again. It now carries on in its row as it was, and its prompt goes as sent.
- A run that answered before reporting its last step read `100% · 2/3`: it now reads `100% · 3/3`. A failed run keeps the count it reached.

## [1.1.0] - 2026-10-14

### Added

- Pressing a run in the pane puts its transcript in the main view (`$.ui.view`, Claude Code 2.1.300), and on the run in view brings the main conversation back; a `↩ Main conversation` button (`m`) shows while a run is in view, and the run in view is marked. A refused view says why in a toast.
- A run another subagent started is drawn right under it, indented (`AgentRun.parentId`).
- Hotkeys for the pane's toggles while it is focused: `c` collapse, `f` finished, `e` earlier.
- `Esc` closes the pane, from the pane or from an idle, empty prompt.
- The `progress` and `step` calls draw no row in the transcript, as the band and the pane already show what they report; a call that failed still shows.

### Changed

- On the terminal a run's bar row holds the bar and the task's steps, and its context, tokens, cost and time take the row below, so a step's note no longer cuts them. The desktop row is unchanged.
- On the desktop each run's drawing leaves room beside it for its `View` button.

### Fixed

- `/agents-info` said `closed` and drew nothing when the pane had opened by itself on a terminal too narrow to draw it, or sat behind another pane's tab: it closes only a pane in sight, and opens any other.

## [1.0.1] - 2026-10-14

### Changed

- The marketplace is named `agents-progress`, so the plugin installs as `agents-progress@agents-progress`. An install of 1.0.0 (`agents-progress@agents-progress-local`) is removed and installed again: `claude plugin uninstall agents-progress@agents-progress-local`, `claude plugin marketplace remove agents-progress-local`, then the install below.

### Documentation

- The README installs with one line at the prompt, `/plugin install agents-progress --marketplace fabiopbarbieri/agents-progress`, keeps the shell commands as the other way, and says the options are optional and how the desktop app gets the mod.

## [1.0.0] - 2026-10-14

First release, forked from [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) 1.2.0.

### Added

- Every subagent's prompt asks it to report its steps through `mcp__agents-progress__step`; the `stepBrief` option turns it off.
- The pane keeps the session's runs across flows; only runs started since a flow began count as its tasks.
- A `+N earlier` button opens the finished runs past the latest ten.
- A run that reports its steps shows its task's percentage (`40% · 2/5 · note`).
- Tests for flows, re-plans, steps, cost, failures, language, the band and the pane on the terminal and desktop surfaces; `tsconfig.json` for `tsc`.

### Changed

- The skill `reportar-progresso` is in Portuguese, is loaded by Claude before every delegation and is out of the `/` menu.
- The pane draws the latest ten finished runs; the totals still count every run.
- The band's label reads `Tarefas em execução: N` when no total is planned.

### Fixed

- The band draws its bar as text on the terminal.
- The running count follows the runs' own status, so background subagents count.
- The band keeps other plugins' bands and steps aside 10 seconds after a flow finishes.
- A run whose requests went unseen sums missing usage fields as zero.
- A failed auto-open of the pane is tried again by the next run.

### Performance

- Pane rows are about 44% smaller and carry only the animation rules of walking crabs; a pane of 200 runs redraws about 52 KB instead of 2 MB.
- The band's bar twinkles in four paths instead of up to ~1350 rects, and only while runs work.
- State is written only when it changes, and the one-second ticker runs only while a run works.

[1.1.1]: https://github.com/fabiopbarbieri/agents-progress/releases/tag/agents-progress--v1.1.1
[1.1.0]: https://github.com/fabiopbarbieri/agents-progress/releases/tag/agents-progress--v1.1.0
[1.0.1]: https://github.com/fabiopbarbieri/agents-progress/releases/tag/agents-progress--v1.0.1
[1.0.0]: https://github.com/fabiopbarbieri/agents-progress/releases/tag/agents-progress--v1.0.0
