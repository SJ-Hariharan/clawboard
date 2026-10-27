# Clawboard 0.1.0

The first release. Clawboard is a side panel for Claude Code that turns your session into a crab colony: each crab is a real agent, and the panel keeps activity, usage and project structure in view.

## What is in it

- **Crab Crew:** a crab for Claude and one for each real subagent, with six states driven by tool calls, turn events and permission prompts; each crab's task, activity, modified files and latest result; a live timeline with plain-English summaries.
- **The Tide:** context-window use, five-hour and weekly limits with reset times, session cost, tokens per turn and per agent, and a usage history that survives restarts.
- **The Burrow:** a project architecture diagram from your files and imports, the detected tech stack with explanations, and a view of each component.
- **Under the Shell:** explanations at three levels, plus lessons and quizzes saved per project.
- **Crab House:** rename, reorder and hide workspaces; compact or decorative layout; reduced motion; crab names, colors, shells, hats, skins and animations; a switch for the panel opening by itself.
- **Opening:** the panel is requested at session start and when a desktop, VS Code or mobile client attaches, and opens on your first message. `/clawboard` (also `close`, `toggle`, `scan`, `reset`) runs immediately, even mid-turn.

## What was checked

- `claude plugin validate .` passes, with one informational note: the types file declares state but no new `$` noun, which is expected.
- `claude plugin test .`: 28 tests pass. They mount every workspace on the desktop and terminal surfaces against a mocked engine, and cover tool-to-state mapping, the project scan, the artwork, unavailable usage limits, subagent crabs, settings and lesson persistence, the `/clear` reset, the panel opening by itself while respecting a manual close and the off switch, and `/clawboard` running immediately.
- `tsc` against the engine's types, with unused-code checks, is clean.
- The mod loads and answers `/clawboard scan` in a headless Claude Code 2.1.311 session started with `--plugin-dir` from a clean copy, with no login.
- Installing from the repository's marketplace file works against a local copy, in an isolated home folder.
- The animated artwork renders and animates in WebKit.

## What was not checked

- **No real screenshots.** The panel itself was not captured; macOS Screen Recording permission was not available. See `docs/CAPTURING.md`.
- The panel was exercised through the engine's test kit and a headless load, not watched live in the desktop app or the terminal.
- **Automatic opening was not watched live.** The panel opening at session start, on client attach and on the first message, staying closed after a manual close, and `/clawboard` running mid-turn are covered by the automated tests and the engine's own documentation, but the author has not seen them happen in the desktop app.
- Limits and context against a real subscription account, real subagent runs, and the quality of model-written explanations and lessons.
- Linux, Windows, VS Code and mobile surfaces.
- Very large projects: the scan reads at most 5,000 files and 450 source files.

## Known limitations

- Crabs are selected with the buttons under the scene; the pictures do not take clicks yet.
- Import arrows cover JavaScript, TypeScript, Vue, Svelte and Python.
- Claude Code only draws a panel a mod opens by itself when the window is at least 144 terminal columns wide (110 once you have opened it from this mod). On a narrower window the panel waits undrawn until your first message, or until you run `/clawboard`. This is an engine rule the mod cannot change.
- Layers in The Burrow are inferred from folder and file names.
- The mod API is early access and may change between Claude Code releases.
