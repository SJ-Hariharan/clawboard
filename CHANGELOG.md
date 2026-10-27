# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-28

First public release.

### Added

- **Crab Crew:** a crab for the main agent and one per real subagent, with six states (exploring, coding, debugging, testing, waiting, finished) driven by tool calls, turn events and permission prompts. Per-crab task, activity, modified files, token counts and latest result. A live timeline with plain-English summaries, filters, counters and the task list.
- **The Tide:** context-window use, five-hour and weekly limits with reset times, session cost, tokens per turn and per agent, a context breakdown by category and a usage history kept across sessions. Unreported values are shown as unavailable.
- **The Burrow:** a project scan that detects the tech stack from manifests and config, groups files into architecture layers, draws the relationships from import statements (JavaScript, TypeScript, Vue, Svelte, Python) and explains each component on request.
- **Under the Shell:** explanations of changes and decisions at three levels, and generated lessons with quizzes saved per project.
- **Crab House:** rename, reorder and hide workspaces, compact or decorative layout, three colony layouts, reduced motion, idle animations, and crab names, colors, shells, hats, skins and animations.
- Automatic opening: the panel is requested at session start and when a desktop, VS Code or mobile client attaches, and it also opens on the person's first message of a session. It does not reopen by itself after the person closes it, and a Crab House switch (on by default) turns automatic opening off. The terminal never opens it by itself.
- `/clawboard` (open), `/clawboard close`, `/clawboard toggle`, `/clawboard scan` and `/clawboard reset` commands. `/clawboard` runs immediately, even while Claude is in the middle of a turn.
- Tests, README artwork generators and a GitHub Actions workflow.

### Known limitations

- Crabs are selected with buttons under the scene, not by clicking the picture.
- Import relationships exist for JavaScript, TypeScript, Vue, Svelte and Python only.
- Tested on the desktop and terminal surfaces only, and on macOS only.
- The panel has not been captured in a real screenshot yet.
- Claude Code only draws a panel a mod opens by itself on a wide window (144 terminal columns, or 110 once the person has opened it from this mod), so on a narrow window the panel appears at the first message.

[0.1.0]: https://github.com/SJ-Hariharan/clawboard/releases/tag/v0.1.0
