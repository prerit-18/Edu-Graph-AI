# EduGraph AI 🎓
### Multi-Agent Adaptive Learning Platform for GATE CSE

<<<<<<< HEAD
Minor-project scope: **7 active agents**; 2 further agents (Doubt Debugger, Interview) are **reserved for the Major Project** and are deliberately not implemented.

| Agent | Implementation | CrewAI? |
|---|---|---|
| Syllabus Agent | official-syllabus data + prerequisite graph + BKT readiness | no (deterministic) |
| Concept Teacher | concept-strategy RAG -> explanation, related PYQs, refusal when ungrounded | yes (crew, fallback to direct LLM / stored notes) |
| PYQ Analyst | statistics computed from the question bank; LLM narrates only with >= 3 questions | yes |
| Problem Solver | deterministic grading vs. official key; AI derivation only if no stored solution | yes (calculator tool) |
| Revision Agent | BKT + recency + `revision_schedule`, only attempted topics, with suggested PYQs | no |
| Mock Test Agent | persisted tests from keyed questions, GATE marking, no repeats | no |
| Active Recall Agent | dynamic grounded questions (learner level, past mistakes), numeric answers graded in code, semantic grading, 3 attempts enforced server-side | no (direct Gemini, validated JSON) |

**Setup**
```bash
cd backend && npm install && cp .env.example .env     # set JWT_SECRET (openssl rand -hex 48) and an LLM key
pip install -r crewai/requirements.txt               # only if USE_CREWAI=true
npm start                                            # http://localhost:4000 (seeds syllabus + question bank, validates the Gemini key)
npm run embed                                        # optional: Gemini embeddings for semantic retrieval (~460 API calls, resumable)
npm test                                             # 14 suites, throw-away DBs, stubbed Gemini, no network
```
GATE paper data: see [docs/GATE_DATA.md](docs/GATE_DATA.md). Full change log and verification results: [docs/CHANGES.md](docs/CHANGES.md).

---

EduGraph AI is a multi-agent educational platform for GATE Computer Science & Engineering preparation. It combines CrewAI-backed explanation agents, hybrid retrieval (BM25 + character n-grams, optionally blended with Gemini embeddings, over the syllabus and a structured GATE question bank; retrieval only - no model is fine-tuned), Bayesian Knowledge Tracing (BKT), Active Recall self-testing, and an AI Speaking Tutor.
=======
EduGraph AI is an AI-powered, multi-agent adaptive learning platform designed to transform GATE Computer Science & Engineering preparation through personalized learning, intelligent assessments, knowledge tracking, and AI-driven academic assistance.

Built using **CrewAI, Retrieval-Augmented Generation (RAG), Vector Search, Bayesian Knowledge Tracing (BKT), and AI-powered learning tools**, EduGraph AI provides students with an integrated environment to study concepts, practice previous-year questions, identify knowledge gaps, and improve their preparation through adaptive learning.
>>>>>>> a0cc0e129cde851b4ee65ca8963613a0674be646

---

## 🚀 Key Features

### 1. Multi-Agent AI Learning System

EduGraph AI uses a multi-agent architecture powered by CrewAI, where specialized AI agents handle different learning activities.

| AI Agent | Responsibility |
|---|---|
| Syllabus Agent | Organizes learning according to the GATE CSE syllabus |
| Concept Teacher Agent | Explains concepts, theories, and related topics |
| PYQ Analyst Agent | Analyzes previous-year questions and identifies patterns |
| Problem Solver Agent | Provides structured problem-solving assistance |
| Doubt Debugger Agent | Identifies misunderstandings and resolves doubts |
| Revision Agent | Recommends concepts for revision |
| Mock Test Agent | Supports diagnostic assessments and mock tests |
| Interview Agent | Provides technical interview practice |
| Active Recall Agent | Generates questions to strengthen knowledge retention |

Each agent is designed to perform a specialized educational task within the learning ecosystem.

### 2. AI-Powered Concept Study

An intelligent concept-learning environment that helps students understand GATE CSE subjects.

- Explains the requested concept directly.
- Covers relevant related concepts.
- Provides structured theoretical explanations.
- Uses context-aware AI responses.
- Supports concept understanding rather than simply providing answers.

### 3. PYQ Practice & Problem Solving

A dedicated environment for practicing GATE previous-year questions.

- Practice GATE CSE questions.
- Analyze question patterns.
- Understand problem-solving approaches.
- Receive AI-assisted explanations.
- Strengthen understanding of important concepts.

