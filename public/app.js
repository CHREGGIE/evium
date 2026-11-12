/* Evium CRM – admin single-page app (no build step) */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const S = { me: null, meta: null };

// ---------- utils ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = (s) => String(s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const money = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
const num = (n) => Number(n || 0).toLocaleString('en-US');
const toDate = (s) => (s ? new Date(s.includes('T') || s.length <= 10 ? s : s.replace(' ', 'T') + 'Z') : null);
const fdate = (s) => (s ? toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fdatetime = (s) => (s ? toDate(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const ago = (s) => {
  if (!s) return '';
  const d = (Date.now() - toDate(s).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`;
  return fdate(s);
};
const fsize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const today = () => new Date().toISOString().slice(0, 10);

const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
const statusBadge = (s) => badge(`s-${s}`, label(s));
const ticketBadge = (s) => badge(`t-${s}`, label(s));
const prioBadge = (p) => badge(`p-${p}`, label(p));
const options = (list, sel, { blank, fmt = label } = {}) =>
  (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  list.map((v) => { const [val, txt] = Array.isArray(v) ? v : [v, fmt(v)]; return `<option value="${esc(val)}" ${String(val) === String(sel ?? '') ? 'selected' : ''}>${esc(txt)}</option>`; }).join('');
const userOptions = (sel, blank = 'Unassigned') => options(S.meta.users.filter((u) => u.active || String(u.id) === String(sel)).map((u) => [u.id, u.name]), sel, { blank });
const US_STATES = [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'],
  ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['PR', 'Puerto Rico'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']];
const stateName = (code) => (US_STATES.find(([c]) => c === String(code || '').toUpperCase()) || [])[1] || code || 'No state';
// keep a non-standard saved value selectable so editing never silently drops it
const stateOptions = (sel) => options(sel && !US_STATES.some(([c]) => c === sel) ? [[sel, sel], ...US_STATES] : US_STATES, sel, { blank: '—' });
// Due diligence checklist: these must be filled before a property can move to the pipeline
const phaseBadge = () => badge('ph-dd', 'Due diligence');
// ---------- milestones ----------
// Each project tracks every milestone on its own; they can be finished in any order.
const MS_STATUSES = ['not_started', 'in_progress', 'done', 'not_needed'];
const MS_LABEL = { not_started: 'Not started', in_progress: 'In progress', done: 'Done', not_needed: 'Not needed' };
const MS_ICON = { not_started: '○', in_progress: '●', done: '✓', not_needed: '–' };
const OPEN_STATUSES = ['active', 'on_hold', 'blocked'];
const msWhen = (x) => (x.status === 'done' && x.completed_at ? `done ${fdate(x.completed_at)}`
  : x.status === 'in_progress' ? `${x.days_open ?? 0}d in progress${x.overdue ? ` · over ${x.sla_days}d target` : ''}` : '');
// small row of chips: one per milestone, showing its status
const msStrip = (p, { names = true, link = false } = {}) => `<span class="ms-strip">${S.meta.milestones.map((m, i) => {
  const x = p.milestones?.[i] || { status: 'not_started' };
  const title = `${esc(m.name)}: ${MS_LABEL[x.status]}${msWhen(x) ? ` (${esc(msWhen(x))})` : ''}${link ? ' · click to open' : ''}`;
  return `<span class="ms ms-${x.status}${x.overdue ? ' ms-overdue' : ''}${link ? ' ms-click' : ''}" title="${title}"${link ? ` data-goto="#/projects/${p.id}/m/${m.id}"` : ''}>${MS_ICON[x.status]}${names ? ` ${esc(m.name)}` : ''}</span>`;
}).join('')}</span>`;
const progressBadge = (p) => (p.phase === 'diligence' ? phaseBadge() : p.ms_complete ? badge('ms-live', '✓ Live') : badge('', `${p.ms_done}/${p.ms_total} done`));
const isFlagged = (p) => p.ms_overdue > 0 && OPEN_STATUSES.includes(p.status);
async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(url, opt);
  if (res.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Please sign in'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) { const err = new Error(data?.error || `Request failed (${res.status})`); err.data = data; err.status = res.status; throw err; }
  return data;
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast${err ? ' err' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}
const fail = (e) => toast(e.message, true);

function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

// ---------- modal ----------
let modalClose = null;
function openModal(html, { onClose, wide } = {}) {
  const card = $('#modalCard');
  card.innerHTML = html;
  card.style.width = wide ? 'min(960px, 100%)' : '';
  $('#modal').classList.remove('hidden');
  modalClose = onClose || null;
  $$('[data-close]', card).forEach((b) => b.addEventListener('click', closeModal));
  setTimeout(() => card.querySelector('input:not([type=hidden]), textarea, select')?.focus(), 30);
  return card;
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalCard').innerHTML = '';
  const cb = modalClose; modalClose = null; cb?.();
}
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });
const modalHead = (title) => `<div class="modal-head"><h2 style="margin:0">${title}</h2><button class="x" data-close aria-label="Close">×</button></div>`;

// ---------- auth ----------
function showLogin() {
  $('#shell').classList.add('hidden');
  $('#login').classList.remove('hidden');
  closeModal();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    await api('POST', '/api/login', formData(e.target));
    e.target.reset();
    await boot();
  } catch (err) { $('#loginError').textContent = err.message; }
});
$('#logout').addEventListener('click', async () => { await api('POST', '/api/logout').catch(() => {}); S.me = null; clearInterval(bellTimer); showLogin(); });
$('#bell').addEventListener('click', () => openNotifications());
$('#changePw').addEventListener('click', () => {
  const card = openModal(`${modalHead('Change password')}
    <form class="grid"><label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
    <label>New password (min 8 chars)<input type="password" name="next" required minlength="8" autocomplete="new-password"></label>
    <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Update password</button></div></form>`);
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/me/password', formData(e.target)); closeModal(); toast('Password updated'); } catch (err) { fail(err); }
  });
});

async function loadMeta() { S.meta = await api('GET', '/api/meta'); }

async function boot() {
  try { S.me = await api('GET', '/api/me'); } catch { return; }
  await loadMeta();
  $('#login').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  $('#meName').textContent = `${S.me.name}${S.me.title ? ` · ${S.me.title}` : S.me.role === 'admin' ? ' · admin' : ''}`;
  $$('.admin-only').forEach((el) => el.classList.toggle('hidden', S.me.role !== 'admin'));
  $$('.team-only').forEach((el) => el.classList.toggle('hidden', !canSeeTeam()));
  startBell();
  route();
}

// ---------- router ----------
let lastPath = '';
window.addEventListener('hashchange', route);
async function route() {
  if (!S.me) return;
  const path = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  const parts = path.split('/');
  const [page, id] = parts;
  // start at the top when opening a different page (filter changes keep the scroll position)
  if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
  if (!$('#modal').classList.contains('hidden')) { modalClose = null; closeModal(); }
  try {
    if (page === 'dashboard') await renderDashboard();
    else if (page === 'diligence') await renderDiligence();
    else if (page === 'pipeline') await renderPipeline();
    else if (page === 'map') await renderMap();
    else if (page === 'calendar') await renderCalendar();
    else if (page === 'team' && canSeeTeam()) { if (id) location.hash = `#/dashboard?as=${id}`; else await renderTeam(); }
    else if (page === 'rebates') await renderRebates();
    else if (page === 'utilities' && id) await renderUtility(id);
    else if (page === 'utilities') await renderUtilities();
    else if (page === 'projects' && id && parts[2] === 'm' && parts[3]) await renderMilestone(id, parts[3]);
    else if (page === 'projects' && id) await renderProject(id);
    else if (page === 'projects') await renderProjects();
    else if (page === 'tickets') { await renderTickets(); if (id) openTicket(id, () => { history.replaceState(null, '', '#/tickets'); renderTickets(); }); }
    else if (page === 'admin' && S.me.role === 'admin') await renderAdmin();
    else location.hash = '#/dashboard';
  } catch (e) { view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');

// ---------- territories ----------
const myStates = () => String(S.me?.states || '').split(',').filter(Boolean);
const inMyTerritory = (p) => !!p.state && myStates().includes(p.state);
// your territory's sites first, everything else after (order otherwise unchanged)
const territoryFirst = (rows) => (myStates().length ? [...rows.filter(inMyTerritory), ...rows.filter((p) => !inMyTerritory(p))] : rows);
const territoryToggle = (on) => (myStates().length
  ? `<button type="button" class="chip ${on ? 'active' : ''}" id="mineToggle" title="Only show ${esc(myStates().join(', '))}">★ My territory</button>` : '');

// ---------- notifications ----------
const NOTIF_ICON = { calendar: '📅', rebate: '$', handoff: '→', site_walk: '→', review: '?', mention: '@', message: '💬', reminder: '⏰', reminder_set: '⏰', territory: '★' };
let bellTimer = null;
async function refreshBell() {
  if (!S.me) return;
  try {
    const d = await api('GET', '/api/notifications');
    S.notifs = d;
    const n = $('#bellCount');
    n.textContent = d.unread > 99 ? '99+' : d.unread;
    n.classList.toggle('hidden', !d.unread);
    document.title = d.unread ? `(${d.unread}) Evium CRM` : 'Evium CRM';
  } catch { /* offline: try again next time */ }
}
function startBell() { refreshBell(); clearInterval(bellTimer); bellTimer = setInterval(refreshBell, 30000); }

async function openNotifications() {
  await refreshBell();
  const d = S.notifs || { items: [], unread: 0 };
  const card = openModal(`<div class="modal-head"><h2 style="margin:0">Notifications</h2>
      <span style="display:flex;gap:8px;align-items:center">${d.unread ? '<button class="btn sm" id="readAll">Mark all read</button>' : ''}<button class="x" data-close aria-label="Close">×</button></span></div>
    <div class="notif-list">${d.items.map((n) => `<button type="button" class="notif ${n.read_at ? '' : 'unread'}" data-n="${n.id}">
        <span class="notif-icon">${NOTIF_ICON[n.kind] || '•'}</span>
        <span class="notif-text">${esc(n.text)}<span class="muted small">${ago(n.created_at)}</span></span></button>`).join('')
      || '<div class="empty">Nothing yet. You\'ll see @mentions, reminders, messages on your sites and new sites in your territory here.</div>'}</div>`);
  $('#readAll', card)?.addEventListener('click', async () => { await api('POST', '/api/notifications/read', {}); await refreshBell(); closeModal(); toast('All caught up'); });
  $$('[data-n]', card).forEach((b) => (b.onclick = async () => {
    const n = d.items.find((x) => String(x.id) === b.dataset.n);
    api('POST', '/api/notifications/read', { ids: [n.id] }).then(refreshBell).catch(() => {});
    closeModal();
    if (!n.project_id) return;
    projectTab = ['mention', 'message'].includes(n.kind) ? 'chat' : projectTab;
    const target = `#/projects/${n.project_id}`;
    if (location.hash === target) route(); else location.hash = target;
  }));
}

// ---------- @mentions ----------
const activeUsers = () => S.meta.users.filter((u) => u.active);
// highlight @names in an already-escaped message
function markMentions(html) {
  const names = activeUsers().flatMap((u) => [u.name, u.name.split(/\s+/)[0]]).filter((x, i, a) => x && a.indexOf(x) === i)
    .sort((a, b) => b.length - a.length).map((x) => esc(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!names.length) return html;
  return html.replace(new RegExp(`(^|[^\\w@])@(${names.join('|')})(?![\\w])`, 'gi'), '$1<span class="mention">@$2</span>');
}
// little pop-up list of people while typing "@ma…"
function attachMentionPicker(ta) {
  const box = document.createElement('div');
  box.className = 'mention-pop hidden';
  ta.parentElement.style.position = 'relative';
  ta.parentElement.appendChild(box);
  let matches = []; let idx = 0;
  const word = () => { const m = ta.value.slice(0, ta.selectionStart).match(/(^|\s)@([\w.-]*)$/); return m ? m[2] : null; };
  const close = () => { box.classList.add('hidden'); matches = []; };
  const pick = (u) => {
    const pos = ta.selectionStart; const before = ta.value.slice(0, pos).replace(/@([\w.-]*)$/, `@${u.name} `);
    ta.value = before + ta.value.slice(pos); ta.selectionStart = ta.selectionEnd = before.length; close(); ta.focus();
  };
  const draw = () => {
    box.innerHTML = matches.map((u, i) => `<button type="button" class="${i === idx ? 'on' : ''}" data-u="${u.id}"><span class="avatar">${esc(initials(u.name))}</span>${esc(u.name)}</button>`).join('');
    $$('[data-u]', box).forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(matches.find((u) => String(u.id) === b.dataset.u)); }));
  };
  ta.addEventListener('input', () => {
    const w = word();
    if (w === null) return close();
    matches = activeUsers().filter((u) => u.id !== S.me.id && u.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(w.toLowerCase()))).slice(0, 6);
    idx = 0;
    if (!matches.length) return close();
    box.classList.remove('hidden'); draw();
  });
  // runs before the Enter-to-send handler, so Enter picks a name while the list is open
  ta.addEventListener('keydown', (e) => {
    if (box.classList.contains('hidden') || !matches.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(matches[idx]); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  ta.addEventListener('blur', () => setTimeout(close, 150));
}

// ---------- follow-up reminders ----------
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function reminderModal(p, milestoneId, after) {
  const m = milestoneId ? msById(milestoneId) : null;
  const card = openModal(`${modalHead('⏰ Set a follow-up reminder')}
    <p class="muted small" style="margin-top:-6px">${esc(p.address || p.name)} · ${esc(p.code)}. On the day, it shows on the Dashboard and in Notifications.</p>
    <form class="form-grid">
      <label class="full">What to do<input name="text" required value="${esc(m ? `Follow up on ${m.name}` : 'Follow up')}"></label>
      <label>When<input name="due_on" type="date" required value="${addDays(7)}" min="${today()}"></label>
      <div class="quick-dates">${[[1, 'Tomorrow'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '1 month']].map(([n, t]) => `<button type="button" class="chip" data-days="${n}">${t}</button>`).join('')}</div>
      <label>For<select name="user_id">${options(activeUsers().map((u) => [u.id, u.id === S.me.id ? `Me (${u.name})` : u.name]), S.me.id)}</select></label>
      <label>About<select name="milestone_id">${options(S.meta.milestones.map((x) => [x.id, x.name]), m?.id ?? '', { blank: 'The site in general' })}</select></label>
      <div class="modal-foot full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Set reminder</button></div>
    </form>`);
  $$('[data-days]', card).forEach((b) => (b.onclick = () => { $('[name=due_on]', card).value = addDays(Number(b.dataset.days)); }));
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', `/api/projects/${p.id}/reminders`, formData(e.target)); modalClose = null; closeModal(); toast('Reminder set'); refreshBell(); after?.(); } catch (err) { fail(err); }
  });
}
const reminderLine = (r, { showSite }) => {
  const late = r.due_on < today(); const isToday = r.due_on === today();
  return `<div class="rem ${late ? 'late' : isToday ? 'today' : ''}">
    <div class="rem-main"><b>${esc(r.text)}</b>${r.milestone ? ` <span class="msg-tag"><span class="dot" style="background:${esc(r.color || '#94a3b8')}"></span>${esc(r.milestone)}</span>` : ''}
      <div class="muted small">${late ? '<span class="stale">Overdue</span> · ' : isToday ? '<b>Today</b> · ' : ''}${fdate(r.due_on)}${showSite ? ` · <a href="#/projects/${r.project_id}">${esc(r.code)} ${esc(r.address || r.project_name)}</a>` : ` · for ${esc(r.user_id === S.me.id ? 'me' : r.user_name)}`}</div></div>
    <span class="rem-actions"><button type="button" class="btn sm" data-rdone="${r.id}" title="Mark done">✓ Done</button>
      <button type="button" class="btn sm" data-rsnooze="${r.id}" title="Push back a week">+1 week</button></span></div>`;
};
function bindReminderLines(root, after) {
  $$('[data-rdone]', root).forEach((b) => (b.onclick = async () => { try { await api('PATCH', `/api/reminders/${b.dataset.rdone}`, { done: true }); toast('Reminder done'); after(); } catch (err) { fail(err); } }));
  $$('[data-rsnooze]', root).forEach((b) => (b.onclick = async () => { try { await api('PATCH', `/api/reminders/${b.dataset.rsnooze}`, { due_on: addDays(7) }); toast('Pushed back a week'); after(); } catch (err) { fail(err); } }));
}
async function projectCalendarCard(p, el) {
  const rows = await api('GET', `/api/events?project_id=${p.id}&from=${today()}T00:00`);
  el.innerHTML = `<div class="card-head"><h2>Bookings</h2><a class="small" href="#/calendar?who=">Calendar ›</a></div>
    ${evList(rows, { empty: 'Nothing booked yet.', showSite: false })}
    <div class="book-btns"><button class="btn sm" data-book="site_walk">Book site walk</button><button class="btn sm" data-book="installation">Book installation</button><button class="btn sm" data-book="inspection">Other…</button></div>`;
  $$('[data-book]', el).forEach((b) => (b.onclick = () => bookModal({ project: p, kind: b.dataset.book }, () => route())));
  bindEvents(el, () => route());
}
async function projectRemindersCard(p, el) {
  const rows = await api('GET', `/api/projects/${p.id}/reminders`);
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">⏰ Reminders</h2><button class="btn sm" id="addReminder">+ Add</button></div>
    <div class="rem-list">${rows.map((r) => reminderLine(r, { showSite: false })).join('') || '<div class="muted small" style="margin-top:8px">No follow-ups set.</div>'}</div>`;
  $('#addReminder', el).onclick = () => reminderModal(p, null, () => projectRemindersCard(p, el));
  bindReminderLines(el, () => projectRemindersCard(p, el));
}

// ---------- required documents ----------
// A milestone can need a document (e.g. a signed contract) before it can be marked done.
function docUploadModal(projectId, milestoneId, missing, retry, { onCancel } = {}) {
  const m = msById(milestoneId);
  const card = openModal(`${modalHead(`${esc(m?.name || 'Milestone')} needs a document`)}
    <p>Before <b>${esc(m?.name || 'this milestone')}</b> can be marked done, upload ${missing.map((c) => `a <b>${esc(label(c))}</b>`).join(' and ')} document.</p>
    <form class="grid">
      <label>Document type<select name="category">${options(S.meta.enums.docCategory, missing[0])}</select></label>
      <label>File(s)<input type="file" name="files" multiple required></label>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Upload and mark done</button></div>
    </form>`, { onClose: onCancel });
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData();
    [...$('[name=files]', card).files].forEach((f) => fd.append('files', f));
    fd.append('category', $('[name=category]', card).value);
    fd.append('milestone_id', milestoneId);
    const btn = $('button.primary', card); btn.disabled = true; btn.textContent = 'Uploading…';
    try { await api('POST', `/api/projects/${projectId}/documents`, fd); modalClose = null; closeModal(); await retry(); }
    catch (err) { fail(err); btn.disabled = false; btn.textContent = 'Upload and mark done'; }
  });
}

// ---------- rebate board ----------
const CORE_STATES = ['NY', 'NJ', 'CT', 'PA', 'RI', 'MA', 'TX', 'AR', 'FL', 'IL', 'GA', 'NM', 'OH'];
const REBATE_KIND = { rebate: 'Rebate', grant: 'Grant', make_ready: 'Make-ready program', tax_credit: 'Tax credit' };
const REBATE_STATUS = { open: 'Open', upcoming: 'Opening soon', waitlist: 'Waitlist', closed: 'Closed' };
const regionName = (code) => (code === 'US' ? 'Federal (all states)' : stateName(code));
const rebateStatusBadge = (s) => badge(`rb-${s}`, REBATE_STATUS[s] || s);
const daysUntil = (d) => (d ? Math.ceil((toDate(d) - new Date(today())) / 864e5) : null);
const deadlineText = (d) => {
  const n = daysUntil(d);
  if (n == null) return '';
  return n < 0 ? `deadline passed ${fdate(d)}` : n === 0 ? 'deadline today' : `deadline ${fdate(d)} (${n} day${n === 1 ? '' : 's'})`;
};
const needsCheck = (r) => (r.verified ? '' : badge('rb-check', 'Sample · needs checking'));
// small clickable chip for a rebate on a site
const rebateChip = (r) => `<button type="button" class="rebate-chip" data-rebate="${r.id}" title="Show rebate details">💲 ${esc(r.name)}${r.status && r.status !== 'open' ? ` <span class="muted">(${esc(REBATE_STATUS[r.status] || r.status)})</span>` : ''}</button>`;
// a plain clickable line for a rebate on a site; opens the full rebate details
const rebateLine = (r, extra = '') => `<button type="button" class="rebate-line" data-rebate="${r.id}" title="Show everything about this rebate">
    <span class="rl-text"><span class="rl-name">${esc(r.name)}</span>${extra || r.amount_text ? `<span class="rl-sub">${esc(extra || r.amount_text)}</span>` : ''}</span><span class="rl-chev">›</span></button>`;
const bindRebateChips = (root = view) => $$('[data-rebate]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); rebateInfo(b.dataset.rebate); }));

async function renderRebates() {
  const q = qs();
  const f = { state: q.get('state') || '', status: q.get('status') ?? 'available', kind: q.get('kind') || '', q: q.get('q') || '' };
  const all = await api('GET', `/api/rebates?${new URLSearchParams(Object.entries({ ...f, state: '' }).filter(([, v]) => v))}`);
  const groups = {};
  all.forEach((r) => (groups[r.state] ||= []).push(r));
  const order = (k) => (k === 'US' ? 0 : CORE_STATES.includes(k) ? 1 + CORE_STATES.indexOf(k) : 100);
  const keys = [...new Set([...CORE_STATES, 'US', ...Object.keys(groups)])].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  const shown = f.state ? [f.state, ...(f.state !== 'US' && groups.US ? ['US'] : [])] : keys.filter((k) => groups[k]?.length);
  const card = (r) => `<button type="button" class="rcard" data-rebate="${r.id}">
      <div class="rcard-top"><b>${esc(r.name)}</b>${rebateStatusBadge(r.status)}</div>
      <div class="muted small">${esc(REBATE_KIND[r.kind])}${r.provider ? ` · ${esc(r.provider)}` : ''}${r.utility_name ? ` · ${esc(r.utility_name)} customers` : ''}</div>
      ${r.amount_text ? `<div class="rcard-amt">${esc(r.amount_text)}</div>` : ''}
      ${r.offer ? `<div class="small rcard-offer">🔌 ${esc(r.offer.split('\n')[0])}</div>` : ''}
      <div class="rcard-foot small">
        ${r.deadline ? `<span class="${daysUntil(r.deadline) != null && daysUntil(r.deadline) <= 30 && r.status !== 'closed' ? 'stale' : 'muted'}">${esc(deadlineText(r.deadline))}</span>` : '<span class="muted">No deadline listed</span>'}
        <span class="muted">${r.site_count ? `${r.site_count} site${r.site_count === 1 ? '' : 's'}` : ''}</span>
      </div>
      ${needsCheck(r)}
    </button>`;
  view.innerHTML = `
    <div class="page-head"><h1>Rebates <span class="muted small">${all.length}</span></h1>
      <div class="actions"><button class="btn primary" id="newRebate">+ New rebate</button></div></div>
    <p class="muted small" style="margin-top:-8px">Rebates, grants and tax credits by state. Pick one on a property and the sales team can click it to see what it is, how many chargers we can offer and the requirements.</p>
    <form class="filters" id="rFilters">
      <input type="search" name="q" placeholder="Search rebates, providers, utilities…" value="${esc(f.q)}">
      <select name="status">${options([['available', 'Open, upcoming or waitlist'], ...Object.entries(REBATE_STATUS)], f.status, { blank: 'Any status' })}</select>
      <select name="kind">${options(Object.entries(REBATE_KIND), f.kind, { blank: 'Any type' })}</select>
    </form>
    <div class="chips">
      <button class="chip ${f.state ? '' : 'active'}" data-st="">All <span>${all.length}</span></button>
      ${keys.map((k) => `<button class="chip ${f.state === k ? 'active' : ''}" data-st="${esc(k)}" title="${esc(regionName(k))}">${k === 'US' ? 'Federal' : esc(k)} <span>${groups[k]?.length || 0}</span></button>`).join('')}
    </div>
    ${shown.map((k) => `<section class="lane"><div class="lane-head static"><span class="lane-title">${esc(regionName(k))}${k !== 'US' ? ` <span class="muted">${esc(k)}</span>` : ''}</span>
        <span class="sub">${(groups[k] || []).length} program${(groups[k] || []).length === 1 ? '' : 's'}</span></div>
      <div class="rgrid">${(groups[k] || []).map(card).join('') || `<div class="empty small">Nothing listed for ${esc(regionName(k))} yet. <button type="button" class="link-btn" data-new-in="${esc(k)}">Add one</button></div>`}</div></section>`).join('')
      || '<div class="card empty">No rebates match.</div>'}`;
  const form = $('#rFilters');
  const go = (over = {}) => {
    const p = new URLSearchParams(); Object.entries(formData(form)).forEach(([k, v]) => p.set(k, v));
    const st = 'state' in over ? over.state : f.state; if (st) p.set('state', st);
    location.hash = `#/rebates?${p}`;
  };
  $$('select', form).forEach((s) => (s.onchange = () => go()));
  let t; $('input[name=q]', form).addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => go(), 350); });
  form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
  $$('.chip', view).forEach((c) => (c.onclick = () => go({ state: c.dataset.st })));
  $('#newRebate').onclick = () => rebateForm(null, { state: f.state });
  $$('[data-new-in]', view).forEach((b) => (b.onclick = () => rebateForm(null, { state: b.dataset.newIn })));
  $$('[data-rebate]', view).forEach((b) => (b.onclick = () => rebateInfo(b.dataset.rebate)));
  const qi = $('input[name=q]', form); if (f.q) { qi.focus(); qi.setSelectionRange(f.q.length, f.q.length); }
}

