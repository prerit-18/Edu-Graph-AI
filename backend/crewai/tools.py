"""Tools available to EduGraph CrewAI agents.

Retrieval is performed once by the Node RAG layer and handed to the crew as task context, so the
only tool agents need is a safe calculator for numeric verification (Problem Solver).
"""
import ast
import math
import operator
from typing import Any

try:
    from crewai.tools import BaseTool
    from pydantic import BaseModel, Field
    HAS_CREWAI = True
except ImportError:  # pragma: no cover
    HAS_CREWAI = False
    BaseTool = object  # type: ignore

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv, ast.USub: operator.neg,
        ast.UAdd: operator.pos}
_FUNCS = {"log2": math.log2, "log10": math.log10, "ln": math.log, "sqrt": math.sqrt, "ceil": math.ceil,
          "floor": math.floor, "abs": abs, "min": min, "max": max, "round": round}


def safe_eval(expr: str) -> float:
    """Evaluate an arithmetic expression without exec/eval (no names, attributes or imports)."""
    def _ev(n: ast.AST) -> Any:
        if isinstance(n, ast.Expression):
            return _ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            if isinstance(n.op, ast.Pow) and abs(_ev(n.right)) > 64:
                raise ValueError("exponent too large")
            return _OPS[type(n.op)](_ev(n.left), _ev(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](_ev(n.operand))
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in _FUNCS and not n.keywords:
            return _FUNCS[n.func.id](*[_ev(a) for a in n.args])
        raise ValueError("unsupported expression")
    return _ev(ast.parse(expr.replace("^", "**"), mode="eval"))


if HAS_CREWAI:
    class CalculatorInput(BaseModel):
        expression: str = Field(description="Arithmetic expression, e.g. '(0+2+6)/3' or '2**20*4/2**20'")

    class CalculatorTool(BaseTool):
        name: str = "calculator"
        description: str = "Evaluates an arithmetic expression exactly. Use it to verify every numeric step."
        args_schema: Any = CalculatorInput

        def _run(self, expression: str) -> str:
            try:
                return str(safe_eval(expression))
            except Exception as e:  # noqa: BLE001
                return f"Calculator error: {e}"

    calculator_tool = CalculatorTool()
else:  # pragma: no cover
    calculator_tool = None
