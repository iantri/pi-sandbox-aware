# AGENTS.md

> **Note:** `CLAUDE.md` is a symlink to this file — pi (reads `AGENTS.md`) and Claude Code (reads `CLAUDE.md`) share one source of truth. Edit here; both see it.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `iantri/pi-sandbox-aware`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles using default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Build/runtime notes

- `node --test src/*.test.ts` — Tests run directly against `.ts` files (Node 24 built-in type stripping); use explicit `.ts` extensions in relative imports.
- Unit tests need no `npm install` — seams inject `sandboxCheck`, so koffi is never imported by modules under test; they run inside Agent Safehouse.
- `sandbox_check(getpid(), NULL, 0)` returns `1` under Agent Safehouse and `0` outside; the only reliable generic seatbelt self-check.
- `npm install koffi` succeeded in-sandbox here, but registry access may vary; actual latest koffi is `3.1.2`.
- `pi install git:github.com/iantri/<repo>` auto-adds the package to `~/.pi/agent/settings.json`; run `/reload` in an existing session to load it.
- `package-lock.json` should generally not be committed in this repo — keep commits to `src/` + `package.json` unless instructed otherwise.