// What the sales team sees when they click a rebate
async function rebateInfo(id) {
  const r = await api('GET', `/api/rebates/${id}`).catch(fail);
  if (!r) return;
  const reqs = String(r.requirements || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  const card = openModal(`<div class="modal-head"><div>
      <h2 style="margin:0">${esc(r.name)}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${rebateStatusBadge(r.status)} ${badge('', REBATE_KIND[r.kind])} ${badge('', regionName(r.state))} ${needsCheck(r)}</div></div>
      <button class="x" data-close aria-label="Close">×</button></div>
    ${!r.verified ? '<div class="note-warn small">This is a sample entry. Confirm the amount, deadline and requirements on the official program page before quoting it to a customer.</div>' : ''}
    <dl class="kv" style="margin:12px 0">
      ${r.amount_text ? `<dt>Amount</dt><dd><b>${esc(r.amount_text)}</b>${r.max_amount ? ` <span class="muted small">(up to ${money(r.max_amount)} per site)</span>` : ''}</dd>` : ''}
      ${r.provider ? `<dt>Run by</dt><dd>${esc(r.provider)}</dd>` : ''}
      ${r.utility_name ? `<dt>Utility</dt><dd><a href="#/utilities/${r.utility_id}">${esc(r.utility_name)}</a> customers only</dd>` : ''}
      ${r.charger_types ? `<dt>Chargers</dt><dd>${esc(r.charger_types.replace(',', ' and '))}</dd>` : ''}
      ${r.site_types ? `<dt>Site types</dt><dd>${esc(r.site_types)}</dd>` : ''}
      ${r.opens_on ? `<dt>Opens</dt><dd>${fdate(r.opens_on)}</dd>` : ''}
      <dt>Deadline</dt><dd>${r.deadline ? `<span class="${daysUntil(r.deadline) <= 30 ? 'stale' : ''}">${esc(deadlineText(r.deadline))}</span>` : '—'}</dd>
      ${r.url ? `<dt>Program page</dt><dd><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace(/^https?:\/\//, '').slice(0, 60))} ↗</a></dd>` : ''}
    </dl>
    ${r.summary ? `<h3>What it is</h3><p style="white-space:pre-wrap;margin-top:0">${esc(r.summary)}</p>` : ''}
    ${r.offer ? `<div class="offer-box"><h3 style="margin-bottom:4px">🔌 Chargers we can offer <span class="muted small" style="font-weight:500">— internal, for sales</span></h3><div style="white-space:pre-wrap">${esc(r.offer)}</div></div>` : ''}
    ${reqs.length ? `<h3 style="margin-top:14px">Requirements</h3><ul class="req-list">${reqs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${r.notes ? `<h3 style="margin-top:14px">Notes</h3><div class="small" style="white-space:pre-wrap">${esc(r.notes)}</div>` : ''}
    <h3 style="margin-top:14px">Sites going after it <span class="muted small">${r.sites.length}</span></h3>
    ${r.sites.length ? `<div class="small">${r.sites.map((s) => `<a href="#/projects/${s.id}">${esc(s.code)} ${esc(s.name)}</a>`).join(' · ')}</div>` : '<div class="muted small">None yet.</div>'}
    <div class="modal-foot" style="justify-content:space-between"><span class="muted small">Last updated ${fdate(r.updated_at)}${r.updated_by_name ? ` by ${esc(r.updated_by_name)}` : ''}</span>
      <span style="display:flex;gap:8px"><button class="btn" id="editRebate">Edit</button><button class="btn primary" data-close>Close</button></span></div>`, { wide: true });
  $('#editRebate', card).onclick = () => { modalClose = null; closeModal(); rebateForm(r); };
}

function rebateForm(r = null, { state = '' } = {}) {
  const v = r || { state, kind: 'rebate', status: 'open', verified: 0 };
  const stateOpts = [['US', 'Federal (all states)'], ...US_STATES.map(([c, n]) => [c, `${c} · ${n}`])];
  const types = String(v.charger_types || '').split(',');
  const card = openModal(`${modalHead(r ? `Edit ${esc(r.name)}` : 'New rebate')}
    <form class="form-grid">
      <label class="full">Program name *<input name="name" required value="${esc(v.name)}" placeholder="e.g. Charge Ready NY 2.0"></label>
      <label>State *<select name="state" required>${options(stateOpts, v.state, { blank: 'Choose…' })}</select></label>
      <label>Type<select name="kind">${options(Object.entries(REBATE_KIND), v.kind)}</select></label>
      <label>Status<select name="status">${options(Object.entries(REBATE_STATUS), v.status)}</select></label>
      <label>Run by<input name="provider" value="${esc(v.provider)}" placeholder="e.g. NYSERDA, Con Edison"></label>
      <label>Only for customers of<select name="utility_id">${options(S.meta.utilities.map((u) => [u.id, `${u.name}${u.states ? ` (${u.states})` : ''}`]), v.utility_id, { blank: 'Any utility' })}</select></label>
      <label class="full">Amount<input name="amount_text" value="${esc(v.amount_text)}" placeholder="e.g. $4,000 per Level 2 port, up to $40,000 per site"></label>
      <label>Most one site can get (USD)<input name="max_amount" type="number" min="0" step="any" value="${esc(v.max_amount)}"></label>
      <fieldset class="checkset"><legend>Charger types</legend>
        <label><input type="checkbox" name="ct_L2" ${types.includes('L2') ? 'checked' : ''}> Level 2</label>
        <label><input type="checkbox" name="ct_DCFC" ${types.includes('DCFC') ? 'checked' : ''}> DC fast</label></fieldset>
      <label>Site types<input name="site_types" value="${esc(v.site_types)}" placeholder="e.g. multifamily, workplace, public"></label>
      <label>Opens<input name="opens_on" type="date" value="${esc(v.opens_on)}"></label>
      <label>Deadline<input name="deadline" type="date" value="${esc(v.deadline)}"></label>
      <label class="full">Official program page<input name="url" value="${esc(v.url)}" placeholder="https://…"></label>
      <label class="full">What it is<textarea name="summary" placeholder="A short plain-English summary of the program">${esc(v.summary)}</textarea></label>
      <label class="full">Chargers we can offer <span class="muted" style="font-weight:500">(internal, for sales)</span><textarea name="offer" placeholder="e.g. Up to 10 Level 2 ports per site. DC fast not covered.">${esc(v.offer)}</textarea></label>
      <label class="full">Requirements <span class="muted" style="font-weight:500">(one per line)</span><textarea name="requirements" placeholder="Publicly accessible 24/7&#10;5-year operating commitment&#10;Must be a Con Edison customer">${esc(v.requirements)}</textarea></label>
      <label class="full">Notes<textarea name="notes">${esc(v.notes)}</textarea></label>
      <label class="full check-inline"><input type="checkbox" name="verified" ${v.verified ? 'checked' : ''}> Details checked against the official program page</label>
      <div class="modal-foot full" style="justify-content:space-between">
        <span>${r ? '<button type="button" class="btn danger" id="delRebate">Delete</button>' : ''}</span>
        <span style="display:flex;gap:8px"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${r ? 'Save' : 'Add rebate'}</button></span></div>
    </form>`, { wide: true });
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.charger_types = ['L2', 'DCFC'].filter((x) => d[`ct_${x}`]).join(',') || null;
    delete d.ct_L2; delete d.ct_DCFC;
    d.verified = !!d.verified;
    try {
      const saved = r ? await api('PATCH', `/api/rebates/${r.id}`, d) : await api('POST', '/api/rebates', d);
      await loadMeta(); modalClose = null; closeModal(); toast(r ? 'Rebate saved' : 'Rebate added');
      if (location.hash.startsWith('#/rebates')) renderRebates(); else rebateInfo(saved.id);
    } catch (err) { fail(err); }
  });
  $('#delRebate', card)?.addEventListener('click', async () => {
    if (!confirm(`Delete "${r.name}"?${r.site_count ? ` It's selected on ${r.site_count} site(s); it will be removed from them.` : ''}`)) return;
    try { await api('DELETE', `/api/rebates/${r.id}`); await loadMeta(); modalClose = null; closeModal(); toast('Rebate deleted'); route(); } catch (err) { fail(err); }
  });
}

// ---------- utility directory ----------
async function renderUtilities() {
  const q = qs();
  const f = { q: (q.get('q') || '').toLowerCase(), state: q.get('state') || '' };
  const allRows = await api('GET', '/api/utilities');
  let rows = allRows;
  if (f.state) rows = rows.filter((u) => String(u.states || '').split(',').includes(f.state));
  if (f.q) rows = rows.filter((u) => [u.name, u.contact_name, u.make_ready_program, u.notes].join(' ').toLowerCase().includes(f.q));
  const states = [...new Set([...CORE_STATES, ...allRows.flatMap((u) => String(u.states || '').split(',').filter(Boolean))])];
  view.innerHTML = `
    <div class="page-head"><h1>Utilities <span class="muted small">${rows.length}</span></h1>
      <div class="actions"><button class="btn primary" id="newUtility">+ Add utility</button></div></div>
    <p class="muted small" style="margin-top:-8px">Your contacts at each utility, its make-ready program and how long approvals usually take. Every site links to its utility.</p>
    <form class="filters" id="uFilters">
      <input type="search" name="q" placeholder="Search utilities, contacts, programs…" value="${esc(q.get('q') || '')}">
      <select name="state">${options(states.map((s) => [s, `${s} · ${stateName(s)}`]), f.state, { blank: 'All states' })}</select>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Utility</th><th>States</th><th>Our contact</th><th>Make-ready program</th><th>Typical approval</th><th>Sites</th><th>Rebates</th></tr></thead>
    <tbody>${rows.map((u) => `<tr class="clickable" data-href="#/utilities/${u.id}">
      <td><b>${esc(u.name)}</b>${u.phone ? `<div class="muted small">${esc(u.phone)}</div>` : ''}</td>
      <td>${esc(u.states || '—')}</td>
      <td>${u.contact_name ? `${esc(u.contact_name)}<div class="muted small">${esc([u.contact_email, u.contact_phone].filter(Boolean).join(' · '))}</div>` : '<span class="muted">—</span>'}</td>
      <td class="small">${esc(u.make_ready_program || '—')}</td>
      <td>${u.approval_days ? `${u.approval_days} days` : '<span class="muted">—</span>'}</td>
      <td>${u.site_count || '—'}</td><td>${u.rebate_count || '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No utilities yet.</td></tr>'}</tbody></table></div>`;
  const form = $('#uFilters');
  const go = () => { const p = new URLSearchParams(); Object.entries(formData(form)).forEach(([k, v]) => v && p.set(k, v)); location.hash = `#/utilities?${p}`; };
  $('select', form).onchange = go;
  let t; $('input', form).addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 350); });
  form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
  $('#newUtility').onclick = () => utilityForm();
  bindRowLinks();
  const qi = $('input', form); if (f.q) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
}

async function renderUtility(id) {
  const u = await api('GET', `/api/utilities/${id}`);
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === 'utilities'));
  const live = u.sites.filter((p) => p.ms_complete);
  const link = (v, href) => (v ? `<a href="${href}">${esc(v)}</a>` : '—');
  view.innerHTML = `
    <div class="page-head"><div><div class="muted small"><a href="#/utilities">Utilities</a> / ${esc(u.name)}</div><h1>${esc(u.name)}</h1>
      <div class="muted small" style="margin-top:4px">${esc(u.states || 'No states set')} · updated ${fdate(u.updated_at)}${u.updated_by_name ? ` by ${esc(u.updated_by_name)}` : ''}</div></div>
      <div class="actions"><button class="btn" id="editUtility">Edit</button></div></div>
    <div class="cols-main">
      <div class="grid" style="gap:16px">
        <div class="card"><h2>Sites with ${esc(u.name)} <span class="muted small">${u.sites.length} · ${live.length} live</span></h2>
          ${u.sites.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Site</th><th>Milestones</th><th>Progress</th></tr></thead><tbody>
          ${u.sites.map((p) => `<tr class="clickable" data-href="#/projects/${p.id}"><td><b>${esc(p.address || p.name)}</b><div class="muted small">${esc(p.code)} · ${esc(p.name)}</div></td>
            <td>${p.phase === 'diligence' ? '' : msStrip(p, { names: false })}</td><td>${progressBadge(p)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No sites use this utility yet.</div>'}</div>
        <div class="card"><h2>Rebates for ${esc(u.name)} customers</h2>
          ${u.rebates.length ? u.rebates.map((r) => `<div style="margin-bottom:6px">${rebateChip(r)} <span class="muted small">${esc(r.amount_text || '')}</span></div>`).join('') : '<div class="muted small">None on the Rebates board.</div>'}</div>
      </div>
      <div class="card"><h2>Details</h2><dl class="kv">
        <dt>Main phone</dt><dd>${u.phone ? `<a href="tel:${esc(u.phone)}">${esc(u.phone)}</a>` : '—'}</dd>
        <dt>Website</dt><dd>${u.website ? `<a href="${esc(/^https?:/i.test(u.website) ? u.website : `https://${u.website}`)}" target="_blank" rel="noopener">${esc(u.website)} ↗</a>` : '—'}</dd>
        <dt>Our contact</dt><dd>${esc(u.contact_name || '—')}</dd>
        <dt>Contact email</dt><dd>${u.contact_email ? link(u.contact_email, `mailto:${u.contact_email}`) : '—'}</dd>
        <dt>Contact phone</dt><dd>${u.contact_phone ? link(u.contact_phone, `tel:${u.contact_phone}`) : '—'}</dd>
        <dt>Make-ready</dt><dd style="white-space:pre-wrap">${esc(u.make_ready_program || '—')}</dd>
        <dt>Typical approval</dt><dd>${u.approval_days ? `${u.approval_days} days` : '—'}</dd>
      </dl>${u.notes ? `<h3 style="margin-top:14px">Notes</h3><div style="white-space:pre-wrap">${esc(u.notes)}</div>` : ''}</div>
    </div>`;
  $('#editUtility').onclick = () => utilityForm(u);
  bindRebateChips();
  bindRowLinks();
}

function utilityForm(u = null) {
  const v = u || {};
  const card = openModal(`${modalHead(u ? `Edit ${esc(u.name)}` : 'Add utility')}
    <form class="form-grid">
      <label class="full">Utility name *<input name="name" required value="${esc(v.name)}" placeholder="e.g. Con Edison"></label>
      <label>States served<input name="states" value="${esc(v.states)}" placeholder="e.g. NY or NY, NJ"></label>
      <label>Main phone<input name="phone" value="${esc(v.phone)}"></label>
      <label class="full">Website<input name="website" value="${esc(v.website)}" placeholder="https://…"></label>
      <h3 class="full" style="margin:6px 0 0">Our contact there</h3>
      <label>Name<input name="contact_name" value="${esc(v.contact_name)}"></label>
      <label>Email<input name="contact_email" type="email" value="${esc(v.contact_email)}"></label>
      <label>Phone<input name="contact_phone" value="${esc(v.contact_phone)}"></label>
      <h3 class="full" style="margin:6px 0 0">How they work</h3>
      <label class="full">Make-ready program<textarea name="make_ready_program" placeholder="What the utility pays for and how to apply">${esc(v.make_ready_program)}</textarea></label>
      <label>Typical approval (days)<input name="approval_days" type="number" min="0" value="${esc(v.approval_days)}"></label>
      <label class="full">Notes<textarea name="notes" placeholder="Tips, who to escalate to, quirks…">${esc(v.notes)}</textarea></label>
      <div class="modal-foot full" style="justify-content:space-between">
        <span>${u ? '<button type="button" class="btn danger" id="delUtility">Delete</button>' : ''}</span>
        <span style="display:flex;gap:8px"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${u ? 'Save' : 'Add utility'}</button></span></div>
    </form>`, { wide: true });
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const saved = u ? await api('PATCH', `/api/utilities/${u.id}`, formData(e.target)) : await api('POST', '/api/utilities', formData(e.target));
      await loadMeta(); modalClose = null; closeModal(); toast('Utility saved');
      if (u) route(); else location.hash = `#/utilities/${saved.id}`;
    } catch (err) { fail(err); }
  });
  $('#delUtility', card)?.addEventListener('click', async () => {
    if (!confirm(`Delete ${u.name} from the directory?`)) return;
    try { await api('DELETE', `/api/utilities/${u.id}`); await loadMeta(); modalClose = null; closeModal(); toast('Utility deleted'); location.hash = '#/utilities'; } catch (err) { fail(err); }
  });
}

// ---------- map ----------
// Leaflet + OpenStreetMap. Pins are looked up from each site's address; any pin can be dragged or placed by hand.
let leafletReady = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = () => resolve(); js.onerror = () => { leafletReady = null; reject(new Error('The map needs an internet connection to load.')); };
    document.head.appendChild(js);
  });
  return leafletReady;
}
const pinColor = (p) => (p.phase === 'diligence' ? '#8b5cf6' : p.ms_complete ? '#10b981' : isFlagged(p) ? '#dc2626' : ['on_hold', 'blocked'].includes(p.status) ? '#94a3b8' : '#f59e0b');
let placing = null; // site waiting for a click on the map

