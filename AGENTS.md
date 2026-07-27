# AGENTS.md

> **Note:** `CLAUDE.md` is a symlink to this file — pi (reads `AGENTS.md`) and Claude Code (reads `CLAUDE.md`) share one source of truth. Edit here; both see it.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `iantri/pi-sandbox-aware`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles using default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.