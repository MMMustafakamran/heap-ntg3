"""HARNESS: offline test of tools/openai_bridge.py (no network). Run: python tools/test_openai_bridge.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openai_bridge as b

WEATHER = {"city": "Tokyo", "temperature": 68, "conditions": "sunny"}


def tools_of(req):
    return [m for m in req["messages"] if m["role"] == "tool"]


def check_order(req):
    """every assistant tool_call is followed right away by its tool messages"""
    ms = req["messages"]
    for i, m in enumerate(ms):
        if m["role"] == "assistant" and m.get("tool_calls"):
            ids = [tc["id"] for tc in m["tool_calls"]]
            assert [t["tool_call_id"] for t in ms[i + 1:i + 1 + len(ids)]] == ids, ms
        if m["role"] == "tool":
            assert "_name" not in m


def test_response_in_model_content():  # what the Antigravity SDK sends
    g = {"contents": [
        {"role": "user", "parts": [{"text": "weather in tokyo"}]},
        {"role": "model", "parts": [{"functionCall": {"id": "c1", "name": "get_weather", "args": {"city": "Tokyo"}}},
                                    {"functionResponse": {"id": "c1", "name": "get_weather", "response": WEATHER}}]}]}
    req, notes = b.to_openai(g)
    check_order(req)
    assert json.loads(tools_of(req)[0]["content"]) == WEATHER and not notes, notes


def test_response_in_later_model_content_parallel():
    g = {"contents": [
        {"role": "user", "parts": [{"text": "two cities"}]},
        {"role": "model", "parts": [{"functionCall": {"id": "a", "name": "get_weather", "args": {"city": "Tokyo"}}},
                                    {"functionCall": {"id": "b", "name": "get_weather", "args": {"city": "Paris"}}}]},
        {"role": "model", "parts": [{"functionResponse": {"id": "b", "name": "get_weather", "response": {"city": "Paris"}}},
                                    {"functionResponse": {"id": "a", "name": "get_weather", "response": WEATHER}}]}]}
    req, notes = b.to_openai(g)
    check_order(req)
    t = tools_of(req)
    assert json.loads(t[0]["content"]) == WEATHER and json.loads(t[1]["content"]) == {"city": "Paris"} and not notes


def test_mismatched_id_matched_by_name_and_multi_turn():
    g = {"contents": [
        {"role": "user", "parts": [{"text": "research then write"}]},
        {"role": "model", "parts": [{"functionCall": {"id": "r1", "name": "research_agent", "args": {}}}]},
        {"role": "user", "parts": [{"functionResponse": {"id": "other", "name": "research_agent", "response": {"facts": "X"}}}]},
        {"role": "model", "parts": [{"functionCall": {"name": "writing_agent", "args": {}}}]},
        {"role": "user", "parts": [{"functionResponse": {"name": "writing_agent", "response": {"draft": "Y"}}}]}]}
    req, notes = b.to_openai(g)
    check_order(req)
    assert [json.loads(t["content"]) for t in tools_of(req)] == [{"facts": "X"}, {"draft": "Y"}] and not notes, notes


def test_truly_absent_gets_placeholder_and_builtin_tool_dropped():
    g = {"contents": [
        {"role": "user", "parts": [{"text": "draw"}]},
        {"role": "model", "parts": [{"functionCall": {"id": "u1", "name": "render_ui", "args": {}}}]}],
         "tools": [{"googleSearch": {}}, {"functionDeclarations": [{"name": "render_ui", "parameters": {"type": "OBJECT"}}]}]}
    req, notes = b.to_openai(g)
    check_order(req)
    assert notes.count("filled missing tool result render_ui") == 1 and "built-in tool googleSearch -> web_search" in notes
    assert [t["function"]["name"] for t in req["tools"]] == ["render_ui"]


def test_to_gemini_parallel_calls():
    o = {"choices": [{"message": {"content": None, "tool_calls": [
        {"id": "x", "function": {"name": "f", "arguments": "{\"a\":1}"}},
        {"id": "y", "function": {"name": "g", "arguments": ""}}]}}]}
    parts = b.to_gemini(o)["candidates"][0]["content"]["parts"]
    assert parts == [{"functionCall": {"id": "x", "name": "f", "args": {"a": 1}}},
                     {"functionCall": {"id": "y", "name": "g", "args": {}}}]


def test_reasoning_request_and_mapping():
    g = {"contents": [{"role": "user", "parts": [{"text": "why is the sky blue"}]},
                      {"role": "model", "parts": [{"functionCall": {"id": "c1", "name": "f", "args": {}}},
                                                  {"functionResponse": {"id": "c1", "name": "f", "response": {"x": 1}}}]}],
         "systemInstruction": {"parts": [{"text": "be helpful"}]},
         "tools": [{"functionDeclarations": [{"name": "f", "parameters": {"type": "OBJECT"}}]}],
         "generationConfig": {"thinkingConfig": {"includeThoughts": True}}}
    assert b.wants_thoughts(g)
    assert not b.wants_thoughts({"generationConfig": {"thinkingConfig": {"thinkingBudget": 0}}})
    assert not b.wants_thoughts({})
    chat, _ = b.to_openai(g)
    r = b.to_responses(chat)
    assert r["reasoning"]["summary"] == "auto" and r["instructions"] == "be helpful"
    assert [i.get("type", i.get("role")) for i in r["input"]] == ["user", "function_call", "function_call_output"]
    assert r["input"][2]["output"] == '{"x": 1}' and r["tools"][0]["name"] == "f"
    o = {"output": [{"type": "reasoning", "summary": [{"type": "summary_text", "text": "Rayleigh scattering"}]},
                    {"type": "message", "content": [{"type": "output_text", "text": "Because..."}]}],
         "usage": {"input_tokens": 3, "output_tokens": 9, "total_tokens": 12,
                   "output_tokens_details": {"reasoning_tokens": 5}}}
    out = b.responses_to_gemini(o)
    assert out["candidates"][0]["content"]["parts"] == [{"text": "Rayleigh scattering", "thought": True},
                                                        {"text": "Because..."}]
    chunks = [json.loads(x[6:]) for x in b.to_sse(out).decode().split("\r\n\r\n") if x]
    assert chunks[0]["candidates"][0]["content"]["parts"][0]["thought"] is True
    assert chunks[1]["candidates"][0]["content"]["parts"] == [{"text": "Because..."}]


def test_google_search_maps_to_web_search():
    g = {"contents": [{"role": "user", "parts": [{"text": "weather in tokyo"}]}], "tools": [{"googleSearch": {}}]}
    assert b.needs_responses(g) and not b.wants_thoughts(g)
    chat, _ = b.to_openai(g)
    r = b.to_responses(chat, g)
    assert r["tools"] == [{"type": "web_search"}] and "reasoning" not in r


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("ok", n)
