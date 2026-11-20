/**
 * HARNESS (whole file): extra Copilot Runtimes for pages whose runtime side the Angular page itself
 * never shows. Each is scoped to its own port so the other pages keep the plain quickstart runtime
 * (server.ts, 8280). Same Antigravity agent server (8281) behind each.
 *   8286 MCP Apps: `mcpApps.servers` from the Copilot Runtime guide
 *        (docs.copilotkit.ai/angular/google-antigravity/backend/copilot-runtime). The MCP Apps page never
 *        names an MCP app server; the public Excalidraw MCP app server is used (override MCP_SERVER_URL).
 *   8287 Threads (Threads Drawer, Headless Threads): CopilotKit Intelligence with CPK_INTELLIGENCE_API_KEY
 *        (env; locally from the gitignored frontend/.env.intelligence). Neither page shows runtime code.
 *   8288 Voice: transcriptionService from the "Voice backend setup" link (the React voice page),
 *        moved to this Node runtime as is (transcription-service.ts). Needs OPENAI_TRANSCRIPTION_API_KEY.
 */
import { createServer } from "node:http";
import { HttpAgent } from "@ag-ui/client";
import { CopilotKitIntelligence, CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { createTranscriptionService } from "./transcription-service";

try {
  process.loadEnvFile(".env.intelligence"); // HARNESS: local key file (gitignored); CI passes the env var
} catch {}

const agentUrl = process.env["AGENT_URL"] ?? "http://localhost:8281/default";
const agent = () => new HttpAgent({ url: agentUrl });

function serve(port: number, name: string, runtime: CopilotRuntime): void {
  createServer(createCopilotNodeListener({ runtime, basePath: "/api/copilotkit", cors: true })).listen(port, () =>
    console.log(`${name} runtime listening at http://localhost:${port}/api/copilotkit`),
  );
}

// MCP Apps (Copilot Runtime guide's mcpApps block; server URL is HARNESS)
serve(
  8286,
  "MCP Apps",
  new CopilotRuntime({
    agents: { default: agent() },
    mcpApps: {
      servers: [
        { type: "http", url: process.env["MCP_SERVER_URL"] || "https://mcp.excalidraw.com/mcp", serverId: "excalidraw" },
      ],
    },
  }),
);

// Threads (Intelligence)
if (process.env["CPK_INTELLIGENCE_API_KEY"]) {
  serve(
    8287,
    "Threads (Intelligence)",
    new CopilotRuntime({
      agents: { default: agent(), support: agent() }, // threads pages use agentId="support"
      intelligence: new CopilotKitIntelligence({ apiKey: process.env["CPK_INTELLIGENCE_API_KEY"]! }),
      identifyUser: async () => ({ id: "antigravity-angular-qa-user", name: "Antigravity Angular QA" }), // HARNESS: no auth, one fixed QA user
    }),
  );
} else {
  console.warn("CPK_INTELLIGENCE_API_KEY is not set; threads runtime (8287) not started");
}

// Voice (transcriptionService)
serve(
  8288,
  "Voice",
  new CopilotRuntime({
    agents: { default: agent() },
    transcriptionService: createTranscriptionService(),
  }),
);
