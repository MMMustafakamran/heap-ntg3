"""HARNESS: last-resort fallback for tools/gemini_pool.py. Translates one Gemini generateContent
request into an OpenAI chat completion and the answer back into Gemini's response shape, so the
ADK agents (doc code unchanged) keep working when every free Gemini key/model is out of quota.

Covers what ADK agents send: system instruction, text, functionCall / functionResponse turns,
function declarations (Gemini Schema or JSON schema). Streaming requests get the whole answer as a
single SSE chunk. Inline images are passed on as image_url parts; other inline data is dropped (logged).
"""
import json, os, uuid

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = os.getenv("GEMINI_POOL_OPENAI_MODEL", "gpt-6-luna")

_DROP = {"nullable", "propertyOrdering", "example", "default", "title", "format", "minItems", "maxItems",
         "minLength", "maxLength", "minimum", "maximum", "pattern", "anyOf"}


def openai_key():
    k = os.getenv("GEMINI_POOL_OPENAI_KEY", "").strip()
    if k:
        return k
    f = os.getenv("GEMINI_POOL_OPENAI_KEYFILE", "").strip()  # an env-style file holding OPENAI_API_KEY=
    if f:
        try:
            for line in open(f, encoding="utf-8-sig"):
                if line.startswith("OPENAI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
        except OSError:
            pass
    return ""


def _schema(s):
    """Gemini Schema (type: "OBJECT", ...) -> JSON schema."""
    if isinstance(s, list):
        return [_schema(x) for x in s]
    if not isinstance(s, dict):
        return s
    out = {}
    for k, v in s.items():
        if k in _DROP:
            continue
        if k == "type" and isinstance(v, str):
            out[k] = v.lower()
        elif k == "properties" and isinstance(v, dict):
            out[k] = {pk: _schema(pv) for pk, pv in v.items()}
        elif k == "items":
            out[k] = _schema(v)
        else:
            out[k] = v
    if out.get("type") == "object":
        out.setdefault("properties", {})
    return out


def _pair_tool_calls(msgs: list, notes: list) -> list:
    """HARNESS (Antigravity, 2026-11-20): OpenAI needs every assistant tool_call answered by a tool
    message right after it. The Antigravity SDK sends functionResponse parts in role "model" contents
    and not always right after their functionCall, so match results across the whole history:
    by call id first, then by function name in order; a placeholder only when a result is truly absent
    (a frontend tool the browser has not answered yet). Bridge plumbing only, doc agent code unchanged."""
    results = [m for m in msgs if m.get("role") == "tool"]
    by_id = {}
    for r in results:
        by_id.setdefault(r["tool_call_id"], []).append(r)
    used = set()
    out = []
    for m in msgs:
        if m.get("role") == "tool":
            continue
        out.append(m)
        if m.get("role") != "assistant" or not m.get("tool_calls"):
            continue
        for tc in m["tool_calls"]:
            cid, name = tc["id"], tc["function"]["name"]
            r = next((x for x in by_id.get(cid, []) if id(x) not in used), None)
            if r is None:  # id mismatch: take the first unused result for the same function name
                r = next((x for x in results if id(x) not in used and x.get("_name") == name
                          and x["tool_call_id"] not in _all_ids(msgs)), None)
            if r is None:
                notes.append(f"filled missing tool result {name}")
                out.append({"role": "tool", "tool_call_id": cid, "content": json.dumps({"result": None})})
                continue
            used.add(id(r))
            out.append({"role": "tool", "tool_call_id": cid, "content": r["content"]})
    left = sum(1 for r in results if id(r) not in used)
    if left:
        notes.append(f"dropped {left} orphan tool result(s)")
    return out


def _all_ids(msgs):
    return {tc["id"] for m in msgs if m.get("role") == "assistant" for tc in m.get("tool_calls") or []}


def to_openai(g: dict) -> tuple[dict, list[str]]:
    notes, msgs = [], []
    sys_parts = (g.get("systemInstruction") or g.get("system_instruction") or {}).get("parts", [])
    sys_text = "\n".join(p.get("text", "") for p in sys_parts if p.get("text"))
    if sys_text:
        msgs.append({"role": "system", "content": sys_text})
    pending = {}  # function name -> queue of call ids awaiting a functionResponse
    for c in g.get("contents", []):
        role = c.get("role", "user")
        texts, calls, results, images = [], [], [], []
        for p in c.get("parts", []):
            if p.get("thought"):
                continue
            if "text" in p and p["text"]:
                texts.append(p["text"])
            elif "functionCall" in p or "function_call" in p:
                fc = p.get("functionCall") or p.get("function_call")
                cid = fc.get("id") or f"call_{uuid.uuid4().hex[:12]}"
                pending.setdefault(fc["name"], []).append(cid)
                calls.append({"id": cid, "type": "function",
                              "function": {"name": fc["name"], "arguments": json.dumps(fc.get("args") or {})}})
            elif "functionResponse" in p or "function_response" in p:
                fr = p.get("functionResponse") or p.get("function_response")
                q = pending.get(fr["name"]) or []
                cid = fr.get("id") or (q.pop(0) if q else f"call_{uuid.uuid4().hex[:12]}")
                if fr.get("id") and fr["id"] in q:
                    q.remove(fr["id"])
                results.append({"role": "tool", "tool_call_id": cid, "_name": fr.get("name"),
                                "content": json.dumps(fr.get("response"), default=str)})
            elif ("inlineData" in p or "inline_data" in p) and role != "model":
                d = p.get("inlineData") or p.get("inline_data")
                mime = d.get("mimeType") or d.get("mime_type") or ""
                if mime.startswith("image/"):
                    b64 = (d.get("data") or "").replace("-", "+").replace("_", "/")  # google-genai sends URL-safe base64
                    b64 += "=" * (-len(b64) % 4)
                    images.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
                else:
                    notes.append(f"dropped inline {mime}")
            else:
                notes.append(f"dropped part {list(p)[:1]}")
        if role == "model":
            m = {"role": "assistant", "content": "\n".join(texts) or None}
            if calls:
                m["tool_calls"] = calls
            if m["content"] or calls:
                msgs.append(m)
            # HARNESS (Antigravity-Angular, 2026-11-18): the Antigravity SDK sends functionResponse parts in a
            # role "model" content (checked on the raw request); they used to be dropped here and padded with "null".
            msgs.extend(results)
        else:
            msgs.extend(results)
            if images:
                msgs.append({"role": "user", "content": ([{"type": "text", "text": "\n".join(texts)}] if texts else []) + images})
            elif texts:
                msgs.append({"role": "user", "content": "\n".join(texts)})
    msgs = _pair_tool_calls(msgs, notes)
    gc = g.get("generationConfig") or g.get("generation_config") or {}
    if gc.get("thinkingConfig") or gc.get("thinking_config"):  # logged so CI shows whether thoughts were asked
        notes.append("thinkingConfig " + json.dumps(gc.get("thinkingConfig") or gc.get("thinking_config")))
    tools = []
    for t in g.get("tools", []) or []:
        for fd in t.get("functionDeclarations") or t.get("function_declarations") or []:
            params = fd.get("parametersJsonSchema") or fd.get("parameters_json_schema")
            params = params if params is not None else _schema(fd.get("parameters") or {"type": "OBJECT"})
            if not params or params.get("type") != "object":
                params = {"type": "object", "properties": {}}
            tools.append({"type": "function", "function": {
                "name": fd["name"], "description": fd.get("description", ""), "parameters": params}})
        for k in t:
            if k not in ("functionDeclarations", "function_declarations"):
                # HARNESS: built-in Gemini tools (googleSearch, codeExecution) have no chat-completions
                # equivalent; the turn goes on without them and the model answers from its own knowledge.
                notes.append(f"built-in tool {k} -> web_search" if k in ("googleSearch", "google_search", "googleSearchRetrieval")
                             else f"dropped built-in tool {k}")
    # gpt-6-luna on chat/completions rejects function tools unless reasoning is off
    req = {"model": OPENAI_MODEL, "messages": msgs, "reasoning_effort": os.getenv("GEMINI_POOL_OPENAI_REASONING", "none")}
    if tools:
        req["tools"] = tools
    return req, notes


def to_gemini(o: dict) -> dict:
    ch = (o.get("choices") or [{}])[0]
    m = ch.get("message") or {}
    parts = []
    if m.get("content"):
        parts.append({"text": m["content"]})
    for tc in m.get("tool_calls") or []:
        try:
            args = json.loads(tc["function"].get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        parts.append({"functionCall": {"id": tc.get("id"), "name": tc["function"]["name"], "args": args}})
    if not parts:
        parts = [{"text": ""}]
    u = o.get("usage") or {}
    return {
        "candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": "STOP", "index": 0}],
        "usageMetadata": {"promptTokenCount": u.get("prompt_tokens", 0),
                          "candidatesTokenCount": u.get("completion_tokens", 0),
                          "totalTokenCount": u.get("total_tokens", 0)},
        "modelVersion": OPENAI_MODEL,
    }


