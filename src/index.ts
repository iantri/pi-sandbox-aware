import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectSandbox } from "./detect.ts";
import type { SandboxCheckFn } from "./detect.ts";
import { sandboxContextNote, sandboxStatus } from "./messages.ts";
import { loadSandboxCheck } from "./spi.ts";

export type SandboxCheckLoader = () => SandboxCheckFn | null;

let sandboxed: boolean | null = null;

export default function (
  pi: ExtensionAPI,
  sandboxCheckLoader: SandboxCheckLoader = loadSandboxCheck
) {
  pi.on("session_start", async (_event, ctx) => {
    try {
      const sandboxCheck = sandboxCheckLoader();
      sandboxed = sandboxCheck
        ? detectSandbox(sandboxCheck)
        : process.platform === "darwin"
          ? null
          : false;
    } catch {
      sandboxed = null;
    }

    const { notifyText, notifySeverity, footerText } = sandboxStatus(sandboxed);
    if (ctx.hasUI) {
      ctx.ui.notify(notifyText, notifySeverity);
      const themedFooter = sandboxed
        ? ctx.ui.theme.fg("success", footerText)
        : ctx.ui.theme.fg("warning", ctx.ui.theme.bold(footerText));
      ctx.ui.setStatus("sandbox", themedFooter);
    }
  });

  pi.on("before_agent_start", async (event) => {
    const note = sandboxContextNote(sandboxed);
    if (!note) return undefined;
    return { systemPrompt: event.systemPrompt + "\n\n" + note };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus("sandbox", undefined);
  });
}
