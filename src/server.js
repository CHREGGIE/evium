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
  docCategory: ['contract', 'proposal', 'electrical_quote', 'site_plan', 'photo', 'permit', 'utility', 'engineering', 'invoice', 'commissioning', 'other'],
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
  // send only our site address (never full page paths) to other sites; OpenStreetMap's tile servers require it
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ---------- helpers ----------
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k] === '' ? null : obj[k]]));
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
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
    const row = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.states, u.can_review, u.dd_assessor, u.milestone_ids FROM sessions s JOIN users u ON u.id = s.user_id
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

// what a person is responsible for (shapes their dashboard)
function setDuties(userId, body) {
  if ('dd_assessor' in body) db.prepare('UPDATE users SET dd_assessor = ? WHERE id = ?').run(body.dd_assessor ? 1 : 0, userId);
  if ('milestone_ids' in body) {
    const valid = new Set(db.prepare('SELECT id FROM milestones').all().map((m) => m.id));
    const ids = (Array.isArray(body.milestone_ids) ? body.milestone_ids : String(body.milestone_ids || '').split(','))
      .map(Number).filter((id) => valid.has(id));
    db.prepare('UPDATE users SET milestone_ids = ? WHERE id = ?').run([...new Set(ids)].join(',') || null, userId);
  }
}
app.patch('/api/me/duties', wrap((req, res) => {
  setDuties(req.user.id, req.body || {});
  res.json(db.prepare('SELECT id, name, email, role, states, can_review, dd_assessor, milestone_ids FROM users WHERE id = ?').get(req.user.id));
}));

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
    users: db.prepare('SELECT id, name, email, role, active, states, can_review, dd_assessor, milestone_ids FROM users ORDER BY name').all(),
    utilities: db.prepare('SELECT id, name, states FROM utilities ORDER BY name').all(),
    rebates: db.prepare('SELECT id, name, state, kind, status, amount_text, provider FROM rebates ORDER BY state, name').all(),
    statesInUse: db.prepare("SELECT DISTINCT state FROM projects WHERE state IS NOT NULL AND state <> '' UNION SELECT DISTINCT state FROM rebates WHERE state <> 'US'").all().map((r) => r.state).sort(),
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
  const by = {}; const msgs = {}; const rebs = {}; const docs = {}; const steps = {}; const msDocs = {};
  const tmpl = {};
  db.prepare('SELECT milestone_id, COUNT(*) c FROM milestone_steps GROUP BY milestone_id').all().forEach((r) => (tmpl[r.milestone_id] = r.c));
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500); const qs = chunk.map(() => '?').join(',');
    db.prepare(`SELECT project_id, milestone_id, COUNT(*) total, COUNT(done_at) done FROM project_steps WHERE project_id IN (${qs}) GROUP BY project_id, milestone_id`).all(...chunk)
      .forEach((r) => ((steps[r.project_id] ||= {})[r.milestone_id] = r));
    db.prepare(`SELECT project_id, milestone_id, COUNT(*) c FROM documents WHERE milestone_id IS NOT NULL AND project_id IN (${qs}) GROUP BY project_id, milestone_id`).all(...chunk)
      .forEach((r) => ((msDocs[r.project_id] ||= {})[r.milestone_id] = r.c));
    db.prepare(`SELECT pr.project_id, r.id, r.name, r.state, r.kind, r.status, r.amount_text, r.max_amount, r.deadline, r.verified FROM project_rebates pr
      JOIN rebates r ON r.id = pr.rebate_id WHERE pr.project_id IN (${qs}) ORDER BY pr.position, r.name`).all(...chunk)
      .forEach(({ project_id: pid, ...r }) => (rebs[pid] ||= []).push(r));
    db.prepare(`SELECT DISTINCT project_id, category FROM documents WHERE project_id IN (${qs})`).all(...chunk)
      .forEach((r) => (docs[r.project_id] ||= new Set()).add(r.category));
    db.prepare(`SELECT * FROM project_milestones WHERE project_id IN (${qs})`).all(...chunk)
      .forEach((r) => ((by[r.project_id] ||= {})[r.milestone_id] = r));
    // chat message counts: per milestone, and the total for the site's main chat
    db.prepare(`SELECT project_id, milestone_id, COUNT(*) c FROM messages WHERE project_id IN (${qs}) GROUP BY project_id, milestone_id`).all(...chunk)
      .forEach((r) => ((msgs[r.project_id] ||= {})[r.milestone_id ?? 0] = r.c));
  }
  const t = Date.now();
  for (const p of list) {
    const mine = by[p.id] || {};
    const counts = msgs[p.id] || {};
    const haveDocs = docs[p.id] || new Set();
    p.msg_count = Object.values(counts).reduce((a, n) => a + n, 0);
    p.rebates = rebs[p.id] || [];
    p.milestones = ms.map((m) => {
      const r = mine[m.id];
      const status = r?.status || 'not_started';
      const days = status === 'in_progress' && r.started_at ? Math.max(0, Math.floor((t - parseTs(r.started_at)) / 864e5)) : null;
      return { id: m.id, status, started_at: r?.started_at || null, completed_at: r?.completed_at || null, days_open: days, sla_days: m.sla_days, overdue: days != null && days > m.sla_days, msg_count: counts[m.id] || 0,
        docs_missing: status === 'done' || status === 'not_needed' ? [] : requiredDocs(m).filter((c) => !haveDocs.has(c)),
        // steps not copied to this project yet: count the defaults (all ticked if the milestone is already done)
        steps_total: steps[p.id]?.[m.id]?.total ?? (tmpl[m.id] || 0),
        steps_done: steps[p.id]?.[m.id]?.done ?? (status === 'done' ? (tmpl[m.id] || 0) : 0),
        doc_count: msDocs[p.id]?.[m.id] || 0 };
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

const requiredDocs = (m) => String(m.required_docs || '').split(',').map((x) => x.trim()).filter(Boolean);
const docLabel = (c) => c.replace(/_/g, ' ');

// Change one milestone's status, keeping dates and history. Call inside a transaction.
function setMilestone(projectId, milestone, status, userId, note, t = now()) {
  if (!MS_STATUSES.includes(status)) bad('Invalid milestone status');
  if (status === 'done') {
    const have = new Set(db.prepare('SELECT DISTINCT category FROM documents WHERE project_id = ?').all(projectId).map((r) => r.category));
    const missing = requiredDocs(milestone).filter((c) => !have.has(c));
    if (missing.length) {
      throw new HttpError(409, `${milestone.name} can't be marked done until a ${missing.map(docLabel).join(' and a ')} document is uploaded.`,
        { missing_docs: missing, milestone_id: milestone.id, project_id: projectId });
    }
  }
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

// ---------- milestone pages: steps ----------
// A project's own copy of a milestone's steps, created from the Admin defaults the first time it's needed.
function ensureSteps(projectId, milestoneId) {
  if (db.prepare('SELECT 1 FROM project_steps WHERE project_id = ? AND milestone_id = ?').get(projectId, milestoneId)) return;
  const st = db.prepare('SELECT status, completed_at FROM project_milestones WHERE project_id = ? AND milestone_id = ?').get(projectId, milestoneId);
  const doneAt = st?.status === 'done' ? (st.completed_at || now()) : null; // a milestone already done starts with every step ticked
  const ins = db.prepare('INSERT INTO project_steps (project_id, milestone_id, label, position, done_at) VALUES (?,?,?,?,?)');
  db.prepare('SELECT label, position FROM milestone_steps WHERE milestone_id = ? ORDER BY position, id').all(milestoneId)
    .forEach((s) => ins.run(projectId, milestoneId, s.label, s.position, doneAt));
}
const stepsFor = (projectId, milestoneId) => db.prepare(`SELECT s.*, u.name AS done_by_name FROM project_steps s
  LEFT JOIN users u ON u.id = s.done_by WHERE s.project_id = ? AND s.milestone_id = ? ORDER BY s.position, s.id`).all(projectId, milestoneId);

app.get('/api/projects/:id/milestones/:mid', wrap((req, res) => {
  const p = getProject(req.params.id) || notFound('Project not found');
  const m = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.mid) || notFound('Milestone not found');
  db.transaction(() => ensureSteps(p.id, m.id))();
  const all = getMilestones();
  const i = all.findIndex((x) => x.id === m.id);
  res.json({
    project: p,
    milestone: { ...m, required: requiredDocs(m) },
    state: p.milestones.find((x) => x.id === m.id),
    steps: stepsFor(p.id, m.id),
    documents: db.prepare(`SELECT d.*, u.name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.project_id = ? AND d.milestone_id = ? ORDER BY d.id DESC`).all(p.id, m.id),
    otherDocs: db.prepare(`SELECT d.category, COUNT(*) c FROM documents d WHERE d.project_id = ? AND (d.milestone_id IS NULL OR d.milestone_id <> ?) GROUP BY d.category`).all(p.id, m.id),
    reminders: db.prepare(`${REMINDER_SELECT} WHERE r.project_id = ? AND r.milestone_id = ? AND r.done_at IS NULL ORDER BY r.due_on`).all(p.id, m.id),
    prev: all[i - 1] || null,
    next: all[i + 1] || null,
  });
}));

app.post('/api/projects/:id/milestones/:mid/steps', wrap((req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  const m = db.prepare('SELECT id, name FROM milestones WHERE id = ?').get(req.params.mid) || notFound('Milestone not found');
  const label = String(req.body?.label || '').trim();
  if (!label) bad('Step name is required');
  db.transaction(() => {
    ensureSteps(p.id, m.id);
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 n FROM project_steps WHERE project_id = ? AND milestone_id = ?').get(p.id, m.id).n;
    db.prepare('INSERT INTO project_steps (project_id, milestone_id, label, position) VALUES (?,?,?,?)').run(p.id, m.id, label.slice(0, 300), pos);
  })();
  res.status(201).json(stepsFor(p.id, m.id));
}));

app.patch('/api/steps/:id', wrap((req, res) => {
  const s = db.prepare('SELECT * FROM project_steps WHERE id = ?').get(req.params.id) || notFound('Step not found');
  const m = db.prepare('SELECT * FROM milestones WHERE id = ?').get(s.milestone_id);
  db.transaction(() => {
    if ('label' in (req.body || {})) {
      const label = String(req.body.label || '').trim(); if (!label) bad('Step name is required');
      db.prepare('UPDATE project_steps SET label = ? WHERE id = ?').run(label.slice(0, 300), s.id);
    }
    if ('done' in (req.body || {})) {
      const t = now();
      if (req.body.done && !s.done_at) {
        db.prepare('UPDATE project_steps SET done_at = ?, done_by = ? WHERE id = ?').run(t, req.user.id, s.id);
        logActivity(s.project_id, req.user.id, 'step_done', `${m.name}: ${s.label}`);
        // first step ticked on a milestone that hasn't started: it's now in progress
        const cur = db.prepare('SELECT status FROM project_milestones WHERE project_id = ? AND milestone_id = ?').get(s.project_id, m.id)?.status || 'not_started';
        const p = db.prepare('SELECT phase FROM projects WHERE id = ?').get(s.project_id);
        if (cur === 'not_started' && p.phase === 'pipeline') setMilestone(s.project_id, m, 'in_progress', req.user.id, null, t);
      } else if (!req.body.done && s.done_at) {
        db.prepare('UPDATE project_steps SET done_at = NULL, done_by = NULL WHERE id = ?').run(s.id);
      }
      db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(t, s.project_id);
    }
  })();
  res.json(stepsFor(s.project_id, s.milestone_id));
}));

app.delete('/api/steps/:id', wrap((req, res) => {
  const s = db.prepare('SELECT * FROM project_steps WHERE id = ?').get(req.params.id) || notFound('Step not found');
  db.prepare('DELETE FROM project_steps WHERE id = ?').run(s.id);
  res.json(stepsFor(s.project_id, s.milestone_id));
}));

// Admin: the default steps for a milestone (used for projects that haven't opened it yet)
app.get('/api/milestones/:id/steps', (req, res) => {
  res.json(db.prepare('SELECT * FROM milestone_steps WHERE milestone_id = ? ORDER BY position, id').all(req.params.id));
});
app.put('/api/milestones/:id/steps', requireAdmin, wrap((req, res) => {
  const m = db.prepare('SELECT id FROM milestones WHERE id = ?').get(req.params.id) || notFound('Milestone not found');
  const labels = (Array.isArray(req.body) ? req.body : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 50);
  db.transaction(() => {
    db.prepare('DELETE FROM milestone_steps WHERE milestone_id = ?').run(m.id);
    const ins = db.prepare('INSERT INTO milestone_steps (milestone_id, label, position) VALUES (?,?,?)');
    labels.forEach((l, i) => ins.run(m.id, l.slice(0, 300), i));
  })();
  res.json(db.prepare('SELECT * FROM milestone_steps WHERE milestone_id = ? ORDER BY position').all(m.id));
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
      COUNT(*) FILTER (WHERE phase = 'diligence' AND dd_stage <> 'passed' AND status IN ${OPEN}) AS in_diligence,
      COUNT(*) FILTER (WHERE phase = 'diligence' AND dd_stage = 'new' AND status IN ${OPEN}) AS to_assess,
      COUNT(*) FILTER (WHERE phase = 'diligence' AND dd_stage = 'review' AND status IN ${OPEN}) AS to_review,
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

  // ---- your work ----
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const myStates = String(me.states || '').split(',').filter(Boolean);
  const inScope = (p) => !myStates.length || myStates.includes(p.state);  // a territory limits milestone work to those states
  const mine = { scoped: myStates, dd: null, review: null, milestones: [] };
  if (me.dd_assessor) {
    mine.dd = attachMilestones(db.prepare(`${PROJECT_SELECT} WHERE p.phase = 'diligence' AND p.dd_stage = 'new' AND p.status IN ${OPEN}
      ORDER BY (p.dd_review_note IS NULL), p.created_at`).all());
    mine.dd_waiting = db.prepare(`SELECT COUNT(*) c FROM projects WHERE phase = 'diligence' AND dd_stage = 'review' AND status IN ${OPEN}`).get().c;
  }
  if (canReview(me)) {
    mine.review = attachMilestones(db.prepare(`${PROJECT_SELECT} WHERE p.phase = 'diligence' AND p.dd_stage = 'review' AND p.status IN ${OPEN}
      ORDER BY p.dd_rating DESC, p.dd_assessed_at`).all());
  }
  const owned = String(me.milestone_ids || '').split(',').map(Number).filter(Boolean);
  const allMs = getMilestones();
  allMs.forEach((m, i) => {
    if (!owned.includes(m.id)) return;
    const prev = allMs[i - 1];
    const slim = (p, extra = {}) => ({ id: p.id, code: p.code, name: p.name, address: p.address, city: p.city, state: p.state, status: p.status, hold_reason: p.hold_reason, ms: p.milestones[i], ...extra });
    const scoped = open.filter(inScope);
    const inProgress = scoped.filter((p) => p.milestones[i].status === 'in_progress')
      .sort((a, b) => b.milestones[i].overdue - a.milestones[i].overdue || (b.milestones[i].days_open || 0) - (a.milestones[i].days_open || 0)).map((p) => slim(p));
    // up next: not started, and the milestone before it is finished (or there isn't one)
    const upNext = scoped.filter((p) => p.milestones[i].status === 'not_started' && (!prev || ['done', 'not_needed'].includes(p.milestones[i - 1].status)))
      .sort((a, b) => String(a.milestones[i - 1]?.completed_at || '').localeCompare(String(b.milestones[i - 1]?.completed_at || '')))
      .map((p) => slim(p, { prev: prev ? { name: prev.name, status: p.milestones[i - 1].status, completed_at: p.milestones[i - 1].completed_at } : null }));
    mine.milestones.push({ id: m.id, name: m.name, color: m.color, in_progress: inProgress, up_next: upNext });
  });

  res.json({ milestones, totals, stalled, myTickets, recent, mine });
});

// ---------- projects ----------
const PROJECT_FIELDS = ['name', 'customer_name', 'contact_name', 'contact_email', 'contact_phone', 'address', 'city', 'state', 'zip',
  'site_type', 'charger_type', 'charger_count', 'power_kw', 'estimated_value', 'status', 'priority', 'owner_id', 'target_live_date',
  'hold_reason', 'description',
  'property_owner', 'property_owner_contact', 'rebate_program', 'rebate_amount', 'utility_company', 'diligence_notes',
  'utility_id', 'tax_credit_id', 'tax_credit_eligible', 'tax_credit_amount', 'lat', 'lng'];
// What must be filled in before a property can leave Due Diligence
const DILIGENCE_REQUIRED = { property_owner: 'Property owner', rebate_program: 'Rebate the site qualifies for', utility_company: 'Utility company' };
// the rebate check is met by picking a rebate from the board, or typing one in (e.g. "None")
const diligenceMissing = (p) => Object.entries(DILIGENCE_REQUIRED).filter(([k]) => {
  if (k === 'rebate_program' && db.prepare('SELECT 1 FROM project_rebates WHERE project_id = ?').get(p.id)) return false;
  return !String(p[k] ?? '').trim();
}).map(([, v]) => v);

// days_in_phase = days in due diligence, or days since entering the pipeline
const PROJECT_SELECT = `SELECT p.*, u.name AS owner_name, ua.name AS assessed_by_name, ur.name AS reviewed_by_name,
    CAST(julianday('now') - julianday(p.stage_entered_at) AS INTEGER) AS days_in_phase,
    (SELECT COUNT(*) FROM tickets t WHERE t.project_id = p.id AND t.status NOT IN ('resolved','closed')) AS open_tickets,
    (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS doc_count
  FROM projects p LEFT JOIN users u ON u.id = p.owner_id LEFT JOIN users ua ON ua.id = p.dd_assessed_by LEFT JOIN users ur ON ur.id = p.dd_reviewed_by`;

function validateProject(data) {
  if (data.status && !ENUMS.projectStatus.includes(data.status)) bad('Invalid status');
  if (data.priority && !ENUMS.priority.includes(data.priority)) bad('Invalid priority');
  if (data.state != null) data.state = String(data.state).trim().toUpperCase() || null;
  for (const k of ['charger_count', 'power_kw', 'estimated_value', 'owner_id', 'rebate_amount', 'tax_credit_amount', 'lat', 'lng', 'utility_id', 'tax_credit_id']) {
    if (data[k] != null) { const n = Number(data[k]); if (Number.isNaN(n)) bad(`${k} must be a number`); data[k] = n; }
  }
  if (data.tax_credit_eligible != null && !['yes', 'no', 'unknown'].includes(data.tax_credit_eligible)) bad('Invalid tax credit eligibility');
  if (data.tax_credit_eligible === null) data.tax_credit_eligible = 'unknown';
  // picking a utility from the directory also fills in its name
  if (data.utility_id) {
    const ut = db.prepare('SELECT name FROM utilities WHERE id = ?').get(data.utility_id) || bad('Unknown utility');
    data.utility_company = ut.name;
  } else if ('utility_id' in data) data.utility_company = data.utility_company ?? null;
  if (data.tax_credit_id && !db.prepare("SELECT 1 FROM rebates WHERE id = ?").get(data.tax_credit_id)) bad('Unknown tax credit');
}

// replace the rebates a site is going after (usually one)
function setProjectRebates(projectId, ids, userId) {
  if (!Array.isArray(ids)) return;
  const clean = [...new Set(ids.map(Number).filter(Boolean))];
  clean.forEach((id) => db.prepare('SELECT 1 FROM rebates WHERE id = ?').get(id) || bad('Unknown rebate'));
  const before = db.prepare('SELECT rebate_id FROM project_rebates WHERE project_id = ? ORDER BY position').all(projectId).map((r) => r.rebate_id);
  if (before.join(',') === clean.join(',')) return;
  db.prepare('DELETE FROM project_rebates WHERE project_id = ?').run(projectId);
  const ins = db.prepare('INSERT INTO project_rebates (project_id, rebate_id, position) VALUES (?,?,?)');
  clean.forEach((id, i) => ins.run(projectId, id, i));
  const names = clean.map((id) => db.prepare('SELECT name FROM rebates WHERE id = ?').get(id).name);
  logActivity(projectId, userId, 'project_updated', `rebate: ${names.join(', ') || 'none'}`);
}
const ADDRESS_FIELDS = ['address', 'city', 'state', 'zip'];

app.get('/api/projects', (req, res) => {
  const where = []; const args = [];
  const { q, status, owner_id, priority, phase, state, states, milestone_id, ms_status, progress, dd_stage } = req.query;
  if (phase) { where.push('p.phase = ?'); args.push(phase); }
  if (dd_stage) { where.push('p.dd_stage = ?'); args.push(dd_stage); }
  if (states) {
    const list = String(states).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (list.length) { where.push(`p.state IN (${list.map(() => '?').join(',')})`); args.push(...list); }
  }
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
    r.rebates_selected = r.rebates.map((x) => x.name).join('; ');
    r.tax_credit = r.tax_credit_id ? db.prepare('SELECT name FROM rebates WHERE id = ?').get(r.tax_credit_id)?.name : '';
    r.progress = r.phase === 'pipeline' ? `${r.ms_done}/${r.ms_total}` : '';
    ms.forEach((m, i) => (r[`ms_${m.id}`] = r.phase === 'pipeline' ? r.milestones[i].status.replace('_', ' ') : ''));
  });
  const cols = ['code', 'phase', 'name', 'customer_name', 'contact_name', 'contact_email', 'contact_phone', 'address', 'city', 'state', 'zip',
    'site_type', 'charger_type', 'charger_count', 'power_kw', 'estimated_value', 'progress', ...ms.map((m) => `ms_${m.id}`), 'status', 'hold_reason',
    'priority', 'owner_name', 'target_live_date', 'open_tickets', 'property_owner', 'property_owner_contact', 'rebate_program',
    'rebate_amount', 'rebates_selected', 'utility_company', 'tax_credit', 'tax_credit_eligible', 'tax_credit_amount', 'diligence_completed_at', 'created_at', 'updated_at'];
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
    setProjectRebates(pid, req.body.rebate_ids, req.user.id);
    if (phase === 'pipeline') applyMilestoneMap(pid, req.body.milestones, req.user.id, null, now());
    // let everyone whose territory covers this state know
    if (data.state) {
      const team = db.prepare('SELECT id, states FROM users WHERE active = 1').all()
        .filter((u) => String(u.states || '').split(',').includes(data.state)).map((u) => u.id);
      notify(team, { kind: 'territory', projectId: pid, actorId: req.user.id,
        text: `New ${phase === 'diligence' ? 'property' : 'project'} in ${data.state}: ${data.name}${data.city ? ` (${data.city})` : ''}, added by ${req.user.name}` });
    }
    return pid;
  })();
  if (data.lat == null && (data.address || data.city)) geocodeProject(id).catch(() => {});
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
  db.transaction(() => {
    if (changed.length) {
      db.prepare(`UPDATE projects SET ${changed.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...changed.map((c) => data[c]), now(), p.id);
      if (changed.includes('status')) logActivity(p.id, req.user.id, 'status_changed', `${p.status} → ${data.status}${data.hold_reason ? ` (${data.hold_reason})` : ''}`);
      const other = changed.filter((c) => c !== 'status' && c !== 'lat' && c !== 'lng');
      if (other.length) logActivity(p.id, req.user.id, 'project_updated', other.join(', '));
    }
    setProjectRebates(p.id, req.body?.rebate_ids, req.user.id);
  })();
  // address changed (and no pin was placed by hand): look the site up on the map again
  if (changed.some((c) => ADDRESS_FIELDS.includes(c)) && !changed.includes('lat')) geocodeProject(p.id).catch(() => {});
  res.json(getProject(p.id));
}));

// ---------- due diligence: assess → 10:30 review → site walk ----------
const canReview = (u) => u.role === 'admin' || !!u.can_review;
// the state's managers are the people whose territory includes it
const stateManagers = (state) => db.prepare('SELECT id, name, states FROM users WHERE active = 1').all()
  .filter((u) => state && String(u.states || '').split(',').includes(state));
const siteWalkMilestone = () => db.prepare("SELECT * FROM milestones ORDER BY CASE WHEN LOWER(name) LIKE '%site walk%' THEN 0 ELSE 1 END, position LIMIT 1").get();

// You: rate the site 1–5 and write your insight. submit = put it on the 10:30 review list.
app.post('/api/projects/:id/assess', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  if (p.phase !== 'diligence') bad('This site is already in the pipeline');
  const rating = req.body?.rating == null || req.body.rating === '' ? null : Number(req.body.rating);
  if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) bad('Rating must be 1 to 5');
  const insight = String(req.body?.insight ?? '').trim() || null;
  const submit = !!req.body?.submit;
  if (submit && (!rating || !insight)) bad('Give the site a rating and write your insight before sending it to review');
  const t = now();
  db.transaction(() => {
    db.prepare(`UPDATE projects SET dd_rating = ?, dd_insight = ?, dd_assessed_by = ?, dd_assessed_at = ?, updated_at = ?
      ${submit ? ", dd_stage = 'review'" : ''} WHERE id = ?`).run(rating, insight, req.user.id, t, t, p.id);
    logActivity(p.id, req.user.id, submit ? 'sent_to_review' : 'assessed', `Rated ${rating ?? '—'}/5${submit ? ' · sent to the 10:30 review' : ''}`);
  })();
  res.json(getProject(p.id));
}));

// JoJo at the 10:30 review: approve (→ pipeline, site walk), needs more info (→ back to assess), or pass
app.post('/api/projects/:id/review', wrap((req, res) => {
  if (!canReview(req.user)) throw new HttpError(403, 'Only reviewers can approve or pass sites. An admin can turn this on in Admin.');
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  if (p.phase !== 'diligence') bad('This site is already in the pipeline');
  const decision = String(req.body?.decision || '');
  const note = String(req.body?.note || '').trim().slice(0, 4000) || null;
  if (!['approve', 'info', 'pass'].includes(decision)) bad('Pick approve, needs more info or pass');
  if (decision === 'info' && !note) bad('Say what more information is needed');
  const t = now();
  let notified = [];
  db.transaction(() => {
    const base = 'dd_review_note = ?, dd_reviewed_by = ?, dd_reviewed_at = ?, updated_at = ?';
    if (decision === 'info') {
      db.prepare(`UPDATE projects SET dd_stage = 'new', ${base} WHERE id = ?`).run(note, req.user.id, t, t, p.id);
      logActivity(p.id, req.user.id, 'review_info', `Needs more info: ${note}`);
      if (p.dd_assessed_by) notify([p.dd_assessed_by], { kind: 'review', projectId: p.id, actorId: req.user.id, text: `${req.user.name} needs more info on ${p.code} ${p.name}: ${note}` });
    } else if (decision === 'pass') {
      db.prepare(`UPDATE projects SET dd_stage = 'passed', ${base} WHERE id = ?`).run(note, req.user.id, t, t, p.id);
      logActivity(p.id, req.user.id, 'review_passed', `Passed${note ? `: ${note}` : ''}`);
    } else {
      // approved: into the pipeline with the site walk under way
      const managers = stateManagers(p.state);
      const ownerOk = managers.some((m) => m.id === p.owner_id);
      db.prepare(`UPDATE projects SET dd_stage = 'approved', phase = 'pipeline', stage_entered_at = ?, diligence_completed_at = ?,
        owner_id = ?, ${base} WHERE id = ?`).run(t, t, ownerOk || !managers.length ? p.owner_id : managers[0].id, note, req.user.id, t, t, p.id);
      logActivity(p.id, req.user.id, 'moved_to_pipeline', `Approved at review → site walk${note ? `: ${note}` : ''}`);
      const walk = siteWalkMilestone();
      if (walk) {
        setMilestone(p.id, walk, 'in_progress', req.user.id, null, t);
        // the reviewer's instructions live in the site walk discussion
        if (note) {
          db.prepare('INSERT INTO messages (project_id, milestone_id, milestone_name, user_id, body, created_at) VALUES (?,?,?,?,?,?)')
            .run(p.id, walk.id, walk.name, req.user.id, `Site walk instructions: ${note}`, t);
        }
      }
      notified = managers.map((m) => m.name);
      notify(managers.map((m) => m.id), { kind: 'site_walk', projectId: p.id, milestoneId: walk?.id, actorId: req.user.id,
        text: `${req.user.name} approved ${p.code} ${p.name}${p.city ? ` (${p.city}, ${p.state})` : ''} for a site walk${note ? `: ${note}` : ''}` });
    }
  })();
  res.json({ ...getProject(p.id), notified });
}));

// bring a passed site back to be assessed again
app.post('/api/projects/:id/reopen', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  if (p.phase !== 'diligence') bad('This site is already in the pipeline');
  db.prepare("UPDATE projects SET dd_stage = 'new', updated_at = ? WHERE id = ?").run(now(), p.id);
  logActivity(p.id, req.user.id, 'reopened', 'Back to assessment');
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

// ---------- site chat ----------
// One main chat per site. A milestone chat is the same conversation filtered to that milestone,
// so everything written in a milestone chat also appears in the main chat.
app.get('/api/projects/:id/messages', (req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const mid = req.query.milestone_id ? Number(req.query.milestone_id) : null;
  const msgs = db.prepare(`SELECT m.id, m.milestone_id, COALESCE(ms.name, m.milestone_name) AS milestone, ms.color, m.user_id, u.name AS user_name,
      m.body, m.created_at, 'message' AS kind
    FROM messages m LEFT JOIN milestones ms ON ms.id = m.milestone_id LEFT JOIN users u ON u.id = m.user_id
    WHERE m.project_id = ? ${mid ? 'AND m.milestone_id = ?' : ''}`).all(...(mid ? [p.id, mid] : [p.id]));
  // milestone status changes show inline as small system lines
  const events = db.prepare(`SELECT h.id, h.milestone_id, COALESCE(ms.name, h.milestone_name) AS milestone, ms.color, h.user_id, u.name AS user_name,
      h.from_status, h.to_status, h.note, h.changed_at AS created_at, 'event' AS kind
    FROM milestone_history h LEFT JOIN milestones ms ON ms.id = h.milestone_id LEFT JOIN users u ON u.id = h.user_id
    WHERE h.project_id = ? ${mid ? 'AND h.milestone_id = ?' : ''}`).all(...(mid ? [p.id, mid] : [p.id]));
  const all = [...msgs, ...events].sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.kind === b.kind ? a.id - b.id : a.kind === 'event' ? -1 : 1));
  res.json(all.slice(-500));
});

app.post('/api/projects/:id/messages', wrap((req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  const body = String(req.body?.body || '').trim();
  if (!body) bad('Message cannot be empty');
  let m = null;
  if (req.body?.milestone_id) m = db.prepare('SELECT * FROM milestones WHERE id = ?').get(Number(req.body.milestone_id)) || bad('Unknown milestone');
  const t = now();
  db.transaction(() => {
    db.prepare('INSERT INTO messages (project_id, milestone_id, milestone_name, user_id, body, created_at) VALUES (?,?,?,?,?,?)')
      .run(p.id, m?.id ?? null, m?.name ?? null, req.user.id, body.slice(0, 5000), t);
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(t, p.id);
    logActivity(p.id, req.user.id, 'message', `${m ? `[${m.name}] ` : ''}${body.slice(0, 300)}`);
    const site = db.prepare('SELECT code, name, owner_id FROM projects WHERE id = ?').get(p.id);
    const where = `${site.code} ${site.name}${m ? ` · ${m.name}` : ''}`;
    const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    const mentioned = findMentions(body);
    notify(mentioned, { kind: 'mention', projectId: p.id, milestoneId: m?.id, actorId: req.user.id, text: `${req.user.name} mentioned you on ${where}: “${snippet}”` });
    if (site.owner_id && !mentioned.includes(site.owner_id)) {
      notify([site.owner_id], { kind: 'message', projectId: p.id, milestoneId: m?.id, actorId: req.user.id, text: `${req.user.name} on ${where}: “${snippet}”` });
    }
  })();
  res.status(201).json({ ok: true });
}));

// authors can delete their own messages; admins can delete any
app.delete('/api/messages/:id', wrap((req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id) || notFound('Message not found');
  if (msg.user_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'You can only delete your own messages');
  db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
  res.json({ ok: true });
}));

// ---------- notifications ----------
// kinds: mention, message (on a site you own), reminder, reminder_set, territory (new site in your states)
function notify(userIds, { kind, projectId = null, milestoneId = null, actorId = null, text }) {
  const ins = db.prepare('INSERT INTO notifications (user_id, kind, project_id, milestone_id, actor_id, text) VALUES (?,?,?,?,?,?)');
  [...new Set(userIds.filter(Boolean).map(Number))].filter((id) => id !== actorId)
    .forEach((uid) => ins.run(uid, kind, projectId, milestoneId, actorId, String(text).slice(0, 500)));
}

// Turn reminders that have come due into notifications (runs on a timer and whenever someone checks)
function fireDueReminders() {
  const due = db.prepare(`SELECT r.*, p.code, p.name AS project_name, m.name AS milestone FROM reminders r
    JOIN projects p ON p.id = r.project_id LEFT JOIN milestones m ON m.id = r.milestone_id
    WHERE r.done_at IS NULL AND r.notified_at IS NULL AND r.due_on <= date('now')`).all();
  if (!due.length) return;
  const mark = db.prepare('UPDATE reminders SET notified_at = ? WHERE id = ?');
  db.transaction(() => due.forEach((r) => {
    notify([r.user_id], { kind: 'reminder', projectId: r.project_id, milestoneId: r.milestone_id,
      text: `⏰ ${r.text} — ${r.code} ${r.project_name}${r.milestone ? ` · ${r.milestone}` : ''}` });
    mark.run(now(), r.id);
  }))();
}
setInterval(() => { try { fireDueReminders(); } catch (e) { console.error(e); } }, 5 * 60e3).unref();

app.get('/api/notifications', (req, res) => {
  fireDueReminders();
  const items = db.prepare(`SELECT n.*, a.name AS actor_name, p.code, p.name AS project_name FROM notifications n
    LEFT JOIN users a ON a.id = n.actor_id LEFT JOIN projects p ON p.id = n.project_id
    WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`).all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).c;
  res.json({ unread, items });
});

app.post('/api/notifications/read', wrap((req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : null;
  if (ids?.length) db.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`).run(now(), req.user.id, ...ids);
  else db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), req.user.id);
  res.json({ ok: true });
}));

