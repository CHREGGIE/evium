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
const stageBadge = (name, color) => `<span class="badge"><span class="dot" style="background:${esc(color)}"></span>${esc(name || '—')}</span>`;
const options = (list, sel, { blank, fmt = label } = {}) =>
  (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  list.map((v) => { const [val, txt] = Array.isArray(v) ? v : [v, fmt(v)]; return `<option value="${esc(val)}" ${String(val) === String(sel ?? '') ? 'selected' : ''}>${esc(txt)}</option>`; }).join('');
const userOptions = (sel, blank = 'Unassigned') => options(S.meta.users.filter((u) => u.active || String(u.id) === String(sel)).map((u) => [u.id, u.name]), sel, { blank });
const stageOptions = (sel) => options(S.meta.stages.map((s) => [s.id, s.name]), sel);
const isStale = (p) => p.days_in_stage > p.stale_days && ['active', 'on_hold', 'blocked'].includes(p.status);

async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(url, opt);
  if (res.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Please sign in'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
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
$('#logout').addEventListener('click', async () => { await api('POST', '/api/logout').catch(() => {}); S.me = null; showLogin(); });
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
  $('#meName').textContent = `${S.me.name}${S.me.role === 'admin' ? ' · admin' : ''}`;
  $$('.admin-only').forEach((el) => el.classList.toggle('hidden', S.me.role !== 'admin'));
  route();
}

// ---------- router ----------
window.addEventListener('hashchange', route);
async function route() {
  if (!S.me) return;
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0].split('/');
  const [page, id] = parts;
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
  if (!$('#modal').classList.contains('hidden')) { modalClose = null; closeModal(); }
  try {
    if (page === 'dashboard') await renderDashboard();
    else if (page === 'pipeline') await renderPipeline();
    else if (page === 'projects' && id) await renderProject(id);
    else if (page === 'projects') await renderProjects();
    else if (page === 'tickets') { await renderTickets(); if (id) openTicket(id, () => { history.replaceState(null, '', '#/tickets'); renderTickets(); }); }
    else if (page === 'admin' && S.me.role === 'admin') await renderAdmin();
    else location.hash = '#/dashboard';
  } catch (e) { view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');

// ---------- dashboard ----------
async function renderDashboard() {
  const d = await api('GET', '/api/dashboard');
  const t = d.totals;
  const max = Math.max(1, ...d.stages.map((s) => s.count));
  view.innerHTML = `
    <div class="page-head"><h1>Dashboard</h1><div class="actions"><button class="btn primary" id="newProject">+ New project</button></div></div>
    <div class="kpis">
      <div class="card kpi"><div class="l">Open projects</div><div class="v">${num(t.open_projects)}</div></div>
      <div class="card kpi"><div class="l">Pipeline value</div><div class="v">${money(t.pipeline_value)}</div></div>
      <div class="card kpi"><div class="l">Ports in pipeline</div><div class="v">${num(t.pipeline_chargers)}</div></div>
      <div class="card kpi"><div class="l">Ports live</div><div class="v">${num(t.live_chargers)}</div></div>
      <div class="card kpi"><div class="l">On hold / blocked</div><div class="v">${num(t.on_hold)} / ${num(t.blocked)}</div></div>
      <div class="card kpi"><div class="l">Open tickets</div><div class="v">${num(t.open_tickets)} ${t.overdue_tickets ? `<span class="small stale">${t.overdue_tickets} overdue</span>` : ''}</div></div>
    </div>
    <div class="cols-main">
      <div class="grid" style="gap:16px">
        <div class="card"><h2>Funnel — where projects are holding</h2>
          <div class="funnel">${d.stages.map((s) => `
            <div class="funnel-row" data-stage="${s.id}" title="View projects in ${esc(s.name)}">
              <div>${esc(s.name)}</div>
              <div class="bar-track"><div class="bar" style="width:${(s.count / max) * 100}%;background:${esc(s.color)}">${s.count || ''}</div></div>
              <div class="muted small" style="text-align:right">${money(s.value)}</div>
            </div>`).join('')}</div>
        </div>
        <div class="card"><h2>Needs attention <span class="muted small">— past stage SLA, on hold or blocked</span></h2>
          ${d.stalled.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Project</th><th>Stage</th><th>Days in stage</th><th>Status</th><th>Owner</th></tr></thead><tbody>
          ${d.stalled.map((p) => `<tr class="clickable" data-href="#/projects/${p.id}">
            <td><b>${esc(p.name)}</b><div class="muted small">${esc(p.code)} · ${esc(p.customer_name || '')}</div></td>
            <td>${stageBadge(p.stage_name, p.stage_color)}</td>
            <td class="${p.days_in_stage > p.stale_days ? 'stale' : ''}">${p.days_in_stage}d <span class="muted small">/ ${p.stale_days}d</span></td>
            <td>${statusBadge(p.status)}${p.hold_reason ? `<div class="muted small">${esc(p.hold_reason)}</div>` : ''}</td>
            <td>${esc(p.owner_name || '—')}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">Nothing stalled. 🎉</div>'}
        </div>
      </div>
      <div class="grid" style="gap:16px">
        <div class="card"><h2>My open tickets</h2>
          ${d.myTickets.length ? `<div class="feed">${d.myTickets.map((x) => `<div class="feed-item"><a href="#/tickets/${x.id}"><b>#${x.id} ${esc(x.title)}</b></a>
            <div class="muted small">${esc(x.code)} · ${esc(x.project_name)}</div>
            <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${ticketBadge(x.status)} ${prioBadge(x.priority)} ${x.due_date ? `<span class="small ${x.due_date < today() ? 'stale' : 'muted'}">due ${fdate(x.due_date)}</span>` : ''}</div></div>`).join('')}</div>`
          : '<div class="empty">No tickets assigned to you.</div>'}
        </div>
        <div class="card"><h2>Recent activity</h2><div class="feed">${d.recent.map(activityItem).join('') || '<div class="empty">No activity yet.</div>'}</div></div>
      </div>
    </div>`;
  $('#newProject').onclick = () => projectForm();
  $$('.funnel-row', view).forEach((r) => (r.onclick = () => (location.hash = `#/projects?stage_id=${r.dataset.stage}`)));
  bindRowLinks();
}

function activityItem(a) {
  const icons = { project_created: '🆕', stage_changed: '➡️', status_changed: '🚦', project_updated: '✏️', ticket_created: '🎫', ticket_updated: '🎫', ticket_deleted: '🗑️', documents_uploaded: '📎', document_deleted: '🗑️', note: '📝' };
  const proj = a.project_name ? ` <a href="#/projects/${a.project_id}">${esc(a.code)}</a>` : '';
  const body = a.action === 'note' ? `<div class="note">${esc(a.detail)}</div>` : `<span>${esc(a.detail || '')}</span>`;
  return `<div class="feed-item">${icons[a.action] || '•'} <b>${esc(a.user_name || 'System')}</b> <span class="muted">${esc(label(a.action))}</span>${proj}
    <span class="muted small"> · ${ago(a.created_at)}</span><div>${body}</div></div>`;
}

function bindRowLinks(root = view) {
  $$('tr[data-href]', root).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button,select,input')) location.hash = tr.dataset.href; }));
}

// ---------- pipeline (kanban) ----------
async function renderPipeline() {
  const params = new URLSearchParams({ status: qs().get('status') || 'open' });
  if (qs().get('owner_id')) params.set('owner_id', qs().get('owner_id'));
  const projects = await api('GET', `/api/projects?${params}`);
  const by = {}; S.meta.stages.forEach((s) => (by[s.id] = []));
  projects.forEach((p) => by[p.stage_id]?.push(p));
  view.innerHTML = `
    <div class="page-head"><h1>Pipeline</h1>
      <div class="actions">
        <select id="pStatus">${options([['open', 'Open (active/hold/blocked)'], ['active', 'Active'], ['on_hold', 'On hold'], ['blocked', 'Blocked'], ['won', 'Won'], ['', 'All statuses']], params.get('status'))}</select>
        <select id="pOwner">${options(S.meta.users.map((u) => [u.id, u.name]), params.get('owner_id'), { blank: 'All owners' })}</select>
        <button class="btn primary" id="newProject">+ New project</button>
      </div></div>
    <p class="muted small" style="margin-top:-8px">Drag a card to another column to move it through the funnel. Red edge = past the stage SLA; amber = on hold.</p>
    <div class="board">${S.meta.stages.map((s) => {
      const list = by[s.id] || [];
      const value = list.reduce((a, p) => a + (p.estimated_value || 0), 0);
      return `<div class="column" data-stage="${s.id}">
        <div class="column-head" style="border-color:${esc(s.color)}"><span>${esc(s.name)} <span class="sub">${list.length}</span></span><span class="sub">${value ? money(value) : ''}</span></div>
        <div class="column-body">${list.map(pcard).join('')}</div></div>`;
    }).join('')}</div>`;
  const reload = () => {
    const p = new URLSearchParams(); p.set('status', $('#pStatus').value);
    if ($('#pOwner').value) p.set('owner_id', $('#pOwner').value);
    location.hash = `#/pipeline?${p}`;
  };
  $('#pStatus').onchange = reload; $('#pOwner').onchange = reload;
  $('#newProject').onclick = () => projectForm();

  let dragId = null;
  $$('.pcard', view).forEach((c) => {
    c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; });
    c.addEventListener('click', () => (location.hash = `#/projects/${c.dataset.id}`));
  });
  $$('.column', view).forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const p = projects.find((x) => String(x.id) === dragId);
      if (p && String(p.stage_id) !== col.dataset.stage) stageModal(p, Number(col.dataset.stage), renderPipeline);
    });
  });
}

