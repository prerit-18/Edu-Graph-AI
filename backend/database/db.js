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

module.exports = db;
