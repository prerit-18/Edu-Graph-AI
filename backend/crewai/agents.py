"""CrewAI agent factory for the EduGraph Minor Project.

Active CrewAI roles: concept_teacher, pyq_analyst, problem_solver. (Syllabus, Revision, Mock Test
and Active Recall are deterministic/BKT-driven services in Node and use the LLM directly.)
Two further roles are reserved for the Major Project and intentionally NOT defined here.
"""
import os
import sys
from typing import Any, Optional
from dotenv import load_dotenv

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.abspath(os.path.join(CURRENT_DIR, "..", ".env")))  # never overrides real env vars

try:
    from crewai import Agent, LLM
    HAS_CREWAI = True
except ImportError:  # pragma: no cover
    HAS_CREWAI = False

try:
    from tools import calculator_tool
except ImportError:  # pragma: no cover
    from .tools import calculator_tool


def _usable(key: Optional[str]) -> bool:
    return bool(key) and "your_" not in key and key.strip() not in ("", "your_key")


def get_configured_llm(fast: bool = False) -> Optional[Any]:
    """Build a CrewAI LLM from the same env vars the Node client uses. Returns None if no key."""
    if not HAS_CREWAI:
        return None
    provider = os.getenv("LLM_PROVIDER", "").lower()
    model_env = os.getenv("LLM_MODEL_FAST") if fast and os.getenv("LLM_MODEL_FAST") else os.getenv("LLM_MODEL")
    gem, groq, oai, orr = (os.getenv(k) for k in ("GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"))
    try:
        if provider in ("", "gemini") and _usable(gem):
            m = (model_env or "gemini-2.5-flash").replace("gemini/", "")
            # CrewAI 1.x needs an extra native Google package for `gemini/...` models; Gemini's
            # OpenAI-compatible endpoint works with the stock install, so we use that.
            return LLM(model=f"openai/{m}", api_key=gem, temperature=0.3,
                       base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
        if provider in ("", "groq") and _usable(groq):
            m = model_env or "llama-3.3-70b-versatile"
            return LLM(model=m if m.startswith("groq/") else f"groq/{m}", api_key=groq, temperature=0.3)
        if provider in ("", "openai") and _usable(oai):
            return LLM(model=model_env or "gpt-4o-mini", api_key=oai, temperature=0.3)
        if provider in ("", "openrouter") and _usable(orr):
            m = model_env or "meta-llama/llama-3.3-70b-instruct"
            return LLM(model=m if m.startswith("openrouter/") else f"openrouter/{m}", api_key=orr, temperature=0.3)
        if provider == "ollama":
            m = model_env or "ollama/llama3.2"
            return LLM(model=m, base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"), temperature=0.3)
    except Exception as e:  # noqa: BLE001
        print(f"Could not initialise CrewAI LLM: {e}", file=sys.stderr)
    return None


ROLES = {
    "concept_teacher": dict(
        role="GATE CSE Concept Teacher",
        goal="Explain exactly the concept the student asked about, correctly and concisely, using only the provided context.",
        backstory="You are a senior GATE CSE instructor. You answer directly with no greeting or conclusion, "
                  "give the formulas/invariants that matter for the exam, and finish with 2-4 closely related concepts. "
                  "You never invent facts, years or question numbers that are not in the context.",
        tools=[]),
    "pyq_analyst": dict(
        role="GATE CSE PYQ Analyst",
        goal="Summarise what the supplied previous-year-question statistics actually show about a topic.",
        backstory="You analyse only the statistics and sample questions you are given. You state counts, years and "
                  "question types exactly as provided, call a concept 'recurring' only if the data shows it in 2+ "
                  "different years, and say so plainly when the data is too small to conclude anything.",
        tools=[]),
    "problem_solver": dict(
        role="GATE CSE Problem Solver",
        goal="Produce a correct, step-by-step solution and verify every numeric step with the calculator.",
        backstory="You solve GATE problems carefully: list given data, state the formula, compute each step with the "
                  "calculator tool, and end with the final answer. When an official answer is supplied, your derivation "
                  "must agree with it; if it does not, you say that you could not reproduce it instead of forcing it.",
        tools=["calculator"]),
}


def make_agent(role_key: str, llm: Any) -> Any:
    spec = ROLES[role_key]
    tools = [calculator_tool] if "calculator" in spec["tools"] and calculator_tool is not None else []
    return Agent(role=spec["role"], goal=spec["goal"], backstory=spec["backstory"], tools=tools,
                 llm=llm, verbose=False, allow_delegation=False, max_iter=6)
