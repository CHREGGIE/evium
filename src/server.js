'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db, hashPassword, verifyPassword, DATA_DIR, MS_STATUSES } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;
const SESSION_DAYS = 14;
const COOKIE = 'evium_sid';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ENUMS = {
  projectStatus: ['active', 'on_hold', 'blocked', 'won', 'lost', 'cancelled'],
  priority: ['low', 'medium', 'high', 'urgent'],
  ticketStatus: ['open', 'in_progress', 'waiting', 'resolved', 'closed'],
  ticketType: ['task', 'issue', 'site_survey', 'permit', 'utility', 'installation', 'commissioning', 'maintenance', 'billing', 'other'],
  docCategory: ['contract', 'proposal', 'site_plan', 'photo', 'permit', 'utility', 'engineering', 'invoice', 'commissioning', 'other'],
  siteType: ['retail', 'workplace', 'multifamily', 'hospitality', 'fleet', 'municipal', 'parking', 'fuel_station', 'other'],
  chargerType: ['L2', 'DCFC', 'L2 + DCFC'],
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ---------- helpers ----------
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k] === '' ? null : obj[k]]));
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => { throw new HttpError(400, msg); };
const notFound = (what = 'Not found') => { throw new HttpError(404, what); };

function logActivity(projectId, userId, action, detail) {
  db.prepare('INSERT INTO activity (project_id, user_id, action, detail) VALUES (?,?,?,?)').run(projectId, userId, action, detail || null);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setSessionCookie(req, res, token, maxAgeSec) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`);
}

// ---------- auth ----------
function loadUser(req, _res, next) {
  const token = parseCookies(req)[COOKIE];
  if (token) {
    const row = db.prepare(`SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`).get(token);
    if (row) { req.user = row; req.sessionToken = token; }
  }
  next();
}
app.use(loadUser);

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  // Basic CSRF defence: state-changing requests must not come from a foreign origin
  if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Bad origin' });
  }
  next();
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

const loginAttempts = new Map();
app.post('/api/login', wrap((req, res) => {
  const key = req.ip;
  const a = loginAttempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(String(email || ''));
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    a.n++; loginAttempts.set(key, a);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  loginAttempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))").run(token, user.id, `+${SESSION_DAYS} days`);
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  setSessionCookie(req, res, token, SESSION_DAYS * 86400);
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}));

app.post('/api/logout', (req, res) => {
  if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

app.use('/api', requireAuth);

app.get('/api/me', (req, res) => res.json(req.user));

app.post('/api/me/password', wrap((req, res) => {
  const { current, next: pw } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(current || ''), u.password_hash)) bad('Current password is incorrect');
  if (!pw || String(pw).length < 8) bad('New password must be at least 8 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(pw)), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, req.sessionToken);
  res.json({ ok: true });
}));

// ---------- meta ----------
const getMilestones = () => db.prepare('SELECT * FROM milestones ORDER BY position').all();
app.get('/api/meta', (req, res) => {
  res.json({
    milestones: getMilestones(),
    users: db.prepare('SELECT id, name, email, role, active FROM users ORDER BY name').all(),
    enums: { ...ENUMS, milestoneStatus: MS_STATUSES },
  });
});

// ---------- milestones ----------
// Every project tracks each milestone separately, so work can finish in any order.
const parseTs = (s) => Date.parse(String(s).replace(' ', 'T') + (String(s).includes('T') ? '' : 'Z'));

// Adds `milestones` (one entry per configured milestone, in order) plus summary fields to each project.
function attachMilestones(list) {
  if (!list.length) return list;
  const ms = getMilestones();
  const ids = list.map((p) => p.id);
  const by = {};
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    db.prepare(`SELECT * FROM project_milestones WHERE project_id IN (${chunk.map(() => '?').join(',')})`).all(...chunk)
      .forEach((r) => ((by[r.project_id] ||= {})[r.milestone_id] = r));
  }
  const t = Date.now();
  for (const p of list) {
    const mine = by[p.id] || {};
    p.milestones = ms.map((m) => {
      const r = mine[m.id];
      const status = r?.status || 'not_started';
      const days = status === 'in_progress' && r.started_at ? Math.max(0, Math.floor((t - parseTs(r.started_at)) / 864e5)) : null;
      return { id: m.id, status, started_at: r?.started_at || null, completed_at: r?.completed_at || null, days_open: days, sla_days: m.sla_days, overdue: days != null && days > m.sla_days };
    });
    const needed = p.milestones.filter((x) => x.status !== 'not_needed');
    p.ms_done = needed.filter((x) => x.status === 'done').length;
    p.ms_total = needed.length;
    p.ms_complete = p.phase === 'pipeline' && p.ms_done === p.ms_total;
    p.ms_overdue = p.milestones.filter((x) => x.overdue).length;
  }
  return list;
}
const getProject = (id) => attachMilestones([db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).get(id)].filter(Boolean))[0];

// Change one milestone's status, keeping dates and history. Call inside a transaction.
function setMilestone(projectId, milestone, status, userId, note, t = now()) {
  if (!MS_STATUSES.includes(status)) bad('Invalid milestone status');
  const cur = db.prepare('SELECT * FROM project_milestones WHERE project_id = ? AND milestone_id = ?').get(projectId, milestone.id);
  const from = cur?.status || 'not_started';
  if (from === status && !note) return false;
  const startedAt = status === 'in_progress' || status === 'done' ? (cur?.started_at || t) : status === 'not_started' ? null : cur?.started_at || null;
  const completedAt = status === 'done' ? (from === 'done' ? cur.completed_at : t) : null;
  db.prepare(`INSERT INTO project_milestones (project_id, milestone_id, status, started_at, completed_at, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(project_id, milestone_id) DO UPDATE SET status = excluded.status, started_at = excluded.started_at,
      completed_at = excluded.completed_at, updated_at = excluded.updated_at`).run(projectId, milestone.id, status, startedAt, completedAt, t);
  db.prepare('INSERT INTO milestone_history (project_id, milestone_id, milestone_name, from_status, to_status, user_id, note, changed_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(projectId, milestone.id, milestone.name, from, status, userId, note, t);
  const lbl = (s) => s.replace('_', ' ');
  logActivity(projectId, userId, 'milestone_updated', `${milestone.name}: ${lbl(from)} → ${lbl(status)}${note ? ` — ${note}` : ''}`);
  return true;
}

// Apply a {milestone_id: status} map (used when a project enters the pipeline)
function applyMilestoneMap(projectId, map, userId, note, t) {
  if (!map || typeof map !== 'object') return;
  const ms = Object.fromEntries(getMilestones().map((m) => [m.id, m]));
  for (const [mid, status] of Object.entries(map)) {
    if (!ms[mid]) bad('Unknown milestone');
    if (status && status !== 'not_started') setMilestone(projectId, ms[mid], status, userId, note, t);
  }
}

app.put('/api/projects/:id/milestones/:mid', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  if (p.phase === 'diligence') bad('Finish due diligence first, then use "Move to pipeline"');
  const m = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.mid) || notFound('Milestone not found');
  const note = req.body?.note ? String(req.body.note).slice(0, 2000) : null;
  db.transaction(() => {
    const t = now();
    if (setMilestone(p.id, m, String(req.body?.status || ''), req.user.id, note, t)) {
      db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(t, p.id);
    }
  })();
  res.json(getProject(p.id));
}));

// ---------- dashboard ----------
const OPEN = "('active','on_hold','blocked')";
app.get('/api/dashboard', (req, res) => {
  const open = attachMilestones(db.prepare(`${PROJECT_SELECT} WHERE p.phase = 'pipeline' AND p.status IN ${OPEN}`).all());
  const milestones = getMilestones().map((m, i) => {
    const c = { not_started: 0, in_progress: 0, done: 0, not_needed: 0, overdue: 0 };
    open.forEach((p) => { const x = p.milestones[i]; c[x.status]++; if (x.overdue) c.overdue++; });
    return { ...m, ...c };
  });
  const totals = db.prepare(`SELECT
      COUNT(*) FILTER (WHERE phase = 'diligence' AND status IN ${OPEN}) AS in_diligence,
      COUNT(*) FILTER (WHERE status = 'on_hold') AS on_hold,
      COUNT(*) FILTER (WHERE status = 'blocked') AS blocked
    FROM projects`).get();
  const inProgress = open.filter((p) => !p.ms_complete);
  totals.open_projects = inProgress.length;
  totals.pipeline_value = inProgress.reduce((a, p) => a + (p.estimated_value || 0), 0);
  totals.pipeline_chargers = inProgress.reduce((a, p) => a + (p.charger_count || 0), 0);
  const live = attachMilestones(db.prepare(`${PROJECT_SELECT} WHERE p.phase = 'pipeline' AND p.status NOT IN ('lost','cancelled')`).all()).filter((p) => p.ms_complete);
  totals.live_projects = live.length;
  totals.live_chargers = live.reduce((a, p) => a + (p.charger_count || 0), 0);
  totals.open_tickets = db.prepare("SELECT COUNT(*) c FROM tickets WHERE status NOT IN ('resolved','closed')").get().c;
  totals.overdue_tickets = db.prepare("SELECT COUNT(*) c FROM tickets WHERE status NOT IN ('resolved','closed') AND due_date < date('now')").get().c;

  // needs attention: a milestone running past its SLA, or the project is on hold / blocked
  const stalled = open.filter((p) => p.ms_overdue || ['on_hold', 'blocked'].includes(p.status))
    .sort((a, b) => Math.max(0, ...b.milestones.map((x) => x.days_open || 0)) - Math.max(0, ...a.milestones.map((x) => x.days_open || 0)))
    .slice(0, 25);

  const myTickets = db.prepare(`SELECT t.id, t.title, t.status, t.priority, t.due_date, p.id AS project_id, p.code, p.name AS project_name
    FROM tickets t JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_id = ? AND t.status NOT IN ('resolved','closed')
    ORDER BY (t.due_date IS NULL), t.due_date, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 20`).all(req.user.id);

  const recent = db.prepare(`SELECT a.*, u.name AS user_name, p.code, p.name AS project_name FROM activity a
    LEFT JOIN users u ON u.id = a.user_id LEFT JOIN projects p ON p.id = a.project_id
    ORDER BY a.id DESC LIMIT 15`).all();

  res.json({ milestones, totals, stalled, myTickets, recent });
});

// ---------- projects ----------
const PROJECT_FIELDS = ['name', 'customer_name', 'contact_name', 'contact_email', 'contact_phone', 'address', 'city', 'state', 'zip',
  'site_type', 'charger_type', 'charger_count', 'power_kw', 'estimated_value', 'status', 'priority', 'owner_id', 'target_live_date',
  'hold_reason', 'description',
  'property_owner', 'property_owner_contact', 'rebate_program', 'rebate_amount', 'utility_company', 'diligence_notes'];
// What must be filled in before a property can leave Due Diligence
const DILIGENCE_REQUIRED = { property_owner: 'Property owner', rebate_program: 'Rebate the site qualifies for', utility_company: 'Utility company' };
const diligenceMissing = (p) => Object.entries(DILIGENCE_REQUIRED).filter(([k]) => !String(p[k] ?? '').trim()).map(([, v]) => v);

// days_in_phase = days in due diligence, or days since entering the pipeline
const PROJECT_SELECT = `SELECT p.*, u.name AS owner_name,
    CAST(julianday('now') - julianday(p.stage_entered_at) AS INTEGER) AS days_in_phase,
    (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.status NOT IN ('resolved','closed')) AS open_tickets,
    (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS doc_count
  FROM projects p LEFT JOIN users u ON u.id = p.owner_id`;

function validateProject(data) {
  if (data.status && !ENUMS.projectStatus.includes(data.status)) bad('Invalid status');
  if (data.priority && !ENUMS.priority.includes(data.priority)) bad('Invalid priority');
  if (data.state != null) data.state = String(data.state).trim().toUpperCase() || null;
  for (const k of ['charger_count', 'power_kw', 'estimated_value', 'owner_id', 'rebate_amount']) {
    if (data[k] != null) { const n = Number(data[k]); if (Number.isNaN(n)) bad(`${k} must be a number`); data[k] = n; }
  }
}

app.get('/api/projects', (req, res) => {
  const where = []; const args = [];
  const { q, status, owner_id, priority, phase, state, milestone_id, ms_status, progress } = req.query;
  if (phase) { where.push('p.phase = ?'); args.push(phase); }
  if (state === 'none') where.push("(p.state IS NULL OR p.state = '')");
  else if (state) { where.push('p.state = ?'); args.push(state); }
  if (q) {
    where.push('(p.name LIKE ? OR p.code LIKE ? OR p.customer_name LIKE ? OR p.city LIKE ? OR p.address LIKE ? OR p.contact_name LIKE ? OR p.property_owner LIKE ? OR p.utility_company LIKE ?)');
    const like = `%${q}%`; args.push(like, like, like, like, like, like, like, like);
  }
  if (status === 'open') where.push(`p.status IN ${OPEN}`);
  else if (status) { where.push('p.status = ?'); args.push(status); }
  if (owner_id) { where.push('p.owner_id = ?'); args.push(owner_id); }
  if (priority) { where.push('p.priority = ?'); args.push(priority); }
  const sql = `${PROJECT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.updated_at DESC`;
  let rows = attachMilestones(db.prepare(sql).all(...args));
  // milestone filters: e.g. "Permitting is in progress", "Contract still to do"
  if (milestone_id) {
    rows = rows.filter((p) => {
      const x = p.milestones.find((m) => String(m.id) === String(milestone_id));
      if (!x || p.phase !== 'pipeline') return false;
      if (!ms_status) return true;
      if (ms_status === 'todo') return x.status === 'not_started' || x.status === 'in_progress';
      if (ms_status === 'overdue') return x.overdue;
      return x.status === ms_status;
    });
  }
  if (progress === 'complete') rows = rows.filter((p) => p.ms_complete);
  else if (progress === 'incomplete') rows = rows.filter((p) => p.phase === 'pipeline' && !p.ms_complete);
  else if (progress === 'overdue') rows = rows.filter((p) => p.ms_overdue);
  res.json(rows);
});

app.get('/api/projects.csv', (req, res) => {
  const ms = getMilestones();
  const rows = attachMilestones(db.prepare(`${PROJECT_SELECT} ORDER BY p.id`).all());
  rows.forEach((r) => {
    r.progress = r.phase === 'pipeline' ? `${r.ms_done}/${r.ms_total}` : '';
    ms.forEach((m, i) => (r[`ms_${m.id}`] = r.phase === 'pipeline' ? r.milestones[i].status.replace('_', ' ') : ''));
  });
  const cols = ['code', 'phase', 'name', 'customer_name', 'contact_name', 'contact_email', 'contact_phone', 'address', 'city', 'state', 'zip',
    'site_type', 'charger_type', 'charger_count', 'power_kw', 'estimated_value', 'progress', ...ms.map((m) => `ms_${m.id}`), 'status', 'hold_reason',
    'priority', 'owner_name', 'target_live_date', 'open_tickets', 'property_owner', 'property_owner_contact', 'rebate_program',
    'rebate_amount', 'utility_company', 'diligence_completed_at', 'created_at', 'updated_at'];
  const head = cols.map((c) => (c.startsWith('ms_') ? ms.find((m) => `ms_${m.id}` === c).name : c));
  const esc = (v) => {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="evium-projects-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send([head.map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
});

app.post('/api/projects', wrap((req, res) => {
  const data = pick(req.body || {}, PROJECT_FIELDS);
  if (!data.name) bad('Project name is required');
  validateProject(data);
  // New properties go to Due Diligence unless the caller explicitly creates a pipeline project.
  const phase = req.body.phase === 'pipeline' ? 'pipeline' : 'diligence';
  const id = db.transaction(() => {
    const cols = [...Object.keys(data), 'phase'];
    const vals = [...Object.keys(data).map((c) => data[c]), phase];
    const info = db.prepare(`INSERT INTO projects (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
    const pid = info.lastInsertRowid;
    db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(`EV-${String(pid).padStart(4, '0')}`, pid);
    logActivity(pid, req.user.id, 'project_created', phase === 'diligence' ? `${data.name} (added to due diligence)` : data.name);
    if (phase === 'pipeline') applyMilestoneMap(pid, req.body.milestones, req.user.id, null, now());
    return pid;
  })();
  res.status(201).json(getProject(id));
}));

