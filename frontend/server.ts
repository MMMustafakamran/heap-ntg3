/**
 * HARNESS: Copilot Runtime for this harness (the Angular quickstart never shows one for Antigravity:
 * its runtime callout links a guide whose only server is a Next.js route; FINDINGS.md #1).
 * Shape: the Node listener from @copilotkit/runtime/v2/node, with an HttpAgent pointed at the
 * Antigravity agent server in ../backend (create_antigravity_app mounts each agent at /<name>).
 * Ports: runtime 8280 (doc: 8200), agent 8281 (doc: 8000). Override with PORT / AGENT_URL.
 * `support` resolves to the same agent so doc snippets with agentId="support" run verbatim.
 */
// quickstart : copilot runtime
import { createServer } from "node:http";
import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { HttpAgent } from "@ag-ui/client";
import { authApp } from "./auth-runtime"; // HARNESS: Authentication guide hook, served under /auth

const agentUrl =
  process.env["AGENT_URL"] ?? "http://localhost:8281/default"; // HARNESS: Antigravity agent server, port 8281 (doc: 8000)

// quickstart : copilot runtime start
const runtime = new CopilotRuntime({
  agents: {
    // quickstart : connect selected agent backend
    default: new HttpAgent({ url: agentUrl }),
    // chat ui : support agent
    support: new HttpAgent({ url: agentUrl }),
    // HARNESS: interrupt + sub-agents pages (backend/interrupts_server.py on 8284). The Headless Interrupts
    // page injects "ticketing", which no page registers; it points at the same harness interrupt agent.
    interrupt: new HttpAgent({ url: "http://localhost:8284/interrupt/" }),
    ticketing: new HttpAgent({ url: "http://localhost:8284/interrupt/" }),
    subagents: new HttpAgent({ url: "http://localhost:8284/subagents/" }),
  },
  // a2ui : enable a2ui middleware start
  a2ui: {},
  // a2ui : enable a2ui middleware end
});
// quickstart : copilot runtime end

const port = Number(process.env["PORT"] ?? 8280); // HARNESS: runtime port 8280 (doc uses 8200; workspace port plan)

// quickstart : create copilot node listener start
const copilotListener = createCopilotNodeListener({
  runtime,
  basePath: "/api/copilotkit",
  cors: true,
});
// HARNESS: /auth/* goes to the Authentication guide's hooked runtime (auth-runtime.ts).
createServer((req, res) => {
  if (req.url?.startsWith("/auth/")) {
    req.url = req.url.slice("/auth".length);
    authApp(req, res);
    return;
  }
  copilotListener(req, res);
}).listen(port, () => {
  console.log(
    `Copilot Runtime listening at http://localhost:${port}/api/copilotkit`,
  );
  console.log(`Antigravity agent: ${agentUrl}`);
});
// quickstart : create copilot node listener end
