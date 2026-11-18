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


@app.get("/health")  # HARNESS: readiness check for start-all.sh / CI
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":  # HARNESS: the page never says how to start it; port 8281 (doc: 8000)
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8281")))
