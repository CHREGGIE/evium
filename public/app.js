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
const DD_CHECKS = [['property_owner', 'Property owner'], ['rebate_program', 'Rebate'], ['utility_company', 'Utility company']];
const ddMissing = (p) => DD_CHECKS.filter(([k]) => !String(p[k] ?? '').trim());
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
const msStrip = (p, { names = true } = {}) => `<span class="ms-strip">${S.meta.milestones.map((m, i) => {
  const x = p.milestones?.[i] || { status: 'not_started' };
  return `<span class="ms ms-${x.status}${x.overdue ? ' ms-overdue' : ''}" title="${esc(m.name)}: ${MS_LABEL[x.status]}${msWhen(x) ? ` (${esc(msWhen(x))})` : ''}">${MS_ICON[x.status]}${names ? ` ${esc(m.name)}` : ''}</span>`;
}).join('')}</span>`;
const progressBadge = (p) => (p.phase === 'diligence' ? phaseBadge() : p.ms_complete ? badge('ms-live', '✓ Live') : badge('', `${p.ms_done}/${p.ms_total} done`));
const isFlagged = (p) => p.ms_overdue > 0 && OPEN_STATUSES.includes(p.status);
// full editor: each milestone with a 4-way switch
const msEditor = (p) => `<div class="ms-editor">${S.meta.milestones.map((m, i) => {
  const x = p.milestones[i];
  return `<div class="ms-row ${x.overdue ? 'ms-overdue' : ''}">
    <div class="ms-name"><span class="dot" style="background:${esc(m.color)}"></span><b>${esc(m.name)}</b><span class="small ${x.overdue ? 'stale' : 'muted'}">${esc(msWhen(x))}</span></div>
    <div class="seg" role="group" aria-label="${esc(m.name)}">${MS_STATUSES.map((s) => `<button type="button" class="${x.status === s ? `on is-${s}` : ''}" data-ms="${m.id}" data-pid="${p.id}" data-st="${s}" aria-pressed="${x.status === s}">${MS_LABEL[s]}</button>`).join('')}</div>
  </div>`;
}).join('')}</div>`;
function bindMsEditor(root, after) {
  $$('[data-ms]', root).forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    if (b.classList.contains('on')) return;
    try {
      const saved = await api('PUT', `/api/projects/${b.dataset.pid}/milestones/${b.dataset.ms}`, { status: b.dataset.st });
      toast(saved.ms_complete ? `${saved.code}: all milestones finished 🎉` : 'Milestone updated');
      after(saved);
    } catch (err) { fail(err); }
  }));
}

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
  const total = Math.max(1, ...d.milestones.map((m) => m.done + m.in_progress + m.not_started));
  view.innerHTML = `
    <div class="page-head"><h1>Dashboard</h1><div class="actions"><button class="btn primary" id="newProject">+ New property</button></div></div>
    <div class="kpis">
      <a class="card kpi" href="#/diligence"><div class="l">In due diligence</div><div class="v">${num(t.in_diligence)}</div></a>
      <a class="card kpi" href="#/pipeline"><div class="l">Projects in progress</div><div class="v">${num(t.open_projects)}</div></a>
      <div class="card kpi"><div class="l">Pipeline value</div><div class="v">${money(t.pipeline_value)}</div></div>
      <div class="card kpi"><div class="l">Ports in pipeline</div><div class="v">${num(t.pipeline_chargers)}</div></div>
      <div class="card kpi"><div class="l">Live</div><div class="v">${num(t.live_projects)} <span class="small muted">${num(t.live_chargers)} ports</span></div></div>
      <div class="card kpi"><div class="l">Open tickets</div><div class="v">${num(t.open_tickets)} ${t.overdue_tickets ? `<span class="small stale">${t.overdue_tickets} overdue</span>` : ''}</div></div>
    </div>
    <div class="cols-main">
      <div class="grid" style="gap:16px">
        <div class="card"><h2>Milestones across open projects</h2>
          <p class="muted small" style="margin-top:-6px">Projects work on several milestones at once. Click a milestone to see who still needs it.</p>
          <div class="funnel">${d.milestones.map((m) => {
            const w = (n) => `${(n / total) * 100}%`;
            return `<div class="funnel-row ms-funnel" data-mid="${m.id}" title="Projects still needing ${esc(m.name)}">
              <div><span class="dot" style="background:${esc(m.color)}"></span> ${esc(m.name)}</div>
              <div class="bar-track stack">
                <div class="seg-done" style="width:${w(m.done)}">${m.done || ''}</div>
                <div class="seg-prog" style="width:${w(m.in_progress)}">${m.in_progress || ''}</div>
                <div class="seg-todo" style="width:${w(m.not_started)}">${m.not_started || ''}</div>
              </div>
              <div class="small" style="text-align:right">${m.overdue ? `<span class="stale">${m.overdue} late</span>` : `<span class="muted">${m.not_needed ? `${m.not_needed} n/a` : ''}</span>`}</div>
            </div>`;
          }).join('')}</div>
          <div class="legend small muted"><span><i class="seg-done"></i>Done</span><span><i class="seg-prog"></i>In progress</span><span><i class="seg-todo"></i>Not started</span></div>
        </div>
        <div class="card"><h2>Needs attention <span class="muted small">— a milestone running past its target, on hold or blocked</span></h2>
          ${d.stalled.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Project</th><th>Milestones</th><th>Status</th><th>Owner</th></tr></thead><tbody>
          ${d.stalled.map((p) => `<tr class="clickable" data-href="#/projects/${p.id}">
            <td><b>${esc(p.address || p.name)}</b><div class="muted small">${esc(p.code)} · ${esc(p.name)}</div></td>
            <td>${msStrip(p, { names: false })}
              <div class="small stale">${p.milestones.map((x, i) => (x.overdue ? `${esc(S.meta.milestones[i].name)} ${x.days_open}d` : '')).filter(Boolean).join(' · ')}</div></td>
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
  $$('.ms-funnel', view).forEach((r) => (r.onclick = () => (location.hash = `#/pipeline?milestone_id=${r.dataset.mid}&ms_status=todo`)));
  bindRowLinks();
}

