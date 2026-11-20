/* Scan a bill photo with Claude and pre-fill a purchase bill or an expense. */
(function () {
  'use strict';
  const E = window.Engine, A = window.A, { r2, num } = E;
  const { esc } = A.u;
  const RATES = [0, 5, 12, 18, 28];
  const UNITS = ['Nos', 'Pcs', 'Kg', 'MT', 'Ltr', 'Mtr', 'Box', 'Set', 'Pair', 'Hrs', 'Job'];
  const scan = A.scan = {};

  scan.available = async function () {
    const s = await A.use('sample');
    if (!s) return null;
    try { const l = await s.limits(); if (!l || !l.images) return null; } catch (e) { return null; }
    return s;
  };

  // Shrink the photo so it uploads quickly and reads reliably.
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this image.'))), 'image/jpeg', 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open this file as an image. Use a JPG or PNG photo.')); };
      img.src = url;
    });
  }

  function prompt() {
    const heads = A.S.accounts.filter((a) => a.group === 'Direct Expenses' || a.group === 'Indirect Expenses').filter((a) => a.id !== 'round').map((a) => a.name);
    return 'You read Indian business bills and invoices for an accounting app. Look at the attached bill photo and return ONLY JSON, no prose:\n'
      + '{"kind":"purchase"|"expense","vendorName":string,"vendorGstin":string|null,"billNo":string|null,"date":"YYYY-MM-DD"|null,'
      + '"lines":[{"desc":string,"hsn":string|null,"qty":number,"unit":string,"rate":number,"discPct":number,"gstPct":number}],'
      + '"expenseHead":string|null,"narration":string|null,"grandTotal":number|null,"confidence":"high"|"medium"|"low"}\n'
      + 'Rules:\n'
      + '- kind "purchase" = goods or services bought for resale or stock, usually several items. kind "expense" = running costs such as electricity, fuel, rent, repairs, courier, phone, stationery, food, travel.\n'
      + '- rate is the price per unit BEFORE GST. If the bill only shows GST-inclusive prices, divide by (1 + gstPct/100). qty must be a number (use 1 if the bill is a single charge). unit is one of: ' + UNITS.join(', ') + '.\n'
      + '- gstPct is the total GST rate for the line (e.g. 18 when CGST 9 + SGST 9, or IGST 18). Allowed values: ' + RATES.join(', ') + '. Use 0 if no GST is charged.\n'
      + '- discPct is the line discount percent, 0 if none. For an expense, return one line with the amount before GST as qty 1 and rate.\n'
      + '- vendorGstin is the SELLER\'s GSTIN (15 characters), not the buyer\'s. Copy it exactly; null if unreadable or absent.\n'
      + '- billNo is the vendor\'s invoice or bill number as printed. date is the bill date, ISO format.\n'
      + '- For an expense, expenseHead must be the closest match from this list, or a short new head name if none fits: ' + JSON.stringify(heads) + '.\n'
      + '- grandTotal is the final payable amount printed on the bill, after tax and round-off.\n'
      + '- Never invent values. Use null for anything you cannot read, and set confidence "low" if the photo is blurry or partial. If the image is not a bill, return {"kind":null}.';
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|m\/s|ms|and|&|co|company|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

  function findOrAddSupplier(d) {
    const S = A.S, gst = String(d.vendorGstin || '').toUpperCase().replace(/\s/g, ''), validG = E.GSTIN_RE.test(gst);
    let p = validG ? S.parties.find((x) => (x.gstin || '').toUpperCase() === gst) : null;
    if (!p && d.vendorName) { const n = norm(d.vendorName); if (n) p = S.parties.find((x) => { const m = norm(x.name); return m && (m === n || (n.length > 4 && (m.includes(n) || n.includes(m)))); }); }
    if (p) return { party: p, added: false };
    if (!d.vendorName) return { party: null, added: false };
    const code = validG ? gst.slice(0, 2) : '';
    p = { id: 'p' + E.uid(), name: String(d.vendorName).trim(), type: 'Supplier', gstin: validG ? gst : '', pan: validG ? gst.slice(2, 12) : '', stateCode: code, state: code ? E.stateName(code) : '', contactPerson: '', phone: '', email: '', address: '', city: '', pin: '', creditDays: 0, creditLimit: 0, opening: 0, openingType: 'Cr', bankName: '', bankAcc: '', ifsc: '', notes: 'Added from a scanned bill' };
    // keep the name unique
    let nm = p.name, i = 2; while (S.parties.some((x) => x.name.toLowerCase() === nm.toLowerCase())) nm = p.name + ' (' + i++ + ')'; p.name = nm;
    S.parties.push(p); A.store.enqueue({ kind: 'party', id: p.id });
    return { party: p, added: true };
  }

  function cleanLines(d) {
    const ls = (Array.isArray(d.lines) ? d.lines : []).map((l) => {
      const gst = RATES.includes(num(l.gstPct)) ? num(l.gstPct) : RATES.reduce((a, b) => (Math.abs(b - num(l.gstPct)) < Math.abs(a - num(l.gstPct)) ? b : a), 0);
      return { desc: String(l.desc || '').trim(), hsn: String(l.hsn || '').replace(/\D/g, '').slice(0, 8), qty: num(l.qty) || 1, unit: UNITS.includes(l.unit) ? l.unit : 'Nos', rate: r2(num(l.rate)), disc: Math.min(100, Math.max(0, num(l.discPct))), gst };
    }).filter((l) => l.desc || l.rate);
    return ls;
  }
  const okDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');

  function apply(d) {
    if (!d || !d.kind) { A.closeModal(); A.toast('This does not look like a bill. Try a clearer, straight-on photo.'); return; }
    const lines = cleanLines(d);
    if (!lines.length) { A.closeModal(); A.toast('Could not read any items or amount from this bill.'); return; }
    const info = { date: okDate(d.date), refNo: d.billNo ? String(d.billNo).trim() : '', total: d.grandTotal == null ? null : num(d.grandTotal), confidence: d.confidence || 'medium', vendor: d.vendorName || '' };
    if (d.kind === 'expense') {
      const first = lines[0], amount = r2(lines.reduce((s, l) => s + num(l.qty) * num(l.rate) * (1 - num(l.disc) / 100), 0));
      const gstSet = [...new Set(lines.map((l) => l.gst))];
      A.closeModal();
      return A.forms.expense(null, { scan: Object.assign(info, { head: d.expenseHead || '', amount, gst: gstSet.length === 1 ? gstSet[0] : first.gst, mixedGst: gstSet.length > 1, narration: [d.vendorName, d.narration].filter(Boolean).join(' · ') }) });
    }
    const r = findOrAddSupplier(d);
    A.closeModal();
    A.forms.invoice('purchase', null, { partyId: r.party ? r.party.id : '', scan: Object.assign(info, { lines, addedSupplier: r.added }) });
    if (r.added) A.refresh();
  }

  scan.start = async function () {
    if (A.S.demo) { A.toast('Start your own books first. Scanned bills are not saved in sample mode.'); return; }
    const s = await scan.available();
    if (!s) { A.toast('Bill scanning is not available in this view.'); return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; inp.remove(); if (!file) return;
      if (!/^image\//.test(file.type)) { A.toast('Please choose a photo (JPG or PNG). PDFs are not supported yet.'); return; }
      const ov = A.openModal({ title: 'Reading your bill…', size: 'md', body: '<p class="muted" id="scanMsg">Claude is reading the bill. This takes a few seconds.</p>', foot: '<button type="button" class="btn" data-act="mClose">Cancel</button>' });
      let cancelled = false; new MutationObserver((_, o) => { if (!document.body.contains(ov)) { cancelled = true; o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
      try {
        const blob = await shrink(file);
        const d = await s.json(prompt(), { images: [blob], modelTier: 'default', cache: false });
        if (cancelled) return;
        apply(d);
      } catch (e) {
        if (cancelled) return;
        const m = e && e.code === 'rate_limited' ? 'Too many scans just now. Wait a minute and try again.' : e && e.code === 'not_granted' ? 'Bill scanning was not allowed.' : (e && e.message) || 'Could not read this bill.';
        const msg = document.getElementById('scanMsg'); if (msg) { msg.className = 'err'; msg.textContent = m + ' You can still enter it by hand.'; } else A.toast(m);
      }
    });
    inp.click();
  };

  // Notice shown inside the form after a scan.
  scan.notice = function (scanInfo, extra) {
    const conf = scanInfo.confidence === 'low' ? ' The photo was hard to read, so check every field.' : '';
    return '<div class="note scan" id="scanNote"><b>Read from your bill.</b> Please check the details before saving.' + conf + (extra || '') + '<div id="scanCmp"></div></div>';
  };
  scan.compare = function (scanInfo, computed) {
    if (scanInfo.total == null) return '';
    const diff = r2(computed - scanInfo.total);
    return Math.abs(diff) <= 1 ? '<span class="ok">Total matches the bill (₹ ' + A.u.fmt(scanInfo.total) + ').</span>' : '<span class="bad">Bill total is ₹ ' + A.u.fmt(scanInfo.total) + ' but this entry adds up to ₹ ' + A.u.fmt(computed) + '. Check quantities, rates and GST.</span>';
  };

  A.H.scanBill = () => scan.start();
  // Hide the buttons where scanning cannot run.
  scan.available().then((s) => { if (!s) document.querySelectorAll('[data-act="scanBill"]').forEach((b) => { b.hidden = true; }); A.scan.ok = !!s; });
})();