async function renderMap() {
  const q = qs();
  const f = { phase: q.get('phase') || '', state: q.get('state') || '' };
  const mine = q.get('mine') === '1' && myStates().length;
  const params = new URLSearchParams({ status: q.get('status') ?? 'open' });
  if (f.phase) params.set('phase', f.phase);
  if (f.state) params.set('state', f.state);
  if (mine) params.set('states', myStates().join(','));
  const rows = (await api('GET', `/api/projects?${params}`)).filter((p) => !['lost', 'cancelled'].includes(p.status));
  const onMap = rows.filter((p) => p.lat != null && p.lng != null);
  const off = territoryFirst(rows.filter((p) => p.lat == null || p.lng == null));
  const states = [...new Set([...CORE_STATES, ...S.meta.statesInUse])];
  view.innerHTML = `
    <div class="page-head"><h1>Map <span class="muted small">${onMap.length} of ${rows.length} on the map</span></h1>
      <div class="actions">${territoryToggle(mine)}</div></div>
    <form class="filters" id="mFilters">
      <select name="phase">${options([['diligence', 'Due diligence'], ['pipeline', 'Pipeline']], f.phase, { blank: 'Diligence + pipeline' })}</select>
      <select name="state">${options(states.map((s) => [s, `${s} · ${stateName(s)}`]), f.state, { blank: 'All states' })}</select>
      <select name="status">${options([['open', 'Open'], ['', 'Include won / live']], params.get('status'))}</select>
    </form>
    <div class="legend small muted" style="margin:-4px 0 10px">${[['#8b5cf6', 'Due diligence'], ['#f59e0b', 'In progress'], ['#dc2626', 'Running late'], ['#94a3b8', 'On hold / blocked'], ['#10b981', 'Live']].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>
    <div id="placeBanner" class="note-warn hidden"></div>
    <div class="map-wrap"><div id="map" class="map"><div class="empty">Loading map…</div></div>
      <aside class="map-side card"><h2>Not on the map yet <span class="muted small">${off.length}</span></h2>
        <p class="muted small" style="margin-top:-6px">These need a full address, or place the pin yourself.</p>
        ${off.map((p) => `<div class="off-row"><div><b>${esc(p.address || p.name)}</b><div class="muted small">${esc([p.city, p.state].filter(Boolean).join(', ') || 'No address')} · ${esc(p.code)}</div></div>
          <span style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn sm" data-locate="${p.id}" ${p.address || p.city ? '' : 'disabled'}>Find address</button><button class="btn sm" data-place="${p.id}">Place pin</button></span></div>`).join('') || '<div class="muted small">Every site has a pin. 👍</div>'}
      </aside></div>`;
  const form = $('#mFilters');
  const go = (over = {}) => {
    const p = new URLSearchParams(); Object.entries(formData(form)).forEach(([k, v]) => { if (v || k === 'status') p.set(k, v); });
    if ('mine' in over ? over.mine : mine) p.set('mine', '1');
    location.hash = `#/map?${p}`;
  };
  $$('select', form).forEach((s) => (s.onchange = () => go()));
  $('#mineToggle')?.addEventListener('click', () => go({ mine: !mine }));
  $$('[data-locate]', view).forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = 'Looking…';
    try { await api('POST', `/api/projects/${b.dataset.locate}/geocode`); toast('Found it'); renderMap(); } catch (err) { fail(err); b.disabled = false; b.textContent = 'Find address'; }
  }));
  const banner = $('#placeBanner');
  $$('[data-place]', view).forEach((b) => (b.onclick = () => {
    placing = rows.find((p) => String(p.id) === b.dataset.place);
    banner.innerHTML = `Click on the map where <b>${esc(placing.address || placing.name)}</b> is. <button type="button" class="link-btn" id="cancelPlace">Cancel</button>`;
    banner.classList.remove('hidden');
    $('#cancelPlace').onclick = () => { placing = null; banner.classList.add('hidden'); };
  }));

  try { await loadLeaflet(); } catch (err) { $('#map').innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
  if (!$('#map')) return; // navigated away while loading
  $('#map').innerHTML = '';
  const map = L.map('map', { scrollWheelZoom: true }).setView([39.5, -96], 4);
  // OpenStreetMap refuses tiles (403) when the request doesn't say which site it comes from
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const save = async (p, ll, revert) => {
    try { await api('PATCH', `/api/projects/${p.id}`, { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) }); toast('Pin saved'); return true; } catch (err) { fail(err); revert?.(); return false; }
  };
  onMap.forEach((p) => {
    const icon = L.divIcon({ className: '', html: `<span class="pin" style="background:${pinColor(p)}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
    const mk = L.marker([p.lat, p.lng], { icon, draggable: true, title: p.address || p.name }).addTo(map);
    mk.bindPopup(`<div class="map-pop"><b>${esc(p.address || p.name)}</b><div class="muted small">${esc(p.code)} · ${esc(p.name)}</div>
      <div style="margin:6px 0">${progressBadge(p)} ${p.status !== 'active' ? statusBadge(p.status) : ''}</div>
      ${p.phase === 'pipeline' ? msStrip(p, { names: false }) : ''}
      <div style="margin-top:8px"><a href="#/projects/${p.id}">Open project →</a></div>
      <div class="muted small" style="margin-top:4px">Wrong spot? Drag the pin.</div></div>`);
    const start = mk.getLatLng();
    mk.on('dragend', async () => {
      if (!confirm(`Move the pin for ${p.address || p.name} here?`)) { mk.setLatLng(start); return; }
      await save(p, mk.getLatLng(), () => mk.setLatLng(start));
    });
  });
  map.on('click', async (e) => {
    if (!placing) return;
    const p = placing; placing = null; banner.classList.add('hidden');
    if (await save(p, e.latlng)) renderMap();
  });
  if (onMap.length) map.fitBounds(L.latLngBounds(onMap.map((p) => [p.lat, p.lng])).pad(0.2), { maxZoom: 12 });
}

// ---------- milestone list + milestone pages ----------
// Each milestone is its own page with a checklist of steps, its own files, discussion and reminders.
const msHref = (pid, mid) => `#/projects/${pid}/m/${mid}`;
const msBookKind = (m) => (/site walk/i.test(m.name) ? 'site_walk' : /install/i.test(m.name) ? 'installation' : 'inspection');
const msStatusPill = (s, overdue) => `<span class="ms-pill ms-pill-${s}${overdue ? ' late' : ''}">${overdue ? 'Running late' : MS_LABEL[s]}</span>`;
const msMeta = (x) => (x.status === 'done' && x.completed_at ? `Done ${fdate(x.completed_at)}`
  : x.status === 'in_progress' ? `${x.days_open ?? 0} days in progress${x.overdue ? ` (target ${x.sla_days})` : ''}`
  : x.status === 'not_needed' ? 'Not needed for this site' : 'Not started');

// clean list of milestones; each row opens the milestone page
const msList = (p) => `<div class="ms-list">${S.meta.milestones.map((m, i) => {
  const x = p.milestones[i];
  const pct = x.steps_total ? Math.round((x.steps_done / x.steps_total) * 100) : x.status === 'done' ? 100 : 0;
  return `<a class="ms-item ${x.status === 'not_needed' ? 'is-na' : ''}" href="${msHref(p.id, m.id)}">
    <span class="ms-bar" style="background:${esc(m.color)}"></span>
    <span class="ms-item-main"><span class="ms-item-name">${esc(m.name)}</span><span class="ms-item-meta ${x.overdue ? 'stale' : ''}">${esc(msMeta(x))}</span></span>
    <span class="ms-item-steps">${x.status === 'not_needed' ? '' : `<span class="ms-progress"><span style="width:${pct}%"></span></span><span>${x.steps_done} of ${x.steps_total} steps</span>`}</span>
    <span class="ms-item-files">${x.doc_count ? `${x.doc_count} file${x.doc_count === 1 ? '' : 's'}` : ''}</span>
    ${msStatusPill(x.status, x.overdue)}
    <span class="ms-chev" aria-hidden="true">›</span></a>`;
}).join('')}</div>`;

// best guess at what kind of file a milestone collects
const defaultCategory = (m) => {
  const n = m.name.toLowerCase();
  if (m.required?.[0]) return m.required[0];
  if (n.includes('proposal')) return 'proposal';
  if (n.includes('contract')) return 'contract';
  if (n.includes('permit')) return 'permit';
  if (n.includes('approval') || n.includes('utility')) return 'utility';
  if (n.includes('site') || n.includes('install')) return 'photo';
  return 'other';
};

async function renderMilestone(pid, mid) {
  const d = await api('GET', `/api/projects/${pid}/milestones/${mid}`);
  const { project: p, milestone: m, state: x, steps } = d;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (p.phase === 'diligence' ? 'diligence' : 'projects')));
  const done = steps.filter((s) => s.done_at).length;
  const have = new Set([...d.documents.map((f) => f.category), ...d.otherDocs.map((f) => f.category)]);
  const allDone = steps.length && done === steps.length;
  view.innerHTML = `
    <div class="muted small crumbs"><a href="#/projects">Projects</a> / <a href="#/projects/${p.id}">${esc(p.code)} ${esc(p.name)}</a> / ${esc(m.name)}</div>
    <div class="page-head ms-head">
      <div><h1><span class="ms-dot" style="background:${esc(m.color)}"></span>${esc(m.name)}</h1>
        <div class="muted small" style="margin-top:4px">${esc(p.address || p.name)}${p.city ? `, ${esc(p.city)}` : ''} · <span class="${x.overdue ? 'stale' : ''}">${esc(msMeta(x))}</span> · target ${m.sla_days} days</div></div>
      <div class="actions">
        ${p.phase === 'pipeline' ? `<label class="status-select">Status<select id="msStatus">${options(MS_STATUSES.map((s) => [s, MS_LABEL[s]]), x.status)}</select></label>`
          : '<span class="muted small">Move this property to the pipeline to start tracking it.</span>'}
      </div>
    </div>
    <div class="ms-nav">
      ${d.prev ? `<a class="btn sm" href="${msHref(p.id, d.prev.id)}">‹ ${esc(d.prev.name)}</a>` : '<span></span>'}
      <a class="btn sm" href="#/projects/${p.id}">All milestones</a>
      ${d.next ? `<a class="btn sm" href="${msHref(p.id, d.next.id)}">${esc(d.next.name)} ›</a>` : '<span></span>'}
    </div>
    <div class="cols-main">
      <div class="grid" style="gap:16px">
        <section class="card">
          <div class="card-head"><h2>Steps</h2><span class="muted small">${done} of ${steps.length} done</span></div>
          <div class="ms-progress big"><span style="width:${steps.length ? Math.round((done / steps.length) * 100) : 0}%"></span></div>
          ${allDone && x.status !== 'done' && p.phase === 'pipeline' ? `<div class="all-done">Every step is done. <button class="btn primary sm" id="markDone">Mark ${esc(m.name)} done</button></div>` : ''}
          <ul class="steps">${steps.map((s) => `<li class="${s.done_at ? 'is-done' : ''}">
              <label class="step-check"><input type="checkbox" data-step="${s.id}" ${s.done_at ? 'checked' : ''}><span>${esc(s.label)}</span></label>
              <span class="step-meta">${s.done_at ? `${esc(s.done_by_name || '')}${s.done_by_name ? ' · ' : ''}${fdate(s.done_at)}` : ''}</span>
              <button type="button" class="step-del" data-delstep="${s.id}" title="Remove step" aria-label="Remove step">×</button></li>`).join('')
            || '<li class="muted small">No steps yet. Add the first one below.</li>'}</ul>
          <form class="add-step" id="addStep"><input name="label" placeholder="Add a step for this site…" autocomplete="off"><button class="btn sm">Add</button></form>
        </section>
        <section class="card">
          <div class="card-head"><h2>Documents</h2><span class="muted small">${d.documents.length} file${d.documents.length === 1 ? '' : 's'}</span></div>
          ${m.required.length ? `<div class="req-docs small">Needed before this can be marked done: ${m.required.map((c) => `<span class="req-doc ${have.has(c) ? 'ok' : ''}">${have.has(c) ? '✓' : '•'} ${esc(label(c))}</span>`).join(' ')}</div>` : ''}
          <div class="upload-row">
            <select id="upCat" aria-label="Document type">${options(S.meta.enums.docCategory, defaultCategory(m))}</select>
            <input type="file" id="upFiles" multiple aria-label="Choose files">
            <button class="btn primary sm" id="upBtn">Upload</button>
          </div>
          <div id="msDocs" style="margin-top:12px">${docList(d.documents)}</div>
        </section>
      </div>
      <div class="grid" style="gap:16px">
        <section class="card"><h2>Discussion</h2><p class="muted small" style="margin-top:-6px">Also shows in the site's main chat.</p><div id="msChat"></div></section>
        <section class="card"><div class="card-head"><h2>Bookings</h2><button class="btn sm" id="msBook">Book ${esc(msBookKind(m) === 'installation' ? 'installation' : msBookKind(m) === 'site_walk' ? 'site walk' : 'a visit')}</button></div>
          <div id="msEvents"><div class="work-empty">Loading…</div></div></section>
        <section class="card"><div class="card-head"><h2>Reminders</h2><button class="btn sm" id="msRemind">Add</button></div>
          <div class="rem-list">${d.reminders.map((r) => reminderLine(r, { showSite: false })).join('') || '<div class="muted small">No follow-ups set.</div>'}</div></section>
      </div>
    </div>`;

  const again = () => renderMilestone(pid, mid);
  const setStatus = async (status) => {
    const put = async () => { await api('PUT', `/api/projects/${p.id}/milestones/${m.id}`, { status }); toast(`${m.name}: ${MS_LABEL[status].toLowerCase()}`); again(); };
    try { await put(); } catch (err) {
      if (err.data?.missing_docs) docUploadModal(p.id, m.id, err.data.missing_docs, () => put().catch(fail), { onCancel: again });
      else { fail(err); again(); }
    }
  };
  $('#msStatus')?.addEventListener('change', (e) => setStatus(e.target.value));
  $('#markDone')?.addEventListener('click', () => setStatus('done'));
  $$('[data-step]', view).forEach((cb) => (cb.onchange = async () => {
    try { await api('PATCH', `/api/steps/${cb.dataset.step}`, { done: cb.checked }); again(); } catch (err) { fail(err); again(); }
  }));
  $$('[data-delstep]', view).forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this step from this site?')) return;
    try { await api('DELETE', `/api/steps/${b.dataset.delstep}`); again(); } catch (err) { fail(err); }
  }));
  $('#addStep').addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = $('#addStep input').value.trim(); if (!label) return;
    try { await api('POST', `/api/projects/${p.id}/milestones/${m.id}/steps`, { label }); again(); } catch (err) { fail(err); }
  });
  $('#upBtn').onclick = async () => {
    const files = $('#upFiles').files;
    if (!files.length) { toast('Choose a file first', true); return; }
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    fd.append('category', $('#upCat').value); fd.append('milestone_id', m.id);
    $('#upBtn').disabled = true; $('#upBtn').textContent = 'Uploading…';
    try { await api('POST', `/api/projects/${p.id}/documents`, fd); toast('Uploaded'); again(); } catch (err) { fail(err); $('#upBtn').disabled = false; $('#upBtn').textContent = 'Upload'; }
  };
  bindDocActions($('#msDocs'), again);
  $('#msRemind').onclick = () => reminderModal(p, m.id, again);
  $('#msBook').onclick = () => bookModal({ project: p, kind: msBookKind(m) }, again);
  api('GET', `/api/events?project_id=${p.id}&milestone_id=${m.id}&include_cancelled=1`).then((rows) => {
    const el = $('#msEvents'); if (!el) return;
    el.innerHTML = evList(rows, { empty: 'Nothing booked for this milestone.', showSite: false }); bindEvents(el, again);
  }).catch(() => {});
  bindReminderLines(view, again);
  mountChat($('#msChat'), p, m.id).catch(() => {});
}

// ---------- calendar: book site walks, installations and more ----------
const EVENT_KIND = { site_walk: 'Site walk', installation: 'Installation', inspection: 'Inspection', meeting: 'Meeting', other: 'Other' };
const EVENT_COLOR = { site_walk: '#0ea5e9', installation: '#16a34a', inspection: '#d97706', meeting: '#8b5cf6', other: '#64748b' };
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDaysTo = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hhmm = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? `:${pad2(m)}` : ''}${h < 12 ? 'am' : 'pm'}`; };
const evTime = (e) => { const [d1, t1] = e.starts_at.split('T'); const [d2, t2] = e.ends_at.split('T'); return d1 === d2 ? `${hhmm(t1)}–${hhmm(t2)}` : `${fdate(d1)} ${hhmm(t1)} – ${fdate(d2)} ${hhmm(t2)}`; };
const evTitle = (e) => e.title || `${EVENT_KIND[e.kind]}${e.project_name ? `: ${e.project_name}` : ''}`;
const evChip = (e, { showDate = false } = {}) => `<button type="button" class="ev ${e.status !== 'scheduled' ? `is-${e.status}` : ''}" data-ev="${e.id}" style="--ev:${EVENT_COLOR[e.kind]}" title="${esc(evTitle(e))} · ${esc(evTime(e))}">
    <span class="ev-time">${showDate ? `${fdate(e.starts_at.slice(0, 10))} · ` : ''}${hhmm(e.starts_at.slice(11))}</span><span class="ev-name">${esc(e.project_name || e.title || EVENT_KIND[e.kind])}</span></button>`;
// a list of bookings (used on a site, a milestone and the dashboard)
const evList = (rows, { empty = 'Nothing booked.', showSite = true } = {}) => (rows.length ? `<div class="ev-list">${rows.map((e) => `<button type="button" class="ev-row" data-ev="${e.id}">
    <span class="ev-bar" style="background:${EVENT_COLOR[e.kind]}"></span>
    <span class="ev-when"><b>${esc(fdate(e.starts_at.slice(0, 10)))}</b><span class="muted small">${esc(evTime(e))}</span></span>
    <span class="ev-what"><b>${esc(EVENT_KIND[e.kind])}</b>${showSite && e.project_name ? ` · ${esc(e.address || e.project_name)}` : ''}<span class="muted small">${esc(e.people.map((x) => x.name).join(', ') || 'Nobody assigned')}</span></span>
  </button>`).join('')}</div>` : `<div class="work-empty">${esc(empty)}</div>`);
const bindEvents = (root, after) => $$('[data-ev]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); eventModal(Number(b.dataset.ev), after); }));

let calState = null; // { view: 'month' | 'week', anchor: 'YYYY-MM-DD' }
async function renderCalendar() {
  const q = qs();
  calState ||= { view: 'month', anchor: today() };
  const who = q.get('who') ?? 'me';
  const kind = q.get('kind') || '';
  const anchor = parseYmd(calState.anchor);
  let start; let days;
  if (calState.view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    start = addDaysTo(first, -first.getDay());
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    days = Math.ceil((last - start) / 864e5 + 1 + (6 - last.getDay()));
  } else {
    start = addDaysTo(anchor, -anchor.getDay()); days = 7;
  }
  const end = addDaysTo(start, days);
  const params = new URLSearchParams({ from: `${ymd(start)}T00:00`, to: `${ymd(end)}T00:00` });
  if (who) params.set('user_id', who);
  if (kind) params.set('kind', kind);
  const rows = await api('GET', `/api/events?${params}`);
  const onDay = (d) => { const k = ymd(d); return rows.filter((e) => e.starts_at.slice(0, 10) <= k && e.ends_at.slice(0, 10) >= k); };
  const title = calState.view === 'month' ? anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${fdate(ymd(start))} – ${fdate(ymd(addDaysTo(start, 6)))}`;
  const people = S.meta.users.filter((u) => u.active).sort((a, b) => titleRank(a.title) - titleRank(b.title) || a.name.localeCompare(b.name));
  const cells = [...Array(days)].map((_, i) => addDaysTo(start, i));
  view.innerHTML = `
    <div class="page-head"><div><h1>Calendar</h1><div class="muted small" style="margin-top:4px">${rows.length} booking${rows.length === 1 ? '' : 's'} · times are in the site's local time</div></div>
      <div class="actions"><button class="btn primary" id="bookBtn">+ Book</button></div></div>
    <div class="cal-bar">
      <div class="cal-nav"><button class="btn sm" id="calToday">Today</button><button class="btn sm" id="calPrev" aria-label="Previous">‹</button><button class="btn sm" id="calNext" aria-label="Next">›</button><b class="cal-title">${esc(title)}</b></div>
      <div class="cal-filters">
        <select id="calWho" aria-label="Whose bookings">${options([['me', 'My bookings'], ['', 'Everyone'], ...people.filter((u) => u.id !== S.me.id).map((u) => [u.id, u.name])], who)}</select>
        <select id="calKind" aria-label="Type">${options(Object.entries(EVENT_KIND), kind, { blank: 'All types' })}</select>
        <span class="seg cal-view"><button type="button" class="${calState.view === 'month' ? 'on is-done' : ''}" data-view="month">Month</button><button type="button" class="${calState.view === 'week' ? 'on is-done' : ''}" data-view="week">Week</button></span>
      </div>
    </div>
    <div class="cal-legend small muted">${Object.entries(EVENT_KIND).map(([k, t]) => `<span><i style="background:${EVENT_COLOR[k]}"></i>${t}</span>`).join('')}</div>
    <div class="cal ${calState.view}">
      ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map((d) => {
        const k = ymd(d); const list = onDay(d);
        const other = calState.view === 'month' && d.getMonth() !== anchor.getMonth();
        return `<div class="cal-day ${other ? 'other' : ''} ${k === today() ? 'today' : ''}" data-day="${k}">
          <div class="cal-date">${calState.view === 'week' ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : d.getDate()}</div>
          <div class="cal-evs">${list.map((e) => evChip(e)).join('')}</div></div>`;
      }).join('')}
    </div>`;
  const go = () => { const p = new URLSearchParams({ who: $('#calWho').value }); if ($('#calKind').value) p.set('kind', $('#calKind').value); location.hash = `#/calendar?${p}`; };
  $('#calWho').onchange = go; $('#calKind').onchange = go;
  const shift = (n) => { const a = parseYmd(calState.anchor); calState.anchor = ymd(calState.view === 'month' ? new Date(a.getFullYear(), a.getMonth() + n, 1) : addDaysTo(a, 7 * n)); renderCalendar(); };
  $('#calPrev').onclick = () => shift(-1); $('#calNext').onclick = () => shift(1);
  $('#calToday').onclick = () => { calState.anchor = today(); renderCalendar(); };
  $$('[data-view]', view).forEach((b) => (b.onclick = () => { calState.view = b.dataset.view; renderCalendar(); }));
  $('#bookBtn').onclick = () => bookModal({ date: calState.view === 'week' || calState.anchor.slice(0, 7) === today().slice(0, 7) ? today() : calState.anchor }, renderCalendar);
  $$('.cal-day', view).forEach((c) => (c.onclick = (e) => { if (!e.target.closest('[data-ev]')) bookModal({ date: c.dataset.day }, renderCalendar); }));
  bindEvents(view, renderCalendar);
}

