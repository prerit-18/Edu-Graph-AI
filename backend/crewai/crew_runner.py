#!/usr/bin/env python3
"""EduGraph CrewAI runner (called by backend/agents/crewai_bridge.js).

Protocol: JSON payload on stdin  ->  one line "@@EDUGRAPH_RESULT@@{json}" on stdout.
  in : {role, description, expected_output, context, fast}
  out: {ok, text, usage:{prompt_tokens, completion_tokens, total_tokens}, model} | {ok:false, error}
The Node layer does retrieval and passes the (small) context; this script only runs the crew.
"""
import json
import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)


MARK = "@@EDUGRAPH_RESULT@@"


def emit(obj) -> None:
    """Result goes on its own marked line so CrewAI/rich console noise can never corrupt it."""
    sys.stdout.write("\n" + MARK + json.dumps(obj) + "\n")
    sys.stdout.flush()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as e:  # noqa: BLE001
        emit({"ok": False, "error": f"bad payload: {e}"})
        return
    try:
        from crewai import Crew, Process, Task
        from agents import ROLES, get_configured_llm, make_agent
    except Exception as e:  # noqa: BLE001
        emit({"ok": False, "error": f"crewai unavailable: {e}"})
        return

    role = payload.get("role")
    if role not in ROLES:
        emit({"ok": False, "error": f"unknown role {role!r}"})
        return
    llm = get_configured_llm(fast=bool(payload.get("fast")))
    if llm is None:
        emit({"ok": False, "error": "no_llm_configured"})
        return

    try:
        agent = make_agent(role, llm)
        desc = payload.get("description", "")
        ctx = payload.get("context", "")
        if ctx:
            desc = f"{desc}\n\nVERIFIED CONTEXT (use only this for facts):\n{ctx}"
        task = Task(description=desc, expected_output=payload.get("expected_output", "A concise, correct answer."), agent=agent)
        crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
        result = crew.kickoff()
        usage = {}
        try:
            m = crew.usage_metrics
            usage = {"prompt_tokens": int(m.prompt_tokens), "completion_tokens": int(m.completion_tokens),
                     "total_tokens": int(m.total_tokens), "requests": int(getattr(m, "successful_requests", 0))}
        except Exception:  # noqa: BLE001
            pass
        emit({"ok": True, "text": str(result), "usage": usage, "model": getattr(llm, "model", "")})
    except Exception as e:  # noqa: BLE001
        emit({"ok": False, "error": f"crew failed: {type(e).__name__}: {str(e)[:300]}"})


if __name__ == "__main__":
    # silence CrewAI telemetry/noise on stdout
    os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
    os.environ.setdefault("OTEL_SDK_DISABLED", "true")
    os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
    main()