function pcard(p) {
  const cls = isStale(p) ? 'is-stale' : ['on_hold', 'blocked'].includes(p.status) ? 'is-hold' : '';
  return `<div class="pcard ${cls}" draggable="true" data-id="${p.id}">
    <div class="t">${esc(p.name)}</div>
    <div class="muted small">${esc(p.code)}${p.customer_name ? ` · ${esc(p.customer_name)}` : ''}${p.city ? ` · ${esc(p.city)}` : ''}</div>
    <div class="meta"><span>${p.charger_count ? `${p.charger_count}× ${esc(p.charger_type || 'ports')}` : ''}</span><span>${p.estimated_value ? money(p.estimated_value) : ''}</span></div>
    <div class="meta"><span class="${isStale(p) ? 'stale' : ''}">${p.days_in_stage}d in stage</span>
      <span>${p.status !== 'active' ? statusBadge(p.status) : ''} ${p.open_tickets ? `🎫 ${p.open_tickets}` : ''}</span></div>
    ${p.owner_name ? `<div class="meta"><span>👤 ${esc(p.owner_name)}</span></div>` : ''}
  </div>`;
}

function stageModal(p, toStageId, after) {
  const card = openModal(`${modalHead('Move project stage')}
    <p><b>${esc(p.name)}</b> <span class="muted">(${esc(p.code)})</span></p>
    <form class="grid">
      <label>New stage<select name="stage_id">${stageOptions(toStageId || p.stage_id)}</select></label>
      <label>Note (optional) — why is it moving / what's next?<textarea name="note" placeholder="e.g. Utility approved make-ready design, install crew booked for 3/12"></textarea></label>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Move</button></div>
    </form>`);
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', `/api/projects/${p.id}/stage`, formData(e.target)); modalClose = null; closeModal(); toast('Stage updated'); after?.(); } catch (err) { fail(err); }
  });
}

