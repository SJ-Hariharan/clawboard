# Capturing real screenshots

The README art is drawn by Clawboard's own crab renderer, because the panel could not be screenshotted when the project was prepared: macOS only lets an app capture other apps' windows once it has been given **Screen Recording** permission, and without it `screencapture` returns the desktop wallpaper alone. Real screenshots are the next improvement. This is how to take them.

## Screenshots of the panel

1. Load Clawboard (see the README), open a project, and run `/clawboard`.
2. Give the capture tool Screen Recording permission: **System Settings → Privacy & Security → Screen & System Audio Recording**. Use the built-in screenshot tool (⇧⌘5) or an app you trust.
3. Put the colony into interesting states by giving Claude a real task: reading files (exploring), editing (coding), a failing test run (debugging), and a task with subagents.
4. Capture the **panel only** (⇧⌘4, then space, then click the panel window). Make sure no conversation text, file names, usernames, tokens or limits you want to keep private are visible.
5. Save the images in `docs/screenshots/` as PNG and reference them from the README with a caption saying which workspace they show and which Claude Code version they came from.
6. Shrink large captures before committing, for example `sips -Z 1600 docs/screenshots/crew.png`.

Capture each workspace once: Crab Crew (colony and timeline), The Tide, The Burrow (diagram and a selected component), Under the Shell (a lesson), and Crab House.

## A short animation

The animated SVGs in `assets/` already move on GitHub. For a recording of the real panel, use the macOS screen recorder (⇧⌘5, **Record Selected Portion**) over the panel while Claude works, and convert it with any tool you like. Keep it under a few MB and under about 15 seconds. Prefer linking a short video to embedding a large GIF.

## The social preview image

`assets/social-preview.png` (1280×640) is made from `assets/banner.svg`:

```bash
swift scripts/render-png.swift assets/banner.svg assets/social-preview.png 1280 640 0.8
sips -z 640 1280 assets/social-preview.png
```

Upload it in the repository's **Settings → General → Social preview**. GitHub only accepts uploads there; it cannot be set from a file in the repository.
