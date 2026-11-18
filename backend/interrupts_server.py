# HARNESS: one agent server (port 8284) for the Angular useInterrupt / Headless Interrupts / Sub-agents pages.
# - The two interrupt pages (docs.copilotkit.ai/angular/google-antigravity/human-in-the-loop/useInterrupt and
#   /human-in-the-loop/headless) show only Angular components. Neither shows a backend that emits an AG-UI
#   interrupt, and nothing registers the `ticketing` agent the Headless page injects. The interrupt tool
#   below is HARNESS, shaped like the Vue Antigravity HITL page's `experimental_interrupt` step.
# - The Sub-agents page's agents/subagents.py is verbatim (agents/subagents.py); the page never says how
#   to serve it, so it is mounted like the quickstart (create_antigravity_app). It imports httpx, which the
#   page's install step never installs: run with `uv run --with httpx` (HARNESS, start-all.sh).
import os

from fastapi import FastAPI
from ag_ui_antigravity import create_antigravity_app, experimental_interrupt

from agents import _common
from agents.subagents import subagents_agent


async def request_review(topic: str) -> str:  # HARNESS: no page shows a backend interrupt for Angular
    """Pauses for the user to review a change before it ships."""
    answer = await experimental_interrupt(
        "request_review",
        message=f"Approve shipping {topic}?",
        metadata={
            "title": f"Review {topic}",
            "choices": [{"id": "ship", "label": "Ship it"}, {"id": "hold", "label": "Hold"}],
        },
    )
    if answer.status != "resolved":
        return f"Not shipped ({answer.status})."
    return f"The user answered the review with {answer.payload}. Tell the user what they decided."


def interrupt_agent():  # HARNESS
    return _common.build(
        system_instructions="When the user asks to ship, release or approve something, call the `request_review` tool first, then report the decision.",
        tools=[request_review],
    )


app = FastAPI()
app.mount("/interrupt", create_antigravity_app(interrupt_agent(), path="/"))
app.mount("/subagents", create_antigravity_app(subagents_agent(), path="/"))


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8284")))
