/* Sahara & Associates: server database (Supabase) for the live website.
   Login with e-mail + password, then the books are read and written through the REST API.
   Exposes the same small document interface as the Claude artifact database, so store.js can use either. */
(function () {
  'use strict';
  const A = window.A = window.A || {};
  const CFG = A.cloudConfig = Object.assign({
    url: 'https://bthjvebqdfqecgifseeo.supabase.co',
    key: 'sb_publishable_OMadOYfzDmUs-z9bLr1BPw_tOQ2dJhA',
    table: 'sa_docs',
  }, window.SA_CONFIG || {});
  const SKEY = 'sahara-sb-session', EKEY = 'sahara-sb-email';
  const PAGE = 1000, CHUNK = 150;

  // The Claude artifact has its own database; the server is only for the real website.
  const enabled = () => !window.claude && !!CFG.url && !!CFG.key;

  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

  let sess = lsGet(SKEY);
  let refreshing = null;

  function fail(msg, code) { const e = new Error(msg); if (code) e.code = code; return e; }

  async function raw(url, opt) {
    let res;
    try { res = await fetch(url, opt); } catch (e) { throw fail('Server se connect nahi ho paya (internet check karein)', 'unavailable'); }
    return res;
  }
  async function bodyOf(res) { const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch (e) { return t; } }
  function msgOf(b, res) { return (b && (b.msg || b.message || b.error_description || b.error)) || ('Server error ' + res.status); }

  function keep(j, email) {
    sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)), email: email || (j.user && j.user.email) || (sess && sess.email) || '' };
    lsSet(SKEY, sess);
    return sess;
  }

  async function refresh() {
    if (!sess || !sess.refresh_token) throw fail('Session khatam ho gaya, dobara login karein', 'auth');
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const res = await raw(CFG.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sess.refresh_token }) });
      const b = await bodyOf(res);
      if (!res.ok) { if (res.status >= 500) throw fail(msgOf(b, res), 'unavailable'); sess = null; lsDel(SKEY); throw fail('Session khatam ho gaya, dobara login karein', 'auth'); }
      return keep(b);
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }

  async function token() {
    if (!sess) throw fail('Login nahi hai', 'auth');
    if (sess.expires_at - Math.floor(Date.now() / 1000) < 90) await refresh();
    return sess.access_token;
  }

  /** Authenticated REST call. Retries once after refreshing an expired token. */
  async function rest(path, opt, again) {
    const o = Object.assign({}, opt); o.headers = Object.assign({ apikey: CFG.key, Authorization: 'Bearer ' + (await token()) }, o.headers || {});
    const res = await raw(CFG.url + '/rest/v1/' + path, o);
    if (res.status === 401 && !again) { await refresh(); return rest(path, opt, true); }
    const b = await bodyOf(res);
    if (!res.ok) throw fail(msgOf(b, res), res.status >= 500 ? 'unavailable' : (res.status === 401 ? 'auth' : 'rest'));
    return b;
  }

  const T = () => CFG.table;
  const q = (s) => encodeURIComponent(s);
  const nowIso = () => new Date().toISOString();

  function docRef(coll, id) {
    return {
      async get() {
        const rows = await rest(T() + '?select=data&coll=eq.' + q(coll) + '&id=eq.' + q(id) + '&limit=1');
        return { exists: !!(rows && rows.length), data: () => (rows && rows[0] ? rows[0].data : undefined) };
      },
      async set(obj) {
        await rest(T() + '?on_conflict=coll,id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ coll, id, data: obj, updated_at: nowIso() }]) });
      },
      async delete() { await rest(T() + '?coll=eq.' + q(coll) + '&id=eq.' + q(id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
    };
  }

  /** Same shape as the artifact database: base.get/set, base.collection(name).get()/doc(id). */
  function makeBase() {
    const b = docRef('meta', 'books');
    b.collection = (name) => ({
      doc: (id) => docRef(name, id),
      async get() {
        const out = [];
        for (let off = 0; ; off += PAGE) {
          const rows = await rest(T() + '?select=data&coll=eq.' + q(name) + '&order=id.asc&limit=' + PAGE + '&offset=' + off);
          rows.forEach((r) => out.push({ data: () => r.data }));
          if (rows.length < PAGE) break;
        }
        return { docs: out };
      },
    });
    /** Write many documents of one collection in a few requests. items: [{id, data}] */
    b.bulkSet = async (name, items) => {
      for (let i = 0; i < items.length; i += CHUNK) {
        const part = items.slice(i, i + CHUNK).map((x) => ({ coll: name, id: x.id, data: x.data, updated_at: nowIso() }));
        await rest(T() + '?on_conflict=coll,id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(part) });
      }
    };
    b.bulkDelete = async (name, ids) => {
      for (let i = 0; i < ids.length; i += 60) {
        const part = ids.slice(i, i + 60).map((x) => '"' + String(x).replace(/"/g, '') + '"').join(',');
        await rest(T() + '?coll=eq.' + q(name) + '&id=in.(' + q(part) + ')', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      }
    };
    return b;
  }

  async function allowed() {
    try { const r = await rest('rpc/sa_is_allowed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return r === true; } catch (e) { if (e.code === 'unavailable') throw e; return false; }
  }

  async function signIn(email, password) {
    const res = await raw(CFG.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const b = await bodyOf(res);
    if (!res.ok) throw fail(res.status === 400 ? 'Email ya password galat hai' : msgOf(b, res), res.status >= 500 ? 'unavailable' : 'auth');
    keep(b, email);
    if (!(await allowed())) { sess = null; lsDel(SKEY); throw fail('Is account ko Sahara & Associates ka access nahi mila hai', 'denied'); }
    lsSet(EKEY, email);
    return sess;
  }

  function signOut() { sess = null; lsDel(SKEY); }

  // ---------- login screen ----------
  function loginScreen() {
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.id = 'loginOv'; ov.className = 'loginov';
      ov.innerHTML = '<form class="logincard" autocomplete="on">' +
        '<h2>Sahara &amp; Associates</h2><p class="muted">Apne books kholne ke liye login karein</p>' +
        '<label>Email<input type="email" name="email" autocomplete="username" required></label>' +
        '<label>Password<input type="password" name="password" autocomplete="current-password" required></label>' +
        '<div class="note bad" id="loginErr" hidden></div>' +
        '<button type="submit" class="btn pri" id="loginGo">Login</button>' +
        '<button type="button" class="linkbtn" id="loginSkip">Bina login (sirf is browser me)</button>' +
        '</form>';
      document.body.appendChild(ov);
      const f = ov.querySelector('form'), err = ov.querySelector('#loginErr'), go = ov.querySelector('#loginGo');
      f.email.value = lsGet(EKEY) || '';
      (f.email.value ? f.password : f.email).focus();
      const done = (v) => { ov.remove(); resolve(v); };
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); err.hidden = true; go.disabled = true; go.textContent = 'Login ho raha hai…';
        try { await signIn(f.email.value.trim(), f.password.value); done(true); }
        catch (x) { err.textContent = x.message; err.hidden = false; go.disabled = false; go.textContent = 'Login'; f.password.focus(); }
      });
      ov.querySelector('#loginSkip').addEventListener('click', () => done(false));
    });
  }

  A.cloud = {
    enabled,
    email: () => (sess && sess.email) || '',
    hasSession: () => !!sess,
    signOut,
    base: makeBase,
    /** Resolves to a document base when signed in, or null when the person continues without login. */
    async connect() {
      if (!enabled()) return null;
      if (sess) {
        try { await token(); if (await allowed()) return makeBase(); signOut(); }
        catch (e) { if (e.code === 'unavailable') throw e; signOut(); }
      }
      return (await loginScreen()) ? makeBase() : null;
    },
  };
})();