function activityItem(a) {
  const icons = { milestone_updated: '🏁', moved_to_pipeline: '✅', project_created: '🆕', stage_changed: '➡️', status_changed: '🚦', project_updated: '✏️', ticket_created: '🎫', ticket_updated: '🎫', ticket_deleted: '🗑️', documents_uploaded: '📎', document_deleted: '🗑️', note: '📝' };
  const proj = a.project_name ? ` <a href="#/projects/${a.project_id}">${esc(a.code)}</a>` : '';
  const body = a.action === 'note' ? `<div class="note">${esc(a.detail)}</div>` : `<span>${esc(a.detail || '')}</span>`;
  return `<div class="feed-item">${icons[a.action] || '•'} <b>${esc(a.user_name || 'System')}</b> <span class="muted">${esc(label(a.action))}</span>${proj}
    <span class="muted small"> · ${ago(a.created_at)}</span><div>${body}</div></div>`;
}

function bindRowLinks(root = view) {
  $$('tr[data-href]', root).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button,select,input')) location.hash = tr.dataset.href; }));
}

// ---------- due diligence ----------
async function renderDiligence() {
  const q = qs();
  const f = { q: q.get('q') || '', state: q.get('state') || '', status: q.get('status') ?? 'open' };
  const params = new URLSearchParams({ phase: 'diligence', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const rows = await api('GET', `/api/projects?${params}`);
  const ready = rows.filter((p) => !ddMissing(p).length).length;
  view.innerHTML = `
    <div class="page-head"><h1>Due Diligence <span class="muted small">${rows.length}</span></h1>
      <div class="actions"><button class="btn primary" id="newProperty">+ New property</button></div></div>
    <p class="muted small" style="margin-top:-8px">New properties start here. Fill in the property owner, the rebate the site qualifies for and the utility company, then move it to the pipeline.
      ${rows.length ? `<b>${ready} of ${rows.length}</b> ready to move.` : ''}</p>
    <form class="filters" id="ddFilters">
      <input type="search" name="q" placeholder="Search name, address, owner, utility…" value="${esc(f.q)}">
      <select name="state">${options(US_STATES.map(([c, n]) => [c, `${c} · ${n}`]), f.state, { blank: 'All states' })}</select>
      <select name="status">${options([['open', 'Open'], ...S.meta.enums.projectStatus.map((s) => [s, label(s)])], f.status, { blank: 'All statuses' })}</select>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Property</th><th>State</th><th>Property owner</th><th>Rebate</th><th>Utility</th><th>Checklist</th><th>In due diligence</th><th></th></tr></thead>
    <tbody>${rows.map((p) => {
      const missing = ddMissing(p);
      return `<tr class="clickable" data-href="#/projects/${p.id}">
      <td><b>${esc(p.name)}</b><div class="muted small">${esc(p.code)}${p.address || p.city ? ` · ${esc([p.address, p.city].filter(Boolean).join(', '))}` : ''}</div></td>
      <td>${p.state ? `<b>${esc(p.state)}</b>` : '<span class="muted">—</span>'}</td>
      <td>${esc(p.property_owner || '—')}${p.property_owner_contact ? `<div class="muted small">${esc(p.property_owner_contact)}</div>` : ''}</td>
      <td>${esc(p.rebate_program || '—')}${p.rebate_amount ? `<div class="muted small">${money(p.rebate_amount)}</div>` : ''}</td>
      <td>${esc(p.utility_company || '—')}</td>
      <td><div class="checks">${DD_CHECKS.map(([k, t]) => `<span class="chk ${String(p[k] ?? '').trim() ? 'ok' : ''}" title="${esc(t)}">${String(p[k] ?? '').trim() ? '✓' : '○'} ${esc(t)}</span>`).join('')}</div></td>
      <td class="muted">${p.days_in_phase}d</td>
      <td style="text-align:right">${missing.length
        ? `<button class="btn sm" data-edit="${p.id}">Fill in details</button>`
        : `<button class="btn sm primary" data-promote="${p.id}">Move to pipeline →</button>`}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">No properties in due diligence. Click <b>+ New property</b> to add one.</td></tr>'}</tbody></table></div>`;
  const form = $('#ddFilters');
  const apply = () => { const p = new URLSearchParams(); Object.entries(formData(form)).forEach(([k, v]) => p.set(k, v)); location.hash = `#/diligence?${p}`; };
  $$('select', form).forEach((s) => (s.onchange = apply));
  let t; $('input[name=q]', form).addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 350); });
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  $('#newProperty').onclick = () => projectForm(null, { phase: 'diligence' });
  const byId = (id) => rows.find((x) => String(x.id) === id);
  $$('[data-promote]', view).forEach((b) => (b.onclick = () => promoteModal(byId(b.dataset.promote), renderDiligence)));
  $$('[data-edit]', view).forEach((b) => (b.onclick = () => projectForm(byId(b.dataset.edit))));
  bindRowLinks();
  const qi = $('input[name=q]', form); if (f.q) { qi.focus(); qi.setSelectionRange(f.q.length, f.q.length); }
}