// @mentions: "@Maya" or "@Maya Chen" (first name only works when it's unique)
function findMentions(body) {
  const users = db.prepare('SELECT id, name FROM users WHERE active = 1').all();
  const firstCounts = {};
  users.forEach((u) => { const f = u.name.split(/\s+/)[0].toLowerCase(); firstCounts[f] = (firstCounts[f] || 0) + 1; });
  const text = ` ${body.toLowerCase()} `;
  const hit = (s) => new RegExp(`(^|[^\\w@])@${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i').test(text);
  return users.filter((u) => {
    const full = u.name.toLowerCase(); const first = full.split(/\s+/)[0];
    return hit(full) || (firstCounts[first] === 1 && hit(first));
  }).map((u) => u.id);
}

// ---------- reminders ----------
const REMINDER_SELECT = `SELECT r.*, p.code, p.name AS project_name, p.address, m.name AS milestone, m.color, u.name AS user_name, c.name AS created_by_name
  FROM reminders r JOIN projects p ON p.id = r.project_id LEFT JOIN milestones m ON m.id = r.milestone_id
  LEFT JOIN users u ON u.id = r.user_id LEFT JOIN users c ON c.id = r.created_by`;

app.get('/api/reminders', (req, res) => {
  res.json(db.prepare(`${REMINDER_SELECT} WHERE r.user_id = ? AND r.done_at IS NULL ORDER BY r.due_on, r.id LIMIT 100`).all(req.user.id));
});
app.get('/api/projects/:id/reminders', (req, res) => {
  res.json(db.prepare(`${REMINDER_SELECT} WHERE r.project_id = ? AND r.done_at IS NULL ORDER BY r.due_on, r.id`).all(req.params.id));
});
app.post('/api/projects/:id/reminders', wrap((req, res) => {
  const p = db.prepare('SELECT id, code, name FROM projects WHERE id = ?').get(req.params.id) || notFound('Project not found');
  const due = String(req.body?.due_on || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) bad('Pick a date for the reminder');
  const text = String(req.body?.text || '').trim() || 'Follow up';
  const userId = Number(req.body?.user_id) || req.user.id;
  const u = db.prepare('SELECT id, name FROM users WHERE id = ? AND active = 1').get(userId) || bad('Unknown user');
  const m = req.body?.milestone_id ? (db.prepare('SELECT * FROM milestones WHERE id = ?').get(Number(req.body.milestone_id)) || bad('Unknown milestone')) : null;
  db.prepare('INSERT INTO reminders (project_id, milestone_id, user_id, created_by, due_on, text) VALUES (?,?,?,?,?,?)')
    .run(p.id, m?.id ?? null, u.id, req.user.id, due, text.slice(0, 500));
  logActivity(p.id, req.user.id, 'reminder_set', `${m ? `[${m.name}] ` : ''}${text} — ${u.id === req.user.id ? 'me' : u.name}, ${due}`);
  if (u.id !== req.user.id) {
    notify([u.id], { kind: 'reminder_set', projectId: p.id, milestoneId: m?.id, actorId: req.user.id,
      text: `${req.user.name} set a reminder for you on ${due}: ${text} — ${p.code} ${p.name}${m ? ` · ${m.name}` : ''}` });
  }
  fireDueReminders();
  res.status(201).json({ ok: true });
}));
app.patch('/api/reminders/:id', wrap((req, res) => {
  const r = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id) || notFound('Reminder not found');
  if (req.body?.done) db.prepare('UPDATE reminders SET done_at = ? WHERE id = ?').run(now(), r.id);
  if (req.body?.due_on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.due_on))) bad('Invalid date');
    db.prepare('UPDATE reminders SET due_on = ?, notified_at = NULL WHERE id = ?').run(String(req.body.due_on), r.id);
  }
  res.json({ ok: true });
}));
app.delete('/api/reminders/:id', wrap((req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- utility directory ----------
const UTILITY_FIELDS = ['name', 'states', 'website', 'phone', 'contact_name', 'contact_email', 'contact_phone', 'make_ready_program', 'approval_days', 'notes'];
const normStates = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)).filter((s, i, a) => a.indexOf(s) === i).join(',') || null;
function cleanUtility(body) {
  const d = pick(body || {}, UTILITY_FIELDS);
  if ('name' in d && !String(d.name || '').trim()) bad('Utility name is required');
  if ('states' in d) d.states = normStates(d.states);
  if (d.approval_days != null) { const n = Number(d.approval_days); if (Number.isNaN(n) || n < 0) bad('Approval days must be a number'); d.approval_days = Math.round(n); }
  return d;
}
app.get('/api/utilities', (req, res) => {
  res.json(db.prepare(`SELECT ut.*, u.name AS updated_by_name,
      (SELECT COUNT(*) FROM projects p WHERE p.utility_id = ut.id) AS site_count,
      (SELECT COUNT(*) FROM rebates r WHERE r.utility_id = ut.id) AS rebate_count
    FROM utilities ut LEFT JOIN users u ON u.id = ut.updated_by ORDER BY ut.name`).all());
});
app.get('/api/utilities/:id', (req, res) => {
  const ut = db.prepare('SELECT ut.*, u.name AS updated_by_name FROM utilities ut LEFT JOIN users u ON u.id = ut.updated_by WHERE ut.id = ?').get(req.params.id);
  if (!ut) return res.status(404).json({ error: 'Utility not found' });
  ut.sites = attachMilestones(db.prepare(`${PROJECT_SELECT} WHERE p.utility_id = ? ORDER BY p.name`).all(ut.id));
  ut.rebates = db.prepare('SELECT id, name, state, status, kind, amount_text FROM rebates WHERE utility_id = ? ORDER BY name').all(ut.id);
  res.json(ut);
});
app.post('/api/utilities', wrap((req, res) => {
  const d = cleanUtility(req.body);
  if (!d.name) bad('Utility name is required');
  if (db.prepare('SELECT 1 FROM utilities WHERE name = ?').get(d.name)) bad('That utility is already in the directory');
  const cols = [...Object.keys(d), 'updated_by'];
  const id = db.prepare(`INSERT INTO utilities (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(d), req.user.id).lastInsertRowid;
  res.status(201).json(db.prepare('SELECT * FROM utilities WHERE id = ?').get(id));
}));
app.patch('/api/utilities/:id', wrap((req, res) => {
  const ut = db.prepare('SELECT * FROM utilities WHERE id = ?').get(req.params.id) || notFound('Utility not found');
  const d = cleanUtility(req.body);
  if (d.name && d.name !== ut.name && db.prepare('SELECT 1 FROM utilities WHERE name = ? AND id <> ?').get(d.name, ut.id)) bad('Another utility already has that name');
  const cols = Object.keys(d);
  db.transaction(() => {
    if (cols.length) db.prepare(`UPDATE utilities SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_by = ?, updated_at = ? WHERE id = ?`).run(...Object.values(d), req.user.id, now(), ut.id);
    if (d.name && d.name !== ut.name) db.prepare('UPDATE projects SET utility_company = ? WHERE utility_id = ?').run(d.name, ut.id);
  })();
  res.json(db.prepare('SELECT * FROM utilities WHERE id = ?').get(ut.id));
}));
app.delete('/api/utilities/:id', wrap((req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM projects WHERE utility_id = ?').get(req.params.id).c;
  if (used) bad(`${used} site(s) use this utility. Change them first.`);
  db.prepare('DELETE FROM utilities WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- rebate board ----------
const REBATE_FIELDS = ['name', 'state', 'provider', 'kind', 'status', 'amount_text', 'max_amount', 'charger_types', 'site_types', 'utility_id',
  'opens_on', 'deadline', 'url', 'summary', 'offer', 'requirements', 'notes', 'verified'];
const REBATE_KINDS = ['rebate', 'grant', 'make_ready', 'tax_credit'];
const REBATE_STATUSES = ['open', 'upcoming', 'waitlist', 'closed'];
function cleanRebate(body) {
  const d = pick(body || {}, REBATE_FIELDS);
  if ('name' in d && !String(d.name || '').trim()) bad('Rebate name is required');
  if ('state' in d) { d.state = String(d.state || '').trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(d.state)) bad('Pick a state (or US for federal)'); }
  if (d.kind && !REBATE_KINDS.includes(d.kind)) bad('Invalid type');
  if (d.status && !REBATE_STATUSES.includes(d.status)) bad('Invalid status');
  if (d.max_amount != null) { const n = Number(d.max_amount); if (Number.isNaN(n)) bad('Max amount must be a number'); d.max_amount = n; }
  if (d.utility_id != null) { d.utility_id = Number(d.utility_id); if (!db.prepare('SELECT 1 FROM utilities WHERE id = ?').get(d.utility_id)) bad('Unknown utility'); }
  if ('verified' in d) d.verified = d.verified === true || d.verified === 1 || d.verified === '1' || d.verified === 'true' ? 1 : 0;
  for (const k of ['opens_on', 'deadline']) if (d[k] && !/^\d{4}-\d{2}-\d{2}$/.test(d[k])) bad('Dates must be YYYY-MM-DD');
  if (d.url && !/^https?:\/\//i.test(d.url)) d.url = `https://${d.url}`;
  return d;
}
const REBATE_SELECT = `SELECT r.*, ut.name AS utility_name, u.name AS updated_by_name,
    (SELECT COUNT(*) FROM project_rebates pr WHERE pr.rebate_id = r.id) + (SELECT COUNT(*) FROM projects p WHERE p.tax_credit_id = r.id) AS site_count
  FROM rebates r LEFT JOIN utilities ut ON ut.id = r.utility_id LEFT JOIN users u ON u.id = r.updated_by`;
app.get('/api/rebates', (req, res) => {
  const where = []; const args = [];
  const { state, status, kind, q } = req.query;
  if (state) { where.push('(r.state = ? OR r.state = \'US\')'); args.push(String(state).toUpperCase()); }
  if (status === 'available') where.push("r.status IN ('open','upcoming','waitlist')");
  else if (status) { where.push('r.status = ?'); args.push(status); }
  if (kind) { where.push('r.kind = ?'); args.push(kind); }
  if (q) { where.push('(r.name LIKE ? OR r.provider LIKE ? OR r.summary LIKE ? OR ut.name LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l); }
  res.json(db.prepare(`${REBATE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.state, CASE r.status WHEN 'open' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'waitlist' THEN 2 ELSE 3 END, r.name`).all(...args));
});
app.get('/api/rebates/:id', (req, res) => {
  const r = db.prepare(`${REBATE_SELECT} WHERE r.id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Rebate not found' });
  r.sites = db.prepare(`SELECT p.id, p.code, p.name, p.address, p.city, p.state, p.phase FROM projects p
    WHERE p.id IN (SELECT project_id FROM project_rebates WHERE rebate_id = ?) OR p.tax_credit_id = ? ORDER BY p.name`).all(r.id, r.id);
  res.json(r);
});
app.post('/api/rebates', wrap((req, res) => {
  const d = cleanRebate(req.body);
  if (!d.name || !d.state) bad('Name and state are required');
  const cols = [...Object.keys(d), 'updated_by'];
  const id = db.prepare(`INSERT INTO rebates (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(d), req.user.id).lastInsertRowid;
  res.status(201).json(db.prepare(`${REBATE_SELECT} WHERE r.id = ?`).get(id));
}));
app.patch('/api/rebates/:id', wrap((req, res) => {
  const r = db.prepare('SELECT * FROM rebates WHERE id = ?').get(req.params.id) || notFound('Rebate not found');
  const d = cleanRebate(req.body);
  const cols = Object.keys(d);
  if (cols.length) db.prepare(`UPDATE rebates SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_by = ?, updated_at = ? WHERE id = ?`).run(...Object.values(d), req.user.id, now(), r.id);
  res.json(db.prepare(`${REBATE_SELECT} WHERE r.id = ?`).get(r.id));
}));
app.delete('/api/rebates/:id', wrap((req, res) => {
  db.prepare('DELETE FROM rebates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- map: look up coordinates for site addresses ----------
// Uses the free US Census geocoder (US addresses only, no API key). Pins can also be dragged on the map.
async function geocodeProject(id) {
  const p = db.prepare('SELECT id, address, city, state, zip FROM projects WHERE id = ?').get(id);
  if (!p || !(p.address || p.city)) return null;
  const one = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
  let hit = null;
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(one)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'evium-crm' } });
    const j = r.ok ? await r.json() : null;
    const m = j?.result?.addressMatches?.[0]?.coordinates;
    if (m) hit = { lat: m.y, lng: m.x };
  } catch { /* offline or blocked: leave the pin unset */ }
  db.prepare('UPDATE projects SET lat = ?, lng = ?, geocoded_at = ? WHERE id = ?').run(hit?.lat ?? null, hit?.lng ?? null, now(), p.id);
  return hit;
}
app.post('/api/projects/:id/geocode', wrap(async (req, res) => {
  if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(req.params.id)) notFound('Project not found');
  const hit = await geocodeProject(req.params.id);
  if (!hit) bad("Couldn't find that address on the map. Check the address, or drag the pin to the right spot.");
  res.json(hit);
}));
// On start-up, look up sites that have never been located (slowly, one per second)
setTimeout(async () => {
  const todo = db.prepare("SELECT id FROM projects WHERE lat IS NULL AND geocoded_at IS NULL AND (TRIM(COALESCE(address,'')) <> '' OR TRIM(COALESCE(city,'')) <> '')").all();
  for (const { id } of todo) { await geocodeProject(id); await new Promise((r) => setTimeout(r, 1000)); }
}, 3000).unref();

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
  res.json(db.prepare(`SELECT d.*, u.name AS uploader_name, m.name AS milestone_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
    LEFT JOIN milestones m ON m.id = d.milestone_id WHERE d.project_id = ? ORDER BY d.id DESC`).all(req.params.id));
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
  let milestoneId = req.body.milestone_id ? Number(req.body.milestone_id) : null;
  if (milestoneId && !db.prepare('SELECT 1 FROM milestones WHERE id = ?').get(milestoneId)) milestoneId = null;
  const ins = db.prepare(`INSERT INTO documents (project_id, ticket_id, milestone_id, category, original_name, stored_name, mime, size, notes, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => files.forEach((f) => {
    // multer gives latin1-decoded names; restore UTF-8
    const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
    ins.run(p.id, ticketId, milestoneId, category, name, f.filename, f.mimetype, f.size, req.body.notes || null, req.user.id);
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
  res.json(db.prepare('SELECT id, name, email, role, active, states, can_review, dd_assessor, milestone_ids, created_at FROM users ORDER BY name').all());
});

app.post('/api/users', requireAdmin, wrap((req, res) => {
  const { name, email, password, role, states } = req.body || {};
  if (!name || !email) bad('Name and email are required');
  if (!password || String(password).length < 8) bad('Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) bad('A user with that email already exists');
  const info = db.prepare('INSERT INTO users (name, email, password_hash, role, states, can_review) VALUES (?,?,?,?,?,?)')
    .run(String(name), String(email).trim(), hashPassword(String(password)), role === 'admin' ? 'admin' : 'staff', normStates(states), req.body?.can_review ? 1 : 0);
  setDuties(info.lastInsertRowid, req.body || {});
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
  if ('states' in (req.body || {})) db.prepare('UPDATE users SET states = ? WHERE id = ?').run(normStates(req.body.states), u.id);
  if ('can_review' in (req.body || {})) db.prepare('UPDATE users SET can_review = ? WHERE id = ?').run(req.body.can_review ? 1 : 0, u.id);
  setDuties(u.id, req.body || {});
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
      const docs = (Array.isArray(m.required_docs) ? m.required_docs : String(m.required_docs || '').split(','))
        .map((x) => String(x).trim()).filter((x) => ENUMS.docCategory.includes(x));
      const vals = [String(m.name).trim(), i + 1, /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#64748b', Math.max(1, Number(m.sla_days) || 30), [...new Set(docs)].join(',') || null];
      if (m.id && existing.has(Number(m.id))) db.prepare('UPDATE milestones SET name=?, position=?, color=?, sla_days=?, required_docs=? WHERE id=?').run(...vals, Number(m.id));
      else db.prepare('INSERT INTO milestones (name, position, color, sla_days, required_docs) VALUES (?,?,?,?,?)').run(...vals);
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
  if (err.status) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Evium CRM running on http://localhost:${PORT}`));
}
module.exports = app;