### 4. Diagnostic Mock Tests

An assessment system designed to evaluate students' preparation levels.

- Attempt subject-oriented mock tests.
- Evaluate performance.
- Identify weak knowledge areas.
- Analyze learning gaps.
- Use assessment outcomes to guide further preparation.

### 5. Smart Flashcards & Active Recall

An intelligent flashcard system designed around active learning and knowledge retention.

- Generate flashcards for important concepts.
- Prioritize weak topics while maintaining revision of strong topics.
- Practice through active recall rather than passive reading.
- Evaluate student responses.
- Reveal the correct answer after three incorrect attempts.
- Reinforce conceptual understanding through repeated practice.

**Adaptive flashcard distribution:**
- 3 flashcards from strong topics.
- 2 flashcards from weak topics.

### 6. Bayesian Knowledge Tracing (BKT)

EduGraph AI incorporates Bayesian Knowledge Tracing to estimate a student's knowledge state over time.

BKT helps track the probability that a student has mastered a particular concept based on their learning interactions and assessment performance.

Key capabilities:
- Knowledge-state estimation.
- Concept-level mastery tracking.
- Learning progress monitoring.
- Identification of knowledge gaps.
- Support for personalized revision recommendations.

### 7. Hybrid Retrieval-Augmented Generation (RAG)

The platform incorporates RAG and vector search to provide contextually relevant and grounded educational responses.

The retrieval pipeline supports:

1. Educational content ingestion.
2. Text processing and chunking.
3. Embedding generation.
4. Vector-based retrieval.
5. Context retrieval for AI agents.
6. Context-aware response generation.

This architecture helps connect AI-generated explanations with relevant educational material.

### 8. AI Speaking Tutor – Dr. Arya 🎙️

An interactive AI speaking tutor that presents educational responses through spoken narration.

**Core capabilities:**
- Realistic human tutor avatar.
- Converts educational responses into speech.
- Reads verified answers from Concept Teacher, Problem Solver, and Active Recall.
- Supports mathematical notation and LaTeX normalization.
- Cleans Markdown and code formatting for natural narration.
- Chunks longer responses for reliable playback.

**Audio controls:**
- Play
- Pause
- Resume
- Stop
- Replay
- Playback speed: 0.75×, 1.0×, 1.25× and 1.5×

**Speech technologies:**
- Browser-native Web Speech API (default).
- Optional ElevenLabs cloud TTS integration.

The speaking tutor is a presentation layer. Audio playback does not independently modify student mastery or create additional assessment attempts.

### 9. Personalized Revision Recommendations

The platform supports adaptive revision based on student learning performance and knowledge-state information.

- Identify weak concepts.
- Monitor learning progress.
- Recommend topics for revision.
- Reinforce previously studied concepts.
- Encourage continuous knowledge improvement.

---

## 🏗️ System Architecture

EduGraph AI follows a modular architecture that separates the student-facing application, backend APIs, AI processing, retrieval pipeline, and learning-state management.

```text
                  STUDENT
                     |
                     v
              FRONTEND LAYER
                     |
                     v
             NODE.JS + EXPRESS
                BACKEND API
                     |
          +----------+----------+
          |          |          |
          v          v          v
       CREWAI       RAG         BKT
     MULTI-AGENT  PIPELINE   KNOWLEDGE
   ORCHESTRATION   VECTOR    TRACKING
          |        SEARCH       |
          |          |          |
          +----------+----------+
                     |
                     v
              AI RESPONSE
                     |
          +----------+----------+
          |                     |
          v                     v
      TEXT RESPONSE        DR. ARYA
                           SPEAKING TUTOR
```

### Technology Architecture

| Layer | Technologies |
|---|---|
| Frontend | Student-facing web application |
| Backend | Node.js, Express.js |
| AI Processing | Python |
| Agent Orchestration | CrewAI |
| Knowledge Retrieval | RAG, Vector Search |
| Knowledge Tracking | Bayesian Knowledge Tracing |
| Database | SQLite |
| Speech | Web Speech API, optional ElevenLabs |
| Testing | Node.js test framework |

---

## 🧠 How EduGraph AI Works

### Step 1: Student Interaction
Students interact with the platform through the frontend to access study materials, practice questions, flashcards, and assessments.

### Step 2: Request Processing
The backend receives student requests and routes them to the appropriate service or AI agent.

### Step 3: Agent Selection
CrewAI coordinates specialized agents according to the requested learning activity.

