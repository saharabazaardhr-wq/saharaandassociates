/* Security page: change my password, and (for admins) add users, reset their passwords, change roles, remove access. */
(function () {
  'use strict';
  const A = window.A, U = A.u, esc = U.esc;
  let me = null, users = null, loadErr = '';
  const live = () => !!(A.cloud && A.cloud.enabled() && A.store && A.store.kind === 'server' && A.store.mode === 'cloud');
  const isAdmin = () => me && me.role === 'admin';
  const genPw = () => { const set = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$%'; const a = new Uint32Array(12); crypto.getRandomValues(a); return [...a].map((n) => set[n % set.length]).join(''); };
  const msg = (e) => (e && e.message) || 'Kuch galat hua';

  A.pages.security = function () {
    const head = U.pageHead('Security', 'Login password aur un logon ki list jo ye books khol sakte hain', '');
    if (!A.cloud || !A.cloud.enabled()) return head + U.panel('Login', '<p class="muted">Login aur users sirf live website par hote hain (saharaandassociates.vercel.app).</p>');
    if (!live()) return head + U.panel('Login', '<p class="muted">Abhi aap bina login ke ya server se bina connect hue chal rahe hain. Logout karke login karein, tab ye page chalega.</p>');
    setTimeout(load, 0);
    const pw = '<form id="pwForm" autocomplete="off"><div class="err" id="pwErr" hidden></div><div class="grid g3">'
      + U.field('Abhi ka password', '<input type="password" id="pwCur" autocomplete="current-password" required>')
      + U.field('Naya password', '<input type="password" id="pwNew" autocomplete="new-password" minlength="8" required>', '', 'Kam se kam 8 characters')
      + U.field('Naya password dobara', '<input type="password" id="pwNew2" autocomplete="new-password" required>')
      + '</div><div class="row"><button type="submit" class="btn pri" id="pwGo">Password badlein</button><small class="muted">Login: <b>' + esc(A.cloud.email()) + '</b></small></div></form>'
      + '<div class="note">Agar ye login Sahara Enviro ya Homestay jaise dusre apps me bhi chalta hai, to wahan bhi naya password hi chalega.</div>';
    return head + U.panel('Mera password', pw) + '<div id="secUsersWrap">' + U.panel('Users', '<div class="muted">Loading…</div>') + '</div>';
  };

  async function load() {
    const wrap = document.getElementById('secUsersWrap'); if (!wrap) return;
    const f = document.getElementById('pwForm'); if (f && !f.dataset.bound) { f.dataset.bound = '1'; f.addEventListener('submit', changeMine); }
    try { me = await A.cloud.admin('me'); loadErr = ''; if (isAdmin()) users = (await A.cloud.admin('list')).users; }
    catch (e) { loadErr = msg(e); }
    draw();
  }
  function draw() {
    const wrap = document.getElementById('secUsersWrap'); if (!wrap) return;
    if (loadErr) { wrap.innerHTML = U.panel('Users', '<div class="err">' + esc(loadErr) + '</div><p class="muted">Server function abhi tak chalu nahi ya internet band hai.</p>'); return; }
    if (!isAdmin()) { wrap.innerHTML = U.panel('Users', '<p class="muted">Users sirf admin manage kar sakta hai. Aap ka role: <b>' + esc(me ? me.role : '—') + '</b>.</p>'); return; }
    const rows = (users || []).map((u) => {
      const self = u.email === (A.cloud.email() || '').toLowerCase();
      return '<tr><td>' + esc(u.email) + (self ? ' <small class="muted">(aap)</small>' : '') + '</td><td>' + U.chip(u.role === 'admin' ? 'Admin' : 'User', u.role === 'admin' ? 'good' : '') + '</td><td><small class="muted">' + (u.managed ? 'Yahan se bana' : 'Pehle se maujood account') + '</small></td>'
        + '<td class="n">' + (u.managed ? '<button type="button" class="btn sm" data-act="secReset" data-email="' + esc(u.email) + '">Password reset</button> ' : '')
        + (self ? '' : '<button type="button" class="btn sm" data-act="secRole" data-email="' + esc(u.email) + '" data-role="' + (u.role === 'admin' ? 'user' : 'admin') + '">' + (u.role === 'admin' ? 'Admin hatayein' : 'Admin banayein') + '</button> <button type="button" class="btn sm dng" data-act="secRemove" data-email="' + esc(u.email) + '">Access hatayein</button>') + '</td></tr>';
    }).join('');
    wrap.innerHTML = U.panel('Users jo books khol sakte hain', '<table class="tbl compact"><thead><tr><th>Email</th><th>Role</th><th>Account</th><th class="n">Actions</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<div class="note">Admin naye user bana sakta hai, password reset kar sakta hai aur access hata sakta hai. Access hatane se login account delete nahi hota, sirf in books ka access band hota hai.</div>',
      '<button type="button" class="btn pri sm" data-act="secAdd">＋ Naya user</button>');
  }

  async function changeMine(e) {
    e.preventDefault();
    const err = document.getElementById('pwErr'), go = document.getElementById('pwGo');
    const cur = document.getElementById('pwCur').value, n1 = document.getElementById('pwNew').value, n2 = document.getElementById('pwNew2').value;
    const bad = (t) => { err.textContent = t; err.hidden = false; };
    err.hidden = true;
    if (n1.length < 8) return bad('Naya password kam se kam 8 characters ka rakhein.');
    if (n1 !== n2) return bad('Dono naye password same nahi hain.');
    if (n1 === cur) return bad('Naya password purane se alag rakhein.');
    go.disabled = true; go.textContent = 'Badal raha hai…';
    try { await A.cloud.changePassword(cur, n1); document.getElementById('pwForm').reset(); A.toast('Password badal gaya. Agli baar naye password se login karein.'); }
    catch (x) { bad(msg(x)); }
    go.disabled = false; go.textContent = 'Password badlein';
  }

  const pwField = (id) => U.field('Password', '<div class="row"><input type="text" id="' + id + '" autocomplete="off" minlength="8" required><button type="button" class="btn sm" data-act="secGen" data-for="' + id + '">Generate</button></div>', '', 'Kam se kam 8 characters. Ye user ko bhej dein.');
  A.H.secGen = (el) => { const i = document.getElementById(el.dataset.for); if (i) { i.value = genPw(); i.select(); } };

  A.H.secAdd = () => {
    const ov = A.openModal({ title: 'Naya user', size: 'md',
      body: '<form id="suForm" autocomplete="off"><div class="err" id="suErr" hidden></div><div class="grid g2">'
        + U.field('Email (login ID)', '<input type="email" id="suEmail" required>', 'w2')
        + pwField('suPw') + U.field('Role', '<select id="suRole"><option value="user">User</option><option value="admin">Admin (users manage kar sakta hai)</option></select>')
        + '</div></form>',
      foot: '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="suGo">User banayein</button>' });
    const go = async () => {
      const err = ov.querySelector('#suErr'), b = ov.querySelector('#suGo'); err.hidden = true;
      const email = ov.querySelector('#suEmail').value.trim(), pw = ov.querySelector('#suPw').value;
      if (!email || pw.length < 8) { err.textContent = 'Email aur kam se kam 8 characters ka password daalein.'; err.hidden = false; return; }
      b.disabled = true; b.textContent = 'Ban raha hai…';
      try { const r = await A.cloud.admin('create', { email, password: pw, role: ov.querySelector('#suRole').value }); A.closeModal(); A.toast(r.note || 'User ban gaya'); await load(); }
      catch (x) { err.textContent = msg(x); err.hidden = false; b.disabled = false; b.textContent = 'User banayein'; }
    };
    ov.querySelector('#suGo').addEventListener('click', go);
    ov.querySelector('#suForm').addEventListener('submit', (e) => { e.preventDefault(); go(); });
  };

  A.H.secReset = (el) => {
    const email = el.dataset.email;
    const ov = A.openModal({ title: 'Password reset', size: 'sm',
      body: '<form id="rsForm" autocomplete="off"><p>Naya password: <b>' + esc(email) + '</b></p><div class="err" id="rsErr" hidden></div>' + pwField('rsPw') + '</form>',
      foot: '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="rsGo">Reset karein</button>' });
    const go = async () => {
      const err = ov.querySelector('#rsErr'), b = ov.querySelector('#rsGo'), pw = ov.querySelector('#rsPw').value; err.hidden = true;
      if (pw.length < 8) { err.textContent = 'Password kam se kam 8 characters ka rakhein.'; err.hidden = false; return; }
      b.disabled = true; b.textContent = 'Ho raha hai…';
      try { await A.cloud.admin('password', { email, password: pw }); A.closeModal(); A.toast('Password reset ho gaya'); }
      catch (x) { err.textContent = msg(x); err.hidden = false; b.disabled = false; b.textContent = 'Reset karein'; }
    };
    ov.querySelector('#rsGo').addEventListener('click', go);
    ov.querySelector('#rsForm').addEventListener('submit', (e) => { e.preventDefault(); go(); });
  };

  A.H.secRole = async (el) => {
    try { await A.cloud.admin('role', { email: el.dataset.email, role: el.dataset.role }); A.toast('Role badal gaya'); await load(); } catch (x) { A.toast(msg(x), 'bad'); }
  };
  A.H.secRemove = async (el) => {
    const email = el.dataset.email;
    if (!(await A.confirm('<b>' + esc(email) + '</b> ka access hata dein? Ye in books ko nahi khol payega.', 'Access hatayein', true))) return;
    try { const r = await A.cloud.admin('remove', { email }); A.toast(r.note || 'Access hata diya'); await load(); } catch (x) { A.toast(msg(x), 'bad'); }
  };
})();
