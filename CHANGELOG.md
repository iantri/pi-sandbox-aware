# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Releases are identified by their ISO 8601 release date rather than a version number, with the newest release first.

## 2026-08-05

### Added

- Installation and troubleshooting guidance in `README.md`.
- Integration-style tests for extension startup, prompt guidance, status cleanup, and failed sandbox detection.

### Changed

- Show an unknown sandbox status when macOS sandbox detection cannot run, rather than claiming that Pi is not sandboxed.
- Load the macOS sandbox library directly through `libsandbox.1.dylib`.
- Ignore local Pi state and the generated `package-lock.json` file.
- Clarify current project guidance and archive exploratory sandbox research that is no longer current guidance.

## 2026-07-27

### Added

- Initial macOS sandbox detection for Pi using `sandbox_check` through `koffi`.
- Sandbox status in Pi's footer and guidance for handling a sandbox block.
- Tests, domain terminology, and an architecture decision record for sandbox detection.