// ---------- projects list ----------
async function renderProjects() {
  const q = qs();
  const f = { q: q.get('q') || '', stage_id: q.get('stage_id') || '', status: q.get('status') ?? 'open', owner_id: q.get('owner_id') || '', priority: q.get('priority') || '' };
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const rows = await api('GET', `/api/projects?${params}`);
  view.innerHTML = `
    <div class="page-head"><h1>Projects <span class="muted small">${rows.length}</span></h1>
      <div class="actions"><a class="btn" href="/api/projects.csv">Export CSV</a><button class="btn primary" id="newProject">+ New project</button></div></div>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="Search name, code, customer, city…" value="${esc(f.q)}">
      <select name="stage_id">${options(S.meta.stages.map((s) => [s.id, s.name]), f.stage_id, { blank: 'All stages' })}</select>
      <select name="status">${options([['open', 'Open'], ...S.meta.enums.projectStatus.map((s) => [s, label(s)])], f.status, { blank: 'All statuses' })}</select>
      <select name="owner_id">${options(S.meta.users.map((u) => [u.id, u.name]), f.owner_id, { blank: 'All owners' })}</select>
      <select name="priority">${options(S.meta.enums.priority, f.priority, { blank: 'Any priority' })}</select>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Project</th><th>Customer</th><th>Stage</th><th>In stage</th><th>Status</th><th>Ports</th><th>Value</th><th>Owner</th><th>Tickets</th><th>Target live</th></tr></thead>
    <tbody>${rows.map((p) => `<tr class="clickable" data-href="#/projects/${p.id}">
      <td><b>${esc(p.name)}</b><div class="muted small">${esc(p.code)}${p.city ? ` · ${esc(p.city)}${p.state ? ', ' + esc(p.state) : ''}` : ''}</div></td>
      <td>${esc(p.customer_name || '—')}</td>
      <td>${stageBadge(p.stage_name, p.stage_color)}</td>
      <td class="${isStale(p) ? 'stale' : ''}">${p.days_in_stage}d</td>
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

function projectForm(p = null) {
  const e = S.meta.enums; const v = p || { status: 'active', priority: 'medium', owner_id: S.me.id };
  const card = openModal(`${modalHead(p ? `Edit ${esc(p.code)}` : 'New project')}
    <form class="form-grid">
      <label class="full">Project / site name *<input name="name" required value="${esc(v.name)}" placeholder="e.g. Riverside Plaza – Level 2 garage"></label>
      ${p ? '' : `<label>Starting stage<select name="stage_id">${stageOptions(S.meta.stages[0]?.id)}</select></label>`}
      <label>Status<select name="status">${options(e.projectStatus, v.status)}</select></label>
      <label>Priority<select name="priority">${options(e.priority, v.priority)}</select></label>
      <label>Owner<select name="owner_id">${userOptions(v.owner_id)}</select></label>
      <label class="full">Hold / blocker reason<input name="hold_reason" value="${esc(v.hold_reason)}" placeholder="Shown when status is on hold or blocked"></label>
      <h3 class="full" style="margin:6px 0 0">Customer (no login required)</h3>
      <label>Customer / company<input name="customer_name" value="${esc(v.customer_name)}"></label>
      <label>Contact name<input name="contact_name" value="${esc(v.contact_name)}"></label>
      <label>Contact email<input name="contact_email" type="email" value="${esc(v.contact_email)}"></label>
      <label>Contact phone<input name="contact_phone" value="${esc(v.contact_phone)}"></label>
      <h3 class="full" style="margin:6px 0 0">Site</h3>
      <label class="full">Address<input name="address" value="${esc(v.address)}"></label>
      <label>City<input name="city" value="${esc(v.city)}"></label>
      <label>State<input name="state" value="${esc(v.state)}"></label>
      <label>ZIP<input name="zip" value="${esc(v.zip)}"></label>
      <label>Site type<select name="site_type">${options(e.siteType, v.site_type, { blank: '—' })}</select></label>
      <h3 class="full" style="margin:6px 0 0">Charging scope</h3>
      <label>Charger type<select name="charger_type">${options(e.chargerType, v.charger_type, { blank: '—', fmt: (x) => x })}</select></label>
      <label>Number of ports<input name="charger_count" type="number" min="0" value="${esc(v.charger_count)}"></label>
      <label>Total power (kW)<input name="power_kw" type="number" min="0" step="any" value="${esc(v.power_kw)}"></label>
      <label>Estimated value (USD)<input name="estimated_value" type="number" min="0" step="any" value="${esc(v.estimated_value)}"></label>
      <label>Target live date<input name="target_live_date" type="date" value="${esc(v.target_live_date)}"></label>
      <label class="full">Description / scope notes<textarea name="description">${esc(v.description)}</textarea></label>
      <div class="modal-foot full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${p ? 'Save changes' : 'Create project'}</button></div>
    </form>`, { wide: true });
  $('form', card).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const data = formData(ev.target);
      const saved = p ? await api('PATCH', `/api/projects/${p.id}`, data) : await api('POST', '/api/projects', data);
      modalClose = null; closeModal(); toast(p ? 'Project saved' : `Created ${saved.code}`);
      if (p) route(); else location.hash = `#/projects/${saved.id}`;
    } catch (err) { fail(err); }
  });
}