function promoteModal(p, after) {
  const missing = ddMissing(p);
  if (missing.length) {
    const card = openModal(`${modalHead('Due diligence not finished')}
      <p><b>${esc(p.name)}</b> <span class="muted">(${esc(p.code)})</span> still needs:</p>
      <ul>${missing.map(([, t]) => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" id="fillIn">Fill in details</button></div>`);
    $('#fillIn', card).onclick = () => { modalClose = null; closeModal(); projectForm(p); };
    return;
  }
  const card = openModal(`${modalHead('Move to pipeline')}
    <p><b>${esc(p.name)}</b> <span class="muted">(${esc(p.code)}${p.state ? ` · ${esc(stateName(p.state))}` : ''})</span></p>
    <dl class="kv" style="margin-bottom:14px"><dt>Property owner</dt><dd>${esc(p.property_owner)}</dd>
      <dt>Rebate</dt><dd>${esc(p.rebate_program)}${p.rebate_amount ? ` · ${money(p.rebate_amount)}` : ''}</dd>
      <dt>Utility</dt><dd>${esc(p.utility_company)}</dd></dl>
    ${p.state ? '' : '<p class="small" style="color:var(--warn)">No state is set, so it will show under "No state" in the pipeline. Edit the property to add one.</p>'}
    <form class="grid">
      <div><div class="small" style="font-weight:600;color:#334155;margin-bottom:6px">Anything already under way? (you can change these any time)</div>
        <div class="ms-pick">${S.meta.milestones.map((m) => `<label class="ms-pick-row"><span><span class="dot" style="background:${esc(m.color)}"></span> ${esc(m.name)}</span>
          <select name="ms_${m.id}">${options(MS_STATUSES.map((s) => [s, MS_LABEL[s]]), 'not_started')}</select></label>`).join('')}</div></div>
      <label>Note (optional)<textarea name="note" placeholder="e.g. Owner signed LOI, utility confirmed capacity"></textarea></label>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Move to pipeline</button></div>
    </form>`);
  $('form', card).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target); const milestones = {};
    S.meta.milestones.forEach((m) => { if (f[`ms_${m.id}`] && f[`ms_${m.id}`] !== 'not_started') milestones[m.id] = f[`ms_${m.id}`]; });
    try {
      const saved = await api('POST', `/api/projects/${p.id}/promote`, { note: f.note, milestones });
      modalClose = null; closeModal(); toast(`${saved.code} moved to the pipeline`); after?.();
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
  const all = await api('GET', `/api/projects?${params}`);
  const keyOf = (p) => (p.state || '').toUpperCase() || 'none';
  const groups = {};
  all.forEach((p) => (groups[keyOf(p)] ||= []).push(p));
  // within a state: unfinished first, most milestones done first, live projects last
  Object.values(groups).forEach((l) => l.sort((a, b) => a.ms_complete - b.ms_complete || (b.ms_done / (b.ms_total || 1)) - (a.ms_done / (a.ms_total || 1))));
  const keys = Object.keys(groups).sort((a, b) => (a === 'none') - (b === 'none') || stateName(a).localeCompare(stateName(b)));
  const shown = stateSel ? keys.filter((k) => k === stateSel) : keys;
  const collapsed = getCollapsed();
  const sum = (list, f) => list.reduce((a, p) => a + (p[f] || 0), 0);

  const row = (p) => {
    const open = openRows.has(p.id);
    const line1 = p.address || p.name;
    const line2 = [[p.city, p.state].filter(Boolean).join(', '), p.address ? p.name : '', p.code].filter(Boolean).join(' · ');
    const cls = isFlagged(p) ? 'is-stale' : ['on_hold', 'blocked'].includes(p.status) ? 'is-hold' : '';
    return `<div class="prow ${cls} ${open ? 'open' : ''}">
      <button class="prow-main" type="button" data-row="${p.id}" aria-expanded="${open}">
        <span class="prow-addr"><b>${esc(line1)}</b><span class="muted small">${esc(line2)}</span></span>
        ${msStrip(p)}
        <span class="prow-prog">${progressBadge(p)}</span>
        <span class="prow-extra small">${p.status !== 'active' ? statusBadge(p.status) : ''}${p.estimated_value ? `<span class="muted">${money(p.estimated_value)}</span>` : ''}</span>
        <span class="caret muted">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="prow-detail">
        ${msEditor(p)}
        <div class="prow-facts small">
          <span>${p.customer_name ? esc(p.customer_name) : '<span class="muted">No customer</span>'}</span>
          ${p.charger_count ? `<span>${p.charger_count}× ${esc(p.charger_type || 'ports')}</span>` : ''}
          ${p.owner_name ? `<span>👤 ${esc(p.owner_name)}</span>` : ''}
          ${p.open_tickets ? `<span>🎫 ${p.open_tickets} open</span>` : ''}
          ${p.hold_reason && p.status !== 'active' ? `<span style="color:var(--warn)">${esc(p.hold_reason)}</span>` : ''}
          <a class="btn sm" href="#/projects/${p.id}">Open project →</a>
        </div>
      </div>` : ''}
    </div>`;
  };

  const lane = (k) => {
    const list = groups[k] || [];
    const isOpen = stateSel || !collapsed.has(k);
    return `<section class="lane ${isOpen ? '' : 'collapsed'}">
      <button class="lane-head" type="button" data-toggle="${esc(k)}">
        <span class="caret">${isOpen ? '▾' : '▸'}</span>
        <span class="lane-title">${k === 'none' ? 'No state set' : `${esc(stateName(k))} <span class="muted">${esc(k)}</span>`}</span>
        <span class="sub">${list.length} project${list.length === 1 ? '' : 's'} · ${num(sum(list, 'charger_count'))} ports · ${money(sum(list, 'estimated_value'))}</span>
      </button>
      ${isOpen ? `<div class="prows">${list.map(row).join('')}</div>` : ''}
    </section>`;
  };

  const msOpts = S.meta.milestones.map((m) => [m.id, m.name]);
  view.innerHTML = `
    <div class="page-head"><h1>Pipeline <span class="muted small">${all.length}</span></h1>
      <div class="actions"><a class="btn" href="#/diligence">Due diligence →</a></div></div>
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
    <p class="muted small">Milestones can be finished in any order. ✓ done · ● in progress · ○ not started · – not needed. Click a row to update its milestones. A red edge means a milestone is running past its target.</p>
    ${shown.map(lane).join('') || `<div class="card empty">${stateSel ? 'No projects in this state.' : 'No projects match. Finish due diligence on a property to move it here.'}</div>`}`;

  const form = $('#pFilters');
  const go = (over = {}) => {
    const p = new URLSearchParams();
    Object.entries(formData(form)).forEach(([k, v]) => { if (v || k === 'status') p.set(k, v); });
    if (!p.get('milestone_id')) p.delete('ms_status');
    const st = 'state' in over ? over.state : stateSel; if (st) p.set('state', st);
    location.hash = `#/pipeline?${p}`;
  };
  $$('select', form).forEach((s) => (s.onchange = () => go()));
  $$('.chip', view).forEach((c) => (c.onclick = () => go({ state: c.dataset.state })));
  $$('[data-toggle]', view).forEach((b) => (b.onclick = () => {
    if (stateSel) return; // a single selected state always stays open
    const set = getCollapsed(); const k = b.dataset.toggle;
    set.has(k) ? set.delete(k) : set.add(k); setCollapsed(set); renderPipeline();
  }));
  $$('[data-row]', view).forEach((b) => (b.onclick = () => {
    const id = Number(b.dataset.row); openRows.has(id) ? openRows.delete(id) : openRows.add(id); renderPipeline();
  }));
  bindMsEditor(view, () => renderPipeline());
}

