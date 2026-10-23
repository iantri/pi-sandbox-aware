import { createRequire } from "node:module";
import type { SandboxCheckFn } from "./detect.ts";

const require = createRequire(import.meta.url);

export function loadSandboxCheck(): SandboxCheckFn | null {
  if (process.platform !== "darwin") return null;
  try {
    const koffi = require("koffi");
    const lib = koffi.load("libsandbox.1.dylib");
    const sandbox_check = lib.func(
      "int sandbox_check(int pid, const char *op, int type)"
    );
    return (pid, op, type) => sandbox_check(pid, op ?? null, type);
  } catch {
    return null;
  }
}
