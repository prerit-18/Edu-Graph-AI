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
