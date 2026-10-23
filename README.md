# pi-sandbox-aware

`pi-sandbox-aware` tells [Pi](https://github.com/earendil-works/pi) when Pi is running inside a macOS sandbox. It helps the agent recognize a likely sandbox block and ask you for the specific access it needs.

The extension only detects and reports sandbox restrictions. It does not create a sandbox, grant access, or change your sandbox settings.

## What you need

- macOS
- Node.js 22.19.0 or later
- Pi 1.1.0 or later

This is a macOS-only feature. On other platforms, the extension cannot detect a macOS sandbox and reports that Pi is not sandboxed.

## Install

Run this command from a terminal:

```sh
pi install npm:@iantri/pi-sandbox-aware
```

Pi adds the extension to its settings. If Pi is already running, enter `/reload` in that session. Otherwise, start a new Pi session.

After Pi loads the extension, look in Pi's footer for one of the status labels below.

### Switching from a Git installation

After the npm release is available, remove the Git installation before installing the npm package so Pi does not load the extension twice:

```sh
pi remove git:github.com/iantri/pi-sandbox-aware
pi install npm:@iantri/pi-sandbox-aware
```

Run `/reload` in an existing Pi session after switching. If you installed the Git package with `--local`, use `--local` on both commands.

## What you will see

When a Pi session starts, the extension checks whether the current process is sandboxed.

- **Sandbox active:** Pi shows `🔒 sb`. Before the agent starts, the extension adds guidance to the agent's instructions about sandbox blocks and how to ask for access.
- **Not sandboxed:** Pi shows `🔓 NO SB` and warns that Pi may have full system access.
- **Status unknown:** Pi shows `❔ sb?` when it cannot load or call the macOS sandbox interface. In this case, the agent still uses cautious sandbox guidance.

The added guidance tells the agent to treat `EPERM` or `Operation not permitted` as a likely sandbox block when the operation would normally succeed. It tells the agent to ask you for the exact file path or network domain it needs, and whether it needs read-only or read-write access. It must not ask before a block happens.

## How detection works

On macOS, the extension calls the system `sandbox_check` function in the current Pi process. It uses the function only to answer whether the process is sandboxed. It does not start a helper program.

If macOS does not provide the function, or the extension cannot load or call it, the extension reports `❔ sb?`. It does not claim that Pi is not sandboxed.

## Troubleshooting

### I installed the extension but do not see its status

Enter `/reload` in the Pi session, or start a new session. Then look in Pi's footer for `🔒 sb`, `🔓 NO SB`, or `❔ sb?`. Any of these labels means the extension loaded.

If none of these labels appears, check that you installed the package in the same Pi configuration you are running. You can also remove the package, then install it again:

```sh
pi remove npm:@iantri/pi-sandbox-aware
pi install npm:@iantri/pi-sandbox-aware
```

Run `/reload` after reinstalling.

### The extension says the sandbox status is unknown

The extension only detects macOS sandboxes. It reports `❔ sb?` when it cannot load or call the macOS sandbox interface. This status does not change what Pi can access or prove that every operation will succeed.

### An operation failed with `Operation not permitted`

This can be a sandbox block when the operation normally works. The extension does not grant access for you. Adjust your sandbox through the tool or configuration that started Pi only after you know the exact blocked file path or network domain and the smallest access mode that will work.

## Development

The package follows [Pi's package layout](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md):

```text
extensions/
  sandbox-aware/
    index.ts          # Pi entry point
    detect.ts
    messages.ts
    spi.ts
tests/                # Not published to npm
package.json          # Explicit Pi entry point and npm file list
README.md
CHANGELOG.md
LICENSE
```

Only the extension, package metadata, README, changelog, and license are published. Development skills, agent instructions, tests, and internal docs stay in the repository. There is no build step; Pi loads the TypeScript source directly.

Install dependencies and run the local checks:

```sh
npm ci
npm run typecheck
npm test
```

Tests use Node's built-in runner with `tsx`. Unit tests cover detection and message logic. Integration tests exercise real Pi sessions and provider requests with injected sandbox results and a fake local model endpoint. They need no live credentials and do not call the native macOS interface.

The development SDK and related Pi packages are pinned to 1.1.0 to check the minimum supported version. Keep `package-lock.json` committed and aligned with `package.json`. Also check a current Pi release before publishing.

Before each release, follow the [native verification procedure](docs/verification/native-sandbox.md) with the same packed candidate inside and outside a macOS sandbox. Include real terminal startup, reload, and shutdown. Keep results private and outside this repository. Automated tests alone cannot establish that native detection works.

To try your local checkout, install its runtime dependencies, then load the package for one Pi invocation:

```sh
pi -e .
```

Disable any other installation of this extension first to avoid loading it twice.

### Preparing an npm release

Before publishing, review the version in `package.json` and `package-lock.json`, update `CHANGELOG.md`, complete native verification, and inspect the archive contents:

```sh
npm run typecheck
npm test
npm pack --dry-run
```

When the release is approved, an npm account with access to the `@iantri` scope can run `npm publish`. The package is configured for public access. Publishing runs type checking and ordinary tests; it does not run or replace the native release checks. No compilation is required.

## Versioning

pi-sandbox-aware follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html), with matching Git tags such as `v1.2.3`.

The public compatibility contract covers documented extension behavior, installation, and supported Pi and Node.js versions. Internal TypeScript modules are not a public import API.

From `1.0.0`, incompatible changes require a major release, compatible features and deprecations require a minor release, and compatible bug fixes require a patch release. Raising a minimum supported Pi or Node.js version counts as an incompatible change.

During `0.x` development, the contract is not yet stable. Minor releases may add features or make incompatible changes. Patch releases contain compatible fixes. Release notes identify incompatible changes and any required migration steps.

Published versions are immutable. The [changelog](CHANGELOG.md) groups releases by version, with headings such as `## [1.2.3] - 2026-10-20`. Pending changes stay under `Unreleased`.

## License

MIT
