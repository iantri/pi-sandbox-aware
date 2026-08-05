# pi-sandbox-aware

`pi-sandbox-aware` tells [Pi](https://github.com/badlogic/pi-mono) when Pi is running inside a macOS sandbox. It helps the agent recognize a likely sandbox block and ask you for the specific access it needs.

The extension only detects and reports sandbox restrictions. It does not create a sandbox, grant access, or change your sandbox settings.

## What you need

- macOS
- Node.js 22.19.0 or later
- Pi

This is a macOS-only feature. On other platforms, the extension cannot detect a macOS sandbox and reports that Pi is not sandboxed.

## Install

Run this command from a terminal:

```sh
pi install git:github.com/iantri/pi-sandbox-aware
```

Pi adds the extension to its settings. If Pi is already running, enter `/reload` in that session. Otherwise, start a new Pi session.

After Pi loads the extension, look in Pi's footer for one of the status labels below.

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

If neither label appears, check that you installed the package in the same Pi configuration you are running. You can also disable or remove the package, then install it again:

```sh
pi uninstall git:github.com/iantri/pi-sandbox-aware
pi install git:github.com/iantri/pi-sandbox-aware
```

Run `/reload` after reinstalling.

### The extension says the sandbox status is unknown

The extension only detects macOS sandboxes. It reports `❔ sb?` when it cannot load or call the macOS sandbox interface. This status does not change what Pi can access or prove that every operation will succeed.

### An operation failed with `Operation not permitted`

This can be a sandbox block when the operation normally works. The extension does not grant access for you. Adjust your sandbox through the tool or configuration that started Pi only after you know the exact blocked file path or network domain and the smallest access mode that will work.

## Development

Run the tests with:

```sh
node --test src/*.test.ts
```

The unit tests inject the macOS sandbox check, so they do not load the native FFI dependency.

## License

MIT