app.get('/api/projects/:id', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  p.history = db.prepare(`SELECT h.*, COALESCE(m.name, h.milestone_name) AS milestone, m.color, u.name AS user_name
    FROM milestone_history h LEFT JOIN milestones m ON m.id = h.milestone_id LEFT JOIN users u ON u.id = h.user_id
    WHERE h.project_id = ? ORDER BY h.changed_at DESC, h.id DESC`).all(p.id);
  res.json(p);
});

app.patch('/api/projects/:id', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  const data = pick(req.body || {}, PROJECT_FIELDS);
  if ('name' in data && !data.name) bad('Project name is required');
  validateProject(data);
  const changed = Object.keys(data).filter((k) => String(data[k] ?? '') !== String(p[k] ?? ''));
  if (changed.length) {
    db.prepare(`UPDATE projects SET ${changed.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...changed.map((c) => data[c]), now(), p.id);
    if (changed.includes('status')) logActivity(p.id, req.user.id, 'status_changed', `${p.status} → ${data.status}${data.hold_reason ? ` (${data.hold_reason})` : ''}`);
    const other = changed.filter((c) => c !== 'status');
    if (other.length) logActivity(p.id, req.user.id, 'project_updated', other.join(', '));
  }
  res.json(getProject(p.id));
}));

// Due diligence done: move the property into the pipeline, marking any milestones already under way
app.post('/api/projects/:id/promote', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  if (p.phase !== 'diligence') bad('This project is already in the pipeline');
  const missing = diligenceMissing(p);
  if (missing.length) bad(`Due diligence isn't finished. Still missing: ${missing.join(', ')}`);
  const note = req.body?.note ? String(req.body.note).slice(0, 2000) : null;
  db.transaction(() => {
    const t = now();
    db.prepare("UPDATE projects SET phase = 'pipeline', stage_entered_at = ?, diligence_completed_at = ?, updated_at = ? WHERE id = ?").run(t, t, t, p.id);
    logActivity(p.id, req.user.id, 'moved_to_pipeline', `Due diligence complete${note ? `: ${note}` : ''}`);
    applyMilestoneMap(p.id, req.body?.milestones, req.user.id, null, t);
  })();
  res.json(getProject(p.id));
}));

