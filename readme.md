# Antigravity-Angular: CopilotKit Angular docs, tested with a Google Antigravity agent

Doc QA harness for https://docs.copilotkit.ai/angular/google-antigravity. Each sidebar page has a route that
holds the page's code as published (doc snippets verbatim) and a `<route>/demo` that runs it. Lines added
only to reach a page are marked `HARNESS`. Open doc defects: [FINDINGS.md](FINDINGS.md). Page list and
status: [assignment.json](assignment.json).

## Layout

| Folder | What |
|---|---|
| `frontend/` | Angular 22 app (`ng serve` on 4280), Copilot Runtime `server.ts` (8280), auth runtime, `doc-verbatim/` (snippets kept as published that don't build) |
| `backend/` | Google Antigravity agent server `agent_server.py` (8281, the quickstart's `create_antigravity_app`) and `interrupts_server.py` (8284: interrupt and sub-agent pages) |
| `tools/` | `gemini_pool.py` (8285): Gemini key/model pool with an OpenAI fallback, `openai_bridge.py` |
| `autorecorder/` | Playwright recorder for the clips (`npm run record -- <page-id>`) |
| `doc-snapshot/` | Snapshot of the doc pages, sidebar and links (drift check: `npm run drift`) |

## Run it

1. `cp backend/.env.example backend/.env` and set `GEMINI_API_KEY` (or point `GOOGLE_GEMINI_BASE_URL` at the
   pool and put `GEMINI_POOL_KEYS` / `GEMINI_POOL_OPENAI_KEY` in `backend/pool.env`).
2. `cd frontend && npm install`, `cd autorecorder && npm install`, `cd backend && uv sync`.
3. `bash start-all.sh` starts the pool, both agent servers, the runtime and `ng serve`.
4. Open http://localhost:4280. Record one page: `npm run record -- <page-id>`.

Ports are never 3000 / 8000 so the harness can run beside other apps.
