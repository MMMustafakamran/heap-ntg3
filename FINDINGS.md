# Findings: Antigravity-Angular (Google Antigravity Python agent + CopilotKit Angular)
Open doc defects only. Numbers are stable IDs (code cites `FINDINGS.md #N`); gaps are removed findings.
Stack: `@copilotkit/angular` 0.6.0, `@copilotkit/runtime` 1.85.0, `@ag-ui/client` 1.0.4, `@angular/core` 22.1.4, agent: `ag-ui-antigravity` 0.2.1, `google-antigravity` 0.1.23, `fastapi` 0.164.0 on Python 3.13 (uv); Node 26.7.0, npm 11, Windows 11 Pro. Docs: https://docs.copilotkit.ai/angular/google-antigravity (snapshot 2026-11-18)

## Dev blockers (seen with `ng serve` and normal use of the page)

### [Quickstart](https://docs.copilotkit.ai/angular/google-antigravity)
**#1 The backend snippet is a fragment and no Node runtime server or start command is given for Angular.**
- **Doc:** "Connect the selected agent backend" shows `_common.py` starting at `def api_key()`: no imports (`os`, `GeminiAPIEndpoint`, `CapabilitiesConfig`, `BuiltinTools`, `get_forwarded_headers`) and none of the constants it uses (`SLUG`, `_FORWARDED_PREFIXES`, `MODEL`, `WORKSPACE`, `SAVE_DIR`, `SESSION_TIMEOUT_SECONDS`, `MAX_SESSIONS`, `MAX_TOOL_CALLS_PER_TURN`). `agent_server.py` is `AGENT_REGISTRY = build_registry()`, and `build_registry` is never defined or imported. The runtime step is only a callout ("Configure Copilot Runtime to register this backend as the `default` agent"); the linked Copilot Runtime guide loops back to the quickstart: no Node runtime server for Angular and no command to start the backend or runtime.
- **Result:** the backend code as published fails at import (`NameError`). No working Angular app can be built from the page without guessing.
- **Confirmed by harness:** `backend/agents/_common.py` (the showcase file the snippet comes from, with its imports and constants), a HARNESS `build_registry()` in `backend/agent_server.py` and `frontend/server.ts` (`CopilotRuntime` + `createCopilotNodeListener` + `HttpAgent` to `http://localhost:8281/default`) make the chat answer ("Yes, I'm here! Fun fact: Benjamin Franklin's famous kite experiment…").

### [Voice](https://docs.copilotkit.ai/angular/google-antigravity/voice)
**#2 Voice can't be set up: the transcription backend is never shown.**
- **Doc:** "Follow the Voice backend setup to add a dedicated Runtime route and transcription service."
- **Result:** the link goes to `voice#backend` on the same page, a section that doesn't exist; no `transcriptionService` code anywhere. `/info` reports `"audioFileTranscriptionEnabled":false` and the composer has no mic button.

### [Threads Drawer](https://docs.copilotkit.ai/angular/google-antigravity/prebuilt-components/copilot-threads-drawer)
**#3 The threads drawer renders empty.**
- **Doc:** "The drawer reads the platform's `threads` license feature and shows its locked state when that feature is unavailable."
- **Result:** `copilot-threads-drawer` renders an empty panel: no list, no locked state. The runtime's `/info` has `threadEndpoints.list:false`; the page never says what serves the list.

### [Headless Threads](https://docs.copilotkit.ai/angular/google-antigravity/headless-threads)
**#4 `injectThreads` lists no threads.**
- **Doc:** "The list is server-authoritative and uses realtime updates when the platform supplies a WebSocket URL."
- **Result:** after chatting on `support` the list shows only "New conversation", no threads and no error. The page never says which backend provides the list.
- **Confirmed by harness:** `selectedThreadId` (used in `<copilot-chat agentId="support" [threadId]="selectedThreadId()" />`) is never defined; added as a HARNESS signal.

### [A2UI](https://docs.copilotkit.ai/angular/google-antigravity/generative-ui/a2ui)
**#6 The catalog the page requires is never defined.**
- **Doc:** "A catalog is required: without one, A2UI stays off even when the runtime enables it", then `catalog: productCatalog,`; the catalog snippets also use `dynamicString`, `AcmeBadge`, `PanelComponent` with no imports.
- **Result:** the verbatim files don't type-check (`Cannot find name 'productCatalog'`, `logs/doc-typecheck.log`). Without them: `[CopilotKit] The runtime enables A2UI, but no a2ui.catalog is configured, so A2UI stays off.` and the agent answers in text.

### [MCP Apps](https://docs.copilotkit.ai/angular/google-antigravity/generative-ui/mcp-apps)
**#7 No MCP server or runtime setup is given.**
- **Doc:** only `provideMCPApps()` from `@copilotkit/angular/mcp-apps`; "MCP resource and tool requests travel through the selected AG-UI agent."
- **Result:** the page names no MCP server and shows no runtime `mcpApps` config; the agent replies "I can't open or launch an interactive app… no MCP app-launching tool is available".

