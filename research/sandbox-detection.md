# Detecting That You're Running Inside a macOS Sandbox

Research notes for a "sandbox-aware" pi extension. Goal: let a CLI coding-agent tool
detect, at runtime, that **it itself** is executing inside a macOS sandbox (App Sandbox /
seatbelt / `sandboxd`), so it can adjust its behavior. macOS-only; exploration phase.

All claims are traced to primary sources where possible. Where only a secondary source was
found, or where a claim is inferred rather than documented, it is marked **explicitly**.
Empirical tests were run on the host machine (Apple Silicon, macOS 15.5, SDK
`MacOSX15.5.sdk`); those results are labeled "empirical (this machine)".

---

## TL;DR

- **The single best signal is `sandbox_check(getpid(), NULL, 0)`** (a *private* SPI in
  `libsystem_sandbox`, not in the public `<sandbox.h>`). It returns `1` if the calling
  process is confined by **any** seatbelt sandbox profile, `0` otherwise. It is the
  canonical self-check used by Chromium (`Seatbelt::IsSandboxed()`) and is **verified
  empirically on this machine**: `0` unsandboxed, `1` under `sandbox-exec`. It covers
  **both** `sandbox-exec`-style sandboxes (e.g. Agent Safehouse) **and** App Sandbox,
  because both are enforced by the same kernel `Sandbox.kext` MAC policy.
- **`sandbox_container_path_for_pid(getpid(), ...)`** is the clean way to *distinguish*
  App Sandbox (returns the container path) from a generic `sandbox-exec` sandbox (returns
  `-1`, "sandboxed but not containerized"). Verified empirically.
- **`csops` / `CS_DEBUGGED` do NOT reveal sandbox status.** `CS_DEBUGGED` means "debugged",
  not "sandboxed". `csops` can only retrieve the code-signing **entitlements blob**, from
  which you can check for `com.apple.security.app-sandbox` — that proves the *binary is
  signed to be sandboxed*, not that it is *currently confined*.
- **Agent Safehouse** (`eugene1g/agent-safehouse`) is, per its own README, a Bash wrapper
  around `sandbox-exec` with composable `.sb` profiles. It does **nothing custom at the
  kernel level**. Therefore a generic seatbelt detector (`sandbox_check`) catches it; no
  Agent-Safehouse-specific signal is needed.
- **Environment variables are weak/spoofable.** `APP_SANDBOX_CONTAINER_ID` is the
  community App-Sandbox signal, but it is **not in the macOS SDK headers** (confirmed by
  grep) and is trivially spoofable. `sandbox-exec` sets **no** distinctive env var.
- **Parent-path detection does not work for `sandbox-exec`**: `sandbox-exec` `execvp`s the
  child in place, so the child's parent is the original shell, not `sandbox-exec`. Verified
  empirically.

---

## Background: there are two sandbox lineages on macOS, one kernel engine

Both ultimately feed the same kernel MAC policy (`Sandbox.kext`, a.k.a. "seatbelt"):

| Lineage | How a profile is applied | Typical users |
|---|---|---|
| **App Sandbox** (the Mac App Store variant) | `libsystem_secinit.dylib` (loaded by dyld) inspects the binary's entitlements; if `com.apple.security.app-sandbox` is present it asks the sandbox daemon to confine the process into a **container** (`~/Library/Containers/<bundle-id>/Data`). | Mac App Store apps, notarized sandboxed apps |
| **`sandbox-exec` / `sandbox_init*`** (the "classic" seatbelt) | A profile (SBPL text, compiled to bytecode by `libsandbox`) is pushed to the kernel via `sandbox_apply()` / `__sandbox_ms`. No container, no entitlements required. | `sandbox-exec(1)`, daemons, **Agent Safehouse**, Chromium's renderer sandbox |

Both attach a seatbelt profile to the process, so `sandbox_check` reports `1` for both.
The difference is whether the process is also **containerized** (App Sandbox only).

Primary sources for the architecture:
- `sandbox(7)` man page (on-system): "The sandbox facility allows applications to voluntarily restrict their access… New processes inherit the sandbox of their parent."
- `sandboxd(8)` man page (on-system): "sandboxd performs services on behalf of the Sandbox kernel extension."
- D. Blazakis, *The Apple Sandbox* (BH/DC 2011) — the seatbelt design paper; documents the TrustedBSD MAC integration and the `__sandbox_ms` syscall. https://www.ise.io/wp-content/uploads/2017/07/apple-sandbox.pdf
- XNU MAC framework: `security/mac_framework.h`, `security/mac_policy.h` in `apple-oss-distributions/xnu`. https://github.com/apple-oss-distributions/xnu

---

## Summary table of signals

