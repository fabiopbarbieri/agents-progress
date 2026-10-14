# Changelog

All notable changes to agents-progress. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); see *Versioning* in the README.

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

[1.0.1]: https://github.com/fabiopbarbieri/agents-progress/releases/tag/agents-progress--v1.0.1
[1.0.0]: https://github.com/fabiopbarbieri/agents-progress/releases/tag/agents-progress--v1.0.0
