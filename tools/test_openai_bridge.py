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
    assert notes.count("filled missing tool result render_ui") == 1 and "dropped built-in tool googleSearch" in notes
    assert [t["function"]["name"] for t in req["tools"]] == ["render_ui"]


def test_to_gemini_parallel_calls():
    o = {"choices": [{"message": {"content": None, "tool_calls": [
        {"id": "x", "function": {"name": "f", "arguments": "{\"a\":1}"}},
        {"id": "y", "function": {"name": "g", "arguments": ""}}]}}]}
    parts = b.to_gemini(o)["candidates"][0]["content"]["parts"]
    assert parts == [{"functionCall": {"id": "x", "name": "f", "args": {"a": 1}}},
                     {"functionCall": {"id": "y", "name": "g", "args": {}}}]


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f(); print("ok", n)