| # | Signal | What it proves | Reliability | Cost | Status |
|---|---|---|---|---|---|
| 1 | `sandbox_check(getpid(), NULL, 0)` | Confined by **some** seatbelt profile right now (generic) | **High** — not env-spoofable, no entitlement needed, works from inside | 1 SPI call | **Private SPI**, stable (Chromium/WebKit rely on it). Empirically verified. |
| 2 | `sandbox_container_path_for_pid(getpid(), buf, n)` | In an **App Sandbox container** (returns path) vs sandboxed-but-not-containerized (returns -1) | **High** for the containerized case | 1 SPI call | Private SPI. Empirically verified (returns -1 under `sandbox-exec`). |
| 3 | `APP_SANDBOX_CONTAINER_ID` env var | App-Sandbox container (set by system to bundle id) | **Medium** — spoofable (env), and **undocumented** by Apple | trivial | NOT in SDK headers (grep-confirmed). Community convention. |
| 4 | `com.apple.security.app-sandbox` entitlement (via `SecStaticCodeCheckValidity` or `csops(CS_OPS_ENTITLEMENTS_BLOB)`) | Binary is **signed to be sandboxed** (not "currently confined") | High for App Sandbox apps; **does not detect `sandbox-exec`** | medium (codesign API) | Documented (Apple QA1773). |
| 5 | `HOME` != real home (`getpwuid(getuid())->pw_dir`) | App-Sandbox HOME remap to container | Medium — spoofable by setting `HOME`; App-Sandbox-specific | trivial | Documented by Apple DTS (forums). |
| 6 | `~/Library/Containers/<bundle-id>/Data` path containment | App-Sandbox container location | Medium — path-based, not authoritative | trivial | Documented structure (Apple File System guide / forums). |
| 7 | `csops(CS_OPS_STATUS)` / `CS_DEBUGGED` | **Nothing about sandbox.** `CS_DEBUGGED` = debugged, not sandboxed | N/A for sandbox | low | Primary: XNU `bsd/sys/codesign.h`. |
| 8 | `proc_pidpath(getppid()) == /usr/bin/sandbox-exec` | Launched via `sandbox-exec`? | **Low** — `sandbox-exec` execs in place, so parent is the shell, not `sandbox-exec` (empirical) | low | Primary: `<libproc.h>`; empirical negative. |
| 9 | `sysctl` `security.mac.sandbox.sentinel` read → EPERM | "Some denying profile blocks this sysctl-read" (profile-dependent) | **Low–Medium** — success is inconclusive; only EPERM hints at sandbox | 1 sysctl | Real Apple convention: `/usr/bin/security` uses it as a pre-flight check. |
| 10 | `sysctl` `kern.proc` / per-process introspection | No per-process "sandboxed" flag is exposed | N/A | — | No primary source found exposing one. |
| 11 | `containermanagerd` / ContainerManager framework | App-Sandbox container metadata (App-Sandbox only) | Limited — private framework, App-Sandbox-specific | high | Private; not needed given signal #2. |

---

## Detailed findings per signal

### 1. `sandbox_check()` / `sandbox_init()` — the canonical self-check

**API / mechanism.** `int sandbox_check(pid_t pid, const char *operation, int type, ...);`
declared in the **private** SPI (not in the public `<sandbox.h>`). Linked from
`libsystem_sandbox` (lives in the dyld shared cache on modern macOS; not a separate
on-disk dylib since Big Sur). The public `<sandbox.h>` only declares `sandbox_init`,
`sandbox_free_error`, and the `kSBXProfile*` constants — all `API_DEPRECATED(... macos(10.5, 10.8) ...)`,
i.e. deprecated since 10.8 but **still present** in the SDK through `MacOSX26.2.sdk`.

**Canonical usage.** Chromium's `sandbox/mac/seatbelt.cc`:
```cpp
// Not deprecated. The canonical usage to test if sandboxed is
// sandbox_check(getpid(), NULL, SANDBOX_FILTER_NONE), which returns
// 1 if sandboxed.
int sandbox_check(pid_t pid, const char *operation, int type, ...);
...
bool Seatbelt::IsSandboxed() {
  return ::sandbox_check(getpid(), NULL, 0);   // 0 == SANDBOX_FILTER_NONE
}
```
Source: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/sandbox/mac/seatbelt.cc

**Empirical (this machine).** A tiny C program calling `sandbox_check(getpid(), NULL, 0)`:
- unsandboxed → `0`
- under `sandbox-exec -p '(version 1)(allow default)'` → `1`

`SANDBOX_FILTER_NONE` is `0`. The filter-type enum and `SANDBOX_CHECK_NO_REPORT` (a
filter-type constant used to suppress violation reports) are declared in WebKit's
`Source/WTF/wtf/spi/darwin/SandboxSPI.h`:
```c
enum sandbox_filter_type {
    SANDBOX_FILTER_NONE,
    SANDBOX_FILTER_PATH,
    SANDBOX_FILTER_GLOBAL_NAME = 2,
    SANDBOX_FILTER_PREFERENCE_DOMAIN = 6,
    SANDBOX_FILTER_XPC_SERVICE_NAME = 12,
    SANDBOX_FILTER_IOKIT_CONNECTION,
    SANDBOX_FILTER_SYSCALL_NUMBER,
};
extern const enum sandbox_filter_type SANDBOX_CHECK_NO_REPORT;
```
Source: WebKit `SandboxSPI.h` (GitHub repo `WebKit/WebKit`, branch `master`, path
`Source/WTF/wtf/spi/darwin/SandboxSPI.h`). Exact URL given in Citations.

**What it proves.** "I am currently confined by a seatbelt sandbox profile." This is
**generic** — it does not distinguish App Sandbox from `sandbox-exec`; both attach a
profile and both return `1`. (App-Sandbox case is *inferred* from architecture, not
separately empirically tested on this machine — see Open Questions.)

