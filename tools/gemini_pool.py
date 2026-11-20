"""HARNESS: local Gemini key/model pool (free-tier quota is 5 req/min per model per key).

The ADK backends reach Gemini through this proxy via GOOGLE_GEMINI_BASE_URL=http://localhost:8029
(an env setting read by google-genai; the doc's agent code is unchanged). For each request it tries
every key on the requested model, then the same on each fallback model, and moves on whenever Google
answers 429 (quota) or 503 (overloaded). The doc's own model is always tried first; a fallback answer
is logged so a clip can be checked.

Keys never live in the repo:
  GEMINI_POOL_KEYS      comma-separated keys (CI: from secrets), or
  GEMINI_POOL_KEYFILES  comma-separated paths to files holding one key each (local).
  GEMINI_POOL_OPENAI_KEY / GEMINI_POOL_OPENAI_KEYFILE   last-resort OpenAI fallback (tools/openai_bridge.py,
                        model GEMINI_POOL_OPENAI_MODEL, default gpt-6-luna) once every Gemini key/model is cooling.
Run: uv run python ../tools/gemini_pool.py   (from backend/, port 8029; PORT overrides)
"""
import asyncio, itertools, json, os, re, sys, time

import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from starlette.routing import Route

UPSTREAM = "https://generativelanguage.googleapis.com"
FALLBACK = [m.strip() for m in os.getenv(
    "GEMINI_POOL_FALLBACK", "gemini-3.8-flash,gemini-3-flash-preview,gemini-3.5-flash-lite").split(",") if m.strip()]
RETRY = {402, 429, 503}  # HARNESS: 402 = key out of prepaid credit, move on like a quota hit


def load_keys():
    keys = [k.strip() for k in os.getenv("GEMINI_POOL_KEYS", "").split(",") if k.strip()]
    for f in [p.strip() for p in os.getenv("GEMINI_POOL_KEYFILES", "").split(",") if p.strip()]:
        try:
            k = open(f, encoding="utf-8-sig").read().strip()
            if k:
                keys.append(k)
        except OSError as e:
            print(f"[pool] cannot read key file {f}: {e}", file=sys.stderr)
    return list(dict.fromkeys(keys))


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openai_bridge  # noqa: E402  (HARNESS: OpenAI fallback, tools/openai_bridge.py)

KEYS = load_keys()
OPENAI_KEY = openai_bridge.openai_key()
oa_client = httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0))
rr = itertools.count()
# per attempt: give up on a hung upstream fast and try the next key/model (read covers time to first byte)
client = httpx.AsyncClient(timeout=httpx.Timeout(float(os.getenv("GEMINI_POOL_TIMEOUT", "45")), connect=10.0))
cool = {}  # (key index, model) -> time it may be used again
DELAY_RE = re.compile(rb'"retryDelay":\s*"(\d+(?:\.\d+)?)s"')
MAX_WAIT = float(os.getenv("GEMINI_POOL_MAX_WAIT", "90"))
MODEL_RE = re.compile(r"(/models/)([^/:]+)(:)")


def log(msg):
    print(f"[pool {time.strftime('%H:%M:%S')}] {msg}", flush=True)


