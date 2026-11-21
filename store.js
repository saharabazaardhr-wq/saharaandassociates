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
      let base = null;
      this.kind = 'claude';
      try {
        if (db && uid) base = db.doc('data/users/' + uid + '/books');
        else if (A.cloud && A.cloud.enabled()) { this.kind = 'server'; base = await A.cloud.connect(); }
      } catch (e) {
        console.warn('Server connect failed', e);
        this.mode = 'local'; this.base = null; this.loadError = true; this.fellBack = true;
        return this.readLocal();
      }
      if (base) {
        try {
          const snap = await base.get();
          this.base = base; this.mode = 'cloud';
          if (this.kind === 'server') this.showLogout();
          let S = null;
          if (snap.exists) {
            const m = clone(snap.data());
            S = E.defaultState(A.u.today());
            Object.assign(S, { booksFrom: m.booksFrom || S.booksFrom, company: m.company || S.company, tax: m.tax || S.tax, accounts: m.accounts || S.accounts, stock: m.stock || S.stock, items: m.items || [] });
            const years = m.shards || [];
            const [ps, ...vs] = await Promise.all([base.collection('parties').get(), ...years.map((y) => base.collection('vch_' + y).get())]);
            S.parties = ps.docs.map((d) => clone(d.data()));
            vs.forEach((q, i) => q.docs.forEach((d) => { const v = clone(d.data()); S.vouchers.push(v); this.shardOf.set(v.id, years[i]); }));
          }
          const local = this.readLocal();
          if (this.kind === 'server' && this.dirty() && local) {
            // changes were made while the server could not be reached
            if (!S || window.confirm('Offline rehte hue kiye gaye changes mile hain. Unhe server par upload karein?\n\nOK = upload karein\nCancel = server ka data lein (offline changes hat jayenge)')) {
              this.reconcile = S ? { p: S.parties.map((x) => x.id), v: S.vouchers.map((x) => x.id) } : null;
              this.clearDirty(); local.migrate = true; return local;
            }
            this.clearDirty();
          }
          if (S) { if (this.kind === 'server') this.writeLocal(S); return S; }
          if (local) { local.migrate = true; return local; }
          return null;
        } catch (e) {
          console.warn('Cloud load failed', e);
          this.mode = 'local'; this.base = null; this.loadError = true; this.fellBack = this.kind === 'server';
          return this.readLocal();
        }
      }
      this.mode = 'local';
      return this.readLocal();
    },

    DIRTY: 'sahara-offline-dirty',
    dirty() { try { return localStorage.getItem(this.DIRTY) === '1'; } catch (e) { return false; } },
    markDirty() { try { localStorage.setItem(this.DIRTY, '1'); } catch (e) { /* ignore */ } },
    clearDirty() { try { localStorage.removeItem(this.DIRTY); } catch (e) { /* ignore */ } },

    showLogout() {
      const b = document.getElementById('logoutBtn'); if (!b) return;
      b.hidden = false; b.title = A.cloud.email();
      b.onclick = () => {
        if (!window.confirm('Logout karein?')) return;
        A.cloud.signOut();
        if (!this.dirty()) { try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ } }
        location.reload();
      };
    },

    readLocal() {
      try { const t = localStorage.getItem(LS_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
    },
    writeLocal(S) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(S)); if (this.fellBack && this.mode === 'local') this.markDirty(); return true; } catch (e) { return false; }
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
      const mirror = () => { if (this.kind === 'server') this.writeLocal(S); };
      if (op.kind === 'all') {
        await attempt(() => base.set(clone(metaOf(S))));
        await attempt(() => base.bulkSet('parties', S.parties.map((p) => ({ id: p.id, data: clone(p) }))));
        const by = {}, moved = {};
        S.vouchers.forEach((v) => {
          const fy = E.fyStartYear(v.date); (by[fy] = by[fy] || []).push({ id: v.id, data: clone(v) });
          const old = this.shardOf.get(v.id); if (old != null && old !== fy) (moved[old] = moved[old] || []).push(v.id);
        });
        for (const fy of Object.keys(by)) await attempt(() => base.bulkSet('vch_' + fy, by[fy]));
        for (const o of Object.keys(moved)) await attempt(() => base.bulkDelete('vch_' + o, moved[o]));
        S.vouchers.forEach((v) => this.shardOf.set(v.id, E.fyStartYear(v.date)));
        return mirror();
      }
      if (op.kind === 'purge') {
        if (op.parties.length) await attempt(() => base.bulkDelete('parties', op.parties));
        const by = {}; op.vouchers.forEach((id) => { const o = this.shardOf.get(id); if (o != null) (by[o] = by[o] || []).push(id); });
        for (const o of Object.keys(by)) await attempt(() => base.bulkDelete('vch_' + o, by[o]));
        op.vouchers.forEach((id) => this.shardOf.delete(id));
        return mirror();
      }
      if (op.kind === 'meta') { await attempt(() => base.set(clone(metaOf(S)))); return mirror(); }
      if (op.kind === 'party') {
        const p = S.parties.find((x) => x.id === op.id); const ref = base.collection('parties').doc(op.id);
        await attempt(() => (p ? ref.set(clone(p)) : ref.delete())); return mirror();
      }
      if (op.kind === 'voucher') {
        const v = S.vouchers.find((x) => x.id === op.id); const old = this.shardOf.get(op.id);
        if (!v) { if (old != null) { await attempt(() => base.collection('vch_' + old).doc(op.id).delete()); this.shardOf.delete(op.id); } return mirror(); }
        const fy = E.fyStartYear(v.date);
        await attempt(() => base.collection('vch_' + fy).doc(op.id).set(clone(v)));
        if (old != null && old !== fy) await attempt(() => base.collection('vch_' + old).doc(op.id).delete());
        const isNew = !this.shardOf.size || ![...this.shardOf.values()].includes(fy);
        this.shardOf.set(op.id, fy);
        if (isNew) await attempt(() => base.set(clone(metaOf(S))));
        return mirror();
      }
    },

    /** Write everything (after import, migration or starting fresh). */
    persistAll() {
      const S = A.S;
      if (this.mode === 'cloud' && this.base && this.base.bulkSet) { this.enqueue({ kind: 'all' }); return; }
      this.enqueue({ kind: 'meta' });
      S.parties.forEach((p) => this.enqueue({ kind: 'party', id: p.id }));
      S.vouchers.forEach((v) => this.enqueue({ kind: 'voucher', id: v.id }));
    },

    /** Remove stored documents that are no longer in state (used by import / clear). */
    async purge(prevParties, prevVouchers) {
      if (this.mode !== 'cloud') return;
      const S = A.S;
      const keepP = new Set(S.parties.map((p) => p.id)), keepV = new Set(S.vouchers.map((v) => v.id));
      const gone = { parties: [...prevParties].filter((id) => !keepP.has(id)), vouchers: [...prevVouchers].filter((id) => !keepV.has(id)) };
      if (this.base && this.base.bulkDelete) { if (gone.parties.length || gone.vouchers.length) this.enqueue(Object.assign({ kind: 'purge' }, gone)); return; }
      gone.parties.forEach((id) => this.enqueue({ kind: 'party', id }));
      gone.vouchers.forEach((id) => this.enqueue({ kind: 'voucher', id }));
    },
  };

  A.setStatus = function () {
    const el = document.getElementById('saveStat'); if (!el) return;
    const S = A.S; let cls = 'ok', txt = '';
    if (!S) { txt = 'Loading…'; cls = 'idle'; }
    else if (S.demo) { txt = 'Sample data · not saved'; cls = 'warn'; }
    else if (store.pending > 0) { txt = 'Saving…'; cls = 'idle'; }
    else if (store.failed > 0) { txt = 'Some changes not saved'; cls = 'bad'; }
    else if (store.mode === 'cloud') txt = store.kind === 'server' ? 'Saved on server' : 'Saved to your Claude account';
    else if (store.mode === 'local') { txt = 'Saved in this browser only'; cls = 'warn'; }
    else { txt = 'Not saved'; cls = 'warn'; }
    el.className = 'stat ' + cls; el.textContent = txt;
  };
})();