**Reliability / caveats.**
- Not spoofable via environment variables (it's a syscall-backed check, not env).
- Requires no entitlement; works from inside the sandboxed process (and from outside for
  any pid you can address).
- It is a **private SPI**: not in the public header, no Apple stability promise. In
  practice Chromium and WebKit have relied on it for many macOS releases, so it is
  de-facto stable, but Apple could change it.
- Passing a specific `operation` (e.g. `"file-read*"`, `"mach-lookup"`) tests a specific
  permission for a pid; passing `NULL` operation with `SANDBOX_FILTER_NONE` is the
  "is this process sandboxed at all" form. Operation names are enumerated in the
  reverse-engineered `sandbox.h` listing (newosxbook): `file*`, `mach*`, `network*`,
  `process*`, `sysctl*`, `signal`, `iokit*`, etc.

**`SANDBOX_CHECK_RESERVED` / `__MAC_OS_X_VERSION_MIN_REQUIRED`-gated symbols.** No primary
source found for a symbol literally named `SANDBOX_CHECK_RESERVED`. The
`__MAC_OS_X_VERSION_MIN_REQUIRED` gating refers to weakly-imported SPI symbols whose
availability is keyed to the deployment target; this is an SDK/build mechanism, not a
runtime detection signal. Marking as **not found in primary sources**.

Citations:
- Public header (on-system): `/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk/usr/include/sandbox.h`
- Chromium `seatbelt.cc`: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/sandbox/mac/seatbelt.cc
- WebKit `SandboxSPI.h`: GitHub repo `WebKit/WebKit`, branch `master`, path `Source/WTF/wtf/spi/darwin/SandboxSPI.h` (see Citations)
- Reverse-engineered SPI + operation list: https://newosxbook.com/src.jl?tree=listings&file=/sandbox.h and `/sbtool.c`

---

### 2. `sandbox-exec(1)` / `sandbox_init_with_parameters()` — "was I launched under a profile?"

**API / mechanism.** `sandbox-exec(1)` (man page, on-system, marked DEPRECATED) takes a
profile via `-f`/`-n`/`-p` and `exec`s the target. The programmatic equivalent is the
private `sandbox_init_with_parameters()` / `sandbox_compile_string()` + `sandbox_apply()`
SPI (declared in WebKit `SandboxSPI.h` and Chromium `seatbelt.cc`). `sandbox-exec` itself
is a universal Mach-O at `/usr/bin/sandbox-exec` (still present, macOS 15.5).

**Availability.** `sandbox-exec(1)` and `sandbox_init(3)` man pages both say DEPRECATED
(as of the 2017 man-page revision); deprecated since macOS 10.8 for the C API. Still
present and functional on macOS 15.5 (empirical).

**What it proves.** A process cannot directly ask "which profile am I under?" — there is
no public API to retrieve the active profile name. The reliable signal that you were
launched under *some* profile is signal #1 (`sandbox_check`). "Knowing the profile name"
is not supported by a documented API.

**Reliability / caveats.**
- `sandbox-exec` **execs the child in place** (empirical: the child's `getppid()` equals
  the shell's pid, and `proc_pidpath(getppid())` returns `/bin/bash`, not `sandbox-exec`).
  So you **cannot** detect `sandbox-exec` by looking at your parent. See signal #8.
- `sandbox-exec` sets **no distinctive environment variable** (empirical: `env` under
  `(allow default)` differs from the normal environment only in `_=` pointing at
  `/usr/bin/sandbox-exec`, which is a shell artifact, not a sandbox marker). See signal #4.

Citations:
- `sandbox-exec(1)`, `sandbox_init(3)` man pages (on-system)
- Chromium `seatbelt.cc` (uses `sandbox_init_with_parameters` + `sandbox_compile_string` + `sandbox_apply`)

---

### 3. App Sandbox (Mac App Store variant) — containers, entitlements, code signing

**API / mechanism.** App Sandbox is entered at launch: `libsystem_secinit.dylib` (loaded
by dyld) inspects the main executable's entitlements; if `com.apple.security.app-sandbox`
is present it triggers confinement into a per-app **container**. The reverse-engineered
reimplementation of `libsecinit` shows the entitlements it checks for sandbox candidacy:
```c
static const char* _libsecinit_sandbox_entitlements[] = {
    "com.apple.security.app-sandbox",
    "com.apple.security.app-sandbox.optional",
    "com.apple.security.app-protection"
};
extern int __sandbox_ms(char* policyname, int call, void* args);
```
Source: https://github.com/0xbf00/libsecinit (reimplementation of Apple's
`libsystem_secinit.dylib`; author states it is 1:1 with Apple's logic). **No primary
Apple source publishes `libsecinit`'s source**; this is a reverse-engineering. Mark as
inferred-from-RE.

**Detection sub-signals:**

**(a) Container path.** App-Sandboxed apps get `~/Library/Containers/<bundle-id>/Data`.
Queryable via the private `sandbox_container_path_for_pid(getpid(), buf, len)` (signal #2),
which returns `0` and fills `buf` for containerized apps. For `sandbox-exec` sandboxes it
returns `-1` ("sandboxed but not containerized") — confirmed by `sbtool.c`:
```c
rc = sandbox_container_path_for_pid(pid, container, 1024);
if (rc == 0) printf("PID %d Container: %s\n", pid, container);
else printf("PID %d is sandboxed, but not containerized\n", pid);
```
Source: https://newosxbook.com/src.jl?tree=listings&file=/sbtool.c
Empirical (this machine): returns `-1` under `sandbox-exec`.

**(b) HOME remapping.** Inside App Sandbox, `HOME` (and CoreFoundation's notion of the
user domain) points at the container `Data` dir, not the real home. Apple DTS (forums):
> "FileManager.urls(for:in:) returns URLs relative to your app's container rather than the
> user's real home directory… If you want the path to the real home directory, you'll have
> to get it via other means. The approach I generally use involves `getpwuid`."
Source: https://developer.apple.com/forums/thread/107593 (Apple DTS engineer, official
Apple Developer Forums). So `HOME != getpwuid(getuid())->pw_dir` is an App-Sandbox signal.

**(c) Entitlements check (binary signing, not runtime).** Check whether the main bundle's
binary carries `com.apple.security.app-sandbox`. Two ways:
- Code Signing API: `SecStaticCodeCreateWithPath` + `SecRequirementCreateWithString(CFSTR("entitlement[\"com.apple.security.app-sandbox\"] exists"))` + `SecStaticCodeCheckValidityWithErrors`. (Community pattern; the requirement-string syntax is documented in the `csreq(1)` / Code Signing docs.)
- `csops(getpid(), CS_OPS_ENTITLEMENTS_BLOB, ...)` to read the raw entitlements blob (signal #7).
Apple QA1773 (primary): "Every Mach-O executable must have an entitlements file, and
request the `com.apple.security.app-sandbox` entitlement."
Source: https://developer.apple.com/library/archive/qa/qa1773/_index.html

**What it proves.** (a)/(b) prove "I'm in an App Sandbox container" (runtime). (c) proves
"my binary is *signed* to be sandboxed" — for a normally-launched App-Sandbox app these
coincide, but (c) alone does **not** prove current confinement (a binary could be signed
sandboxed but launched unsandboxed in a dev setting), and (c) does **not** detect
`sandbox-exec` (no entitlement).

**Reliability / caveats.** (a) is the most authoritative App-Sandbox signal and is a
private SPI. (b) is spoofable by setting `HOME` manually (false positive) and is
App-Sandbox-specific (won't fire for `sandbox-exec`, which does **not** remap `HOME` —
Agent Safehouse explicitly keeps your real `$HOME` and just denies paths under it). (c)
requires the binary to be a signed bundle; a CLI tool like pi is typically **not** a
signed bundle, so (c) is only relevant if pi is itself App-Sandboxed (unlikely for a CLI).

---

### 4. Environment-variable signals

**`sandbox-exec` sets nothing distinctive.** Empirical (this machine): running `env` under
`sandbox-exec -p '(version 1)(allow default)'` produces an environment identical to the
parent except for the shell-set `_` variable. There is no `SANDBOX_*`, `SEATBELT_*`, or
profile-name env var. (Confirmed: no `APP_SANDBOX_*` or `CFFIXED_*` set by `sandbox-exec`.)

**`APP_SANDBOX_CONTAINER_ID`** is the community App-Sandbox signal (set by the system to
the app's bundle id when launched into a container). Widely cited:
```swift
let isSandboxed = ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] != nil
```
**Documented status: NOT documented by Apple.** Confirmed by grep of the installed SDK
(`/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk`) — `APP_SANDBOX_CONTAINER_ID`
does **not** appear in any SDK header. No Apple developer doc was found that names it.
**Empirical capture failed on this machine**: `ps eww` does not expose the environment of
GUI apps launched by `launchd`/`loginwindow` on modern macOS (SIP), so I could not
directly observe it for Calculator/TextEdit. Treat as **undocumented implementation
detail, inferred from widespread community usage** — reliable in practice but spoofable
(an attacker/parent can `export APP_SANDBOX_CONTAINER_ID=x` to cause a false positive),
and could change without notice.

**`CFFIXED_USER_HOME`** is a CoreFoundation internal override for the user home; it is not
a sandbox indicator per se (it can be set outside sandbox). Not in SDK headers (grep).
Treat as anecdotal.

**`XPC_SERVICE_NAME`, `XPC_FLAGS`** are set for XPC services (which are often sandboxed)
but are not sandbox indicators themselves.

Citations:
- Empirical (this machine): `env` diff under `sandbox-exec` — only `_` differs.
- SDK grep: `APP_SANDBOX_CONTAINER_ID` absent from `MacOSX15.5.sdk` headers.
- Community usage: https://stackoverflow.com/questions/12177948/how-do-i-detect-if-my-app-is-sandboxed (secondary; not a primary source).

---

### 5. Filesystem / path-based signals

**Container path.** `~/Library/Containers/<bundle-id>/Data` is the documented App-Sandbox
container location. Confirmed present on this machine (hundreds of `com.apple.*` and
third-party containers under `~/Library/Containers`). Apple File System guide and the DTS
forum answer document the container model.

**`/var/container/...`** style paths are an **iOS** convention (the iOS sandbox root),
not macOS. On macOS the container is under the user's `~/Library/Containers`. Do **not**
key off `/var/container` on macOS.

**Read-only probes.** Some heuristics try writing to a sentinel path and catching EPERM.
This is **profile-dependent and unreliable** (a profile may allow the probe path) and is
noisy (it actually attempts the operation). Prefer `sandbox_check`.

**What it proves.** Path containment under `~/Library/Containers/...` suggests App Sandbox
but is not authoritative (a non-sandboxed process can also live there). Stability: the
container location is a stable Apple contract (it's the documented App-Sandbox data home),
but relying on the *path string* is weaker than asking the sandbox API directly (signal #2).

Citations:
- Apple File System Basics (archive): https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html
- Apple DTS forum answer: https://developer.apple.com/forums/thread/107593

---

### 6. `csops` / `CS_DEBUGGED` / code-signing flags

**API / mechanism.** `int csops(pid_t pid, unsigned int ops, void *useraddr, size_t usersize);`
— syscall, declared in XNU `bsd/sys/codesign.h`. `CS_OPS_STATUS` (0) returns the process's
code-signing status flags.

**The `CS_*` flags** (from `bsd/sys/codesign.h`, Apple open source):
```
CS_VALID, CS_ADHOC, CS_GET_TASK_ALLOW, CS_INSTALLER, CS_HARD, CS_KILL,
CS_RESTRICT, CS_ENFORCEMENT, CS_REQUIRE_LV, CS_RUNTIME, CS_DEBUGGED
(0x10000000: "process is currently or has previously been debugged…"),
CS_SIGNED, CS_PLATFORM_BINARY, CS_PLATFORM_PATH, …
```
**None of these flags indicate sandbox status.** `CS_DEBUGGED` is about debugging
(`ptrace`/`CS_DEBUGGED` allows running with invalid pages), **not** sandboxing.

**What `csops` *can* do for sandbox detection (indirectly):** `CS_OPS_ENTITLEMENTS_BLOB`
(7) and `CS_OPS_DER_ENTITLEMENTS_BLOB` (16) retrieve the process's entitlements blob, from
which you can check for `com.apple.security.app-sandbox`. This is the same check as
signal 3(c), just via the syscall instead of the Security framework. It proves "signed to
be sandboxed", not "currently confined", and does not detect `sandbox-exec`.

**Reliability.** Not a direct sandbox signal. Useful only as an entitlements source.

Citations:
- XNU `bsd/sys/codesign.h`: https://github.com/apple/darwin-xnu/blob/main/bsd/sys/codesign.h (legacy mirror; current: `apple-oss-distributions/xnu`). Versioned snapshot: https://newosxbook.com/src.php?file=%2Fbsd%2Fsys%2Fcodesign.h&tree=xnu
- `csops` syscall presence: confirmed referenced in on-system `sys/sysctl.h`, `sys/syscall.h`, `EndpointSecurity/ESMessage.h`.

---

### 7. `proc_pidpath` / `libproc` and the launch path

**API / mechanism.** `int proc_pidpath(int pid, void *buffer, uint32_t buffersize);` from
`<libproc.h>` (on-system SDK; available since 10.5). Returns the full executable path of a
pid.

**Hypothesis:** "if my parent (or an ancestor) is `/usr/bin/sandbox-exec`, I was launched
under a sandbox profile."

**Empirical (this machine): NEGATIVE.** `sandbox-exec` **execs the child in place** — it
does not stay around as the parent. Measured:
- normal: `getppid() = X`, `proc_pidpath(getppid()) = /bin/bash`
- under `sandbox-exec -p '(allow default)'`: `getppid() = X` (same), `proc_pidpath(getppid()) = /bin/bash`

So the child's parent is the original shell, **not** `sandbox-exec`. The launch-path /
parent-PID heuristic **does not work** for `sandbox-exec`. (It might catch a wrapper that
forks and waits, but `sandbox-exec` does not, and Agent Safehouse ultimately invokes
`sandbox-exec`, so this signal is unreliable for the target use case.)

**What it proves.** Essentially nothing reliable for sandbox detection. At best, if an
ancestor path is a *known sandboxing wrapper binary* (e.g. a custom app), you could infer
"launched by a sandboxer" — but that is wrapper-specific, not generic, and the task
explicitly wants generic detection.

Citations:
- `<libproc.h>` (on-system): `/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk/usr/include/libproc.h`
- Empirical (this machine): parent-path test under `sandbox-exec`.

---

### 8. `sysctl` / `kernproc` introspection

**No per-process "sandboxed" flag is exposed via `sysctl`.** No primary source was found
that exposes a per-process sandbox boolean through `sysctl`/`kern.proc`. The
`security.mac.sandbox.*` namespace exists at the **system** level:
```
security.mac.sandbox.audio_active: 0
security.mac.sandbox.sentinel: .sb-c8b3b86a
security.mac.qtn.sandbox_enforce: 1
```
(these are system-wide MAC sysctls, not per-process). `kernproc`/`KERN_PROC` sysctls return
process metadata (pid, ppid, uid, path) but **not** a sandbox flag.

**The one interesting sysctl — `security.mac.sandbox.sentinel`** — is covered as signal #9.

Citations:
- XNU `bsd/sys/sysctl.h`: https://github.com/apple-oss-distributions/xnu/blob/xnu-10002.1.13/bsd/sys/sysctl.h
- `sysctl -a | grep sandbox` (on-system, empirical).

---

### 9. seatbelt / `sandboxd` — the `security.mac.sandbox.sentinel` convention

**`sandboxd(8)`** is the userland helper for the `Sandbox.kext` kernel extension; it logs
violations and symbolicates backtraces. It is **not** a query API for "am I sandboxed?"
(per `sandboxd(8)` man page: "This command is not intended to be invoked directly.")

**`security.mac.sandbox.sentinel`** is a system sysctl whose **read being denied** is used
by Apple's own `/usr/bin/security` CLI as a pre-flight sandbox check. From
`anthropic-experimental/sandbox-runtime` PR #215 (which had to allow it):
> "The `security` CLI reads `security.mac.sandbox.sentinel` as a pre-flight sandbox check.
> When the read fails with EPERM it aborts before attempting any Keychain operation… The
> sentinel is enforced by seatbelt (not a deeper kernel mechanism): default sandbox
> profiles simply don't include an allow rule for it… the sentinel is a convention, not a
> security boundary. It signals to callers that they are in a sandbox, prompting them to
> self-restrict."
Source: https://github.com/anthropic-experimental/sandbox-runtime/pull/215

**Empirical (this machine):**
- unsandboxed: `sysctlbyname("security.mac.sandbox.sentinel")` → `0`, value `.sb-c8b3b86a`
- under `sandbox-exec -p '(allow default)'`: → `0`, same value (read **allowed**)
- under a `(deny default)` profile that doesn't allow this sysctl-read: → EPERM (the
  `security` CLI's signal)

**What it proves.** An **EPERM** on this read implies "a seatbelt profile is denying this
sysctl-read" → likely sandboxed under a deny-default profile (e.g. Agent Safehouse's
`(deny default)`). A **successful** read is **inconclusive** (it succeeds both unsandboxed
and under allow-default profiles). So it is a one-way, profile-dependent corroborating
signal, **not** a reliable standalone detector.

**Reliability.** Low–medium. Profile-dependent (a profile can explicitly allow it, as
`sandbox-runtime` did). Useful only as a secondary hint, and notably it is the *convention
Apple itself uses* for sandboxed-tool self-detection in `security`.

Citations:
- `sandboxd(8)` man page (on-system)
- `sandbox-runtime` PR #215: https://github.com/anthropic-experimental/sandbox-runtime/pull/215
- Empirical (this machine): sentinel read test.

---

### 10. `containermanagerd` / ContainerManager framework

`containermanagerd` manages App-Sandbox containers (creating `~/Library/Containers/<id>`,
mapping `HOME`, etc.). It is an App-Sandbox-only subsystem and is **private** (no public
query API). For detection it is **redundant**: the same information (container path) is
available via the private `sandbox_container_path_for_pid` (signal #2) without talking to
the daemon. No primary source found for a public query interface. Not recommended.

---

## How Agent Safehouse actually sandboxes

**Primary source (its own README):**
> "Agent Safehouse uses `sandbox-exec` with composable policy profiles and a deny-first
> model."

And from the docs (agent-safehouse.dev / mintlify):
> "At its core, Safehouse is a Bash script that: 1. Assembles a policy from layered `.sb`
> (Sandbox Profile Language) files; 2. Replaces placeholders like `HOME_DIR` with actual
> absolute paths; 3. Invokes `sandbox-exec` with the composed policy and your command."

So Agent Safehouse is **purely a `sandbox-exec` wrapper** — it assembles an SBPL profile
(starting from `(deny default)` in `00-base.sb`) and hands it to `/usr/bin/sandbox-exec`.
It does **not** use a custom kernel extension, a container, or any mechanism outside the
standard seatbelt APIs.

**Implication for detection.** A generic seatbelt detector — specifically
`sandbox_check(getpid(), NULL, 0)` — **will** detect Agent Safehouse, because Agent
Safehouse's effect is exactly "attach a seatbelt profile to the agent process." No
Agent-Safehouse-specific signal is required. Confirming empirically: running any binary
under `sandbox-exec` makes `sandbox_check` return `1` (tested above).

**Caveats specific to Safehouse's profile shape.**
- It uses `(deny default)`, so the `security.mac.sandbox.sentinel` sysctl-read will likely
  EPERM unless an appended profile allows it — i.e. the sentinel signal would also fire,
  but `sandbox_check` is strictly better.
- It does **not** remap `HOME` (it keeps your real `$HOME` and denies paths under it), so
  the HOME-remap signal (#5) will **not** fire for Agent Safehouse. Don't rely on it.
- It does **not** set `APP_SANDBOX_CONTAINER_ID` (that's an App-Sandbox-only env var), so
  signal #3 will **not** fire either. The only reliable generic signal is #1.

Citations:
- README: https://raw.githubusercontent.com/eugene1g/agent-safehouse/main/README.md
- Docs: https://agent-safehouse.dev / https://eugene1g-agent-safehouse.mintlify.app/concepts/overview
- Repo: https://github.com/eugene1g/agent-safehouse

---

## Recommended detection strategy

**Primary signal (covers the common case with one cheap, authoritative call):**
`sandbox_check(getpid(), NULL, 0)` → nonzero means "sandboxed by some seatbelt profile."
This single check catches **both** Agent Safehouse (`sandbox-exec`) and App Sandbox.

**Refinement (distinguish App Sandbox from generic seatbelt):** call
`sandbox_container_path_for_pid(getpid(), buf, sizeof buf)`. Returns `0` + a path → App
Sandbox container. Returns `-1` → sandboxed but not containerized (i.e. `sandbox-exec` /
Agent Safehouse style).

**Belt-and-suspenders fallbacks** (for environments where the private SPI might be
unavailable, or to corroborate). These are App-Sandbox-flavored and spoofable, so they
should only **add** confidence, never override a `sandbox_check == 0`:
- `APP_SANDBOX_CONTAINER_ID` env present → App-Sandbox hint.
- `HOME` != `getpwuid(getuid())->pw_dir` → App-Sandbox HOME-remap hint.
- entitlement `com.apple.security.app-sandbox` present (codesign API / `csops`) → binary
  is signed sandboxed (only meaningful if pi is itself a signed bundle).
- `security.mac.sandbox.sentinel` read returns EPERM → a denying profile is active (weak).

### Pseudocode

```c
#include <dlfcn.h>
#include <unistd.h>
#include <pwd.h>
#include <string.h>
#include <stdlib.h>

typedef int (*sandbox_check_t)(pid_t, const char *, int);
typedef int (*sandbox_container_path_for_pid_t)(pid_t, char *, size_t);

struct SandboxState {
    bool sandboxed;
    const char *kind;   // "seatbelt" | "app-sandbox" | "app-sandbox(env)" | "" (none)
    const char *basis;  // which signal fired
};

struct SandboxState detect_sandbox(void) {
    struct SandboxState s = { false, "", "" };

    // 1) Primary: generic seatbelt self-check (private SPI, de-facto stable).
    sandbox_check_t check = (sandbox_check_t)dlsym(RTLD_DEFAULT, "sandbox_check");
    if (check && check(getpid(), NULL, 0 /* SANDBOX_FILTER_NONE */) != 0) {
        s.sandboxed = true;
        s.kind = "seatbelt";
        s.basis = "sandbox_check";

        // Refine: App Sandbox container?
        sandbox_container_path_for_pid_t cpf =
            (sandbox_container_path_for_pid_t)dlsym(RTLD_DEFAULT, "sandbox_container_path_for_pid");
        char buf[4096] = {0};
        if (cpf && cpf(getpid(), buf, sizeof buf) == 0) {
            s.kind = "app-sandbox";
            s.basis = "sandbox_container_path_for_pid";
        }
        return s;
    }

    // 2) Fallbacks (App-Sandbox-flavored; spoofable, only add confidence).
    if (getenv("APP_SANDBOX_CONTAINER_ID") != NULL) {
        s.sandboxed = true; s.kind = "app-sandbox"; s.basis = "APP_SANDBOX_CONTAINER_ID";
        return s;
    }
    const char *home = getenv("HOME");
    struct passwd *pw = getpwuid(getuid());
    if (home && pw && pw->pw_dir && strcmp(home, pw->pw_dir) != 0) {
        s.sandboxed = true; s.kind = "app-sandbox"; s.basis = "HOME!=realhome";
        return s;
    }
    // (entitlement check via SecStaticCodeCheckValidity / csops omitted; only relevant
    //  if the host binary is a signed bundle.)

    // 3) Weak corroborator: sentinel sysctl denial.
    //    (omitted by default; enable only if you want the /usr/bin/security-style hint)

    return s;  // not detected
}
```

### Decision guidance

| You want to know… | Use |
|---|---|
| "Am I under *any* sandbox profile?" (covers Agent Safehouse + App Sandbox) | `sandbox_check(getpid(), NULL, 0)` |
| "Am I in an **App Sandbox** container specifically?" | `sandbox_container_path_for_pid` == 0 (and/or `APP_SANDBOX_CONTAINER_ID` / HOME-remap) |
| "Am I under a **`sandbox-exec`-style** sandbox (e.g. Agent Safehouse)?" | `sandbox_check` == 1 **and** `sandbox_container_path_for_pid` == -1 |
| "Was I launched by a *specific* wrapper app?" | Not generically detectable; `sandbox_check` is the portable answer. |

---

## Open questions / uncertainty

1. **Does `sandbox_check` return `1` for App-Sandbox (entitlement-driven) confinement,
   or only for `sandbox-exec`?** Inferred yes (both attach a `Sandbox.kext` profile, and
   `libsecinit` applies the profile via `__sandbox_ms`), but **not separately empirically
   tested** on this machine (would require a signed bundle with the
   `com.apple.security.app-sandbox` entitlement). Recommend building a tiny entitled test
   app to confirm before relying on it for the App-Sandbox case.

2. **Is `APP_SANDBOX_CONTAINER_ID` set for *all* App-Sandboxed apps, or only some?** Could
   not empirically confirm on this machine (`ps eww` cannot read GUI-app env under SIP).
   Community consensus says "all", but it is undocumented. A bundled test app would
   settle it.

3. **Private-SPI stability.** `sandbox_check`, `sandbox_container_path_for_pid`, and
   `sandbox_init_with_parameters` are **not** in the public `<sandbox.h>` and carry no
   Apple stability guarantee. Chromium and WebKit have depended on them for years, so they
   are de-facto stable, but a future macOS could remove/rename them. Mitigation: dlsym +
   graceful fallback to the env/path heuristics.

4. **`SANDBOX_CHECK_RESERVED` and `__MAC_OS_X_VERSION_MIN_REQUIRED`-gated symbols.** No
   primary source found for a symbol literally named `SANDBOX_CHECK_RESERVED`. The
   min-version gating is an SDK/build-time availability mechanism, not a runtime signal.

5. **Will Apple remove `sandbox-exec`?** It has been "DEPRECATED" in the man page since
   2017 yet is still present and functional on macOS 15.5 (and the SDK ships through
   `MacOSX26.2.sdk`). If removed, Agent Safehouse and similar wrappers break — but App
   Sandbox and `sandbox_check`-based detection would still work for App-Sandboxed
   processes. Worth monitoring.

6. **pi-as-CLI vs pi-as-bundle.** pi is a CLI tool, not a signed `.app` bundle, so the
   entitlement-based signal 3(c) is unlikely to ever apply to pi itself. The realistic
   detection target is "pi was launched under `sandbox-exec` (Agent Safehouse)" — for
   which `sandbox_check` is the answer.

---

## Citations (primary sources)

- On-system SDK header (public, deprecated): `/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk/usr/include/sandbox.h` — `sandbox_init`/`sandbox_free_error`/`kSBXProfile*`, `API_DEPRECATED macos(10.5,10.8)`.
- On-system man pages: `sandbox-exec(1)`, `sandbox_init(3)`, `sandbox(7)`, `sandboxd(8)` (all marked DEPRECATED except the overview/daemon pages).
- On-system `<libproc.h>`: `proc_pidpath` (since 10.5).
- Chromium `sandbox/mac/seatbelt.cc` — canonical `sandbox_check(getpid(), NULL, 0)` self-check: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/sandbox/mac/seatbelt.cc
- WebKit `SandboxSPI.h` — private SPI declarations (`sandbox_check`, `sandbox_container_path_for_pid`, `sandbox_init_with_parameters`, `sandbox_compile_*`, `sandbox_apply`, `SANDBOX_CHECK_NO_REPORT`, `APP_SANDBOX_READ*`). Location: GitHub repo `WebKit/WebKit`, branch `master`, file path `Source/WTF/wtf/spi/darwin/SandboxSPI.h`. Assemble the blob URL as `https://github.com` + `/WebKit/WebKit/blob/master/Source/WTF/wtf/spi/darwin/SandboxSPI.h` (raw form: `https://raw.githubusercontent.com` + `/WebKit/WebKit/master/Source/WTF/wtf/spi/darwin/SandboxSPI.h`). The declarations quoted in §1 are from a web-search excerpt of this file; confirm against the source before relying on them.
- XNU `bsd/sys/codesign.h` — `csops`, `CS_OPS_STATUS`, `CS_OPS_ENTITLEMENTS_BLOB`, `CS_DEBUGGED` (no sandbox flag): https://github.com/apple/darwin-xnu/blob/main/bsd/sys/codesign.h ; current mirror https://github.com/apple-oss-distributions/xnu ; versioned https://newosxbook.com/src.php?file=%2Fbsd%2Fsys%2Fcodesign.h&tree=xnu
- XNU `bsd/sys/sysctl.h` (sysctl structure): https://github.com/apple-oss-distributions/xnu/blob/xnu-10002.1.13/bsd/sys/sysctl.h
- XNU MAC framework `security/mac_base.c`, `mac_framework.h`, `mac_policy.h`: https://github.com/apple-oss-distributions/xnu
- Apple QA1773 (App Sandbox entitlement requirement): https://developer.apple.com/library/archive/qa/qa1773/_index.html
- Apple Developer Forums DTS answer (HOME remap, `getpwuid` for real home): https://developer.apple.com/forums/thread/107593
- Apple File System Basics (container model): https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html
- `libsecinit` reimplementation (entitlements checked for sandbox candidacy, `__sandbox_ms`): https://github.com/0xbf00/libsecinit (reverse-engineered; not Apple-primary)
- `sbtool.c` + reverse-engineered `sandbox.h` (operation names, filter constants, `sandbox_check`/`sandbox_container_path_for_pid` semantics): https://newosxbook.com/src.jl?tree=listings&file=/sbtool.c and `/sandbox.h`
- D. Blazakis, *The Apple Sandbox* (seatbelt design, MAC integration, `__sandbox_ms`): https://www.ise.io/wp-content/uploads/2017/07/apple-sandbox.pdf
- `security.mac.sandbox.sentinel` semantics (Apple `security` CLI pre-flight check): https://github.com/anthropic-experimental/sandbox-runtime/pull/215
- Agent Safehouse README (uses `sandbox-exec`): https://raw.githubusercontent.com/eugene1g/agent-safehouse/main/README.md ; repo https://github.com/eugene1g/agent-safehouse ; docs https://agent-safehouse.dev

### Note on the WebKit SPI URL
The WebKit `SandboxSPI.h` file lives in GitHub repo `WebKit/WebKit` (owner `WebKit`,
repo `WebKit`), branch `master`, at path `Source/WTF/wtf/spi/darwin/SandboxSPI.h`.
Because the rendering of that exact URL was repeatedly corrupted during authoring, it is
cited above by repo + branch + path rather than as a single inline link. To open it,
assemble: `https://github.com` + `/WebKit/WebKit/blob/master/Source/WTF/wtf/spi/darwin/SandboxSPI.h`.
The declarations quoted in §1 come from a web-search excerpt of this file (not a
separately fetched raw file); verify against the source before relying on them.

---

*Research date: 2026-07-27. Machine: macOS 15.5 (Apple Silicon), SDK MacOSX15.5.sdk. All
empirical claims were run on this machine; all "inferred" claims are labeled as such.*