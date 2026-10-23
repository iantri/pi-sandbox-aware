import assert from "node:assert/strict";
import { isAbsolute } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHarness, systemText } from "../tests/harness.ts";

test("native macOS detection and the packaged extension agree with the expected environment", { timeout: 15000 }, async (t) => {
  assert.equal(process.platform, "darwin", "Native verification requires macOS");
  const expected = process.env.PI_SANDBOX_EXPECT;
  assert.ok(expected === "sandboxed" || expected === "not-sandboxed",
    "Set PI_SANDBOX_EXPECT to sandboxed or not-sandboxed");
  const packageRoot = process.env.PI_SANDBOX_PACKAGE_ROOT ?? fileURLToPath(new URL("../", import.meta.url));
  assert.ok(isAbsolute(packageRoot), "PI_SANDBOX_PACKAGE_ROOT must be absolute");
  const h = await createHarness(t, { packageRoot });
  const sandboxed = expected === "sandboxed";
  assert.deepEqual(h.notifications, [{
    text: sandboxed ? "Sandbox status: 🔒 active" : "Sandbox status: 🔓 NOT SANDBOXED - WARNING: Full system access",
    severity: sandboxed ? "info" : "warning",
  }]);
  assert.equal(h.statuses.length, 1);
  assert.ok(h.statuses[0].text?.includes(sandboxed ? "🔒 sb" : "🔓 NO SB"));
  await h.session.prompt("A fictional native verification prompt.");
  assert.equal(h.session.getLastAssistantText(), "Fixture reply.");
  assert.equal(h.requests.length, 1);
  assert.equal(systemText(h.requests[0]).includes("<sandbox-context>"), sandboxed);
  await h.close();
  assert.deepEqual(h.statuses.at(-1), { key: "sandbox", text: undefined });
  assert.deepEqual(h.errors, []);
});
