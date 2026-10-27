# Clawboard 0.1.0

The first release. Clawboard is a side panel for Claude Code that turns your session into a crab colony: each crab is a real agent, and the panel keeps activity, usage and project structure in view.

## What is in it

- **Crab Crew:** a crab for Claude and one for each real subagent, with six states driven by tool calls, turn events and permission prompts; each crab's task, activity, modified files and latest result; a live timeline with plain-English summaries.
- **The Tide:** context-window use, five-hour and weekly limits with reset times, session cost, tokens per turn and per agent, and a usage history that survives restarts.
- **The Burrow:** a project architecture diagram from your files and imports, the detected tech stack with explanations, and a view of each component.
- **Under the Shell:** explanations at three levels, plus lessons and quizzes saved per project.
- **Crab House:** rename, reorder and hide workspaces; compact or decorative layout; reduced motion; crab names, colors, shells, hats, skins and animations; a switch for the panel opening by itself.
- **Opening:** a 🦀 Clawboard strip sits above the prompt box and a click opens the panel at any width, even while Claude is working. The panel is also requested at session start and when a client attaches, and it is reopened on every message you send while it is not showing. `/clawboard` (also `close`, `toggle`, `scan`, `reset`) is registered to run at once. Crab House shows who closed the panel last.

## What was checked

- `claude plugin validate .` passes, with one informational note: the types file declares state but no new `$` noun, which is expected.
- `claude plugin test .`: 37 tests pass. They mount every workspace on the desktop and terminal surfaces against a mocked engine, and cover tool-to-state mapping, the project scan, the artwork, unavailable usage limits, subagent crabs, settings and lesson persistence, the `/clear` reset, the strip above the prompt and its click, the panel reopening on every message (and not when it is already showing or after `/clawboard close`), the off switches, `/clawboard` registered to run at once, the calm scene and usage-change check that keep the panel light, and the Rich pictures switch.
- `tsc` against the engine's types, with unused-code checks, is clean.
- The mod loads and answers `/clawboard scan` in a headless Claude Code 2.1.311 session started with `--plugin-dir` from a clean copy, with no login.
- Installing from the repository's marketplace file works against a local copy, in an isolated home folder.
- The animated artwork renders and animates in WebKit.
- **Used in the Claude desktop app by the author:** the panel, the strip above the prompt, and opening and reopening the panel work there, and scrolling felt smooth after the lighter-pictures change. This is the author's own use, with no timings and no screenshots.

## What was not checked

- **No real screenshots.** The panel itself was not captured; macOS Screen Recording permission was not available. See `docs/CAPTURING.md`.
- The terminal and the other surfaces were exercised through the engine's test kit and a headless load only, not watched live.
- **Why the app sometimes closed the panel** when switching tabs or apps was not pinned down. Clawboard now reopens it on your next message or a click on the strip, and Crab House records who closed it last so the cause can be confirmed.
- **Scroll smoothness was not timed.** The panel draws its pictures lightly by default; the author reports scrolling feels smooth after that change, but there are no measurements.
- Limits and context against a real subscription account, real subagent runs, and the quality of model-written explanations and lessons.
- Linux, Windows, VS Code and mobile.
- Very large projects: the scan reads at most 5,000 files and 450 source files.

## Known limitations

- Crabs are selected with the buttons under the scene; the pictures do not take clicks yet.
- Import arrows cover JavaScript, TypeScript, Vue, Svelte and Python.
- Claude Code only draws a panel a mod opens by itself when the window is at least 144 terminal columns wide (110 once you have opened it from this mod). On a narrower window the panel waits undrawn until you click the strip, send a message, or run `/clawboard`. This is an engine rule the mod cannot change.
- Layers in The Burrow are inferred from folder and file names.
- The mod API is early access and may change between Claude Code releases.
