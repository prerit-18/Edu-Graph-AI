# EduGraph AI — Multi-Agent Adaptive Learning Platform for GATE CSE

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

---

## 🎙️ Realistic AI Speaking Tutor ("Dr. Arya")

EduGraph AI includes an interactive, realistic human AI Speaking Tutor named **Dr. Arya** that reads aloud verified educational answers and active recall evaluation feedback across **Study Studio** and **Active Recall**.

### Core Capabilities

1. **Exact Verified Answer Playback**:
   - Speaks the exact educational response returned by the Concept Teacher, Problem Solver, or Active Recall evaluation.
   - Does **not** independently generate or hallucinate alternative content.
2. **Safe Educational Text Normalization**:
   - Converts Markdown headers, bullet points, and code markers into smooth narration.
   - Normalizes mathematical notation & LaTeX equations ($TAT = CT - AT$, $T(n) = 2T(n/2) + O(n)$, $O(n \log n)$, exponents, sets, summations) into natural spoken English.
   - Cleans citations and table structures without losing conceptual meaning.
   - Chunks lengthy responses (150–180 characters) to prevent browser Web Speech buffer exhaustion.
3. **Interactive Audio Controls**:
   - **Play / Pause / Resume / Stop / Replay** controls with active state management.
   - **Speed Control**: `0.75×`, `1.0×`, `1.25×`, and `1.5×`.
   - **Visual Animation**: Realistic portrait with an animated glowing pulse ring and dynamic multi-bar equalizer soundwaves during speech.
4. **Pedagogical Safety & Integrity**:
   - Audio playback is strictly a presentation feature; it **never** creates duplicate evaluation attempts, never updates BKT mastery, and never modifies learner state.
   - In Active Recall, question audio is available pre-submission, but reference answers and rubric evaluations are strictly locked until submission is completed.

---

## 🏗️ Architecture & Component Hierarchy

The Speaking Tutor is structured modularly:

```text
frontend/
├── assets/tutor_avatar.jpg        # Professional human tutor visual asset (Dr. Arya)
├── tutor_speech.js                # Core Speech & Avatar Controller
│   ├── EducationalTextNormalizer  # Client-side LaTeX & Markdown speech cleaner
│   ├── TutorSpeechService         # Web Speech API lifecycle & keepalive manager
│   └── createTutorAvatarWidget    # Reusable avatar UI widget with controls
├── styles.css                     # Premium animations, soundwave equalizer, pulse rings
├── study.html                     # Integrated in Concept Study & Problem Solver
└── recall.html                    # Integrated in Active Recall (pre/post submission)

backend/
├── routes/tts.js                  # Speech endpoints (/api/tts/config, /normalize, /speak)
├── services/text_normalizer.js    # Server-side LaTeX/Markdown normalizer & chunker
└── routes/router.js               # Mounted under /api/tts
```

---

## ⚙️ Configuration & TTS Providers

The AI Tutor supports both zero-cost browser-native speech synthesis and optional cloud-based TTS providers.

### 1. Browser-Native Web Speech API (Default)
- **Cost**: Free ($0.00). No API keys or account setup required.
- **Provider Setting**: `TTS_PROVIDER=browser` (default in `backend/.env`).
- **Voice Selection**: Automatically selects the most natural English voices available on the client's OS:
  - **macOS / iOS**: Siri, Samantha, Daniel, Karen, Alex.
  - **Windows**: Microsoft Jenny Online (Natural), Microsoft Guy, David, Zira.
  - **Chrome / Android**: Google US English, Google UK English Female/Male.

### 2. ElevenLabs Cloud TTS (Optional)
To enable high-fidelity neural voices via ElevenLabs:
1. Obtain an API key from [ElevenLabs](https://elevenlabs.io).
2. Set the following in `backend/.env`:
   ```env
   TTS_PROVIDER=elevenlabs
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM # (e.g. Rachel or custom voice ID)
   ```

---

## 🧪 Testing & Validation

All test suites can be executed via:

```bash
cd backend
npm test
```

### Test Suites Included:
- `tests/speaking_tutor.test.js`: Validates TTS config, educational LaTeX/Markdown normalization, chunking, question security, and zero BKT side-effects.
- `tests/active_recall.test.js`: Validates question generation, answer evaluation, rubric parsing, and mastery updates.
- `tests/agents.test.js`: Validates Concept Teacher, Problem Solver, Revision, and Assessment agents.
- `tests/bkt.test.js`: Validates Bayesian Knowledge Tracing updates.
- `tests/rag.test.js`, `tests/rag_eval.test.js`: retrieval, source grounding, refusal of out-of-domain queries, held-out evaluation.
- `tests/api_flow.test.js`: auth, PYQ practice, mock tests, revision, flashcards, concept study.
- `tests/gate_pipeline.test.js`: PDF ingestion pipeline on synthetic fixture PDFs (temp directories).
- `tests/e2e.test.js`: Full end-to-end integration workflows.

---

## 🔍 Limitations & Honest Technical Disclosures

1. **Avatar Lip Synchronization vs. Animated State**:
   - The avatar uses a high-resolution realistic portrait of an educational instructor ("Dr. Arya") paired with CSS-based speaking pulse rings and real-time multi-bar soundwave equalizers.
   - It is **not** a real-time 3D neural mesh or deepfake lip-synchronized video (such as HeyGen/D-ID), avoiding heavy video streaming latency, high cost per generation, and API rate limiting.
2. **Browser Speech Variations**:
   - Browser TTS quality depends on the user's OS and installed voices. High-quality natural voices (e.g., Microsoft Natural or Google voices) sound significantly better than standard legacy OS synthesizers.
