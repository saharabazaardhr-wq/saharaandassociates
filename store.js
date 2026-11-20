/* Persistence: Claude account database when available, browser storage otherwise. */
(function () {
  'use strict';
  const E = window.Engine;
  const A = window.A = window.A || {};
  const LS_KEY = 'sahara-books-v1';

  const cap = {};
  A.use = function (name) {
    if (cap[name]) return cap[name];
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return (cap[name] = Promise.resolve(null));
    const t = new Promise((res) => setTimeout(() => res(null), 6000));
    cap[name] = Promise.race([Promise.resolve(c.use(name)).catch(() => null), t]);
    return cap[name];
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const metaOf = (S) => ({ v: 1, booksFrom: S.booksFrom, company: S.company, tax: S.tax, accounts: S.accounts, stock: S.stock, items: S.items || [], shards: shardsOf(S) });
  const shardsOf = (S) => [...new Set(S.vouchers.map((v) => E.fyStartYear(v.date)))].sort();

  const store = A.store = {
    mode: 'memory', // 'cloud' | 'local' | 'memory'
    base: null, shardOf: new Map(), q: Promise.resolve(), pending: 0, failed: 0,

    async load() {
      const [db, user] = await Promise.all([A.use('db'), A.use('user')]);
      let uid = null;
      if (db && user) { try { uid = await user.id(); } catch (e) { uid = null; } }
      if (db && uid) {
        try {
          const base = db.doc('data/users/' + uid + '/books');
          const snap = await base.get();
          this.base = base; this.mode = 'cloud';
          if (snap.exists) {
            const m = clone(snap.data());
            const S = E.defaultState(A.u.today());
            Object.assign(S, { booksFrom: m.booksFrom || S.booksFrom, company: m.company || S.company, tax: m.tax || S.tax, accounts: m.accounts || S.accounts, stock: m.stock || S.stock, items: m.items || [] });
            const years = m.shards || [];
            const [ps, ...vs] = await Promise.all([base.collection('parties').get(), ...years.map((y) => base.collection('vch_' + y).get())]);
            S.parties = ps.docs.map((d) => clone(d.data()));
            vs.forEach((q, i) => q.docs.forEach((d) => { const v = clone(d.data()); S.vouchers.push(v); this.shardOf.set(v.id, years[i]); }));
            return S;
          }
          const local = this.readLocal();
          if (local) { local.migrate = true; return local; }
          return null;
        } catch (e) {
          console.warn('Cloud load failed', e);
          this.mode = 'local'; this.base = null; this.loadError = true;
          return this.readLocal();
        }
      }
      this.mode = 'local';
      return this.readLocal();
    },

    readLocal() {
      try { const t = localStorage.getItem(LS_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
    },
    writeLocal(S) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(S)); return true; } catch (e) { return false; }
    },

    enqueue(op) {
      const S = A.S;
      if (!S || S.demo) return;
      this.pending++; A.setStatus();
      this.q = this.q.then(() => this.run(op)).catch((e) => { this.failed++; console.warn('Save failed', e); A.toast('Could not save: ' + (e && e.message || 'unknown error'), 'bad'); }).then(() => { this.pending--; A.setStatus(); });
    },

    async run(op) {
      const S = A.S;
      if (this.mode === 'local' || this.mode === 'memory') { if (this.mode === 'local') this.writeLocal(S); return; }
      const base = this.base;
      const attempt = async (fn) => { try { await fn(); } catch (e) { if (e && e.code === 'unavailable') { await new Promise((r) => setTimeout(r, 600 + Math.random() * 600)); await fn(); } else throw e; } };
      if (op.kind === 'meta') return attempt(() => base.set(clone(metaOf(S))));
      if (op.kind === 'party') {
        const p = S.parties.find((x) => x.id === op.id); const ref = base.collection('parties').doc(op.id);
        return attempt(() => (p ? ref.set(clone(p)) : ref.delete()));
      }
      if (op.kind === 'voucher') {
        const v = S.vouchers.find((x) => x.id === op.id); const old = this.shardOf.get(op.id);
        if (!v) { if (old != null) { await attempt(() => base.collection('vch_' + old).doc(op.id).delete()); this.shardOf.delete(op.id); } return; }
        const fy = E.fyStartYear(v.date);
        await attempt(() => base.collection('vch_' + fy).doc(op.id).set(clone(v)));
        if (old != null && old !== fy) await attempt(() => base.collection('vch_' + old).doc(op.id).delete());
        const isNew = !this.shardOf.size || ![...this.shardOf.values()].includes(fy);
        this.shardOf.set(op.id, fy);
        if (isNew) await attempt(() => base.set(clone(metaOf(S))));
      }
    },

    /** Write everything (after import, migration or starting fresh). */
    persistAll() {
      const S = A.S;
      this.enqueue({ kind: 'meta' });
      S.parties.forEach((p) => this.enqueue({ kind: 'party', id: p.id }));
      S.vouchers.forEach((v) => this.enqueue({ kind: 'voucher', id: v.id }));
    },

    /** Remove stored documents that are no longer in state (used by import / clear). */
    async purge(prevParties, prevVouchers) {
      if (this.mode !== 'cloud') return;
      const S = A.S;
      prevParties.forEach((id) => { if (!S.parties.some((p) => p.id === id)) this.enqueue({ kind: 'party', id }); });
      prevVouchers.forEach((id) => { if (!S.vouchers.some((v) => v.id === id)) this.enqueue({ kind: 'voucher', id }); });
    },
  };

  A.setStatus = function () {
    const el = document.getElementById('saveStat'); if (!el) return;
    const S = A.S; let cls = 'ok', txt = '';
    if (!S) { txt = 'Loading…'; cls = 'idle'; }
    else if (S.demo) { txt = 'Sample data · not saved'; cls = 'warn'; }
    else if (store.pending > 0) { txt = 'Saving…'; cls = 'idle'; }
    else if (store.failed > 0) { txt = 'Some changes not saved'; cls = 'bad'; }
    else if (store.mode === 'cloud') txt = 'Saved to your Claude account';
    else if (store.mode === 'local') { txt = 'Saved in this browser only'; cls = 'warn'; }
    else { txt = 'Not saved'; cls = 'warn'; }
    el.className = 'stat ' + cls; el.textContent = txt;
  };
})();
