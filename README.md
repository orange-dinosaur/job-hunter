# job-hunter

A local tool that searches job boards with your CV and search profile, ranks offers by fit, and prepares tailored CVs and cover letters on request. It runs from a dashboard on localhost or from Claude Code commands. Both use headless Claude Code (`claude -p`).

## Install

1. Install Bun: `curl -fsSL https://bun.sh/install | bash`
2. Install uv (runs the JobSpy search script): `curl -LsSf https://astral.sh/uv/install.sh | sh`
3. Install Claude Code and sign in.
4. In this folder, run `bun install`.

## Start

- Dashboard: `bun run dev`
- Command line: `bun run jh`

## Checks

```sh
bun run typecheck && bun run lint && bun run test
```
