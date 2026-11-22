# Findings: Antigravity-Angular (Google Antigravity Python agent + CopilotKit Angular)
Open doc defects only. Numbers are stable IDs (code cites `FINDINGS.md #N`); gaps are removed findings.
Stack: `@copilotkit/angular` 0.6.0, `@copilotkit/runtime` 1.89.0, `@copilotkit/core` 1.89.0, `@ag-ui/client` 1.0.5 (1.0.2 nested under `@copilotkit/angular`), `@angular/core` 22.1.4, agent: `ag-ui-antigravity` 0.2.1, `google-antigravity` 0.1.24, `fastapi` 0.165.0 on Python 3.13 (uv); Node 26.7.0, npm 11, Windows 11 Pro. Docs: https://docs.copilotkit.ai/angular/google-antigravity (snapshot 2026-11-18)

## Dev blockers (seen with `ng serve` and normal use of the page)

### [Quickstart](https://docs.copilotkit.ai/angular/google-antigravity)
**#1 The backend snippet is a fragment and no Node runtime server or start command is given for Angular.**
- **Doc:** "Connect the selected agent backend" shows `_common.py` starting at `def api_key()`: no imports (`os`, `GeminiAPIEndpoint`, `CapabilitiesConfig`, `BuiltinTools`, `get_forwarded_headers`) and none of the constants it uses (`SLUG`, `_FORWARDED_PREFIXES`, `MODEL`, `WORKSPACE`, `SAVE_DIR`, `SESSION_TIMEOUT_SECONDS`, `MAX_SESSIONS`, `MAX_TOOL_CALLS_PER_TURN`). `agent_server.py` is `AGENT_REGISTRY = build_registry()`, and `build_registry` is never defined or imported. The runtime step is only a callout ("Configure Copilot Runtime to register this backend as the `default` agent"); the linked Copilot Runtime guide loops back to the quickstart: no Node runtime server for Angular and no command to start the backend or runtime.
- **Result:** the backend code as published fails at import (`NameError`). No working Angular app can be built from the page without guessing.
- **Confirmed by harness:** `backend/agents/_common.py` (the showcase file the snippet comes from, with its imports and constants), a HARNESS `build_registry()` in `backend/agent_server.py` and `frontend/server.ts` (`CopilotRuntime` + `createCopilotNodeListener` + `HttpAgent` to `http://localhost:8281/default`) make the chat answer ("Yes, I'm here! Fun fact: Benjamin Franklin's famous kite experiment…").

### [Headless UI](https://docs.copilotkit.ai/angular/google-antigravity/custom-look-and-feel/headless-ui)
**#14 With today's packages the page's `runAgent({ agent })` line fails to compile.**
- **Doc:** `await this.copilotKit.core.runAgent({ agent });`
- **Error:** `ng serve`: `TS2739: Type 'AbstractAgent' is missing the following properties from type 'AbstractAgent': _threadId, _maxEnforcedEntries, maxEnforcedEntries`.
- **Cause:** `@copilotkit/angular` 0.6.0 pins `@ag-ui/client` 1.0.2 exactly, while `@copilotkit/core` 1.89.0 (what the reader gets through angular's `^1.79.1` range from the quickstart's unversioned install) uses 1.0.5, so two `AbstractAgent` types meet on this line.
- **Confirmed by harness:** a HARNESS cast (`agent: agent as any`) on that line lets the app compile; the chat then works.

### [Open Generative UI](https://docs.copilotkit.ai/angular/google-antigravity/generative-ui/open-generative-ui)
**#8 Only the frontend config is shown; the runtime `openGenerativeUI` flag is never shown.**
- **Doc:** "An openGenerativeUI object opts the frontend into the built-in sandboxed renderer." and `provideCopilotKit({ …, openGenerativeUI: { sandboxFunctions: [setDashboardFilter] } })`.
- **Result:** no sandbox iframe ever appears; the agent replies "Generated an interactive dashboard filter UI above with All, Open, and Closed buttons" but only text shows (CI probe r44718166560, 2/2, with the page's `openGenerativeUI` config applied at the root). The runtime's `openGenerativeUI` option, which turns the middleware on, is never shown or linked.

### [Shared State](https://docs.copilotkit.ai/angular/google-antigravity/shared-state)
**#9 The agent never sees state written with `agent.setState`.**
- **Doc:** "Click **Mark high priority**, then ask the agent for the current priority. It answers \"high\"."
- **Result:** the panel shows `Priority: high`, but the agent never answers: the run ends with no reply (CI probes r44726393184, r44727685884: 4/4). The backend stream ends in `RUN_ERROR` "AntigravityExecutionError: Model produced invalid output. (model output error: encountered an improper format stop reason. Please retry with a properly formatted function call.)". Earlier runs answered "I can't determine the current priority". The Antigravity agent only reads app state with `experimental_app_state=True` plus a prompt telling it to call `get_shared_state`; the Angular page never shows either.

### [Agent Read-Only Context](https://docs.copilotkit.ai/angular/google-antigravity/shared-state/agent-readonly)
**#10 `connectAgentContext` values never reach the Antigravity agent.**
- **Doc:** `connectAgentContext(() => ({ … }))`, sending "values such as the signed-in user's name … timezone".
- **Result:** after "Use London time", asked for the name, timezone and selected record, the agent never answers: the run ends with no reply (CI probes r44726393184, r44727685884: 4/4), the backend stream ends in the same `RUN_ERROR` "Model produced invalid output … improper format stop reason". Earlier runs answered without Ada, Europe/London or record-42. The agent needs `experimental_app_context=True` plus an instruction to call `get_app_context`; neither is shown.

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

## Minor notes

- Threads Drawer (#3): needs CopilotKit Intelligence (threads license).
- Voice (#2): backend setup link leads to the React voice page; transcriptionService moves to the Angular runtime as is.
- Headless Threads (#4): selectedThreadId is never defined, add a signal; list needs CopilotKit Intelligence.
- A2UI (#6): productCatalog is never defined; basicCatalog from the runtime guide works.
- MCP Apps (#7): page never names an MCP app server; the runtime mcpApps config is only in the Copilot Runtime guide.
- Sub-agents (#13): the install step leaves out httpx (it is in the linked showcase requirements.txt); the Angular snippet is a showcase excerpt with small helpers (`readDelegations`, `subAgentRendererConfig`) not shown.
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
- Pausing the Agent for Input: the panel reads `event.value.title` / `.choices`, but `injectInterrupt` hands it the whole AG-UI interrupt (fields under `metadata`; the runtime drops top-level extras), so only Cancel shows.
- "Next steps" links drop `/google-antigravity` (e.g. `/angular/prebuilt-components`).

## Build-only
