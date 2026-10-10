import os
import sys
from typing import Optional, Any
from dotenv import load_dotenv

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

# Load env variables from backend/.env
ENV_PATH = os.path.abspath(os.path.join(CURRENT_DIR, '..', '.env'))
load_dotenv(ENV_PATH)

try:
    from .tools import rag_tool, pyq_tool, calculator_tool, bkt_tool
except ImportError:
    from tools import rag_tool, pyq_tool, calculator_tool, bkt_tool

try:
    from crewai import Agent, LLM
    HAS_CREWAI = True
except ImportError:
    HAS_CREWAI = False
    class Agent:
        def __init__(self, role, goal, backstory, tools=None, verbose=True, allow_delegation=False, llm=None):
            self.role = role
            self.goal = goal
            self.backstory = backstory
            self.tools = tools or []
            self.verbose = verbose
            self.allow_delegation = allow_delegation
            self.llm = llm

def get_configured_llm() -> Optional[Any]:
    """
    Dynamically configures CrewAI LLM based on environment configuration:
    - Gemini (GEMINI_API_KEY)
    - Groq (GROQ_API_KEY)
    - OpenAI (OPENAI_API_KEY)
    - OpenRouter (OPENROUTER_API_KEY)
    - Ollama (OLLAMA_BASE_URL or OLLAMA_MODEL)
    """
    if not HAS_CREWAI:
        return None

    provider = os.getenv("LLM_PROVIDER", "").lower()
    gemini_key = os.getenv("GEMINI_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    try:
        # 1. Gemini
        if (provider == 'gemini' or gemini_key) and gemini_key and gemini_key != 'your_key':
            model_name = os.getenv("LLM_MODEL", "gemini/gemini-1.5-flash")
            if not model_name.startswith("gemini/"):
                model_name = f"gemini/{model_name}"
            return LLM(model=model_name, api_key=gemini_key, temperature=0.3)

        # 2. Groq
        if (provider == 'groq' or groq_key) and groq_key and groq_key != 'your_key':
            model_name = os.getenv("LLM_MODEL", "groq/llama-3.3-70b-versatile")
            if not model_name.startswith("groq/"):
                model_name = f"groq/{model_name}"
            return LLM(model=model_name, api_key=groq_key, temperature=0.3)

        # 3. OpenAI
        if (provider == 'openai' or openai_key) and openai_key and openai_key != 'your_key':
            model_name = os.getenv("LLM_MODEL", "gpt-4o-mini")
            return LLM(model=model_name, api_key=openai_key, temperature=0.3)

        # 4. OpenRouter
        if (provider == 'openrouter' or openrouter_key) and openrouter_key and openrouter_key != 'your_key':
            model_name = os.getenv("LLM_MODEL", "openrouter/meta-llama/llama-3.3-70b-instruct")
            if not model_name.startswith("openrouter/"):
                model_name = f"openrouter/{model_name}"
            return LLM(model=model_name, api_key=openrouter_key, temperature=0.3)

        # 5. Ollama
        if provider == 'ollama':
            model_name = os.getenv("LLM_MODEL", "ollama/llama3.2")
            return LLM(model=model_name, base_url=ollama_url, temperature=0.3)

    except Exception as e:
        print(f"Warning: Could not initialize CrewAI LLM: {e}", file=sys.stderr)
        return None

    return None

def create_concept_teacher_agent(llm=None) -> Agent:
    """
    Senior GATE CSE Professor & Concept Specialist
    """
    resolved_llm = llm or get_configured_llm()
    kwargs = {"llm": resolved_llm} if resolved_llm else {}
    return Agent(
        role="Senior GATE CSE Concept Professor",
        goal="Deliver deep, mathematically sound, intuitive, and strictly grounded explanations for GATE CSE syllabus concepts with verified citations.",
        backstory="""You are an esteemed Computer Science professor who has trained thousands of students for GATE CSE.
You explain complex systems, algorithms, and database principles with crystal clarity, using real-world analogies, formal proofs,
and explicit citations from the verified syllabus context. You never hallucinate or invent non-standard facts.""",
        tools=[rag_tool],
        verbose=True,
        allow_delegation=False,
        **kwargs
    )

def create_pyq_analyst_agent(llm=None) -> Agent:
    """
    GATE CSE Historical Trends & Pattern Specialist
    """
    resolved_llm = llm or get_configured_llm()
    kwargs = {"llm": resolved_llm} if resolved_llm else {}
    return Agent(
        role="GATE CSE PYQ Analyst & Trend Specialist",
        goal="Analyze 2021-2025 previous year GATE examination patterns, mark distributions, recurring trick questions, and common distractor pitfalls.",
        backstory="""You are a veteran exam strategist who analyzes previous GATE Computer Science papers.
You identify repeated question templates, calculate topic frequency distributions, and reveal subtle traps placed by IIT question setters
to help students avoid negative marking.""",
        tools=[pyq_tool, rag_tool],
        verbose=True,
        allow_delegation=False,
        **kwargs
    )

def create_problem_solver_agent(llm=None) -> Agent:
    """
    Step-by-Step Rigorous Mathematical & Logical Solver
    """
    resolved_llm = llm or get_configured_llm()
    kwargs = {"llm": resolved_llm} if resolved_llm else {}
    return Agent(
        role="GATE CSE Problem Solver & Mathematical Verifier",
        goal="Derive complete, step-by-step verified solutions to GATE numerical and conceptual problems, verify calculations via calculator tool, and grade student attempts.",
        backstory="""You are a precision-driven problem solver specializing in GATE CSE problem sets.
You write clear execution timelines (e.g. Gantt charts, recursion trees, schedule serializability graphs), double-check all arithmetic using the calculator tool,
and clearly point out where a student's derivation was right or wrong.""",
        tools=[calculator_tool, pyq_tool, rag_tool],
        verbose=True,
        allow_delegation=False,
        **kwargs
    )

def create_active_recall_agent(llm=None) -> Agent:
    """
    Conceptual Retrieval & Socratic Grader
    """
    resolved_llm = llm or get_configured_llm()
    kwargs = {"llm": resolved_llm} if resolved_llm else {}
    return Agent(
        role="GATE CSE Socratic Recall Evaluator",
        goal="Challenge student memory with active recall cloze and free-response questions, evaluate understanding semantically, and trace mastery.",
        backstory="""You are an expert in cognitive learning science who creates active recall challenges rather than passive recognition tests.
You evaluate student answers for core conceptual understanding, semantic depth, and essential keywords, providing supportive corrective feedback.""",
        tools=[rag_tool],
        verbose=True,
        allow_delegation=False,
        **kwargs
    )
