import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import {
  AgentSessionRuntime,
  createAgentSession,
  DefaultResourceLoader,
  initTheme,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionError,
  type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import extension, { type SandboxCheckLoader } from "../extensions/sandbox-aware/index.ts";

export interface WireRequest {
  messages: Array<{ role: string; content: unknown }>;
}

export function systemText(request: WireRequest): string {
  return request.messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content))
    .join("\n");
}

export async function createHarness(t: TestContext, options: {
  sandboxCheckLoader?: SandboxCheckLoader;
  packageRoot?: string;
  hasUI?: boolean;
}) {
  const root = await mkdtemp(join(tmpdir(), "pi-sandbox-aware-test-"));
  const agentDir = join(root, "agent");
  const cwd = join(root, "workspace");
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(root, { recursive: true, force: true });
  });
  await Promise.all([mkdir(agentDir), mkdir(cwd)]);

  const requests: WireRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    if (req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { "content-type": "text/event-stream" });
    const frame = (value: unknown) => res.write(`data: ${JSON.stringify(value)}\n\n`);
    frame({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model",
      choices: [{ index: 0, delta: { role: "assistant", content: "Fixture reply." }, finish_reason: null }] });
    frame({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-model",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 } });
    res.end("data: [DONE]\n\n");
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: {
    fictional: {
      api: "openai-completions",
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      apiKey: "fictional-local-test-key",
      models: [{ id: "fixture-model", reasoning: false, input: ["text"], contextWindow: 32768, maxTokens: 1024 }],
    },
  } }));
  await writeFile(join(agentDir, "settings.json"), JSON.stringify({
    compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off",
  }));
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"),
    modelsStorePath: join(agentDir, "models-cache.json"), allowModelNetwork: false,
  });
  const model = modelRuntime.getModel("fictional", "fixture-model");
  assert.ok(model);
  const loader = new DefaultResourceLoader({
    cwd, agentDir, settingsManager, noExtensions: true,
    additionalExtensionPaths: options.packageRoot ? [options.packageRoot] : [],
    extensionFactories: options.packageRoot ? [] : [(pi) => {
      assert.ok(options.sandboxCheckLoader, "Deterministic tests must inject a sandbox check");
      extension(pi, options.sandboxCheckLoader);
    }],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: "Fixture system prompt.",
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  assert.equal(loader.getExtensions().extensions.length, 1);
  const { session } = await createAgentSession({
    cwd, agentDir, resourceLoader: loader, settingsManager, modelRuntime, model,
    tools: [], thinkingLevel: "off", sessionManager: SessionManager.inMemory(cwd),
  });
  const notifications: Array<{ text: string; severity: string }> = [];
  const statuses: Array<{ key: string; text: string | undefined }> = [];
  const errors: ExtensionError[] = [];
  initTheme("dark", false);
  const ui: ExtensionUIContext = {
    ...session.extensionRunner.getUIContext(),
    notify: (text, severity = "info") => notifications.push({ text, severity }),
    setStatus: (key, text) => statuses.push({ key, text }),
  };
  const runtime = new AgentSessionRuntime(session,
    { cwd, agentDir, modelRuntime, settingsManager, resourceLoader: loader, diagnostics: [] },
    async () => { throw new Error("This harness does not replace sessions"); });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await runtime.dispose();
  };
  t.after(close);
  await session.bindExtensions({
    mode: options.hasUI === false ? "json" : "rpc",
    ...(options.hasUI === false ? {} : { uiContext: ui }),
    onError: (error) => errors.push(error),
  });
  return { session, loader, requests, notifications, statuses, errors, close };
}
