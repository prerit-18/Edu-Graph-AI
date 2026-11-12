const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH 
  ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.resolve(__dirname, '../', process.env.DB_PATH)) 
  : path.resolve(__dirname, '../../data/edugraph.db');

// Ensure parent directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch (err) {
  console.warn('better-sqlite3 failed, falling back to node:sqlite:', err.message);
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(dbPath);
}

// Initialize schema
const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
if (db.exec) {
  db.exec(schemaSql);
} else {
  // node:sqlite DatabaseSync also supports exec
  db.exec(schemaSql);
}

// ---- Lightweight, idempotent migrations for databases created by older versions ----
function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
}
function addColumn(table, col, ddl) {
  if (!hasColumn(table, col)) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  }
}
addColumn('users', 'timezone', "TEXT DEFAULT 'UTC'");
addColumn('questions', 'key_version', 'INTEGER DEFAULT 1');
addColumn('questions', 'key_source', 'TEXT');
addColumn('recall_prompts', 'origin', "TEXT DEFAULT 'curated_fallback'");
addColumn('recall_prompts', 'content_hash', 'TEXT');
addColumn('recall_prompts', 'answer_numeric', 'REAL');
addColumn('recall_prompts', 'generated_by', 'TEXT');
addColumn('recall_attempts', 'feedback_json', 'TEXT');
addColumn('mastery', 'n_attempts', 'INTEGER DEFAULT 0');
addColumn('mastery', 'n_correct', 'INTEGER DEFAULT 0');
addColumn('recall_prompts', 'user_id', 'TEXT');
addColumn('attempts', 'source', "TEXT DEFAULT ''");
addColumn('attempts', 'question_id', "TEXT DEFAULT ''");
// Back-fill counters for pre-existing rows
db.exec(`UPDATE mastery SET n_attempts = (SELECT COUNT(*) FROM attempts a WHERE a.user_id = mastery.user_id AND a.topic_id = mastery.topic_id),
                            n_correct = (SELECT COALESCE(SUM(correct),0) FROM attempts a WHERE a.user_id = mastery.user_id AND a.topic_id = mastery.topic_id)
         WHERE n_attempts = 0 AND last_seen IS NOT NULL`);
db.exec('CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, created_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_attempts_user_topic ON attempts(user_id, topic_id)');

module.exports = db;
