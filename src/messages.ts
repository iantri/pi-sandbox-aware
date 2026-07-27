export interface SandboxStatus {
  notifyText: string;
  notifySeverity: "info" | "warning" | "error";
  footerText: string;
}

export function sandboxStatus(sandboxed: boolean): SandboxStatus {
  if (sandboxed) {
    return {
      notifyText: "Sandbox status: 🔒 active",
      notifySeverity: "info",
      footerText: "🔒 sb",
    };
  }
  return {
    notifyText: "Sandbox status: 🔓 INACTIVE - WARNING: Full system access",
    notifySeverity: "warning",
    footerText: "🔓 NO SB",
  };
}

export function sandboxContextNote(sandboxed: boolean): string | null {
  if (!sandboxed) return null;
  return (
    "<sandbox-context>This coding agent is running in a sandbox that restricts its access. " +
    "If an operation fails with \"Operation not permitted\" or EPERM on something that would normally work, it is likely the sandbox blocking you. " +
    "If you are blocked by the sandbox, ask the user to adjust it: specify the exact file and/or network path/domain you need access to, and whether that should be read-only or read-write. " +
    "Prefer read-only whenever possible. Escalate only when you have actually been blocked, not preemptively.</sandbox-context>"
  );
}