// Book a site walk, installation, etc. preset: { project, kind, date }
async function bookModal(preset = {}, after) {
  const sites = preset.project ? [preset.project] : (await api('GET', '/api/projects?status=open')).filter((p) => p.dd_stage !== 'passed');
  const kind = preset.kind || 'site_walk';
  const defaultTimes = (k) => (k === 'installation' ? ['08:00', '16:00'] : k === 'inspection' ? ['10:00', '11:00'] : ['09:00', '11:00']);
  const [t1, t2] = defaultTimes(kind);
  const date = preset.date || today();
  const people = S.meta.users.filter((u) => u.active).sort((a, b) => titleRank(a.title) - titleRank(b.title) || a.name.localeCompare(b.name));
  const card = openModal(`${modalHead('Book')}
    <form class="form-grid">
      <label>Type<select name="kind">${options(Object.entries(EVENT_KIND), kind)}</select></label>
      <label class="span2">Site<select name="project_id" ${preset.project ? 'disabled' : ''}>${options(sites.map((p) => [p.id, `${p.address || p.name}${p.city ? `, ${p.city}` : ''}${p.state ? ` ${p.state}` : ''} · ${p.code}`]), preset.project?.id || '', { blank: preset.project ? undefined : 'No site (internal)' })}</select></label>
      <label>Start date<input type="date" name="start_date" required value="${date}"></label>
      <label>Start time<input type="time" name="start_time" required value="${t1}"></label>
      <label>End date<input type="date" name="end_date" required value="${date}"></label>
      <label>End time<input type="time" name="end_time" required value="${t2}"></label>
      <fieldset class="checkset full"><legend>Who's going</legend>
        ${people.map((u) => `<label><input type="checkbox" name="u_${u.id}"> ${esc(u.name)}${u.title ? ` <span class="muted">${esc(u.title)}</span>` : ''}</label>`).join('')}</fieldset>
      <label class="full">Location<input name="location" placeholder="The site's address is used if left blank"></label>
      <label class="full">Title (optional)<input name="title" placeholder="e.g. Site walk with the owner"></label>
      <label class="full">Notes<textarea name="notes" rows="3" placeholder="Gate code, who to meet, what to bring…"></textarea></label>
      <div class="modal-foot full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Book</button></div>
    </form>`, { wide: true });
  const form = $('form', card);
  // pre-tick whoever handles this site: the milestone's owners for its state, and the site's owner
  const preTick = () => {
    const pid = Number($('[name=project_id]', card).value) || preset.project?.id;
    const p = sites.find((x) => x.id === pid);
    $$('[name^=u_]', card).forEach((c) => (c.checked = false));
    if (!p) { const me = $(`[name=u_${S.me.id}]`, card); if (me) me.checked = true; return; }
    const k = $('[name=kind]', card).value;
    const m = S.meta.milestones.find((x) => x.name.toLowerCase().includes(k === 'site_walk' ? 'site walk' : 'install'));
    const ids = new Set([...(m ? ownersOf(m.id, p.state).map((u) => u.id) : []), p.owner_id].filter(Boolean));
    if (!ids.size) ids.add(S.me.id);
    ids.forEach((id) => { const c = $(`[name=u_${id}]`, card); if (c) c.checked = true; });
  };
  preTick();
  $('[name=project_id]', card).addEventListener('change', preTick);
  $('[name=kind]', card).addEventListener('change', (e) => {
    const [a, b] = defaultTimes(e.target.value); $('[name=start_time]', card).value = a; $('[name=end_time]', card).value = b; preTick();
  });
  $('[name=start_date]', card).addEventListener('change', (e) => { if ($('[name=end_date]', card).value < e.target.value) $('[name=end_date]', card).value = e.target.value; });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = formData(form);
    const body = {
      kind: f.kind, project_id: preset.project?.id || f.project_id || null, title: f.title, location: f.location, notes: f.notes,
      starts_at: `${f.start_date}T${f.start_time}`, ends_at: `${f.end_date}T${f.end_time}`,
      people: Object.keys(f).filter((k) => k.startsWith('u_')).map((k) => Number(k.slice(2))),
    };
    const send = async (force) => {
      try {
        await api('POST', '/api/events', { ...body, force });
        modalClose = null; closeModal(); toast(`${EVENT_KIND[body.kind]} booked`); after?.();
      } catch (err) {
        if (err.data?.conflicts && !force) {
          const lines = err.data.conflicts.map((c) => `• ${c.person}: ${EVENT_KIND[c.kind] || 'Booking'}${c.project_name ? ` at ${c.project_name}` : ''}, ${evTime(c)}`).join('\n');
          if (confirm(`Double-booked:\n${lines}\n\nBook anyway?`)) send(true);
        } else fail(err);
      }
    };
    send(false);
  });
}