app.delete('/api/projects/:id', requireAdmin, wrap((req, res) => {
  const docs = db.prepare('SELECT stored_name FROM documents WHERE project_id = ?').all(req.params.id);
  const info = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (!info.changes) notFound('Project not found');
  docs.forEach((d) => fs.rm(path.join(UPLOAD_DIR, d.stored_name), { force: true }, () => {}));
  res.json({ ok: true });
}));

app.get('/api/projects/:id/activity', (req, res) => {
  res.json(db.prepare(`SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.project_id = ? ORDER BY a.id DESC LIMIT 200`).all(req.params.id));
});

app.post('/api/projects/:id/notes', wrap((req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  const body = String(req.body?.body || '').trim();
  if (!body) bad('Note cannot be empty');
  logActivity(p.id, req.user.id, 'note', body.slice(0, 5000));
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), p.id);
  res.status(201).json({ ok: true });
}));

// ---------- tickets ----------
const TICKET_FIELDS = ['title', 'description', 'type', 'priority', 'status', 'assignee_id', 'due_date'];
const TICKET_SELECT = `SELECT t.*, p.code AS project_code, p.name AS project_name, a.name AS assignee_name, c.name AS creator_name,
    (SELECT COUNT(*) FROM ticket_comments tc WHERE tc.ticket_id = t.id) AS comment_count
  FROM tickets t JOIN projects p ON p.id = t.project_id LEFT JOIN users a ON a.id = t.assignee_id LEFT JOIN users c ON c.id = t.created_by`;

