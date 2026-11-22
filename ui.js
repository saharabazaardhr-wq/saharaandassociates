/* UI core: helpers, shell, router, pages. */
(function () {
  'use strict';
  const E = window.Engine, { r2, num } = E;
  const A = window.A = window.A || {};
  A.S = null; A.idx = null; A.H = {}; A.pages = {}; A.forms = {};
  A.ui = { fy: null, flt: {}, led: { key: null, from: null, to: null }, tax: 'reg', partyQ: '', partyT: 'all', dayType: 'all' };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IN = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = (n) => { n = r2(n); return IN.format(Math.abs(n) < 0.005 ? 0 : n); };
  const dc = (bal) => (Math.abs(bal) < 0.005 ? '0.00' : fmt(Math.abs(bal)) + '<span class="dc">' + (bal > 0 ? 'Dr' : 'Cr') + '</span>');
  const short = (n) => { const a = Math.abs(n), s = n < 0 ? '-' : ''; return a >= 1e7 ? s + (a / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? s + (a / 1e5).toFixed(2) + ' L' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + ' K' : s + Math.round(a); };
  const fdate = (iso) => (iso ? +iso.slice(8, 10) + ' ' + E.MONTHS[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4) : '');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + E.pad(d.getMonth() + 1, 2) + '-' + E.pad(d.getDate(), 2); };
  const opts = (list, sel) => list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  const field = (label, inner, cls, hint) => '<label class="fld ' + (cls || '') + '"><span>' + label + '</span>' + inner + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  const fields = (spec, obj) => spec.map((f) => {
    const val = obj[f.k] == null ? '' : obj[f.k];
    let inner;
    if (f.t === 'select') inner = '<select name="' + f.k + '"' + (f.a || '') + '>' + opts(f.o, val) + '</select>';
    else if (f.t === 'textarea') inner = '<textarea name="' + f.k + '" rows="' + (f.rows || 3) + '"' + (f.a || '') + '>' + esc(val) + '</textarea>';
    else inner = '<input name="' + f.k + '" type="' + (f.t || 'text') + '" value="' + esc(val) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + (f.t === 'number' ? ' step="any" min="0" inputmode="decimal"' : '') + (f.a || '') + '>';
    return field(f.l, inner, f.c, f.h);
  }).join('');
  const read = (root) => {
    const o = {};
    root.querySelectorAll('[name]').forEach((el) => { o[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    return o;
  };
  const stateOpts = () => E.STATES.map((s) => [s[0], s[1] + ' (' + s[0] + ')']);
  A.u = { esc, fmt, dc, short, fdate, today, opts, field, fields, read, stateOpts };

  // ---------- chrome: modal, toast, confirm, files ----------
  A.modals = [];
  A.openModal = function ({ title, body, foot, size, onClose }) {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = '<div class="dlg ' + (size || 'md') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header><h2>' + esc(title) + '</h2><button type="button" class="x" data-act="mClose" aria-label="Close">×</button></header><div class="dbody">' + body + '</div>' + (foot ? '<footer>' + foot + '</footer>' : '') + '</div>';
    document.getElementById('modalRoot').appendChild(ov);
    A.modals.push({ el: ov, onClose });
    document.body.classList.add('noscroll');
    const f = ov.querySelector('.dbody input:not([type=hidden]), .dbody select'); if (f) f.focus();
    return ov;
  };
  A.closeModal = function () {
    const m = A.modals.pop(); if (!m) return;
    m.el.remove(); if (m.onClose) m.onClose();
    if (!A.modals.length) document.body.classList.remove('noscroll');
  };
  A.confirm = function (msg, okLabel, danger) {
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'ov ovtop';
      ov.innerHTML = '<div class="dlg sm" role="alertdialog" aria-modal="true"><div class="dbody"><p class="cmsg">' + msg + '</p></div><footer><button type="button" class="btn" data-c="0">Cancel</button><button type="button" class="btn ' + (danger ? 'dng' : 'pri') + '" data-c="1">' + esc(okLabel || 'OK') + '</button></footer></div>';
      ov.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; ov.remove(); resolve(b.dataset.c === '1'); });
      document.getElementById('modalRoot').appendChild(ov);
      ov.querySelector('[data-c="1"]').focus();
    });
  };
  let toastT;
  A.toast = function (msg, kind) {
    const t = document.getElementById('toast'); t.className = 'toast show ' + (kind || ''); t.textContent = msg;
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3600);
  };
  const browserSave = (name, data) => {
    const isCsv = /\.csv$/i.test(name), blob = data instanceof Blob ? data : new Blob([isCsv ? '\ufeff' : '', data], { type: isCsv ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); A.toast('Downloaded ' + name);
  };
  A.deliver = async function (name, data) {
    const dl = await A.use('downloads');
    if (dl) {
      try { await dl.save({ filename: name, data }); A.toast('Saved ' + name); return; } catch (e) { if (e && e.code === 'declined') return; }
    }
    if (!window.claude) { browserSave(name, data); return; }
    if (typeof data !== 'string') { A.toast('Downloads are not available in this view.', 'bad'); return; }
    A.openModal({ title: name, size: 'md', body: '<p class="muted">Downloads are not available in this view. Copy the text below instead.</p><textarea id="copyTa" class="mono" rows="14" readonly>' + esc(data) + '</textarea>', foot: '<button type="button" class="btn" data-act="mClose">Close</button><button type="button" class="btn pri" data-act="copyTa">Copy</button>' });
  };
  const libs = {};
  A.loadScript = (src) => libs[src] || (libs[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete libs[src]; rej(new Error('load ' + src)); }; document.head.appendChild(s); }));

  // ---------- derived data ----------
  A.fyList = function () {
    const first = E.fyStartYear(A.S.booksFrom), t = E.fyStartYear(today());
    let last = Math.max(t, first);
    A.S.vouchers.forEach((v) => { last = Math.max(last, E.fyStartYear(v.date)); });
    const out = []; for (let y = first; y <= last; y++) out.push(y);
    return out;
  };
  A.defaultDate = () => { const t = today(), r = E.fyRange(A.ui.fy); return t < r.from ? r.from : t > r.to ? r.to : t; };
  A.asOf = () => { const t = today(), r = E.fyRange(A.ui.fy); return t < r.from ? r.from : t > r.to ? r.to : t; };
  A.partyName = (id) => { const p = A.idx.partyById.get(id); return p ? p.name : '—'; };
  A.cashBank = () => A.S.accounts.filter((a) => a.group === 'Cash-in-Hand' || a.group === 'Bank Accounts');
  A.billOut = function () {
    const am = E.allocMap(A.S), m = new Map();
    A.S.vouchers.forEach((v) => { if (v.type === 'sale' || v.type === 'purchase' || (v.type === 'expense' && (v.paidFrom || '').startsWith('p:'))) m.set(v.id, { out: r2(v.total - (am.get(v.id) || 0)), paid: r2(am.get(v.id) || 0) }); });
    return m;
  };
  A.stats = function () {
    const c = A._stats; if (c && c.idx === A.idx && c.fy === A.ui.fy) return c;
    const S = A.S, idx = A.idx, sy = A.ui.fy, { from, to } = E.fyRange(sy), asOf = A.asOf();
    const P = E.pnl(S, idx, sy);
    const parties = S.parties.map((p) => { const bal = E.balanceAt(idx, 'p:' + p.id, to); return { p, bal, kind: E.partyKind(p, bal) }; });
    const receivable = r2(parties.filter((x) => x.kind === 'debtor').reduce((s, x) => s + x.bal, 0));
    const payable = r2(-parties.filter((x) => x.kind === 'creditor').reduce((s, x) => s + x.bal, 0));
    const cashBank = r2(A.cashBank().reduce((s, a) => s + E.balanceAt(idx, 'a:' + a.id, to), 0));
    const gst = E.gstSummary(S, sy);
    const months = E.fyMonths(sy).map((m) => ({ key: m.key, label: m.label, sales: 0, purch: 0 }));
    const mk = new Map(months.map((m) => [m.key, m]));
    S.vouchers.forEach((v) => { const m = mk.get(v.date.slice(0, 7)); if (!m) return; if (v.type === 'sale') m.sales += v.taxable; else if (v.type === 'purchase') m.purch += v.taxable; });
    A._stats = { idx, fy: sy, P, parties, receivable, payable, cashBank, gst, months, asOf, from, to };
    return A._stats;
  };

  // ---------- small components ----------
  const tile = (label, value, sub, cls) => '<div class="tile ' + (cls || '') + '"><div class="tl">' + label + '</div><div class="tv">' + value + '</div>' + (sub ? '<div class="ts">' + sub + '</div>' : '') + '</div>';
  const panel = (title, body, actions, cls) => '<section class="panel ' + (cls || '') + '">' + (title || actions ? '<header class="ph"><h3>' + (title || '') + '</h3><div class="pa">' + (actions || '') + '</div></header>' : '') + '<div class="pb">' + body + '</div></section>';
  const empty = (msg) => '<div class="empty">' + msg + '</div>';
  const pageHead = (title, sub, actions) => '<div class="phead"><div><h1>' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="pact">' + (actions || '') + '</div></div>';
  const chip = (txt, cls) => '<span class="chip ' + (cls || '') + '">' + txt + '</span>';
  A.u.chip = chip; A.u.panel = panel; A.u.pageHead = pageHead;
  const typeChip = (t) => chip(E.TYPE_LABEL[t], 't-' + t);
  A.u.tile = tile; A.u.panel = panel; A.u.chip = chip;
  const fyTxt = () => 'FY ' + E.fyLabel(A.ui.fy);
  const viewBtn = (id, label) => '<button type="button" class="lnk" data-act="vView" data-id="' + id + '">' + esc(label) + '</button>';
  const partyLink = (id) => { const p = A.idx.partyById.get(id); return p ? '<a href="#party-' + id + '" class="lnk">' + esc(p.name) + '</a>' : '<span class="muted">(deleted party)</span>'; };

  // ---------- Dashboard ----------
  A.pages.dashboard = function () {
    const S = A.S, st = A.stats(), P = st.P;
    const quick = '<div class="quick">' + [['sale', 'New sale'], ['purchase', 'New purchase'], ['receipt', 'Receipt'], ['payment', 'Payment'], ['expense', 'Expense']].map((x) => '<button type="button" class="btn" data-act="newV" data-t="' + x[0] + '">＋ ' + x[1] + '</button>').join('') + '</div>';
    if (!S.vouchers.length && !S.parties.length) {
      return pageHead('Dashboard', fyTxt()) + panel('Start your books', '<ol class="steps"><li><b>Company Profile</b> — name, address, bank details and invoice settings.</li><li><b>Taxation</b> — GSTIN, PAN and filing frequency.</li><li><b>Party Profiles</b> — add your customers and suppliers with opening balances.</li><li><b>Record vouchers</b> — sales, purchases, receipts, payments, expenses and contra entries.</li></ol><div class="row"><a class="btn pri" href="#company">Open Company Profile</a><button type="button" class="btn" data-act="newParty">Add first party</button><button type="button" class="btn" data-act="loadSample">Load sample data</button></div>');
    }
    const maxV = Math.max(1, ...st.months.map((m) => Math.max(m.sales, m.purch)));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(maxV))); const f = maxV / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
    const W = 640, H = 230, L = 52, B = 28, T = 10, R = 8, cw = (W - L - R) / 12, ch = H - B - T;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="Monthly sales and purchases">';
    for (let i = 0; i <= 4; i++) { const y = T + ch - ch * i / 4; svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" class="ax">' + short(nice * i / 4) + '</text>'; }
    st.months.forEach((m, i) => {
      const x = L + i * cw, bw = cw * 0.34, hs = ch * m.sales / nice, hp = ch * m.purch / nice;
      svg += '<rect x="' + (x + cw * 0.12) + '" y="' + (T + ch - hs) + '" width="' + bw + '" height="' + hs + '" class="b-s"><title>' + m.label + ' sales ₹' + fmt(m.sales) + '</title></rect>';
      svg += '<rect x="' + (x + cw * 0.12 + bw + 2) + '" y="' + (T + ch - hp) + '" width="' + bw + '" height="' + hp + '" class="b-p"><title>' + m.label + ' purchases ₹' + fmt(m.purch) + '</title></rect>';
      svg += '<text x="' + (x + cw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="ax">' + m.label.slice(0, 3) + '</text>';
    });
    svg += '</svg>';
    // attention lists
    const od = st.parties.filter((x) => x.kind === 'debtor').map((x) => ({ x, a: E.ageing(S, A.idx, x.p.id, 'Dr', st.asOf) })).filter((r) => r.a.overdue > 0.5).sort((a, b) => b.a.overdue - a.a.overdue).slice(0, 5);
    const pay = st.parties.filter((x) => x.kind === 'creditor').map((x) => ({ x, a: E.ageing(S, A.idx, x.p.id, 'Cr', st.asOf) })).filter((r) => r.a.net > 0.5).sort((a, b) => b.a.net - a.a.net).slice(0, 5);
    const lst = (rows, key) => rows.length ? '<table class="tbl compact"><tbody>' + rows.map((r) => '<tr><td>' + partyLink(r.x.p.id) + '</td><td class="n">' + fmt(r.a[key]) + '</td></tr>').join('') + '</tbody></table>' : empty('Nothing here.');
    const recent = A.idx.vouchers.slice().reverse().slice(0, 8);
    const rt = '<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>No.</th><th>Particulars</th><th class="n">Amount</th></tr></thead><tbody>' + recent.map((v) => '<tr><td>' + fdate(v.date) + '</td><td>' + typeChip(v.type) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + esc(voucherParticulars(v)) + '</td><td class="n">' + fmt(E.voucherAmount(v)) + '</td></tr>').join('') + '</tbody></table></div>';
    const gnet = st.gst.total.net;
    return pageHead('Dashboard', fyTxt() + ' · ' + esc(S.company.name), quick)
      + '<div class="tiles">'
      + tile('Sales (before GST)', '₹ ' + fmt(P.turnover), E.TYPE_LABEL.sale + ' invoices in ' + fyTxt())
      + tile('Net profit', '₹ ' + fmt(P.net), P.turnover ? P.netPct.toFixed(1) + '% of sales' : '', P.net < 0 ? 'neg' : '')
      + tile('To receive', '₹ ' + fmt(st.receivable), 'Sundry debtors', '')
      + tile('To pay', '₹ ' + fmt(st.payable), 'Sundry creditors', '')
      + tile('Cash & bank', '₹ ' + fmt(st.cashBank), 'Closing balance', st.cashBank < 0 ? 'neg' : '')
      + tile(gnet >= 0 ? 'GST payable' : 'GST credit', '₹ ' + fmt(Math.abs(gnet)), 'Output less input, ' + fyTxt(), '')
      + '</div>'
      + '<div class="cols2">' + panel('Sales and purchases by month', svg + '<div class="legend"><span><i class="sw s"></i>Sales</span><span><i class="sw p"></i>Purchases</span></div>')
      + '<div class="stack">' + panel('Overdue receivables', lst(od, 'overdue'), '<a class="lnk" href="#debtors">All debtors</a>') + panel('Largest payables', lst(pay, 'net'), '<a class="lnk" href="#creditors">All creditors</a>') + '</div></div>'
      + panel('Recent vouchers', rt, '<a class="lnk" href="#daybook">Day Book</a>');
  };

  function voucherParticulars(v) {
    const n = (k) => E.nameOf(A.idx, k);
    switch (v.type) {
      case 'sale': case 'purchase': return A.partyName(v.partyId);
      case 'receipt': return 'From ' + n(v.counter);
      case 'payment': return 'To ' + n(v.counter);
      case 'expense': return n(v.head) + (v.paidFrom && v.paidFrom[0] === 'p' ? ' · ' + n(v.paidFrom) : '');
      case 'contra': return n(v.from) + ' → ' + n(v.to);
    }
    return '';
  }
  A.voucherParticulars = voucherParticulars;

  // ---------- Voucher lists ----------
  const TYPE_BY_ROUTE = { sales: 'sale', purchases: 'purchase', receipts: 'receipt', payments: 'payment', expenses: 'expense', contra: 'contra' };
  const LIST_TITLE = { sale: 'Sales', purchase: 'Purchases', receipt: 'Receipts', payment: 'Payments', expense: 'Expenses', contra: 'Contra' };
  const NEW_LABEL = { sale: 'New sale invoice', purchase: 'New purchase bill', receipt: 'New receipt', payment: 'New payment', expense: 'New expense', contra: 'New contra entry' };
  const LIST_SUB = { sale: 'Tax invoices raised to customers.', purchase: 'Bills received from suppliers, with input tax credit.', receipt: 'Money received from customers and others.', payment: 'Money paid to suppliers and others.', expense: 'Day-to-day business expenses.', contra: 'Cash deposits, withdrawals and bank-to-bank transfers.' };

  function listVouchers(type) {
    const f = A.ui.flt[type] || (A.ui.flt[type] = { q: '', party: '', month: '', status: '' });
    const { from, to } = E.fyRange(A.ui.fy);
    const bo = A.billOut(), t = today();
    let vs = A.idx.vouchers.filter((v) => v.type === type && v.date >= from && v.date <= to);
    if (f.month) vs = vs.filter((v) => v.date.slice(0, 7) === f.month);
    if (f.party) vs = vs.filter((v) => v.partyId === f.party || v.counter === 'p:' + f.party || v.paidFrom === 'p:' + f.party);
    if (f.q) { const q = f.q.toLowerCase(); vs = vs.filter((v) => (v.no + ' ' + (v.refNo || '') + ' ' + voucherParticulars(v) + ' ' + (v.narration || '')).toLowerCase().includes(q)); }
    if (f.status && bo.size) vs = vs.filter((v) => { const b = bo.get(v.id); if (!b) return false; return f.status === 'paid' ? b.out <= 0.005 : b.out > 0.005; });
    vs = vs.slice().reverse();
    const statusCell = (v) => {
      const b = bo.get(v.id); if (!b) return '';
      if (b.out <= 0.005) return chip('Paid', 'good');
      const late = v.dueDate && v.dueDate < t ? E.daysBetween(v.dueDate, t) : 0;
      return (b.paid > 0 ? chip('Partly paid', 'warn') : chip('Unpaid', '')) + (late ? ' ' + chip(late + 'd overdue', 'bad') : '');
    };
    const act = (v) => {
      const b = bo.get(v.id), open = b && b.out > 0.005;
      return '<div class="ra">' + (open && (v.type === 'sale' || v.type === 'purchase') ? '<button type="button" class="lnk" data-act="vSettle" data-id="' + v.id + '">' + (v.type === 'sale' ? 'Receive' : 'Pay') + '</button>' : '') + '<button type="button" class="lnk" data-act="vView" data-id="' + v.id + '">View</button><button type="button" class="lnk" data-act="vEdit" data-id="' + v.id + '">Edit</button><button type="button" class="lnk dng" data-act="vDel" data-id="' + v.id + '">Delete</button></div>';
    };
    let head, row;
    if (type === 'sale') { head = '<th>Date</th><th>Invoice no.</th><th>Customer</th><th class="n">Taxable</th><th class="n">GST</th><th class="n">Total</th><th>Status</th><th></th>'; row = (v) => '<td>' + fdate(v.date) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + partyLink(v.partyId) + '</td><td class="n">' + fmt(v.taxable) + '</td><td class="n">' + fmt(v.tax) + '</td><td class="n b">' + fmt(v.total) + '</td><td>' + statusCell(v) + '</td><td>' + act(v) + '</td>'; }
    else if (type === 'purchase') { head = '<th>Date</th><th>Our ref</th><th>Supplier bill</th><th>Supplier</th><th class="n">Taxable</th><th class="n">GST</th><th class="n">Total</th><th>Status</th><th></th>'; row = (v) => '<td>' + fdate(v.date) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + esc(v.refNo || '—') + '</td><td>' + partyLink(v.partyId) + '</td><td class="n">' + fmt(v.taxable) + '</td><td class="n">' + fmt(v.tax) + (v.itc === false ? ' <span class="muted" title="No input credit claimed">*</span>' : '') + '</td><td class="n b">' + fmt(v.total) + '</td><td>' + statusCell(v) + '</td><td>' + act(v) + '</td>'; }
    else if (type === 'receipt' || type === 'payment') { head = '<th>Date</th><th>Voucher no.</th><th>' + (type === 'receipt' ? 'Received from' : 'Paid to') + '</th><th>' + (type === 'receipt' ? 'Deposited in' : 'Paid from') + '</th><th>Reference</th><th class="n">TDS</th><th class="n">Amount</th><th></th>'; row = (v) => '<td>' + fdate(v.date) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + (v.counter[0] === 'p' ? partyLink(v.counter.slice(2)) : esc(E.nameOf(A.idx, v.counter))) + '</td><td>' + esc(E.nameOf(A.idx, v.mode)) + '</td><td>' + esc(v.refNo || '—') + '</td><td class="n">' + (num(v.tds) ? fmt(v.tds) : '—') + '</td><td class="n b">' + fmt(v.amount) + '</td><td>' + act(v) + '</td>'; }
    else if (type === 'expense') { head = '<th>Date</th><th>Voucher no.</th><th>Expense head</th><th>Paid via</th><th class="n">Amount</th><th class="n">GST</th><th class="n">Total</th><th>Status</th><th></th>'; row = (v) => '<td>' + fdate(v.date) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + esc(E.nameOf(A.idx, v.head)) + '</td><td>' + (v.paidFrom[0] === 'p' ? partyLink(v.paidFrom.slice(2)) : esc(E.nameOf(A.idx, v.paidFrom))) + '</td><td class="n">' + fmt(v.amount) + '</td><td class="n">' + fmt(v.tax) + '</td><td class="n b">' + fmt(v.total) + '</td><td>' + statusCell(v) + '</td><td>' + act(v) + '</td>'; }
    else { head = '<th>Date</th><th>Voucher no.</th><th>From</th><th>To</th><th>Reference</th><th class="n">Amount</th><th></th>'; row = (v) => '<td>' + fdate(v.date) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + esc(E.nameOf(A.idx, v.from)) + '</td><td>' + esc(E.nameOf(A.idx, v.to)) + '</td><td>' + esc(v.refNo || v.narration || '—') + '</td><td class="n b">' + fmt(v.amount) + '</td><td>' + act(v) + '</td>'; }
    const total = r2(vs.reduce((s, v) => s + E.voucherAmount(v), 0));
    if (!vs.length) return empty('No ' + LIST_TITLE[type].toLowerCase() + ' found for ' + fyTxt() + (f.q || f.party || f.month || f.status ? ' with these filters' : '') + '.');
    return '<div class="listsum">' + vs.length + ' voucher' + (vs.length === 1 ? '' : 's') + ' · total <b>₹ ' + fmt(total) + '</b></div><div class="scroll"><table class="tbl"><thead><tr>' + head + '</tr></thead><tbody>' + vs.map((v) => '<tr>' + row(v) + '</tr>').join('') + '</tbody></table></div>';
  }

  function pVoucherList(type) {
    const f = A.ui.flt[type] || (A.ui.flt[type] = { q: '', party: '', month: '', status: '' });
    const partyType = type === 'sale' ? 'Customer' : type === 'purchase' ? 'Supplier' : null;
    const plist = A.S.parties.filter((p) => !partyType || p.type === partyType || p.type === 'Both').sort((a, b) => a.name.localeCompare(b.name));
    const hasStatus = type === 'sale' || type === 'purchase' || type === 'expense';
    const filters = '<div class="filters"><input type="search" id="f-q" data-f="q" data-t="' + type + '" placeholder="Search number, party or note" value="' + esc(f.q) + '" aria-label="Search">'
      + (type !== 'contra' && type !== 'expense' ? '<select data-f="party" data-t="' + type + '" aria-label="Party"><option value="">All parties</option>' + opts(plist.map((p) => [p.id, p.name]), f.party) + '</select>' : '')
      + '<select data-f="month" data-t="' + type + '" aria-label="Month"><option value="">All months</option>' + opts(E.fyMonths(A.ui.fy).map((m) => [m.key, m.label]), f.month) + '</select>'
      + (hasStatus ? '<select data-f="status" data-t="' + type + '" aria-label="Status"><option value="">Any status</option>' + opts([['open', 'Outstanding'], ['paid', 'Settled']], f.status) + '</select>' : '') + '</div>';
    return pageHead(LIST_TITLE[type], LIST_SUB[type] + ' · ' + fyTxt(), '<button type="button" class="btn pri" data-act="newV" data-t="' + type + '">＋ ' + NEW_LABEL[type] + '</button>' + (type === 'purchase' || type === 'expense' ? '<button type="button" class="btn" data-act="scanBill">📷 Scan bill</button>' : '')) + panel('', filters + '<div id="listArea">' + listVouchers(type) + '</div>');
  }
  Object.keys(TYPE_BY_ROUTE).forEach((r) => { A.pages[r] = () => pVoucherList(TYPE_BY_ROUTE[r]); });
  A.listArea = (type) => listVouchers(type);

  // ---------- Day book ----------
  A.pages.daybook = function () {
    const f = A.ui.flt.day || (A.ui.flt.day = { q: '', month: '' });
    const chips = ['all', 'sale', 'purchase', 'receipt', 'payment', 'expense', 'contra'].map((t) => '<button type="button" class="seg ' + (A.ui.dayType === t ? 'on' : '') + '" data-act="dayType" data-t="' + t + '">' + (t === 'all' ? 'All' : E.TYPE_LABEL[t]) + '</button>').join('');
    const filters = '<div class="filters"><input type="search" data-f="q" data-t="day" placeholder="Search number, party or note" value="' + esc(f.q) + '" aria-label="Search"><select data-f="month" data-t="day" aria-label="Month"><option value="">All months</option>' + opts(E.fyMonths(A.ui.fy).map((m) => [m.key, m.label]), f.month) + '</select></div><div class="segs">' + chips + '</div>';
    return pageHead('Day Book', 'Every voucher in date order · ' + fyTxt(), '') + panel('', filters + '<div id="listArea">' + dayList() + '</div>');
  };
  function dayList() {
    const f = A.ui.flt.day || {}, { from, to } = E.fyRange(A.ui.fy);
    let vs = A.idx.vouchers.filter((v) => v.date >= from && v.date <= to);
    if (A.ui.dayType !== 'all') vs = vs.filter((v) => v.type === A.ui.dayType);
    if (f.month) vs = vs.filter((v) => v.date.slice(0, 7) === f.month);
    if (f.q) { const q = f.q.toLowerCase(); vs = vs.filter((v) => (v.no + ' ' + (v.refNo || '') + ' ' + voucherParticulars(v) + ' ' + (v.narration || '')).toLowerCase().includes(q)); }
    if (!vs.length) return empty('No vouchers match.');
    const total = r2(vs.reduce((s, v) => s + E.voucherAmount(v), 0));
    return '<div class="listsum">' + vs.length + ' vouchers · total value <b>₹ ' + fmt(total) + '</b></div><div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Voucher no.</th><th>Particulars</th><th class="n">Amount</th><th></th></tr></thead><tbody>' + vs.slice().reverse().map((v) => '<tr><td>' + fdate(v.date) + '</td><td>' + typeChip(v.type) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + esc(voucherParticulars(v)) + '</td><td class="n b">' + fmt(E.voucherAmount(v)) + '</td><td><div class="ra"><button type="button" class="lnk" data-act="vEdit" data-id="' + v.id + '">Edit</button><button type="button" class="lnk dng" data-act="vDel" data-id="' + v.id + '">Delete</button></div></td></tr>').join('') + '</tbody></table></div>';
  }
  A.dayList = dayList;

  // ---------- Parties ----------
  function partyListHTML() {
    const q = A.ui.partyQ.toLowerCase(), t = A.ui.partyT, st = A.stats();
    let ps = st.parties.filter((x) => (t === 'all' || (t === 'cust' ? x.p.type !== 'Supplier' : x.p.type !== 'Customer')) && (!q || (x.p.name + ' ' + x.p.gstin + ' ' + x.p.city + ' ' + x.p.phone).toLowerCase().includes(q)));
    ps = ps.sort((a, b) => a.p.name.localeCompare(b.p.name));
    if (!ps.length) return empty(A.S.parties.length ? 'No party matches.' : 'No parties yet. Add your first customer or supplier.');
    return '<div class="scroll"><table class="tbl"><thead><tr><th>Party</th><th>Type</th><th>GSTIN</th><th>City</th><th>Phone</th><th class="n">Credit days</th><th class="n">Balance</th><th></th></tr></thead><tbody>' + ps.map((x) => '<tr><td><a class="lnk b" href="#party-' + x.p.id + '">' + esc(x.p.name) + '</a></td><td>' + chip(x.p.type, x.p.type === 'Customer' ? 'cust' : x.p.type === 'Supplier' ? 'supp' : '') + '</td><td class="mono">' + esc(x.p.gstin || '—') + '</td><td>' + esc(x.p.city || '—') + '</td><td>' + esc(x.p.phone || '—') + '</td><td class="n">' + num(x.p.creditDays) + '</td><td class="n">' + dc(x.bal) + '</td><td><div class="ra"><a class="lnk" href="#party-' + x.p.id + '">Profile</a><button type="button" class="lnk" data-act="goLedger" data-id="' + x.p.id + '">Ledger</button></div></td></tr>').join('') + '</tbody></table></div>';
  }
  A.partyList = partyListHTML;
  A.pages.parties = function () {
    const seg = (v, l) => '<button type="button" class="seg ' + (A.ui.partyT === v ? 'on' : '') + '" data-act="partyT" data-t="' + v + '">' + l + '</button>';
    return pageHead('Party Profiles', 'Customers and suppliers with GST, credit terms and balances.', '<button type="button" class="btn pri" data-act="newParty">＋ New party</button>')
      + panel('', '<div class="filters"><input type="search" data-f="partyQ" placeholder="Search name, GSTIN, city or phone" value="' + esc(A.ui.partyQ) + '" aria-label="Search parties"></div><div class="segs">' + seg('all', 'All') + seg('cust', 'Customers') + seg('supp', 'Suppliers') + '</div><div id="listArea">' + partyListHTML() + '</div>');
  };

  A.pages.partyProfile = function (id) {
    const S = A.S, p = A.idx.partyById.get(id);
    if (!p) return pageHead('Party not found', '', '<a class="btn" href="#parties">Back to parties</a>');
    const { from, to } = E.fyRange(A.ui.fy), asOf = A.asOf(), key = 'p:' + id;
    const bal = E.balanceAt(A.idx, key, to);
    const kind = E.partyKind(p, bal) === 'debtor' ? 'Dr' : 'Cr';
    const ag = E.ageing(S, A.idx, id, kind, asOf);
    const inFY = (v) => v.date >= from && v.date <= to;
    const sum = (type, fn) => r2(S.vouchers.filter((v) => v.type === type && inFY(v) && fn(v)).reduce((s, v) => s + E.voucherAmount(v), 0));
    const sales = sum('sale', (v) => v.partyId === id), purch = sum('purchase', (v) => v.partyId === id), rec = sum('receipt', (v) => v.counter === key), pay = sum('payment', (v) => v.counter === key);
    const bills = E.partyBills(S, A.idx, id, asOf).bills;
    const bt = bills.length ? '<div class="scroll"><table class="tbl compact"><thead><tr><th>Bill</th><th>Date</th><th>Due</th><th>Type</th><th class="n">Bill amount</th><th class="n">Outstanding</th><th>Age</th></tr></thead><tbody>' + bills.sort((a, b) => (a.date < b.date ? -1 : 1)).map((b) => { const d = E.daysBetween(b.due, asOf); return '<tr><td>' + (b.type === 'opening' ? esc(b.no) : viewBtn(b.ref, b.no)) + '</td><td>' + fdate(b.date) + '</td><td>' + fdate(b.due) + '</td><td>' + chip(b.side === 'Dr' ? 'Receivable' : 'Payable', b.side === 'Dr' ? 'cust' : 'supp') + '</td><td class="n">' + fmt(b.amount) + '</td><td class="n b">' + fmt(b.out) + '</td><td>' + (d > 0 ? chip(d + 'd overdue', 'bad') : chip('Not due', 'good')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : empty('No outstanding bills.');
    const recent = A.idx.rows.filter((r) => r.acct === key).slice(-8).reverse();
    const rt = recent.length ? '<div class="scroll"><table class="tbl compact"><thead><tr><th>Date</th><th>Type</th><th>No.</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>' + recent.map((r) => '<tr><td>' + fdate(r.date) + '</td><td>' + typeChip(r.type) + '</td><td>' + viewBtn(r.vid, r.no) + '</td><td class="n">' + (r.dr ? fmt(r.dr) : '') + '</td><td class="n">' + (r.cr ? fmt(r.cr) : '') + '</td></tr>').join('') + '</tbody></table></div>' : empty('No transactions yet.');
    const kv = (k, v) => v ? '<div class="kv"><dt>' + k + '</dt><dd>' + v + '</dd></div>' : '';
    const addr = [p.address, [p.city, p.state, p.pin].filter(Boolean).join(', ')].filter(Boolean).map(esc).join('<br>');
    const det = '<dl class="kvs">' + kv('GSTIN', p.gstin ? '<span class="mono">' + esc(p.gstin) + '</span>' : '') + kv('PAN', p.pan ? '<span class="mono">' + esc(p.pan) + '</span>' : '') + kv('State', p.state ? esc(p.state) + ' (' + esc(p.stateCode) + ')' : '') + kv('Contact', esc(p.contactPerson)) + kv('Phone', esc(p.phone)) + kv('Email', esc(p.email)) + kv('Address', addr) + kv('Credit terms', num(p.creditDays) + ' days' + (num(p.creditLimit) ? ' · limit ₹ ' + fmt(p.creditLimit) : '')) + kv('Opening balance', num(p.opening) ? fmt(p.opening) + ' ' + p.openingType : '') + kv('Bank', [p.bankName, p.bankAcc, p.ifsc].filter(Boolean).map(esc).join(' · ')) + kv('Notes', esc(p.notes)) + '</dl>';
    const over = p.creditLimit && kind === 'Dr' && bal > num(p.creditLimit);
    const acts = '<button type="button" class="btn" data-act="goLedger" data-id="' + id + '">Open ledger</button>' + (p.type !== 'Supplier' ? '<button type="button" class="btn" data-act="newVParty" data-t="sale" data-id="' + id + '">New sale</button><button type="button" class="btn" data-act="newVParty" data-t="receipt" data-id="' + id + '">Receipt</button>' : '') + (p.type !== 'Customer' ? '<button type="button" class="btn" data-act="newVParty" data-t="purchase" data-id="' + id + '">New purchase</button><button type="button" class="btn" data-act="newVParty" data-t="payment" data-id="' + id + '">Payment</button>' : '') + '<button type="button" class="btn pri" data-act="editParty" data-id="' + id + '">Edit profile</button>';
    return '<a class="back" href="#parties">‹ Party Profiles</a>' + pageHead(esc(p.name), chip(p.type, p.type === 'Customer' ? 'cust' : p.type === 'Supplier' ? 'supp' : '') + (p.gstin ? ' <span class="mono">' + esc(p.gstin) + '</span>' : ' <span class="muted">No GSTIN</span>') + (over ? ' ' + chip('Over credit limit', 'bad') : ''), acts)
      + '<div class="tiles">' + tile('Closing balance', dc(bal), fyTxt() + (bal > 0 ? ' · receivable' : bal < 0 ? ' · payable' : ''))
      + tile('Overdue', '₹ ' + fmt(ag.overdue), ag.overdue ? 'Past due as on ' + fdate(asOf) : 'Nothing overdue', ag.overdue ? 'neg' : '')
      + tile(p.type === 'Supplier' ? 'Purchases' : 'Sales', '₹ ' + fmt(p.type === 'Supplier' ? purch : sales), fyTxt() + ' · incl. GST')
      + tile(p.type === 'Supplier' ? 'Paid' : 'Received', '₹ ' + fmt(p.type === 'Supplier' ? pay : rec), fyTxt()) + '</div>'
      + '<div class="cols2 prof">' + panel('Details', det) + '<div class="stack">' + panel('Outstanding bills', bt) + panel('Recent transactions', rt, '<button type="button" class="lnk" data-act="goLedger" data-id="' + id + '">Full ledger</button>') + '</div></div>';
  };

  // ---------- Ledger ----------
  A.ledgerOptions = function (sel) {
    const S = A.S;
    const ps = (type) => S.parties.filter((p) => type(p)).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ['p:' + p.id, p.name]);
    let h = '<optgroup label="Customers">' + opts(ps((p) => p.type === 'Customer'), sel) + '</optgroup><optgroup label="Suppliers">' + opts(ps((p) => p.type === 'Supplier'), sel) + '</optgroup><optgroup label="Both">' + opts(ps((p) => p.type === 'Both'), sel) + '</optgroup>';
    E.GROUP_ORDER.forEach((g) => { const l = S.accounts.filter((a) => a.group === g).map((a) => ['a:' + a.id, a.name]); if (l.length) h += '<optgroup label="' + esc(g) + '">' + opts(l, sel) + '</optgroup>'; });
    return h;
  };
  A.pages.ledger = function () {
    const S = A.S, L = A.ui.led, r = E.fyRange(A.ui.fy);
    if (!L.key || (L.key[0] === 'p' ? !A.idx.partyById.has(L.key.slice(2)) : !A.idx.acctById.has(L.key.slice(2)))) {
      const withTx = S.parties.find((p) => A.idx.byAcct.has('p:' + p.id)) || S.parties[0];
      L.key = withTx ? 'p:' + withTx.id : 'a:cash';
    }
    if (!L.from || L.fy !== A.ui.fy) { L.from = r.from; L.to = r.to; L.fy = A.ui.fy; }
    const controls = '<div class="filters"><label class="fld grow"><span>Ledger</span><select data-f="ledKey" id="ledKey">' + A.ledgerOptions(L.key) + '</select></label><label class="fld"><span>From</span><input type="date" data-f="ledFrom" value="' + L.from + '"></label><label class="fld"><span>To</span><input type="date" data-f="ledTo" value="' + L.to + '"></label></div>';
    return pageHead('Party Ledger', 'Account statement with running balance. Choose a party or any ledger.', '<button type="button" class="btn" data-act="csv" data-k="ledger">Download CSV</button>') + panel('', controls + '<div id="listArea">' + ledgerHTML() + '</div>');
  };
  function ledgerHTML() {
    const L = A.ui.led, S = A.S, key = L.key;
    const led = E.ledger(S, A.idx, key, L.from, L.to);
    const isP = key[0] === 'p', p = isP ? A.idx.partyById.get(key.slice(2)) : null;
    const head = p ? '<div class="ledhead"><b>' + esc(p.name) + '</b>' + (p.gstin ? ' · <span class="mono">' + esc(p.gstin) + '</span>' : '') + (p.phone ? ' · ' + esc(p.phone) : '') + (p.city ? ' · ' + esc(p.city) : '') + '</div>' : '<div class="ledhead"><b>' + esc(E.nameOf(A.idx, key)) + '</b></div>';
    const rows = led.rows.map((r) => '<tr><td>' + fdate(r.date) + '</td><td>' + esc(r.particulars) + (r.narration ? '<div class="muted sm">' + esc(r.narration) + '</div>' : '') + '</td><td>' + typeChip(r.type) + '</td><td>' + viewBtn(r.vid, r.no) + '</td><td class="n">' + (r.dr ? fmt(r.dr) : '') + '</td><td class="n">' + (r.cr ? fmt(r.cr) : '') + '</td><td class="n">' + dc(r.bal) + '</td></tr>').join('');
    return head + '<div class="scroll"><table class="tbl ledger"><thead><tr><th>Date</th><th>Particulars</th><th>Type</th><th>Voucher</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead><tbody><tr class="open"><td></td><td colspan="5"><i>Opening balance</i></td><td class="n">' + dc(led.opening) + '</td></tr>' + (rows || '<tr><td colspan="7">' + empty('No transactions in this period.') + '</td></tr>') + '</tbody><tfoot><tr><td></td><td colspan="3">Total for period</td><td class="n">' + fmt(led.dr) + '</td><td class="n">' + fmt(led.cr) + '</td><td></td></tr><tr class="grand"><td></td><td colspan="5">Closing balance</td><td class="n">' + dc(led.closing) + '</td></tr></tfoot></table></div>';
  }
  A.ledgerHTML = ledgerHTML;

  // ---------- Debtors / Creditors ----------
  function outstandingRows(kind) {
    const S = A.S, st = A.stats(), asOf = st.asOf;
    return st.parties.filter((x) => (kind === 'Dr' ? x.kind === 'debtor' : x.kind === 'creditor')).map((x) => ({ p: x.p, bal: x.bal, a: E.ageing(S, A.idx, x.p.id, kind, asOf) })).filter((r) => Math.abs(r.bal) > 0.004 || r.a.gross > 0.004).sort((a, b) => b.a.net - a.a.net);
  }
  function pOutstanding(kind) {
    const rows = outstandingRows(kind), st = A.stats();
    const T = { b: [0, 0, 0, 0, 0], adv: 0, net: 0, over: 0 };
    rows.forEach((r) => { r.a.buckets.forEach((x, i) => { T.b[i] += x; }); T.adv += r.a.advance; T.net += r.a.net; T.over += r.a.overdue; });
    const deb = kind === 'Dr', title = deb ? 'Sundry Debtors' : 'Sundry Creditors';
    const breach = deb ? rows.filter((r) => num(r.p.creditLimit) && r.a.net > num(r.p.creditLimit)).length : 0;
    const bar = T.b.reduce((s, x) => s + x, 0) > 0 ? '<div class="agebar" role="img" aria-label="Ageing split">' + T.b.map((x, i) => '<i class="ag' + i + '" style="flex:' + Math.max(x, 0) + '" title="' + ['Not due', '1-30 days', '31-60 days', '61-90 days', 'Over 90 days'][i] + ': ₹' + fmt(x) + '"></i>').join('') + '</div><div class="legend ageleg"><span><i class="sw ag0"></i>Not due</span><span><i class="sw ag1"></i>1–30</span><span><i class="sw ag2"></i>31–60</span><span><i class="sw ag3"></i>61–90</span><span><i class="sw ag4"></i>90+ days</span></div>' : '';
    const body = rows.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>Party</th><th class="n">Not due</th><th class="n">1–30</th><th class="n">31–60</th><th class="n">61–90</th><th class="n">90+</th><th class="n">' + (deb ? 'Advance / on a/c' : 'Advance paid') + '</th><th class="n">Net ' + (deb ? 'receivable' : 'payable') + '</th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr><td><a class="lnk b" href="#party-' + r.p.id + '">' + esc(r.p.name) + '</a>' + (deb && num(r.p.creditLimit) && r.a.net > num(r.p.creditLimit) ? ' ' + chip('Over limit', 'bad') : '') + '<div class="muted sm">' + num(r.p.creditDays) + ' days credit</div></td>' + r.a.buckets.map((x, i) => '<td class="n' + (i >= 3 && x ? ' red' : '') + '">' + (x ? fmt(x) : '—') + '</td>').join('') + '<td class="n">' + (r.a.advance ? fmt(r.a.advance) : '—') + '</td><td class="n b">' + fmt(r.a.net) + '</td><td><div class="ra"><button type="button" class="lnk" data-act="goLedger" data-id="' + r.p.id + '">Ledger</button><button type="button" class="lnk" data-act="newVParty" data-t="' + (deb ? 'receipt' : 'payment') + '" data-id="' + r.p.id + '">' + (deb ? 'Receive' : 'Pay') + '</button></div></td></tr>').join('') + '</tbody><tfoot><tr class="grand"><td>Total</td><td></td>' + T.b.map((x) => '<td class="n">' + fmt(x) + '</td>').join('') + '<td class="n">' + fmt(T.adv) + '</td><td class="n">' + fmt(T.net) + '</td><td></td></tr></tfoot></table></div>' : empty('No outstanding ' + (deb ? 'receivables' : 'payables') + '.');
    return pageHead(title, 'Ageing by due date as on ' + fdate(st.asOf) + '. Customers get credit days from their profile.', '<button type="button" class="btn" data-act="csv" data-k="' + (deb ? 'debtors' : 'creditors') + '">Download CSV</button>')
      + '<div class="tiles t4">' + tile(deb ? 'Total receivable' : 'Total payable', '₹ ' + fmt(T.net), rows.length + ' part' + (rows.length === 1 ? 'y' : 'ies')) + tile('Overdue', '₹ ' + fmt(T.over), T.net > 0 ? Math.round(T.over / T.net * 100) + '% of total' : '', T.over ? 'neg' : '') + tile('Over 90 days', '₹ ' + fmt(T.b[4]), '', T.b[4] ? 'neg' : '') + (deb ? tile('Over credit limit', String(breach), 'parties', breach ? 'neg' : '') : tile('Not yet due', '₹ ' + fmt(T.b[0]), 'Can wait')) + '</div>'
      + panel('', bar + body);
  }
  A.pages.debtors = () => pOutstanding('Dr');
  A.pages.creditors = () => pOutstanding('Cr');
  A.outstandingRows = outstandingRows;

  // ---------- Profit & Loss ----------
  A.pages.pnl = function () {
    const P = E.pnl(A.S, A.idx, A.ui.fy);
    const ln = (l) => '<tr class="l"><td class="in">' + esc(l.name) + '</td><td class="n">' + fmt(l.amt) + '</td></tr>';
    const sub = (t, a, cls) => '<tr class="sub ' + (cls || '') + '"><td>' + t + '</td><td class="n">' + fmt(a) + '</td></tr>';
    const hd = (t) => '<tr class="sec"><td colspan="2">' + t + '</td></tr>';
    const stockRow = (label, val) => '<tr class="l"><td class="in">' + label + '</td><td class="n">' + fmt(val) + '</td></tr>';
    const trading = '<table class="tbl stmt"><tbody>' + hd('Income')
      + P.sales.map(ln).join('') + P.dinc.map(ln).join('') + stockRow('Closing stock', P.closing) + sub('Total income', P.trCr)
      + hd('Cost of goods')
      + stockRow('Opening stock', P.opening) + P.purch.map(ln).join('') + P.dexp.map(ln).join('') + sub('Total cost', P.trDr)
      + sub(P.gross >= 0 ? 'Gross profit' : 'Gross loss', P.gross, 'grand') + '</tbody></table>';
    const iTotal = r2(P.iexp.reduce((s, l) => s + l.amt, 0)), iInc = r2(P.iinc.reduce((s, l) => s + l.amt, 0));
    const pl = '<table class="tbl stmt"><tbody>' + sub('Gross profit brought down', P.gross)
      + (P.iinc.length ? hd('Other income') + P.iinc.map(ln).join('') + sub('Total other income', iInc) : '')
      + hd('Operating expenses') + (P.iexp.length ? P.iexp.map(ln).join('') : '<tr class="l"><td class="in muted">No expenses recorded</td><td></td></tr>') + sub('Total expenses', iTotal)
      + sub(P.net >= 0 ? 'Net profit' : 'Net loss', P.net, 'grand') + '</tbody></table>';
    const stock = '<div class="stockbox"><label class="fld"><span>Closing stock value on ' + fdate(E.fyRange(A.ui.fy).to) + '</span><input type="number" step="any" id="closingStock" data-f="closingStock" value="' + (P.closingEntered ? A.S.stock.closing[A.ui.fy] : '') + '" placeholder="' + fmt(P.closing) + '"></label><small>Count your stock at year end and enter its value. Left blank, it is assumed equal to opening stock (' + fmt(P.opening) + ').</small></div>';
    return pageHead('Profit & Loss', 'Trading and profit and loss account · ' + fyTxt(), '<button type="button" class="btn" data-act="csv" data-k="pnl">Download CSV</button>')
      + '<div class="tiles t4">' + tile('Turnover', '₹ ' + fmt(P.turnover), 'Sales before GST') + tile('Gross profit', '₹ ' + fmt(P.gross), P.grossPct.toFixed(1) + '% of sales', P.gross < 0 ? 'neg' : '') + tile('Operating expenses', '₹ ' + fmt(iTotal), 'Indirect expenses') + tile(P.net >= 0 ? 'Net profit' : 'Net loss', '₹ ' + fmt(P.net), P.netPct.toFixed(1) + '% of sales', P.net < 0 ? 'neg' : '') + '</div>'
      + panel('Stock', stock) + '<div class="cols2">' + panel('Trading account', trading) + panel('Profit and loss account', pl) + '</div>';
  };

  // ---------- Balance sheet ----------
  A.pages['balance-sheet'] = function () {
    const B = E.balanceSheet(A.S, A.idx, A.ui.fy);
    const side = (secs, total, label) => '<table class="tbl stmt"><thead><tr><th>' + label + '</th><th class="n">₹</th></tr></thead><tbody>' + (secs.length ? secs.map((s) => '<tr class="sec"><td>' + esc(s.section) + '</td><td class="n">' + (s.lines.length > 1 ? fmt(s.total) : '') + '</td></tr>' + s.lines.map((l) => '<tr class="l"><td class="in">' + esc(l.name) + '</td><td class="n">' + (s.lines.length > 1 ? '' : '') + fmt(l.amt) + '</td></tr>').join('')).join('') : '<tr><td colspan="2">' + empty('Nothing to show.') + '</td></tr>') + '</tbody><tfoot><tr class="grand"><td>Total</td><td class="n">' + fmt(total) + '</td></tr></tfoot></table>';
    const status = B.tally ? chip('Balance sheet tallies', 'good') : chip('Difference ' + fmt(B.liabTotal - B.assetTotal), 'bad');
    const warn = Math.abs(B.openingDiff) > 0.005 ? '<div class="note bad">Opening balances do not tally by ₹ ' + fmt(Math.abs(B.openingDiff)) + '. The difference is shown on the liabilities side. Correct it in Ledgers (capital or opening balances) or in Company Profile (opening stock).</div>' : '';
    return pageHead('Balance Sheet', 'As on ' + fdate(B.to) + ' · ' + fyTxt() + ' ' + status, '<button type="button" class="btn" data-act="csv" data-k="bs">Download CSV</button>') + warn
      + '<div class="cols2">' + panel('', side(B.liab, B.liabTotal, 'Liabilities and capital')) + panel('', side(B.assets, B.assetTotal, 'Assets')) + '</div>';
  };

  // ---------- Trial balance ----------
  A.pages['trial-balance'] = function () {
    const T = E.trialBalance(A.S, A.idx, A.ui.fy);
    let g = null, rows = '';
    T.rows.forEach((r) => { if (r.group !== g) { g = r.group; rows += '<tr class="sec"><td colspan="3">' + esc(g) + '</td></tr>'; } rows += '<tr class="l"><td class="in">' + esc(r.name) + '</td><td class="n">' + (r.dr ? fmt(r.dr) : '') + '</td><td class="n">' + (r.cr ? fmt(r.cr) : '') + '</td></tr>'; });
    return pageHead('Trial Balance', 'Debit and credit totals of every ledger · ' + fyTxt() + ' ' + (T.tally ? chip('Debits equal credits', 'good') : chip('Does not tally', 'bad')), '<button type="button" class="btn" data-act="csv" data-k="tb">Download CSV</button>')
      + panel('', '<div class="scroll"><table class="tbl stmt"><thead><tr><th>Ledger</th><th class="n">Debit ₹</th><th class="n">Credit ₹</th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr class="grand"><td>Total</td><td class="n">' + fmt(T.dr) + '</td><td class="n">' + fmt(T.cr) + '</td></tr></tfoot></table></div>');
  };

  // ---------- Taxation ----------
  const TAX_TABS = [['reg', 'Registration'], ['gst', 'GST summary'], ['sreg', 'Sales register'], ['preg', 'Purchase register'], ['hsn', 'Rates & HSN'], ['tds', 'TDS']];
  A.pages.taxation = function () {
    const tabs = '<div class="segs">' + TAX_TABS.map((t) => '<button type="button" class="seg ' + (A.ui.tax === t[0] ? 'on' : '') + '" data-act="taxTab" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
    return pageHead('Taxation', 'GST and TDS details · ' + fyTxt(), A.ui.tax === 'reg' ? '' : '<button type="button" class="btn" data-act="csv" data-k="tax-' + A.ui.tax + '">Download CSV</button>') + tabs + '<div id="taxBody">' + taxBody() + '</div>';
  };
  function taxBody() {
    const S = A.S, sy = A.ui.fy, { from, to } = E.fyRange(sy), tab = A.ui.tax;
    if (tab === 'reg') {
      const t = S.tax, st = E.stateName(S.company.stateCode);
      const spec = [
        { k: 'gstin', l: 'GSTIN', ph: '06ABCDE1234F1Z5', a: ' maxlength="15" autocapitalize="characters"', h: 'Printed on your invoices. 15 characters.' },
        { k: 'pan', l: 'PAN', ph: 'ABCDE1234F', a: ' maxlength="10" autocapitalize="characters"' },
        { k: 'tan', l: 'TAN', ph: 'DELA12345B', a: ' maxlength="10" autocapitalize="characters"', h: 'Needed to deduct and deposit TDS.' },
        { k: 'regType', l: 'GST registration type', t: 'select', o: ['Regular', 'Composition', 'Unregistered'] },
        { k: 'filing', l: 'Return filing frequency', t: 'select', o: ['Monthly', 'Quarterly (QRMP)'] },
        { k: 'regDate', l: 'GST registration date', t: 'date' },
        { k: 'defaultGst', l: 'Default GST rate on new items', t: 'select', o: [['0', '0%'], ['5', '5%'], ['12', '12%'], ['18', '18%'], ['28', '28%']] },
      ];
      return panel('Registration details', '<form id="taxForm" autocomplete="off"><div class="grid g3">' + fields(spec, t) + '</div><div class="note">Place of supply is decided from the state of your company (<b>' + esc(st || 'not set') + '</b>) against the party’s state. Different state means IGST; same state means CGST + SGST. Change your state in Company Profile.</div><div class="row"><button type="submit" class="btn pri">Save tax details</button></div></form>');
    }
    if (tab === 'gst') {
      const g = E.gstSummary(S, sy);
      const rw = (m, c) => '<tr class="' + (c || '') + '"><td>' + m.label + '</td><td class="n">' + fmt(m.sTaxable) + '</td><td class="n">' + fmt(m.oC) + '</td><td class="n">' + fmt(m.oS) + '</td><td class="n">' + fmt(m.oI) + '</td><td class="n">' + fmt(m.pTaxable) + '</td><td class="n">' + fmt(m.iC) + '</td><td class="n">' + fmt(m.iS) + '</td><td class="n">' + fmt(m.iI) + '</td><td class="n b">' + fmt(m.net) + '</td></tr>';
      const T = g.total;
      return '<div class="tiles t4">' + tile('Output GST', '₹ ' + fmt(T.out), 'Collected on sales') + tile('Input tax credit', '₹ ' + fmt(T.inp), 'Paid on purchases and expenses') + tile(T.net >= 0 ? 'Net GST payable' : 'Net credit', '₹ ' + fmt(Math.abs(T.net)), 'Before credit set-off rules', T.net > 0 ? 'neg' : '') + tile('Sales (taxable)', '₹ ' + fmt(T.sTaxable), '') + '</div>'
        + panel('Month-wise GST (GSTR-3B view)', '<div class="scroll"><table class="tbl"><thead><tr><th rowspan="2">Month</th><th colspan="4" class="c">Outward supplies</th><th colspan="4" class="c">Input tax credit</th><th rowspan="2" class="n">Net payable</th></tr><tr><th class="n">Taxable</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">IGST</th><th class="n">Taxable</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">IGST</th></tr></thead><tbody>' + g.months.map((m) => rw(m)).join('') + '</tbody><tfoot>' + rw(T, 'grand') + '</tfoot></table></div><div class="note">IGST credit is used first against IGST, then CGST and SGST. This table shows simple output minus input; apply the set-off order when you file.</div>');
    }
    if (tab === 'sreg' || tab === 'preg') {
      const type = tab === 'sreg' ? 'sale' : 'purchase';
      const vs = A.idx.vouchers.filter((v) => v.type === type && v.date >= from && v.date <= to);
      if (!vs.length) return panel('', empty('No ' + (type === 'sale' ? 'sales' : 'purchases') + ' in ' + fyTxt() + '.'));
      const T = { t: 0, c: 0, s: 0, i: 0, tot: 0 };
      const rows = vs.map((v) => { const p = A.idx.partyById.get(v.partyId) || {}; T.t += v.taxable; T.c += v.cgst; T.s += v.sgst; T.i += v.igst; T.tot += v.total; return '<tr><td>' + fdate(v.date) + '</td><td>' + viewBtn(v.id, type === 'sale' ? v.no : (v.refNo || v.no)) + '</td><td>' + esc(p.name || '') + '</td><td class="mono">' + esc(p.gstin || 'Unregistered') + '</td><td>' + esc(p.state || '') + '</td><td class="n">' + fmt(v.taxable) + '</td><td class="n">' + fmt(v.cgst) + '</td><td class="n">' + fmt(v.sgst) + '</td><td class="n">' + fmt(v.igst) + '</td><td class="n b">' + fmt(v.total) + '</td>' + (type === 'purchase' ? '<td>' + (v.itc === false ? chip('Not claimed', 'warn') : chip('Eligible', 'good')) + '</td>' : '') + '</tr>'; }).join('');
      return panel(type === 'sale' ? 'Sales register (GSTR-1 B2B / B2C view)' : 'Purchase register (input tax credit)', '<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>' + (type === 'sale' ? 'Invoice' : 'Supplier bill') + '</th><th>Party</th><th>GSTIN</th><th>State</th><th class="n">Taxable</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">IGST</th><th class="n">Total</th>' + (type === 'purchase' ? '<th>ITC</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody><tfoot><tr class="grand"><td colspan="5">Total</td><td class="n">' + fmt(T.t) + '</td><td class="n">' + fmt(T.c) + '</td><td class="n">' + fmt(T.s) + '</td><td class="n">' + fmt(T.i) + '</td><td class="n">' + fmt(T.tot) + '</td>' + (type === 'purchase' ? '<td></td>' : '') + '</tr></tfoot></table></div>');
    }
    if (tab === 'hsn') {
      const rs = E.rateSummary(S, sy, 'sale'), rp = E.rateSummary(S, sy, 'purchase'), h = E.hsnSummary(S, sy);
      const rt = (rows) => rows.length ? '<div class="scroll"><table class="tbl compact"><thead><tr><th>GST rate</th><th class="n">Taxable</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">IGST</th><th class="n">Total tax</th></tr></thead><tbody>' + rows.map((r) => '<tr><td>' + r.rate + '%</td><td class="n">' + fmt(r.taxable) + '</td><td class="n">' + fmt(r.cgst) + '</td><td class="n">' + fmt(r.sgst) + '</td><td class="n">' + fmt(r.igst) + '</td><td class="n b">' + fmt(r.tax) + '</td></tr>').join('') + '</tbody></table></div>' : empty('No data.');
      const ht = h.length ? '<div class="scroll"><table class="tbl compact"><thead><tr><th>HSN / SAC</th><th>Unit</th><th class="n">Quantity</th><th class="n">GST rate</th><th class="n">Taxable value</th><th class="n">Tax</th></tr></thead><tbody>' + h.map((r) => '<tr><td class="mono">' + esc(r.hsn) + '</td><td>' + esc(r.unit) + '</td><td class="n">' + r.qty + '</td><td class="n">' + r.gst + '%</td><td class="n">' + fmt(r.taxable) + '</td><td class="n">' + fmt(r.tax) + '</td></tr>').join('') + '</tbody></table></div>' : empty('No sales yet.');
      return '<div class="cols2">' + panel('Sales by GST rate', rt(rs)) + panel('Purchases by GST rate', rt(rp)) + '</div>' + panel('HSN summary of outward supplies (GSTR-1)', ht);
    }
    // tds
    const rows = S.vouchers.filter((v) => (v.type === 'receipt' || v.type === 'payment') && num(v.tds) > 0 && v.date >= from && v.date <= to);
    const rec = r2(rows.filter((v) => v.type === 'receipt').reduce((s, v) => s + num(v.tds), 0)), pay = r2(rows.filter((v) => v.type === 'payment').reduce((s, v) => s + num(v.tds), 0));
    const tb = rows.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Party</th><th class="n">Amount paid / received</th><th class="n">TDS</th></tr></thead><tbody>' + rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((v) => '<tr><td>' + fdate(v.date) + '</td><td>' + viewBtn(v.id, v.no) + '</td><td>' + chip(v.type === 'receipt' ? 'Deducted by customer' : 'Deducted by us', v.type === 'receipt' ? 'cust' : 'supp') + '</td><td>' + esc(E.nameOf(A.idx, v.counter)) + '</td><td class="n">' + fmt(v.amount) + '</td><td class="n b">' + fmt(v.tds) + '</td></tr>').join('') + '</tbody></table></div>' : empty('No TDS entries in ' + fyTxt() + '. Enter TDS on a receipt or payment voucher.');
    return '<div class="tiles t3">' + tile('TDS receivable', '₹ ' + fmt(E.balanceAt(A.idx, 'a:tds_rec', to)), 'Deducted by customers, claim in your return') + tile('TDS payable', '₹ ' + fmt(-E.balanceAt(A.idx, 'a:tds_pay', to)), 'Deducted by you, deposit with the government', '') + tile('TAN', S.tax.tan ? '<span class="mono">' + esc(S.tax.tan) + '</span>' : '<span class="muted">Not set</span>', '') + '</div>' + panel('TDS entries · ' + fyTxt() + ' (receivable ₹ ' + fmt(rec) + ' · payable ₹ ' + fmt(pay) + ')', tb);
  }
  A.taxBody = taxBody;

  // ---------- Company profile ----------
  A.pages.company = function () {
    const c = A.S.company;
    const id = [
      { k: 'name', l: 'Business name', c: 'w2' }, { k: 'legalName', l: 'Legal name (if different)', c: 'w2' },
      { k: 'constitution', l: 'Constitution', t: 'select', o: ['', 'Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited', 'Other'] },
      { k: 'phone', l: 'Phone' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'website', l: 'Website' },
    ];
    const ad = [{ k: 'address', l: 'Address', t: 'textarea', rows: 2, c: 'w2' }, { k: 'city', l: 'City' }, { k: 'stateCode', l: 'State', t: 'select', o: stateOpts() }, { k: 'pin', l: 'PIN code', a: ' inputmode="numeric" maxlength="6"' }];
    const bk = [{ k: 'bankName', l: 'Bank name' }, { k: 'branch', l: 'Branch' }, { k: 'bankAcc', l: 'Account number' }, { k: 'ifsc', l: 'IFSC', a: ' autocapitalize="characters"' }, { k: 'upi', l: 'UPI ID' }];
    const iv = [{ k: 'invPrefix', l: 'Invoice number prefix', h: 'Numbers look like INV/2026-27/0001' }, { k: 'signatory', l: 'Authorised signatory' }, { k: 'terms', l: 'Terms and conditions on invoice', t: 'textarea', rows: 4, c: 'w3' }];
    const books = '<div class="grid g3"><label class="fld"><span>Books begin on</span><input type="date" name="booksFrom" value="' + A.S.booksFrom + '"><small>First day of the financial year you start with. Opening balances are as on this date.</small></label><label class="fld"><span>Opening stock value</span><input type="number" step="any" name="openingStock" value="' + (A.S.stock.opening || '') + '" placeholder="0.00"><small>Stock in hand on the day books begin.</small></label></div>';
    return pageHead('Company Profile', 'These details appear on your invoices and statements.', '')
      + '<form id="coForm" autocomplete="off">' + panel('Identity and contact', '<div class="grid g4">' + fields(id, c) + '</div>') + panel('Address', '<div class="grid g4">' + fields(ad, c) + '</div>') + panel('Bank details for invoices', '<div class="grid g3">' + fields(bk, c) + '</div>') + panel('Invoice settings', '<div class="grid g3">' + fields(iv, c) + '</div>') + panel('Books', books)
      + '<div class="stickybar"><button type="submit" class="btn pri">Save company profile</button></div></form>';
  };

  // ---------- Ledgers (chart of accounts) ----------
  // ---------- stock items ----------
  A.itemArea = function () {
    const S = A.S, mv = E.itemStock(S), q = (A.ui.itemQ || '').toLowerCase();
    const list = (S.items || []).filter((i) => !q || i.name.toLowerCase().includes(q) || (i.hsn || '').includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    let val = 0;
    const rows = list.map((i) => {
      const m = mv.get(E.itemKey(i.name)) || { open: 0, inQty: 0, outQty: 0, onHand: 0 }, v = r2(Math.max(0, m.onHand) * num(i.purchaseRate)); val += v;
      return '<tr><td class="b"><button type="button" class="lnk" data-act="itemLedger" data-id="' + i.id + '">' + esc(i.name) + '</button></td><td class="mono">' + esc(i.hsn || '—') + '</td><td>' + esc(i.unit || '') + '</td><td class="n">' + num(i.gst) + '%</td><td class="n">' + (num(i.saleRate) ? fmt(i.saleRate) : '—') + '</td><td class="n">' + (num(i.purchaseRate) ? fmt(i.purchaseRate) : '—') + '</td><td class="n">' + m.open + '</td><td class="n">' + m.inQty + '</td><td class="n">' + m.outQty + '</td><td class="n ' + (m.onHand < 0 ? 'red' : '') + '"><b>' + m.onHand + '</b></td><td class="n">' + fmt(v) + '</td><td><div class="ra"><button type="button" class="lnk" data-act="editItem" data-id="' + i.id + '">Edit</button></div></td></tr>';
    }).join('');
    const table = list.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>Item</th><th>HSN</th><th>Unit</th><th class="n">GST</th><th class="n">Sale rate</th><th class="n">Buy rate</th><th class="n">Opening</th><th class="n">In</th><th class="n">Out</th><th class="n">Stock</th><th class="n">Value ₹</th><th></th></tr></thead><tbody>' + rows + '</tbody><tfoot><tr><td colspan="10">Stock value at purchase rate</td><td class="n">' + fmt(val) + '</td><td></td></tr></tfoot></table></div>' : '<div class="empty">' + ((S.items || []).length ? 'No item matches your search.' : 'No stock items yet. Items are added automatically when you save a purchase bill or sale invoice, or add one here.') + '</div>';
    return table + '<div class="note">Stock = opening + purchased − sold, counted across all years. It does not change the closing stock value used in Profit &amp; Loss. Enter that on the Profit &amp; Loss page.</div>';
  };
  A.pages.items = function () {
    const filt = '<div class="filters"><input type="search" data-f="itemQ" placeholder="Search item or HSN" value="' + esc(A.ui.itemQ || '') + '" aria-label="Search items"></div>';
    return pageHead('Inventory', 'Stock goes up with every purchase bill and down with every sale invoice. Click an item to see its stock ledger.', '<button type="button" class="btn pri" data-act="newItem">＋ New item</button>') + panel('', filt + '<div id="itemArea">' + A.itemArea() + '</div>');
  };

  A.pages.accounts = function () {
    const S = A.S, to = E.fyRange(A.ui.fy).to, { from } = E.fyRange(A.ui.fy);
    let h = '';
    E.GROUP_ORDER.forEach((g) => {
      const list = S.accounts.filter((a) => a.group === g);
      if (!list.length) return;
      h += '<tr class="sec"><td colspan="3">' + esc(g) + ' <span class="muted sm">' + (E.isNominal(g) ? 'Income / expense' : 'Balance sheet') + '</span></td><td></td></tr>';
      list.forEach((a) => {
        const key = 'a:' + a.id; let bal;
        if (E.isNominal(g)) { const s = E.sumRange(A.idx, key, from, to); bal = r2(s.dr - s.cr); } else bal = E.balanceAt(A.idx, key, to);
        h += '<tr class="l"><td class="in">' + esc(a.name) + (a.sys ? ' <span class="muted sm" title="Used by the system">system</span>' : '') + '</td><td class="n">' + (E.isNominal(g) ? '—' : (num(a.opening) ? fmt(a.opening) + ' ' + a.openingType : '—')) + '</td><td class="n">' + dc(bal) + '</td><td><div class="ra"><button type="button" class="lnk" data-act="goLedger" data-id="a:' + a.id + '">Ledger</button><button type="button" class="lnk" data-act="editAcct" data-id="' + a.id + '">Edit</button></div></td></tr>';
      });
    });
    return pageHead('Ledgers', 'Chart of accounts. Add bank accounts, expense heads and other ledgers.', '<button type="button" class="btn pri" data-act="newAcct">＋ New ledger</button>') + panel('', '<div class="scroll"><table class="tbl stmt"><thead><tr><th>Ledger</th><th class="n">Opening</th><th class="n">Balance (' + fyTxt() + ')</th><th></th></tr></thead><tbody>' + h + '</tbody></table></div><div class="note">Customers and suppliers are kept under Party Profiles and appear in the trial balance as Sundry Debtors and Sundry Creditors.</div>');
  };

  // ---------- Backup & data ----------
  // ---------- Tally import ----------
  A.tallyReport = function (D, rep, open) {
    const S = A.S, li = (a) => '<li>' + a + '</li>', n = (x) => '<b>' + x + '</b>';
    const vt = rep.vouchers, labels = { sale: 'Sales', purchase: 'Purchases', receipt: 'Receipts', payment: 'Payments', expense: 'Expenses', contra: 'Contra' };
    const vlist = Object.keys(vt).map((k) => n(vt[k]) + ' ' + labels[k].toLowerCase()).join(', ');
    const skipped = Object.keys(rep.skipped).map((k) => li(n(rep.skipped[k]) + ' ' + esc(k))).join('');
    const nothing = !D.ledgers.length && !D.items.length && !D.vouchers.length;
    const hasWork = rep.imported || rep.parties.added || rep.accounts.added || rep.items.added;
    return '<div class="note ' + (nothing ? 'bad' : '') + '">' + (nothing ? 'No Tally data found in these files. Export from Tally Prime in the XML (Data Interchange) format and try again.' : 'Found ' + n(D.ledgers.length) + ' ledgers, ' + n(D.items.length) + ' stock items and ' + n(D.vouchers.length) + ' vouchers.') + '</div>'
      + (nothing ? '' : '<div class="cols2"><div><h4>Will be added</h4><ul class="plain">'
        + li(n(rep.parties.added) + ' new parties (' + rep.parties.matched + ' already in your books)')
        + li(n(rep.accounts.added) + ' new ledgers, ' + n(rep.items.added) + ' new stock items')
        + li(rep.imported ? n(rep.imported) + ' vouchers: ' + vlist : 'No new vouchers')
        + (rep.duplicates ? li(n(rep.duplicates) + ' vouchers were already imported earlier and are left as they are') : '')
        + (rep.booksFrom ? li('Books will start from ' + n(A.u.fdate(rep.booksFrom)) + ' so the old vouchers show in reports') : '')
        + '</ul></div><div><h4>Not imported</h4><ul class="plain">' + (skipped || li('Nothing skipped')) + '</ul>' + (rep.skipped['journal vouchers'] ? '<small class="muted">Journal vouchers, credit notes and debit notes are not supported yet.</small>' : '') + '</div></div>'
        + (!D.ledgers.length ? '<div class="note">No ledger list found. Parties and bank or cash accounts are guessed from voucher names. For best results also export <b>Masters</b> (Ledgers, Groups, Stock Items) and pick that file together with the vouchers file.</div>' : '')
        + (rep.warnings.length ? '<div class="note"><b>Please check</b><ul class="plain">' + rep.warnings.map((w) => li(esc(w))).join('') + '</ul>' + (rep.warningsMore ? '<small>and ' + rep.warningsMore + ' more.</small>' : '') + '</div>' : '')
        + '<div class="row"><button type="button" class="btn" data-act="tallyToggleOpen">Opening balances from Tally: ' + (open ? 'ON' : 'OFF') + '</button><small class="muted">Turn OFF if your Tally file starts mid-year or your opening balances are already entered here.</small></div>'
        + '<div class="row">' + (S.demo ? '<div class="err">You are looking at sample data. Use Start my own books first, then import.</div><button type="button" class="btn" data-act="startFresh">Start my own books</button>' : '<button type="button" class="btn pri" data-act="tallyGo"' + (hasWork ? '' : ' disabled') + '>Import into my books</button>') + '</div>');
  };
  A.pages.tally = function () {
    return pageHead('Import from Tally', 'Bring parties, ledgers, stock items and vouchers from Tally Prime into these books.', '')
      + panel('Step 1. Export from Tally Prime', '<ol class="plain"><li>In Tally Prime press <b>Alt+E</b> (Export) and choose <b>Masters</b>. Pick Ledgers, Groups and Stock Items. Format: <b>XML (Data Interchange)</b>.</li><li>Press <b>Alt+E</b> again and choose <b>Vouchers</b> for the period you want. Format: <b>XML (Data Interchange)</b>.</li><li>You get two XML files. Keep them on this device.</li></ol>')
      + panel('Step 2. Choose the files', '<label class="fld"><span>Tally XML files (select both together)</span><input type="file" id="tallyFiles" accept=".xml,.txt,text/xml,application/xml" multiple></label><div class="row"><button type="button" class="btn pri" data-act="tallyRead">Read files</button></div><div id="tallyOut" class="tallyout"></div>')
      + '<div class="note">Importing again later is safe. Vouchers that are already here are skipped. Sales, receipts and payments are matched bill by bill. Tally GST ledgers are mapped to the GST accounts in these books.</div>';
  };

  A.pages.data = function () {
    const S = A.S, m = A.store.mode;
    const where = m === 'cloud' ? 'Your books are stored in your Claude account and open on any device you sign in to.' : m === 'local' ? 'Your books are stored in this browser only. Download a backup regularly.' : 'Your books are not being stored right now.';
    const empty0 = !S.vouchers.length && !S.parties.length;
    return pageHead('Backup & Data', where, '')
      + '<div class="cols2">' + panel('Backup', '<p>Download everything (company, parties, ledgers, vouchers) as one JSON file.</p><div class="row"><button type="button" class="btn pri" data-act="exportJSON">Download backup</button></div><p class="muted sm">' + S.parties.length + ' parties · ' + S.vouchers.length + ' vouchers · ' + S.accounts.length + ' ledgers</p>')
      + panel('Restore', '<p>Restore a backup file. This replaces all current data.</p><label class="fld"><span>Backup file (.json)</span><input type="file" id="importFile" accept=".json,application/json"></label><div class="row"><button type="button" class="btn" data-act="importJSON">Restore from file</button></div>') + '</div>'
      + panel('Start over', '<div class="row">' + (empty0 ? '<button type="button" class="btn" data-act="loadSample">Load sample data</button>' : '') + '<button type="button" class="btn dng" data-act="clearAll">Erase all data</button></div><p class="muted sm">Sample data is for trying the app. Erasing removes every party, voucher and ledger setting and cannot be undone, so download a backup first.</p>');
  };

  // ---------- CSV ----------
  A.csvFor = function (k) {
    const S = A.S, sy = A.ui.fy, idx = A.idx, { from, to } = E.fyRange(sy);
    const f2 = (n) => r2(n).toFixed(2);
    if (k === 'ledger') {
      const L = A.ui.led, led = E.ledger(S, idx, L.key, L.from, L.to);
      return [E.nameOf(idx, L.key) + ' ledger', ['Date', 'Particulars', 'Type', 'Voucher', 'Debit', 'Credit', 'Balance (Dr+/Cr-)'], ['', 'Opening balance', '', '', '', '', f2(led.opening)]].concat(led.rows.map((r) => [r.date, r.particulars, r.type, r.no, r.dr || '', r.cr || '', f2(r.bal)]), [['', 'Closing balance', '', '', f2(led.dr), f2(led.cr), f2(led.closing)]]);
    }
    if (k === 'debtors' || k === 'creditors') {
      const rows = outstandingRows(k === 'debtors' ? 'Dr' : 'Cr');
      return [['Party', 'GSTIN', 'Credit days', 'Not due', '1-30', '31-60', '61-90', '90+', 'Advance', 'Net']].concat(rows.map((r) => [r.p.name, r.p.gstin, r.p.creditDays].concat(r.a.buckets.map(f2), [f2(r.a.advance), f2(r.a.net)])));
    }
    if (k === 'pnl') {
      const P = E.pnl(S, idx, sy), out = [['Particulars', 'Amount']];
      const add = (t, l) => { out.push([t, '']); l.forEach((x) => out.push(['  ' + x.name, f2(x.amt)])); };
      add('Sales', P.sales); add('Direct income', P.dinc); out.push(['Closing stock', f2(P.closing)], ['Opening stock', f2(P.opening)]); add('Purchases', P.purch); add('Direct expenses', P.dexp); out.push(['Gross profit', f2(P.gross)]); add('Other income', P.iinc); add('Operating expenses', P.iexp); out.push(['Net profit', f2(P.net)]);
      return out;
    }
    if (k === 'bs') {
      const B = E.balanceSheet(S, idx, sy), out = [['Side', 'Section', 'Particulars', 'Amount']];
      B.liab.forEach((s) => s.lines.forEach((l) => out.push(['Liabilities', s.section, l.name, f2(l.amt)]))); out.push(['Liabilities', '', 'Total', f2(B.liabTotal)]);
      B.assets.forEach((s) => s.lines.forEach((l) => out.push(['Assets', s.section, l.name, f2(l.amt)]))); out.push(['Assets', '', 'Total', f2(B.assetTotal)]);
      return out;
    }
    if (k === 'tb') { const T = E.trialBalance(S, idx, sy); return [['Group', 'Ledger', 'Debit', 'Credit']].concat(T.rows.map((r) => [r.group, r.name, r.dr ? f2(r.dr) : '', r.cr ? f2(r.cr) : '']), [['', 'Total', f2(T.dr), f2(T.cr)]]); }
    if (k === 'tax-gst') { const g = E.gstSummary(S, sy); return [['Month', 'Sales taxable', 'Output CGST', 'Output SGST', 'Output IGST', 'Purchase taxable', 'Input CGST', 'Input SGST', 'Input IGST', 'Net payable']].concat(g.months.concat([g.total]).map((m) => [m.label, m.sTaxable, m.oC, m.oS, m.oI, m.pTaxable, m.iC, m.iS, m.iI, m.net].map((x, i) => (i ? f2(x) : x)))); }
    if (k === 'tax-sreg' || k === 'tax-preg') {
      const type = k === 'tax-sreg' ? 'sale' : 'purchase';
      return [['Date', 'Invoice no', 'Supplier bill no', 'Party', 'GSTIN', 'State', 'Taxable', 'CGST', 'SGST', 'IGST', 'Round off', 'Total']].concat(idx.vouchers.filter((v) => v.type === type && v.date >= from && v.date <= to).map((v) => { const p = idx.partyById.get(v.partyId) || {}; return [v.date, v.no, v.refNo || '', p.name, p.gstin, p.state, f2(v.taxable), f2(v.cgst), f2(v.sgst), f2(v.igst), f2(v.roundOff), f2(v.total)]; }));
    }
    if (k === 'tax-hsn') return [['HSN/SAC', 'Unit', 'Quantity', 'GST rate', 'Taxable value', 'Tax']].concat(E.hsnSummary(S, sy).map((r) => [r.hsn, r.unit, r.qty, r.gst, f2(r.taxable), f2(r.tax)]));
    if (k === 'tax-tds') return [['Date', 'Voucher', 'Type', 'Party', 'Amount', 'TDS']].concat(S.vouchers.filter((v) => (v.type === 'receipt' || v.type === 'payment') && num(v.tds) > 0 && v.date >= from && v.date <= to).map((v) => [v.date, v.no, v.type === 'receipt' ? 'Deducted by customer' : 'Deducted by us', E.nameOf(idx, v.counter), f2(v.amount), f2(v.tds)]));
    return [[]];
  };

  // ---------- shell & router ----------
  const NAV = [
    ['Overview', [['dashboard', 'Dashboard']]],
    ['Transactions', [['sales', 'Sales'], ['purchases', 'Purchases'], ['receipts', 'Receipts'], ['payments', 'Payments'], ['expenses', 'Expenses'], ['contra', 'Contra'], ['daybook', 'Day Book']]],
    ['Stock', [['items', 'Inventory']]],
    ['Parties', [['parties', 'Party Profiles'], ['ledger', 'Party Ledger'], ['debtors', 'Sundry Debtors'], ['creditors', 'Sundry Creditors']]],
    ['Statements', [['pnl', 'Profit & Loss'], ['balance-sheet', 'Balance Sheet'], ['trial-balance', 'Trial Balance']]],
    ['Compliance', [['taxation', 'Taxation (GST, TDS)']]],
    ['Setup', [['company', 'Company Profile'], ['accounts', 'Ledgers'], ['tally', 'Import from Tally'], ['data', 'Backup & Data'], ['security', 'Security']]],
  ];
  const routeName = () => (location.hash || '#dashboard').slice(1) || 'dashboard';
  A.buildNav = function () {
    document.getElementById('nav').innerHTML = NAV.map((g) => '<div class="ng"><div class="nl">' + g[0] + '</div>' + g[1].map((i) => '<a href="#' + i[0] + '" data-r="' + i[0] + '">' + i[1] + '</a>').join('') + '</div>').join('');
  };
  A.chrome = function () {
    const S = A.S; if (!S) return;
    document.getElementById('coName').textContent = S.company.name || 'Your company';
    const fy = document.getElementById('fySel');
    fy.innerHTML = A.fyList().map((y) => '<option value="' + y + '"' + (y === A.ui.fy ? ' selected' : '') + '>FY ' + E.fyLabel(y) + '</option>').join('');
    const b = document.getElementById('banner');
    b.hidden = !S.demo;
    b.innerHTML = S.demo ? '<span><b>Sample data.</b> You are exploring a demo company. Changes here are not saved.</span><button type="button" class="btn pri sm" data-act="startFresh">Start my own books</button>' : '';
    if (A.store.loadError) { b.hidden = false; b.innerHTML = A.store.fellBack ? '<span><b>Server se connect nahi hua.</b> Abhi changes sirf is browser me rahenge; internet aane par page reload karein to upload ka option milega.</span>' : '<span><b>Could not reach your saved books.</b> Working from this browser’s storage for now.</span>'; }
    A.setStatus();
  };
  A.render = function () {
    if (!A.S) return;
    let r = routeName();
    let html, nav = r;
    if (r.startsWith('party-')) { html = A.pages.partyProfile(r.slice(6)); nav = 'parties'; }
    else if (A.pages[r]) html = A.pages[r]();
    else { r = 'dashboard'; nav = r; html = A.pages.dashboard(); }
    document.getElementById('view').innerHTML = html;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === nav));
    document.title = 'Sahara & Associates — Books';
  };
  A.refresh = function () { A.idx = E.buildIndex(A.S); A._stats = null; A.chrome(); A.render(); };
  A.go = (r) => { if (location.hash === '#' + r) A.render(); else location.hash = r; };
  window.addEventListener('hashchange', () => { document.getElementById('side').classList.remove('open'); A.render(); document.getElementById('main').scrollTo(0, 0); });
  A.routeName = routeName;
})();