### [Open Generative UI](https://docs.copilotkit.ai/angular/google-antigravity/generative-ui/open-generative-ui)
**#8 Only the frontend config is shown; the runtime `openGenerativeUI` flag is never shown.**
- **Doc:** "An openGenerativeUI object opts the frontend into the built-in sandboxed renderer." and `provideCopilotKit({ …, openGenerativeUI: { sandboxFunctions: [setDashboardFilter] } })`.
- **Result:** no sandbox iframe ever appears; the agent writes plain HTML `<button>`s into its message and says it has no `generateSandboxedUi` tool. The runtime's `openGenerativeUI` option, which turns the middleware on, is never shown or linked.

### [Shared State](https://docs.copilotkit.ai/angular/google-antigravity/shared-state)
**#9 The agent never sees state written with `agent.setState`.**
- **Doc:** "Click **Mark high priority**, then ask the agent for the current priority. It answers \"high\"."
- **Result:** the panel shows `Priority: high`, the agent replies "I can't determine the current priority" (3/3). The Antigravity agent only reads app state with `experimental_app_state=True` plus a prompt telling it to call `get_shared_state`; the Angular page never shows either.

### [Agent Read-Only Context](https://docs.copilotkit.ai/angular/google-antigravity/shared-state/agent-readonly)
**#10 `connectAgentContext` values never reach the Antigravity agent.**
- **Doc:** `connectAgentContext(() => ({ … }))`, sending "values such as the signed-in user's name … timezone".
- **Result:** after "Use London time", asked for the name, timezone and selected record, the agent never names Ada, Europe/London or record-42. The agent needs `experimental_app_context=True` plus an instruction to call `get_app_context`; neither is shown.

### [Pausing the Agent for Input](https://docs.copilotkit.ai/angular/google-antigravity/human-in-the-loop/useInterrupt)
**#11 No Antigravity backend that pauses is shown or linked.**
- **Doc:** "When the backend agent pauses for input" and `injectInterrupt<ReviewRequest>("default")`.
- **Result:** the quickstart's `default` agent never interrupts, so `injectInterrupt("default")` never fires and nothing appears.
- **Confirmed by harness:** a HARNESS interrupt agent (`backend/interrupts_server.py`, agent `interrupt`) makes the panel appear and resume.

### [Headless Interrupts](https://docs.copilotkit.ai/angular/google-antigravity/human-in-the-loop/headless)
**#12 No Antigravity interrupt backend is shown or linked.**
- **Doc:** "When the backend agent emits an AG-UI interrupt, the agent store already holds the pending decision."
- **Result:** no interrupting backend is given, so no pending decision ever appears.
- **Confirmed by harness:** with the HARNESS interrupt agent, the message and Approve/Reject appear and Approve resumes the run.

### [Sub-agents](https://docs.copilotkit.ai/angular/google-antigravity/multi-agent/subagents)
**#13 The sub-agents backend can't start as installed, and the Angular snippet is a fragment.**
- **Doc:** `pip install ag-ui-antigravity google-antigravity`; the Angular snippet calls `readDelegations(this.agentStore().state())` and `subAgentRendererConfig(name)`.
- **Result:** `ModuleNotFoundError: No module named 'httpx'` on `import agents.subagents`; the Angular snippet is a class fragment that doesn't parse (TS1128), and `readDelegations`, `subAgentRendererConfig`, `SubAgentName` are never defined.
- **Confirmed by harness:** with `--with httpx` and a HARNESS delegation log, research_agent, writing_agent and critique_agent run and a blog post comes back.

## Minor notes

- Tool Call Rendering (#5): the handler fetches `/api/weather`, a placeholder the page doesn't provide; the card renders, its result line is the app's index.html.
- Quickstart: `HttpAgent` comes from `@ag-ui/client`, which the install step never adds.
- Prebuilt Components: the page's `AppComponent` mounts `copilot-popup` and `copilot-sidebar` together; both launchers sit on the same spot, so "Click the popup launcher button" opens the sidebar.
- Prebuilt Components, Headless Threads: `agentId="support"` is used without saying it must be registered in the runtime.
- Frontend Tools: no imports; `BackgroundToolArgs` and `resolveGradient` are never defined.
- Components as Tools: no imports and no host component; the card has no styles ("INC-4711sev1").
- Human-in-the-loop: the page never says where `ApprovalToolsService` is provided.
- WebMCP: `searchOrders` is never defined (TS2304).
- Authentication: `readSessionToken()` and `verifySession()` are never defined.
- MCP Apps, Open Generative UI: `runtimeUrl: "/api/copilotkit"` assumes a same-origin runtime the Angular setup doesn't have.
- Sub-agents: the file is called `subagents.py` in one place and `src/agents/subagents.py` in another.
- Sub-agents: links to `/angular/google-antigravity/shared-state/streaming`, which is a 404.
- "Next steps" links drop `/google-antigravity` (e.g. `/angular/prebuilt-components`).

## Build-only