# HARNESS (Antigravity, 2026-11-20): reasoning. When the Gemini request asks for thoughts
# (generationConfig.thinkingConfig.includeThoughts, or thinkingBudget > 0), chat completions can't
# return reasoning (and gpt-6-luna there rejects tools with reasoning on), so tools/gemini_pool.py
# sends it to the Responses API with a reasoning summary, mapped back as Gemini parts with "thought": true.
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


def wants_thoughts(g: dict) -> bool:
    gc = g.get("generationConfig") or g.get("generation_config") or {}
    tc = gc.get("thinkingConfig") or gc.get("thinking_config") or {}
    if tc.get("includeThoughts") or tc.get("include_thoughts"):
        return True
    budget = tc.get("thinkingBudget", tc.get("thinking_budget"))
    return isinstance(budget, int) and budget > 0


def wants_search(g: dict) -> bool:
    """HARNESS: Gemini's built-in googleSearch tool maps to the Responses API web_search tool."""
    return any(k in t for t in g.get("tools") or [] for k in ("googleSearch", "google_search", "googleSearchRetrieval"))


def needs_responses(g: dict) -> bool:
    return wants_thoughts(g) or wants_search(g)


def to_responses(chat_req: dict, g: dict | None = None) -> dict:
    """chat completions request (from to_openai) -> Responses API request (reasoning summary when the
    Gemini request asked for thoughts, web_search when it carried googleSearch)."""
    instr, items = [], []
    for m in chat_req["messages"]:
        r = m["role"]
        if r == "system":
            instr.append(m["content"])
        elif r == "tool":
            items.append({"type": "function_call_output", "call_id": m["tool_call_id"], "output": m["content"]})
        elif r == "assistant":
            if m.get("content"):
                items.append({"role": "assistant", "content": m["content"]})
            for tc in m.get("tool_calls") or []:
                items.append({"type": "function_call", "call_id": tc["id"], "name": tc["function"]["name"],
                              "arguments": tc["function"]["arguments"]})
        else:
            c = m["content"]
            if isinstance(c, list):
                c = [{"type": "input_text", "text": p["text"]} if p["type"] == "text"
                     else {"type": "input_image", "image_url": p["image_url"]["url"]} for p in c]
            items.append({"role": "user", "content": c})
    req = {"model": chat_req["model"], "input": items}
    if g is None or wants_thoughts(g):
        req["reasoning"] = {"effort": os.getenv("GEMINI_POOL_OPENAI_THINK_EFFORT", "low"), "summary": "auto"}
    if instr:
        req["instructions"] = "\n".join(instr)
    tools = [dict(type="function", **t["function"]) for t in chat_req.get("tools") or []]
    if g is not None and wants_search(g):
        tools.append({"type": "web_search"})
    if tools:
        req["tools"] = tools
    return req


