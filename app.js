/* ===== CONFIG: edit these two values ===== */
const CONFIG = {
  SUPABASE_URL: 'https://tosuzdnapxevnzovrmrx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvc3V6ZG5hcHhldm56b3ZybXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4NDQwNjQsImV4cCI6MjExMDQyMDA2NH0.6UPOzE3AO6DQh7WnFpY0-pHHLnRXShgp8H_Mz0KWp_0',
  // Email of the officer account. The admin sign-in only asks for its password.
  ADMIN_EMAIL: 'officer@example.com'
};
/* ============================================ */

const CATEGORIES = ['Agriculture','Infrastructure','Health','Education','Livelihood','Peace and order','Environment','Other'];
const STATUSES = ['Received','Under review','Referred','In progress','Resolved'];
const configured = !CONFIG.SUPABASE_URL.startsWith('YOUR_');
const db = configured ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
let user = null, isAdmin = false;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = d => new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });
const opts = (arr, first) => (first ? `<option value="">${first}</option>` : '') + arr.map(a => `<option>${esc(a)}</option>`).join('');
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.textContent = '', 4000);
}
let lastFocus = null;
function openModal(html) {
  if ($('#modal').hidden) lastFocus = document.activeElement;
  $('#modalBody').innerHTML = html; $('#modal').hidden = false;
  const box = $('#modal .modal-box'), title = $('#modalBody h3');
  if (title) { title.id = 'modalTitle'; box.setAttribute('aria-labelledby', 'modalTitle'); }
  ($('#modalBody input, #modalBody textarea, #modalBody select, #modalBody button') || $('#modalX')).focus();
}
function closeModal() {
  if ($('#modal').hidden) return;
  $('#modal').hidden = true; $('#modalBody').innerHTML = '';
  if (lastFocus?.isConnected) lastFocus.focus();
  lastFocus = null;
}
$('#modalX').onclick = closeModal;
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => {
  const open = $$('.modal:not([hidden])'), top = open[open.length - 1];
  if (e.key === 'Escape') {
    if (top) { top.id === 'modal' ? closeModal() : $('[data-c]', top)?.click(); }
    else if (!$('#adminPanel').hidden) closePanel();
    return;
  }
  if (e.key === 'Tab' && top) {            // keep keyboard focus inside the open dialog
    const f = $$('button, input, select, textarea, a[href]', $('.modal-box', top)).filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], inside = top.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  }
});

async function run(promise) {
  const { data, error } = await promise;
  if (error) { console.error(error); toast('Something went wrong. Check your connection and try again.'); throw error; }
  return data;
}

/* ---------- name prompt (shown before anything is posted) ---------- */
function askName() {
  return new Promise(resolve => {
    const o = document.createElement('div');
    o.className = 'modal'; o.style.zIndex = 70;
    o.innerHTML = `<form class="modal-box" role="dialog" aria-modal="true" aria-labelledby="nameTitle" style="width:min(380px,100%)">
      <h3 id="nameTitle">Who's posting?</h3>
      <p class="fine" style="margin:4px 0 12px">Add your name, or leave it blank to post as Anonymous.</p>
      <input id="nameIn" aria-label="Your name" maxlength="60" placeholder="Your name" autocomplete="name">
      <div class="row" style="margin-top:14px"><button type="button" class="btn-line" data-c>Cancel</button><button class="btn">Post</button></div></form>`;
    document.body.appendChild(o); const prev = document.activeElement;
    const input = $('#nameIn', o); input.value = user?.user_metadata?.full_name || ''; input.focus();
    $('[data-c]', o).onclick = () => { o.remove(); prev?.focus(); resolve(null); };
    $('form', o).onsubmit = e => {
      e.preventDefault();
      const n = input.value.trim(); if (n) store.set('mc_name', n);
      o.remove(); prev?.focus(); resolve(n || 'Anonymous');
    };
  });
}