// ---------- projects list ----------
async function renderProjects() {
  const q = qs();
  const f = { q: q.get('q') || '', phase: q.get('phase') || '', state: q.get('state') || '', progress: q.get('progress') || '', status: q.get('status') ?? 'open', owner_id: q.get('owner_id') || '', priority: q.get('priority') || '' };
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const rows = await api('GET', `/api/projects?${params}`);
  view.innerHTML = `
    <div class="page-head"><h1>Projects <span class="muted small">${rows.length}</span></h1>
      <div class="actions"><a class="btn" href="/api/projects.csv">Export CSV</a><button class="btn primary" id="newProject">+ New property</button></div></div>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="Search name, code, customer, city…" value="${esc(f.q)}">
      <select name="phase">${options([['diligence', 'Due diligence'], ['pipeline', 'Pipeline']], f.phase, { blank: 'Diligence + pipeline' })}</select>
      <select name="progress">${options([['incomplete', 'Still in progress'], ['complete', 'Live (all done)'], ['overdue', 'Running late']], f.progress, { blank: 'Any progress' })}</select>
      <select name="state">${options(US_STATES.map(([c, n]) => [c, `${c} · ${n}`]), f.state, { blank: 'All states' })}</select>
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
  const e = S.meta.enums; const v = p || { status: 'active', priority: 'medium', owner_id: S.me.id };
  const isDD = p ? p.phase === 'diligence' : phase === 'diligence';
  const startOpts = [['dd', 'Due diligence (recommended)'], ['pipeline', 'Pipeline (skip due diligence)']];
  const ddSection = `<h3 class="full" style="margin:6px 0 0">Due diligence <span class="muted small" style="font-weight:500">— owner, rebate and utility are needed before moving to the pipeline</span></h3>
      <label>Property owner${isDD ? ' *' : ''}<input name="property_owner" value="${esc(v.property_owner)}" placeholder="Who owns the property"></label>
      <label>Owner contact<input name="property_owner_contact" value="${esc(v.property_owner_contact)}" placeholder="Phone or email"></label>
      <label>Utility company${isDD ? ' *' : ''}<input name="utility_company" value="${esc(v.utility_company)}" placeholder="e.g. Austin Energy"></label>
      <label>Rebate the site qualifies for${isDD ? ' *' : ''}<input name="rebate_program" value="${esc(v.rebate_program)}" placeholder="Program name, or &quot;None&quot;"></label>
      <label>Rebate amount (USD)<input name="rebate_amount" type="number" min="0" step="any" value="${esc(v.rebate_amount)}"></label>
      <label class="full">Due diligence notes<textarea name="diligence_notes" placeholder="Anything found while checking the site">${esc(v.diligence_notes)}</textarea></label>`;
  const card = openModal(`${modalHead(p ? `Edit ${esc(p.code)}` : isDD ? 'New property' : 'New project')}
    <form class="form-grid">
      <label class="full">Project / site name *<input name="name" required value="${esc(v.name)}" placeholder="e.g. Riverside Plaza – Level 2 garage"></label>
      ${p ? '' : `<label>Start in<select name="start">${options(startOpts, isDD ? 'dd' : 'pipeline')}</select></label>`}
      <label>Status<select name="status">${options(e.projectStatus, v.status)}</select></label>
      <label>Priority<select name="priority">${options(e.priority, v.priority)}</select></label>
      <label>Owner<select name="owner_id">${userOptions(v.owner_id)}</select></label>
      <label class="full">Hold / blocker reason<input name="hold_reason" value="${esc(v.hold_reason)}" placeholder="Shown when status is on hold or blocked"></label>
      ${isDD ? ddSection : ''}
      <h3 class="full" style="margin:6px 0 0">Customer (no login required)</h3>
      <label>Customer / company<input name="customer_name" value="${esc(v.customer_name)}"></label>
      <label>Contact name<input name="contact_name" value="${esc(v.contact_name)}"></label>
      <label>Contact email<input name="contact_email" type="email" value="${esc(v.contact_email)}"></label>
      <label>Contact phone<input name="contact_phone" value="${esc(v.contact_phone)}"></label>
      <h3 class="full" style="margin:6px 0 0">Site</h3>
      <label class="full">Address<input name="address" value="${esc(v.address)}"></label>
      <label>City<input name="city" value="${esc(v.city)}"></label>
      <label>State<select name="state">${stateOptions(v.state)}</select></label>
      <label>ZIP<input name="zip" value="${esc(v.zip)}"></label>
      <label>Site type<select name="site_type">${options(e.siteType, v.site_type, { blank: '—' })}</select></label>
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
  $('form', card).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const data = formData(ev.target);
      if (!p) { data.phase = data.start === 'dd' ? 'diligence' : 'pipeline'; delete data.start; }
      const saved = p ? await api('PATCH', `/api/projects/${p.id}`, data) : await api('POST', '/api/projects', data);
      modalClose = null; closeModal(); toast(p ? 'Project saved' : saved.phase === 'diligence' ? `Added ${saved.code} to due diligence` : `Created ${saved.code}`);
      if (p) route(); else location.hash = `#/projects/${saved.id}`;
    } catch (err) { fail(err); }
  });
}

