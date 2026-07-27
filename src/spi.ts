import koffi from "koffi";
import type { SandboxCheckFn } from "./detect.ts";

export function loadSandboxCheck(): SandboxCheckFn | null {
  if (process.platform !== "darwin") return null;
  try {
    const lib = koffi.load("/usr/lib/libSystem.B.dylib");
    const sandbox_check = lib.func(
      "int sandbox_check(int pid, const char *op, int type)"
    );
    return (pid, op, type) => sandbox_check(pid, op ?? null, type);
  } catch {
    return null;
  }
}