// one booking: details, move, mark done, cancel, add to my calendar
async function eventModal(id, after) {
  const e = await api('GET', `/api/events/${id}`).catch(() => null);
  if (!e) { toast('Booking not found', true); return; }
  const people = S.meta.users.filter((u) => u.active || e.people.some((x) => x.id === u.id)).sort((a, b) => titleRank(a.title) - titleRank(b.title) || a.name.localeCompare(b.name));
  const [sd, st] = e.starts_at.split('T'); const [ed, et] = e.ends_at.split('T');
  const card = openModal(`<div class="modal-head"><div>
      <h2 style="margin:0"><span class="ms-dot" style="background:${EVENT_COLOR[e.kind]};display:inline-block;margin-right:8px"></span>${esc(evTitle(e))}</h2>
      <div class="muted small" style="margin-top:4px">${esc(EVENT_KIND[e.kind])} · ${esc(fdate(sd))} · ${esc(evTime(e))}${e.status !== 'scheduled' ? ` · <b>${esc(label(e.status))}</b>` : ''}</div></div>
      <button class="x" data-close aria-label="Close">×</button></div>
    ${e.project_id ? `<p style="margin-top:0"><a href="#/projects/${e.project_id}" id="evSite">${esc(e.code)} · ${esc(e.address || e.project_name)}${e.city ? `, ${esc(e.city)}` : ''} ›</a>${e.milestone ? ` <span class="muted small">(${esc(e.milestone)})</span>` : ''}</p>` : ''}
    <form class="form-grid">
      <label>Start date<input type="date" name="start_date" value="${sd}" required></label>
      <label>Start time<input type="time" name="start_time" value="${st}" required></label>
      <label>End date<input type="date" name="end_date" value="${ed}" required></label>
      <label>End time<input type="time" name="end_time" value="${et}" required></label>
      <fieldset class="checkset full"><legend>Who's going</legend>
        ${people.map((u) => `<label><input type="checkbox" name="u_${u.id}" ${e.people.some((x) => x.id === u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</fieldset>
      <label class="full">Location<input name="location" value="${esc(e.location)}"></label>
      <label class="full">Notes<textarea name="notes" rows="3">${esc(e.notes)}</textarea></label>
      <div class="muted small full">Booked by ${esc(e.created_by_name || '—')} · ${fdate(e.created_at)}</div>
      <div class="modal-foot full" style="justify-content:space-between;flex-wrap:wrap">
        <span style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn" href="/api/events/${e.id}/ics">Add to my calendar</a>
          ${e.status === 'scheduled' ? '<button type="button" class="btn" id="evDone">Mark done</button><button type="button" class="btn danger" id="evCancel">Cancel booking</button>' : '<button type="button" class="btn" id="evRestore">Back to scheduled</button>'}
        </span>
        <span style="display:flex;gap:8px"><button type="button" class="btn" data-close>Close</button><button class="btn primary">Save changes</button></span>
      </div>
    </form>`, { wide: true, onClose: after });
  $('#evSite', card)?.addEventListener('click', () => { modalClose = null; closeModal(); });
  const patch = async (body, msg) => {
    const send = async (force) => {
      try { await api('PATCH', `/api/events/${e.id}`, { ...body, force }); closeModal(); toast(msg); }
      catch (err) {
        if (err.data?.conflicts && !force) {
          const lines = err.data.conflicts.map((c) => `• ${c.person}: ${EVENT_KIND[c.kind] || 'Booking'}${c.project_name ? ` at ${c.project_name}` : ''}, ${evTime(c)}`).join('\n');
          if (confirm(`Double-booked:\n${lines}\n\nSave anyway?`)) send(true);
        } else fail(err);
      }
    };
    send(false);
  };
  $('#evDone', card)?.addEventListener('click', () => patch({ status: 'done' }, 'Marked done'));
  $('#evCancel', card)?.addEventListener('click', () => { if (confirm('Cancel this booking? Everyone on it is notified.')) patch({ status: 'cancelled' }, 'Booking cancelled'); });
  $('#evRestore', card)?.addEventListener('click', () => patch({ status: 'scheduled' }, 'Back on the calendar'));
  $('form', card).addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    patch({ starts_at: `${f.start_date}T${f.start_time}`, ends_at: `${f.end_date}T${f.end_time}`, location: f.location, notes: f.notes,
      people: Object.keys(f).filter((k) => k.startsWith('u_')).map((k) => Number(k.slice(2))) }, 'Booking saved');
  });
}

// ---------- team (executives and admins) ----------
const canSeeTeam = () => S.me.role === 'admin' || !!S.me.is_exec;
// job titles, and the duties each one usually comes with (ticked automatically when picking a title in Admin)
const TITLE_ORDER = ['CEO', 'Executive', 'Account manager', 'Senior project manager', 'Project manager', 'Grants manager'];
const PM_MILESTONES = ['Site walk & proposal', 'Permitting', 'Approvals', 'Installation'];
const TITLE_PRESETS = {
  'CEO': { role: 'admin', is_exec: true },
  'Executive': { is_exec: true, can_review: true },
  'Account manager': { dd_assessor: true, milestones: ['Send proposal', 'Contract'] },
  'Senior project manager': { milestones: PM_MILESTONES },
  'Project manager': { milestones: PM_MILESTONES },
  'Grants manager': { grants: true },
};
const titleRank = (t) => { const i = TITLE_ORDER.indexOf(t); return i < 0 ? 99 : i; };

async function renderTeam() {
  const people = (await api('GET', '/api/team')).sort((a, b) => titleRank(a.title) - titleRank(b.title) || a.name.localeCompare(b.name));
  const totalLate = people.reduce((a, p) => a + p.late, 0);
  const work = (p) => {
    const bits = [];
    if (p.dd_to_assess != null) bits.push(`<span class="tw"><b>${p.dd_to_assess}</b> to assess</span>`);
    if (p.review != null) bits.push(`<span class="tw"><b>${p.review}</b> for 10:30 review</span>`);
    if (p.grants_check != null) bits.push(`<span class="tw"><b>${p.grants_check}</b> rebates to check</span><span class="tw"><b>${p.grants_no_rebate}</b> sites with no rebate</span>`);
    p.milestones.forEach((g) => bits.push(`<span class="tw ${g.late ? 'late' : ''}" title="${esc(g.name)}"><span class="dot" style="background:${esc(g.color)}"></span>${esc(g.name)} <b>${g.in_progress}</b>${g.up_next ? ` <span class="muted">+${g.up_next} next</span>` : ''}${g.late ? ` <span class="stale">${g.late} late</span>` : ''}</span>`));
    return bits.join('') || '<span class="muted small">No duties set</span>';
  };
  view.innerHTML = `
    <div class="page-head"><div><h1>Team</h1><div class="muted small" style="margin-top:4px">Everyone's work right now${totalLate ? ` · <span class="stale">${totalLate} milestone${totalLate === 1 ? '' : 's'} running late</span>` : ''}. Click a person to see their dashboard.</div></div></div>
    <div class="team-list">${people.map((p) => `<a class="team-row ${p.late ? 'has-late' : ''}" href="#/dashboard?as=${p.id}">
        <span class="avatar big">${esc(initials(p.name))}</span>
        <span class="team-who"><b>${esc(p.name)}</b><span class="muted small">${esc(p.title || label(p.role))}${p.states ? ` · ${esc(p.states.replace(/,/g, ', '))}` : ''}</span></span>
        <span class="team-work">${work(p)}</span>
        <span class="team-stats small">
          <span title="Sites they own"><b>${p.sites}</b> sites</span>
          <span title="Open tickets"><b>${p.tickets}</b> tickets</span>
          ${p.reminders_due ? `<span class="stale" title="Reminders due"><b>${p.reminders_due}</b> due</span>` : ''}
          <span class="muted" title="Last activity">${p.last_active ? `active ${ago(p.last_active)}` : 'no activity yet'}</span>
        </span>
        <span class="work-chev">›</span></a>`).join('')}</div>`;
}

// ---------- dashboard: your own work first, the company overview below ----------
const myMilestoneIds = (u = S.me) => String(u?.milestone_ids || '').split(',').map(Number).filter(Boolean);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const workSite = (p) => `<span class="work-site"><b>${esc(p.address || p.name)}</b><span class="muted small">${esc([[p.city, p.state].filter(Boolean).join(', '), p.address ? p.name : '', p.code].filter(Boolean).join(' · '))}</span></span>`;

// Dashboard widgets. Each person picks which ones they see and where (Customize); the layout is saved to their account.
const WIDGETS = {
  dd: { title: 'Due diligence to assess', link: '#/diligence?tab=new', linkText: 'Open Due Diligence' },
  review: { title: '10:30 review', link: '#/diligence?tab=review', linkText: 'Start the review' },
  grants: { title: 'Rebates', link: '#/rebates', linkText: 'Open the Rebates board' },
  sites: { title: 'My sites', link: '#/pipeline', linkText: 'Pipeline' },
  kpis: { title: 'Company numbers' },
  ms_chart: { title: 'Milestones across open projects' },
  attention: { title: 'Needs attention' },
  reminders: { title: 'Reminders' },
  tickets: { title: 'Open tickets', link: '#/tickets', linkText: 'All tickets' },
  activity: { title: 'Recent activity' },
  calendar: { title: 'Coming up', link: '#/calendar', linkText: 'Calendar' },
};
const widgetIds = () => ['dd', 'review', 'grants', 'sites', ...S.meta.milestones.map((m) => `ms:${m.id}`), 'kpis', 'ms_chart', 'attention', 'calendar', 'reminders', 'tickets', 'activity'];
const widgetName = (id) => (id.startsWith('ms:') ? (msById(id.slice(3))?.name || 'Milestone') : WIDGETS[id]?.title || id);
// the starting layout for someone who hasn't customized, based on their job
function defaultLayout(u) {
  const main = [];
  if (u.dd_assessor) main.push('dd');
  if (u.can_review) main.push('review');
  if (u.grants) main.push('grants');
  myMilestoneIds(u).forEach((id) => main.push(`ms:${id}`));
  const lead = u.role === 'admin' || u.is_exec;
  if (lead) main.push('kpis', 'attention', 'ms_chart');
  else main.push('sites');
  return { main, side: ['calendar', 'reminders', 'tickets', 'activity'] };
}
const validLayout = (l) => {
  const ok = new Set(widgetIds());
  return { main: (l.main || []).filter((id) => ok.has(id)), side: (l.side || []).filter((id) => ok.has(id)) };
};
let dashEdit = false;

async function renderDashboard(asId) {
  asId = asId || qs().get('as') || '';
  const d = await api('GET', `/api/dashboard${asId ? `?as=${asId}` : ''}`);
  const t = d.totals; const mine = d.mine; const who = mine.viewing;
  const own = who.id === S.me.id;
  if (!own) dashEdit = false;
  let layout = validLayout(who.layout || defaultLayout(who));
  const total = Math.max(1, ...d.milestones.map((m) => m.done + m.in_progress + m.not_started));
  const first = who.name.split(' ')[0];

  // ---- each widget: [count, body] ----
  const W = {
    dd: () => [mine.dd.length, `${mine.dd_waiting ? `<div class="muted small" style="margin:-4px 0 8px">${mine.dd_waiting} already waiting for the 10:30 review.</div>` : ''}
      <div class="work-list">${mine.dd.map((p) => `<div class="work-row">
          <a class="work-link" href="#/projects/${p.id}">${workSite(p)}</a>
          <span class="work-meta">${p.dd_review_note ? `<span class="work-flag">Sent back: ${esc(p.dd_review_note)}</span>` : `${p.days_in_phase} day${p.days_in_phase === 1 ? '' : 's'} waiting`}</span>
          <button class="btn sm ${p.dd_review_note ? '' : 'primary'}" data-assess="${p.id}">${p.dd_rating ? 'Finish' : 'Assess'}</button></div>`).join('') || '<div class="work-empty">All caught up.</div>'}</div>`],
    review: () => [mine.review.length, `<div class="work-list">${mine.review.map((p) => `<a class="work-row" href="#/diligence?tab=review">${workSite(p)}<span class="work-meta">${ratingView(p.dd_rating)}</span><span class="work-chev">›</span></a>`).join('')
      || '<div class="work-empty">Nothing waiting for review.</div>'}</div>`],
    grants: () => [mine.grants.deadlines.length + mine.grants.no_rebate.length + mine.grants.needs_check.length, `
      <div class="work-sub">Deadlines in the next 60 days <span class="muted">${mine.grants.deadlines.length}</span></div>
      <div class="work-list">${mine.grants.deadlines.map((r) => `<button type="button" class="work-row as-btn" data-rebate="${r.id}"><span class="work-site"><b>${esc(r.name)}</b><span class="muted small">${esc(regionName(r.state))}</span></span>
          <span class="work-meta"><span class="${daysUntil(r.deadline) <= 14 ? 'stale' : ''}">${esc(deadlineText(r.deadline))}</span></span><span class="work-chev">›</span></button>`).join('') || '<div class="work-empty">No deadlines coming up.</div>'}</div>
      <div class="work-sub">Sites with no rebate yet <span class="muted">${mine.grants.no_rebate.length}</span></div>
      <div class="work-list">${mine.grants.no_rebate.map((p) => `<a class="work-row" href="#/projects/${p.id}">${workSite(p)}<span class="work-meta">${p.phase === 'diligence' ? 'Due diligence' : 'Pipeline'}</span><span class="work-chev">›</span></a>`).join('') || '<div class="work-empty">Every site has a rebate picked.</div>'}</div>
      <div class="work-sub">Needs checking <span class="muted">${mine.grants.needs_check.length}</span></div>
      <div class="work-list">${mine.grants.needs_check.map((r) => `<button type="button" class="work-row as-btn" data-rebate="${r.id}"><span class="work-site"><b>${esc(r.name)}</b><span class="muted small">${esc(regionName(r.state))} · ${esc(REBATE_KIND[r.kind])}</span></span>
          <span class="work-meta">${rebateStatusBadge(r.status)}</span><span class="work-chev">›</span></button>`).join('') || '<div class="work-empty">Every rebate has been checked.</div>'}</div>`],
    sites: () => [mine.sites.length, `<div class="work-list">${mine.sites.map((p) => `<a class="work-row ${isFlagged(p) ? 'late' : ''}" href="#/projects/${p.id}">${workSite(p)}
        <span class="work-meta">${p.phase === 'diligence' ? phaseBadge() : msStrip(p, { names: false })}</span><span class="work-chev">›</span></a>`).join('') || '<div class="work-empty">No sites assigned.</div>'}</div>`],
    kpis: () => [null, `<div class="kpis in-widget">
      <a class="kpi" href="#/diligence?tab=new"><div class="l">To assess</div><div class="v">${num(t.to_assess)} <span class="small muted">${num(t.to_review)} for review</span></div></a>
      <a class="kpi" href="#/pipeline"><div class="l">In progress</div><div class="v">${num(t.open_projects)}</div></a>
      <div class="kpi"><div class="l">Pipeline value</div><div class="v">${money(t.pipeline_value)}</div></div>
      <div class="kpi"><div class="l">Ports in pipeline</div><div class="v">${num(t.pipeline_chargers)}</div></div>
      <div class="kpi"><div class="l">Live</div><div class="v">${num(t.live_projects)} <span class="small muted">${num(t.live_chargers)} ports</span></div></div>
      <div class="kpi"><div class="l">Open tickets</div><div class="v">${num(t.open_tickets)} ${t.overdue_tickets ? `<span class="small stale">${t.overdue_tickets} overdue</span>` : ''}</div></div></div>`],
    ms_chart: () => [null, `<div class="funnel">${d.milestones.map((m) => {
        const w = (n) => `${(n / total) * 100}%`;
        return `<div class="funnel-row ms-funnel" data-mid="${m.id}" title="Projects still needing ${esc(m.name)}">
          <div><span class="dot" style="background:${esc(m.color)}"></span> ${esc(m.name)}</div>
          <div class="bar-track stack"><div class="seg-done" style="width:${w(m.done)}">${m.done || ''}</div><div class="seg-prog" style="width:${w(m.in_progress)}">${m.in_progress || ''}</div><div class="seg-todo" style="width:${w(m.not_started)}">${m.not_started || ''}</div></div>
          <div class="small" style="text-align:right">${m.overdue ? `<span class="stale">${m.overdue} late</span>` : `<span class="muted">${m.not_needed ? `${m.not_needed} n/a` : ''}</span>`}</div></div>`;
      }).join('')}</div>
      <div class="legend small muted"><span><i class="seg-done"></i>Done</span><span><i class="seg-prog"></i>In progress</span><span><i class="seg-todo"></i>Not started</span></div>`],
    attention: () => [d.stalled.length, d.stalled.length ? `<div class="work-list">${d.stalled.map((p) => `<a class="work-row late" href="#/projects/${p.id}">${workSite(p)}
        <span class="work-meta"><span class="stale">${p.milestones.map((x, i) => (x.overdue ? `${esc(S.meta.milestones[i].name)} ${x.days_open}d` : '')).filter(Boolean).join(' · ') || esc(label(p.status))}</span>
          <span class="muted">${esc(p.owner_name || '')}</span></span><span class="work-chev">›</span></a>`).join('')}</div>` : '<div class="work-empty">Nothing stalled.</div>'],
    reminders: () => [mine.reminders.filter((r) => r.due_on <= today()).length || null, `<div class="rem-list ${own ? '' : 'readonly'}">${mine.reminders.slice(0, 12).map((r) => reminderLine(r, { showSite: true })).join('') || '<div class="work-empty">No follow-ups.</div>'}</div>`],
    tickets: () => [d.myTickets.length, d.myTickets.length ? `<div class="feed">${d.myTickets.map((x) => `<div class="feed-item"><a href="#/tickets/${x.id}"><b>#${x.id} ${esc(x.title)}</b></a>
        <div class="muted small">${esc(x.code)} · ${esc(x.project_name)}</div>
        <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${ticketBadge(x.status)} ${prioBadge(x.priority)} ${x.due_date ? `<span class="small ${x.due_date < today() ? 'stale' : 'muted'}">due ${fdate(x.due_date)}</span>` : ''}</div></div>`).join('')}</div>` : '<div class="work-empty">No open tickets.</div>'],
    calendar: () => [mine.events.length, evList(mine.events, { empty: 'Nothing booked in the next two weeks.' })],
    activity: () => [null, `<div class="feed">${d.recent.map(activityItem).join('') || '<div class="work-empty">No activity yet.</div>'}</div>`],
  };
  const msWidget = (mid) => {
    const g = mine.milestones.find((x) => String(x.id) === String(mid));
    if (!g) return [null, '<div class="work-empty">This milestone no longer exists.</div>'];
    return [g.in_progress.length + g.up_next.length, `${mine.scoped.length ? `<div class="muted small" style="margin:-4px 0 6px">${esc(mine.scoped.join(', '))}</div>` : ''}
      <div class="work-sub">In progress <span class="muted">${g.in_progress.length}</span></div>
      <div class="work-list">${g.in_progress.map((p) => `<a class="work-row ${p.ms.overdue ? 'late' : ''}" href="#/projects/${p.id}/m/${g.id}">${workSite(p)}
          <span class="work-meta"><span class="ms-progress"><span style="width:${p.ms.steps_total ? Math.round((p.ms.steps_done / p.ms.steps_total) * 100) : 0}%"></span></span>
            ${p.ms.steps_done} of ${p.ms.steps_total} steps · <span class="${p.ms.overdue ? 'stale' : ''}">${p.ms.days_open ?? 0} days${p.ms.overdue ? ' (late)' : ''}</span></span>
          <span class="work-chev">›</span></a>`).join('') || '<div class="work-empty">None in progress.</div>'}</div>
      <div class="work-sub">Up next <span class="muted">${g.up_next.length}</span></div>
      <div class="work-list">${g.up_next.map((p) => `<a class="work-row" href="#/projects/${p.id}/m/${g.id}">${workSite(p)}
          <span class="work-meta">${p.prev ? `${esc(p.prev.name)} ${p.prev.status === 'done' ? `done ${fdate(p.prev.completed_at)}` : 'not needed'}` : 'Ready to start'}${p.status !== 'active' ? ` · ${esc(label(p.status))}` : ''}</span>
          <span class="work-chev">›</span></a>`).join('') || '<div class="work-empty">Nothing waiting to start.</div>'}</div>`];
  };
  const widget = (id, col, i, len) => {
    const [count, body] = id.startsWith('ms:') ? msWidget(id.slice(3)) : W[id]();
    const meta = WIDGETS[id] || { link: `#/pipeline?milestone_id=${id.slice(3)}&ms_status=todo`, linkText: 'See in Pipeline' };
    const m = id.startsWith('ms:') ? msById(id.slice(3)) : null;
    const title = id === 'sites' && !own ? `${first}'s sites` : id === 'reminders' && own ? 'My reminders' : widgetName(id);
    return `<section class="card widget" data-w="${esc(id)}">
      <div class="card-head"><h2>${m ? `<span class="ms-dot" style="background:${esc(m.color)}"></span>` : ''}${esc(title)}${count != null ? ` <span class="work-n ${id === 'reminders' || id === 'attention' ? 'warn' : ''}">${count}</span>` : ''}</h2>
        ${dashEdit ? `<span class="w-tools">
            <button type="button" data-wmove="-1" data-col="${col}" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">↑</button>
            <button type="button" data-wmove="1" data-col="${col}" data-i="${i}" ${i === len - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down">↓</button>
            <button type="button" data-wswap data-col="${col}" data-i="${i}" title="Move to the ${col === 'main' ? 'right' : 'left'} column">${col === 'main' ? '→' : '←'}</button>
            <button type="button" data-whide data-col="${col}" data-i="${i}" title="Remove from my dashboard" aria-label="Remove">✕</button></span>`
          : meta.link ? `<a class="small" href="${meta.link}">${esc(meta.linkText)} ›</a>` : ''}</div>
      ${body}</section>`;
  };
  const column = (col) => layout[col].map((id, i) => widget(id, col, i, layout[col].length)).join('')
    || `<div class="card work-empty">${dashEdit ? 'Empty column. Add a widget below.' : ''}</div>`;
  const hidden = widgetIds().filter((id) => !layout.main.includes(id) && !layout.side.includes(id));
  const people = S.meta.users.filter((u) => u.active).sort((a, b) => titleRank(a.title) - titleRank(b.title) || a.name.localeCompare(b.name));

  view.innerHTML = `
    <div class="page-head dash-head"><div>
        <h1>${own ? `${greeting()}, ${esc(first)}` : `${esc(first)}'s dashboard`}</h1>
        <div class="muted small" style="margin-top:4px">${esc(who.title || label(who.role))}${who.states ? ` · ${esc(who.states.replace(/,/g, ', '))}` : ''}${own ? '' : ' · view only'}</div></div>
      <div class="actions">
        <label class="view-as">Viewing<select id="viewAs">${people.map((u) => `<option value="${u.id}" ${u.id === who.id ? 'selected' : ''}>${u.id === S.me.id ? 'My dashboard' : `${esc(u.name)}${u.title ? ` · ${esc(u.title)}` : ''}`}</option>`).join('')}</select></label>
        ${own ? `<button class="btn ${dashEdit ? 'primary' : ''}" id="customize">${dashEdit ? 'Done' : 'Customize'}</button>` : `<button class="btn" id="backMine">Back to mine</button>`}
        ${dashEdit ? '' : '<button class="btn primary" id="newProject">+ New property</button>'}
      </div></div>
    ${dashEdit ? `<div class="card dash-edit">
        <div><b>Customize your dashboard.</b> <span class="muted small">Use the arrows to move widgets, → / ← to switch columns, ✕ to remove. Changes save as you go.</span></div>
        <div class="dash-edit-row">
          <select id="addWidget"${hidden.length ? '' : ' disabled'}>${hidden.length ? hidden.map((id) => `<option value="${esc(id)}">${esc(widgetName(id))}${id.startsWith('ms:') ? ' (milestone)' : ''}</option>`).join('') : '<option>Every widget is on your dashboard</option>'}</select>
          <button class="btn sm" id="addWidgetBtn" ${hidden.length ? '' : 'disabled'}>Add widget</button>
          <span class="dash-edit-spacer"></span>
          <button class="btn sm" id="editDuties">What I'm responsible for</button>
          <button class="btn sm" id="resetLayout">Reset to default</button>
        </div></div>` : ''}
    <div class="cols-main ${dashEdit ? 'editing' : ''}">
      <div class="grid" style="gap:16px">${column('main')}</div>
      <div class="grid" style="gap:16px">${column('side')}</div>
    </div>`;

  // ---- interactions ----
  const save = async (l) => {
    try { const r = await api('PUT', '/api/me/dashboard', l); S.meta.users.find((u) => u.id === S.me.id).dashboard = r.layout; renderDashboard(); } catch (err) { fail(err); }
  };
  $('#viewAs').onchange = (e) => { dashEdit = false; location.hash = Number(e.target.value) === S.me.id ? '#/dashboard' : `#/dashboard?as=${e.target.value}`; };
  $('#backMine')?.addEventListener('click', () => { location.hash = '#/dashboard'; });
  $('#customize')?.addEventListener('click', () => { dashEdit = !dashEdit; renderDashboard(); });
  $('#newProject')?.addEventListener('click', () => projectForm());
  $('#editDuties')?.addEventListener('click', () => dutiesModal());
  $('#resetLayout')?.addEventListener('click', () => { if (confirm('Go back to the default dashboard for your job?')) save({}); });
  $('#addWidgetBtn')?.addEventListener('click', () => { const id = $('#addWidget').value; const l = { main: [...layout.main], side: [...layout.side] }; (WIDGETS[id] && ['calendar', 'reminders', 'tickets', 'activity'].includes(id) ? l.side : l.main).push(id); save(l); });
  const edit = (fn) => (b) => (b.onclick = () => { const l = { main: [...layout.main], side: [...layout.side] }; fn(l, b.dataset.col, Number(b.dataset.i), b); save(l); });
  $$('[data-wmove]', view).forEach(edit((l, col, i, b) => { const j = i + Number(b.dataset.wmove); [l[col][i], l[col][j]] = [l[col][j], l[col][i]]; }));
  $$('[data-wswap]', view).forEach(edit((l, col, i) => { const [id] = l[col].splice(i, 1); l[col === 'main' ? 'side' : 'main'].push(id); }));
  $$('[data-whide]', view).forEach(edit((l, col, i) => { l[col].splice(i, 1); }));
  $$('.ms-funnel', view).forEach((r) => (r.onclick = () => (location.hash = `#/pipeline?milestone_id=${r.dataset.mid}&ms_status=todo`)));
  $$('[data-assess]', view).forEach((b) => (b.onclick = () => assessModal(mine.dd.find((p) => String(p.id) === b.dataset.assess), () => renderDashboard(asId))));
  bindRebateChips();
  if (own) bindReminderLines(view, () => renderDashboard());
  bindEvents(view, () => renderDashboard(asId));
}

// the checkboxes that say what someone is responsible for (used on the dashboard and in Admin)
const dutiesFields = (u) => `
  <label class="check-inline"><input type="checkbox" name="dd_assessor" ${u?.dd_assessor ? 'checked' : ''}> Assesses new due diligence sites (1–5 rating and insight)</label>
  <label class="check-inline"><input type="checkbox" name="grants" ${u?.grants ? 'checked' : ''}> Grants manager: looks after the Rebates board and is told when a site picks a rebate</label>
  <fieldset class="checkset"><legend>Milestones they own</legend>
    ${S.meta.milestones.map((m) => `<label><input type="checkbox" name="ms_${m.id}" ${myMilestoneIds(u).includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('')}</fieldset>`;
const readDuties = (d) => {
  const out = { dd_assessor: !!d.dd_assessor, grants: !!d.grants, milestone_ids: Object.keys(d).filter((k) => k.startsWith('ms_')).map((k) => Number(k.slice(3))) };
  Object.keys(d).filter((k) => k.startsWith('ms_') || k === 'dd_assessor' || k === 'grants').forEach((k) => delete d[k]);
  return out;
};
function dutiesModal() {
  const card = openModal(`${modalHead('What are you responsible for?')}
    <p class="muted small" style="margin-top:-6px">Your dashboard lists the work waiting for you in these areas.${myStates().length ? ` Milestone lists only show your territory (${esc(myStates().join(', '))}).` : ''}</p>
    <form class="grid">${dutiesFields(S.me)}
      ${canReview() ? '<div class="muted small">You also run the 10:30 review, so it shows on your dashboard.</div>' : ''}
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`);
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const u = await api('PATCH', '/api/me/duties', readDuties(formData(e.target)));
      Object.assign(S.me, { dd_assessor: u.dd_assessor, milestone_ids: u.milestone_ids, grants: u.grants });
      await loadMeta(); modalClose = null; closeModal(); toast('Saved'); renderDashboard();
    } catch (err) { fail(err); }
  });
}

function activityItem(a) {
  const icons = { event_booked: '📅', sent_to_review: '★', assessed: '★', review_info: '?', review_passed: '✕', reopened: '↺', step_done: '✓', reminder_set: '⏰', message: '💬', milestone_updated: '🏁', moved_to_pipeline: '✅', project_created: '🆕', stage_changed: '➡️', status_changed: '🚦', project_updated: '✏️', ticket_created: '🎫', ticket_updated: '🎫', ticket_deleted: '🗑️', documents_uploaded: '📎', document_deleted: '🗑️', note: '📝' };
  const proj = a.project_name ? ` <a href="#/projects/${a.project_id}">${esc(a.code)}</a>` : '';
  const body = a.action === 'note' ? `<div class="note">${esc(a.detail)}</div>` : `<span>${esc(a.detail || '')}</span>`;
  return `<div class="feed-item">${icons[a.action] || '•'} <b>${esc(a.user_name || 'System')}</b> <span class="muted">${esc(label(a.action))}</span>${proj}
    <span class="muted small"> · ${ago(a.created_at)}</span><div>${body}</div></div>`;
}

function bindRowLinks(root = view) {
  $$('tr[data-href]', root).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button,select,input')) location.hash = tr.dataset.href; }));
}

// ---------- due diligence: assess (1–5 + insight) → 10:30 review → site walk ----------
const RATING_LABEL = { 1: 'Poor', 2: 'Weak', 3: 'Fair', 4: 'Good', 5: 'Excellent' };
const canReview = () => S.me.role === 'admin' || !!S.me.can_review;
// the people set up to run the 10:30 review (admins only if nobody is)
const reviewers = () => {
  const named = S.meta.users.filter((u) => u.active && u.can_review);
  return (named.length ? named : S.meta.users.filter((u) => u.active && u.role === 'admin')).map((u) => u.name.split(' ')[0]);
};
const ownersOf = (milestoneId, state) => S.meta.users.filter((u) => u.active && myMilestoneIds(u).includes(milestoneId)
  && (!u.states || !state || String(u.states).split(',').includes(state)));
const siteWalkMs = () => S.meta.milestones.find((m) => m.name.toLowerCase().includes('site walk')) || S.meta.milestones[0];
const managersFor = (state) => {
  const owners = siteWalkMs() ? ownersOf(siteWalkMs().id, state) : [];
  return owners.length ? owners : S.meta.users.filter((u) => u.active && state && String(u.states || '').split(',').includes(state));
};
const ratingView = (r) => (r ? `<span class="rating r${r}" title="${r} of 5 · ${RATING_LABEL[r]}"><span class="rating-bars">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= r ? 'on' : ''}"></i>`).join('')}</span><b>${r}</b>/5 <span class="muted">${RATING_LABEL[r]}</span></span>` : '<span class="muted small">Not rated</span>');
const DD_STAGE_LABEL = { new: 'To assess', review: 'Waiting for 10:30 review', passed: 'Passed', approved: 'Approved' };
const siteLine = (p) => [[p.city, p.state].filter(Boolean).join(', '), p.address ? p.name : '', p.code].filter(Boolean).join(' · ');
const siteFacts = (p) => [
  p.property_owner ? `Owner: ${esc(p.property_owner)}` : '',
  p.utility_company ? `Utility: ${esc(p.utility_company)}` : '',
  p.site_type ? esc(label(p.site_type)) : '',
  p.charger_count ? `${p.charger_count} ${esc(p.charger_type || 'ports')}` : '',
  p.estimated_value ? money(p.estimated_value) : '',
].filter(Boolean).join(' · ');

async function renderDiligence() {
  const q = qs();
  const tab = q.get('tab') || (canReview() ? 'review' : 'new');
  const mine = q.get('mine') === '1' && myStates().length;
  const params = new URLSearchParams({ phase: 'diligence', status: 'open' });
  if (q.get('state')) params.set('state', q.get('state'));
  if (q.get('q')) params.set('q', q.get('q'));
  if (mine) params.set('states', myStates().join(','));
  const all = await api('GET', `/api/projects?${params}`);
  const by = { new: [], review: [], passed: [] };
  all.forEach((p) => by[p.dd_stage]?.push(p));
  by.new = territoryFirst(by.new.sort((a, b) => !!b.dd_review_note - !!a.dd_review_note || b.days_in_phase - a.days_in_phase));
  by.review.sort((a, b) => (b.dd_rating || 0) - (a.dd_rating || 0));
  const rows = by[tab] || [];
  const tabBtn = (k, t) => `<button type="button" class="tab ${tab === k ? 'active' : ''}" data-ddtab="${k}">${t} <span class="tab-n">${by[k].length}</span></button>`;

  const assessRow = (p) => `<div class="dd-row">
      <a class="dd-main" href="#/projects/${p.id}"><b>${esc(p.address || p.name)}</b><span class="muted small">${esc(siteLine(p))}</span>
        <span class="small dd-facts">${siteFacts(p) || '<span class="muted">No details yet</span>'}</span></a>
      <div class="dd-mid">
        ${p.dd_review_note ? `<div class="dd-returned"><b>${esc(p.reviewed_by_name || 'Reviewer')} needs more info:</b> ${esc(p.dd_review_note)}</div>` : ''}
        ${p.dd_rating ? `<div>${ratingView(p.dd_rating)} <span class="muted small">draft</span></div>` : ''}
        <span class="muted small">In due diligence ${p.days_in_phase} day${p.days_in_phase === 1 ? '' : 's'}</span>
      </div>
      <div class="dd-act"><button class="btn primary" data-assess="${p.id}">${p.dd_rating ? 'Finish assessment' : 'Assess'}</button></div>
    </div>`;
  const reviewCard = (p) => `<article class="dd-card2">
      <div class="dd-card2-head">
        <div><a href="#/projects/${p.id}" class="dd-title">${esc(p.address || p.name)}</a><div class="muted small">${esc(siteLine(p))}</div></div>
        <div class="dd-score">${ratingView(p.dd_rating)}</div>
      </div>
      <div class="dd-insight">${esc(p.dd_insight || '')}</div>
      <div class="small dd-facts">${siteFacts(p)}</div>
      ${p.rebates.length ? `<div class="rl-row"><span class="muted small">Rebate</span>${p.rebates.map((r) => rebateLine(r)).join('')}</div>` : ''}
      <div class="dd-card2-foot">
        <span class="muted small">Assessed by ${esc(p.assessed_by_name || '—')} · ${fdate(p.dd_assessed_at)}${managersFor(p.state).length ? ` · ${esc(siteWalkMs()?.name || 'Site walk')}: ${esc(managersFor(p.state).map((u) => u.name).join(', '))}` : ''}</span>
        <span class="dd-btns">${canReview()
          ? `<button class="btn" data-review="info" data-id="${p.id}">Needs more info</button><button class="btn" data-review="pass" data-id="${p.id}">Pass</button><button class="btn primary" data-review="approve" data-id="${p.id}">Approve for site walk</button>`
          : `<button class="btn" data-assess="${p.id}">Edit rating</button>`}</span>
      </div>
    </article>`;
  const passedRow = (p) => `<div class="dd-row">
      <a class="dd-main" href="#/projects/${p.id}"><b>${esc(p.address || p.name)}</b><span class="muted small">${esc(siteLine(p))}</span></a>
      <div class="dd-mid">${ratingView(p.dd_rating)}<span class="small">${p.dd_review_note ? `“${esc(p.dd_review_note)}”` : '<span class="muted">No reason given</span>'}</span>
        <span class="muted small">Passed by ${esc(p.reviewed_by_name || '—')} · ${fdate(p.dd_reviewed_at)}</span></div>
      <div class="dd-act"><button class="btn" data-reopen="${p.id}">Reopen</button></div>
    </div>`;

  const now = new Date(); const at1030 = new Date(); at1030.setHours(10, 30, 0, 0);
  const nextReview = now <= at1030 ? 'today at 10:30' : 'tomorrow at 10:30';
  view.innerHTML = `
    <div class="page-head"><h1>Due Diligence</h1>
      <div class="actions">${territoryToggle(mine)}<button class="btn primary" id="newProperty">+ New property</button></div></div>
    <div class="tabs dd-tabs">${tabBtn('new', 'To assess')}${tabBtn('review', '10:30 review')}${tabBtn('passed', 'Passed')}</div>
    <form class="filters" id="ddFilters">
      <input type="search" name="q" placeholder="Search address, owner, utility…" value="${esc(q.get('q') || '')}">
      <select name="state">${options(US_STATES.map(([c, n]) => [c, `${c} · ${n}`]), q.get('state'), { blank: 'All states' })}</select>
    </form>
    ${tab === 'new' ? `<p class="muted small dd-help">Rate each new site from 1 to 5 and write your insight. Then send it to the 10:30 review.</p>
      <div class="dd-list">${rows.map(assessRow).join('') || '<div class="card empty">Nothing waiting to be assessed.</div>'}</div>` : ''}
    ${tab === 'review' ? `<p class="muted small dd-help">Next review ${nextReview}${reviewers().length ? ` with ${esc(reviewers().join(', '))}` : ''}. Approving moves the site to the Pipeline at the site walk and notifies that state's manager.</p>
      <div class="dd-cards">${rows.map(reviewCard).join('') || '<div class="card empty">Nothing waiting for review.</div>'}</div>` : ''}
    ${tab === 'passed' ? `<p class="muted small dd-help">Sites we decided not to pursue. Reopen one to assess it again.</p>
      <div class="dd-list">${rows.map(passedRow).join('') || '<div class="card empty">No passed sites.</div>'}</div>` : ''}`;

  const form = $('#ddFilters');
  const go = (over = {}) => {
    const p = new URLSearchParams(); Object.entries(formData(form)).forEach(([k, v]) => v && p.set(k, v));
    p.set('tab', over.tab || tab);
    if ('mine' in over ? over.mine : mine) p.set('mine', '1');
    location.hash = `#/diligence?${p}`;
  };
  $$('select', form).forEach((s) => (s.onchange = () => go()));
  let t; $('input[name=q]', form).addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => go(), 350); });
  form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
  $$('[data-ddtab]', view).forEach((b) => (b.onclick = () => go({ tab: b.dataset.ddtab })));
  $('#mineToggle')?.addEventListener('click', () => go({ mine: !mine }));
  $('#newProperty').onclick = () => projectForm(null, { phase: 'diligence' });
  const byId = (id) => all.find((x) => String(x.id) === String(id));
  $$('[data-assess]', view).forEach((b) => (b.onclick = () => assessModal(byId(b.dataset.assess), renderDiligence)));
  $$('[data-review]', view).forEach((b) => (b.onclick = () => reviewModal(byId(b.dataset.id), b.dataset.review, renderDiligence)));
  $$('[data-reopen]', view).forEach((b) => (b.onclick = async () => {
    try { await api('POST', `/api/projects/${b.dataset.reopen}/reopen`); toast('Back in To assess'); renderDiligence(); } catch (err) { fail(err); }
  }));
  bindRebateChips();
  const qi = $('input[name=q]', form); if (q.get('q')) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
}

