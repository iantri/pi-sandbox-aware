# AGENTS.md

> **Note:** `CLAUDE.md` is a symlink to this file — pi (reads `AGENTS.md`) and Claude Code (reads `CLAUDE.md`) share one source of truth. Edit here; both see it.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `iantri/pi-sandbox-aware`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The project uses five triage roles. Their required label names are in `docs/agents/triage-labels.md`. Create a label in GitHub before applying it if it is missing.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Versioning

- Follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). Before choosing a release version, read [README.md — Versioning](README.md#versioning) for the public compatibility contract and pre-1.0 policy.
- For a package release, keep the version in `package.json` and `package-lock.json` aligned, and tag the release `v<version>`. Published versions and release tags are immutable.

## Changelog

- Maintain `CHANGELOG.md` using [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) categories. Use SemVer release headings in the form `## [X.Y.Z] - YYYY-MM-DD`, newest release first.
- Keep pending changes under `## [Unreleased]`. They may be grouped into dated subsections such as `### YYYY-MM-DD`, newest date first, with change categories one heading level below.
- When releasing a version, consolidate its pending entries into that version's section, grouped by change category. Leave work not included in the release under `Unreleased`. Commits alone do not create release sections.
- Preserve published release entries; new changes belong under `Unreleased` until their version is released.
- Group entries under the standard `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security` headings as applicable. Keep them concise and describe what users can notice or do differently.

## Writing

Plain language, always -- conversation as much as anything written down: commit messages,
changelog entries, documentation, issue bodies, and code comments. Short sentences. State
the fact rather than hedging around it, and cut ornament and filler.

- Load the `writing-with-plain-language` skill at session start, whenever it is available.
  Apply it to every message, including routine status updates. Also load it before drafting
  or editing substantive prose. Do not wait to be asked; the preference is standing.
- This governs prose, not identifiers or established domain terms. `CONTEXT.md` holds the
  project's vocabulary, and the right domain word beats a simpler wrong one.
- Use the extension's full name, `pi-sandbox-aware`, in conversation and written material, as defined in `CONTEXT.md`.

## Verification

- Install with `npm ci`, then run `npm run typecheck` and `npm test` for code changes. Keep the committed lockfile aligned with `package.json`.
- Keep unit tests small. Exercise loading, lifecycle events, status updates, and provider-visible prompt guidance through real Pi sessions with injected sandbox results and fake local model endpoints. Ordinary tests require no live credentials or native macOS calls.
- Target Pi 1.1.0 and newer. Pin the development SDK and related Pi packages to 1.1.0 so baseline tests cannot silently use newer APIs. Also check a current Pi release before publishing.
- Before every release, complete the [native verification procedure](docs/verification/native-sandbox.md) on the same packed candidate inside and outside a macOS sandbox, including real terminal startup, reload, and shutdown. Unit and simulated integration tests do not satisfy this gate.
- Keep the revision, candidate identity, environment versions, commands, and results in a private record outside the repository. Verify locally; CI and automated publishing are outside the release plan.

## Publication privacy

- Treat tracked files, commit messages, and GitHub issue/comment text as intended for public distribution, even while the repository is private.
- Keep credentials, personal information, developer-specific absolute paths, private endpoints, local configuration, borrowed transcripts, payloads, and derived summaries outside the repository. Keep live verification results and diagnostics private, including aggregate run reports. Commit reusable procedures, fictional fixtures, and configuration examples instead.
- Use repository-relative paths or clearly fictional placeholders in public code and documentation. Read machine-specific settings from external configuration or environment variables; never copy a developer's resolved values into examples or reports committed here.
- Before committing, inspect staged filenames and content for private material, including generated files and metadata. Ignore rules and the npm allowlist do not protect files already tracked in Git or exposed through GitHub history.
- Preserve explicitly approved public details, such as license attribution and approved examples. Approval for one detail does not authorize publishing related private information. If private material is already committed, flag it for cleanup; deleting the current file does not remove historical copies.


## Build/runtime notes

- Tests use Node's built-in runner with `tsx`; type checking is a separate step and emits no compiled files. Use explicit `.ts` extensions in relative imports.
- Runtime code lives in `extensions/pi-sandbox-aware/`; tests live in `tests/`. The `pi.extensions` manifest declares the entry point, and the npm `files` allowlist keeps development-only files out of releases.
- `sandbox_check(getpid(), NULL, 0)` returns `1` under Agent Safehouse and `0` outside; the only reliable generic seatbelt self-check.
- Koffi is a runtime dependency, pinned to `3.1.2`. Pi loads the TypeScript source directly; there is no build step.
