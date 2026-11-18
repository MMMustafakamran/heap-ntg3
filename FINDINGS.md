# Findings: Antigravity-Angular (Google Antigravity Python agent + CopilotKit Angular)
Open doc defects only. Numbers are stable IDs (code cites `FINDINGS.md #N`); gaps are removed findings.
Stack: `@copilotkit/angular` 0.6.0, `@copilotkit/runtime` 1.85.0, `@ag-ui/client` 1.0.4, `@angular/core` 22.1.4, agent: `ag-ui-antigravity` 0.2.1, `google-antigravity` 0.1.23, `fastapi` 0.164.0 on Python 3.13 (uv); Node 26.7.0, npm 11, Windows 11 Pro. Docs: https://docs.copilotkit.ai/angular/google-antigravity (snapshot 2026-11-18)

## Dev blockers (seen with `ng serve` and normal use of the page)

### [Quickstart](https://docs.copilotkit.ai/angular/google-antigravity)
**#1 The Antigravity backend is a fragment and no Angular runtime server is shown.**
- **Doc:** "Connect the selected agent backend" shows `_common.py` starting at `def api_key()`: no imports (`os`, `GeminiAPIEndpoint`, `CapabilitiesConfig`, `BuiltinTools`, `get_forwarded_headers`) and none of the constants it uses (`SLUG`, `_FORWARDED_PREFIXES`, `MODEL`, `WORKSPACE`, `SAVE_DIR`, `SESSION_TIMEOUT_SECONDS`, `MAX_SESSIONS`, `MAX_TOOL_CALLS_PER_TURN`). `agent_server.py` is `AGENT_REGISTRY = build_registry()`, and `build_registry` is never defined or imported. The runtime step is only a callout ("Configure Copilot Runtime to register this backend as the `default` agent"); the linked Copilot Runtime guide shows only a Next.js route, no Node server for Angular and no command to start the backend or runtime.
- **Result:** the backend code as published fails at import (`NameError`). No working Angular app can be built from the page without guessing.
- **Confirmed by harness:** `backend/agents/_common.py` (the showcase file the snippet comes from, with its imports and constants), a HARNESS `build_registry()` in `backend/agent_server.py` and `frontend/server.ts` (`CopilotRuntime` + `createCopilotNodeListener` + `HttpAgent` to `http://localhost:8281/default`) make the chat answer ("Yes, I'm here! Fun fact: Benjamin Franklin's famous kite experiment…").

## Minor notes

- Quickstart: `HttpAgent` comes from `@ag-ui/client`, which the install step never adds.

## Build-only
