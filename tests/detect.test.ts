import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSandbox } from "../extensions/sandbox-aware/detect.ts";

test("detectSandbox returns true when sandbox_check returns 1", () => {
  const sandboxCheck = () => 1;
  assert.equal(detectSandbox(sandboxCheck), true);
});

test("detectSandbox returns false when sandbox_check returns 0", () => {
  const sandboxCheck = () => 0;
  assert.equal(detectSandbox(sandboxCheck), false);
});

test("detectSandbox returns true for any nonzero sandbox_check result", () => {
  const sandboxCheck = () => 5;
  assert.equal(detectSandbox(sandboxCheck), true);
});
