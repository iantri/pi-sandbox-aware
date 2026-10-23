# pi-sandbox-aware

pi-sandbox-aware tells [Pi](https://github.com/earendil-works/pi) when it is running inside a macOS Seatbelt sandbox. It adds guidance so the agent can recognize a likely sandbox block and ask you for the specific access it needs.

It works alongside the tool you use to start Pi in a sandbox. It does not create a sandbox, grant access, or change your sandbox settings. The author uses this extension with [Agent Safehouse](https://agent-safehouse.dev/). Other sandbox launchers that use the underlying macOS Seatbelt functionality should also work.

Supports Pi 1.1.0 and newer.

## Setup

Requires macOS, Pi 1.1.0 or newer, and Node.js 22.19.0 or newer. Install it from npm using Pi's package manager:

```sh
pi install npm:@iantri/pi-sandbox-aware
```

Run `/reload` in Pi after installation, or restart Pi.

pi-sandbox-aware starts automatically. There are no extension commands or settings to configure.

### Update or remove

Update the installed package:

```sh
pi update npm:@iantri/pi-sandbox-aware
```

Remove it:

```sh
pi remove npm:@iantri/pi-sandbox-aware
```

Run `/reload` or restart Pi after either change. Removing pi-sandbox-aware removes its status display and guidance; it does not change the sandbox itself.

## Behavior

When a Pi session starts, pi-sandbox-aware checks whether the current process is sandboxed. In the terminal, it shows a startup notification and footer status:

| State | Footer | Agent guidance |
| --- | --- | --- |
| Sandboxed | `🔒 sb` | Adds guidance for recognizing sandbox blocks and asking for access. |
| Not sandboxed | `🔓 NO SB` | Adds no sandbox guidance. The startup notification warns about full system access. |
| Unknown | `❔ sb?` | Warns that detection failed and adds cautious sandbox guidance. |

The guidance tells the agent to treat `EPERM` or `Operation not permitted` as a likely sandbox block when the operation would normally succeed. After a block, it should ask for the exact file path or network domain and the access mode it needs, preferring read-only access. It should not ask for access preemptively.

You adjust the sandbox through the tool or configuration that started Pi. pi-sandbox-aware does not make those changes for you. Prompt guidance helps the agent reason about a block; it does not enforce the agent's behavior.

In sessions without a user interface, sandbox guidance still applies, but no notification or footer is shown.

## Compatibility

pi-sandbox-aware detects macOS Seatbelt sandboxes. It calls `sandbox_check` through Koffi inside the Pi process, without starting a helper program. This is a private macOS interface, so Apple does not guarantee its stability. If loading or calling it fails, the status is unknown rather than not sandboxed.

Detection answers whether Pi is sandboxed, not which files, domains, or operations its sandbox permits. A failed operation can have other causes. Neither a not-sandboxed status nor an unknown status proves that every operation will succeed.

On platforms other than macOS, pi-sandbox-aware reports not sandboxed and adds no sandbox guidance. It does not detect Linux or Windows sandboxes or other access restrictions.

Other extensions can change the agent's system prompt. Verify that the sandbox guidance remains present with the extension combinations you use.

## Support

If no footer status appears, run `/reload` or restart Pi. Check that the package is installed and enabled in the Pi configuration you are using.

Report problems or request changes in [GitHub Issues](https://github.com/iantri/pi-sandbox-aware/issues). Include your Pi, Node.js, and macOS versions, the sandbox launcher you use, the displayed status, and the steps that caused the problem. Remove credentials, private paths, and conversation content before sharing details.

## Development

Install dependencies and run the local checks:

```sh
npm ci
npm run typecheck
npm test
```

Tests use Node's built-in runner with `tsx`. Unit tests cover detection and message logic. Integration tests exercise real Pi sessions and provider requests against a fake local model endpoint, with injected sandbox results. They need no live credentials and do not call the native macOS interface.

The development SDK and related Pi packages are pinned to 1.1.0 to check the minimum supported version. Also check a current Pi release before publishing. There is no build step; Pi loads the TypeScript source directly.

Before each release, follow the [native verification procedure](docs/verification/native-sandbox.md) with the same packed candidate inside and outside a macOS sandbox, including real terminal startup, reload, and shutdown. Results stay private and outside the repository. Publishing runs type checking and ordinary tests; those checks do not replace native verification.

## Versioning

pi-sandbox-aware follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html), with matching Git tags such as `v1.2.3`.

The public compatibility contract covers documented extension behavior, installation, and supported Pi and Node.js versions. Internal TypeScript modules are not a public import API.

From `1.0.0`, incompatible changes require a major release, compatible features and deprecations require a minor release, and compatible bug fixes require a patch release. Raising a minimum supported Pi or Node.js version counts as an incompatible change.

During `0.x` development, the contract is not yet stable. Minor releases may add features or make incompatible changes. Patch releases contain compatible fixes. Release notes identify incompatible changes and any required migration steps.

Published versions are immutable. The [changelog](CHANGELOG.md) groups releases by version, with headings such as `## [1.2.3] - 2026-10-20`. Pending changes stay under `Unreleased`.

## License

[MIT](LICENSE).
