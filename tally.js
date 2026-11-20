/* Sahara & Associates — Tally Prime XML import (pure logic, no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Tally = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  const { r2, num } = E;
  const UNITS = ['Nos', 'Pcs', 'Kg', 'MT', 'Ltr', 'Mtr', 'Box', 'Set', 'Pair', 'Hrs', 'Job'];
  const STD_GST = [0, 5, 12, 18, 28];

  // ---------- reading the file ----------
  function decodeBuffer(buf) {
    const u = new Uint8Array(buf);
    if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(u.subarray(2));
    if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(u.subarray(2));
    if (u.length > 3 && u[1] === 0 && u[3] === 0) return new TextDecoder('utf-16le').decode(u);
    let s = new TextDecoder('utf-8').decode(u);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    return s;
  }

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decodeEnt = (s) => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return (c < 32 && c !== 9 && c !== 10 && c !== 13) || c > 0x10ffff || c === 0xfffe || c === 0xffff ? '' : String.fromCodePoint(c); }
    const r = ENT[e.toLowerCase()]; return r != null ? r : m;
  }));

  /** Forgiving XML reader (Tally files contain control characters and odd prefixes that strict parsers reject). */
  function parseXML(src) {
    src = String(src).replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
    const rootEl = { n: '#root', a: {}, c: [], t: '' }, st = [rootEl];
    const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s\/>!?]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(src))) {
      const top = st[st.length - 1];
      if (m[1] !== undefined) { top.t += m[1]; continue; }
      if (m[6] !== undefined) { top.t += decodeEnt(m[6]); continue; }
      if (m[2]) { let i = st.length - 1; while (i > 0 && st[i].n !== m[3]) i--; if (i > 0) st.length = i; continue; }
      const el = { n: m[3], a: {}, c: [], t: '' };
      m[4].replace(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k, v1, v2) => { el.a[k] = decodeEnt(v1 !== undefined ? v1 : v2); return ''; });
      top.c.push(el);
      if (!m[5]) st.push(el);
    }
    return rootEl;
  }

  const kid = (e, n) => e && e.c.find((x) => x.n === n);
  const kids = (e, n) => (e ? e.c.filter((x) => x.n === n) : []);
  const tx = (e, n) => { const k = kid(e, n); return k ? k.t.trim() : ''; };
  const deep = (e, n, out) => { out = out || []; e.c.forEach((x) => { if (x.n === n) out.push(x); else deep(x, n, out); }); return out; };
  const nameOf = (e) => {
    if (e.a && e.a.NAME) return e.a.NAME.trim();
    const nl = deep(e, 'NAME.LIST')[0]; if (nl) { const k = kid(nl, 'NAME'); if (k && k.t.trim()) return k.t.trim(); }
    return tx(e, 'NAME');
  };
  const isoDate = (s) => (/^\d{8}$/.test(s || '') ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : '');
  const parseQty = (s) => {
    const m = /^\s*(-?[\d,]*\.?\d+)\s*([^\s=]*)/.exec(String(s || '')); if (!m) return { q: 0, unit: '' };
    return { q: Math.abs(num(m[1].replace(/,/g, ''))), unit: m[2] || '' };
  };
  const mapUnit = (u) => { const k = String(u || '').toLowerCase().replace(/[.\s]/g, ''); const hit = UNITS.find((x) => x.toLowerCase() === k) || ({ kgs: 'Kg', kilogram: 'Kg', ltrs: 'Ltr', litre: 'Ltr', liter: 'Ltr', mtrs: 'Mtr', meter: 'Mtr', metre: 'Mtr', pc: 'Pcs', piece: 'Pcs', pieces: 'Pcs', box: 'Box', boxes: 'Box', hrs: 'Hrs', hour: 'Hrs', tons: 'MT', ton: 'MT', mt: 'MT' })[k]; return hit || 'Nos'; };
  const gstRateOf = (el) => {
    let best = null;
    deep(el, 'RATEDETAILS.LIST').forEach((r) => {
      const head = tx(r, 'GSTRATEDUTYHEAD'), rate = num(tx(r, 'GSTRATE'));
      if (/integrated/i.test(head)) best = rate; else if (/central/i.test(head) && best == null) best = rate * 2;
    });
    return best;
  };
  const snapRate = (r) => { if (!isFinite(r) || r < 0) return 0; let b = 0; STD_GST.forEach((s) => { if (Math.abs(s - r) < Math.abs(b - r)) b = s; }); return Math.abs(b - r) <= 0.6 ? b : r2(r); };

  // ---------- pulling data out of the XML ----------
  function classify(raw) {
    const n = String(raw || '').toLowerCase();
    if (/order|delivery|receipt note|rejection|stock journal|memorandum|reversing|payroll|attendance/.test(n)) return 'other';
    if (/credit note/.test(n)) return 'creditnote';
    if (/debit note/.test(n)) return 'debitnote';
    if (/sales/.test(n)) return 'sale';
    if (/purchase/.test(n)) return 'purchase';
    if (/receipt/.test(n)) return 'receipt';
    if (/payment/.test(n)) return 'payment';
    if (/contra/.test(n)) return 'contra';
    if (/journal/.test(n)) return 'journal';
    return 'other';
  }
  const yes = (s) => /^yes$/i.test(String(s || '').trim());

  function readEntry(e) {
    const amt = num(tx(e, 'AMOUNT'));
    return {
      name: tx(e, 'LEDGERNAME'), dr: amt < 0 ? r2(-amt) : 0, cr: amt > 0 ? r2(amt) : 0,
      bills: deep(e, 'BILLALLOCATIONS.LIST').map((b) => ({ name: tx(b, 'NAME'), type: tx(b, 'BILLTYPE'), amt: Math.abs(num(tx(b, 'AMOUNT'))) })),
      instr: (deep(e, 'INSTRUMENTNUMBER')[0] || { t: '' }).t.trim(),
    };
  }

  /** roots: array of parsed XML trees. Returns the masters and vouchers found in them. */
  function extract(roots) {
    const D = { groups: new Map(), ledgers: [], items: [], vouchers: [] };
    roots.forEach((rt) => {
      deep(rt, 'GROUP').forEach((g) => { const n = nameOf(g); if (n) D.groups.set(n.toLowerCase(), tx(g, 'PARENT')); });
      deep(rt, 'LEDGER').forEach((l) => {
        const name = nameOf(l); if (!name) return;
        D.ledgers.push({
          name, parent: tx(l, 'PARENT'), opening: num(tx(l, 'OPENINGBALANCE')),
          gstin: tx(l, 'PARTYGSTIN') || (deep(l, 'GSTIN')[0] || { t: '' }).t.trim(), state: tx(l, 'LEDSTATENAME') || tx(l, 'STATENAME'), pin: tx(l, 'PINCODE'),
          phone: tx(l, 'LEDGERPHONE') || tx(l, 'LEDGERMOBILE'), email: tx(l, 'EMAIL'), pan: tx(l, 'INCOMETAXNUMBER'), contact: tx(l, 'LEDGERCONTACT'),
          credit: parseInt(tx(l, 'BILLCREDITPERIOD'), 10) || 0, address: deep(l, 'ADDRESS').map((a) => a.t.trim()).filter(Boolean).join(', '),
        });
      });
      deep(rt, 'STOCKITEM').forEach((s) => {
        const name = nameOf(s); if (!name) return;
        const hs = deep(s, 'HSNCODE')[0] || deep(s, 'HSN')[0];
        D.items.push({ name, unit: tx(s, 'BASEUNITS'), hsn: hs ? hs.t.trim() : '', gst: gstRateOf(s), open: parseQty(tx(s, 'OPENINGBALANCE')).q, openRate: Math.abs(num(tx(s, 'OPENINGRATE'))) });
      });
      deep(rt, 'VOUCHER').forEach((v) => {
        const raw = v.a.VCHTYPE || tx(v, 'VOUCHERTYPENAME'), date = isoDate(tx(v, 'DATE'));
        const o = {
          raw, type: classify(raw), date, number: tx(v, 'VOUCHERNUMBER'), party: tx(v, 'PARTYLEDGERNAME') || tx(v, 'PARTYNAME'), ref: tx(v, 'REFERENCE'), narr: tx(v, 'NARRATION'),
          guid: tx(v, 'GUID') || v.a.REMOTEID || '', skip: yes(tx(v, 'ISCANCELLED')) ? 'cancelled' : yes(tx(v, 'ISOPTIONAL')) ? 'optional' : (v.a.ACTION || '').toLowerCase() === 'delete' ? 'deleted' : '',
          entries: [], inv: [],
        };
        v.c.forEach((c) => {
          if (c.n === 'ALLLEDGERENTRIES.LIST' || c.n === 'LEDGERENTRIES.LIST') o.entries.push(readEntry(c));
          else if (c.n === 'ALLINVENTORYENTRIES.LIST' || c.n === 'INVENTORYENTRIES.LIST') {
            const bq = parseQty(tx(c, 'BILLEDQTY') || tx(c, 'ACTUALQTY')), rt2 = /^\s*(-?[\d.,]+)\s*\/\s*(.*)$/.exec(tx(c, 'RATE'));
            const accs = kids(c, 'ACCOUNTINGALLOCATIONS.LIST').map(readEntry);
            const amount = Math.abs(num(tx(c, 'AMOUNT'))) || accs.reduce((s, a) => s + a.dr + a.cr, 0);
            o.inv.push({ item: tx(c, 'STOCKITEMNAME'), qty: bq.q, unit: bq.unit || (rt2 ? rt2[2] : ''), rate: rt2 ? Math.abs(num(rt2[1].replace(/,/g, ''))) : Math.abs(num(tx(c, 'RATE'))), disc: num(tx(c, 'DISCOUNT')), amount: r2(amount), gst: gstRateOf(c) });
            accs.forEach((a) => { a.fromInv = true; o.entries.push(a); });
          }
        });
        D.vouchers.push(o);
      });
    });
    return D;
  }

  // ---------- group mapping ----------
  const GMAP = {
    'sundry debtors': 'DEBTOR', 'sundry creditors': 'CREDITOR', 'cash-in-hand': 'Cash-in-Hand', 'bank accounts': 'Bank Accounts', 'bank od a/c': 'Bank Accounts',
    'sales accounts': 'Sales Accounts', 'purchase accounts': 'Purchase Accounts', 'direct incomes': 'Direct Income', 'direct income': 'Direct Income', 'indirect incomes': 'Indirect Income', 'indirect income': 'Indirect Income',
    'direct expenses': 'Direct Expenses', 'indirect expenses': 'Indirect Expenses', 'duties & taxes': 'Duties & Taxes', 'fixed assets': 'Fixed Assets',
    'investments': 'Other Current Assets', 'current assets': 'Other Current Assets', 'deposits (asset)': 'Other Current Assets', 'loans & advances (asset)': 'Other Current Assets', 'misc. expenses (asset)': 'Other Current Assets', 'suspense a/c': 'Other Current Assets',
    'stock-in-hand': 'STOCK', 'current liabilities': 'Current Liabilities', 'provisions': 'Current Liabilities',
    'loans (liability)': 'Loans (Liability)', 'secured loans': 'Loans (Liability)', 'unsecured loans': 'Loans (Liability)', 'capital account': 'Capital Account', 'reserves & surplus': 'Capital Account', 'branch / divisions': 'SKIP',
  };

  // ---------- applying to the books ----------
  /** Mutates S. Call it on a copy first to preview. */
  function apply(S, D, opt) {
    opt = Object.assign({ opening: true }, opt);
    const rep = { parties: { added: 0, matched: 0 }, accounts: { added: 0, matched: 0 }, items: { added: 0 }, vouchers: {}, imported: 0, duplicates: 0, skipped: {}, warnings: [], warningsMore: 0, openingParties: 0 };
    const warn = (m) => { if (rep.warnings.length < 40) rep.warnings.push(m); else rep.warningsMore++; };
    const skip = (k) => { rep.skipped[k] = (rep.skipped[k] || 0) + 1; };
    S.items = S.items || [];
    const ledMap = new Map(D.ledgers.map((l) => [l.name.toLowerCase(), l]));
    const primary = (g) => { let k = String(g || '').toLowerCase(), n = 0; while (k && !(k in GMAP) && D.groups.has(k) && n++ < 25) k = String(D.groups.get(k) || '').toLowerCase(); return GMAP[k] || null; };
    const isTaxName = (n) => /cgst|sgst|utgst|igst|\bgst\b/i.test(n);
    const kindOf = (name) => {
      const l = ledMap.get(String(name).toLowerCase());
      if (l) { const g = primary(l.parent); if (g) return g; }
      if (isTaxName(name) || /\btds\b/i.test(name)) return 'Duties & Taxes';
      if (/\bcash\b/i.test(name)) return 'Cash-in-Hand';
      if (/\bbank\b|\bod a\/c\b/i.test(name)) return 'Bank Accounts';
      if (/round/i.test(name)) return 'ROUND';
      return null;
    };

    // parties
    const partyByName = new Map(S.parties.map((p) => [p.name.toLowerCase(), p])), seenP = new Set();
    const stCodeOf = (stName, gstin) => {
      if (gstin && E.GSTIN_RE.test(gstin)) return gstin.slice(0, 2);
      const s = E.STATES.find((x) => x[1].toLowerCase() === String(stName || '').toLowerCase()); return s ? s[0] : S.company.stateCode;
    };
    const idx = E.buildIndex(S);
    const ensureParty = (name, type) => {
      const k = name.toLowerCase(); let p = partyByName.get(k);
      if (p) { if (!seenP.has(k)) { seenP.add(k); rep.parties.matched++; } if (p.type !== 'Both' && p.type !== type) p.type = 'Both'; return p; }
      const l = ledMap.get(k) || {}, gstin = (l.gstin || '').toUpperCase(), sc = stCodeOf(l.state, gstin), ob = opt.opening ? num(l.opening) : 0;
      p = { id: 'p' + E.uid(), name, type, gstin: E.GSTIN_RE.test(gstin) ? gstin : '', pan: l.pan || (E.GSTIN_RE.test(gstin) ? gstin.slice(2, 12) : ''), stateCode: sc, state: E.stateName(sc), city: '', address: l.address || '', pin: l.pin || '', phone: l.phone || '', email: l.email || '', contactPerson: l.contact || '',
        creditDays: l.credit || 0, creditLimit: 0, opening: r2(Math.abs(ob)), openingType: ob ? (ob < 0 ? 'Dr' : 'Cr') : (type === 'Supplier' ? 'Cr' : 'Dr'), bankName: '', bankAcc: '', ifsc: '', notes: 'Imported from Tally' };
      if (ob) rep.openingParties++;
      S.parties.push(p); partyByName.set(k, p); seenP.add(k); rep.parties.added++; idx.partyById.set(p.id, p); return p;
    };

    // accounts
    const acctByName = new Map(S.accounts.map((a) => [a.name.toLowerCase(), a])), seenA = new Set();
    const sysTax = (name, side) => { // side: 'in' | 'out'
      const n = name.toLowerCase(), t = /igst/.test(n) ? 'igst' : /sgst|utgst/.test(n) ? 'sgst' : /cgst/.test(n) ? 'cgst' : null; if (!t) return null;
      const dir = /input/.test(n) ? 'in' : /output/.test(n) ? 'out' : side; return 'gst_' + dir + '_' + t;
    };
    const ensureAcct = (name, group, opening) => {
      const k = name.toLowerCase(); let a = acctByName.get(k);
      const hasOb = opt.opening && opening && !E.isNominal(group);
      if (a) { if (!seenA.has(k)) { seenA.add(k); rep.accounts.matched++; } if (hasOb && !num(a.opening)) { a.opening = r2(Math.abs(opening)); a.openingType = opening < 0 ? 'Dr' : 'Cr'; } return a; }
      a = { id: 'a' + E.uid(), name, group: E.GROUPS[group] ? group : 'Other Current Assets', opening: hasOb ? r2(Math.abs(opening)) : 0, openingType: hasOb && opening > 0 ? 'Cr' : 'Dr', sys: false };
      S.accounts.push(a); acctByName.set(k, a); seenA.add(k); rep.accounts.added++; return a;
    };
    const acctById = (id) => S.accounts.find((a) => a.id === id);
    const accountFor = (name) => { // ledger name -> account in our books (or null for party / skipped)
      const kind = kindOf(name); if (kind === 'DEBTOR' || kind === 'CREDITOR' || kind === 'SKIP' || kind === 'STOCK') return null;
      if (kind === 'ROUND') return acctById('round');
      if (kind === 'Sales Accounts') return acctById('sales'); if (kind === 'Purchase Accounts') return acctById('purchase');
      if (kind === 'Duties & Taxes') { const sid = sysTax(name); if (sid && acctById(sid)) return acctById(sid); }
      if (/^cash$/i.test(name)) return acctById('cash');
      const l = ledMap.get(name.toLowerCase());
      return ensureAcct(name, kind || 'Other Current Assets', l ? l.opening : 0);
    };

    // ledger masters
    D.ledgers.forEach((l) => {
      const kind = primary(l.parent);
      if (kind === 'DEBTOR') ensureParty(l.name, 'Customer'); else if (kind === 'CREDITOR') ensureParty(l.name, 'Supplier');
      else if (kind && kind !== 'SKIP' && kind !== 'STOCK') { const a = accountFor(l.name); if (a && opt.opening && l.opening && ['gst_in_cgst', 'gst_in_sgst', 'gst_in_igst', 'gst_out_cgst', 'gst_out_sgst', 'gst_out_igst'].includes(a.id) && !num(a.opening)) { a.opening = r2(Math.abs(l.opening)); a.openingType = l.opening < 0 ? 'Dr' : 'Cr'; } }
    });
    // stock items
    D.items.forEach((s) => {
      if (E.findItem(S, s.name)) return;
      const it = { id: 'i' + E.uid(), name: s.name, hsn: s.hsn || '', unit: mapUnit(s.unit), gst: s.gst != null ? snapRate(s.gst) : S.tax.defaultGst, saleRate: 0, purchaseRate: r2(s.openRate), openQty: opt.opening ? s.open : 0 };
      S.items.push(it); rep.items.added++;
    });
    const itemGst = (name) => { const it = E.findItem(S, name); const m = D.items.find((x) => x.name.toLowerCase() === String(name).toLowerCase()); return m && m.gst != null ? snapRate(m.gst) : null; };

    // numbering / dedupe
    const have = new Set(), srcs = new Set();
    S.vouchers.forEach((v) => { have.add(v.type + '|' + v.no); if (v.src) srcs.add(v.src); });
    let seq = 0;
    const uniqueNo = (type, raw, date, sub) => {
      let no = String(raw || '').trim() || E.nextNo(S, type, date); if (sub) no += '/' + (sub + 1);
      if (have.has(type + '|' + no)) no += '-' + E.fyLabel(E.fyStartYear(date));
      let n = 2; const base = no; while (have.has(type + '|' + no)) no = base + '-' + n++;
      have.add(type + '|' + no); return no;
    };
    const add = (v, o, sub) => {
      v.id = 'v' + E.uid() + (seq++); v.ts = Date.now() + seq; v.no = uniqueNo(v.type, o.number, o.date, sub); v.src = 'tally:' + (o.guid || (o.raw + '|' + o.number + '|' + o.date)) + (sub ? '#' + sub : '');
      const err = E.validateVoucher(S, v); if (err.length) { have.delete(v.type + '|' + v.no); return skip('invalid: ' + err[0]); }
      S.vouchers.push(v); rep.imported++; rep.vouchers[v.type] = (rep.vouchers[v.type] || 0) + 1; srcs.add(v.src);
      if (v.type === 'sale' || v.type === 'purchase') E.syncItems(S, v);
    };
    const enrich = (o) => o.entries.map((e) => Object.assign({}, e, { kind: kindOf(e.name) }));

    const buildInv = (o, type) => {
      const es = enrich(o), pName = o.party || (es.find((e) => e.kind === 'DEBTOR' || e.kind === 'CREDITOR') || {}).name;
      if (!pName) return skip(type + ': no party ledger');
      const party = ensureParty(pName, type === 'sale' ? 'Customer' : 'Supplier');
      const pe = es.find((e) => e.name.toLowerCase() === pName.toLowerCase());
      const wantDr = type === 'sale';
      const taxEs = es.filter((e) => e.kind === 'Duties & Taxes' && isTaxName(e.name));
      const igst = taxEs.filter((e) => /igst/i.test(e.name)).reduce((s, e) => s + e.dr + e.cr, 0), taxTotal = taxEs.reduce((s, e) => s + e.dr + e.cr, 0);
      const rest = es.filter((e) => e !== pe && !taxEs.includes(e) && e.kind !== 'ROUND' && e.kind !== 'DEBTOR' && e.kind !== 'CREDITOR' && e.kind !== 'Bank Accounts' && e.kind !== 'Cash-in-Hand' && (wantDr ? e.cr > 0 : e.dr > 0));
      const lines = [];
      let base = o.inv.length ? o.inv.reduce((s, x) => s + x.amount, 0) : rest.reduce((s, e) => s + e.dr + e.cr, 0);
      const overall = base > 0 ? snapRate(taxTotal / base * 100) : 0;
      if (o.inv.length) {
        o.inv.forEach((x) => {
          const it = E.findItem(S, x.item) || D.items.find((i) => i.name.toLowerCase() === x.item.toLowerCase()), gst = x.gst != null ? snapRate(x.gst) : (itemGst(x.item) != null ? itemGst(x.item) : overall), d = Math.min(Math.max(x.disc, 0), 99.99);
          let q = x.qty || 1, rate = x.rate;
          const expect = r2(q * rate * (1 - d / 100)); if (!rate || Math.abs(expect - x.amount) > 0.01) rate = +(x.amount / (q * (1 - d / 100))).toFixed(6);
          lines.push({ desc: x.item, hsn: (it && it.hsn) || '', qty: q, unit: mapUnit(x.unit || (it && it.unit)), rate, disc: d, gst });
        });
      } else rest.forEach((e) => lines.push({ desc: e.name, hsn: '', qty: 1, unit: 'Nos', rate: e.dr + e.cr, disc: 0, gst: overall }));
      if (!lines.length) return skip(type + ': no items or amounts');
      const inter = igst > 0 ? true : taxTotal > 0 ? false : E.isInterstate(S, party);
      const base0 = { type, date: o.date, partyId: party.id, lines, refNo: o.ref || '', narration: o.narr || '', interstate: inter, itc: true, dueDate: E.addDays(o.date, num(party.creditDays)) };
      const b = E.buildInvoice(S, base0), expected = pe ? pe.dr + pe.cr : 0;
      if (expected && Math.abs(b.total - expected) > 1.01) warn((type === 'sale' ? 'Sale ' : 'Purchase ') + o.number + ' (' + o.date + '): total here ₹' + b.total + ', Tally ₹' + expected + '. Please check.');
      add(b, o, 0);
    };

    const accAcct = (e) => accountFor(e.name);
    const buildSettle = (o, type) => {
      const es = enrich(o), money = (e) => (type === 'receipt' ? e.dr : e.cr), counter = (e) => (type === 'receipt' ? e.cr : e.dr);
      const bankEs = es.filter((e) => (e.kind === 'Bank Accounts' || e.kind === 'Cash-in-Hand') && money(e) > 0);
      if (!bankEs.length) return skip(type + ': no cash or bank ledger');
      const mode = accAcct(bankEs[0]); if (!mode) return skip(type + ': bank ledger not found');
      const tdsE = es.filter((e) => /\btds\b/i.test(e.name) && money(e) > 0), tds = r2(tdsE.reduce((s, e) => s + money(e), 0));
      const isCash = (e) => e.kind === 'Bank Accounts' || e.kind === 'Cash-in-Hand';
      const cs = es.filter((e) => counter(e) > 0 && !isCash(e) && !tdsE.includes(e));
      if (!cs.length) return skip(type + ': no party or ledger on the other side');
      const taxCs = cs.filter((e) => e.kind === 'Duties & Taxes' && isTaxName(e.name)), main = cs.filter((e) => !taxCs.includes(e));
      const exp = main.filter((e) => type === 'payment' && (e.kind === 'Indirect Expenses' || e.kind === 'Direct Expenses'));
      let sub = 0;
      main.forEach((c) => {
        const amt = counter(c), t = main.length === 1 ? tds : 0, instr = bankEs[0].instr || o.ref || '';
        if (exp.includes(c)) {
          const a = accAcct(c); let gst = 0, interstate = false;
          if (exp.length === 1 && taxCs.length) { const tt = taxCs.reduce((s, e) => s + counter(e), 0); gst = snapRate(tt / amt * 100); interstate = taxCs.some((e) => /igst/i.test(e.name)); }
          else if (taxCs.length) warn('Payment ' + o.number + ' (' + o.date + '): GST on a multi-line payment could not be split.');
          const v = E.buildExpense({ type: 'expense', date: o.date, head: 'a:' + a.id, paidFrom: 'a:' + mode.id, amount: amt, gst, interstate, itc: gst > 0, refNo: o.ref || '', narration: o.narr || '' });
          return add(v, o, sub++ || 0);
        }
        const isParty = c.kind === 'DEBTOR' || c.kind === 'CREDITOR' || c.kind == null;
        const v = { type, date: o.date, mode: 'a:' + mode.id, amount: r2(amt - t), tds: t, refNo: instr, narration: o.narr || '', alloc: [] };
        if (isParty) {
          const p = ensureParty(c.name, type === 'receipt' ? 'Customer' : 'Supplier'); v.counter = 'p:' + p.id;
          const side = type === 'receipt' ? 'Dr' : 'Cr', open = E.partyBills(S, idx, p.id, o.date).bills.filter((b) => b.side === side);
          const named = c.bills.filter((b) => /agst/i.test(b.type) && b.name);
          if (named.length) { named.forEach((b) => { const m = open.find((x) => String(x.no).toLowerCase() === b.name.toLowerCase() && x.out > 0); if (m) { const used = v.alloc.filter((a) => a.ref === m.ref).reduce((s, a) => s + a.amt, 0), amt2 = r2(Math.min(b.amt, m.out - used)); if (amt2 > 0) v.alloc.push({ ref: m.ref, amt: amt2 }); } }); }
          else if (!c.bills.length) v.alloc = E.autoAllocate(open, r2(amt));
          if (named.length && !v.alloc.length) warn((type === 'receipt' ? 'Receipt ' : 'Payment ') + o.number + ': bill references did not match, so it is kept as an advance.');
        } else { const a = accAcct(c); if (!a) return skip(type + ': ledger not found'); v.counter = 'a:' + a.id; }
        add(v, o, sub++ || 0);
      });
      taxCs.forEach((c) => { if (exp.length === 1) return; const sid = sysTax(c.name, type === 'payment' ? 'in' : 'out'), a = sid && acctById(sid); if (a) add({ type, date: o.date, mode: 'a:' + mode.id, amount: counter(c), tds: 0, refNo: '', narration: o.narr || '', alloc: [], counter: 'a:' + a.id }, o, sub++ || 0); });
    };

    const buildContra = (o) => {
      const es = enrich(o).filter((e) => e.kind === 'Bank Accounts' || e.kind === 'Cash-in-Hand'), drs = es.filter((e) => e.dr > 0), crs = es.filter((e) => e.cr > 0);
      if (!drs.length || !crs.length) return skip('contra: needs a bank or cash ledger on both sides');
      if (drs.length > 1 || crs.length > 1) warn('Contra ' + o.number + ' (' + o.date + '): has several accounts, imported against the first.');
      drs.forEach((d, i) => { const f = crs[0], a = accAcct(f), b = accAcct(d); if (!a || !b || a.id === b.id) return skip('contra: same account on both sides'); add({ type: 'contra', date: o.date, from: 'a:' + a.id, to: 'a:' + b.id, amount: d.dr, refNo: o.ref || '', narration: o.narr || '' }, o, i); });
    };

    const list = D.vouchers.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    list.forEach((o) => {
      if (!o.date) return skip('no valid date');
      if (o.skip) return skip(o.skip);
      const tl = { creditnote: 'credit notes', debitnote: 'debit notes', journal: 'journal vouchers', other: 'other voucher types' }[o.type];
      if (tl) return skip(tl);
      const key = 'tally:' + (o.guid || (o.raw + '|' + o.number + '|' + o.date));
      if (srcs.has(key) || srcs.has(key + '#1')) { rep.duplicates++; return; }
      if (o.type === 'sale' || o.type === 'purchase') buildInv(o, o.type); else if (o.type === 'receipt' || o.type === 'payment') buildSettle(o, o.type); else if (o.type === 'contra') buildContra(o);
    });
    // books start
    const dates = S.vouchers.filter((v) => v.src && v.src.indexOf('tally:') === 0).map((v) => v.date).sort();
    if (dates.length) { const from = E.fyRange(E.fyStartYear(dates[0])).from; if (from < S.booksFrom) { S.booksFrom = from; rep.booksFrom = from; } }
    return rep;
  }

  return { decodeBuffer, parseXML, extract, apply, snapRate, classify };
});
