'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// Node's built-in SQLite (Node 22.13+). Silence its "experimental" notice.
const _emit = process.emitWarning;
process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : _emit.call(process, w, ...a));
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = _emit;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'evium-crm.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// better-sqlite3-style transaction helper: db.transaction(fn)(...args)
db.transaction = (fn) => (...args) => {
  db.exec('BEGIN');
  try { const r = fn(...args); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  stale_days INTEGER NOT NULL DEFAULT 14,
  is_closed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  customer_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  site_type TEXT,
  charger_type TEXT,
  charger_count INTEGER,
  power_kw REAL,
  estimated_value REAL,
  stage_id INTEGER REFERENCES stages(id),
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'medium',
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_live_date TEXT,
  hold_reason TEXT,
  description TEXT,
  stage_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stage_history (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_stage_id INTEGER REFERENCES stages(id),
  to_stage_id INTEGER REFERENCES stages(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'task',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other',
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  notes TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage_id);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_history_project ON stage_history(project_id, changed_at);
`);

// Default EV charge-point deployment funnel
const DEFAULT_STAGES = [
  ['Lead', '#94a3b8', 7, 0],
  ['Qualified', '#60a5fa', 10, 0],
  ['Site Survey', '#38bdf8', 14, 0],
  ['Proposal Sent', '#a78bfa', 14, 0],
  ['Contract Signed', '#f472b6', 7, 0],
  ['Design & Engineering', '#fb923c', 21, 0],
  ['Permitting', '#f59e0b', 30, 0],
  ['Utility / Make-Ready', '#eab308', 45, 0],
  ['Installation', '#84cc16', 21, 0],
  ['Commissioning', '#22c55e', 10, 0],
  ['Live / Operational', '#10b981', 9999, 1],
];

if (db.prepare('SELECT COUNT(*) c FROM stages').get().c === 0) {
  const ins = db.prepare('INSERT INTO stages (name, position, color, stale_days, is_closed) VALUES (?,?,?,?,?)');
  db.transaction(() => DEFAULT_STAGES.forEach((s, i) => ins.run(s[0], i + 1, s[1], s[2], s[3])))();
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

// Bootstrap first admin account
if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  const email = process.env.ADMIN_EMAIL || 'admin@eviumcharging.com';
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?, 'admin')")
    .run('Administrator', email, hashPassword(password));
  console.log('\n=== Evium CRM: initial admin account created ===');
  console.log(`  email:    ${email}`);
  if (generated) console.log(`  password: ${password}   (change it after first login)`);
  console.log('================================================\n');
}

module.exports = { db, hashPassword, verifyPassword, DATA_DIR };
