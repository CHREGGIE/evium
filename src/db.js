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

// ---------- migrations: add columns to existing databases ----------
// Projects start in "diligence" (Due Diligence tab) and move to "pipeline" once checks are done.
// Existing projects default to "pipeline" so nothing already in the funnel disappears.
const PROJECT_MIGRATIONS = {
  phase: "TEXT NOT NULL DEFAULT 'pipeline'",
  property_owner: 'TEXT',
  property_owner_contact: 'TEXT',
  rebate_program: 'TEXT',
  rebate_amount: 'REAL',
  utility_company: 'TEXT',
  diligence_notes: 'TEXT',
  diligence_completed_at: 'TEXT',
};
{
  const have = new Set(db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name));
  for (const [col, def] of Object.entries(PROJECT_MIGRATIONS)) {
    if (!have.has(col)) db.exec(`ALTER TABLE projects ADD COLUMN ${col} ${def}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_projects_phase ON projects(phase, state)');
}

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

// ---------- milestones ----------
// Projects don't follow one fixed flow. Each project tracks every milestone on its own
// (not started / in progress / done / not needed), and they can finish in any order.
db.exec(`
CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  sla_days INTEGER NOT NULL DEFAULT 30
);
CREATE TABLE IF NOT EXISTS project_milestones (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','done','not_needed')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, milestone_id)
);
CREATE TABLE IF NOT EXISTS milestone_history (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  milestone_name TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mhist_project ON milestone_history(project_id, changed_at);

-- Site chat. A message with a milestone_id belongs to that milestone's chat;
-- every message (with or without one) also shows in the site's main chat.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  milestone_name TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);
`);

const DEFAULT_MILESTONES = [
  ['Site walk', '#38bdf8', 14],
  ['Proposal', '#a78bfa', 14],
  ['Contract', '#f472b6', 21],
  ['Permitting', '#f59e0b', 45],
  ['Approvals', '#eab308', 45],
  ['Installation', '#22c55e', 30],
];
const MS_STATUSES = ['not_started', 'in_progress', 'done', 'not_needed'];

if (db.prepare('SELECT COUNT(*) c FROM milestones').get().c === 0) {
  const ins = db.prepare('INSERT INTO milestones (name, position, color, sla_days) VALUES (?,?,?,?)');
  db.transaction(() => DEFAULT_MILESTONES.forEach((m, i) => ins.run(m[0], i + 1, m[1], m[2])))();

  // One-time conversion: turn each pipeline project's old single stage into milestone statuses.
  // [milestones done, milestone in progress] for each of the original default stage names.
  const STAGE_MAP = {
    'Lead': [[], null], 'Qualified': [[], null], 'Site Survey': [[], 'Site walk'],
    'Proposal Sent': [['Site walk'], 'Proposal'], 'Contract Signed': [['Site walk', 'Proposal', 'Contract'], null],
    'Design & Engineering': [['Site walk', 'Proposal', 'Contract'], 'Permitting'],
    'Permitting': [['Site walk', 'Proposal', 'Contract'], 'Permitting'],
    'Utility / Make-Ready': [['Site walk', 'Proposal', 'Contract', 'Permitting'], 'Approvals'],
    'Installation': [['Site walk', 'Proposal', 'Contract', 'Permitting', 'Approvals'], 'Installation'],
    'Commissioning': [['Site walk', 'Proposal', 'Contract', 'Permitting', 'Approvals', 'Installation'], null],
    'Live / Operational': [['Site walk', 'Proposal', 'Contract', 'Permitting', 'Approvals', 'Installation'], null],
  };
  const ms = Object.fromEntries(db.prepare('SELECT id, name FROM milestones').all().map((m) => [m.name, m.id]));
  const rows = db.prepare(`SELECT p.id, p.stage_entered_at, s.name AS stage FROM projects p JOIN stages s ON s.id = p.stage_id
    WHERE p.phase = 'pipeline'`).all();
  const insPM = db.prepare('INSERT OR IGNORE INTO project_milestones (project_id, milestone_id, status, started_at, completed_at, updated_at) VALUES (?,?,?,?,?,?)');
  db.transaction(() => rows.forEach((r) => {
    const [done, active] = STAGE_MAP[r.stage] || [[], null];
    done.forEach((n) => insPM.run(r.id, ms[n], 'done', null, r.stage_entered_at, r.stage_entered_at));
    if (active) insPM.run(r.id, ms[active], 'in_progress', r.stage_entered_at, null, r.stage_entered_at);
  }))();
}

// ---------- utilities, rebates, notifications, reminders ----------
db.exec(`
-- Utility directory: every site links to its utility
CREATE TABLE IF NOT EXISTS utilities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  states TEXT,                 -- e.g. "NY" or "NY,NJ"
  website TEXT,
  phone TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  make_ready_program TEXT,
  approval_days INTEGER,       -- typical days for the utility to approve / energize
  notes TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rebate board. state = two-letter code, or 'US' for federal programs
CREATE TABLE IF NOT EXISTS rebates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  provider TEXT,
  kind TEXT NOT NULL DEFAULT 'rebate' CHECK (kind IN ('rebate','grant','make_ready','tax_credit')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','upcoming','waitlist','closed')),
  amount_text TEXT,            -- e.g. "$4,000 per L2 port, up to $40,000 per site"
  max_amount REAL,             -- biggest amount one site can get, for totals
  charger_types TEXT,          -- 'L2', 'DCFC' or 'L2,DCFC'
  site_types TEXT,             -- comma list, empty = any
  utility_id INTEGER REFERENCES utilities(id) ON DELETE SET NULL,
  opens_on TEXT,
  deadline TEXT,
  url TEXT,
  summary TEXT,                -- what it is
  offer TEXT,                  -- chargers we can offer (internal, for sales)
  requirements TEXT,           -- one requirement per line
  notes TEXT,
  verified INTEGER NOT NULL DEFAULT 0,   -- 0 = needs checking
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rebates_state ON rebates(state);

-- Rebates a site is going after (usually one)
CREATE TABLE IF NOT EXISTS project_rebates (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rebate_id INTEGER NOT NULL REFERENCES rebates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, rebate_id)
);

-- In-app notifications (mentions, reminders, new sites in your territory, messages on your sites)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, id);

-- Follow-up reminders on a site or one of its milestones
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_on TEXT NOT NULL,
  text TEXT NOT NULL,
  done_at TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, done_at, due_on);
