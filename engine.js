/* Sahara & Associates — accounting engine (pure logic, no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const pad = (n, l) => String(n).padStart(l, '0');

  const STATES = [['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra & Nagar Haveli and Daman & Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman & Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory']];
  const stateName = (code) => { const s = STATES.find((x) => x[0] === code); return s ? s[1] : ''; };

  const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
  const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

  // ---------- dates ----------
  const fyStartYear = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 4 ? y : y - 1; };
  const fyRange = (sy) => ({ from: sy + '-04-01', to: (sy + 1) + '-03-31' });
  const fyLabel = (sy) => sy + '-' + String(sy + 1).slice(2);
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fyMonths = (sy) => { const out = []; for (let i = 0; i < 12; i++) { const m = ((3 + i) % 12) + 1; const y = m >= 4 ? sy : sy + 1; out.push({ key: y + '-' + pad(m, 2), label: MONTHS[m - 1] + ' ' + String(y).slice(2) }); } return out; };

  // ---------- chart of accounts ----------
  const GROUPS = {
    'Cash-in-Hand': { kind: 'real', nature: 'A' },
    'Bank Accounts': { kind: 'real', nature: 'M' },
    'Fixed Assets': { kind: 'real', nature: 'A' },
    'Other Current Assets': { kind: 'real', nature: 'A' },
    'Duties & Taxes': { kind: 'real', nature: 'M' },
    'Current Liabilities': { kind: 'real', nature: 'L' },
    'Loans (Liability)': { kind: 'real', nature: 'L' },
    'Capital Account': { kind: 'real', nature: 'L' },
    'Sales Accounts': { kind: 'nominal', side: 'income', sec: 'trading' },
    'Direct Income': { kind: 'nominal', side: 'income', sec: 'trading' },
    'Purchase Accounts': { kind: 'nominal', side: 'expense', sec: 'trading' },
    'Direct Expenses': { kind: 'nominal', side: 'expense', sec: 'trading' },
    'Indirect Income': { kind: 'nominal', side: 'income', sec: 'pl' },
    'Indirect Expenses': { kind: 'nominal', side: 'expense', sec: 'pl' },
  };
  const GROUP_ORDER = Object.keys(GROUPS);
  const isNominal = (g) => !!GROUPS[g] && GROUPS[g].kind === 'nominal';

  function defaultAccounts() {
    const A = (id, name, group, sys) => ({ id, name, group, opening: 0, openingType: 'Dr', sys: !!sys });
    return [
      A('cash', 'Cash', 'Cash-in-Hand', 1),
      A('bank1', 'Bank Account', 'Bank Accounts'),
      A('sales', 'Sales', 'Sales Accounts', 1),
      A('purchase', 'Purchases', 'Purchase Accounts', 1),
      A('gst_out_cgst', 'Output CGST', 'Duties & Taxes', 1),
      A('gst_out_sgst', 'Output SGST', 'Duties & Taxes', 1),
      A('gst_out_igst', 'Output IGST', 'Duties & Taxes', 1),
      A('gst_in_cgst', 'Input CGST', 'Duties & Taxes', 1),
      A('gst_in_sgst', 'Input SGST', 'Duties & Taxes', 1),
      A('gst_in_igst', 'Input IGST', 'Duties & Taxes', 1),
      A('tds_pay', 'TDS Payable', 'Duties & Taxes', 1),
      A('tds_rec', 'TDS Receivable', 'Other Current Assets', 1),
      A('round', 'Round Off', 'Indirect Expenses', 1),
      A('capital', 'Capital Account', 'Capital Account', 1),
      A('fixed', 'Furniture & Equipment', 'Fixed Assets'),
      A('advances', 'Loans & Advances (Asset)', 'Other Current Assets'),
      A('loan', 'Unsecured Loan', 'Loans (Liability)'),
      A('freight_in', 'Freight Inward', 'Direct Expenses'),
      A('wages', 'Wages & Labour', 'Direct Expenses'),
      A('rent', 'Rent', 'Indirect Expenses'),
      A('salary', 'Salaries', 'Indirect Expenses'),
      A('electricity', 'Electricity', 'Indirect Expenses'),
      A('telephone', 'Telephone & Internet', 'Indirect Expenses'),
      A('office', 'Office Expenses', 'Indirect Expenses'),
      A('travel', 'Travelling & Conveyance', 'Indirect Expenses'),
      A('bankchg', 'Bank Charges', 'Indirect Expenses'),
      A('prof', 'Professional Fees', 'Indirect Expenses'),
      A('repairs', 'Repairs & Maintenance', 'Indirect Expenses'),
      A('advert', 'Advertisement', 'Indirect Expenses'),
      A('interest_paid', 'Interest Paid', 'Indirect Expenses'),
      A('misc', 'Miscellaneous Expenses', 'Indirect Expenses'),
      A('int_rec', 'Interest Received', 'Indirect Income'),
      A('disc_rec', 'Discount Received', 'Indirect Income'),
      A('other_inc', 'Other Income', 'Indirect Income'),
    ];
  }

  function defaultState(todayISO) {
    const sy = fyStartYear(todayISO);
    return {
      v: 1,
      booksFrom: fyRange(sy).from,
      company: {
        name: 'Sahara & Associates', legalName: '', constitution: '', address: '', city: '', state: 'Haryana', stateCode: '06', pin: '',
        phone: '', email: '', website: '', bankName: '', bankAcc: '', ifsc: '', branch: '', upi: '',
        invPrefix: 'INV', signatory: '',
        terms: '1. Goods once sold will not be taken back.\n2. Interest at 18% p.a. is chargeable on overdue payments.\n3. Subject to local jurisdiction.',
      },
      tax: { gstin: '', pan: '', tan: '', regType: 'Regular', filing: 'Monthly', regDate: '', defaultGst: 18 },
      accounts: defaultAccounts(),
      parties: [],
      vouchers: [],
      stock: { opening: 0, closing: {} },
    };
  }

  // ---------- invoice math ----------
  /** taxMode 'excl' (default): rates are before GST. 'incl': rates already include GST. */
  function calcLines(lines, interstate, taxMode) {
    const incl = taxMode === 'incl';
    let taxable = 0, cgst = 0, sgst = 0, igst = 0, gross = 0, disc = 0;
    const out = (lines || []).map((l) => {
      const base = r2(num(l.qty) * num(l.rate));
      const dv = r2(base * num(l.disc) / 100);
      const tv = r2(base - dv);
      const g = num(l.gst);
      let c = 0, s = 0, i = 0, tvx = tv, gl = base, dl = dv;
      if (incl) {
        tvx = r2(tv / (1 + g / 100));
        const tx = r2(tv - tvx);
        gl = r2(base / (1 + g / 100)); dl = r2(gl - tvx);
        if (interstate) i = tx; else { c = r2(tx / 2); s = r2(tx - c); }
      } else if (interstate) i = r2(tv * g / 100); else { c = r2(tv * g / 200); s = r2(tv * g / 200); }
      gross += gl; disc += dl; taxable += tvx; cgst += c; sgst += s; igst += i;
      return Object.assign({}, l, { amount: tvx, discAmt: dl, cgst: c, sgst: s, igst: i, lineTotal: r2(tvx + c + s + i) });
    });
    taxable = r2(taxable); cgst = r2(cgst); sgst = r2(sgst); igst = r2(igst);
    const tax = r2(cgst + sgst + igst);
    const subtotal = r2(taxable + tax);
    const total = Math.round(subtotal);
    return { lines: out, gross: r2(gross), disc: r2(disc), taxable, cgst, sgst, igst, tax, subtotal, roundOff: r2(total - subtotal), total };
  }

  function calcExpense(amount, rate, interstate) {
    const a = r2(num(amount)), g = num(rate);
    let cgst = 0, sgst = 0, igst = 0;
    if (interstate) igst = r2(a * g / 100); else { cgst = r2(a * g / 200); sgst = r2(a * g / 200); }
    const tax = r2(cgst + sgst + igst);
    return { cgst, sgst, igst, tax, total: r2(a + tax) };
  }

  function isInterstate(state, party) {
    const mine = state.company.stateCode;
    if (!party || !party.stateCode || !mine) return false;
    return party.stateCode !== mine;
  }

  /** Build a complete sale / purchase voucher from form values. */
  function buildInvoice(state, base) {
    const party = state.parties.find((p) => p.id === base.partyId);
    const inter = base.interstate != null ? !!base.interstate : isInterstate(state, party);
    const c = calcLines(base.lines, inter, base.taxMode);
    return Object.assign({}, base, {
      taxMode: base.taxMode === 'incl' ? 'incl' : 'excl', interstate: inter, lines: c.lines, gross: c.gross, disc: c.disc, taxable: c.taxable,
      cgst: c.cgst, sgst: c.sgst, igst: c.igst, tax: c.tax, roundOff: c.roundOff, total: c.total,
    });
  }

  function buildExpense(base) {
    const c = calcExpense(base.amount, base.gst, base.interstate);
    return Object.assign({}, base, { amount: r2(num(base.amount)), cgst: c.cgst, sgst: c.sgst, igst: c.igst, tax: c.tax, total: c.total });
  }

  // ---------- double entry ----------
  function postingsOf(v) {
    const P = [];
    const add = (acct, dr, cr) => { dr = r2(dr); cr = r2(cr); if (acct && (dr || cr)) P.push({ acct, dr, cr }); };
    const taxIn = () => { add('a:gst_in_cgst', v.cgst, 0); add('a:gst_in_sgst', v.sgst, 0); add('a:gst_in_igst', v.igst, 0); };
    switch (v.type) {
      case 'sale':
        add('p:' + v.partyId, v.total, 0);
        add('a:sales', 0, v.taxable);
        add('a:gst_out_cgst', 0, v.cgst); add('a:gst_out_sgst', 0, v.sgst); add('a:gst_out_igst', 0, v.igst);
        if (v.roundOff > 0) add('a:round', 0, v.roundOff); else if (v.roundOff < 0) add('a:round', -v.roundOff, 0);
        break;
      case 'purchase': {
        const itc = v.itc !== false;
        add('a:purchase', num(v.taxable) + (itc ? 0 : num(v.tax)), 0);
        if (itc) taxIn();
        add('p:' + v.partyId, 0, v.total);
        if (v.roundOff > 0) add('a:round', v.roundOff, 0); else if (v.roundOff < 0) add('a:round', 0, -v.roundOff);
        break;
      }
      case 'expense': {
        const itc = v.itc !== false;
        add(v.head, num(v.amount) + (itc ? 0 : num(v.tax)), 0);
        if (itc) taxIn();
        add(v.paidFrom, 0, v.total);
        break;
      }
      case 'receipt':
        add(v.mode, v.amount, 0); add('a:tds_rec', v.tds, 0); add(v.counter, 0, num(v.amount) + num(v.tds));
        break;
      case 'payment':
        add(v.counter, num(v.amount) + num(v.tds), 0); add(v.mode, 0, v.amount); add('a:tds_pay', 0, v.tds);
        break;
      case 'contra':
        add(v.to, v.amount, 0); add(v.from, 0, v.amount);
        break;
    }
    return P;
  }

  function buildIndex(state) {
    const vouchers = state.vouchers.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0)));
    const rows = [], byAcct = new Map();
    vouchers.forEach((v) => {
      const P = postingsOf(v);
      P.forEach((p) => {
        const row = { date: v.date, vid: v.id, type: v.type, no: v.no, acct: p.acct, dr: p.dr, cr: p.cr, v, P };
        rows.push(row);
        if (!byAcct.has(p.acct)) byAcct.set(p.acct, []);
        byAcct.get(p.acct).push(row);
      });
    });
    return {
      rows, byAcct, vouchers,
      partyById: new Map(state.parties.map((p) => [p.id, p])),
      acctById: new Map(state.accounts.map((a) => [a.id, a])),
    };
  }

  const nameOf = (idx, key) => {
    if (!key) return '';
    if (key[0] === 'p') { const p = idx.partyById.get(key.slice(2)); return p ? p.name : '(deleted party)'; }
    const a = idx.acctById.get(key.slice(2)); return a ? a.name : '(deleted ledger)';
  };

  const openingOf = (idx, key) => {
    if (key[0] === 'p') { const p = idx.partyById.get(key.slice(2)); return p ? (p.openingType === 'Cr' ? -1 : 1) * num(p.opening) : 0; }
    const a = idx.acctById.get(key.slice(2));
    if (!a || isNominal(a.group)) return 0;
    return (a.openingType === 'Cr' ? -1 : 1) * num(a.opening);
  };

  const sumRange = (idx, key, from, to) => {
    let dr = 0, cr = 0;
    for (const r of idx.byAcct.get(key) || []) {
      if (from && r.date < from) continue;
      if (to && r.date > to) continue;
      dr += r.dr; cr += r.cr;
    }
    return { dr: r2(dr), cr: r2(cr) };
  };
  const balanceAt = (idx, key, to) => { const s = sumRange(idx, key, null, to); return r2(openingOf(idx, key) + s.dr - s.cr); };

  function counterName(idx, row, key) {
    const side = row.dr > 0 ? 'cr' : 'dr';
    let best = null;
    row.P.forEach((p) => { if (p.acct !== key && p[side] > 0 && (!best || p[side] > best[side])) best = p; });
    return best ? nameOf(idx, best.acct) : '';
  }

  /** Statement for one ledger (party or account) between from..to. */
  function ledger(state, idx, key, from, to) {
    const before = from ? sumRange(idx, key, null, addDays(from, -1)) : { dr: 0, cr: 0 };
    const opening = r2(openingOf(idx, key) + before.dr - before.cr);
    let run = opening, dr = 0, cr = 0;
    const rows = [];
    for (const r of idx.byAcct.get(key) || []) {
      if (from && r.date < from) continue;
      if (to && r.date > to) continue;
      run = r2(run + r.dr - r.cr); dr += r.dr; cr += r.cr;
      rows.push({ date: r.date, vid: r.vid, type: r.type, no: r.v.refNo && r.type === 'purchase' ? r.no + ' / ' + r.v.refNo : r.no, particulars: counterName(idx, r, key), narration: r.v.narration || '', dr: r.dr, cr: r.cr, bal: run });
    }
    return { opening, rows, dr: r2(dr), cr: r2(cr), closing: run };
  }

  // ---------- bills, allocations, ageing ----------
  function allocMap(state, asOf) {
    const m = new Map();
    state.vouchers.forEach((v) => {
      if ((v.type === 'receipt' || v.type === 'payment') && v.alloc && (!asOf || v.date <= asOf)) v.alloc.forEach((a) => m.set(a.ref, (m.get(a.ref) || 0) + num(a.amt)));
    });
    return m;
  }

  function partyBills(state, idx, partyId, asOf) {
    const p = idx.partyById.get(partyId), key = 'p:' + partyId, all = [];
    if (p && num(p.opening) > 0 && (!asOf || state.booksFrom <= asOf)) all.push({ ref: 'open:' + partyId, date: state.booksFrom, due: state.booksFrom, no: 'Opening balance', amount: num(p.opening), side: p.openingType === 'Cr' ? 'Cr' : 'Dr', type: 'opening' });
    state.vouchers.forEach((v) => {
      if (asOf && v.date > asOf) return;
      if (v.type === 'sale' && v.partyId === partyId) all.push({ ref: v.id, date: v.date, due: v.dueDate || v.date, no: v.no, amount: v.total, side: 'Dr', type: 'sale' });
      else if (v.type === 'purchase' && v.partyId === partyId) all.push({ ref: v.id, date: v.date, due: v.dueDate || v.date, no: v.refNo || v.no, amount: v.total, side: 'Cr', type: 'purchase' });
      else if (v.type === 'expense' && v.paidFrom === key) all.push({ ref: v.id, date: v.date, due: v.dueDate || v.date, no: v.refNo || v.no, amount: v.total, side: 'Cr', type: 'expense' });
    });
    const am = allocMap(state, asOf);
    all.forEach((b) => { b.paid = r2(am.get(b.ref) || 0); b.out = r2(b.amount - b.paid); });
    const refs = new Set(all.map((b) => b.ref));
    let advCr = 0, advDr = 0;
    state.vouchers.forEach((v) => {
      if (asOf && v.date > asOf) return;
      if ((v.type === 'receipt' || v.type === 'payment') && v.counter === key) {
        const settle = r2(num(v.amount) + num(v.tds));
        const used = (v.alloc || []).filter((a) => refs.has(a.ref)).reduce((s, a) => s + num(a.amt), 0);
        const un = r2(settle - used);
        if (v.type === 'receipt') advCr += un; else advDr += un;
      }
    });
    return { all, bills: all.filter((b) => b.out > 0.004), advCr: r2(advCr), advDr: r2(advDr) };
  }

  function ageing(state, idx, partyId, kind, asOf) {
    const b = partyBills(state, idx, partyId, asOf);
    const buckets = [0, 0, 0, 0, 0];
    b.bills.filter((x) => x.side === kind).forEach((x) => {
      const d = daysBetween(x.due, asOf);
      buckets[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4] += x.out;
    });
    const opp = b.bills.filter((x) => x.side !== kind).reduce((s, x) => s + x.out, 0);
    const advance = r2((kind === 'Dr' ? b.advCr - b.advDr : b.advDr - b.advCr) + opp);
    const gross = r2(buckets.reduce((s, x) => s + x, 0));
    return { buckets: buckets.map(r2), gross, advance, net: r2(gross - advance), overdue: r2(buckets[1] + buckets[2] + buckets[3] + buckets[4]) };
  }

  function autoAllocate(bills, amount) {
    let left = r2(amount); const out = [];
    bills.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((b) => {
      if (left <= 0) return;
      const t = r2(Math.min(left, b.out));
      if (t > 0) { out.push({ ref: b.ref, amt: t }); left = r2(left - t); }
    });
    return out;
  }

  const partyKind = (p, bal) => (p.type === 'Customer' ? 'debtor' : p.type === 'Supplier' ? 'creditor' : (bal >= 0 ? 'debtor' : 'creditor'));

  // ---------- stock ----------
  const stockOpening = (state, sy) => {
    if (sy <= fyStartYear(state.booksFrom)) return num(state.stock.opening);
    return stockClosing(state, sy - 1);
  };
  const stockClosing = (state, sy) => { const c = state.stock.closing[sy]; return c != null && c !== '' ? num(c) : stockOpening(state, sy); };

  // ---------- statements ----------
  function nominalNet(state, idx, group, from, to) {
    // returns net (credit-positive for income, debit-positive for expense) per ledger
    return state.accounts.filter((a) => a.group === group).map((a) => {
      const s = sumRange(idx, 'a:' + a.id, from, to);
      const amt = GROUPS[group].side === 'income' ? s.cr - s.dr : s.dr - s.cr;
      return { id: a.id, name: a.name, amt: r2(amt) };
    }).filter((l) => Math.abs(l.amt) > 0.004);
  }
  const tot = (lines) => r2(lines.reduce((s, l) => s + l.amt, 0));

  function pnl(state, idx, sy) {
    const { from, to } = fyRange(sy);
    const g = (n) => nominalNet(state, idx, n, from, to);
    const sales = g('Sales Accounts'), dinc = g('Direct Income'), purch = g('Purchase Accounts'), dexp = g('Direct Expenses');
    const iinc = g('Indirect Income'), iexp = g('Indirect Expenses');
    const opening = stockOpening(state, sy), closing = stockClosing(state, sy);
    const trDr = r2(opening + tot(purch) + tot(dexp)), trCr = r2(tot(sales) + tot(dinc) + closing);
    const gross = r2(trCr - trDr);
    const net = r2(gross + tot(iinc) - tot(iexp));
    const turnover = r2(tot(sales));
    return { sales, dinc, purch, dexp, iinc, iexp, opening, closing, trDr, trCr, gross, net, turnover, grossPct: turnover ? r2(gross / turnover * 100) : 0, netPct: turnover ? r2(net / turnover * 100) : 0, closingEntered: state.stock.closing[sy] != null && state.stock.closing[sy] !== '' };
  }

  function priorProfit(state, idx, sy) {
    const { from } = fyRange(sy);
    let np = 0;
    state.accounts.forEach((a) => {
      if (!isNominal(a.group)) return;
      const s = sumRange(idx, 'a:' + a.id, null, addDays(from, -1));
      np += s.cr - s.dr;
    });
    return r2(np);
  }

  function openingDifference(state, idx) {
    let d0 = 0;
    state.accounts.forEach((a) => { d0 += openingOf(idx, 'a:' + a.id); });
    state.parties.forEach((p) => { d0 += openingOf(idx, 'p:' + p.id); });
    return { d0: r2(d0), diff: r2(d0 + num(state.stock.opening)) };
  }

  const L_ORDER = ['Capital Account', 'Reserves & Surplus', 'Loans (Liability)', 'Current Liabilities', 'Sundry Creditors', 'Advances from Customers', 'Duties & Taxes', 'Bank Accounts', 'Difference in opening balances'];
  const A_ORDER = ['Fixed Assets', 'Closing Stock', 'Sundry Debtors', 'Advances to Suppliers', 'Other Current Assets', 'Duties & Taxes', 'Cash-in-Hand', 'Bank Accounts'];

  function balanceSheet(state, idx, sy) {
    const { from, to } = fyRange(sy);
    const L = new Map(), A = new Map();
    const put = (side, sec, name, amt, extra) => {
      if (Math.abs(amt) < 0.005) return;
      const m = side === 'L' ? L : A;
      if (!m.has(sec)) m.set(sec, []);
      m.get(sec).push(Object.assign({ name, amt: r2(amt) }, extra || {}));
    };
    state.accounts.forEach((a) => {
      const gr = GROUPS[a.group];
      if (!gr || gr.kind !== 'real') return;
      const bal = balanceAt(idx, 'a:' + a.id, to);
      if (gr.nature === 'A') put('A', a.group, a.name, bal, { key: 'a:' + a.id });
      else if (gr.nature === 'L') put('L', a.group, a.name, -bal, { key: 'a:' + a.id });
      else if (bal >= 0) put('A', a.group, a.name, bal, { key: 'a:' + a.id });
      else put('L', a.group, a.name, -bal, { key: 'a:' + a.id });
    });
    const grp = { 'Sundry Debtors': 0, 'Advances to Suppliers': 0, 'Sundry Creditors': 0, 'Advances from Customers': 0 };
    const cnt = { 'Sundry Debtors': 0, 'Advances to Suppliers': 0, 'Sundry Creditors': 0, 'Advances from Customers': 0 };
    state.parties.forEach((p) => {
      const bal = balanceAt(idx, 'p:' + p.id, to);
      if (Math.abs(bal) < 0.005) return;
      const sec = bal > 0 ? (p.type === 'Supplier' ? 'Advances to Suppliers' : 'Sundry Debtors') : (p.type === 'Customer' ? 'Advances from Customers' : 'Sundry Creditors');
      grp[sec] += Math.abs(bal); cnt[sec]++;
    });
    Object.keys(grp).forEach((sec) => {
      const side = (sec === 'Sundry Debtors' || sec === 'Advances to Suppliers') ? 'A' : 'L';
      put(side, sec, sec + ' (' + cnt[sec] + (cnt[sec] === 1 ? ' party)' : ' parties)'), grp[sec], { link: sec });
    });
    const P = pnl(state, idx, sy);
    put('A', 'Closing Stock', 'Closing stock', P.closing);
    const bf = r2(priorProfit(state, idx, sy) + stockOpening(state, sy) - num(state.stock.opening));
    put('L', 'Reserves & Surplus', 'Profit & Loss A/c (brought forward)', bf);
    put('L', 'Reserves & Surplus', P.net >= 0 ? 'Net profit for the year' : 'Net loss for the year', P.net);
    const od = openingDifference(state, idx);
    put('L', 'Difference in opening balances', 'Opening balances do not tally', od.diff);
    const pack = (m, order) => order.filter((s) => m.has(s)).map((s) => ({ section: s, lines: m.get(s), total: tot(m.get(s)) }));
    const liab = pack(L, L_ORDER), assets = pack(A, A_ORDER);
    const lt = r2(liab.reduce((s, x) => s + x.total, 0)), at = r2(assets.reduce((s, x) => s + x.total, 0));
    return { liab, assets, liabTotal: lt, assetTotal: at, tally: Math.abs(lt - at) < 0.01, openingDiff: od.diff, pnl: P, from, to };
  }

  function trialBalance(state, idx, sy) {
    const { from, to } = fyRange(sy);
    const rows = [];
    state.accounts.forEach((a) => {
      const key = 'a:' + a.id;
      let bal;
      if (isNominal(a.group)) { const s = sumRange(idx, key, from, to); bal = r2(s.dr - s.cr); } else bal = balanceAt(idx, key, to);
      if (Math.abs(bal) > 0.004) rows.push({ group: a.group, name: a.name, dr: bal > 0 ? bal : 0, cr: bal < 0 ? -bal : 0, key });
    });
    const pg = { 'Sundry Debtors': { dr: 0, cr: 0, n: 0 }, 'Sundry Creditors': { dr: 0, cr: 0, n: 0 } };
    state.parties.forEach((p) => {
      const bal = balanceAt(idx, 'p:' + p.id, to);
      if (Math.abs(bal) < 0.005) return;
      const sec = partyKind(p, bal) === 'debtor' ? 'Sundry Debtors' : 'Sundry Creditors';
      if (bal > 0) pg[sec].dr += bal; else pg[sec].cr += -bal;
      pg[sec].n++;
    });
    Object.keys(pg).forEach((sec) => { if (pg[sec].n) rows.push({ group: sec, name: sec + ' (' + pg[sec].n + ')', dr: r2(pg[sec].dr), cr: r2(pg[sec].cr), link: sec }); });
    const order = GROUP_ORDER.concat(['Sundry Debtors', 'Sundry Creditors']);
    rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    const so = stockOpening(state, sy);
    if (so) rows.push({ group: 'Stock-in-hand', name: 'Opening stock', dr: so, cr: 0 });
    const bf = r2(priorProfit(state, idx, sy) + so - num(state.stock.opening));
    if (Math.abs(bf) > 0.004) rows.push({ group: 'Capital Account', name: 'Profit & Loss A/c (brought forward)', dr: bf < 0 ? -bf : 0, cr: bf > 0 ? bf : 0 });
    const od = openingDifference(state, idx).diff;
    if (Math.abs(od) > 0.004) rows.push({ group: 'Difference', name: 'Difference in opening balances', dr: od < 0 ? -od : 0, cr: od > 0 ? od : 0 });
    const dr = r2(rows.reduce((s, r) => s + r.dr, 0)), cr = r2(rows.reduce((s, r) => s + r.cr, 0));
    return { rows, dr, cr, tally: Math.abs(dr - cr) < 0.01 };
  }

  // ---------- taxation ----------
  function gstSummary(state, sy) {
    const months = fyMonths(sy).map((m) => ({ key: m.key, label: m.label, sTaxable: 0, oC: 0, oS: 0, oI: 0, pTaxable: 0, iC: 0, iS: 0, iI: 0 }));
    const byKey = new Map(months.map((m) => [m.key, m]));
    state.vouchers.forEach((v) => {
      const m = byKey.get(v.date.slice(0, 7));
      if (!m) return;
      if (v.type === 'sale') { m.sTaxable += v.taxable; m.oC += v.cgst; m.oS += v.sgst; m.oI += v.igst; }
      else if ((v.type === 'purchase' || v.type === 'expense') && v.itc !== false && v.tax > 0) {
        m.pTaxable += v.type === 'purchase' ? v.taxable : v.amount; m.iC += v.cgst; m.iS += v.sgst; m.iI += v.igst;
      }
    });
    months.forEach((m) => { ['sTaxable', 'oC', 'oS', 'oI', 'pTaxable', 'iC', 'iS', 'iI'].forEach((k) => { m[k] = r2(m[k]); }); m.out = r2(m.oC + m.oS + m.oI); m.inp = r2(m.iC + m.iS + m.iI); m.net = r2(m.out - m.inp); });
    const total = { label: 'Total' };
    ['sTaxable', 'oC', 'oS', 'oI', 'pTaxable', 'iC', 'iS', 'iI', 'out', 'inp', 'net'].forEach((k) => { total[k] = r2(months.reduce((s, m) => s + m[k], 0)); });
    return { months, total };
  }

  function rateSummary(state, sy, type) {
    const { from, to } = fyRange(sy);
    const m = new Map();
    state.vouchers.forEach((v) => {
      if (v.type !== type || v.date < from || v.date > to) return;
      (v.lines || []).forEach((l) => {
        const k = num(l.gst);
        const e = m.get(k) || { rate: k, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        e.taxable += l.amount; e.cgst += l.cgst; e.sgst += l.sgst; e.igst += l.igst; m.set(k, e);
      });
    });
    return [...m.values()].sort((a, b) => a.rate - b.rate).map((e) => ({ rate: e.rate, taxable: r2(e.taxable), cgst: r2(e.cgst), sgst: r2(e.sgst), igst: r2(e.igst), tax: r2(e.cgst + e.sgst + e.igst) }));
  }

  function hsnSummary(state, sy) {
    const { from, to } = fyRange(sy);
    const m = new Map();
    state.vouchers.forEach((v) => {
      if (v.type !== 'sale' || v.date < from || v.date > to) return;
      (v.lines || []).forEach((l) => {
        const k = (l.hsn || '—') + '|' + num(l.gst) + '|' + (l.unit || '');
        const e = m.get(k) || { hsn: l.hsn || '—', gst: num(l.gst), unit: l.unit || '', qty: 0, taxable: 0, tax: 0 };
        e.qty += num(l.qty); e.taxable += l.amount; e.tax += l.cgst + l.sgst + l.igst; m.set(k, e);
      });
    });
    return [...m.values()].map((e) => ({ hsn: e.hsn, gst: e.gst, unit: e.unit, qty: r2(e.qty), taxable: r2(e.taxable), tax: r2(e.tax) })).sort((a, b) => (a.hsn < b.hsn ? -1 : 1));
  }

  // ---------- misc ----------
  const PREFIX = { sale: 'INV', purchase: 'PUR', receipt: 'RCT', payment: 'PAY', expense: 'EXP', contra: 'CNT' };
  const TYPE_LABEL = { sale: 'Sales', purchase: 'Purchase', receipt: 'Receipt', payment: 'Payment', expense: 'Expense', contra: 'Contra' };

  function nextNo(state, type, date) {
    const sy = fyStartYear(date), { from, to } = fyRange(sy);
    let max = 0;
    state.vouchers.forEach((v) => {
      if (v.type !== type || v.date < from || v.date > to) return;
      const m = /(\d+)$/.exec(v.no || ''); if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    const prefix = type === 'sale' ? (state.company.invPrefix || 'INV') : PREFIX[type];
    return prefix + '/' + fyLabel(sy) + '/' + pad(max + 1, 4);
  }

  const settleOf = (v) => r2(num(v.amount) + num(v.tds));
  const voucherAmount = (v) => (v.type === 'sale' || v.type === 'purchase' || v.type === 'expense' ? num(v.total) : num(v.amount));

  function validateVoucher(state, v) {
    const e = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) e.push('Enter a valid date.');
    if (!v.no) e.push('Voucher number is required.');
    else if (state.vouchers.some((x) => x.type === v.type && x.no === v.no && x.id !== v.id)) e.push('Voucher number ' + v.no + ' is already used. Change it.');
    if (v.type === 'sale' || v.type === 'purchase') {
      if (!v.partyId) e.push('Select a ' + (v.type === 'sale' ? 'customer' : 'supplier') + '.');
      if (!(v.lines || []).some((l) => num(l.qty) > 0 && num(l.rate) > 0)) e.push('Add at least one item with quantity and rate.');
      if (v.total <= 0) e.push('Invoice total must be above zero.');
    } else if (v.type === 'receipt' || v.type === 'payment') {
      if (!v.counter) e.push('Select ' + (v.type === 'receipt' ? 'who paid you' : 'who you paid') + '.');
      if (!v.mode) e.push('Select cash or bank account.');
      if (!(num(v.amount) > 0)) e.push('Enter an amount above zero.');
      if (num(v.tds) < 0) e.push('TDS cannot be negative.');
      const used = (v.alloc || []).reduce((s, a) => s + num(a.amt), 0);
      if (used > settleOf(v) + 0.005) e.push('Allocated bills exceed the amount (including TDS).');
    } else if (v.type === 'expense') {
      if (!v.head) e.push('Select an expense head.');
      if (!v.paidFrom) e.push('Select how it was paid.');
      if (!(num(v.amount) > 0)) e.push('Enter an amount above zero.');
    } else if (v.type === 'contra') {
      if (!v.from || !v.to) e.push('Select both accounts.');
      else if (v.from === v.to) e.push('From and To accounts must differ.');
      if (!(num(v.amount) > 0)) e.push('Enter an amount above zero.');
    }
    return e;
  }

  function numToWords(n) {
    n = r2(num(n));
    const rupees = Math.floor(n), paise = Math.round((n - rupees) * 100);
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''));
    const three = (x) => (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    const words = (x) => {
      if (x === 0) return 'Zero';
      const parts = [];
      const cr = Math.floor(x / 10000000); x %= 10000000;
      const la = Math.floor(x / 100000); x %= 100000;
      const th = Math.floor(x / 1000); x %= 1000;
      if (cr) parts.push(three(cr) + ' Crore');
      if (la) parts.push(two(la) + ' Lakh');
      if (th) parts.push(two(th) + ' Thousand');
      if (x) parts.push(three(x));
      return parts.join(' ');
    };
    return 'Rupees ' + words(rupees) + (paise ? ' and ' + words(paise) + ' Paise' : '') + ' Only';
  }

  function toCSV(rows) {
    return rows.map((r) => r.map((c) => { const s = c == null ? '' : String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  }

  // ---------- sample data (clearly demo) ----------
  function sampleData(todayISO) {
    const st = defaultState(todayISO);
    const sy = fyStartYear(todayISO), start = fyRange(sy).from;
    const elapsed = Math.max(40, Math.min(300, daysBetween(start, todayISO)));
    const D = (d) => addDays(start, Math.min(elapsed, Math.floor(d * elapsed / 190)));
    st.company.name = 'Sahara & Associates';
    st.company.city = 'Dharuhera'; st.company.pin = '123106'; st.company.address = 'Sample address — edit in Company Profile';
    st.company.phone = '0000000000'; st.company.email = 'accounts@example.com';
    st.tax.gstin = '06AAAFS0000A1Z5'; st.tax.pan = 'AAAFS0000A';
    st.accounts.find((a) => a.id === 'cash').opening = 25000;
    st.accounts.find((a) => a.id === 'bank1').opening = 410000;
    st.accounts.find((a) => a.id === 'fixed').opening = 150000;
    const cap = st.accounts.find((a) => a.id === 'capital'); cap.opening = 946000; cap.openingType = 'Cr';
    st.stock.opening = 320000;
    const P = (name, type, gstin, stCode, city, opening, ot, credit, phone, person) => ({
      id: 'x' + uid(), name, type, gstin, pan: gstin ? gstin.slice(2, 12) : '', stateCode: stCode, state: stateName(stCode), city, address: 'Sample address', pin: '', phone, email: '', contactPerson: person,
      creditDays: credit, creditLimit: 500000, opening, openingType: ot, bankName: '', bankAcc: '', ifsc: '', notes: 'Sample party',
    });
    const c1 = P('Northstar Industries Pvt Ltd', 'Customer', '06AABCN4521K1Z7', '06', 'Gurugram', 125000, 'Dr', 30, '9800000001', 'Anil Verma');
    const c2 = P('Rao Engineering Works', 'Customer', '07AAGFR7766M1Z2', '07', 'New Delhi', 0, 'Dr', 45, '9800000002', 'S. Rao');
    const c3 = P('Bharat Auto Components', 'Customer', '09AAECB1190P1Z9', '09', 'Noida', 0, 'Dr', 30, '9800000003', 'Meena Gupta');
    const c4 = P('Kapoor Traders', 'Customer', '06AAAPK3345L1ZQ', '06', 'Rewari', 0, 'Dr', 15, '9800000004', 'R. Kapoor');
    const s1 = P('Shree Steel Suppliers', 'Supplier', '06AAJFS8812C1Z3', '06', 'Bahadurgarh', 84000, 'Cr', 30, '9800000011', 'M. Goyal');
    const s2 = P('Metro Packaging Co.', 'Supplier', '03AAKCM5502R1Z8', '03', 'Ludhiana', 0, 'Cr', 30, '9800000012', 'P. Singh');
    const s3 = P('Delta Power Tools', 'Supplier', '27AABCD9034N1ZB', '27', 'Pune', 0, 'Cr', 45, '9800000013', 'V. Kulkarni');
    st.parties.push(c1, c2, c3, c4, s1, s2, s3);
    let seq = 0;
    const push = (v) => { v.id = 'x' + uid() + seq; v.ts = Date.now() + (seq++); if (!v.no) v.no = nextNo(st, v.type, v.date); st.vouchers.push(v); return v; };
    const L = (desc, hsn, qty, unit, rate, disc, gst) => ({ desc, hsn, qty, unit, rate, disc, gst });
    const sale = (d, p, lines, extra) => push(buildInvoice(st, Object.assign({ type: 'sale', date: D(d), partyId: p.id, lines, dueDate: addDays(D(d), p.creditDays), narration: '' }, extra || {})));
    const buy = (d, p, lines, ref, extra) => push(buildInvoice(st, Object.assign({ type: 'purchase', date: D(d), partyId: p.id, lines, refNo: ref, itc: true, dueDate: addDays(D(d), p.creditDays), narration: '' }, extra || {})));
    const settle = (type, d, p, amount, mode, tds, ref) => {
      const date = D(d);
      const bills = partyBills(st, buildIndex(st), p.id, date).bills.filter((b) => b.side === (type === 'receipt' ? 'Dr' : 'Cr'));
      return push({ type, date, counter: 'p:' + p.id, mode, amount, tds: tds || 0, refNo: ref || '', narration: '', alloc: autoAllocate(bills, amount + (tds || 0)) });
    };
    const exp = (d, head, paidFrom, amount, gst, extra) => push(buildExpense(Object.assign({ type: 'expense', date: D(d), head: 'a:' + head, paidFrom, amount, gst, interstate: false, itc: gst > 0, narration: '' }, extra || {})));

    buy(3, s1, [L('MS Sheet 2mm (IS 2062)', '7208', 12, 'MT', 52000, 0, 18)], 'SS/0412');
    buy(8, s2, [L('Corrugated cartons 5-ply', '4819', 1200, 'Nos', 38, 0, 12)], 'MP/2291');
    sale(10, c1, [L('MS Sheet 2mm cut to size', '7208', 5, 'MT', 61500, 0, 18), L('Corrugated cartons 5-ply', '4819', 300, 'Nos', 52, 5, 12)], { refNo: 'PO-1182' });
    sale(18, c2, [L('Industrial power drill 750W', '8467', 24, 'Nos', 3450, 0, 18)]);
    exp(20, 'rent', 'a:bank1', 35000, 18);
    settle('receipt', 24, c1, 125000, 'a:bank1', 0, 'NEFT 88123');
    buy(30, s3, [L('Industrial power drill 750W', '8467', 70, 'Nos', 2580, 0, 18)], 'DP/7781');
    sale(38, c3, [L('MS Sheet 2mm cut to size', '7208', 4, 'MT', 62000, 2, 18)], { refNo: 'PO-5521' });
    exp(42, 'electricity', 'a:bank1', 8400, 0);
    push({ type: 'contra', date: D(45), from: 'a:cash', to: 'a:bank1', amount: 15000, refNo: '', narration: 'Cash deposited' });
    settle('payment', 48, s1, 400000, 'a:bank1', 0, 'RTGS 4410');
    sale(55, c4, [L('Corrugated cartons 5-ply', '4819', 800, 'Nos', 54, 0, 12), L('Industrial power drill 750W', '8467', 6, 'Nos', 3500, 0, 18)]);
    sale(70, c1, [L('MS Sheet 2mm cut to size', '7208', 5, 'MT', 61800, 0, 18)], { refNo: 'PO-1204' });
    exp(72, 'salary', 'a:bank1', 62000, 0);
    settle('receipt', 80, c2, 90000, 'a:bank1', 0, 'UPI 5521');
    buy(90, s1, [L('MS Sheet 2mm (IS 2062)', '7208', 10, 'MT', 52500, 0, 18)], 'SS/0577');
    settle('receipt', 96, c3, 200000, 'a:bank1', 2000, 'NEFT 90421');
    exp(100, 'telephone', 'a:cash', 1695, 18);
    sale(112, c2, [L('Industrial power drill 750W', '8467', 30, 'Nos', 3400, 0, 18)]);
    buy(118, s2, [L('Corrugated cartons 5-ply', '4819', 2000, 'Nos', 37, 0, 12)], 'MP/2410');
    settle('receipt', 120, c1, 300000, 'a:bank1', 0, 'RTGS 7731');
    settle('payment', 124, s3, 90000, 'a:bank1', 0, 'NEFT 2290');
    sale(135, c3, [L('MS Sheet 2mm cut to size', '7208', 4, 'MT', 62400, 0, 18)], { refNo: 'PO-5602' });
    exp(140, 'rent', 'a:bank1', 35000, 18);
    exp(150, 'travel', 'a:cash', 3200, 0);
    settle('receipt', 158, c4, 40000, 'a:cash', 0, '');
    sale(165, c1, [L('Corrugated cartons 5-ply', '4819', 1500, 'Nos', 53, 0, 12), L('Industrial power drill 750W', '8467', 10, 'Nos', 3450, 0, 18)]);
    push({ type: 'contra', date: D(170), from: 'a:bank1', to: 'a:cash', amount: 20000, refNo: '', narration: 'Cash withdrawn for petty expenses' });
    settle('payment', 174, s2, 40000, 'a:bank1', 0, 'UPI 7712');
    sale(180, c4, [L('Corrugated cartons 5-ply', '4819', 600, 'Nos', 54, 0, 12)]);
    sale(186, c2, [L('Industrial power drill 750W', '8467', 12, 'Nos', 3450, 0, 18)]);
    st.stock.closing[sy] = 520000;
    return st;
  }

  return {
    r2, num, uid, pad, STATES, stateName, GSTIN_RE, PAN_RE, GROUPS, GROUP_ORDER, isNominal, TYPE_LABEL, PREFIX,
    fyStartYear, fyRange, fyLabel, addDays, daysBetween, fyMonths, MONTHS,
    defaultAccounts, defaultState, calcLines, calcExpense, isInterstate, buildInvoice, buildExpense,
    postingsOf, buildIndex, nameOf, openingOf, sumRange, balanceAt, ledger,
    allocMap, partyBills, ageing, autoAllocate, partyKind,
    stockOpening, stockClosing, pnl, priorProfit, openingDifference, balanceSheet, trialBalance,
    gstSummary, rateSummary, hsnSummary, nextNo, settleOf, voucherAmount, validateVoucher, numToWords, toCSV, sampleData,
  };
});
