/* Forms, voucher view, event handlers, boot. */
(function () {
  'use strict';
  const E = window.Engine, A = window.A, { r2, num } = E;
  const { esc, fmt, fdate, today, opts, field, fields, read, stateOpts, chip } = A.u;
  const UNITS = ['Nos', 'Pcs', 'Kg', 'MT', 'Ltr', 'Mtr', 'Box', 'Set', 'Pair', 'Hrs', 'Job'];
  const GST_RATES = [0, 5, 12, 18, 28];

  // ---------- data mutations ----------
  A.upsertVoucher = function (v) {
    const i = A.S.vouchers.findIndex((x) => x.id === v.id);
    if (i >= 0) A.S.vouchers[i] = v; else A.S.vouchers.push(v);
    A.store.enqueue({ kind: 'voucher', id: v.id });
    A.refresh();
  };
  A.deleteVoucher = function (id) {
    A.S.vouchers.forEach((x) => { if (x.alloc && x.alloc.some((a) => a.ref === id)) { x.alloc = x.alloc.filter((a) => a.ref !== id); A.store.enqueue({ kind: 'voucher', id: x.id }); } });
    A.S.vouchers = A.S.vouchers.filter((x) => x.id !== id);
    A.store.enqueue({ kind: 'voucher', id });
    A.refresh();
  };
  A.saveMeta = () => { A.store.enqueue({ kind: 'meta' }); };

  // ---------- party form ----------
  const PARTY_SPEC = [
    { k: 'name', l: 'Party name', c: 'w2', a: ' required' },
    { k: 'type', l: 'Type', t: 'select', o: [['Customer', 'Customer (we sell to)'], ['Supplier', 'Supplier (we buy from)'], ['Both', 'Both']] },
    { k: 'contactPerson', l: 'Contact person' },
    { k: 'phone', l: 'Phone' }, { k: 'email', l: 'Email', t: 'email' },
    { k: 'gstin', l: 'GSTIN', a: ' maxlength="15" autocapitalize="characters" placeholder="Leave empty if unregistered"', h: '<span id="gstHint"></span>' },
    { k: 'pan', l: 'PAN', a: ' maxlength="10" autocapitalize="characters"' },
    { k: 'address', l: 'Address', t: 'textarea', rows: 2, c: 'w2' },
    { k: 'city', l: 'City' }, { k: 'stateCode', l: 'State', t: 'select', o: [['', 'Select state']].concat(stateOpts()) }, { k: 'pin', l: 'PIN code', a: ' inputmode="numeric" maxlength="6"' },
    { k: 'creditDays', l: 'Credit days', t: 'number', h: 'Due date = invoice date + credit days' },
    { k: 'creditLimit', l: 'Credit limit (₹)', t: 'number' },
    { k: 'opening', l: 'Opening balance (₹)', t: 'number', h: 'As on the day books begin' },
    { k: 'openingType', l: 'Opening is', t: 'select', o: [['Dr', 'Dr — they owe us'], ['Cr', 'Cr — we owe them']] },
    { k: 'bankName', l: 'Bank name' }, { k: 'bankAcc', l: 'Account number' }, { k: 'ifsc', l: 'IFSC' },
    { k: 'notes', l: 'Notes', t: 'textarea', rows: 2, c: 'w2' },
  ];
  A.forms.party = function (id, o) {
    o = o || {};
    const p = id ? A.S.parties.find((x) => x.id === id) : Object.assign({ type: o.type || 'Customer', creditDays: 30, opening: '', openingType: o.type === 'Supplier' ? 'Cr' : 'Dr', stateCode: A.S.company.stateCode }, {});
    const used = id && (A.S.vouchers.some((v) => v.partyId === id || v.counter === 'p:' + id || v.paidFrom === 'p:' + id));
    const ov = A.openModal({
      title: id ? 'Edit party' : 'New party', size: 'lg',
      body: '<form id="partyForm" autocomplete="off"><div class="err" id="pfErr" hidden></div><div class="grid g4">' + fields(PARTY_SPEC, p) + '</div></form>',
      foot: (id ? '<button type="button" class="btn dng left" data-act="delParty" data-id="' + id + '"' + (used ? ' disabled title="Has transactions"' : '') + '>Delete</button>' : '') + '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="partySave">Save party</button>',
    });
    const form = ov.querySelector('#partyForm'), g = (n) => form.elements[n];
    const hint = () => {
      const v = g('gstin').value.trim().toUpperCase(), h = ov.querySelector('#gstHint');
      if (!v) { h.textContent = ''; h.className = ''; return; }
      if (E.GSTIN_RE.test(v)) { h.textContent = 'Valid format · ' + (E.stateName(v.slice(0, 2)) || 'unknown state'); h.className = 'ok'; } else { h.textContent = 'Check the format (15 characters)'; h.className = 'bad'; }
    };
    g('gstin').addEventListener('input', () => { g('gstin').value = g('gstin').value.toUpperCase(); hint(); const v = g('gstin').value; if (E.GSTIN_RE.test(v)) { g('stateCode').value = v.slice(0, 2); if (!g('pan').value) g('pan').value = v.slice(2, 12); } });
    hint();
    const submit = () => {
      const d = read(form), err = [];
      d.name = d.name.trim(); d.gstin = d.gstin.trim().toUpperCase(); d.pan = d.pan.trim().toUpperCase();
      if (!d.name) err.push('Enter the party name.');
      if (A.S.parties.some((x) => x.id !== id && x.name.trim().toLowerCase() === d.name.toLowerCase())) err.push('A party named “' + d.name + '” already exists.');
      if (d.gstin && !E.GSTIN_RE.test(d.gstin)) err.push('GSTIN format is not valid.');
      if (d.pan && !E.PAN_RE.test(d.pan)) err.push('PAN format is not valid.');
      if (!d.stateCode && d.type !== 'Supplier') err.push('Select the state so GST can be split correctly (CGST + SGST or IGST).');
      const eb = ov.querySelector('#pfErr');
      if (err.length) { eb.hidden = false; eb.innerHTML = err.map(esc).join('<br>'); eb.scrollIntoView({ block: 'nearest' }); return; }
      const rec = Object.assign({}, p || {}, d, { id: id || ('p' + E.uid()), state: E.stateName(d.stateCode), creditDays: num(d.creditDays), creditLimit: num(d.creditLimit), opening: r2(num(d.opening)) });
      if (id) A.S.parties[A.S.parties.findIndex((x) => x.id === id)] = rec; else A.S.parties.push(rec);
      A.store.enqueue({ kind: 'party', id: rec.id });
      A.closeModal(); A.refresh(); A.toast('Party saved');
      if (o.onSaved) o.onSaved(rec);
    };
    ov.querySelector('#partySave').addEventListener('click', submit);
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  };

  // ---------- ledger (account) form ----------
  A.forms.account = function (id, preset) {
    const a = id ? A.S.accounts.find((x) => x.id === id) : Object.assign({ name: '', group: 'Indirect Expenses', opening: '', openingType: 'Dr' }, preset || {});
    const posted = id && A.idx.byAcct.has('a:' + id);
    const spec = [
      { k: 'name', l: 'Ledger name', c: 'w2', a: ' required' },
      { k: 'group', l: 'Group', t: 'select', o: E.GROUP_ORDER, a: a.sys ? ' disabled' : '' },
      { k: 'opening', l: 'Opening balance (₹)', t: 'number', h: 'Balance-sheet ledgers only' },
      { k: 'openingType', l: 'Opening is', t: 'select', o: ['Dr', 'Cr'] },
    ];
    const ov = A.openModal({
      title: id ? 'Edit ledger' : 'New ledger', size: 'md',
      body: '<form id="acctForm" autocomplete="off"><div class="err" id="afErr" hidden></div><div class="grid g2">' + fields(spec, a) + '</div><div class="note">Bank accounts go under “Bank Accounts”. They then appear in receipts, payments and contra entries.</div></form>',
      foot: (id && !a.sys ? '<button type="button" class="btn dng left" data-act="delAcct" data-id="' + id + '"' + (posted ? ' disabled title="Has transactions"' : '') + '>Delete</button>' : '') + '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="acctSave">Save ledger</button>',
    });
    const form = ov.querySelector('#acctForm');
    const sync = () => { const nom = E.isNominal(form.elements.group.value); form.elements.opening.disabled = nom; form.elements.openingType.disabled = nom; };
    form.elements.group.addEventListener('change', sync); sync();
    ov.querySelector('#acctSave').addEventListener('click', () => {
      const d = read(form), eb = ov.querySelector('#afErr'); d.name = d.name.trim();
      const group = a.sys ? a.group : d.group;
      const err = [];
      if (!d.name) err.push('Enter a ledger name.');
      if (A.S.accounts.some((x) => x.id !== id && x.name.toLowerCase() === d.name.toLowerCase())) err.push('A ledger with this name exists.');
      if (id && posted && E.isNominal(a.group) !== E.isNominal(group)) err.push('This ledger has transactions, so its group cannot change between balance sheet and profit and loss.');
      if (err.length) { eb.hidden = false; eb.innerHTML = err.map(esc).join('<br>'); return; }
      const rec = Object.assign({}, a, { name: d.name, group, opening: E.isNominal(group) ? 0 : r2(num(d.opening)), openingType: d.openingType || 'Dr' });
      if (id) A.S.accounts[A.S.accounts.findIndex((x) => x.id === id)] = rec; else { rec.id = 'x' + E.uid(); A.S.accounts.push(rec); }
      A.saveMeta(); A.closeModal(); A.refresh(); A.toast('Ledger saved');
    });
  };

  // ---------- invoice form (sale / purchase) ----------
  A.forms.invoice = function (type, id, preset) {
    const S = A.S, isSale = type === 'sale';
    const old = id ? S.vouchers.find((x) => x.id === id) : null;
    const date0 = old ? old.date : A.defaultDate();
    const f = old ? JSON.parse(JSON.stringify(old)) : { type, date: date0, no: E.nextNo(S, type, date0), partyId: (preset && preset.partyId) || '', refNo: '', dueDate: '', narration: '', itc: true, lines: [{ desc: '', hsn: '', qty: '', unit: 'Nos', rate: '', disc: 0, gst: S.tax.defaultGst }] };
    const SC = !old && preset && preset.scan;
    if (SC) { if (SC.date) f.date = SC.date; f.refNo = SC.refNo || ''; f.lines = SC.lines; f.no = E.nextNo(S, type, f.date); f.narration = 'Scanned bill'; }
    f.taxMode = f.taxMode === 'incl' ? 'incl' : 'excl';
    f.dueManual = !!old; f.interManual = old ? true : false;
    const parties = () => S.parties.filter((p) => p.type === (isSale ? 'Customer' : 'Supplier') || p.type === 'Both' || p.id === f.partyId).sort((a, b) => a.name.localeCompare(b.name));
    const stockMap = E.itemStock(S, old ? old.id : null);
    const impCands = (() => {
      if (!isSale) return [];
      const list = []; S.vouchers.filter((v) => v.type === 'purchase').sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((v) => {
        const p = S.parties.find((x) => x.id === v.partyId), lbl = (p ? p.name : '—') + ' · ' + fdate(v.date) + ' · ₹ ' + fmt(v.total);
        [v.refNo, v.no].filter((x, i, a) => x && a.indexOf(x) === i).forEach((no) => list.push({ no, v, label: lbl, sup: p ? p.name : '' }));
      });
      const cnt = {}; list.forEach((c) => { const k = c.no.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; });
      list.forEach((c) => { c.value = cnt[c.no.toLowerCase()] > 1 ? c.no + ' · ' + c.sup : c.no; });
      return list;
    })();
    const itemRate = (it) => { const ex = num(isSale ? it.saleRate : it.purchaseRate); return f.taxMode === 'incl' ? r2(ex * (1 + num(it.gst) / 100)) : ex; };
    const lineRow = (l, i) => '<tr data-i="' + i + '"><td class="sn">' + (i + 1) + '</td><td><input class="ln-desc" list="descList" value="' + esc(l.desc) + '" placeholder="Item or service" aria-label="Description"><small class="stk"></small></td><td><input class="ln-hsn mono" value="' + esc(l.hsn) + '" maxlength="8" inputmode="numeric" aria-label="HSN"></td><td><input class="ln-qty n" type="number" step="any" min="0" value="' + esc(l.qty) + '" aria-label="Quantity"></td><td><select class="ln-unit" aria-label="Unit">' + opts(UNITS, l.unit || 'Nos') + '</select></td><td><input class="ln-rate n" type="number" step="any" min="0" value="' + esc(l.rate) + '" aria-label="Rate"></td><td><input class="ln-disc n" type="number" step="any" min="0" max="100" value="' + esc(l.disc) + '" aria-label="Discount percent"></td><td><select class="ln-gst" aria-label="GST rate">' + opts(GST_RATES.map((r) => [String(r), r + '%']), String(num(l.gst))) + '</select></td><td class="n"><input class="ln-amt n" type="number" step="any" min="0" aria-label="Line amount"></td><td><button type="button" class="x sm" data-act="lnDel" aria-label="Remove line">×</button></td></tr>';
    const body = '<form id="invForm" autocomplete="off">' + (SC ? A.scan.notice(SC, (SC.addedSupplier ? ' New supplier added: <b>' + esc(S.parties.find((p) => p.id === f.partyId).name) + '</b>.' : '') + (f.partyId ? '' : ' Supplier not found. Choose or add one.')) : '') + '<div class="err" id="ifErr" hidden></div>'
      + '<div class="grid g4">'
      + field(isSale ? 'Customer' : 'Supplier', '<div class="inl"><select name="partyId" id="ifParty"><option value="">Select…</option>' + opts(parties().map((p) => [p.id, p.name]), f.partyId) + '</select><button type="button" class="btn sm" data-act="ifNewParty">＋ New</button></div>', 'w2')
      + field('Date', '<input type="date" name="date" value="' + f.date + '">')
      + field(isSale ? 'Invoice number' : 'Our reference', '<input name="no" value="' + esc(f.no) + '">')
      + field(isSale ? 'Customer PO / reference' : 'Supplier’s invoice number', '<input name="refNo" value="' + esc(f.refNo || '') + '">')
      + field('Due date', '<input type="date" name="dueDate" value="' + (f.dueDate || '') + '">')
      + '</div><div class="pos" id="ifPos"></div>'
      + (isSale ? '<div class="note imp" id="impBox" hidden><b>Import items from a purchase bill</b><div class="inl"><input id="impNo" list="impList" placeholder="Type or pick purchase bill number" autocomplete="off"><button type="button" class="btn pri sm" data-act="impGo">Import all items</button></div><small id="impMsg" class="muted"></small><datalist id="impList">' + impCands.map((c) => '<option value="' + esc(c.value) + '" label="' + esc(c.label) + '">').join('') + '</datalist></div>' : '')
      + '<div class="scroll"><table class="lines"><thead><tr><th>#</th><th>Description</th><th>HSN / SAC</th><th class="n">Qty</th><th>Unit</th><th class="n" id="thRate">Rate ₹</th><th class="n">Disc %</th><th>GST</th><th class="n" id="thAmt">Amount ₹</th><th></th></tr></thead><tbody id="lineBody">' + f.lines.map(lineRow).join('') + '</tbody></table></div>'
      + '<datalist id="descList">' + (S.items || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((it) => { const m = stockMap.get(E.itemKey(it.name)); return '<option value="' + esc(it.name) + '" label="' + esc([it.hsn && 'HSN ' + it.hsn, 'Stock ' + (m ? m.onHand : 0) + ' ' + (it.unit || '')].filter(Boolean).join(' · ')) + '">'; }).join('') + '</datalist>'
      + '<div class="row between"><div class="row"><button type="button" class="btn sm" data-act="lnAdd">＋ Add item</button>' + (isSale ? '<button type="button" class="btn sm" data-act="impOpen">⇩ Import from purchase bill</button>' : '') + '</div><div class="totbox" id="ifTot"></div></div>'
      + '<div class="grid g3">' + field('Narration / notes', '<textarea name="narration" rows="2">' + esc(f.narration || '') + '</textarea>', 'w2') + (isSale ? '' : '<label class="chk"><input type="checkbox" name="itc"' + (f.itc !== false ? ' checked' : '') + '><span>Claim input tax credit on this bill<small>Untick if credit is blocked; GST then becomes part of the purchase cost.</small></span></label>') + '</div></form>';
    const ov = A.openModal({ title: (old ? 'Edit ' : 'New ') + (isSale ? 'sale invoice' : 'purchase bill'), size: 'xl', body, foot: '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="invSave">Save ' + (isSale ? 'invoice' : 'bill') + '</button>' });
    const form = ov.querySelector('#invForm'), tb = ov.querySelector('#lineBody');
    const g = (n) => form.elements[n];
    const party = () => S.parties.find((p) => p.id === g('partyId').value);
    const readLines = () => [...tb.querySelectorAll('tr')].map((tr) => ({ desc: tr.querySelector('.ln-desc').value.trim(), hsn: tr.querySelector('.ln-hsn').value.trim(), qty: tr.querySelector('.ln-qty').value, unit: tr.querySelector('.ln-unit').value, rate: tr.querySelector('.ln-rate').value, disc: tr.querySelector('.ln-disc').value || 0, gst: tr.querySelector('.ln-gst').value }));
    const inter = () => (f.interManual ? f.interstate : E.isInterstate(S, party()));
    const recalc = () => {
      const incl = f.taxMode === 'incl';
      const c = E.calcLines(readLines(), inter(), f.taxMode);
      tb.querySelectorAll('tr').forEach((tr, i) => { const el = tr.querySelector('.ln-amt'); if (el !== document.activeElement) { const x = incl ? c.lines[i].lineTotal : c.lines[i].amount; el.value = (num(tr.querySelector('.ln-qty').value) || num(tr.querySelector('.ln-rate').value)) ? x.toFixed(2) : ''; } });
      tb.querySelectorAll('tr').forEach((tr) => {
        const it = E.findItem(S, tr.querySelector('.ln-desc').value), hint = tr.querySelector('.stk'); if (!hint) return;
        if (!it) { hint.textContent = ''; hint.className = 'stk'; return; }
        const m = stockMap.get(E.itemKey(it.name)), avail = m ? m.onHand : 0, q = num(tr.querySelector('.ln-qty').value);
        const low = isSale && q > avail;
        hint.className = 'stk' + (low || avail < 0 ? ' bad' : ''); hint.textContent = (low ? 'Only ' : 'In stock: ') + avail + ' ' + (it.unit || '') + (low ? ' in stock' : '');
      });
      ov.querySelector('#thRate').textContent = 'Rate ₹ (' + (incl ? 'incl.' : 'excl.') + ' GST)'; ov.querySelector('#thAmt').textContent = 'Amount ₹ (' + (incl ? 'incl.' : 'excl.') + ' GST)';
      const p = party(), cs = S.company;
      const supply = isSale ? (p && p.state ? p.state : 'select a customer') : (cs.state || 'your state');
      ov.querySelector('#ifPos').innerHTML = '<span>Place of supply: <b>' + esc(supply) + '</b></span><label class="chk inline"><input type="checkbox" id="ifInter"' + (inter() ? ' checked' : '') + '><span>Inter-state supply (IGST)</span></label><span class="muted">' + (inter() ? 'IGST applies' : 'CGST + SGST apply') + '</span><label class="chk inline">Rates are <select id="ifMode" aria-label="Tax mode">' + opts([['excl', 'Exclusive of GST'], ['incl', 'Inclusive of GST']], f.taxMode) + '</select></label>';
      ov.querySelector('#ifMode').onchange = (e) => { f.taxMode = e.target.value; recalc(); };
      ov.querySelector('#ifInter').onchange = (e) => { f.interManual = true; f.interstate = e.target.checked; recalc(); };
      if (SC) ov.querySelector('#scanCmp').innerHTML = A.scan.compare(SC, c.total);
      ov.querySelector('#ifTot').innerHTML = '<table><tbody><tr><td>Taxable value</td><td class="n">' + fmt(c.taxable) + '</td></tr>' + (inter() ? '<tr><td>IGST</td><td class="n">' + fmt(c.igst) + '</td></tr>' : '<tr><td>CGST</td><td class="n">' + fmt(c.cgst) + '</td></tr><tr><td>SGST</td><td class="n">' + fmt(c.sgst) + '</td></tr>') + '<tr><td>Round off</td><td class="n">' + fmt(c.roundOff) + '</td></tr><tr class="grand"><td>Total</td><td class="n">₹ ' + fmt(c.total) + '</td></tr></tbody></table><div class="words">' + esc(E.numToWords(c.total)) + '</div>';
      return c;
    };
    const autoDue = () => { if (f.dueManual) return; const p = party(); g('dueDate').value = E.addDays(g('date').value || date0, p ? num(p.creditDays) : 0); };
    if (!old) autoDue();
    recalc();
    g('dueDate').addEventListener('change', () => { f.dueManual = true; });
    g('date').addEventListener('change', autoDue);
    g('partyId').addEventListener('change', () => { f.interManual = false; autoDue(); recalc(); });
    form.addEventListener('input', (e) => {
      const t = e.target;
      if (t.classList.contains('ln-amt')) {
        const tr = t.closest('tr'), qEl = tr.querySelector('.ln-qty'); let q = num(qEl.value); if (!q) { q = 1; qEl.value = '1'; }
        const den = q * (1 - num(tr.querySelector('.ln-disc').value) / 100);
        if (den > 0) tr.querySelector('.ln-rate').value = String(+(num(t.value) / den).toFixed(6));
      }
      if (t.classList.contains('ln-desc')) {
        const it = E.findItem(S, t.value);
        if (it) {
          const tr = t.closest('tr');
          if (!tr.querySelector('.ln-hsn').value) tr.querySelector('.ln-hsn').value = it.hsn || '';
          const r = itemRate(it); if (!tr.querySelector('.ln-rate').value && r) tr.querySelector('.ln-rate').value = String(r);
          tr.querySelector('.ln-unit').value = it.unit || 'Nos'; tr.querySelector('.ln-gst').value = String(num(it.gst));
          if (!tr.querySelector('.ln-qty').value) tr.querySelector('.ln-qty').value = '1';
        }
      }
      recalc();
    });
    form.addEventListener('change', (e) => { if (e.target.classList.contains('ln-gst') || e.target.classList.contains('ln-unit')) recalc(); });
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'impOpen') { const bx = ov.querySelector('#impBox'); bx.hidden = !bx.hidden; if (!bx.hidden) ov.querySelector('#impNo').focus(); e.stopPropagation(); return; }
      if (b.dataset.act === 'impGo') {
        e.stopPropagation(); const inp = ov.querySelector('#impNo'), msg = ov.querySelector('#impMsg'), q = inp.value.trim().toLowerCase();
        if (!q) { msg.textContent = 'Enter a purchase bill number.'; return; }
        let hit = impCands.filter((c) => c.value.toLowerCase() === q);
        if (!hit.length) hit = impCands.filter((c) => c.no.toLowerCase() === q);
        const vs = [...new Set(hit.map((c) => c.v))];
        if (!vs.length) { msg.textContent = 'No purchase bill found with this number.'; return; }
        if (vs.length > 1) { msg.textContent = 'More than one supplier has this bill number. Pick one from the list.'; return; }
        const pv = vs[0], taken = readLines().filter((l) => l.desc || num(l.qty) || num(l.rate)); let noRate = 0;
        const add = (pv.lines || []).filter((l) => l.desc).map((l) => {
          const it = E.findItem(S, l.desc), q0 = num(l.qty), d0 = num(l.disc), g0 = num(l.gst);
          const exBuy = q0 && l.amount != null ? r2(num(l.amount) / (q0 * (1 - d0 / 100))) : (pv.taxMode === 'incl' ? r2(num(l.rate) / (1 + g0 / 100)) : num(l.rate));
          let ex = it && num(it.saleRate) ? num(it.saleRate) : (noRate++, exBuy);
          return { desc: it ? it.name : l.desc, hsn: l.hsn || (it && it.hsn) || '', qty: l.qty, unit: l.unit || 'Nos', rate: f.taxMode === 'incl' ? r2(ex * (1 + g0 / 100)) : ex, disc: 0, gst: g0 };
        });
        if (!add.length) { msg.textContent = 'This bill has no items.'; return; }
        tb.innerHTML = taken.concat(add).map(lineRow).join(''); recalc();
        msg.textContent = add.length + ' item(s) imported from ' + (pv.refNo || pv.no) + '.' + (noRate ? ' ' + noRate + ' line(s) show the purchase rate. Change them to your selling rate.' : ''); inp.value = '';
        return;
      }
      if (b.dataset.act === 'lnAdd') { const ls = readLines(); ls.push({ desc: '', hsn: '', qty: '', unit: 'Nos', rate: '', disc: 0, gst: S.tax.defaultGst }); tb.innerHTML = ls.map(lineRow).join(''); recalc(); tb.querySelector('tr:last-child .ln-desc').focus(); e.stopPropagation(); }
      else if (b.dataset.act === 'lnDel') { const ls = readLines(); const i = [...tb.children].indexOf(b.closest('tr')); if (ls.length > 1) ls.splice(i, 1); else ls[0] = { desc: '', hsn: '', qty: '', unit: 'Nos', rate: '', disc: 0, gst: S.tax.defaultGst }; tb.innerHTML = ls.map(lineRow).join(''); recalc(); e.stopPropagation(); }
      else if (b.dataset.act === 'ifNewParty') { A.forms.party(null, { type: isSale ? 'Customer' : 'Supplier', onSaved: (p) => { const sel = g('partyId'); sel.innerHTML = '<option value="">Select…</option>' + opts(parties().map((x) => [x.id, x.name]), p.id); sel.value = p.id; f.interManual = false; autoDue(); recalc(); } }); e.stopPropagation(); }
    });
    ov.querySelector('#invSave').addEventListener('click', () => {
      const lines = readLines().filter((l) => l.desc || num(l.qty) || num(l.rate));
      const base = Object.assign({}, old || {}, { id: old ? old.id : 'v' + E.uid(), ts: old ? old.ts : Date.now(), type, date: g('date').value, no: g('no').value.trim(), partyId: g('partyId').value, refNo: g('refNo').value.trim(), dueDate: g('dueDate').value, narration: g('narration').value.trim(), itc: isSale ? undefined : g('itc').checked, lines, interstate: inter(), taxMode: f.taxMode });
      const v = E.buildInvoice(S, base);
      const err = E.validateVoucher(S, v);
      if (!isSale && v.partyId && v.refNo && S.vouchers.some((x) => x.type === 'purchase' && x.id !== v.id && x.partyId === v.partyId && x.refNo === v.refNo)) err.push('This supplier invoice number is already recorded for this supplier.');
      lines.forEach((l, i) => { if (!l.desc) err.push('Item ' + (i + 1) + ' needs a description.'); });
      const eb = ov.querySelector('#ifErr');
      if (err.length) { eb.hidden = false; eb.innerHTML = err.map(esc).join('<br>'); eb.scrollIntoView({ block: 'nearest' }); return; }
      if (old && old.alloc) v.alloc = old.alloc;
      if (E.syncItems(S, v)) A.saveMeta();
      A.upsertVoucher(v); A.closeModal(); A.toast((isSale ? 'Invoice ' : 'Bill ') + v.no + ' saved');
      if (isSale && !old) A.forms.view(v.id);
    });
  };


  // ---------- stock item form ----------
  A.forms.item = function (id) {
    const S = A.S, it = id ? S.items.find((x) => x.id === id) : { name: '', hsn: '', unit: 'Nos', gst: S.tax.defaultGst, saleRate: '', purchaseRate: '', openQty: '' };
    if (!it) return;
    const used = id && S.vouchers.some((v) => (v.type === 'sale' || v.type === 'purchase') && (v.lines || []).some((l) => E.itemKey(l.desc) === E.itemKey(it.name)));
    const ov = A.openModal({
      title: id ? 'Edit stock item' : 'New stock item', size: 'md',
      body: '<form id="itemForm" autocomplete="off"><div class="err" id="itErr" hidden></div><div class="grid g2">'
        + field('Item name', '<input name="name" value="' + esc(it.name) + '" required>', 'w2')
        + field('HSN / SAC', '<input name="hsn" class="mono" maxlength="8" inputmode="numeric" value="' + esc(it.hsn) + '">')
        + field('Unit', '<select name="unit">' + opts(UNITS, it.unit || 'Nos') + '</select>')
        + field('GST rate', '<select name="gst">' + opts(GST_RATES.map((r) => [String(r), r + '%']), String(num(it.gst))) + '</select>')
        + field('Opening stock (qty)', '<input name="openQty" type="number" step="any" value="' + esc(it.openQty) + '">', '', 'Quantity in hand when your books begin')
        + field('Selling rate ₹ (before GST)', '<input name="saleRate" type="number" step="any" min="0" value="' + esc(it.saleRate || '') + '">', '', 'Fills automatically in sale invoices')
        + field('Purchase rate ₹ (before GST)', '<input name="purchaseRate" type="number" step="any" min="0" value="' + esc(it.purchaseRate || '') + '">', '', 'Fills automatically in purchase bills')
        + '</div></form>',
      foot: (id ? '<button type="button" class="btn dng left" data-act="delItem" data-id="' + id + '"' + (used ? ' disabled title="Used in invoices"' : '') + '>Delete</button>' : '') + '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="itemSave">Save item</button>',
    });
    const form = ov.querySelector('#itemForm');
    const submit = () => {
      const d = read(form), eb = ov.querySelector('#itErr'); d.name = d.name.trim().replace(/\s+/g, ' ');
      if (!d.name) { eb.hidden = false; eb.textContent = 'Enter the item name.'; return; }
      if (S.items.some((x) => x.id !== id && E.itemKey(x.name) === E.itemKey(d.name))) { eb.hidden = false; eb.textContent = 'An item with this name already exists.'; return; }
      const rec = Object.assign({}, it, { name: d.name, hsn: d.hsn.trim(), unit: d.unit, gst: num(d.gst), openQty: num(d.openQty), saleRate: r2(num(d.saleRate)), purchaseRate: r2(num(d.purchaseRate)) });
      if (id) {
        if (E.itemKey(it.name) !== E.itemKey(d.name)) S.vouchers.forEach((v) => { if ((v.type === 'sale' || v.type === 'purchase') && (v.lines || []).some((l) => E.itemKey(l.desc) === E.itemKey(it.name))) { v.lines.forEach((l) => { if (E.itemKey(l.desc) === E.itemKey(it.name)) l.desc = d.name; }); A.store.enqueue({ kind: 'voucher', id: v.id }); } });
        S.items[S.items.findIndex((x) => x.id === id)] = rec;
      } else { rec.id = 'i' + E.uid(); S.items.push(rec); }
      A.saveMeta(); A.closeModal(); A.refresh(); A.toast('Item saved');
    };
    ov.querySelector('#itemSave').addEventListener('click', submit);
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  };


  A.forms.itemLedger = function (id) {
    const S = A.S, it = S.items.find((x) => x.id === id); if (!it) return;
    const mv = E.itemMoves(S, it.name), unit = esc(it.unit || '');
    const rows = mv.rows.map((r) => { const p = S.parties.find((x) => x.id === r.partyId); return '<tr><td>' + fdate(r.date) + '</td><td><button type="button" class="lnk" data-act="vView" data-id="' + r.vid + '">' + esc(r.no) + '</button></td><td>' + (r.type === 'purchase' ? 'Purchase' : 'Sale') + '</td><td>' + esc(p ? p.name : '—') + '</td><td class="n">' + (r.inQty || '') + '</td><td class="n">' + (r.outQty || '') + '</td><td class="n ' + (r.bal < 0 ? 'red' : '') + '"><b>' + r.bal + '</b></td></tr>'; }).join('');
    A.openModal({ title: 'Stock ledger · ' + it.name, size: 'lg', body: '<div class="note">Purchases add to stock and sales reduce it. Unit: <b>' + unit + '</b>. Stock in hand now: <b>' + mv.onHand + '</b></div><div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Bill no</th><th>Type</th><th>Party</th><th class="n">In</th><th class="n">Out</th><th class="n">Balance</th></tr></thead><tbody><tr><td colspan="6">Opening stock</td><td class="n"><b>' + mv.open + '</b></td></tr>' + rows + '</tbody></table></div>', foot: '<button type="button" class="btn" data-act="mClose">Close</button>' });
  };
  // ---------- receipt / payment form ----------
  A.forms.settle = function (type, id, preset) {
    const S = A.S, isR = type === 'receipt', old = id ? S.vouchers.find((x) => x.id === id) : null;
    preset = preset || {};
    const cb = A.cashBank();
    const f = old ? JSON.parse(JSON.stringify(old)) : { type, date: A.defaultDate(), no: E.nextNo(S, type, A.defaultDate()), counter: preset.counter || '', mode: cb.some((a) => a.id === 'bank1') ? 'a:bank1' : 'a:' + cb[0].id, amount: preset.amount || '', tds: '', refNo: '', narration: '', alloc: preset.alloc || [], auto: !old && !preset.alloc };
    const cpOpts = () => {
      const ps = S.parties.slice().sort((a, b) => a.name.localeCompare(b.name));
      const sel = f.counter;
      const mk = (list) => opts(list.map((p) => ['p:' + p.id, p.name]), sel);
      const first = isR ? ['Customer', 'Both', 'Supplier'] : ['Supplier', 'Both', 'Customer'];
      const okGroups = isR ? ['Capital Account', 'Loans (Liability)', 'Current Liabilities', 'Fixed Assets', 'Other Current Assets', 'Duties & Taxes', 'Direct Income', 'Indirect Income'] : ['Capital Account', 'Loans (Liability)', 'Current Liabilities', 'Fixed Assets', 'Other Current Assets', 'Duties & Taxes'];
      const other = S.accounts.filter((a) => okGroups.includes(a.group) || 'a:' + a.id === f.counter).map((a) => ['a:' + a.id, a.name + ' · ' + a.group]);
      return '<option value="">Select…</option>' + first.map((t) => (ps.some((p) => p.type === t) ? '<optgroup label="' + (t === 'Both' ? 'Customer and supplier' : t + 's') + '">' + mk(ps.filter((p) => p.type === t)) + '</optgroup>' : '')).join('') + '<optgroup label="Other ledgers">' + opts(other, sel) + '</optgroup>';
    };
    const ov = A.openModal({
      title: (old ? 'Edit ' : 'New ') + (isR ? 'receipt' : 'payment'), size: 'lg',
      body: '<form id="stForm" autocomplete="off"><div class="err" id="stErr" hidden></div><div class="grid g4">'
        + field(isR ? 'Received from' : 'Paid to', '<select name="counter" id="stCounter">' + cpOpts() + '</select>', 'w2')
        + field('Date', '<input type="date" name="date" value="' + f.date + '">')
        + field('Voucher number', '<input name="no" value="' + esc(f.no) + '">')
        + field(isR ? 'Deposited in' : 'Paid from', '<select name="mode">' + opts(cb.map((a) => ['a:' + a.id, a.name]), f.mode) + '</select>')
        + field('Amount ₹', '<input name="amount" id="stAmt" type="number" step="any" min="0" value="' + esc(f.amount) + '">')
        + field(isR ? 'TDS deducted by customer ₹' : 'TDS deducted by you ₹', '<input name="tds" id="stTds" type="number" step="any" min="0" value="' + esc(f.tds || '') + '">', '', 'Optional')
        + field('Cheque / UTR / reference', '<input name="refNo" value="' + esc(f.refNo || '') + '">')
        + '</div><div id="stBills"></div>' + field('Narration', '<textarea name="narration" rows="2">' + esc(f.narration || '') + '</textarea>') + '</form>',
      foot: '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="stSave">Save ' + (isR ? 'receipt' : 'payment') + '</button>',
    });
    const form = ov.querySelector('#stForm'), g = (n) => form.elements[n], box = ov.querySelector('#stBills');
    const settleVal = () => r2(num(g('amount').value) + num(g('tds').value));
    const billsFor = () => {
      const c = g('counter').value; if (!c || c[0] !== 'p') return null;
      const st2 = Object.assign({}, S, { vouchers: S.vouchers.filter((v) => v.id !== (old && old.id)) });
      return E.partyBills(st2, A.idx, c.slice(2), g('date').value || null).bills.filter((b) => b.side === (isR ? 'Dr' : 'Cr'));
    };
    const allocFromDOM = () => [...box.querySelectorAll('input[data-ref]')].map((i) => ({ ref: i.dataset.ref, amt: r2(num(i.value)) })).filter((a) => a.amt > 0);
    const renderBills = (keep) => {
      const bills = billsFor();
      if (!bills) { box.innerHTML = g('counter').value ? '<div class="note">This is a ledger entry, not a party, so there are no bills to match.</div>' : ''; return; }
      const sv = settleVal();
      if (f.auto) f.alloc = E.autoAllocate(bills, sv); else if (keep) f.alloc = allocFromDOM();
      const am = new Map(f.alloc.map((a) => [a.ref, a.amt]));
      const t = today();
      box.innerHTML = '<div class="allochead"><b>Settle bills</b><label class="chk inline"><input type="checkbox" id="stAuto"' + (f.auto ? ' checked' : '') + '><span>Match to oldest bills automatically</span></label></div>' + (bills.length ? '<div class="scroll"><table class="tbl compact"><thead><tr><th>Bill</th><th>Date</th><th>Due</th><th class="n">Outstanding</th><th class="n">Settle now</th></tr></thead><tbody>' + bills.sort((a, b) => (a.date < b.date ? -1 : 1)).map((b) => '<tr><td>' + esc(b.no) + '</td><td>' + fdate(b.date) + '</td><td>' + fdate(b.due) + (b.due < t ? ' ' + chip('overdue', 'bad') : '') + '</td><td class="n">' + fmt(b.out) + '</td><td class="n"><input type="number" step="any" min="0" class="al" data-ref="' + b.ref + '" value="' + (am.get(b.ref) || '') + '" ' + (f.auto ? 'readonly' : '') + ' aria-label="Settle ' + esc(b.no) + '"></td></tr>').join('') + '</tbody></table></div>' : '<div class="note">No open bills for this party. The full amount will be kept as an advance on account.</div>') + '<div class="allocsum" id="stSum"></div>';
      sumUpd();
    };
    const sumUpd = () => { const used = r2(allocFromDOM().reduce((s, a) => s + a.amt, 0)), sv = settleVal(); const el = box.querySelector('#stSum'); if (el) el.innerHTML = '<span>Amount + TDS <b>' + fmt(sv) + '</b></span><span>Matched to bills <b>' + fmt(used) + '</b></span><span class="' + (used > sv + 0.005 ? 'bad' : '') + '">' + (used > sv + 0.005 ? 'Over by ' + fmt(used - sv) : 'Kept on account <b>' + fmt(Math.max(0, sv - used)) + '</b>') + '</span>'; };
    g('counter').addEventListener('change', () => { f.alloc = []; f.auto = true; renderBills(); });
    g('date').addEventListener('change', () => renderBills(true));
    form.addEventListener('input', (e) => { if (e.target.matches('#stAmt, #stTds')) renderBills(true); else if (e.target.classList.contains('al')) { f.auto = false; sumUpd(); } });
    box.addEventListener('change', (e) => { if (e.target.id === 'stAuto') { f.auto = e.target.checked; if (f.auto) f.alloc = []; renderBills(!f.auto); } });
    renderBills();
    ov.querySelector('#stSave').addEventListener('click', () => {
      const v = Object.assign({}, old || {}, { id: old ? old.id : 'v' + E.uid(), ts: old ? old.ts : Date.now(), type, date: g('date').value, no: g('no').value.trim(), counter: g('counter').value, mode: g('mode').value, amount: r2(num(g('amount').value)), tds: r2(num(g('tds').value)), refNo: g('refNo').value.trim(), narration: g('narration').value.trim(), alloc: g('counter').value[0] === 'p' ? allocFromDOM() : [] });
      const err = E.validateVoucher(S, v), eb = ov.querySelector('#stErr');
      if (err.length) { eb.hidden = false; eb.innerHTML = err.map(esc).join('<br>'); eb.scrollIntoView({ block: 'nearest' }); return; }
      A.upsertVoucher(v); A.closeModal(); A.toast((isR ? 'Receipt ' : 'Payment ') + v.no + ' saved');
    });
  };

  // ---------- expense form ----------
  A.forms.expense = function (id, preset) {
    const S = A.S, old = id ? S.vouchers.find((x) => x.id === id) : null;
    const SC = !old && preset && preset.scan;
    const f = old ? JSON.parse(JSON.stringify(old)) : { type: 'expense', date: A.defaultDate(), no: E.nextNo(S, 'expense', A.defaultDate()), head: '', paidFrom: S.accounts.some((a) => a.id === 'cash') ? 'a:cash' : '', amount: '', gst: 0, itc: true, interstate: false, refNo: '', narration: '' };
    if (SC) { if (SC.date) { f.date = SC.date; f.no = E.nextNo(S, 'expense', f.date); } f.refNo = SC.refNo || ''; f.amount = SC.amount; f.gst = SC.gst; f.narration = SC.narration || ''; }
    const heads = S.accounts.filter((a) => a.group === 'Direct Expenses' || a.group === 'Indirect Expenses').filter((a) => a.id !== 'round');
    const headOpts = '<option value="">Select…</option>' + ['Direct Expenses', 'Indirect Expenses'].map((gname) => '<optgroup label="' + gname + '">' + opts(heads.filter((a) => a.group === gname).map((a) => ['a:' + a.id, a.name]), f.head) + '</optgroup>').join('') + '<option value="__new__">＋ Create new expense head…</option>';
    const paidOpts = '<option value="">Select…</option><optgroup label="Paid now from">' + opts(A.cashBank().map((a) => ['a:' + a.id, a.name]), f.paidFrom) + '</optgroup><optgroup label="On credit, payable to">' + opts(S.parties.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => ['p:' + p.id, p.name]), f.paidFrom) + '</optgroup>';
    const ov = A.openModal({
      title: old ? 'Edit expense' : 'New expense', size: 'lg',
      body: '<form id="exForm" autocomplete="off">' + (SC ? A.scan.notice(SC, SC.mixedGst ? ' The bill has more than one GST rate. Only one rate can be entered here, so use a purchase bill if you need the split.' : '') : '') + '<div class="err" id="exErr" hidden></div><div class="grid g4">'
        + field('Expense head', '<select name="head" id="exHead">' + headOpts + '</select><input name="newHead" id="exNew" placeholder="New head name" hidden>', 'w2')
        + field('Date', '<input type="date" name="date" value="' + f.date + '">') + field('Voucher number', '<input name="no" value="' + esc(f.no) + '">')
        + field('Paid from', '<select name="paidFrom" id="exPaid">' + paidOpts + '</select>', 'w2', 'Choose a party if you have not paid yet. It then shows in their outstanding bills.')
        + field('Vendor bill number', '<input name="refNo" value="' + esc(f.refNo || '') + '">')
        + field('Due date', '<input type="date" name="dueDate" value="' + (f.dueDate || '') + '">', '')
        + field('Amount before GST ₹', '<input name="amount" type="number" step="any" min="0" value="' + esc(f.amount) + '">')
        + field('GST rate', '<select name="gst">' + opts(GST_RATES.map((r) => [String(r), r + '%']), String(num(f.gst))) + '</select>')
        + '<label class="chk"><input type="checkbox" name="interstate"' + (f.interstate ? ' checked' : '') + '><span>Inter-state (IGST)</span></label><label class="chk"><input type="checkbox" name="itc"' + (f.itc !== false ? ' checked' : '') + '><span>Claim input tax credit</span></label>'
        + '</div><div class="totbox right" id="exTot"></div>' + field('Narration', '<textarea name="narration" rows="2">' + esc(f.narration || '') + '</textarea>') + '</form>',
      foot: '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="exSave">Save expense</button>',
    });
    const form = ov.querySelector('#exForm'), g = (n) => form.elements[n];
    const upd = () => { const c = E.calcExpense(g('amount').value, g('gst').value, g('interstate').checked); ov.querySelector('#exTot').innerHTML = '<table><tbody><tr><td>Amount</td><td class="n">' + fmt(num(g('amount').value)) + '</td></tr><tr><td>GST</td><td class="n">' + fmt(c.tax) + '</td></tr><tr class="grand"><td>Total</td><td class="n">₹ ' + fmt(c.total) + '</td></tr></tbody></table>'; };
    const dueSync = () => { const v = g('paidFrom').value, d = g('dueDate'); d.closest('label').hidden = !(v && v[0] === 'p'); if (v && v[0] === 'p' && !d.value) { const p = S.parties.find((x) => x.id === v.slice(2)); d.value = E.addDays(g('date').value, p ? num(p.creditDays) : 0); } };
    if (SC && SC.head) {
      const hn = SC.head.trim().toLowerCase(), hit = heads.find((a) => a.name.toLowerCase() === hn) || heads.find((a) => a.name.toLowerCase().includes(hn) || hn.includes(a.name.toLowerCase()));
      if (hit) g('head').value = 'a:' + hit.id; else { g('head').value = '__new__'; const ne = ov.querySelector('#exNew'); ne.hidden = false; ne.value = SC.head.trim(); }
    }
    const cmp = () => { if (SC) { const c = E.calcExpense(g('amount').value, g('gst').value, g('interstate').checked); ov.querySelector('#scanCmp').innerHTML = A.scan.compare(SC, c.total); } };
    form.addEventListener('input', () => { upd(); cmp(); }); form.addEventListener('change', () => { upd(); cmp(); }); cmp();
    g('head').addEventListener('change', () => { ov.querySelector('#exNew').hidden = g('head').value !== '__new__'; });
    g('paidFrom').addEventListener('change', dueSync); dueSync(); upd();
    ov.querySelector('#exSave').addEventListener('click', () => {
      let head = g('head').value;
      const eb = ov.querySelector('#exErr');
      let newAcct = null;
      if (head === '__new__') {
        const nm = g('newHead').value.trim();
        if (!nm) { eb.hidden = false; eb.textContent = 'Enter a name for the new expense head.'; return; }
        const ex = S.accounts.find((a) => a.name.toLowerCase() === nm.toLowerCase());
        if (ex) head = 'a:' + ex.id; else { newAcct = { id: 'x' + E.uid(), name: nm, group: 'Indirect Expenses', opening: 0, openingType: 'Dr' }; head = 'a:' + newAcct.id; }
      }
      const base = Object.assign({}, old || {}, { id: old ? old.id : 'v' + E.uid(), ts: old ? old.ts : Date.now(), type: 'expense', date: g('date').value, no: g('no').value.trim(), head, paidFrom: g('paidFrom').value, amount: g('amount').value, gst: num(g('gst').value), interstate: g('interstate').checked, itc: g('itc').checked, refNo: g('refNo').value.trim(), dueDate: g('paidFrom').value[0] === 'p' ? g('dueDate').value : '', narration: g('narration').value.trim() });
      const v = E.buildExpense(base);
      if (!(num(v.gst) > 0)) v.itc = false;
      const err = E.validateVoucher(S, v);
      if (err.length) { eb.hidden = false; eb.innerHTML = err.map(esc).join('<br>'); return; }
      if (newAcct) { S.accounts.push(newAcct); A.saveMeta(); }
      if (old && old.alloc) v.alloc = old.alloc;
      A.upsertVoucher(v); A.closeModal(); A.toast('Expense ' + v.no + ' saved');
    });
  };

  // ---------- contra form ----------
  A.forms.contra = function (id) {
    const S = A.S, old = id ? S.vouchers.find((x) => x.id === id) : null, cb = A.cashBank();
    const f = old || { date: A.defaultDate(), no: E.nextNo(S, 'contra', A.defaultDate()), from: 'a:cash', to: cb.find((a) => a.group === 'Bank Accounts') ? 'a:' + cb.find((a) => a.group === 'Bank Accounts').id : '', amount: '', refNo: '', narration: '' };
    const o = cb.map((a) => ['a:' + a.id, a.name]);
    const ov = A.openModal({
      title: old ? 'Edit contra entry' : 'New contra entry', size: 'md',
      body: '<form id="ctForm" autocomplete="off"><div class="err" id="ctErr" hidden></div><div class="grid g2">' + field('Date', '<input type="date" name="date" value="' + f.date + '">') + field('Voucher number', '<input name="no" value="' + esc(f.no) + '">') + field('Money goes from', '<select name="from">' + opts(o, f.from) + '</select>') + field('Money goes to', '<select name="to">' + opts(o, f.to) + '</select>') + field('Amount ₹', '<input name="amount" type="number" step="any" min="0" value="' + esc(f.amount) + '">') + field('Reference', '<input name="refNo" value="' + esc(f.refNo || '') + '">') + '</div>' + field('Narration', '<textarea name="narration" rows="2" placeholder="e.g. Cash deposited in bank">' + esc(f.narration || '') + '</textarea>') + '<div class="note">Contra moves money between your own cash and bank accounts. It does not affect profit.</div></form>',
      foot: '<button type="button" class="btn" data-act="mClose">Cancel</button><button type="button" class="btn pri" id="ctSave">Save entry</button>',
    });
    const form = ov.querySelector('#ctForm'), g = (n) => form.elements[n];
    ov.querySelector('#ctSave').addEventListener('click', () => {
      const v = Object.assign({}, old || {}, { id: old ? old.id : 'v' + E.uid(), ts: old ? old.ts : Date.now(), type: 'contra', date: g('date').value, no: g('no').value.trim(), from: g('from').value, to: g('to').value, amount: r2(num(g('amount').value)), refNo: g('refNo').value.trim(), narration: g('narration').value.trim() });
      const err = E.validateVoucher(S, v), eb = ov.querySelector('#ctErr');
      if (err.length) { eb.hidden = false; eb.innerHTML = err.map(esc).join('<br>'); return; }
      A.upsertVoucher(v); A.closeModal(); A.toast('Contra ' + v.no + ' saved');
    });
  };

  A.newVoucher = function (type, preset) {
    if (!A.S.accounts.length) return;
    if (type === 'sale' || type === 'purchase') {
      if (!A.S.parties.some((p) => (type === 'sale' ? p.type !== 'Supplier' : p.type !== 'Customer'))) { A.toast('Add a ' + (type === 'sale' ? 'customer' : 'supplier') + ' first, or use ＋ New inside the form.'); }
      return A.forms.invoice(type, null, preset);
    }
    if (type === 'receipt' || type === 'payment') return A.forms.settle(type, null, preset);
    if (type === 'expense') return A.forms.expense();
    return A.forms.contra();
  };
  A.editVoucher = function (id) {
    const v = A.S.vouchers.find((x) => x.id === id); if (!v) return;
    if (v.type === 'sale' || v.type === 'purchase') A.forms.invoice(v.type, id);
    else if (v.type === 'receipt' || v.type === 'payment') A.forms.settle(v.type, id);
    else if (v.type === 'expense') A.forms.expense(id); else A.forms.contra(id);
  };

  // ---------- voucher view / invoice ----------
  const INV_CSS = 'body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;background:#fff}.inv{max-width:820px;margin:0 auto}.inv h2{margin:0 0 2px;font-size:20px;letter-spacing:.04em}.inv .ihead{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:10px}.inv .ihead .t{text-align:right}.inv .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}.inv .box{border:1px solid #bbb;padding:8px 10px}.inv .box h4{margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#555}.inv table{width:100%;border-collapse:collapse;margin:8px 0}.inv th,.inv td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}.inv th{background:#f0f0f0;font-size:11px}.inv .n{text-align:right;font-variant-numeric:tabular-nums}.inv .tot{margin-left:auto;width:300px}.inv .tot td{border:0;padding:2px 6px}.inv .tot .g td{border-top:2px solid #111;font-weight:700;font-size:15px}.inv .words{margin:6px 0;font-style:italic}.inv .foot{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-top:10px}.inv .sign{text-align:right;padding-top:46px}.inv small{color:#555}';
  function partyBlock(p, c, t, isCompany) {
    const name = isCompany ? (c.legalName || c.name) : p.name;
    const lines = isCompany ? [c.address, [c.city, c.state, c.pin].filter(Boolean).join(', '), c.phone && 'Phone: ' + c.phone, c.email] : [p.address, [p.city, p.state, p.pin].filter(Boolean).join(', '), p.phone && 'Phone: ' + p.phone];
    const gst = isCompany ? t.gstin : p.gstin, pan = isCompany ? t.pan : p.pan;
    return '<b>' + esc(name) + '</b><br>' + lines.filter(Boolean).map(esc).join('<br>') + (gst ? '<br>GSTIN: <b>' + esc(gst) + '</b>' : '<br><small>GSTIN: Unregistered</small>') + (pan ? '<br>PAN: ' + esc(pan) : '');
  }
  function invoiceHTML(v) {
    const S = A.S, c = S.company, t = S.tax, p = S.parties.find((x) => x.id === v.partyId) || { name: '(deleted party)' };
    const sale = v.type === 'sale';
    const title = sale ? 'TAX INVOICE' : 'PURCHASE BILL';
    const inter = !!v.interstate;
    const rates = new Map();
    v.lines.forEach((l) => { const k = num(l.gst), e = rates.get(k) || { rate: k, t: 0, c: 0, s: 0, i: 0 }; e.t += l.amount; e.c += l.cgst; e.s += l.sgst; e.i += l.igst; rates.set(k, e); });
    const items = v.lines.map((l, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(l.desc) + '</td><td>' + esc(l.hsn) + '</td><td class="n">' + num(l.qty) + ' ' + esc(l.unit || '') + '</td><td class="n">' + fmt(l.rate) + '</td><td class="n">' + (num(l.disc) ? num(l.disc) + '%' : '') + '</td><td class="n">' + fmt(l.amount) + '</td><td class="n">' + num(l.gst) + '%</td><td class="n">' + fmt(l.amount + l.cgst + l.sgst + l.igst) + '</td></tr>').join('');
    const taxRows = [...rates.values()].map((e) => '<tr><td>' + e.rate + '%</td><td class="n">' + fmt(e.t) + '</td>' + (inter ? '<td class="n">' + fmt(e.i) + '</td>' : '<td class="n">' + fmt(e.c) + '</td><td class="n">' + fmt(e.s) + '</td>') + '</tr>').join('');
    const bank = sale && (c.bankName || c.bankAcc) ? '<b>Bank details</b><br>' + [c.bankName, c.branch, c.bankAcc && 'A/c ' + c.bankAcc, c.ifsc && 'IFSC ' + c.ifsc, c.upi && 'UPI ' + c.upi].filter(Boolean).map(esc).join('<br>') + '<br><br>' : '';
    const terms = sale && c.terms ? '<b>Terms</b><br><small>' + esc(c.terms).replace(/\n/g, '<br>') + '</small>' : '';
    return '<div class="inv"><div class="ihead"><div><h2>' + esc(c.legalName || c.name) + '</h2><small>' + esc([c.city, c.state].filter(Boolean).join(', ')) + (t.gstin ? ' · GSTIN ' + esc(t.gstin) : '') + '</small></div><div class="t"><h2>' + title + '</h2><small>' + (inter ? 'Inter-state supply (IGST)' : 'Intra-state supply (CGST + SGST)') + '</small></div></div>'
      + '<div class="meta"><div class="box"><h4>' + (sale ? 'Billed by' : 'Supplier') + '</h4>' + partyBlock(p, c, t, sale) + '</div><div class="box"><h4>' + (sale ? 'Billed to' : 'Billed to (us)') + '</h4>' + partyBlock(p, c, t, !sale) + '</div></div>'
      + '<div class="meta"><div class="box">' + (sale ? 'Invoice no: <b>' + esc(v.no) + '</b>' : 'Supplier invoice: <b>' + esc(v.refNo || '—') + '</b><br>Our ref: ' + esc(v.no)) + '<br>Date: <b>' + fdate(v.date) + '</b>' + (v.dueDate ? '<br>Due date: ' + fdate(v.dueDate) : '') + '</div><div class="box">Place of supply: <b>' + esc(sale ? (p.state || '') : (c.state || '')) + '</b>' + (sale && v.refNo ? '<br>Customer PO / ref: ' + esc(v.refNo) : '') + (v.narration ? '<br>' + esc(v.narration) : '') + '</div></div>'
      + '<table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="n">Qty</th><th class="n">Rate' + (v.taxMode === 'incl' ? ' (incl. GST)' : '') + '</th><th class="n">Disc</th><th class="n">Taxable</th><th class="n">GST</th><th class="n">Amount</th></tr></thead><tbody>' + items + '</tbody></table>'
      + '<table class="tot"><tbody><tr><td>Taxable value</td><td class="n">' + fmt(v.taxable) + '</td></tr>' + (inter ? '<tr><td>IGST</td><td class="n">' + fmt(v.igst) + '</td></tr>' : '<tr><td>CGST</td><td class="n">' + fmt(v.cgst) + '</td></tr><tr><td>SGST</td><td class="n">' + fmt(v.sgst) + '</td></tr>') + (v.roundOff ? '<tr><td>Round off</td><td class="n">' + fmt(v.roundOff) + '</td></tr>' : '') + '<tr class="g"><td>Total</td><td class="n">₹ ' + fmt(v.total) + '</td></tr></tbody></table>'
      + '<div class="words">' + esc(E.numToWords(v.total)) + '</div>'
      + '<table><thead><tr><th>GST rate</th><th class="n">Taxable</th>' + (inter ? '<th class="n">IGST</th>' : '<th class="n">CGST</th><th class="n">SGST</th>') + '</tr></thead><tbody>' + taxRows + '</tbody></table>'
      + (sale ? '<div class="foot"><div>' + bank + terms + '</div><div class="sign">For <b>' + esc(c.legalName || c.name) + '</b><br><br><br>' + esc(c.signatory || 'Authorised signatory') + '</div></div>' : '') + '</div>';
  }
  A.forms.view = function (id) {
    const v = A.S.vouchers.find((x) => x.id === id); if (!v) return;
    const ent = E.postingsOf(v);
    const tdr = r2(ent.reduce((s, p) => s + p.dr, 0)), tcr = r2(ent.reduce((s, p) => s + p.cr, 0));
    const entries = '<details class="entries" ' + (v.type === 'sale' || v.type === 'purchase' ? '' : 'open') + '><summary>Accounting entries</summary><table class="tbl compact"><thead><tr><th>Account</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>' + ent.map((p) => '<tr><td>' + esc(E.nameOf(A.idx, p.acct)) + '</td><td class="n">' + (p.dr ? fmt(p.dr) : '') + '</td><td class="n">' + (p.cr ? fmt(p.cr) : '') + '</td></tr>').join('') + '</tbody><tfoot><tr class="grand"><td>Total</td><td class="n">' + fmt(tdr) + '</td><td class="n">' + fmt(tcr) + '</td></tr></tfoot></table></details>';
    let main;
    if (v.type === 'sale' || v.type === 'purchase') main = invoiceHTML(v);
    else {
      const kv = (k, val) => (val ? '<div class="kv"><dt>' + k + '</dt><dd>' + val + '</dd></div>' : '');
      const al = (v.alloc || []).filter((a) => a.amt > 0).map((a) => { const bv = A.S.vouchers.find((x) => x.id === a.ref); return esc(bv ? (bv.refNo && bv.type === 'purchase' ? bv.refNo : bv.no) : (a.ref.startsWith('open:') ? 'Opening balance' : '(deleted bill)')) + ' · ' + fmt(a.amt); }).join('<br>');
      main = '<dl class="kvs wide">' + kv('Voucher', '<b>' + esc(v.no) + '</b> ' + chip(E.TYPE_LABEL[v.type], 't-' + v.type)) + kv('Date', fdate(v.date)) + kv('Particulars', esc(A.voucherParticulars(v))) + kv(v.type === 'receipt' ? 'Deposited in' : v.type === 'payment' ? 'Paid from' : '', v.mode ? esc(E.nameOf(A.idx, v.mode)) : '') + kv('Amount', '<b>₹ ' + fmt(E.voucherAmount(v)) + '</b>') + kv('TDS', num(v.tds) ? fmt(v.tds) : '') + kv('GST', v.tax ? fmt(v.tax) : '') + kv('Reference', esc(v.refNo)) + kv('Matched bills', al) + kv('Narration', esc(v.narration)) + '</dl>';
    }
    const dl = v.type === 'sale' || v.type === 'purchase' ? '<button type="button" class="btn" data-act="dlInv" data-id="' + id + '">Download ' + (v.type === 'sale' ? 'invoice' : 'bill') + ' (HTML)</button>' : '';
    A.openModal({ title: E.TYPE_LABEL[v.type] + ' · ' + v.no, size: v.type === 'sale' || v.type === 'purchase' ? 'xl' : 'md', body: main + entries, foot: '<button type="button" class="btn left" data-act="vEdit2" data-id="' + id + '">Edit</button>' + dl + '<button type="button" class="btn pri" data-act="mClose">Close</button>' });
  };
  A.invoiceFile = function (id) {
    const v = A.S.vouchers.find((x) => x.id === id); if (!v) return;
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc((v.type === 'sale' ? 'Invoice ' : 'Bill ') + v.no) + '</title><style>' + INV_CSS + '@media print{body{padding:0}}</style></head><body>' + invoiceHTML(v) + '</body></html>';
    A.deliver((v.type === 'sale' ? 'Invoice_' : 'Bill_') + v.no.replace(/[^A-Za-z0-9-]+/g, '-') + '.html', html);
  };

  // ---------- backup helpers ----------
  const fresh = () => { const S = E.defaultState(today()); return S; };
  A.startFresh = function () {
    A.S = fresh(); A.ui.fy = E.fyStartYear(today());
    A.store.persistAll(); A.refresh(); location.hash = 'company'; A.toast('Your books are ready. Start with the company profile.');
  };
  async function importFile() {
    const inp = document.getElementById('importFile'); const file = inp && inp.files[0];
    if (!file) { A.toast('Choose a backup file first.', 'bad'); return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { A.toast('That file is not valid JSON.', 'bad'); return; }
    if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.parties) || !Array.isArray(data.vouchers) || !data.company) { A.toast('This does not look like a Sahara books backup.', 'bad'); return; }
    if (!(await A.confirm('Replace all current data with this backup? <br><b>' + data.parties.length + ' parties, ' + data.vouchers.length + ' vouchers.</b>', 'Replace data', true))) return;
    const prevP = A.S.parties.map((p) => p.id), prevV = A.S.vouchers.map((v) => v.id);
    const S = Object.assign(fresh(), data); S.demo = false; delete S.migrate;
    A.S = S; A.ui.fy = E.fyStartYear(today());
    A.store.persistAll(); A.store.purge(prevP, prevV); A.refresh(); A.toast('Backup restored');
  }

  // ---------- global events ----------
  A.H.mClose = () => A.closeModal();
  A.H.copyTa = () => { const t = document.getElementById('copyTa'); t.select(); try { navigator.clipboard.writeText(t.value); A.toast('Copied'); } catch (e) { document.execCommand && document.execCommand('copy'); } };
  A.H.newV = (el) => A.newVoucher(el.dataset.t);
  A.H.newVParty = (el) => { const id = el.dataset.id, t = el.dataset.t; A.newVoucher(t, t === 'sale' || t === 'purchase' ? { partyId: id } : { counter: 'p:' + id }); };
  A.H.vView = (el) => A.forms.view(el.dataset.id);
  A.H.vEdit = (el) => A.editVoucher(el.dataset.id);
  A.H.vEdit2 = (el) => { A.closeModal(); A.editVoucher(el.dataset.id); };
  A.H.vDel = async (el) => {
    const v = A.S.vouchers.find((x) => x.id === el.dataset.id); if (!v) return;
    if (await A.confirm('Delete <b>' + esc(E.TYPE_LABEL[v.type] + ' ' + v.no) + '</b> for ₹ ' + fmt(E.voucherAmount(v)) + '? Receipts or payments matched to it become advances.', 'Delete', true)) { A.deleteVoucher(v.id); A.toast('Deleted ' + v.no); }
  };
  A.H.vSettle = (el) => {
    const v = A.S.vouchers.find((x) => x.id === el.dataset.id); if (!v) return;
    const bo = A.billOut().get(v.id); const isSale = v.type === 'sale';
    A.forms.settle(isSale ? 'receipt' : 'payment', null, { counter: 'p:' + v.partyId, amount: bo ? bo.out : v.total, alloc: [{ ref: v.id, amt: bo ? bo.out : v.total }] });
  };
  A.H.dlInv = (el) => A.invoiceFile(el.dataset.id);
  A.H.newParty = () => A.forms.party(null);
  A.H.editParty = (el) => A.forms.party(el.dataset.id);
  A.H.delParty = async (el) => {
    const p = A.S.parties.find((x) => x.id === el.dataset.id); if (!p) return;
    if (!(await A.confirm('Delete party <b>' + esc(p.name) + '</b>?', 'Delete', true))) return;
    A.S.parties = A.S.parties.filter((x) => x.id !== p.id); A.store.enqueue({ kind: 'party', id: p.id }); A.closeModal(); location.hash = 'parties'; A.refresh(); A.toast('Party deleted');
  };
  A.H.itemLedger = (el) => A.forms.itemLedger(el.dataset.id);
  A.H.newItem = () => A.forms.item(null);
  A.H.editItem = (el) => A.forms.item(el.dataset.id);
  A.H.delItem = async (el) => {
    const it = A.S.items.find((x) => x.id === el.dataset.id); if (!it) return;
    if (!(await A.confirm('Delete stock item <b>' + esc(it.name) + '</b>?', 'Delete', true))) return;
    A.S.items = A.S.items.filter((x) => x.id !== it.id); A.saveMeta(); A.closeModal(); A.refresh(); A.toast('Item deleted');
  };
  A.H.newAcct = () => A.forms.account(null);
  A.H.editAcct = (el) => A.forms.account(el.dataset.id);
  A.H.delAcct = async (el) => {
    const a = A.S.accounts.find((x) => x.id === el.dataset.id); if (!a) return;
    if (!(await A.confirm('Delete ledger <b>' + esc(a.name) + '</b>?', 'Delete', true))) return;
    A.S.accounts = A.S.accounts.filter((x) => x.id !== a.id); A.saveMeta(); A.closeModal(); A.refresh(); A.toast('Ledger deleted');
  };
  A.H.goLedger = (el) => { const id = el.dataset.id; A.ui.led.key = id.includes(':') ? id : 'p:' + id; A.ui.led.fy = null; A.go('ledger'); };
  A.H.partyT = (el) => { A.ui.partyT = el.dataset.t; A.render(); };
  A.H.dayType = (el) => { A.ui.dayType = el.dataset.t; A.render(); };
  A.H.taxTab = (el) => { A.ui.tax = el.dataset.t; A.render(); };
  A.H.csv = (el) => { const k = el.dataset.k; A.deliver('Sahara_' + k + '_FY' + E.fyLabel(A.ui.fy) + '.csv', E.toCSV(A.csvFor(k))); };
  A.H.exportJSON = () => { const S = Object.assign({}, A.S); delete S.demo; A.deliver('sahara-books-backup-' + today() + '.json', JSON.stringify(S, null, 1)); };
  A.H.importJSON = importFile;
  A.H.startFresh = async () => { if (await A.confirm('Remove the sample data and start with your own empty books?', 'Start my books')) A.startFresh(); };
  A.H.loadSample = async () => {
    if (A.S.vouchers.length || A.S.parties.length) { A.toast('Sample data can only load into empty books.', 'bad'); return; }
    A.S = E.sampleData(today()); A.S.demo = true; A.ui.fy = E.fyStartYear(today()); A.refresh(); A.toast('Sample data loaded. Nothing is saved until you start your own books.');
  };
  A.H.clearAll = async () => {
    if (!(await A.confirm('Erase <b>all</b> parties, vouchers and settings? This cannot be undone.', 'Erase everything', true))) return;
    const pp = A.S.parties.map((p) => p.id), vv = A.S.vouchers.map((v) => v.id);
    A.S = fresh(); A.store.persistAll(); A.store.purge(pp, vv); A.ui.fy = E.fyStartYear(today()); A.refresh(); A.toast('All data erased');
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const h = A.H[el.dataset.act]; if (h) { e.preventDefault(); h(el, e); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && A.modals.length && !document.querySelector('.ov.ovtop')) A.closeModal(); });

  // filters (inputs outside modals)
  const refreshList = (t) => { if (t === 'item') { const ia = document.getElementById('itemArea'); if (ia) ia.innerHTML = A.itemArea(); return; } const a = document.getElementById('listArea'); if (!a) return; a.innerHTML = t === 'day' ? A.dayList() : t === 'party' ? A.partyList() : t === 'ledger' ? A.ledgerHTML() : A.listArea(t); };
  const onFilter = (e) => {
    const el = e.target.closest('[data-f]'); if (!el || el.closest('.ov')) return;
    const k = el.dataset.f, t = el.dataset.t, v = el.value;
    if (k === 'itemQ') { A.ui.itemQ = v; refreshList('item'); }
    else if (k === 'partyQ') { A.ui.partyQ = v; refreshList('party'); }
    else if (k === 'ledKey') { A.ui.led.key = v; refreshList('ledger'); }
    else if (k === 'ledFrom') { A.ui.led.from = v; refreshList('ledger'); }
    else if (k === 'ledTo') { A.ui.led.to = v; refreshList('ledger'); }
    else if (k === 'closingStock') { if (e.type !== 'change') return; if (v === '') delete A.S.stock.closing[A.ui.fy]; else A.S.stock.closing[A.ui.fy] = r2(num(v)); A.saveMeta(); A.refresh(); }
    else if (t) { (A.ui.flt[t] || (A.ui.flt[t] = {}))[k] = v; refreshList(t); }
  };
  document.addEventListener('input', (e) => { if (e.target.matches('input[type=search], input[type=text]')) onFilter(e); });
  document.addEventListener('change', (e) => { if (e.target.matches('[data-f]')) onFilter(e); });

  // company + tax forms
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'coForm') {
      e.preventDefault();
      const d = read(f), c = A.S.company;
      if (!d.name.trim()) { A.toast('Enter the business name.', 'bad'); return; }
      ['name', 'legalName', 'constitution', 'phone', 'email', 'website', 'address', 'city', 'pin', 'bankName', 'branch', 'bankAcc', 'ifsc', 'upi', 'invPrefix', 'signatory', 'terms'].forEach((k) => { c[k] = (d[k] || '').trim(); });
      c.ifsc = c.ifsc.toUpperCase(); c.stateCode = d.stateCode; c.state = E.stateName(d.stateCode);
      if (d.booksFrom && d.booksFrom !== A.S.booksFrom) { A.S.booksFrom = d.booksFrom; A.ui.fy = Math.max(E.fyStartYear(d.booksFrom), A.ui.fy); }
      A.S.stock.opening = r2(num(d.openingStock));
      A.saveMeta(); A.refresh(); A.toast('Company profile saved');
    } else if (f.id === 'taxForm') {
      e.preventDefault();
      const d = read(f), t = A.S.tax; d.gstin = d.gstin.trim().toUpperCase(); d.pan = d.pan.trim().toUpperCase(); d.tan = d.tan.trim().toUpperCase();
      if (d.gstin && !E.GSTIN_RE.test(d.gstin)) { A.toast('GSTIN format is not valid.', 'bad'); return; }
      if (d.pan && !E.PAN_RE.test(d.pan)) { A.toast('PAN format is not valid.', 'bad'); return; }
      if (d.gstin && !d.pan) d.pan = d.gstin.slice(2, 12);
      if (d.gstin && !A.S.company.stateCode) { A.S.company.stateCode = d.gstin.slice(0, 2); A.S.company.state = E.stateName(d.gstin.slice(0, 2)); }
      Object.assign(t, { gstin: d.gstin, pan: d.pan, tan: d.tan, regType: d.regType, filing: d.filing, regDate: d.regDate, defaultGst: num(d.defaultGst) });
      A.saveMeta(); A.refresh();
      const warn = d.gstin && d.gstin.slice(0, 2) !== A.S.company.stateCode;
      A.toast(warn ? 'Saved. Note: GSTIN state code differs from the company state.' : 'Tax details saved', warn ? 'bad' : '');
    }
  });

  document.getElementById('fySel').addEventListener('change', (e) => { A.ui.fy = +e.target.value; A.refresh(); });
  document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('side').classList.toggle('open'));
  document.getElementById('newMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('newMenu').classList.toggle('open'); });
  document.addEventListener('click', (e) => { const m = document.getElementById('newMenu'); if (m && !e.target.closest('#newMenu') && !e.target.closest('#newMenuBtn')) m.classList.remove('open'); if (e.target.closest('#newMenu [data-act]')) m.classList.remove('open'); });

  // ---------- boot ----------
  (async function boot() {
    A.buildNav(); A.setStatus();
    document.getElementById('view').innerHTML = '<div class="empty">Opening your books…</div>';
    let S = null;
    try { S = await A.store.load(); } catch (e) { console.warn(e); }
    if (S) {
      const base = E.defaultState(today());
      S = Object.assign(base, S);
      if (!S.accounts || !S.accounts.length) S.accounts = E.defaultAccounts();
      if (!S.stock) S.stock = { opening: 0, closing: {} };
      if (!Array.isArray(S.items)) S.items = [];
      A.S = S;
      if (!S.items.length && S.vouchers.some((v) => v.type === 'sale' || v.type === 'purchase')) { if (E.syncAll(S)) A.saveMeta(); }
      if (S.migrate) { delete S.migrate; A.store.persistAll(); }
    } else { A.S = E.sampleData(today()); A.S.demo = true; }
    A.ui.fy = E.fyStartYear(today());
    if (A.fyList().indexOf(A.ui.fy) < 0) A.ui.fy = A.fyList()[A.fyList().length - 1];
    A.refresh();
    window.__booted = true;
  })();
})();
