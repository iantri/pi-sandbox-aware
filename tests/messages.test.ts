import { test } from "node:test";
import assert from "node:assert/strict";
import { sandboxContextNote, sandboxStatus } from "../extensions/sandbox-aware/messages.ts";

test("sandboxStatus when sandboxed reports an active sandbox", () => {
  const status = sandboxStatus(true);
  assert.equal(status.notifyText, "Sandbox status: 🔒 active");
  assert.equal(status.notifySeverity, "info");
  assert.equal(status.footerText, "🔒 sb");
});

test("sandboxStatus when not sandboxed warns about full system access", () => {
  const status = sandboxStatus(false);
  assert.equal(
    status.notifyText,
    "Sandbox status: 🔓 NOT SANDBOXED - WARNING: Full system access"
  );
  assert.equal(status.notifySeverity, "warning");
  assert.equal(status.footerText, "🔓 NO SB");
});

test("sandboxStatus when detection fails reports an unknown status", () => {
  assert.deepEqual(sandboxStatus(null), {
    notifyText: "Sandbox status: ❔ unknown",
    notifySeverity: "warning",
    footerText: "❔ sb?",
  });
});

test("sandboxContextNote is null when Pi is not sandboxed", () => {
  assert.equal(sandboxContextNote(false), null);
});

test("sandboxContextNote when sandboxed tells the agent how to recognize and escalate a sandbox block", () => {
  const note = sandboxContextNote(true);
  assert.notEqual(note, null);
  assert.match(note as string, /<sandbox-context>/);
  assert.match(note as string, /Operation not permitted/);
  assert.match(note as string, /read-only/);
  assert.match(note as string, /not preemptively/);
});

test("sandboxContextNote preserves caution when sandbox status is unknown", () => {
  const note = sandboxContextNote(null);
  assert.notEqual(note, null);
  assert.match(note as string, /may be running in a sandbox/);
  assert.doesNotMatch(note as string, /This coding agent is running in a sandbox/);
  assert.match(note as string, /Operation not permitted/);
});