function validateTicket(d) {
  if (d.type && !ENUMS.ticketType.includes(d.type)) bad('Invalid ticket type');
  if (d.priority && !ENUMS.priority.includes(d.priority)) bad('Invalid priority');
  if (d.status && !ENUMS.ticketStatus.includes(d.status)) bad('Invalid ticket status');
  if (d.assignee_id != null) d.assignee_id = Number(d.assignee_id);
}

app.get('/api/tickets', (req, res) => {
  const where = []; const args = [];
  const { q, status, assignee_id, project_id, priority, type } = req.query;
  if (q) { where.push('(t.title LIKE ? OR t.description LIKE ? OR p.name LIKE ? OR p.code LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l); }
  if (status === 'open') where.push("t.status NOT IN ('resolved','closed')");
  else if (status) { where.push('t.status = ?'); args.push(status); }
  if (assignee_id === 'me') { where.push('t.assignee_id = ?'); args.push(req.user.id); }
  else if (assignee_id === 'none') where.push('t.assignee_id IS NULL');
  else if (assignee_id) { where.push('t.assignee_id = ?'); args.push(assignee_id); }
  if (project_id) { where.push('t.project_id = ?'); args.push(project_id); }
  if (priority) { where.push('t.priority = ?'); args.push(priority); }
  if (type) { where.push('t.type = ?'); args.push(type); }
  const sql = `${TICKET_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT 500`;
  res.json(db.prepare(sql).all(...args));
});

app.post('/api/projects/:id/tickets', wrap((req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  const d = pick(req.body || {}, TICKET_FIELDS);
  if (!d.title) bad('Ticket title is required');
  validateTicket(d);
  const cols = Object.keys(d);
  const info = db.prepare(`INSERT INTO tickets (${[...cols, 'project_id', 'created_by'].join(',')}) VALUES (${[...cols, 'p', 'c'].map(() => '?').join(',')})`)
    .run(...cols.map((c) => d[c]), p.id, req.user.id);
  logActivity(p.id, req.user.id, 'ticket_created', `#${info.lastInsertRowid} ${d.title}`);
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), p.id);
  res.status(201).json(db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid));
}));