// You: rate the site 1–5 and write your insight
function assessModal(p, after) {
  let rating = p.dd_rating || null;
  const card = openModal(`${modalHead('Assess site')}
    <div class="dd-sum"><b>${esc(p.address || p.name)}</b><div class="muted small">${esc(siteLine(p))}</div>
      <div class="small" style="margin-top:4px">${siteFacts(p)}</div>
      <a class="small" href="#/projects/${p.id}" id="toSite">Open the full site details →</a></div>
    ${p.dd_review_note && p.dd_stage === 'new' ? `<div class="dd-returned"><b>${esc(p.reviewed_by_name || 'Reviewer')} needs more info:</b> ${esc(p.dd_review_note)}</div>` : ''}
    <form class="grid">
      <div><div class="pick-label">Rating</div>
        <div class="rate-pick" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" class="rate-btn" data-rate="${n}" aria-checked="${rating === n}"><b>${n}</b><span>${RATING_LABEL[n]}</span></button>`).join('')}</div></div>
      <label>Your insight
        <textarea name="insight" rows="7" placeholder="Why this rating? Power and panel capacity, parking layout, location and traffic, owner interest, rebate fit, any red flags…">${esc(p.dd_insight)}</textarea></label>
      <div class="modal-foot" style="justify-content:space-between"><button type="button" class="btn" data-close>Cancel</button>
        <span style="display:flex;gap:8px"><button type="button" class="btn" id="saveDraft">Save draft</button><button class="btn primary">Send to 10:30 review</button></span></div>
    </form>`, { wide: true });
  const draw = () => $$('[data-rate]', card).forEach((b) => { const on = Number(b.dataset.rate) === rating; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  $$('[data-rate]', card).forEach((b) => (b.onclick = () => { rating = Number(b.dataset.rate); draw(); }));
  draw();
  $('#toSite', card).onclick = () => { modalClose = null; closeModal(); };
  const save = async (submit) => {
    try {
      await api('POST', `/api/projects/${p.id}/assess`, { rating, insight: $('[name=insight]', card).value, submit });
      modalClose = null; closeModal(); toast(submit ? 'Sent to the 10:30 review' : 'Draft saved'); after?.();
    } catch (err) { fail(err); }
  };
  $('#saveDraft', card).onclick = () => save(false);
  $('form', card).addEventListener('submit', (e) => { e.preventDefault(); save(true); });
}

// JoJo at the 10:30 review
function reviewModal(p, decision, after) {
  const managers = managersFor(p.state);
  const cfg = {
    approve: { title: 'Approve for site walk', btn: 'Approve and send to site walk', label: 'Notes for the site walk (optional)', ph: 'e.g. Check the panel room in the basement; owner wants 10+ ports; meet the property manager at the loading dock', required: false },
    info: { title: 'Needs more info', btn: 'Send back', label: 'What do you need?', ph: 'e.g. Find out who owns the lot next door and whether the utility has capacity', required: true },
    pass: { title: 'Pass on this site', btn: 'Pass', label: 'Why are we passing? (optional)', ph: 'e.g. Not enough power without a costly transformer upgrade', required: false },
  }[decision];
  const card = openModal(`${modalHead(cfg.title)}
    <div class="dd-sum"><b>${esc(p.address || p.name)}</b><div class="muted small">${esc(siteLine(p))}</div>
      <div style="margin-top:6px">${ratingView(p.dd_rating)}</div>
      ${p.dd_insight ? `<div class="small dd-insight" style="margin-top:6px">${esc(p.dd_insight)}</div>` : ''}</div>
    ${decision === 'approve' ? (managers.length
      ? `<div class="note-ok small">It moves to the Pipeline with ${esc(siteWalkMs()?.name || 'the site walk')} under way, and <b>${esc(managers.map((u) => u.name).join(', '))}</b> will be notified.</div>`
      : `<div class="note-warn small">Nobody covers ${esc(siteWalkMs()?.name || 'the site walk')} in ${esc(p.state || 'this state')}, so nobody will be notified. Set people's milestones and territories in Admin.</div>`) : ''}
    ${decision === 'info' ? `<div class="muted small" style="margin-bottom:8px">It goes back to To assess${p.assessed_by_name ? `, and ${esc(p.assessed_by_name)} is notified` : ''}.</div>` : ''}
    <form class="grid">
      <label>${cfg.label}<textarea name="note" rows="4" ${cfg.required ? 'required' : ''} placeholder="${esc(cfg.ph)}"></textarea></label>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn ${decision === 'pass' ? 'danger' : 'primary'}">${cfg.btn}</button></div>
    </form>`);
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', `/api/projects/${p.id}/review`, { decision, note: $('[name=note]', card).value });
      modalClose = null; closeModal();
      toast(decision === 'approve' ? `Approved. ${r.notified?.length ? `${r.notified.join(', ')} notified.` : 'Moved to the site walk.'}` : decision === 'pass' ? 'Passed' : 'Sent back for more info');
      after?.(r);
    } catch (err) { fail(err); }
  });
}

// ---------- pipeline (one row per address, grouped by US state) ----------
const laneKey = 'evium.pipeline.collapsed';
const getCollapsed = () => { try { return new Set(JSON.parse(localStorage.getItem(laneKey) || '[]')); } catch { return new Set(); } };
const setCollapsed = (set) => { try { localStorage.setItem(laneKey, JSON.stringify([...set])); } catch { /* storage unavailable */ } };
const openRows = new Set(); // rows showing their milestone switches

async function renderPipeline() {
  const q = qs();
  const params = new URLSearchParams({ phase: 'pipeline', status: q.get('status') || 'open' });
  ['owner_id', 'milestone_id', 'ms_status', 'progress'].forEach((k) => q.get(k) && params.set(k, q.get(k)));
  const stateSel = q.get('state') || '';
  const mine = q.get('mine') === '1' && myStates().length;
  if (mine) params.set('states', myStates().join(','));
  const all = await api('GET', `/api/projects?${params}`);
  const keyOf = (p) => (p.state || '').toUpperCase() || 'none';
  const groups = {};
  all.forEach((p) => (groups[keyOf(p)] ||= []).push(p));
  // within a state: unfinished first, most milestones done first, live projects last
  Object.values(groups).forEach((l) => l.sort((a, b) => a.ms_complete - b.ms_complete || (b.ms_done / (b.ms_total || 1)) - (a.ms_done / (a.ms_total || 1))));
  const myFirst = (k) => (myStates().includes(k) ? 0 : 1);
  const keys = Object.keys(groups).sort((a, b) => (a === 'none') - (b === 'none') || myFirst(a) - myFirst(b) || stateName(a).localeCompare(stateName(b)));
  const shown = stateSel ? keys.filter((k) => k === stateSel) : keys;
  const collapsed = getCollapsed();
  const sum = (list, f) => list.reduce((a, p) => a + (p[f] || 0), 0);

  const row = (p) => {
    const open = openRows.has(p.id);
    const line1 = p.address || p.name;
    const line2 = [[p.city, p.state].filter(Boolean).join(', '), p.address ? p.name : '', p.code].filter(Boolean).join(' · ');
    const cls = isFlagged(p) ? 'is-stale' : ['on_hold', 'blocked'].includes(p.status) ? 'is-hold' : '';
    return `<div class="prow ${cls} ${open ? 'open' : ''}">
      <button class="prow-main" type="button" data-row="${p.id}" aria-expanded="${open}" title="Click to see milestones · double-click to open the site">
        <span class="prow-addr"><b>${esc(line1)}</b><span class="muted small">${esc(line2)}</span></span>
        ${msStrip(p)}
        <span class="prow-prog">${progressBadge(p)}</span>
        <span class="prow-extra small">${p.status !== 'active' ? statusBadge(p.status) : ''}${p.estimated_value ? `<span class="muted">${money(p.estimated_value)}</span>` : ''}</span>
        <span class="caret muted">${open ? '▾' : '▸'}</span>
      </button>
      <div class="prow-detail" ${open ? '' : 'hidden'}>
        ${msList(p)}
        <div class="prow-facts small">
          <span>${p.customer_name ? esc(p.customer_name) : '<span class="muted">No customer</span>'}</span>
          ${p.charger_count ? `<span>${p.charger_count}× ${esc(p.charger_type || 'ports')}</span>` : ''}
          ${p.owner_name ? `<span>👤 ${esc(p.owner_name)}</span>` : ''}
          ${p.open_tickets ? `<span>🎫 ${p.open_tickets} open</span>` : ''}
          ${p.hold_reason && p.status !== 'active' ? `<span style="color:var(--warn)">${esc(p.hold_reason)}</span>` : ''}
          ${p.rebates.map(rebateChip).join('')}
          <button type="button" class="btn sm" data-sitechat="${p.id}">Site chat${p.msg_count ? ` (${p.msg_count})` : ''}</button>
          <a class="btn sm" href="#/projects/${p.id}">Open project →</a>
        </div>
      </div>
    </div>`;
  };

  const lane = (k) => {
    const list = groups[k] || [];
    const isOpen = stateSel || !collapsed.has(k);
    return `<section class="lane ${isOpen ? '' : 'collapsed'}">
      <button class="lane-head" type="button" data-toggle="${esc(k)}">
        <span class="caret">${isOpen ? '▾' : '▸'}</span>
        <span class="lane-title">${k === 'none' ? 'No state set' : `${esc(stateName(k))} <span class="muted">${esc(k)}</span>`}${myStates().includes(k) ? ' <span class="badge ms-live">★ Your territory</span>' : ''}</span>
        <span class="sub">${list.length} project${list.length === 1 ? '' : 's'} · ${num(sum(list, 'charger_count'))} ports · ${money(sum(list, 'estimated_value'))}</span>
      </button>
      ${isOpen ? `<div class="prows">${list.map(row).join('')}</div>` : ''}
    </section>`;
  };

  const msOpts = S.meta.milestones.map((m) => [m.id, m.name]);
  view.innerHTML = `
    <div class="page-head"><h1>Pipeline <span class="muted small">${all.length}</span></h1>
      <div class="actions">${territoryToggle(mine)}<a class="btn" href="#/diligence">Due diligence →</a></div></div>
    <form class="filters" id="pFilters">
      <select name="milestone_id">${options(msOpts, q.get('milestone_id'), { blank: 'Any milestone' })}</select>
      <select name="ms_status" ${q.get('milestone_id') ? '' : 'disabled'}>${options([['todo', 'Still to do'], ...MS_STATUSES.map((s) => [s, MS_LABEL[s]]), ['overdue', 'Running late']], q.get('ms_status'), { blank: 'Any status' })}</select>
      <select name="progress">${options([['incomplete', 'Still in progress'], ['complete', 'Live (all done)'], ['overdue', 'Running late']], q.get('progress'), { blank: 'All projects' })}</select>
      <select name="status">${options([['open', 'Open (active/hold/blocked)'], ['active', 'Active'], ['on_hold', 'On hold'], ['blocked', 'Blocked'], ['won', 'Won'], ['', 'All statuses']], params.get('status'))}</select>
      <select name="owner_id">${options(S.meta.users.map((u) => [u.id, u.name]), q.get('owner_id'), { blank: 'All owners' })}</select>
    </form>
    <div class="chips">
      <button class="chip ${stateSel ? '' : 'active'}" data-state="">All states <span>${all.length}</span></button>
      ${keys.map((k) => `<button class="chip ${stateSel === k ? 'active' : ''}" data-state="${esc(k)}" title="${esc(stateName(k))}">${k === 'none' ? 'No state' : esc(k)} <span>${groups[k].length}</span></button>`).join('')}
    </div>
    <p class="muted small">Milestones can be finished in any order. ✓ done · ● in progress · ○ not started · – not needed. Click a row to see its milestones; double-click to open the site. A red edge means a milestone is running past its target.</p>
    ${shown.map(lane).join('') || `<div class="card empty">${stateSel ? 'No projects in this state.' : 'No projects match. Finish due diligence on a property to move it here.'}</div>`}`;

  const form = $('#pFilters');
  const go = (over = {}) => {
    const p = new URLSearchParams();
    Object.entries(formData(form)).forEach(([k, v]) => { if (v || k === 'status') p.set(k, v); });
    if (!p.get('milestone_id')) p.delete('ms_status');
    const st = 'state' in over ? over.state : stateSel; if (st) p.set('state', st);
    if ('mine' in over ? over.mine : mine) p.set('mine', '1');
    location.hash = `#/pipeline?${p}`;
  };
  $('#mineToggle')?.addEventListener('click', () => go({ mine: !mine }));
  bindRebateChips();
  $$('select', form).forEach((s) => (s.onchange = () => go()));
  $$('.chip[data-state]', view).forEach((c) => (c.onclick = () => go({ state: c.dataset.state })));
  $$('[data-toggle]', view).forEach((b) => (b.onclick = () => {
    if (stateSel) return; // a single selected state always stays open
    const set = getCollapsed(); const k = b.dataset.toggle;
    set.has(k) ? set.delete(k) : set.add(k); setCollapsed(set); renderPipeline();
  }));
  // one click shows or hides the row's dropdown (in place, so a double-click still registers); double-click opens the site
  $$('[data-row]', view).forEach((b) => {
    b.onclick = () => {
      const id = Number(b.dataset.row); const row = b.closest('.prow'); const open = !openRows.has(id);
      if (open) openRows.add(id); else openRows.delete(id);
      row.classList.toggle('open', open);
      $('.prow-detail', row).hidden = !open;
      b.setAttribute('aria-expanded', String(open));
      $('.caret', b).textContent = open ? '▾' : '▸';
    };
    b.ondblclick = () => { window.getSelection?.().removeAllRanges(); location.hash = `#/projects/${b.dataset.row}`; };
  });
  const findP = (id) => all.find((x) => String(x.id) === String(id));
  $$('[data-sitechat]', view).forEach((b) => (b.onclick = () => openChat(findP(b.dataset.sitechat), null, () => renderPipeline())));
}

// ---------- projects list ----------
async function renderProjects() {
  const q = qs();
  const f = { q: q.get('q') || '', phase: q.get('phase') || '', state: q.get('state') || '', progress: q.get('progress') || '', status: q.get('status') ?? 'open', owner_id: q.get('owner_id') || '', priority: q.get('priority') || '' };
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  if (f.state === 'mine') { params.delete('state'); params.set('states', myStates().join(',')); }
  const rows = territoryFirst(await api('GET', `/api/projects?${params}`));
  view.innerHTML = `
    <div class="page-head"><h1>Projects <span class="muted small">${rows.length}</span></h1>
      <div class="actions"><a class="btn" href="/api/projects.csv">Export CSV</a><button class="btn primary" id="newProject">+ New property</button></div></div>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="Search name, code, customer, city…" value="${esc(f.q)}">
      <select name="phase">${options([['diligence', 'Due diligence'], ['pipeline', 'Pipeline']], f.phase, { blank: 'Diligence + pipeline' })}</select>
      <select name="progress">${options([['incomplete', 'Still in progress'], ['complete', 'Live (all done)'], ['overdue', 'Running late']], f.progress, { blank: 'Any progress' })}</select>
      <select name="state">${options([...(myStates().length ? [['mine', `★ My territory (${myStates().join(', ')})`]] : []), ...US_STATES.map(([c, n]) => [c, `${c} · ${n}`])], f.state, { blank: 'All states' })}</select>
      <select name="status">${options([['open', 'Open'], ...S.meta.enums.projectStatus.map((s) => [s, label(s)])], f.status, { blank: 'All statuses' })}</select>
      <select name="owner_id">${options(S.meta.users.map((u) => [u.id, u.name]), f.owner_id, { blank: 'All owners' })}</select>
      <select name="priority">${options(S.meta.enums.priority, f.priority, { blank: 'Any priority' })}</select>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Project</th><th>Customer</th><th>Milestones</th><th>Progress</th><th>Status</th><th>Ports</th><th>Value</th><th>Owner</th><th>Tickets</th><th>Target live</th></tr></thead>
    <tbody>${rows.map((p) => `<tr class="clickable" data-href="#/projects/${p.id}">
      <td><b>${esc(p.name)}</b><div class="muted small">${esc(p.code)}${p.city ? ` · ${esc(p.city)}${p.state ? ', ' + esc(p.state) : ''}` : ''}</div></td>
      <td>${esc(p.customer_name || '—')}</td>
      <td>${p.phase === 'diligence' ? '<span class="muted small">—</span>' : msStrip(p, { names: false })}</td>
      <td>${progressBadge(p)}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${p.charger_count ? `${p.charger_count} <span class="muted small">${esc(p.charger_type || '')}</span>` : '—'}</td>
      <td>${money(p.estimated_value)}</td>
      <td>${esc(p.owner_name || '—')}</td>
      <td>${p.open_tickets || '—'}</td>
      <td>${fdate(p.target_live_date)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No projects match.</td></tr>'}</tbody></table></div>`;
  const form = $('#filters');
  const apply = () => { const p = new URLSearchParams(); Object.entries(formData(form)).forEach(([k, v]) => p.set(k, v)); location.hash = `#/projects?${p}`; };
  $$('select', form).forEach((s) => (s.onchange = apply));
  let t; $('input[name=q]', form).addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 350); });
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  $('#newProject').onclick = () => projectForm();
  bindRowLinks();
  const qi = $('input[name=q]', form); if (f.q) { qi.focus(); qi.setSelectionRange(f.q.length, f.q.length); }
}

function projectForm(p = null, { phase = 'diligence' } = {}) {
  const e = S.meta.enums; const v = p || { status: 'active', priority: 'medium', owner_id: S.me.id, tax_credit_eligible: 'unknown' };
  const isDD = p ? p.phase === 'diligence' : phase === 'diligence';
  const startOpts = [['dd', 'Due diligence (recommended)'], ['pipeline', 'Pipeline (skip due diligence)']];
  const ddSection = `<h3 class="full" style="margin:6px 0 0">Property</h3>
      <label>Property owner<input name="property_owner" value="${esc(v.property_owner)}" placeholder="Who owns the property"></label>
      <label>Owner contact<input name="property_owner_contact" value="${esc(v.property_owner_contact)}" placeholder="Phone or email"></label>
      <label class="full">Utility company
        <span class="input-row"><select name="utility_id" id="pfUtility"></select><button type="button" class="btn sm" id="pfNewUtility">+ New utility</button></span></label>
      <div class="full pick-block"><div class="pick-label">Rebate we're going after <span class="muted small" id="pfRebateHint"></span></div>
        <div id="pfRebates" class="grid" style="gap:6px"></div>
        <button type="button" class="link-btn small" id="pfAddRebate">+ add another rebate (stacking)</button></div>
      <label>Not on the board? Type it, or “None”<input name="rebate_program" value="${esc(v.rebate_program)}" placeholder="Only if it isn't on the Rebates board"></label>
      <label>Expected rebate (USD)<input name="rebate_amount" type="number" min="0" step="any" value="${esc(v.rebate_amount)}"></label>
      <h3 class="full" style="margin:6px 0 0">Tax credit</h3>
      <label>Tax credit<select name="tax_credit_id" id="pfTax"></select></label>
      <label>Eligible?<select name="tax_credit_eligible">${options([['unknown', 'Not checked yet'], ['yes', 'Yes'], ['no', 'No']], v.tax_credit_eligible || 'unknown')}</select></label>
      <label>Estimated credit (USD)<input name="tax_credit_amount" type="number" min="0" step="any" value="${esc(v.tax_credit_amount)}"></label>
      <label class="full">Due diligence notes<textarea name="diligence_notes" placeholder="Anything found while checking the site">${esc(v.diligence_notes)}</textarea></label>`;
  const card = openModal(`${modalHead(p ? `Edit ${esc(p.code)}` : isDD ? 'New property' : 'New project')}
    <form class="form-grid">
      <label class="full">Project / site name *<input name="name" required value="${esc(v.name)}" placeholder="e.g. Riverside Plaza – Level 2 garage"></label>
      ${p ? '' : `<label>Start in<select name="start">${options(startOpts, isDD ? 'dd' : 'pipeline')}</select></label>`}
      <label>Status<select name="status">${options(e.projectStatus, v.status)}</select></label>
      <label>Priority<select name="priority">${options(e.priority, v.priority)}</select></label>
      <label>Owner<select name="owner_id">${userOptions(v.owner_id)}</select></label>
      <label class="full">Hold / blocker reason<input name="hold_reason" value="${esc(v.hold_reason)}" placeholder="Shown when status is on hold or blocked"></label>
      <h3 class="full" style="margin:6px 0 0">Site</h3>
      <label class="full">Address<input name="address" value="${esc(v.address)}"></label>
      <label>City<input name="city" value="${esc(v.city)}"></label>
      <label>State<select name="state" id="pfState">${stateOptions(v.state)}</select></label>
      <label>ZIP<input name="zip" value="${esc(v.zip)}"></label>
      <label>Site type<select name="site_type">${options(e.siteType, v.site_type, { blank: '—' })}</select></label>
      ${isDD ? ddSection : ''}
      <h3 class="full" style="margin:6px 0 0">Customer (no login required)</h3>
      <label>Customer / company<input name="customer_name" value="${esc(v.customer_name)}"></label>
      <label>Contact name<input name="contact_name" value="${esc(v.contact_name)}"></label>
      <label>Contact email<input name="contact_email" type="email" value="${esc(v.contact_email)}"></label>
      <label>Contact phone<input name="contact_phone" value="${esc(v.contact_phone)}"></label>
      <h3 class="full" style="margin:6px 0 0">Charging scope</h3>
      <label>Charger type<select name="charger_type">${options(e.chargerType, v.charger_type, { blank: '—', fmt: (x) => x })}</select></label>
      <label>Number of ports<input name="charger_count" type="number" min="0" value="${esc(v.charger_count)}"></label>
      <label>Total power (kW)<input name="power_kw" type="number" min="0" step="any" value="${esc(v.power_kw)}"></label>
      <label>Estimated value (USD)<input name="estimated_value" type="number" min="0" step="any" value="${esc(v.estimated_value)}"></label>
      <label>Target live date<input name="target_live_date" type="date" value="${esc(v.target_live_date)}"></label>
      <label class="full">Description / scope notes<textarea name="description">${esc(v.description)}</textarea></label>
      ${isDD ? '' : ddSection}
      <div class="modal-foot full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${p ? 'Save changes' : isDD ? 'Add property' : 'Create project'}</button></div>
    </form>`, { wide: true });

  // the utility, rebate and tax-credit lists follow the site's state
  let picked = (v.rebates || []).map((r) => String(r.id));
  if (!picked.length) picked = [''];
  let utilSel = v.utility_id ? String(v.utility_id) : '';
  let taxSel = v.tax_credit_id ? String(v.tax_credit_id) : '';
  const stateNow = () => $('#pfState', card).value;
  const inState = (st, code) => !st || String(code || '').split(',').includes(st);
  const rebateOpts = (st, sel) => {
    const list = S.meta.rebates.filter((r) => r.kind !== 'tax_credit' && (!st || r.state === st || r.state === 'US'));
    const lbl = (r) => `${r.name}${r.state === 'US' ? ' (federal)' : st ? '' : ` (${r.state})`}${r.status !== 'open' ? ` · ${REBATE_STATUS[r.status]}` : ''}`;
    return `<option value="">${st ? `— choose a ${st} rebate —` : '— choose —'}</option>${list.map((r) => `<option value="${r.id}" ${String(r.id) === sel ? 'selected' : ''}>${esc(lbl(r))}</option>`).join('')}`;
  };
  const draw = () => {
    const st = stateNow();
    const utils = S.meta.utilities;
    const here = utils.filter((u) => st && inState(st, u.states)); const other = utils.filter((u) => !here.includes(u));
    $('#pfUtility', card).innerHTML = `<option value="">— choose —</option>`
      + (here.length ? `<optgroup label="Utilities in ${esc(st)}">${here.map((u) => `<option value="${u.id}" ${String(u.id) === utilSel ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</optgroup>` : '')
      + (other.length ? `<optgroup label="${here.length ? 'Other utilities' : 'Utilities'}">${other.map((u) => `<option value="${u.id}" ${String(u.id) === utilSel ? 'selected' : ''}>${esc(u.name)}${u.states ? ` (${esc(u.states)})` : ''}</option>`).join('')}</optgroup>` : '');
    $('#pfRebates', card).innerHTML = picked.map((sel, i) => `<div class="input-row">
        <select data-rebate-sel="${i}" aria-label="Rebate">${rebateOpts(st, sel)}</select>
        <button type="button" class="btn sm" data-rinfo="${i}" title="What is this rebate?" ${sel ? '' : 'disabled'}>ⓘ</button>
        ${i > 0 ? `<button type="button" class="btn sm" data-rdel="${i}" title="Remove">✕</button>` : ''}</div>`).join('');
    const n = S.meta.rebates.filter((r) => r.kind !== 'tax_credit' && (r.state === st || r.state === 'US')).length;
    $('#pfRebateHint', card).textContent = st ? `${n} on the board for ${st} + federal` : 'pick the state above to narrow the list';
    const tax = S.meta.rebates.filter((r) => r.kind === 'tax_credit' && (!st || r.state === st || r.state === 'US'));
    $('#pfTax', card).innerHTML = `<option value="">— none / not sure —</option>${tax.map((r) => `<option value="${r.id}" ${String(r.id) === taxSel ? 'selected' : ''}>${esc(r.name)}${r.state === 'US' ? ' (federal)' : ''}${r.status !== 'open' ? ` · ${REBATE_STATUS[r.status]}` : ''}</option>`).join('')}`;
    $$('[data-rebate-sel]', card).forEach((s) => (s.onchange = () => { picked[Number(s.dataset.rebateSel)] = s.value; draw(); }));
    $$('[data-rinfo]', card).forEach((b) => (b.onclick = () => { const id = picked[Number(b.dataset.rinfo)]; if (id) rebatePeek(id); }));
    $$('[data-rdel]', card).forEach((b) => (b.onclick = () => { picked.splice(Number(b.dataset.rdel), 1); draw(); }));
  };
  if ($('#pfUtility', card)) {
    $('#pfState', card).addEventListener('change', draw);
    $('#pfUtility', card).addEventListener('change', (ev) => { utilSel = ev.target.value; });
    $('#pfTax', card).addEventListener('change', (ev) => { taxSel = ev.target.value; });
    $('#pfAddRebate', card).onclick = () => { picked.push(''); draw(); };
    $('#pfNewUtility', card).onclick = async () => {
      const name = prompt('Name of the utility company to add to the directory:');
      if (!name || !name.trim()) return;
      try {
        const u = await api('POST', '/api/utilities', { name: name.trim(), states: stateNow() });
        await loadMeta(); utilSel = String(u.id); draw(); toast(`Added ${u.name} to the utility directory`);
      } catch (err) { fail(err); }
    };
    draw();
  }

  $('form', card).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const data = formData(ev.target);
      if (!p) { data.phase = data.start === 'dd' ? 'diligence' : 'pipeline'; delete data.start; }
      if ($('#pfRebates', card)) data.rebate_ids = picked.filter(Boolean);
      const saved = p ? await api('PATCH', `/api/projects/${p.id}`, data) : await api('POST', '/api/projects', data);
      modalClose = null; closeModal(); toast(p ? 'Project saved' : saved.phase === 'diligence' ? `Added ${saved.code} to due diligence` : `Created ${saved.code}`);
      if (p) route(); else location.hash = `#/projects/${saved.id}`;
    } catch (err) { fail(err); }
  });
}

