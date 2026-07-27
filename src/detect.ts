export type SandboxCheckFn = (pid: number, op: string | null, type: number) => number;

export function detectSandbox(sandboxCheck: SandboxCheckFn): boolean {
  return sandboxCheck(process.pid, null, 0) !== 0;
}