app.get('/api/tickets/:id', (req, res) => {
  const t = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  t.comments = db.prepare(`SELECT c.*, u.name AS user_name FROM ticket_comments c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.ticket_id = ? ORDER BY c.id`).all(t.id);
  t.documents = db.prepare(`SELECT d.*, u.name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.ticket_id = ? ORDER BY d.id DESC`).all(t.id);
  res.json(t);
});

app.patch('/api/tickets/:id', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) || notFound('Ticket not found');
  const d = pick(req.body || {}, TICKET_FIELDS);
  if ('title' in d && !d.title) bad('Ticket title is required');
  validateTicket(d);
  const changed = Object.keys(d).filter((k) => String(d[k] ?? '') !== String(t[k] ?? ''));
  if (changed.length) {
    const sets = changed.map((c) => `${c} = ?`); const vals = changed.map((c) => d[c]);
    if (changed.includes('status')) {
      sets.push('closed_at = ?'); vals.push(['resolved', 'closed'].includes(d.status) ? now() : null);
    }
    db.prepare(`UPDATE tickets SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, now(), t.id);
    const summary = changed.includes('status') ? `#${t.id} status ${t.status} → ${d.status}` : `#${t.id} updated (${changed.join(', ')})`;
    logActivity(t.project_id, req.user.id, 'ticket_updated', summary);
    if (changed.includes('status')) {
      db.prepare('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?,?,?)').run(t.id, req.user.id, `Status changed: ${t.status} → ${d.status}`);
    }
  }
  res.json(db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(t.id));
}));