// ---------- project detail ----------
let projectTab = 'tickets';
async function renderProject(id) {
  const p = await api('GET', `/api/projects/${id}`);
  const cur = S.meta.stages.findIndex((s) => s.id === p.stage_id);
  view.innerHTML = `
    <div class="page-head">
      <div><div class="muted small"><a href="#/projects">Projects</a> / ${esc(p.code)}</div>
        <h1>${esc(p.name)}</h1>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">${stageBadge(p.stage_name, p.stage_color)} ${statusBadge(p.status)} ${prioBadge(p.priority)}
          <span class="small ${isStale(p) ? 'stale' : 'muted'}">${p.days_in_stage} days in stage${isStale(p) ? ` (SLA ${p.stale_days}d)` : ''}</span></div>
        ${p.hold_reason && p.status !== 'active' ? `<div class="small" style="margin-top:6px;color:var(--warn)"><b>Hold reason:</b> ${esc(p.hold_reason)}</div>` : ''}
      </div>
      <div class="actions">
        <select id="quickStatus" title="Status">${options(S.meta.enums.projectStatus, p.status)}</select>
        <button class="btn" id="moveStage">Move stage</button>
        <button class="btn" id="editProject">Edit</button>
        ${S.me.role === 'admin' ? '<button class="btn danger" id="delProject">Delete</button>' : ''}
      </div>
    </div>
    <div class="card" style="padding:10px 12px"><div class="stepper">${S.meta.stages.map((s, i) =>
      `<button class="step ${i < cur ? 'done' : i === cur ? 'current' : ''}" data-stage="${s.id}" title="Move to ${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div></div>
    <div class="cols-main" style="margin-top:16px">
      <div>
        <div class="tabs" style="margin-top:0">${['tickets', 'documents', 'timeline', 'activity'].map((t) => `<button class="tab ${projectTab === t ? 'active' : ''}" data-tab="${t}">${label(t)}${t === 'tickets' && p.open_tickets ? ` (${p.open_tickets})` : ''}${t === 'documents' && p.doc_count ? ` (${p.doc_count})` : ''}</button>`).join('')}</div>
        <div id="tabBody"></div>
      </div>
      <div class="grid" style="gap:16px">
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
  $('#moveStage').onclick = () => stageModal(p, null, route);
  $$('.step', view).forEach((b) => (b.onclick = () => { if (Number(b.dataset.stage) !== p.stage_id) stageModal(p, Number(b.dataset.stage), route); }));
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
    ({ tickets: tabTickets, documents: tabDocuments, timeline: tabTimeline, activity: tabActivity })[t](p);
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
      <td>${badge('', label(d.category))}</td>
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
  const h = p.history;
  const items = h.map((x, i) => {
    const end = h[i + 1]?.changed_at;
    const days = Math.max(0, Math.round(((end ? toDate(end) : new Date()) - toDate(x.changed_at)) / 86400000));
    return `<li><span class="dot" style="background:${esc(x.to_color || '#94a3b8')}"></span><div>
      <b>${esc(x.to_name || '(deleted stage)')}</b> <span class="muted small">· ${days} day${days === 1 ? '' : 's'}${end ? '' : ' so far'}</span>
      <div class="muted small">${fdatetime(x.changed_at)} by ${esc(x.user_name || '—')}${x.from_name ? ` · from ${esc(x.from_name)}` : ''}</div>
      ${x.note ? `<div class="note small" style="white-space:pre-wrap;background:#f8fafc;border-radius:8px;padding:6px 8px;margin-top:4px">${esc(x.note)}</div>` : ''}</div></li>`;
  }).reverse();
  const total = Math.round((Date.now() - toDate(p.created_at)) / 86400000);
  $('#tabBody').innerHTML = `<div class="card"><h2>Stage timeline <span class="muted small">— ${total} days since created</span></h2><ul class="timeline">${items.join('')}</ul></div>`;
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
  const stages = S.meta.stages.map((s) => ({ ...s }));
  view.innerHTML = `
    <div class="page-head"><h1>Admin</h1></div>
    <div class="cols-2">
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Staff users</h2><button class="btn primary sm" id="addUser">+ Add user</button></div>
        <p class="muted small">Only Evium staff sign in. Customers are stored as contacts on each project and never need an account.</p>
        <div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr><td><b>${esc(u.name)}</b><div class="muted small">${esc(u.email)}</div></td><td>${esc(label(u.role))}</td>
          <td>${u.active ? badge('s-active', 'Active') : badge('s-cancelled', 'Disabled')}</td>
          <td style="text-align:right"><button class="btn sm" data-edituser="${u.id}">Edit</button></td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><h2>Funnel stages</h2>
        <p class="muted small">Order = funnel order. <b>SLA days</b> flags projects holding too long in a stage. Mark the final stage(s) as “closed / live”.</p>
        <div id="stageList" class="grid" style="gap:6px"></div>
        <div style="display:flex;justify-content:space-between;margin-top:12px"><button class="btn sm" id="addStage">+ Add stage</button><button class="btn primary sm" id="saveStages">Save funnel</button></div>
      </div>
    </div>`;
  const drawStages = () => {
    $('#stageList').innerHTML = stages.map((s, i) => `<div style="display:grid;grid-template-columns:36px 1fr 74px 40px auto auto;gap:6px;align-items:center" data-i="${i}">
      <input type="color" value="${esc(s.color)}" data-k="color" style="padding:2px;height:34px">
      <input value="${esc(s.name)}" data-k="name" placeholder="Stage name">
      <input type="number" min="1" value="${esc(s.stale_days)}" data-k="stale_days" title="SLA days before flagged">
      <input type="checkbox" ${s.is_closed ? 'checked' : ''} data-k="is_closed" title="Closed / live stage" style="width:18px">
      <span style="display:flex;gap:2px"><button class="btn sm" data-mv="-1" title="Move up">↑</button><button class="btn sm" data-mv="1" title="Move down">↓</button></span>
      <button class="btn sm danger" data-rm title="Remove">✕</button></div>`).join('');
    $$('#stageList [data-i]').forEach((row) => {
      const i = Number(row.dataset.i);
      $$('[data-k]', row).forEach((inp) => inp.addEventListener('input', () => { stages[i][inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; }));
      $$('[data-mv]', row).forEach((b) => (b.onclick = () => { const j = i + Number(b.dataset.mv); if (j < 0 || j >= stages.length) return; [stages[i], stages[j]] = [stages[j], stages[i]]; drawStages(); }));
      $('[data-rm]', row).onclick = () => { stages.splice(i, 1); drawStages(); };
    });
  };
  drawStages();
  $('#addStage').onclick = () => { stages.push({ name: '', color: '#64748b', stale_days: 14, is_closed: 0 }); drawStages(); };
  $('#saveStages').onclick = async () => {
    try { await api('PUT', '/api/stages', stages); await loadMeta(); toast('Funnel saved'); renderAdmin(); } catch (err) { fail(err); }
  };
  $('#addUser').onclick = () => userForm();
  $$('[data-edituser]').forEach((b) => (b.onclick = () => userForm(users.find((u) => String(u.id) === b.dataset.edituser))));
}

function userForm(u = null) {
  const card = openModal(`${modalHead(u ? 'Edit user' : 'Add staff user')}
    <form class="form-grid">
      <label>Name<input name="name" required value="${esc(u?.name)}"></label>
      <label>Email<input name="email" type="email" required value="${esc(u?.email)}"></label>
      <label>Role<select name="role">${options(['staff', 'admin'], u?.role || 'staff')}</select></label>
      ${u ? `<label>Status<select name="active">${options([['1', 'Active'], ['0', 'Disabled']], u.active ? '1' : '0')}</select></label>` : ''}
      <label class="full">${u ? 'Reset password (leave blank to keep)' : 'Temporary password (min 8)'}<input name="password" type="text" ${u ? '' : 'required'} minlength="8" autocomplete="off"></label>
      <div class="modal-foot full"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${u ? 'Save' : 'Create user'}</button></div>
    </form>`);
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (u) { d.active = d.active === '1'; if (!d.password) delete d.password; }
    try { u ? await api('PATCH', `/api/users/${u.id}`, d) : await api('POST', '/api/users', d); await loadMeta(); closeModal(); toast('User saved'); renderAdmin(); } catch (err) { fail(err); }
  });
}

boot().then(() => { if (!S.me) showLogin(); });
