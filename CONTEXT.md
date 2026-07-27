# Sandbox Awareness

The domain of making pi aware that it is running inside a macOS sandbox, so the agent can reason about its access constraints and escalate to the user when the sandbox blocks it.

## Language

**Sandbox**:
A macOS seatbelt confinement that restricts a process's file, network, and process access according to a profile.
_Avoid_: container, jail, chroot

**Sandboxed**:
The state of running inside a sandbox; the process's access is restricted by a seatbelt profile.
_Avoid_: confined, locked-down

**Not sandboxed**:
The state of running with the user's full system access, not confined by a sandbox.
_Avoid_: unsandboxed, free, unrestricted

**Sandbox block**:
An operation failure (typically EPERM / "Operation not permitted") caused by the sandbox denying an operation that would normally succeed.
_Avoid_: permission error, denial

**Escalation**:
The agent asking the user to adjust the sandbox to allow a specific file path or network domain, naming the access mode it needs.
_Avoid_: request, ask-for-access

**Adjust the sandbox**:
The user loosening the sandbox profile to grant the access the agent requested in an escalation.
_Avoid_: unblock, whitelist, punch-a-hole

**Access mode**:
The kind of access requested in an escalation: read-only or read-write.
_Avoid_: permission, mode