def responses_to_gemini(o: dict) -> dict:
    parts, calls = [], []
    for it in o.get("output") or []:
        t = it.get("type")
        if t == "reasoning":
            s = "\n\n".join(x.get("text", "") for x in it.get("summary") or [] if x.get("text"))
            if s:
                parts.append({"text": s, "thought": True})
        elif t == "message":
            txt = "".join(x.get("text", "") for x in it.get("content") or [] if x.get("type") == "output_text")
            if txt:
                parts.append({"text": txt})
        elif t == "function_call":
            try:
                args = json.loads(it.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append({"functionCall": {"id": it.get("call_id"), "name": it["name"], "args": args}})
    parts += calls
    if not parts:
        parts = [{"text": ""}]
    u = o.get("usage") or {}
    rt = (u.get("output_tokens_details") or {}).get("reasoning_tokens", 0)
    return {
        "candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": "STOP", "index": 0}],
        "usageMetadata": {"promptTokenCount": u.get("input_tokens", 0),
                          "candidatesTokenCount": u.get("output_tokens", 0),
                          "thoughtsTokenCount": rt, "totalTokenCount": u.get("total_tokens", 0)},
        "modelVersion": OPENAI_MODEL,
    }


def to_sse(out: dict) -> bytes:
    """Gemini streamGenerateContent SSE: thought parts in their own first chunk, then the answer."""
    parts = out["candidates"][0]["content"]["parts"]
    th = [p for p in parts if p.get("thought")]
    rest = [p for p in parts if not p.get("thought")]
    chunks = []
    if th and rest:
        first = json.loads(json.dumps(out))
        first["candidates"][0]["content"]["parts"] = th
        first["candidates"][0].pop("finishReason", None)
        out = json.loads(json.dumps(out))
        out["candidates"][0]["content"]["parts"] = rest
        chunks.append(first)
    chunks.append(out)
    return b"".join(("data: " + json.dumps(c) + "\r\n\r\n").encode() for c in chunks)
