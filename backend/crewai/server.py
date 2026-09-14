import os
import sys
import uvicorn
from typing import Optional, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

try:
    from .crew_runner import run_concept_crew, run_pyq_crew, run_solver_crew
except ImportError:
    from crew_runner import run_concept_crew, run_pyq_crew, run_solver_crew

app = FastAPI(title="EduGraph AI - CrewAI Multi-Agent Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConceptRequest(BaseModel):
    query: str
    subject: Optional[str] = None
    topicId: Optional[str] = None
    userId: Optional[str] = None

class PYQRequest(BaseModel):
    topicId: Optional[str] = 'os_scheduling'
    subject: Optional[str] = None
    query: Optional[str] = None
    userId: Optional[str] = None

class SolveRequest(BaseModel):
    questionId: Optional[str] = None
    questionText: Optional[str] = None
    studentAnswer: Optional[Any] = None
    userId: Optional[str] = None
    topicId: Optional[str] = None

@app.get("/health")
def health():
    return {"status": "ok", "service": "CrewAI Multi-Agent Engine", "version": "1.0.0"}

@app.post("/concept")
def concept_endpoint(req: ConceptRequest):
    return run_concept_crew(
        query=req.query,
        subject=req.subject,
        topic_id=req.topicId,
        user_id=req.userId
    )

@app.post("/pyq")
def pyq_endpoint(req: PYQRequest):
    return run_pyq_crew(
        topic_id=req.topicId or 'os_scheduling',
        subject=req.subject,
        query=req.query,
        user_id=req.userId
    )

@app.post("/solve")
def solve_endpoint(req: SolveRequest):
    return run_solver_crew(
        question_id=req.questionId,
        question_text=req.questionText,
        student_answer=req.studentAnswer,
        user_id=req.userId,
        topic_id=req.topicId
    )

if __name__ == "__main__":
    port = int(os.getenv("CREWAI_PORT", "5050"))
    uvicorn.run(app, host="127.0.0.1", port=port)