async def proxy(request: Request):
    path = request.url.path
    body = await request.body()
    params = [(k, v) for k, v in request.query_params.multi_items() if k != "key"]
    headers = {k: v for k, v in request.headers.items()
               if k.lower() not in ("host", "x-goog-api-key", "content-length", "accept-encoding")}
    m = MODEL_RE.search(path)
    asked = m.group(2) if m else None
    models = [asked] + [x for x in FALLBACK if x != asked] if asked else [None]
    start = next(rr)
    last = None
    deadline = time.time() + MAX_WAIT
    while True:
        for model in models:
            p = MODEL_RE.sub(lambda mm: f"{mm.group(1)}{model}{mm.group(3)}", path, count=1) if model else path
            for i in range(len(KEYS)):
                ki = (start + i) % len(KEYS)
                if cool.get((ki, model), 0) > time.time():
                    continue
                h = dict(headers, **{"x-goog-api-key": KEYS[ki]})
                req = client.build_request(request.method, UPSTREAM + p, params=params, headers=h, content=body)
                try:
                    r = await client.send(req, stream=True)
                except httpx.HTTPError as e:
                    log(f"{type(e).__name__} model={model} key#{ki + 1} -> next")
                    cool[(ki, model)] = time.time() + 20
                    continue
                if r.status_code in RETRY:
                    data = await r.aread()
                    await r.aclose()
                    last = (r.status_code, data)
                    d = DELAY_RE.search(data)
                    wait = float(d.group(1)) if d else (60 if r.status_code == 429 else 10)
                    if r.status_code == 402: wait = 3600  # HARNESS: out of prepaid credit doesn't recover in seconds
                    cool[(ki, model)] = time.time() + min(wait, 3600)
                    log(f"{r.status_code} model={model} key#{ki + 1} cool {wait:.0f}s -> next")
                    continue
                if model != asked:
                    log(f"FALLBACK served {asked} with {model} key#{ki + 1} ({r.status_code})")
                else:
                    log(f"{r.status_code} model={model} key#{ki + 1}")
                out_h = {k: v for k, v in r.headers.items()
                         if k.lower() not in ("content-length", "content-encoding", "transfer-encoding", "connection")}

                async def gen(resp=r):
                    try:
                        async for chunk in resp.aiter_bytes():  # decoded; content-encoding header is dropped below
                            yield chunk
                    finally:
                        await resp.aclose()
                return StreamingResponse(gen(), status_code=r.status_code, headers=out_h)
        # every Gemini key/model is cooling: answer through OpenAI if a key is set, else wait
        if OPENAI_KEY and (":generateContent" in path or ":streamGenerateContent" in path):
            return await via_openai(body, asked, stream=":streamGenerateContent" in path)
        soonest = min([cool.get((k, m), 0) for k in range(len(KEYS)) for m in models])
        if soonest > deadline:
            break
        await asyncio.sleep(max(0.5, soonest - time.time()))
    log(f"all keys/models exhausted for {asked}")
    return Response(last[1] if last else b'{"error":"pool exhausted"}',
                    status_code=last[0] if last else 429,
                    media_type="application/json")


async def via_openai(body: bytes, asked, stream: bool):
    try:
        g = json.loads(body or b"{}")
    except json.JSONDecodeError:
        return Response(b'{"error":"bad request body"}', status_code=400, media_type="application/json")
    req, notes = openai_bridge.to_openai(g)
    # HARNESS (2026-11-20): thoughts asked -> Responses API with a reasoning summary; chat completions if it fails
    attempts = []
    if openai_bridge.wants_thoughts(g):
        attempts.append(("responses", openai_bridge.OPENAI_RESPONSES_URL, openai_bridge.to_responses(req)))
    attempts.append(("chat", openai_bridge.OPENAI_URL, req))
    r, kind = None, "chat"
    for kind, url, payload in attempts:
        try:
            r = await oa_client.post(url, json=payload, headers={"Authorization": f"Bearer {OPENAI_KEY}"})
        except httpx.HTTPError as e:
            log(f"OPENAI {kind} {type(e).__name__}")
            r = None
            continue
        if r.status_code == 200:
            break
        log(f"OPENAI {kind} {r.status_code} {r.text[:200]}")
    if r is None:
        return Response(b'{"error":"openai unreachable"}', status_code=503, media_type="application/json")
    if r.status_code != 200:
        return Response(r.content, status_code=r.status_code, media_type="application/json")
    out = (openai_bridge.responses_to_gemini if kind == "responses" else openai_bridge.to_gemini)(r.json())
    nthought = sum(1 for p in out["candidates"][0]["content"]["parts"] if p.get("thought"))
    log(f"FALLBACK served {asked} with OPENAI {openai_bridge.OPENAI_MODEL} {kind}"
        f"{' (stream)' if stream else ''}{f' thoughts={nthought}' if kind == 'responses' else ''}"
        f"{' notes=' + ';'.join(notes) if notes else ''}")
    if stream:
        return Response(openai_bridge.to_sse(out), media_type="text/event-stream")
    return Response(json.dumps(out).encode(), media_type="application/json")


app = Starlette(routes=[Route("/{path:path}", proxy, methods=["GET", "POST"])])

if __name__ == "__main__":
    if not KEYS and not OPENAI_KEY:
        sys.exit("[pool] no keys: set GEMINI_POOL_KEYS / GEMINI_POOL_KEYFILES (and/or GEMINI_POOL_OPENAI_KEY[FILE])")
    log(f"{len(KEYS)} gemini keys, fallback {FALLBACK}, openai {openai_bridge.OPENAI_MODEL if OPENAI_KEY else 'off'}")
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8029")), log_level="warning")
