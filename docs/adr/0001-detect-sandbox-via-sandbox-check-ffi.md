# Detect sandbox via sandbox_check FFI (koffi), not sysctl

We need pi to detect at runtime that it is itself running inside a macOS sandbox (the user runs pi under Agent Safehouse, a `sandbox-exec` wrapper). Node has no built-in to call the kernel's sandbox-introspection SPI, so we use `koffi` (a Node FFI library) to call the private `sandbox_check(getpid(), NULL, 0)` SPI from `libsandbox.1.dylib` in-process — the canonical "am I sandboxed?" check (Chromium's `Seatbelt::IsSandboxed`).

**Status**: accepted

## Considered Options

- **sysctl-only** (`security.mac.sandbox.sentinel` read → EPERM): rejected. It is a weak, profile-dependent signal, and it **empirically false-negatives under Agent Safehouse** — the sentinel read *succeeds* there (exit 0), so it would report "not sandboxed" while pi *is* sandboxed. Confirmed in-sandbox: `sandbox_check` returned 1 while `sysctl security.mac.sandbox.sentinel` succeeded.
- **Shipped C helper binary**: rejected. It spawns a child at a custom path, which a deny-default sandbox can deny exec of — detection would silently fail inside the very sandbox we are detecting.
- **Own N-API native addon**: workable (in-process, no dep) but requires maintaining prebuilt `.node` for arm64 + x64 plus the packaging — heavier than warranted for a small extension.

## Consequences

- One npm dependency (`koffi`, prebuilt — no build step on the user's machine), declared in `package.json` `dependencies` and fetched by `pi install` over the git-URL package.
- In-process call — no child process, so no dependency on the sandbox permitting exec. This matters because we detect *from inside* a sandbox that restricts exec.
- Robust canonical signal. A future version could load `sandbox_container_path_for_pid` from the same library to distinguish App Sandbox from `sandbox-exec`-style.
- Private SPI with no Apple stability guarantee, but de-facto stable (Chromium/WebKit rely on it); resolved at runtime through Koffi's symbol lookup, with a graceful fallback if absent.