app.delete('/api/tickets/:id', requireAdmin, wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) || notFound('Ticket not found');
  db.prepare('DELETE FROM tickets WHERE id = ?').run(t.id);
  logActivity(t.project_id, req.user.id, 'ticket_deleted', `#${t.id} ${t.title}`);
  res.json({ ok: true });
}));

app.post('/api/tickets/:id/comments', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id) || notFound('Ticket not found');
  const body = String(req.body?.body || '').trim();
  if (!body) bad('Comment cannot be empty');
  db.prepare('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?,?,?)').run(t.id, req.user.id, body.slice(0, 10000));
  db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now(), t.id);
  res.status(201).json({ ok: true });
}));

// ---------- documents ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10)),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 20 },
});

app.get('/api/projects/:id/documents', (req, res) => {
  res.json(db.prepare(`SELECT d.*, u.name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.project_id = ? ORDER BY d.id DESC`).all(req.params.id));
});

app.post('/api/projects/:id/documents', upload.array('files'), wrap((req, res) => {
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!p) { cleanup(); notFound('Project not found'); }
  if (!files.length) bad('No files uploaded');
  const category = ENUMS.docCategory.includes(req.body.category) ? req.body.category : 'other';
  let ticketId = req.body.ticket_id ? Number(req.body.ticket_id) : null;
  if (ticketId && !db.prepare('SELECT 1 FROM tickets WHERE id = ? AND project_id = ?').get(ticketId, p.id)) ticketId = null;
  const ins = db.prepare(`INSERT INTO documents (project_id, ticket_id, category, original_name, stored_name, mime, size, notes, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => files.forEach((f) => {
    // multer gives latin1-decoded names; restore UTF-8
    const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
    ins.run(p.id, ticketId, category, name, f.filename, f.mimetype, f.size, req.body.notes || null, req.user.id);
  }))();
  logActivity(p.id, req.user.id, 'documents_uploaded', `${files.length} file(s) · ${category}${ticketId ? ` · ticket #${ticketId}` : ''}`);
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), p.id);
  res.status(201).json({ ok: true, count: files.length });
}));

const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/;
app.get('/api/documents/:id/download', (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Document not found' });
  const file = path.join(UPLOAD_DIR, path.basename(d.stored_name));
  if (!fs.existsSync(file)) return res.status(410).json({ error: 'File missing from storage' });
  const inline = req.query.inline === '1' && INLINE_TYPES.test(d.mime || '');
  res.setHeader('Content-Type', inline ? d.mime : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.original_name)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  fs.createReadStream(file).pipe(res);
});

app.patch('/api/documents/:id', wrap((req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) || notFound('Document not found');
  const category = ENUMS.docCategory.includes(req.body?.category) ? req.body.category : d.category;
  db.prepare('UPDATE documents SET category = ?, notes = ? WHERE id = ?').run(category, req.body?.notes ?? d.notes, d.id);
  res.json({ ok: true });
}));

app.delete('/api/documents/:id', wrap((req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) || notFound('Document not found');
  if (req.user.role !== 'admin' && d.uploaded_by !== req.user.id) throw new HttpError(403, 'Only the uploader or an admin can delete this file');
  db.prepare('DELETE FROM documents WHERE id = ?').run(d.id);
  fs.rm(path.join(UPLOAD_DIR, path.basename(d.stored_name)), { force: true }, () => {});
  logActivity(d.project_id, req.user.id, 'document_deleted', d.original_name);
  res.json({ ok: true });
}));

// ---------- admin: users ----------
app.get('/api/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY name').all());
});

app.post('/api/users', requireAdmin, wrap((req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email) bad('Name and email are required');
  if (!password || String(password).length < 8) bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) bad('A user with that email already exists');
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
    .run(String(name), String(email).trim(), hashPassword(String(password)), role === 'admin' ? 'admin' : 'staff');
  res.status(201).json({ id: info.lastInsertRowid });
}));

app.patch('/api/users/:id', requireAdmin, wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) || notFound('User not found');
  const { name, email, role, active, password } = req.body || {};
  if (u.id === req.user.id && (active === false || active === 0 || role === 'staff')) bad('You cannot deactivate or demote yourself');
  db.prepare('UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?').run(
    name ?? u.name, email ?? u.email, role ? (role === 'admin' ? 'admin' : 'staff') : u.role,
    active === undefined ? u.active : (active ? 1 : 0), u.id);
  if (password) {
    if (String(password).length < 8) bad('Password must be at least 8 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }
  if (active === false || active === 0) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  res.json({ ok: true });
}));

// ---------- admin: milestones ----------
app.put('/api/milestones', requireAdmin, wrap((req, res) => {
  const list = Array.isArray(req.body) ? req.body : bad('Expected a list of milestones');
  if (!list.length) bad('At least one milestone is required');
  const existing = new Set(getMilestones().map((m) => m.id));
  const keep = new Set(list.filter((m) => m.id).map((m) => Number(m.id)));
  db.transaction(() => {
    // removing a milestone drops it from every project (its history entries keep the name)
    for (const id of existing) if (!keep.has(id)) db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
    list.forEach((m, i) => {
      if (!String(m.name || '').trim()) bad('Every milestone needs a name');
      const vals = [String(m.name).trim(), i + 1, /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#64748b', Math.max(1, Number(m.sla_days) || 30)];
      if (m.id && existing.has(Number(m.id))) db.prepare('UPDATE milestones SET name=?, position=?, color=?, sla_days=? WHERE id=?').run(...vals, Number(m.id));
      else db.prepare('INSERT INTO milestones (name, position, color, sla_days) VALUES (?,?,?,?)').run(...vals);
    });
  })();
  res.json(getMilestones());
}));

// ---------- static frontend ----------
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ---------- errors ----------
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${MAX_UPLOAD_MB} MB)` : err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Evium CRM running on http://localhost:${PORT}`));
}
module.exports = app;
