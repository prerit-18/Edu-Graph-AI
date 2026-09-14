import os
import json
import sqlite3
import math
import re
from typing import Dict, Any, List, Optional

# Base paths
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'edugraph.db')
VECTOR_INDEX_PATH = os.path.join(PROJECT_ROOT, 'data', 'chroma', 'vector_index.json')
SYLLABUS_PATH = os.path.join(PROJECT_ROOT, 'data', 'syllabus', 'syllabus.json')
PYQ_DIR = os.path.join(PROJECT_ROOT, 'data', 'pyq')

# Safe tool imports for CrewAI
try:
    from crewai.tools import BaseTool
    from pydantic import BaseModel, Field
    HAS_CREWAI = True
except ImportError:
    HAS_CREWAI = False
    class BaseTool:
        name: str = ""
        description: str = ""
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def run(self, *args, **kwargs):
            return self._run(*args, **kwargs)

class RAGToolSchema(BaseModel if HAS_CREWAI else object):
    query: str = Field(description="Concept query to search in GATE CSE syllabus and notes") if HAS_CREWAI else ""
    subject: Optional[str] = Field(default=None, description="Optional subject filter (Operating Systems, Algorithms, DBMS)") if HAS_CREWAI else None

class RAGKnowledgeTool(BaseTool):
    name: str = "rag_knowledge_search"
    description: str = "Search verified GATE CSE syllabus, concept notes, definitions, and official reference context."
    args_schema: Any = RAGToolSchema if HAS_CREWAI else None

    def _run(self, query: str, subject: Optional[str] = None) -> str:
        results = []
        STOP_WORDS = {'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'were', 'how', 'what', 'why', 'can', 'you', 'with', 'from', 'by', 'as', 'it', 'sweet'}
        raw_words = re.findall(r'\b[a-zA-Z0-9_-]{3,}\b', query.lower())
        keywords = [w for w in raw_words if w not in STOP_WORDS]

        if not keywords:
            return "No matching verified GATE CSE context found for this query."

        # 1. Search vector index if exists
        if os.path.exists(VECTOR_INDEX_PATH):
            try:
                with open(VECTOR_INDEX_PATH, 'r', encoding='utf-8') as f:
                    chunks = json.load(f)
                
                scored_chunks = []
                for ch in chunks:
                    text = ch.get('text', '')
                    text_lower = text.lower()
                    meta = ch.get('metadata', {})
                    topic_name = meta.get('topic_name', '').lower()
                    
                    score = sum(2.0 if kw in topic_name else (1.0 if kw in text_lower else 0.0) for kw in keywords)
                    if subject and meta.get('subject', '').lower() != subject.lower():
                        continue
                    if score >= 1.0:
                        scored_chunks.append((score, ch))
                
                scored_chunks.sort(key=lambda x: x[0], reverse=True)
                for score, ch in scored_chunks[:3]:
                    meta = ch.get('metadata', {})
                    results.append({
                        "source": meta.get('source_type', 'syllabus'),
                        "subject": meta.get('subject', 'Computer Science'),
                        "topic": meta.get('topic_name', meta.get('topic_id', '')),
                        "text": ch.get('text', '')[:400]
                    })
            except Exception as e:
                pass
        
        # 2. Search SQLite database topics if results are few
        if len(results) < 2 and os.path.exists(DB_PATH):
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                c = conn.cursor()
                rows = c.execute("SELECT id, name, subject, description FROM topics").fetchall()
                for r in rows:
                    name = r['name'].lower()
                    desc = (r['description'] or '').lower()
                    if any(kw in name or (len(kw) > 4 and kw in desc) for kw in keywords):
                        results.append({
                            "source": "official_syllabus",
                            "subject": r['subject'],
                            "topic": r['name'],
                            "text": f"Topic: {r['name']} ({r['subject']}). {r['description']}"
                        })
                conn.close()
            except Exception:
                pass
        
        if not results:
            return "No matching verified GATE CSE context found for this query."
        
        output_lines = ["Found Verified Knowledge Chunks:"]
        for i, r in enumerate(results[:3], 1):
            output_lines.append(f"\n[Source {i}]: {r['subject']} — {r['topic']}\nContext: {r['text']}")
        return "\n".join(output_lines)


class PYQToolSchema(BaseModel if HAS_CREWAI else object):
    topic_id: Optional[str] = Field(default=None, description="Topic ID to retrieve questions for (e.g. os_scheduling)") if HAS_CREWAI else None
    question_id: Optional[str] = Field(default=None, description="Specific GATE question ID (e.g. os_2024_001)") if HAS_CREWAI else None

class PYQDatabaseTool(BaseTool):
    name: str = "pyq_database"
    description: str = "Query previous GATE CSE questions, exam years, official answer keys, and statistical frequency."
    args_schema: Any = PYQToolSchema if HAS_CREWAI else None

    def _run(self, topic_id: Optional[str] = None, question_id: Optional[str] = None) -> str:
        all_pyqs = []
        # Search pyq json files
        for sub_dir in ['os', 'algorithms', 'dbms']:
            q_file = os.path.join(PYQ_DIR, sub_dir, 'questions.json')
            if os.path.exists(q_file):
                try:
                    with open(q_file, 'r', encoding='utf-8') as f:
                        all_pyqs.extend(json.load(f))
                except Exception:
                    pass
        
        if question_id:
            for q in all_pyqs:
                if q.get('id') == question_id:
                    return json.dumps({
                        "id": q['id'],
                        "year": q.get('year'),
                        "subject": q.get('subject'),
                        "topic_id": q.get('topic_id'),
                        "question": q.get('question'),
                        "type": q.get('type'),
                        "official_answer": q.get('answer'),
                        "official_explanation": q.get('explanation')
                    }, indent=2)
            return f"Question {question_id} not found."
        
        if topic_id:
            matches = [q for q in all_pyqs if q.get('topic_id') == topic_id]
            years = sorted(list(set(q.get('year') for q in matches if q.get('year'))))
            types = {}
            for q in matches:
                t = q.get('type', 'MCQ')
                types[t] = types.get(t, 0) + 1
            
            return json.dumps({
                "topic_id": topic_id,
                "total_questions": len(matches),
                "years_appeared": years,
                "question_types": types,
                "sample_questions": [
                    {"id": q['id'], "year": q.get('year'), "question": q['question'][:150] + '...', "answer": q.get('answer')}
                    for q in matches[:2]
                ]
            }, indent=2)

        return json.dumps({"total_curated_pyqs": len(all_pyqs), "status": "Available"})


class CalculatorToolSchema(BaseModel if HAS_CREWAI else object):
    expression: str = Field(description="Mathematical expression or calculation to evaluate, e.g., '8 + 6 + 4 + 2' or '20 - 0'") if HAS_CREWAI else ""

class CalculatorTool(BaseTool):
    name: str = "calculator"
    description: str = "Perform precise arithmetic and mathematical evaluations for GATE numerical answer problems."
    args_schema: Any = CalculatorToolSchema if HAS_CREWAI else None

    def _run(self, expression: str) -> str:
        # Whitelisted safe math evaluation
        clean_expr = re.sub(r'[^0-9\+\-\*\/\(\)\.\s\^]', '', expression).replace('^', '**')
        try:
            allowed_names = {"math": math, "abs": abs, "round": round, "min": min, "max": max}
            result = eval(clean_expr, {"__builtins__": {}}, allowed_names)
            return str(result)
        except Exception as e:
            return f"Calculation error: {str(e)}"


class BKTStateToolSchema(BaseModel if HAS_CREWAI else object):
    user_id: str = Field(description="User ID") if HAS_CREWAI else ""
    topic_id: str = Field(description="Topic ID") if HAS_CREWAI else ""
    is_correct: bool = Field(description="True if student answer was correct, False otherwise") if HAS_CREWAI else True

class BKTStateTool(BaseTool):
    name: str = "bkt_knowledge_tracer"
    description: str = "Reads and updates learner mastery states using Bayesian Knowledge Tracing."
    args_schema: Any = BKTStateToolSchema if HAS_CREWAI else None

    def _run(self, user_id: str, topic_id: str, is_correct: bool) -> str:
        if not os.path.exists(DB_PATH):
            return json.dumps({"status": "error", "message": "Database not found"})
        
        P_TRANSIT = 0.20
        P_SLIP = 0.10
        P_GUESS = 0.20
        DEFAULT_P_INIT = 0.30

        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            row = c.execute("SELECT p_know FROM mastery WHERE user_id = ? AND topic_id = ?", (user_id, topic_id)).fetchone()
            current_p = row['p_know'] if row else DEFAULT_P_INIT

            # BKT update formula
            if is_correct:
                numerator = current_p * (1.0 - P_SLIP)
                denominator = (current_p * (1.0 - P_SLIP)) + ((1.0 - current_p) * P_GUESS)
            else:
                numerator = current_p * P_SLIP
                denominator = (current_p * P_SLIP) + ((1.0 - current_p) * (1.0 - P_GUESS))
            
            p_evidence = numerator / max(1e-9, denominator)
            new_p = p_evidence + (1.0 - p_evidence) * P_TRANSIT
            new_p = min(0.99, max(0.01, round(new_p, 4)))

            c.execute("""
                INSERT INTO mastery (user_id, topic_id, p_know, last_practiced)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(user_id, topic_id) DO UPDATE SET
                    p_know = excluded.p_know,
                    last_practiced = excluded.last_practiced
            """, (user_id, topic_id, new_p))
            conn.commit()
            conn.close()

            return json.dumps({
                "user_id": user_id,
                "topic_id": topic_id,
                "previous_p_know": current_p,
                "new_p_know": new_p,
                "mastery_percentage": f"{new_p * 100:.1f}%"
            })
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})

# Instantiate tools
rag_tool = RAGKnowledgeTool()
pyq_tool = PYQDatabaseTool()
calculator_tool = CalculatorTool()
bkt_tool = BKTStateTool()
