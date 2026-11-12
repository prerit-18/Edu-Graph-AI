CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  subject TEXT,
  name TEXT,
  prerequisite_id TEXT,
  pyq_weight REAL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS mastery (
  user_id TEXT,
  topic_id TEXT,
  p_know REAL DEFAULT 0.3,
  last_seen TEXT,
  PRIMARY KEY (user_id, topic_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  topic_id TEXT,
  agent TEXT,
  question TEXT,
  answer TEXT,
  correct INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS revision_schedule (
  user_id TEXT,
  topic_id TEXT,
  due_at TEXT,
  priority REAL,
  PRIMARY KEY (user_id, topic_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  agent TEXT,
  grounded INTEGER,
  detail TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recall_prompts (
  id TEXT PRIMARY KEY,
  topic_id TEXT,
  prompt_type TEXT,
  question TEXT,
  reference_answer TEXT,
  key_concepts TEXT,
  rubric TEXT,
  difficulty TEXT DEFAULT 'medium',
  source_references TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

-- LEGACY (kept so existing history is never lost; no longer written): replaced by fc_daily_sessions / fc_daily_cards below
CREATE TABLE IF NOT EXISTS smart_fc_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  strong_count INTEGER DEFAULT 3,
  weak_count INTEGER DEFAULT 2,
  completed INTEGER DEFAULT 0,
  summary_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS smart_fc_session_cards (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  flashcard_id TEXT NOT NULL,
  topic_id TEXT,
  subject TEXT,
  card_label TEXT CHECK(card_label IN ('strong','weak')) DEFAULT 'strong',
  position INTEGER,
  FOREIGN KEY (session_id) REFERENCES smart_fc_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS smart_fc_feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  flashcard_id TEXT NOT NULL,
  user_id TEXT,
  topic_id TEXT,
  response TEXT CHECK(response IN ('got_it','need_practice')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES smart_fc_sessions(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- GATE CSE question bank (official papers ingested by data_pipeline/gate_ingest.py
-- plus a clearly-labelled synthetic practice set). See docs/GATE_DATA.md.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,                 -- e.g. gate_cs_2023_s1
  year INTEGER NOT NULL,
  session TEXT,                        -- e.g. 'Set 1' / 'Forenoon'
  paper_code TEXT,                     -- 'CS'
  source_url TEXT,
  source_file TEXT,
  key_source_url TEXT,
  retrieved_at TEXT,
  license_note TEXT,
  status TEXT DEFAULT 'ingested'       -- ingested | partial | failed
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  paper_id TEXT,
  year INTEGER,
  session TEXT,
  paper_code TEXT,
  q_no INTEGER,
  subject TEXT,
  topic_id TEXT,
  subtopic TEXT,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK(question_type IN ('MCQ','MSQ','NAT')),
  options_json TEXT DEFAULT '[]',
  correct_answer TEXT,                 -- MCQ 'B', MSQ 'A;C', NAT '12.5' or 'low:high'
  numeric_answer REAL,
  answer_low REAL,
  answer_high REAL,
  explanation TEXT,
  explanation_source TEXT DEFAULT 'none' CHECK(explanation_source IN ('official','ai','curated','none')),
  marks REAL,
  negative_marks REAL DEFAULT 0,
  difficulty TEXT DEFAULT 'medium',
  origin TEXT NOT NULL DEFAULT 'official_gate' CHECK(origin IN ('official_gate','synthetic_practice')),
  verification_status TEXT NOT NULL DEFAULT 'extracted_unverified'
    CHECK(verification_status IN ('verified','extracted_unverified','needs_review','synthetic')),
  topic_confidence REAL DEFAULT 1.0,
  source_document TEXT,
  source_page INTEGER,
  text_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES topics(id),
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_year ON questions(year);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_hash ON questions(text_hash);

CREATE TABLE IF NOT EXISTS ingest_review_queue (
  id TEXT PRIMARY KEY,
  source_file TEXT,
  year INTEGER,
  q_no INTEGER,
  page INTEGER,
  reason TEXT,
  raw_text TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Server-side Active Recall attempt tracking (3 attempts, then reveal)
CREATE TABLE IF NOT EXISTS recall_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  answer TEXT,
  score INTEGER,
  correct INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, prompt_id, attempt_no),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Mock tests (persisted so submissions are validated against what was served)
CREATE TABLE IF NOT EXISTS mock_tests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  params_json TEXT,
  question_ids TEXT NOT NULL,
  duration_minutes INTEGER,
  submitted_at TEXT,
  result_json TEXT,
  score REAL,
  max_score REAL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Daily personalised Smart Flashcards: ONE persisted session per user per local day
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fc_daily_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_date TEXT NOT NULL,                 -- YYYY-MM-DD in the learner's timezone
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating' CHECK(status IN ('generating','ready','completed')),
  distribution_json TEXT,                     -- planned vs actual strong/weak mix + transparent fallback reasons
  generated_by TEXT,                          -- model id, or 'reused_validated'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  summary_json TEXT,
  UNIQUE(user_id, session_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fc_daily_cards (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  topic_id TEXT NOT NULL,
  subject TEXT,
  card_label TEXT NOT NULL CHECK(card_label IN ('strong','weak','learning','early_practice','new_topic')),
  mastery_at_generation REAL,
  card_type TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT,
  difficulty TEXT,
  origin TEXT NOT NULL DEFAULT 'ai_generated_practice',   -- never an authentic PYQ
  sources_json TEXT,                          -- grounding material used (syllabus topic, PYQ ids)
  content_hash TEXT NOT NULL,
  feedback TEXT CHECK(feedback IS NULL OR feedback IN ('got_it','need_practice')),
  feedback_at TEXT,
  UNIQUE(session_id, position),
  FOREIGN KEY (session_id) REFERENCES fc_daily_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);
CREATE INDEX IF NOT EXISTS idx_fc_cards_user_hash ON fc_daily_cards(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_fc_cards_topic ON fc_daily_cards(topic_id);

-- Official answer-key revisions (the latest row is the live key; older ones are kept for audit)
CREATE TABLE IF NOT EXISTS answer_key_revisions (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  answer TEXT,
  numeric_low REAL,
  numeric_high REAL,
  source TEXT,                                -- e.g. provisional / final key document
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(question_id, version),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Embeddings for semantic retrieval (generated by `npm run embed`; optional)
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id TEXT NOT NULL,
  model TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  vector BLOB NOT NULL,
  PRIMARY KEY (chunk_id, model)
);

-- AI-generated explanations of OFFICIAL answers, cached per answer-key version (a revised key invalidates them)
CREATE TABLE IF NOT EXISTS ai_explanations (
  question_id TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('official_key_explanation','provisional_solution')),
  explanation TEXT NOT NULL,
  final_answer TEXT,
  model TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id, key_version, kind),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
