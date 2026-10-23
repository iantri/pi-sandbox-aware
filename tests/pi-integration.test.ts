import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { SandboxCheckLoader } from "../extensions/pi-sandbox-aware/index.ts";
import { createHarness, systemText } from "./harness.ts";

for (const scenario of [
  { name: "sandboxed", loader: () => () => 1, status: "🔒 sb", severity: "info", guidance: true },
  { name: "not sandboxed", loader: () => () => 0, status: "🔓 NO SB", severity: "warning", guidance: false },
  { name: "loader failure", loader: () => { throw new Error("Fixture loader failure"); }, status: "❔ sb?", severity: "warning", guidance: true },
  { name: "call failure", loader: () => () => { throw new Error("Fixture call failure"); }, status: "❔ sb?", severity: "warning", guidance: true },
] satisfies Array<{ name: string; loader: SandboxCheckLoader; status: string; severity: string; guidance: boolean }>) {
  test(`real Pi: ${scenario.name} reaches UI and the provider request`, { timeout: 15000 }, async (t) => {
    const h = await createHarness(t, { sandboxCheckLoader: scenario.loader });
    assert.equal(h.notifications.length, 1);
    assert.equal(h.notifications[0].severity, scenario.severity);
    assert.equal(h.statuses.length, 1);
    assert.equal(h.statuses[0].key, "sandbox");
    assert.ok(h.statuses[0].text?.includes(scenario.status));
    await h.session.prompt("A fictional test prompt.");
    assert.equal(h.session.getLastAssistantText(), "Fixture reply.");
    assert.equal(h.requests.length, 1);
    const prompt = systemText(h.requests[0]);
    assert.match(prompt, /Fixture system prompt\./);
    assert.equal(prompt.includes("<sandbox-context>"), scenario.guidance);
    if (scenario.guidance) assert.match(prompt, /not preemptively/);
    if (scenario.status === "❔ sb?") {
      assert.match(prompt, /may be running in a sandbox/);
      assert.doesNotMatch(prompt, /This coding agent is running in a sandbox/);
    }
    await h.close();
    assert.deepEqual(h.statuses.at(-1), { key: "sandbox", text: undefined });
    assert.deepEqual(h.errors, []);
  });
}

test("real Pi: extension instances keep their own detection state", { timeout: 15000 }, async (t) => {
  const first = await createHarness(t, { sandboxCheckLoader: () => () => 0 });
  await t.test("another session's detection failure does not change the first session", async (t) => {
    const second = await createHarness(t, { sandboxCheckLoader: () => {
      throw new Error("Fixture loader failure");
    } });
    await first.session.prompt("First session prompt.");
    await second.session.prompt("Second session prompt.");
    assert.equal(first.requests.length, 1);
    assert.equal(second.requests.length, 1);
    assert.doesNotMatch(systemText(first.requests[0]), /<sandbox-context>/);
    assert.match(systemText(second.requests[0]), /may be running in a sandbox/);
    assert.deepEqual(first.errors, []);
    assert.deepEqual(second.errors, []);
  });
});

test("real Pi: guidance works without a terminal UI", { timeout: 15000 }, async (t) => {
  const h = await createHarness(t, { sandboxCheckLoader: () => () => 1, hasUI: false });
  await h.session.prompt("A fictional test prompt.");
  assert.equal(h.requests.length, 1);
  assert.match(systemText(h.requests[0]), /<sandbox-context>/);
  await h.close();
  assert.deepEqual(h.notifications, []);
  assert.deepEqual(h.statuses, []);
  assert.deepEqual(h.errors, []);
});

test("real Pi: reload clears the previous status and adds guidance only once", { timeout: 15000 }, async (t) => {
  const h = await createHarness(t, { sandboxCheckLoader: () => () => 1 });
  await h.session.prompt("Before reload.");
  await h.session.reload();
  assert.equal(h.notifications.length, 2);
  assert.equal(h.statuses.length, 3);
  assert.deepEqual(h.statuses[1], { key: "sandbox", text: undefined });
  assert.ok(h.statuses[2].text?.includes("🔒 sb"));
  await h.session.prompt("After reload.");
  assert.equal(h.requests.length, 2);
  assert.equal(systemText(h.requests[1]).split("<sandbox-context>").length - 1, 1);
  await h.close();
  assert.deepEqual(h.errors, []);
});

test("real Pi: the package manifest discovers just the pi-sandbox-aware entry point", { timeout: 15000 }, async (t) => {
  // Loading registers handlers; session_start and the native check are covered separately.
  const h = await createHarness(t, { sandboxCheckLoader: () => () => 1 });
  const { DefaultResourceLoader } = await import("@earendil-works/pi-coding-agent");
  const loader = new DefaultResourceLoader({
    cwd: h.session.sessionManager.getCwd(),
    agentDir: process.env.PI_CODING_AGENT_DIR!,
    noExtensions: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../", import.meta.url))],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.extensions.length, 1);
  assert.equal(loaded.extensions[0].path, fileURLToPath(new URL("../extensions/pi-sandbox-aware/index.ts", import.meta.url)));
  assert.equal(loaded.extensions[0].handlers.has("session_start"), true);
});