`);

// new columns on existing tables
function addColumns(table, cols) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  const added = [];
  for (const [col, def] of Object.entries(cols)) if (!have.has(col)) { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); added.push(col); }
  return added;
}
addColumns('projects', {
  utility_id: 'INTEGER REFERENCES utilities(id) ON DELETE SET NULL',
  tax_credit_id: 'INTEGER REFERENCES rebates(id) ON DELETE SET NULL',
  tax_credit_eligible: "TEXT NOT NULL DEFAULT 'unknown'",   // yes / no / unknown
  tax_credit_amount: 'REAL',
  lat: 'REAL', lng: 'REAL', geocoded_at: 'TEXT',
});
addColumns('users', { states: 'TEXT' });   // territory, e.g. "NY,NJ"
// Documents that must be uploaded before a milestone can be marked done (document categories)
if (addColumns('milestones', { required_docs: 'TEXT' }).length) {
  const DEFAULT_DOCS = { 'Site walk': 'photo', 'Proposal': 'proposal', 'Contract': 'contract', 'Permitting': 'permit', 'Installation': 'photo' };
  const upd = db.prepare('UPDATE milestones SET required_docs = ? WHERE name = ?');
  Object.entries(DEFAULT_DOCS).forEach(([name, cat]) => upd.run(cat, name));
}

// One-time: turn the typed-in utility names on existing sites into directory entries
{
  const loose = db.prepare("SELECT id, utility_company, state FROM projects WHERE utility_id IS NULL AND TRIM(COALESCE(utility_company,'')) <> ''").all();
  if (loose.length) {
    const find = db.prepare('SELECT * FROM utilities WHERE name = ?');
    const ins = db.prepare('INSERT INTO utilities (name, states) VALUES (?,?)');
    const addState = db.prepare('UPDATE utilities SET states = ? WHERE id = ?');
    const link = db.prepare('UPDATE projects SET utility_id = ? WHERE id = ?');
    db.transaction(() => loose.forEach((p) => {
      const name = p.utility_company.trim();
      let u = find.get(name);
      if (!u) { ins.run(name, p.state || null); u = find.get(name); }
      else if (p.state && !(u.states || '').split(',').includes(p.state)) addState.run([u.states, p.state].filter(Boolean).join(','), u.id);
      link.run(u.id, p.id);
    }))();
  }
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

module.exports = { db, hashPassword, verifyPassword, DATA_DIR, MS_STATUSES };