// ---------- project detail ----------
let projectTab = 'tickets';
async function renderProject(id) {
  const p = await api('GET', `/api/projects/${id}`);
  const dd = p.phase === 'diligence';
  const missing = ddMissing(p);
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
        ${dd ? `<button class="btn ${missing.length ? '' : 'primary'}" id="promote">Move to pipeline →</button>` : ''}
        <button class="btn" id="editProject">Edit</button>
        ${S.me.role === 'admin' ? '<button class="btn danger" id="delProject">Delete</button>' : ''}
      </div>
    </div>
    ${dd ? `<div class="card dd-card"><h2 style="margin-bottom:8px">Due diligence checklist</h2>
      <div class="checks big">${DD_CHECKS.map(([k, t]) => `<span class="chk ${String(p[k] ?? '').trim() ? 'ok' : ''}">${String(p[k] ?? '').trim() ? '✓' : '○'} ${esc(t)}${String(p[k] ?? '').trim() ? `: <b>${esc(p[k])}</b>` : ''}</span>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">${missing.length ? `Still needed: ${missing.map(([, t]) => esc(t)).join(', ')}. Click <b>Edit</b> to fill them in.` : 'All checks done. Click <b>Move to pipeline</b> to start tracking milestones.'}</div></div>`
    : `<div class="card"><h2 style="margin-bottom:4px">Milestones <span class="muted small">— ${p.ms_complete ? 'all done, this site is live 🎉' : `${p.ms_done} of ${p.ms_total} done · finish them in any order`}</span></h2>${msEditor(p)}</div>`}
    <div class="cols-main" style="margin-top:16px">
      <div>
        <div class="tabs" style="margin-top:0">${['tickets', 'documents', 'timeline', 'activity'].map((t) => `<button class="tab ${projectTab === t ? 'active' : ''}" data-tab="${t}">${label(t)}${t === 'tickets' && p.open_tickets ? ` (${p.open_tickets})` : ''}${t === 'documents' && p.doc_count ? ` (${p.doc_count})` : ''}</button>`).join('')}</div>
        <div id="tabBody"></div>
      </div>
      <div class="grid" style="gap:16px">
        <div class="card"><h2>Due diligence</h2><dl class="kv">
          <dt>Property owner</dt><dd>${esc(p.property_owner || '—')}</dd>
          <dt>Owner contact</dt><dd>${esc(p.property_owner_contact || '—')}</dd>
          <dt>Rebate</dt><dd>${esc(p.rebate_program || '—')}${p.rebate_amount ? ` · ${money(p.rebate_amount)}` : ''}</dd>
          <dt>Utility</dt><dd>${esc(p.utility_company || '—')}</dd>
          ${p.diligence_completed_at ? `<dt>Completed</dt><dd>${fdate(p.diligence_completed_at)}</dd>` : ''}
        </dl>${p.diligence_notes ? `<h3 style="margin-top:14px">Notes</h3><div style="white-space:pre-wrap">${esc(p.diligence_notes)}</div>` : ''}</div>
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
  $('#promote')?.addEventListener('click', () => promoteModal(p, route));
  bindMsEditor(view, () => route());
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
        <div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr><td><b>${esc(u.name)}</b><div class="muted small">${esc(u.email)}</div></td><td>${esc(label(u.role))}</td>
          <td>${u.active ? badge('s-active', 'Active') : badge('s-cancelled', 'Disabled')}</td>
          <td style="text-align:right"><button class="btn sm" data-edituser="${u.id}">Edit</button></td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><h2>Milestones</h2>
        <p class="muted small">Every project tracks each of these, in any order, and can mark any of them “not needed”. The order is just how they're displayed.
          <b>Target days</b> is how long a milestone can be in progress before it's flagged as running late.</p>
        <div class="ms-admin-head small muted"><span>Colour</span><span>Name</span><span>Target days</span><span></span><span></span></div>
        <div id="msList" class="grid" style="gap:6px"></div>
        <div style="display:flex;justify-content:space-between;margin-top:12px"><button class="btn sm" id="addMs">+ Add milestone</button><button class="btn primary sm" id="saveMs">Save milestones</button></div>
      </div>
    </div>`;
  const draw = () => {
    $('#msList').innerHTML = list.map((m, i) => `<div class="ms-admin-row" data-i="${i}">
      <input type="color" value="${esc(m.color)}" data-k="color" style="padding:2px;height:34px" aria-label="Colour">
      <input value="${esc(m.name)}" data-k="name" placeholder="Milestone name" aria-label="Name">
      <input type="number" min="1" value="${esc(m.sla_days)}" data-k="sla_days" aria-label="Target days">
      <span style="display:flex;gap:2px"><button class="btn sm" data-mv="-1" title="Move up">↑</button><button class="btn sm" data-mv="1" title="Move down">↓</button></span>
      <button class="btn sm danger" data-rm title="Remove">✕</button></div>`).join('');
    $$('#msList [data-i]').forEach((row) => {
      const i = Number(row.dataset.i);
      $$('[data-k]', row).forEach((inp) => inp.addEventListener('input', () => { list[i][inp.dataset.k] = inp.value; }));
      $$('[data-mv]', row).forEach((b) => (b.onclick = () => { const j = i + Number(b.dataset.mv); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; draw(); }));
      $('[data-rm]', row).onclick = () => { list.splice(i, 1); draw(); };
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