// quick look at a rebate from inside the property form (a small panel, so the form stays open)
async function rebatePeek(id) {
  const r = await api('GET', `/api/rebates/${id}`).catch(fail);
  if (!r) return;
  const reqs = String(r.requirements || '').split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  const box = document.createElement('div');
  box.className = 'peek';
  box.innerHTML = `<div class="modal-head"><b>${esc(r.name)}</b><button class="x" aria-label="Close">×</button></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${rebateStatusBadge(r.status)} ${needsCheck(r)}</div>
    ${r.amount_text ? `<div><b>${esc(r.amount_text)}</b></div>` : ''}
    ${r.deadline ? `<div class="small muted">${esc(deadlineText(r.deadline))}</div>` : ''}
    ${r.summary ? `<p class="small" style="white-space:pre-wrap">${esc(r.summary)}</p>` : ''}
    ${r.offer ? `<div class="offer-box small"><b>🔌 Chargers we can offer:</b> <span style="white-space:pre-wrap">${esc(r.offer)}</span></div>` : ''}
    ${reqs.length ? `<div class="small" style="margin-top:8px"><b>Requirements</b><ul class="req-list">${reqs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`;
  document.body.appendChild(box);
  $('.x', box).onclick = () => box.remove();
}

// ---------- site chat ----------
// One main chat per site. Each milestone has its own chat too; those messages are tagged with
// the milestone and also appear in the main chat, so every conversation is tracked in one place.
const msById = (id) => S.meta.milestones.find((m) => String(m.id) === String(id));
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const msTag = (x, clickable) => (x.milestone
  ? `<${clickable && x.milestone_id ? `button type="button" data-open-ms="${x.milestone_id}"` : 'span'} class="msg-tag" title="${clickable ? `Open the ${esc(x.milestone)} chat` : ''}"><span class="dot" style="background:${esc(x.color || '#94a3b8')}"></span>${esc(x.milestone)}</${clickable && x.milestone_id ? 'button' : 'span'}>`
  : '');

function chatItem(x, inMain) {
  if (x.kind === 'event') {
    return `<div class="msg-event">${msTag(x, inMain)} <span>marked <b>${esc(MS_LABEL[x.to_status] || x.to_status)}</b> by ${esc(x.user_name || '—')}</span>
      <span class="muted">· ${fdatetime(x.created_at)}</span>${x.note ? `<div class="muted">“${esc(x.note)}”</div>` : ''}</div>`;
  }
  const mine = x.user_id === S.me.id;
  return `<div class="msg ${mine ? 'mine' : ''}">
    <div class="avatar" title="${esc(x.user_name || '')}">${esc(initials(x.user_name))}</div>
    <div class="msg-main">
      <div class="msg-head"><b>${esc(x.user_name || 'Former user')}</b>${inMain ? msTag(x, true) : ''}<span class="muted small">${fdatetime(x.created_at)}</span>
        ${mine || S.me.role === 'admin' ? `<button type="button" class="msg-del" data-del="${x.id}" title="Delete message" aria-label="Delete message">✕</button>` : ''}</div>
      <div class="msg-body">${markMentions(esc(x.body))}</div>
    </div></div>`;
}

// Renders a chat into `el`. milestoneId = null for the site's main chat.
async function mountChat(el, p, milestoneId, { onOpenMilestone, onChange } = {}) {
  const m = milestoneId ? msById(milestoneId) : null;
  const canTag = !m && p.phase === 'pipeline';
  el.innerHTML = `<div class="chat">
    <div class="chat-log" aria-live="polite"><div class="empty">Loading…</div></div>
    <form class="chat-form">
      ${canTag ? `<select name="milestone_id" aria-label="About">${options(S.meta.milestones.map((x) => [x.id, x.name]), '', { blank: 'General' })}</select>` : ''}
      <textarea name="body" rows="2" required placeholder="${m ? `Message about ${esc(m.name)}…` : 'Message the team… (type @ to mention someone)'}" title="Enter to send, Shift+Enter for a new line"></textarea>
      <button class="btn primary">Send</button>
    </form></div>`;
  const log = $('.chat-log', el); const form = $('.chat-form', el);
  let sig = null;
  const load = async (force) => {
    if (!el.isConnected) return;
    const rows = await api('GET', `/api/projects/${p.id}/messages${m ? `?milestone_id=${m.id}` : ''}`);
    const s = rows.map((r) => `${r.kind}${r.id}`).join(',');
    if (s === sig && !force) return;
    const first = sig === null; sig = s;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = rows.map((x) => chatItem(x, !m)).join('')
      || `<div class="empty">No messages yet. ${m ? `Start the ${esc(m.name)} conversation.` : 'Start the conversation for this site.'}</div>`;
    if (first || nearBottom || force) log.scrollTop = log.scrollHeight;
    $$('[data-open-ms]', log).forEach((b) => (b.onclick = () => onOpenMilestone?.(Number(b.dataset.openMs))));
    $$('[data-del]', log).forEach((b) => (b.onclick = async () => {
      if (!confirm('Delete this message?')) return;
      try { await api('DELETE', `/api/messages/${b.dataset.del}`); await load(true); onChange?.(); } catch (err) { fail(err); }
    }));
  };
  await load();
  // pick up teammates' messages; stops by itself once the chat is closed
  const timer = setInterval(() => { if (!el.isConnected) clearInterval(timer); else load().catch(() => {}); }, 10000);
  const ta = $('textarea', form);
  attachMentionPicker(ta); // must come first so Enter can pick a name
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form); if (!d.body) return;
    const btn = $('button', form); btn.disabled = true;
    try {
      await api('POST', `/api/projects/${p.id}/messages`, { body: d.body, milestone_id: m ? m.id : d.milestone_id || null });
      ta.value = ''; await load(true); onChange?.();
    } catch (err) { fail(err); } finally { btn.disabled = false; ta.focus(); }
  });
}

// Pop-up chat for one milestone (or the whole site when milestoneId is null)
function openChat(p, milestoneId, after) {
  const m = milestoneId ? msById(milestoneId) : null;
  const x = m ? p.milestones?.find((y) => y.id === m.id) : null;
  const card = openModal(`<div class="modal-head"><div>
      <h2 style="margin:0">${m ? `<span class="dot" style="background:${esc(m.color)}"></span> ${esc(m.name)} chat` : 'Site chat'}</h2>
      <div class="muted small">${esc(p.address || p.name)} · ${esc(p.code)}${x ? ` · ${MS_ICON[x.status]} ${esc(MS_LABEL[x.status])}${msWhen(x) ? ` (${esc(msWhen(x))})` : ''}` : ''}</div></div>
      <button class="x" data-close aria-label="Close">×</button></div>
    <div id="chatMount"></div>
    <div class="muted small" style="margin-top:8px">${m ? 'Messages here also appear in the site chat. ' : ''}<a href="#/projects/${p.id}" id="toProject">Open the project page →</a></div>`,
  { wide: true, onClose: after });
  $('#toProject', card).onclick = () => { projectTab = 'chat'; };
  mountChat($('#chatMount', card), p, milestoneId, { onOpenMilestone: (mid) => { modalClose = null; closeModal(); location.hash = `#/projects/${p.id}/m/${mid}`; } });
}

async function tabChat(p) {
  await mountChat($('#tabBody'), p, null, {
    onOpenMilestone: (mid) => { location.hash = `#/projects/${p.id}/m/${mid}`; },
  });
}

// ---------- project detail ----------
let projectTab = 'chat';
async function renderProject(id) {
  const p = await api('GET', `/api/projects/${id}`);
  const dd = p.phase === 'diligence';
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (dd ? 'diligence' : 'projects')));
  view.innerHTML = `
    <div class="page-head">
      <div><div class="muted small">${dd ? '<a href="#/diligence">Due Diligence</a>' : '<a href="#/projects">Projects</a>'} / ${esc(p.code)}</div>
        <h1>${esc(p.name)}</h1>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">${progressBadge(p)} ${statusBadge(p.status)} ${prioBadge(p.priority)}
          ${p.state ? badge('', stateName(p.state)) : ''}
          ${dd ? `<span class="small muted">${p.days_in_phase} days in due diligence</span>`
            : `<span class="small ${isFlagged(p) ? 'stale' : 'muted'}">${p.days_in_phase} days in pipeline${isFlagged(p) ? ` · ${p.ms_overdue} milestone${p.ms_overdue === 1 ? '' : 's'} running late` : ''}</span>`}</div>
        ${p.hold_reason && p.status !== 'active' ? `<div class="small" style="margin-top:6px;color:var(--warn)"><b>Hold reason:</b> ${esc(p.hold_reason)}</div>` : ''}
      </div>
      <div class="actions">
        <select id="quickStatus" title="Status">${options(S.meta.enums.projectStatus, p.status)}</select>
        ${dd && p.dd_stage === 'new' ? `<button class="btn primary" id="ddAssess">${p.dd_rating ? 'Finish assessment' : 'Assess'}</button>` : ''}
        ${dd && p.dd_stage === 'review' && canReview() ? '<button class="btn" data-pr="info">Needs more info</button><button class="btn" data-pr="pass">Pass</button><button class="btn primary" data-pr="approve">Approve for site walk</button>' : ''}
        ${dd && p.dd_stage === 'review' && !canReview() ? '<button class="btn" id="ddAssess">Edit rating</button>' : ''}
        ${dd && p.dd_stage === 'passed' ? '<button class="btn" id="ddReopen">Reopen</button>' : ''}
        <button class="btn" id="editProject">Edit</button>
        ${S.me.role === 'admin' ? '<button class="btn danger" id="delProject">Delete</button>' : ''}
      </div>
    </div>
    ${dd ? `<div class="card dd-card"><div class="card-head"><h2>Assessment</h2><span class="ms-pill ms-pill-${p.dd_stage === 'passed' ? 'not_needed' : p.dd_stage === 'review' ? 'in_progress' : 'not_started'}">${esc(DD_STAGE_LABEL[p.dd_stage] || p.dd_stage)}</span></div>
      ${p.dd_stage === 'new' && p.dd_review_note ? `<div class="dd-returned"><b>${esc(p.reviewed_by_name || 'Reviewer')} needs more info:</b> ${esc(p.dd_review_note)}</div>` : ''}
      <div style="margin-bottom:6px">${ratingView(p.dd_rating)}</div>
      ${p.dd_insight ? `<div class="dd-insight">${esc(p.dd_insight)}</div><div class="muted small" style="margin-top:6px">Assessed by ${esc(p.assessed_by_name || '—')} · ${fdate(p.dd_assessed_at)}</div>` : '<div class="muted small">No insight written yet.</div>'}
      ${p.dd_stage === 'passed' ? `<div class="small" style="margin-top:8px">Passed by ${esc(p.reviewed_by_name || '—')} · ${fdate(p.dd_reviewed_at)}${p.dd_review_note ? `: “${esc(p.dd_review_note)}”` : ''}</div>` : ''}</div>`
    : `<div class="card"><div class="card-head"><h2>Milestones</h2><span class="muted small">${p.ms_complete ? 'All done. This site is live.' : `${p.ms_done} of ${p.ms_total} done · in any order`}</span></div>${msList(p)}</div>`}
    <div class="cols-main" style="margin-top:16px">
      <div>
        <div class="tabs" style="margin-top:0">${['chat', 'tickets', 'documents', 'timeline', 'activity'].map((t) => `<button class="tab ${projectTab === t ? 'active' : ''}" data-tab="${t}">${label(t)}${t === 'chat' && p.msg_count ? ` (${p.msg_count})` : ''}${t === 'tickets' && p.open_tickets ? ` (${p.open_tickets})` : ''}${t === 'documents' && p.doc_count ? ` (${p.doc_count})` : ''}</button>`).join('')}</div>
        <div id="tabBody"></div>
      </div>
      <div class="grid" style="gap:16px">
        <div class="card"><h2>Property</h2><dl class="kv">
          <dt>Property owner</dt><dd>${esc(p.property_owner || '—')}</dd>
          <dt>Owner contact</dt><dd>${esc(p.property_owner_contact || '—')}</dd>
          <dt>Utility</dt><dd>${p.utility_id ? `<a href="#/utilities/${p.utility_id}">${esc(p.utility_company)}</a>` : esc(p.utility_company || '—')}</dd>
          <dt>Rebate</dt><dd>${p.rebates.map((r, i) => rebateLine(r, i === 0 && p.rebate_amount ? `expected ${money(p.rebate_amount)}` : '')).join('')}${p.rebate_program ? `<div class="small">${esc(p.rebate_program)}</div>` : ''}${!p.rebates.length && !p.rebate_program ? '—' : ''}</dd>
          <dt>Tax credit</dt><dd>${p.tax_credit_id ? rebateLine(S.meta.rebates.find((r) => r.id === p.tax_credit_id) || { id: p.tax_credit_id, name: 'Tax credit' },
            `${{ yes: 'eligible', no: 'not eligible', unknown: 'eligibility not checked' }[p.tax_credit_eligible || 'unknown']}${p.tax_credit_amount ? `, est. ${money(p.tax_credit_amount)}` : ''}`) : '—'}</dd>
          ${p.dd_rating ? `<dt>Rating</dt><dd>${ratingView(p.dd_rating)}</dd>` : ''}
          ${p.diligence_completed_at ? `<dt>Approved</dt><dd>${fdate(p.diligence_completed_at)}${p.reviewed_by_name ? ` by ${esc(p.reviewed_by_name)}` : ''}</dd>` : ''}
        </dl>
        ${p.diligence_notes ? `<h3 class="side-h">Notes</h3><div style="white-space:pre-wrap">${esc(p.diligence_notes)}</div>` : ''}</div>
        <div class="card" id="calCard"></div>
        <div class="card" id="remCard"></div>
        <div class="card"><h2>Customer</h2><dl class="kv">
          <dt>Company</dt><dd>${esc(p.customer_name || '—')}</dd>
          <dt>Contact</dt><dd>${esc(p.contact_name || '—')}</dd>
          <dt>Email</dt><dd>${p.contact_email ? `<a href="mailto:${esc(p.contact_email)}">${esc(p.contact_email)}</a>` : '—'}</dd>
          <dt>Phone</dt><dd>${p.contact_phone ? `<a href="tel:${esc(p.contact_phone)}">${esc(p.contact_phone)}</a>` : '—'}</dd>
        </dl></div>
        <div class="card"><h2>Site & scope</h2><dl class="kv">
          <dt>Address</dt><dd>${esc([p.address, p.city, p.state, p.zip].filter(Boolean).join(', ') || '—')}
            ${p.address || p.city ? `<div><a class="small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.address, p.city, p.state, p.zip].filter(Boolean).join(', '))}">Open map ↗</a></div>` : ''}</dd>
          <dt>Site type</dt><dd>${esc(label(p.site_type) || '—')}</dd>
          <dt>Chargers</dt><dd>${p.charger_count ? `${p.charger_count} × ${esc(p.charger_type || 'ports')}` : '—'}</dd>
          <dt>Power</dt><dd>${p.power_kw ? `${num(p.power_kw)} kW` : '—'}</dd>
          <dt>Est. value</dt><dd>${money(p.estimated_value)}</dd>
          <dt>Target live</dt><dd>${fdate(p.target_live_date)}</dd>
          <dt>Owner</dt><dd>${esc(p.owner_name || '—')}</dd>
          <dt>Created</dt><dd>${fdate(p.created_at)}</dd>
        </dl>${p.description ? `<h3 style="margin-top:14px">Scope notes</h3><div style="white-space:pre-wrap">${esc(p.description)}</div>` : ''}</div>
      </div>
    </div>`;

  $('#editProject').onclick = () => projectForm(p);
  $('#ddAssess')?.addEventListener('click', () => assessModal(p, route));
  $('#ddReopen')?.addEventListener('click', async () => { try { await api('POST', `/api/projects/${p.id}/reopen`); toast('Back in To assess'); route(); } catch (err) { fail(err); } });
  $$('[data-pr]', view).forEach((b) => (b.onclick = () => reviewModal(p, b.dataset.pr, (r) => { if (b.dataset.pr === 'approve' && r) location.hash = msHref(p.id, r.milestones.find((x) => x.status === 'in_progress')?.id || r.milestones[0].id); else route(); })));
  bindRebateChips();
  projectRemindersCard(p, $('#remCard')).catch(() => {});
  projectCalendarCard(p, $('#calCard')).catch(() => {});
  $('#quickStatus').onchange = async (e) => {
    const status = e.target.value; let hold_reason;
    if (['on_hold', 'blocked', 'lost', 'cancelled'].includes(status)) {
      hold_reason = prompt(`Reason for "${label(status)}"?`, p.hold_reason || '');
      if (hold_reason === null) { e.target.value = p.status; return; }
    }
    try { await api('PATCH', `/api/projects/${p.id}`, hold_reason !== undefined ? { status, hold_reason } : { status }); toast('Status updated'); route(); } catch (err) { fail(err); }
  };
  $('#delProject')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${p.code} "${p.name}" with all its tickets and documents? This cannot be undone.`)) return;
    try { await api('DELETE', `/api/projects/${p.id}`); toast('Project deleted'); location.hash = '#/projects'; } catch (err) { fail(err); }
  });
  const showTab = (t) => {
    projectTab = t;
    $$('.tab', view).forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    ({ chat: tabChat, tickets: tabTickets, documents: tabDocuments, timeline: tabTimeline, activity: tabActivity })[t](p);
  };
  $$('.tab', view).forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  showTab(projectTab);
}

async function tabTickets(p) {
  const body = $('#tabBody');
  const rows = await api('GET', `/api/tickets?project_id=${p.id}`);
  body.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn primary" id="newTicket">+ New ticket</button></div>
    ${ticketTable(rows, false)}`;
  $('#newTicket').onclick = () => ticketForm(p.id, () => renderProject(p.id));
  bindTicketRows(body, () => renderProject(p.id));
}

