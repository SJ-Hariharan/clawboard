# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Use GitHub's private reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. If that button is not available, open an issue that says only that you have a security report and ask for a private way to send it. Do not put details in the issue.

You will get a first reply within a few days. Please give the maintainers reasonable time to fix a problem before you disclose it.

## What Clawboard can see and do

Knowing this helps you judge a report:

- **It reads** the events of the Claude Code session it runs in (tool calls and their results, prompts, turn usage), and files in the session's working directory when The Burrow scans the project or when you ask for an explanation.
- **It writes** only its own settings, usage history and lessons, through Claude Code's mod store. It does not write to your project.
- **It sends** code excerpts to the model only when you press an explanation or lesson button (or turn on automatic explanations), through your own Claude Code session. It makes no network requests of its own and runs no external programs.
- **It draws** SVG pictures from your data. Names, titles and labels are escaped before they go into the markup.

## Supported versions

Only the latest release is supported while the project is at version 0.x.

## Keeping the repository clean

Do not commit keys, tokens or personal data. Maintainers should turn on GitHub secret scanning and push protection for the repository.
