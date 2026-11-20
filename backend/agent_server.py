# HARNESS: the Angular quickstart (docs.copilotkit.ai/angular/google-antigravity, "Connect the selected
# agent backend") shows only the three lines marked "doc" below. It never shows an import, never defines
# build_registry(), and never says how to serve the app (FINDINGS.md #1). Everything else is HARNESS.
import os  # HARNESS

from ag_ui_antigravity import create_antigravity_app  # HARNESS: the doc names it, never imports it

from agents import _common  # HARNESS: the doc's _common.py (agents/_common.py)


def build_registry():  # HARNESS: never defined on the page
    """One neutral chat agent, registered as `default` (the name Copilot Runtime and CopilotChat use)."""
    return {"default": _common.build()}


AGENT_REGISTRY = build_registry()  # doc
app = create_antigravity_app(AGENT_REGISTRY)  # doc
app.title = "Google Antigravity Agent Server"  # doc


# HARNESS (diagnostic, 2026-11-20): log the AG-UI stream each run sends back, one line per event
# (type + first 160 chars), plus ag_ui_antigravity's own logger, so CI logs show why a run ends silent.
import logging, sys  # HARNESS

logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logging.getLogger("ag_ui_antigravity").setLevel(logging.DEBUG)


@app.middleware("http")  # HARNESS
async def _log_stream(request, call_next):
    response = await call_next(request)
    if request.method != "POST":
        return response

    async def body():
        buf = ""
        async for chunk in response.body_iterator:
            buf += chunk.decode("utf-8", "replace") if isinstance(chunk, bytes) else chunk
            sep = chr(10) * 2
            while sep in buf:
                ev, buf = buf.split(sep, 1)
                print(f"[agui {request.url.path}] {ev.replace(chr(10), ' ')[:220]}", file=sys.stderr, flush=True)
            yield chunk

    from starlette.responses import StreamingResponse
    return StreamingResponse(body(), status_code=response.status_code, headers=dict(response.headers), media_type=response.media_type)


@app.get("/health")  # HARNESS: readiness check for start-all.sh / CI
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":  # HARNESS: the page never says how to start it; port 8281 (doc: 8000)
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8281")))
