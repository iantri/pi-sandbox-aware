import { test } from "node:test";
import assert from "node:assert/strict";
import extension from "./index.ts";

interface HandlerContext {
  hasUI: boolean;
  ui: {
    notify: (...args: unknown[]) => void;
    setStatus: (...args: unknown[]) => void;
    theme: {
      fg: (color: string, text: string) => string;
      bold: (text: string) => string;
    };
  };
}

test("extension registers handlers and reports sandbox state through Pi seams", async () => {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const notifications: unknown[][] = [];
  const statuses: unknown[][] = [];
  const ctx: HandlerContext = {
    hasUI: true,
    ui: {
      notify: (...args) => notifications.push(args),
      setStatus: (...args) => statuses.push(args),
      theme: {
        fg: (color, text) => `<${color}>${text}</${color}>`,
        bold: (text) => `**${text}**`,
      },
    },
  };

  extension(
    {
      on: (eventName, handler) => {
        handlers.set(eventName, handler);
      },
    } as any,
    () => () => 1
  );

  assert.deepEqual([...handlers.keys()], [
    "session_start",
    "before_agent_start",
    "session_shutdown",
  ]);

  await handlers.get("session_start")!({}, ctx);
  assert.deepEqual(notifications, [["Sandbox status: 🔒 active", "info"]]);
  assert.deepEqual(statuses, [["sandbox", "<success>🔒 sb</success>"]]);

  const result = await handlers.get("before_agent_start")!({
    systemPrompt: "base prompt",
  });
  assert.equal(
    (result as { systemPrompt: string }).systemPrompt,
    "base prompt\n\n<sandbox-context>This coding agent is running in a sandbox that restricts its access. " +
      "If an operation fails with \"Operation not permitted\" or EPERM on something that would normally work, it is likely the sandbox blocking you. " +
      "If you are blocked by the sandbox, ask the user to adjust it: specify the exact file and/or network path/domain you need access to, and whether that should be read-only or read-write. " +
      "Prefer read-only whenever possible. Escalate only when you have actually been blocked, not preemptively.</sandbox-context>"
  );

  await handlers.get("session_shutdown")!({}, ctx);
  assert.deepEqual(statuses, [
    ["sandbox", "<success>🔒 sb</success>"],
    ["sandbox", undefined],
  ]);

  extension(
    {
      on: (eventName, handler) => {
        handlers.set(eventName, handler);
      },
    } as any,
    () => {
      throw new Error("sandbox_check unavailable");
    }
  );

  await handlers.get("session_start")!({}, ctx);
  assert.deepEqual(notifications.at(-1), ["Sandbox status: ❔ unknown", "warning"]);
  assert.deepEqual(statuses.at(-1), ["sandbox", "<warning>**❔ sb?**</warning>"]);

  const unknownResult = await handlers.get("before_agent_start")!({
    systemPrompt: "base prompt",
  });
  assert.match(
    (unknownResult as { systemPrompt: string }).systemPrompt,
    /sandbox status is unknown/
  );
});