/* ---------- navigation ---------- */
const TITLES = { voice: 'Community Voice', track: 'Track Submission', polls: 'Community Polls', info: 'Development Information', insights: 'Development Insights', admin: 'Agency Portal' };
function show(name, push = true, focus = true) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $('#homeBtn').hidden = name === 'home' || name === 'admin';
  document.title = (TITLES[name] ? TITLES[name] + ' · ' : '') + 'Mindanao Connect';
  if (push && history.state?.v !== name) { try { history.pushState({ v: name }, '', '#' + name); } catch {} }
  if (focus) {                                   // move keyboard / screen-reader focus to the new page
    window.scrollTo(0, 0);
    const h = $(`#view-${name} h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  if (name === 'voice') loadFeed();
  if (name === 'track') loadMine();
  if (name === 'polls') loadPolls($('#pollList'), false);
  if (name === 'insights') loadInsights();
  if (name === 'admin') loadAdmin();
}
try { history.replaceState({ v: 'home' }, '', location.pathname + location.search); } catch {}
window.addEventListener('popstate', e => {      // browser / phone Back button
  let v = e.state?.v || 'home'; if (v === 'admin' && !isAdmin) v = 'home';
  show(v, false);
});
document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]');
  if (v) { e.preventDefault(); show(v.dataset.view); }
  const a = e.target.closest('[data-action]');
  if (a) openForm(a.dataset.action);
});
$('#searchForm').onsubmit = e => { e.preventDefault(); show('voice'); $('#feedQ').value = $('#searchInput').value; loadFeed(); };

/* ---------- submit concern / idea ---------- */
async function openForm(type) {
  if (!(await requireLogin())) return;
  const isIdea = type === 'idea';
  openModal(`<h3>${isIdea ? 'Share an idea' : 'Submit a concern'}</h3>
    <p class="fine">${isIdea ? 'Propose a project or initiative for your community.' : 'Tell agencies what your community is facing.'}</p>
    <form class="form" id="subForm">
      <label>Title<input name="title" required maxlength="120" placeholder="${isIdea ? 'e.g. Solar-powered irrigation for our barangay' : 'e.g. Farm-to-market road is impassable'}"></label>
      <label>Category<select name="category">${opts(CATEGORIES)}</select></label>
      <label>Location<input name="location" required maxlength="120" placeholder="Barangay, municipality, province"></label>
      <label>Details<textarea name="message" required maxlength="2000" placeholder="What is happening, and who is affected?"></textarea></label>
      <div class="row"><button type="button" class="btn-line" onclick="closeModal()">Cancel</button><button class="btn">Continue</button></div>
    </form>`);
  $('#subForm').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const author = await askName(); if (!author) return;
    const btn = $('#subForm .btn'); btn.disabled = true;
    const ref = 'MC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    try {
      await run(db.from('submissions').insert({ ref_code: ref, type: isIdea ? 'idea' : 'concern', author, status: 'Received', user_id: user.id, ...f }));
    } catch { btn.disabled = false; return; }
    openModal(`<h3>Submitted</h3><p>Thank you, ${esc(author)}. Keep this reference code to track progress:</p>
      <p><span class="code">${ref}</span></p>
      <div class="row"><button class="btn" onclick="closeModal()">Done</button></div>`);
  };
}

/* ---------- cards & feed ---------- */
const card = s => `<button type="button" class="card" data-id="${s.id}">
  <span class="card-top"><span class="grow"><b>${esc(s.title)}</b><span class="meta">${s.type === 'idea' ? 'Idea' : 'Concern'} · ${esc(s.category)} · ${esc(s.location)}</span></span>
  <span class="pill s-${esc(s.status)}"><span class="sr-only">Status: </span>${esc(s.status)}</span></span>
  <span class="msg">${esc(s.message.slice(0, 160))}${s.message.length > 160 ? '…' : ''}</span>
  <span class="meta">by ${esc(s.author)} · ${fmt(s.created_at)} · ${esc(s.ref_code)}</span></button>`;
const bindCards = root => $$('.card[data-id]', root).forEach(c => c.onclick = () => openDetail(c.dataset.id));

async function loadFeed() {
  if (!db) return;
  $('#feedCat').innerHTML = opts(CATEGORIES, 'All categories');
  const box = $('#feed'); box.innerHTML = '<div class="empty">Loading…</div>';
  let q = db.from('submissions').select('*').order('created_at', { ascending: false }).limit(100);
  if ($('#feedType').value) q = q.eq('type', $('#feedType').value);
  if ($('#feedCat').value) q = q.eq('category', $('#feedCat').value);
  const t = $('#feedQ').value.trim().replace(/[%,()]/g, '');
  if (t) q = q.or(`title.ilike.%${t}%,message.ilike.%${t}%,location.ilike.%${t}%`);
  const rows = await run(q).catch(() => []);
  box.innerHTML = rows.length ? rows.map(card).join('') : '<div class="empty">Nothing here yet. Be the first to share a concern or idea.</div>';
  bindCards(box);
}
['feedQ','feedType','feedCat'].forEach(id => $('#' + id).addEventListener(id === 'feedQ' ? 'input' : 'change', () => { clearTimeout(loadFeed.t); loadFeed.t = setTimeout(loadFeed, 250); }));
$('#feedCat').innerHTML = opts(CATEGORIES, 'All categories');

/* ---------- detail + comments ---------- */
async function openDetail(id) {
  const [s] = await run(db.from('submissions').select('*').eq('id', id)).catch(() => []);
  if (!s) return;
  const comments = await run(db.from('comments').select('*').eq('submission_id', id).order('created_at')).catch(() => []);
  const cm = comments.map(c => `<div class="comment ${c.is_official ? 'official' : ''}"><b>${esc(c.author)}${c.is_official ? ' (Agency response)' : ''}</b><small>${fmt(c.created_at)}</small><div>${esc(c.body)}</div></div>`).join('') || '<p class="fine">No responses or feedback yet.</p>';
  const adminBox = isAdmin ? `<h4 style="margin:18px 0 6px">Manage</h4>
    <form class="form" id="admForm">
      <label>Status<select name="status">${opts(STATUSES)}</select></label>
      <label>Category<select name="category">${opts(CATEGORIES)}</select></label>
      <label>Referred agency<input name="agency" value="${esc(s.agency || '')}" placeholder="e.g. DA Region XI"></label>
      <label>Official response (optional)<textarea name="response" placeholder="Update for the citizen"></textarea></label>
      <div class="row"><button type="button" class="btn-danger" id="delBtn">Delete</button><button class="btn">Save changes</button></div>
    </form>` : '';
  openModal(`<h3>${esc(s.title)}</h3>
    <div class="meta">${s.type === 'idea' ? 'Idea' : 'Concern'} · ${esc(s.category)} · ${esc(s.location)} · <span class="code">${esc(s.ref_code)}</span></div>
    <p><span class="pill s-${esc(s.status)}">${esc(s.status)}</span> ${s.agency ? `Referred to <b>${esc(s.agency)}</b>` : ''}</p>
    <p style="white-space:pre-wrap">${esc(s.message)}</p>
    <div class="meta">by ${esc(s.author)} · ${fmt(s.created_at)}</div>
    <h4 style="margin:18px 0 0">Responses and feedback</h4>${cm}
    ${isAdmin ? '' : `<form class="form" id="cmForm"><label>Add feedback<textarea name="body" required maxlength="1000" placeholder="Share an update or your thoughts"></textarea></label>
    <div class="row"><button class="btn">Post feedback</button></div></form>`}${adminBox}`);

  if ($('#cmForm')) $('#cmForm').onsubmit = async e => {
    e.preventDefault();
    const body = new FormData(e.target).get('body').trim(); if (!body) return;
    if (!(await requireLogin())) return;
    const author = await askName(); if (!author) return;
    await run(db.from('comments').insert({ submission_id: id, author, body, is_official: false, user_id: user.id })).catch(() => 0);
    openDetail(id);
  };
  if (isAdmin) {
    $('#admForm [name=status]').value = s.status; $('#admForm [name=category]').value = s.category;
    $('#admForm').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      await run(db.from('submissions').update({ status: f.status, category: f.category, agency: f.agency.trim() || null }).eq('id', id));
      if (f.response.trim()) await run(db.from('comments').insert({ submission_id: id, author: f.agency.trim() || 'MinDA', body: f.response.trim(), is_official: true, user_id: user.id }));
      toast('Changes saved'); closeModal(); loadAdmin();
    };
    $('#delBtn').onclick = async () => {
      if (!confirm('Delete this submission and its comments?')) return;
      await run(db.from('submissions').delete().eq('id', id)); toast('Deleted'); closeModal(); loadAdmin();
    };
  }
}

/* ---------- track ---------- */
$('#trackForm').onsubmit = async e => {
  e.preventDefault();
  const code = $('#trackCode').value.trim().toUpperCase(); if (!code || !db) return;
  const rows = await run(db.from('submissions').select('*').eq('ref_code', code)).catch(() => []);
  const box = $('#trackResult');
  box.innerHTML = rows.length ? card(rows[0]) : '<div class="empty">No submission found for that code. Check it and try again.</div>';
  bindCards(box);
};
async function loadMine() {
  const box = $('#mine');
  if (!db || !user || isAdmin) { box.innerHTML = '<div class="empty">Sign in to see everything you have submitted.</div>'; return; }
  const rows = await run(db.from('submissions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })).catch(() => []);
  if (!rows.length) { box.innerHTML = '<div class="empty">You have not submitted anything yet.</div>'; return; }
  box.innerHTML = rows.map(card).join(''); bindCards(box);
}

/* ---------- polls ---------- */
async function loadPolls(box, admin) {
  if (!db) return;
  const polls = await run(db.from('polls').select('*').order('created_at', { ascending: false })).catch(() => []);
  const votes = await run(db.from('poll_votes').select('poll_id,option_index')).catch(() => []);
  const mine = {};
  if (user && !isAdmin) (await run(db.from('poll_votes').select('poll_id,option_index').eq('user_id', user.id)).catch(() => [])).forEach(v => mine[v.poll_id] = v.option_index);
  box.innerHTML = polls.length ? polls.map(p => {
    const v = votes.filter(x => x.poll_id === p.id), total = v.length || 1;
    const canVote = p.active && mine[p.id] === undefined && !admin && !isAdmin;
    const rows = p.options.map((o, i) => {
      const n = v.filter(x => x.option_index === i).length, pct = Math.round(n / total * 100);
      const inner = `<i aria-hidden="true" style="width:${pct}%"></i><span><span>${esc(o)}${mine[p.id] === i ? ' ✓<span class="sr-only"> (your vote)</span>' : ''}</span><span>${n} ${n === 1 ? 'vote' : 'votes'} · ${pct}%</span></span>`;
      return canVote ? `<button type="button" class="bar" data-p="${p.id}" data-i="${i}">${inner}</button>` : `<div class="bar">${inner}</div>`;
    }).join('');
    return `<div class="card"><div class="card-top"><h3 class="q">${esc(p.question)}</h3>${admin ? `<button class="btn-line" data-toggle="${p.id}" data-a="${p.active}">${p.active ? 'Close' : 'Reopen'}</button>` : (p.active ? '' : '<span class="pill">Closed</span>')}</div>${rows}</div>`;
  }).join('') : '<div class="empty">No polls yet.</div>';
  $$('button.bar', box).forEach(b => b.onclick = async () => {
    if (!(await requireLogin())) return;
    const ok = await run(db.from('poll_votes').insert({ poll_id: b.dataset.p, option_index: +b.dataset.i, user_id: user.id })).then(() => true).catch(() => false);
    if (ok) toast('Vote recorded'); loadPolls(box, admin);
  });
  $$('[data-toggle]', box).forEach(b => b.onclick = async () => {
    await run(db.from('polls').update({ active: b.dataset.a !== 'true' }).eq('id', b.dataset.toggle)); loadPolls(box, true);
  });
}

/* ---------- insights ---------- */
async function loadInsights() {
  if (!db) return;
  const rows = await run(db.from('submissions').select('category,status,location')).catch(() => []);
  const el = $('#insights');
  if (!rows.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
  const tally = key => Object.entries(rows.reduce((m, r) => (m[r[key]] = (m[r[key]] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  const bars = list => list.map(([k, n]) => `<div class="bar"><i aria-hidden="true" style="width:${n / rows.length * 100}%"></i><span><span>${esc(k)}</span><span>${n}</span></span></div>`).join('');
  el.innerHTML = `<div class="card"><b>Submissions by category</b>${bars(tally('category'))}</div>
    <div class="card" style="margin-top:10px"><b>Submissions by status</b>${bars(tally('status'))}</div>`;
}

/* ---------- admin portal ---------- */
async function requireLogin() {
  if (user && !isAdmin) return true;
  if (isAdmin) toast('Exit the admin portal to post as a citizen.'); else openAuth();
  return false;
}
function openAuth(mode = 'in') {
  const up = mode === 'up';
  openModal(`<h3>${up ? 'Create your account' : 'Sign in'}</h3>
    <p class="fine">${up ? 'Use your email to post concerns, ideas, feedback, and votes.' : 'Sign in to post, vote, and track your submissions.'}</p>
    <form class="form" id="authForm">
      ${up ? '<label>Name<input name="name" maxlength="60" autocomplete="name"></label>' : ''}
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Password<input name="password" type="password" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}"></label>
      <p class="err" id="authErr" role="alert" hidden></p>
      <div class="row"><button type="button" class="btn-line" id="authSwap">${up ? 'I have an account' : 'Create account'}</button><button class="btn">${up ? 'Create account' : 'Sign in'}</button></div>
    </form>`);
  $('#authSwap').onclick = () => openAuth(up ? 'in' : 'up');
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const res = up ? await db.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: (f.name || '').trim() } } })
                   : await db.auth.signInWithPassword({ email: f.email, password: f.password });
    if (res.error) { $('#authErr').textContent = res.error.message; $('#authErr').hidden = false; return; }
    if (up && !res.data.session) { openModal(`<h3>Check your email</h3><p>We sent a confirmation link to ${esc(f.email)}. Confirm it, then sign in.</p><div class="row"><button class="btn" onclick="openAuth()">Sign in</button></div>`); return; }
    closeModal(); toast('Signed in');
  };
}
function syncAuthUI() {
  const name = (user?.user_metadata?.full_name || user?.email || '').split(/[ @]/)[0];
  $('#adminToggle').textContent = isAdmin ? 'Exit admin' : 'Admin portal';
  $('#authBtn').hidden = isAdmin;
  $('#authBtn').textContent = user ? `Sign out (${name})` : 'Sign in';
  const active = $('.view.active')?.id.slice(5);
  if (!isAdmin && active === 'admin') show('home');
  else if (['voice', 'track', 'polls'].includes(active)) show(active, false, false);
}
$('#authBtn').onclick = () => user ? db.auth.signOut() : openAuth();
const closePanel = () => { $('#adminPanel').hidden = true; $('#adminToggle').focus(); };
$('#adminToggle').onclick = () => {
  if (isAdmin) { db.auth.signOut(); return; }
  const p = $('#adminPanel');
  if (!p.hidden) return closePanel();
  p.hidden = false; $('#adminErr').hidden = true; $('#adminPass').value = ''; $('#adminPass').focus();
};
$('#adminCancel').onclick = closePanel;
$('#adminForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('#adminForm .btn'); btn.disabled = true;
  // Signing in as the officer replaces any citizen session, which signs the citizen out.
  const { data, error } = await db.auth.signInWithPassword({ email: CONFIG.ADMIN_EMAIL, password: $('#adminPass').value });
  btn.disabled = false; $('#adminPass').value = '';
  if (error || data.user.app_metadata?.role !== 'admin') {
    if (!error) await db.auth.signOut();
    $('#adminErr').hidden = false; $('#adminPass').focus(); return;
  }
  $('#adminPanel').hidden = true; show('admin'); toast('Signed in to the admin portal');
};
$('#exitAdmin').onclick = () => db.auth.signOut();

async function loadAdmin() {
  if (!db) return;
  $('#admStatus').innerHTML ||= opts(STATUSES, 'All statuses');
  $('#admCat').innerHTML ||= opts(CATEGORIES, 'All categories');
  const all = await run(db.from('submissions').select('*').order('created_at', { ascending: false })).catch(() => []);
  const n = s => all.filter(r => r.status === s).length;
  $('#adminStats').innerHTML = [['Total', all.length], ['Received', n('Received')], ['Referred', n('Referred')], ['In progress', n('In progress')], ['Resolved', n('Resolved')]]
    .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  const t = $('#admQ').value.trim().toLowerCase(), st = $('#admStatus').value, ct = $('#admCat').value;
  const rows = all.filter(r => (!st || r.status === st) && (!ct || r.category === ct) && (!t || (r.title + r.message + r.location + r.author + r.ref_code).toLowerCase().includes(t)));
  $('#admRows').innerHTML = rows.map(r => `<tr data-id="${r.id}"><td><button type="button" class="link-btn code" aria-label="Review ${esc(r.ref_code)}: ${esc(r.title)}">${esc(r.ref_code)}</button></td><td>${r.type}</td><td>${esc(r.title)}</td><td>${esc(r.category)}</td><td>${esc(r.location)}</td><td><span class="pill s-${esc(r.status)}">${esc(r.status)}</span></td><td>${esc(r.agency || '—')}</td><td>${fmt(r.created_at)}</td></tr>`).join('')
    || '<tr><td colspan="8" class="empty">No submissions match.</td></tr>';
  $$('#admRows tr[data-id]').forEach(tr => tr.onclick = () => openDetail(tr.dataset.id));
  loadPolls($('#admPolls'), true);
}
['admQ','admStatus','admCat'].forEach(id => $('#' + id).addEventListener(id === 'admQ' ? 'input' : 'change', loadAdmin));
$('#pollForm').onsubmit = async e => {
  e.preventDefault();
  const options = $('#pollOpts').value.split(',').map(s => s.trim()).filter(Boolean);
  if (options.length < 2) return toast('Add at least two options, separated by commas.');
  await run(db.from('polls').insert({ question: $('#pollQ').value.trim(), options, active: true }));
  e.target.reset(); toast('Poll created'); loadPolls($('#admPolls'), true);
};

if (!configured) $('#configNotice').hidden = false;
if (db) {
  const apply = u => { user = u; isAdmin = !!u && u.app_metadata?.role === 'admin'; syncAuthUI(); };
  db.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
  db.auth.onAuthStateChange((_e, s) => apply(s?.user ?? null));
}