### Step 4: Knowledge Retrieval
The RAG pipeline retrieves relevant educational information using vector search when contextual retrieval is required.

### Step 5: Response Generation
The selected AI agent generates an educational response using the available context.

### Step 6: Knowledge Tracking
Student interactions and assessment outcomes can contribute to Bayesian Knowledge Tracing and learning progress estimation.

### Step 7: Adaptive Learning
Learning insights support recommendations for revision, practice, and further concept development.

---

## 🛠️ Installation & Setup

### Prerequisites

- Node.js
- Python
- npm
- Git
- Required AI provider API credentials, depending on configuration

### 1. Clone the Repository

```bash
git clone https://github.com/prerit-18/Edu-Graph-AI.git

cd Edu-Graph-AI
```

### 2. Backend Setup

```bash
cd backend

npm install
```

Configure the required environment variables in the backend `.env` file.

Example:

```env
TTS_PROVIDER=browser

# Optional ElevenLabs configuration
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_VOICE_ID=your_voice_id
```

Add other AI and database credentials required by your backend configuration.

### 3. Run Backend Tests

```bash
npm test
```

### 4. Frontend Setup

Navigate to the frontend directory and install the dependencies specified by its package configuration.

```bash
cd ../frontend

npm install
```

Run the frontend using the development command configured in its package scripts.

---

## 🧪 Testing & Validation

The project includes test suites covering:

| Test Suite | Purpose |
|---|---|
| Speaking Tutor Tests | Speech configuration, normalization and playback safety |
| Active Recall Tests | Question generation, answer evaluation and mastery updates |
| Agent Tests | Concept Teacher, Problem Solver, Revision and Assessment agents |
| BKT Tests | Knowledge-state updates |
| RAG Tests | Vector retrieval and source grounding |
| End-to-End Tests | Integrated application workflows |

Run the backend test suite:

```bash
cd backend
npm test
```

<<<<<<< HEAD
### Test Suites Included:
- `tests/speaking_tutor.test.js`: Validates TTS config, educational LaTeX/Markdown normalization, chunking, question security, and zero BKT side-effects.
- `tests/active_recall.test.js`: Validates question generation, answer evaluation, rubric parsing, and mastery updates.
- `tests/agents.test.js`: Validates Concept Teacher, Problem Solver, Revision, and Assessment agents.
- `tests/bkt.test.js`: Validates Bayesian Knowledge Tracing updates.
- `tests/rag.test.js`, `tests/rag_eval.test.js`: retrieval, source grounding, refusal of out-of-domain queries, held-out evaluation.
- `tests/api_flow.test.js`: auth, PYQ practice, mock tests, revision, flashcards, concept study.
- `tests/gate_pipeline.test.js`: PDF ingestion pipeline on synthetic fixture PDFs (temp directories).
- `tests/e2e.test.js`: Full end-to-end integration workflows.
=======
---

## 🎯 Project Objectives

- Make GATE CSE preparation more personalized and interactive.
- Integrate multiple specialized AI agents into one learning platform.
- Improve conceptual understanding through AI-assisted explanations.
- Encourage active recall and long-term knowledge retention.
- Track student knowledge using Bayesian Knowledge Tracing.
- Provide context-aware responses through RAG.
- Identify learning gaps and support targeted revision.
- Make learning more accessible through an AI speaking tutor.
>>>>>>> a0cc0e129cde851b4ee65ca8963613a0674be646

---

## 🔮 Future Scope

- Real-time conversational AI tutoring.
- Advanced personalized learning paths.
- More comprehensive performance analytics.
- Adaptive question difficulty.
- Expanded educational video and short-form concept learning.
- Improved voice interaction and conversational learning.
- More advanced knowledge graph-based learning recommendations.

---

## 📚 Academic Domain

**Domain:** Multi-Agent Orchestration and Verifiable AI

**Application:** AI-powered Adaptive Learning and Educational Assistance

**Target Examination:** GATE Computer Science & Engineering (GATE CSE)

---

## 👨‍💻 Developer

**Prerit**

B.Tech – Computer Science and Engineering (Artificial Intelligence & Machine Learning)

GitHub: https://github.com/prerit-18

---

## ⭐ Support

If you find EduGraph AI interesting, consider giving the repository a star ⭐ on GitHub.

**Repository:** https://github.com/prerit-18/Edu-Graph-AI

*Making learning smarter, adaptive, and more accessible through AI.*
