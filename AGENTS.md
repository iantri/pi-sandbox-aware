# AGENTS.md

> **Note:** `CLAUDE.md` is a symlink to this file — pi (reads `AGENTS.md`) and Claude Code (reads `CLAUDE.md`) share one source of truth. Edit here; both see it.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `iantri/pi-sandbox-aware`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The project uses five triage roles. Their required label names are in `docs/agents/triage-labels.md`. Create a label in GitHub before applying it if it is missing.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Changelog

- Maintain `CHANGELOG.md` in the [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format, using ISO 8601 dates instead of version numbers for release headings.
- An `Unreleased` section may temporarily collect changes before a commit. A commit is a release: as part of every commit, move its `Unreleased` entries into a new dated release entry.
- Treat released entries as append-only: add the new dated release, with the newest release first, and never edit entries released by an earlier day. Multiple commits on the same day may update and consolidate that day's release entry.
- Group entries under the standard `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security` headings as applicable. Keep them concise and describe what users can notice or do differently.

## Build/runtime notes

- `node --test src/*.test.ts` — Tests run directly against `.ts` files (Node 24 built-in type stripping); use explicit `.ts` extensions in relative imports.
- Unit tests need no `npm install` — test seams inject `sandboxCheck`, so the tests do not import koffi.
- `sandbox_check(getpid(), NULL, 0)` returns `1` under Agent Safehouse and `0` outside; the only reliable generic seatbelt self-check.
- `npm install koffi` succeeded in-sandbox here, but registry access may vary; this project pins koffi to `3.1.2`.
- `pi install git:github.com/iantri/<repo>` auto-adds the package to `~/.pi/agent/settings.json`; run `/reload` in an existing session to load it.
- `package-lock.json` should generally not be committed in this repo — keep commits to `src/` + `package.json` unless instructed otherwise.