function ticketTable(rows, showProject = true) {
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Ticket</th>${showProject ? '<th>Project</th>' : ''}<th>Type</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th><th>Updated</th></tr></thead>
  <tbody>${rows.map((t) => `<tr class="clickable" data-ticket="${t.id}">
    <td class="muted">${t.id}</td>
    <td><b>${esc(t.title)}</b>${t.comment_count ? ` <span class="muted small">💬 ${t.comment_count}</span>` : ''}</td>
    ${showProject ? `<td><a href="#/projects/${t.project_id}">${esc(t.project_code)}</a><div class="muted small">${esc(t.project_name)}</div></td>` : ''}
    <td>${esc(label(t.type))}</td><td>${ticketBadge(t.status)}</td><td>${prioBadge(t.priority)}</td>
    <td>${esc(t.assignee_name || '—')}</td>
    <td class="${t.due_date && t.due_date < today() && !['resolved', 'closed'].includes(t.status) ? 'stale' : ''}">${fdate(t.due_date)}</td>
    <td class="muted small">${ago(t.updated_at)}</td></tr>`).join('') || `<tr><td colspan="9" class="empty">No tickets.</td></tr>`}</tbody></table></div>`;
}
function bindTicketRows(root, after) {
  $$('tr[data-ticket]', root).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) openTicket(tr.dataset.ticket, after); }));
}

function ticketForm(projectId, after, projects) {
  const e = S.meta.enums;
  const card = openModal(`${modalHead('New ticket')}
    <form class="form-grid">
      ${projectId ? '' : `<label class="full">Project *<select name="project_id" required>${options(projects.map((p) => [p.id, `${p.code} — ${p.name}`]), '', { blank: 'Select project…' })}</select></label>`}
      <label class="full">Title *<input name="title" required placeholder="e.g. Submit electrical permit to county"></label>
      <label>Type<select name="type">${options(e.ticketType, 'task')}</select></label>
      <label>Priority<select name="priority">${options(e.priority, 'medium')}</select></label>
      <label>Assignee<select name="assignee_id">${userOptions(S.me.id)}</select></label>
      <label>Due date<input type="date" name="due_date"></label>
      <label class="full">Description<textarea name="description"></textarea></label>
      <div class="modal-foot full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Create ticket</button></div>
    </form>`);
  $('form', card).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = formData(ev.target); const pid = projectId || d.project_id; delete d.project_id;
    try { await api('POST', `/api/projects/${pid}/tickets`, d); modalClose = null; closeModal(); toast('Ticket created'); after?.(); } catch (err) { fail(err); }
  });
}

async function openTicket(id, after) {
  let t;
  try { t = await api('GET', `/api/tickets/${id}`); } catch (e) { return fail(e); }
  const e = S.meta.enums;
  let dirty = false;
  const card = openModal(`${modalHead(`<span class="muted">#${t.id}</span> ${esc(t.title)}`)}
    <div class="muted small" style="margin:-8px 0 12px"><a href="#/projects/${t.project_id}">${esc(t.project_code)} — ${esc(t.project_name)}</a> · opened by ${esc(t.creator_name || '—')} ${ago(t.created_at)}</div>
    <form id="tEdit" class="form-grid">
      <label class="full">Title<input name="title" value="${esc(t.title)}" required></label>
      <label>Status<select name="status">${options(e.ticketStatus, t.status)}</select></label>
      <label>Priority<select name="priority">${options(e.priority, t.priority)}</select></label>
      <label>Type<select name="type">${options(e.ticketType, t.type)}</select></label>
      <label>Assignee<select name="assignee_id">${userOptions(t.assignee_id)}</select></label>
      <label>Due date<input type="date" name="due_date" value="${esc(t.due_date)}"></label>
      <label class="full">Description<textarea name="description">${esc(t.description)}</textarea></label>
      <div class="full" style="display:flex;justify-content:space-between;gap:8px">
        ${S.me.role === 'admin' ? '<button type="button" class="btn danger sm" id="tDel">Delete ticket</button>' : '<span></span>'}
        <button class="btn primary">Save ticket</button></div>
    </form>
    <h3 style="margin-top:18px">Attachments</h3>
    <div id="tDocs">${docList(t.documents)}</div>
    <label class="btn sm" style="display:inline-block;margin-top:8px">📎 Attach files<input type="file" multiple hidden id="tFiles"></label>
    <h3 style="margin-top:18px">Comments & updates</h3>
    <div class="feed">${t.comments.map((c) => `<div class="feed-item"><b>${esc(c.user_name || 'System')}</b> <span class="muted small">${fdatetime(c.created_at)}</span><div class="note">${esc(c.body)}</div></div>`).join('') || '<div class="muted small">No comments yet.</div>'}</div>
    <form id="tComment" class="grid" style="margin-top:10px"><textarea name="body" placeholder="Add a comment, call log, or update…" required></textarea>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary sm">Add comment</button></div></form>`,
  { wide: true, onClose: () => after?.() });
  const reopen = () => { modalClose = null; openTicket(id, after); };
  $('#tEdit', card).addEventListener('input', () => (dirty = true));
  $('#tEdit', card).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await api('PATCH', `/api/tickets/${t.id}`, formData(ev.target)); toast('Ticket saved'); dirty = false; reopen(); } catch (err) { fail(err); }
  });
  $('#tComment', card).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (dirty && confirm('Save your ticket changes first?')) await api('PATCH', `/api/tickets/${t.id}`, formData($('#tEdit', card))).catch(fail);
    try { await api('POST', `/api/tickets/${t.id}/comments`, formData(ev.target)); reopen(); } catch (err) { fail(err); }
  });
  $('#tFiles', card).addEventListener('change', async (ev) => {
    const fd = new FormData(); [...ev.target.files].forEach((f) => fd.append('files', f));
    fd.append('ticket_id', t.id); fd.append('category', t.type === 'permit' ? 'permit' : t.type === 'utility' ? 'utility' : 'other');
    try { await api('POST', `/api/projects/${t.project_id}/documents`, fd); toast('Uploaded'); reopen(); } catch (err) { fail(err); }
  });
  bindDocActions(card, reopen);
  $('#tDel', card)?.addEventListener('click', async () => {
    if (!confirm('Delete this ticket and its comments?')) return;
    try { await api('DELETE', `/api/tickets/${t.id}`); closeModal(); toast('Ticket deleted'); } catch (err) { fail(err); }
  });
}

// ---------- documents ----------
function docList(docs, showTicket = false) {
  if (!docs.length) return '<div class="muted small">No files.</div>';
  return `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th></th><th>File</th><th>Category</th>${showTicket ? '<th>Ticket</th>' : ''}<th>Size</th><th>Uploaded</th><th></th></tr></thead><tbody>
  ${docs.map((d) => {
    const ext = (d.original_name.split('.').pop() || '').slice(0, 4);
    const previewable = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/.test(d.mime || '');
    return `<tr><td><div class="file-icon">${esc(ext)}</div></td>
      <td><b>${esc(d.original_name)}</b>${d.notes ? `<div class="muted small">${esc(d.notes)}</div>` : ''}</td>
      <td>${badge('', label(d.category))}${d.milestone_name ? `<div class="muted small">${esc(d.milestone_name)}</div>` : ''}</td>
      ${showTicket ? `<td>${d.ticket_id ? `<a href="#/tickets/${d.ticket_id}">#${d.ticket_id}</a>` : '—'}</td>` : ''}
      <td class="muted small">${fsize(d.size || 0)}</td>
      <td class="small">${esc(d.uploader_name || '—')}<div class="muted">${fdate(d.uploaded_at)}</div></td>
      <td style="white-space:nowrap;text-align:right">
        ${previewable ? `<a class="btn sm" target="_blank" rel="noopener" href="/api/documents/${d.id}/download?inline=1">View</a>` : ''}
        <a class="btn sm" href="/api/documents/${d.id}/download">Download</a>
        <button class="btn sm danger" data-deldoc="${d.id}" data-name="${esc(d.original_name)}">✕</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function bindDocActions(root, after) {
  $$('[data-deldoc]', root).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Delete "${b.dataset.name}"?`)) return;
    try { await api('DELETE', `/api/documents/${b.dataset.deldoc}`); toast('File deleted'); after(); } catch (err) { fail(err); }
  }));
}

async function tabDocuments(p) {
  const body = $('#tabBody');
  const docs = await api('GET', `/api/projects/${p.id}/documents`);
  const cats = S.meta.enums.docCategory;
  const counts = {}; docs.forEach((d) => (counts[d.category] = (counts[d.category] || 0) + 1));
  body.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="form-grid" style="margin-bottom:10px">
        <label>Category for upload<select id="upCat">${options(cats, 'other')}</select></label>
        <label style="grid-column: span 2">Note (optional)<input id="upNotes" placeholder="e.g. Signed MSA v2, stamped single-line diagram"></label>
      </div>
      <div class="dropzone" id="drop">Drop files here or <b>click to browse</b><div class="small">Contracts, site plans, photos, permits, utility letters… up to 50 MB each</div></div>
      <input type="file" id="fileIn" multiple hidden>
    </div>
    <div class="filters"><select id="catFilter">${options(cats.map((c) => [c, `${label(c)} (${counts[c] || 0})`]), '', { blank: `All categories (${docs.length})` })}</select></div>
    <div id="docTable">${docList(docs, true)}</div>`;
  const drop = $('#drop'); const input = $('#fileIn');
  const send = async (files) => {
    if (!files.length) return;
    const fd = new FormData(); [...files].forEach((f) => fd.append('files', f));
    fd.append('category', $('#upCat').value); fd.append('notes', $('#upNotes').value);
    drop.textContent = `Uploading ${files.length} file(s)…`;
    try { await api('POST', `/api/projects/${p.id}/documents`, fd); toast('Uploaded'); projectTab = 'documents'; renderProject(p.id); } catch (err) { fail(err); tabDocuments(p); }
  };
  drop.onclick = () => input.click();
  input.onchange = () => send(input.files);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); send(e.dataTransfer.files); });
  $('#catFilter').onchange = (e) => {
    $('#docTable').innerHTML = docList(e.target.value ? docs.filter((d) => d.category === e.target.value) : docs, true);
    bindDocActions(body, () => renderProject(p.id));
  };
  bindDocActions(body, () => renderProject(p.id));
}

function tabTimeline(p) {
  const h = p.history || [];
  const items = h.map((x) => `<li><span class="dot" style="background:${esc(x.color || '#94a3b8')}"></span><div>
      <b>${esc(x.milestone || '(removed milestone)')}</b> <span class="ms ms-${esc(x.to_status)}">${MS_ICON[x.to_status] || ''} ${esc(MS_LABEL[x.to_status] || x.to_status)}</span>
      <div class="muted small">${fdatetime(x.changed_at)} by ${esc(x.user_name || '—')}${x.from_status && x.from_status !== x.to_status ? ` · was ${esc((MS_LABEL[x.from_status] || x.from_status).toLowerCase())}` : ''}</div>
      ${x.note ? `<div class="note small" style="white-space:pre-wrap;background:#f8fafc;border-radius:8px;padding:6px 8px;margin-top:4px">${esc(x.note)}</div>` : ''}</div></li>`);
  const total = Math.round((Date.now() - toDate(p.created_at)) / 86400000);
  $('#tabBody').innerHTML = `<div class="card"><h2>Milestone history <span class="muted small">— ${total} days since created</span></h2>
    ${items.length ? `<ul class="timeline">${items.join('')}</ul>` : '<div class="empty">No milestone changes yet.</div>'}</div>`;
}

async function tabActivity(p) {
  const rows = await api('GET', `/api/projects/${p.id}/activity`);
  $('#tabBody').innerHTML = `<div class="card">
    <form id="noteForm" class="grid" style="margin-bottom:14px"><textarea name="body" required placeholder="Log a note: call with customer, site visit findings, utility update…"></textarea>
      <div style="display:flex;justify-content:flex-end"><button class="btn primary sm">Add note</button></div></form>
    <div class="feed">${rows.map(activityItem).join('') || '<div class="empty">No activity.</div>'}</div></div>`;
  $('#noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', `/api/projects/${p.id}/notes`, formData(e.target)); tabActivity(p); } catch (err) { fail(err); }
  });
}

// ---------- tickets queue ----------
async function renderTickets() {
  const q = qs();
  const f = { q: q.get('q') || '', status: q.get('status') ?? 'open', assignee_id: q.get('assignee_id') || '', priority: q.get('priority') || '', type: q.get('type') || '' };
  const rows = await api('GET', `/api/tickets?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`);
  view.innerHTML = `
    <div class="page-head"><h1>Tickets <span class="muted small">${rows.length}</span></h1><div class="actions"><button class="btn primary" id="newTicket">+ New ticket</button></div></div>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="Search tickets or projects…" value="${esc(f.q)}">
      <select name="status">${options([['open', 'Open (not resolved)'], ...S.meta.enums.ticketStatus.map((s) => [s, label(s)])], f.status, { blank: 'All statuses' })}</select>
      <select name="assignee_id">${options([['me', 'Assigned to me'], ['none', 'Unassigned'], ...S.meta.users.map((u) => [u.id, u.name])], f.assignee_id, { blank: 'Anyone' })}</select>
      <select name="priority">${options(S.meta.enums.priority, f.priority, { blank: 'Any priority' })}</select>
      <select name="type">${options(S.meta.enums.ticketType, f.type, { blank: 'Any type' })}</select>
    </form>
    ${ticketTable(rows)}`;
  const form = $('#filters');
  const apply = () => { const p = new URLSearchParams(); Object.entries(formData(form)).forEach(([k, v]) => p.set(k, v)); location.hash = `#/tickets?${p}`; };
  $$('select', form).forEach((s) => (s.onchange = apply));
  let t; $('input[name=q]', form).addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 350); });
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  const qi = $('input[name=q]', form); if (f.q) { qi.focus(); qi.setSelectionRange(f.q.length, f.q.length); }
  $('#newTicket').onclick = async () => ticketForm(null, renderTickets, await api('GET', '/api/projects?status=open'));
  bindTicketRows(view, renderTickets);
}

// ---------- admin ----------
async function renderAdmin() {
  const users = await api('GET', '/api/users');
  const list = S.meta.milestones.map((m) => ({ ...m }));
  view.innerHTML = `
    <div class="page-head"><h1>Admin</h1></div>
    <div class="cols-2">
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Staff users</h2><button class="btn primary sm" id="addUser">+ Add user</button></div>
        <p class="muted small">Only Evium staff sign in. Customers are stored as contacts on each project and never need an account.</p>
        <div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Name</th><th>Role</th><th>Territory</th><th>Status</th><th></th></tr></thead><tbody>
        ${users.sort((a, b) => titleRank(a.title) - titleRank(b.title) || a.name.localeCompare(b.name)).map((u) => `<tr><td><b>${esc(u.name)}</b><div class="muted small">${esc(u.title ? `${u.title} · ` : '')}${esc(u.email)}</div></td><td>${esc(label(u.role))}<div class="muted small">${esc([u.role !== 'admin' && u.can_review ? '10:30 reviewer' : '', u.dd_assessor ? 'Due diligence' : '',
          ...myMilestoneIds(u).map((id) => S.meta.milestones.find((m) => m.id === id)?.name).filter(Boolean)].filter(Boolean).join(' · '))}</div></td><td>${esc((u.states || '').replace(/,/g, ', ') || '—')}</td>
          <td>${u.active ? badge('s-active', 'Active') : badge('s-cancelled', 'Disabled')}</td>
          <td style="text-align:right"><button class="btn sm" data-edituser="${u.id}">Edit</button></td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><h2>Milestones</h2>
        <p class="muted small">Every project tracks each of these, in any order, and can mark any of them “not needed”. The order is just how they're displayed.
          <b>Target days</b> is how long a milestone can be in progress before it's flagged as running late.
          <b>Needs document</b> blocks marking it done until that kind of document is uploaded to the project.</p>
        <div class="ms-admin-head small muted"><span>Colour</span><span>Name</span><span>Target days</span><span>Needs document</span><span></span><span></span></div>
        <div id="msList" class="grid" style="gap:6px"></div>
        <div style="display:flex;justify-content:space-between;margin-top:12px"><button class="btn sm" id="addMs">+ Add milestone</button><button class="btn primary sm" id="saveMs">Save milestones</button></div>
      </div>
    </div>`;
  const draw = () => {
    $('#msList').innerHTML = list.map((m, i) => `<div class="ms-admin-row" data-i="${i}">
      <input type="color" value="${esc(m.color)}" data-k="color" style="padding:2px;height:34px" aria-label="Colour">
      <input value="${esc(m.name)}" data-k="name" placeholder="Milestone name" aria-label="Name">
      <input type="number" min="1" value="${esc(m.sla_days)}" data-k="sla_days" aria-label="Target days">
      <select data-k="required_docs" aria-label="Needs document">${options(S.meta.enums.docCategory, String(m.required_docs || '').split(',')[0], { blank: 'Nothing' })}</select>
      <span style="display:flex;gap:2px">${m.id ? `<button class="btn sm" data-steps="${m.id}" title="Default steps">Steps</button>` : ''}<button class="btn sm" data-mv="-1" title="Move up">↑</button><button class="btn sm" data-mv="1" title="Move down">↓</button></span>
      <button class="btn sm danger" data-rm title="Remove">✕</button></div>`).join('');
    $$('#msList [data-i]').forEach((row) => {
      const i = Number(row.dataset.i);
      $$('[data-k]', row).forEach((inp) => inp.addEventListener('input', () => { list[i][inp.dataset.k] = inp.value; }));
      $$('[data-mv]', row).forEach((b) => (b.onclick = () => { const j = i + Number(b.dataset.mv); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; draw(); }));
      $('[data-rm]', row).onclick = () => { list.splice(i, 1); draw(); };
      $('[data-steps]', row)?.addEventListener('click', () => stepsTemplateModal(list[i]));
    });
  };
  draw();
  $('#addMs').onclick = () => { list.push({ name: '', color: '#64748b', sla_days: 30 }); draw(); };
  $('#saveMs').onclick = async () => {
    const removed = S.meta.milestones.filter((m) => !list.some((x) => x.id === m.id));
    if (removed.length && !confirm(`Remove ${removed.map((m) => `"${m.name}"`).join(', ')} from every project? Its status on each project will be lost.`)) return;
    try { await api('PUT', '/api/milestones', list); await loadMeta(); toast('Milestones saved'); renderAdmin(); } catch (err) { fail(err); }
  };
  $('#addUser').onclick = () => userForm();
  $$('[data-edituser]').forEach((b) => (b.onclick = () => userForm(users.find((u) => String(u.id) === b.dataset.edituser))));
}

// the checklist every new site starts with for this milestone
async function stepsTemplateModal(m) {
  const steps = await api('GET', `/api/milestones/${m.id}/steps`);
  const card = openModal(`${modalHead(`${esc(m.name)}: default steps`)}
    <p class="muted small" style="margin-top:-6px">One step per line. Sites that haven't opened ${esc(m.name)} yet will start with these; sites already working on it keep their own list.</p>
    <form class="grid"><textarea name="steps" rows="12">${esc(steps.map((x) => x.label).join('\n'))}</textarea>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save steps</button></div></form>`);
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    const lines = $('textarea', card).value.split('\n').map((x) => x.trim()).filter(Boolean);
    try { await api('PUT', `/api/milestones/${m.id}/steps`, lines); closeModal(); toast('Steps saved'); } catch (err) { fail(err); }
  });
}

function userForm(u = null) {
  const card = openModal(`${modalHead(u ? 'Edit user' : 'Add staff user')}
    <form class="form-grid">
      <label>Name<input name="name" required value="${esc(u?.name)}"></label>
      <label>Email<input name="email" type="email" required value="${esc(u?.email)}"></label>
      <label>Job title<input name="title" list="titleList" value="${esc(u?.title)}" placeholder="e.g. Project manager" autocomplete="off">
        <datalist id="titleList">${TITLE_ORDER.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
      <label>Access<select name="role">${options([['staff', 'Staff'], ['admin', 'Admin (manage users and settings)']], u?.role || 'staff')}</select></label>
      ${u ? `<label>Status<select name="active">${options([['1', 'Active'], ['0', 'Disabled']], u.active ? '1' : '0')}</select></label>` : ''}
      <label class="full">${u ? 'Reset password (leave blank to keep)' : 'Temporary password (min 8)'}<input name="password" type="text" ${u ? '' : 'required'} minlength="8" autocomplete="off"></label>
      <label class="full check-inline"><input type="checkbox" name="is_exec" ${u?.is_exec ? 'checked' : ''}> Executive: sees the Team page and can open anyone's dashboard</label>
      <label class="full check-inline"><input type="checkbox" name="can_review" ${u?.can_review ? 'checked' : ''}> Runs the 10:30 due diligence review (can approve or pass sites; admins always can)</label>
      <div class="full grid" style="gap:8px">${dutiesFields(u)}</div>
      <fieldset class="checkset full"><legend>Territory: the states they cover. Their milestone work and pings are limited to these (none = every state)</legend>
        ${[...new Set([...CORE_STATES, ...S.meta.statesInUse, ...String(u?.states || '').split(',').filter(Boolean)])].map((st) => `<label><input type="checkbox" name="st_${st}" ${String(u?.states || '').split(',').includes(st) ? 'checked' : ''}> ${st}</label>`).join('')}</fieldset>
      <div class="modal-foot full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${u ? 'Save' : 'Create user'}</button></div>
    </form>`);
  $('[name=title]', card).addEventListener('change', (e) => {
    const pre = TITLE_PRESETS[e.target.value]; if (!pre) return;
    const set = (n, v) => { const el = $(`[name=${n}]`, card); if (el) el.checked = !!v; };
    set('is_exec', pre.is_exec); set('can_review', pre.can_review); set('dd_assessor', pre.dd_assessor); set('grants', pre.grants);
    S.meta.milestones.forEach((m) => set(`ms_${m.id}`, (pre.milestones || []).includes(m.name)));
    if (pre.role) $('[name=role]', card).value = pre.role;
    toast(`Ticked the usual duties for ${e.target.value}. Adjust if needed.`);
  });
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    d.states = Object.keys(d).filter((k) => k.startsWith('st_')).map((k) => k.slice(3));
    d.can_review = !!d.can_review;
    d.is_exec = !!d.is_exec;
    Object.assign(d, readDuties(d));
    Object.keys(d).filter((k) => k.startsWith('st_')).forEach((k) => delete d[k]);
    if (u) { d.active = d.active === '1'; if (!d.password) delete d.password; }
    try {
      u ? await api('PATCH', `/api/users/${u.id}`, d) : await api('POST', '/api/users', d);
      if (u && u.id === S.me.id) S.me = await api('GET', '/api/me');
      await loadMeta(); closeModal(); toast('User saved'); renderAdmin();
    } catch (err) { fail(err); }
  });
}

boot().then(() => { if (!S.me) showLogin(); });
