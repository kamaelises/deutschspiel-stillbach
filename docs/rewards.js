// rewards.js - window.Rewards: one ledger against endless farming (Антифарм 25.11, tasks\ANTIFARM.md). localStorage 'ds_proto.rewards'.
// Rules: first pass = full reward; a repeat = practice (0 or 1 -> 0.5 -> 0.25 -> 0); world = natural timers + daily caps
// (economy.json caps_day = coins/XP per day, caps_count = rewarded actions per day); a chest pays once per id; never a penalty.
// Day = device date (as Eco). API: day(), once(key) -> true only the first time, has(key), decay(key) -> 1|.5|.25|0 (counts the run),
//   coins(n, why, kind) -> given (Eco.earn, cap caps_day[kind]), xp(n, kind='xp') -> given (cap caps_day[kind]),
//   take(kind) -> true while caps_count[kind] is left, left(kind), chest(id) -> 'ok' | 'again' | 'full', unchest(id) (undo of 'ok'),
//   best(id, score) -> true if a new record, full(kind) -> the plaque «на сегодня награды собраны» once a day, msg(), state(), _reset().
(function () {
  const K = 'ds_proto.rewards';
  const DEF = { caps_day: { fight: 15, fish: 10, help: 6, xp: 150, minigame: 10, markt: 4 }, caps_count: { chest: 6 }, repeat: [1, 0.5, 0.25, 0] };
  const MSG = { de: 'Für heute genug Belohnungen — üben kannst du immer.', ru: 'На сегодня награды собраны — играть можно для практики.' };
  const day = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function cfg() {
    const C = window.Eco && Eco.cfg ? Eco.cfg() : null;
    return { caps_day: Object.assign({}, DEF.caps_day, C && C.caps_day), caps_count: Object.assign({}, DEF.caps_count, C && C.caps_count), repeat: (C && Array.isArray(C.repeat) && C.repeat.length) ? C.repeat : DEF.repeat };
  }
  function load() {
    let v = null; try { v = JSON.parse(localStorage.getItem(K)); } catch (e) {}
    v = v && typeof v === 'object' ? v : {}; v.once = v.once || {}; v.runs = v.runs || {}; v.best = v.best || {};
    if (v.day !== day()) { v.day = day(); v.got = {}; v.cnt = {}; v.shown = {}; }
    v.got = v.got || {}; v.cnt = v.cnt || {}; v.shown = v.shown || {}; return v;
  }
  function save(v) {
    const ks = Object.keys(v.once); if (ks.length > 3000) ks.sort((a, b) => v.once[a] - v.once[b]).slice(0, ks.length - 2500).forEach(k => delete v.once[k]);   // random dungeon seeds: keep the ledger small
    try { localStorage.setItem(K, JSON.stringify(v)); } catch (e) {}
  }
  const has = key => !!load().once[key];
  function once(key) { const v = load(); if (v.once[key]) return false; v.once[key] = Date.now(); save(v); return true; }
  function decay(key) { const v = load(), n = v.runs[key] || 0, R = cfg().repeat; v.runs[key] = n + 1; save(v); return R[Math.min(n, R.length - 1)]; }
  function capDay(kind) { return kind ? +cfg().caps_day[kind] || 0 : 0; }
  function coins(n, why, kind) {
    n = Math.max(0, Math.round(+n || 0)); if (!n) return 0;
    const E = window.Eco, ecoCap = E && E.cfg && E.cfg().caps_day ? +E.cfg().caps_day[kind] || 0 : 0;
    let g;
    if (E && E.earn && ecoCap) g = E.earn(n, why, kind);              // Eco counts the day itself (caps_day of economy.json)
    else {                                                            // economy.json not loaded yet / no Eco: own count with the same caps
      const v = load(), cap = capDay(kind); g = cap ? Math.min(n, Math.max(0, cap - (v.got[kind] || 0))) : n;
      if (cap) { v.got[kind] = (v.got[kind] || 0) + g; save(v); }
      if (g) { if (E && E.earn) E.earn(g, why); else if (typeof setCoins === 'function' && typeof state !== 'undefined' && state) setCoins((+state.coins || 0) + g); }
    }
    if (g < n) full(kind); return g;
  }
  function xp(n, kind) {
    kind = kind || 'xp'; n = Math.max(0, Math.round(+n || 0)); if (!n) return 0;
    const v = load(), cap = capDay(kind), g = cap ? Math.min(n, Math.max(0, cap - (v.got[kind] || 0))) : n;
    v.got[kind] = (v.got[kind] || 0) + g; save(v); if (g < n) full(kind); return g;
  }
  function left(kind) {
    const v = load(), c = cfg(), cc = +c.caps_count[kind] || 0, cd = +c.caps_day[kind] || 0;
    if (cc) return Math.max(0, cc - (v.cnt[kind] || 0));
    if (cd) { if (window.Eco && Eco.capLeft && kind !== 'xp') { const l = Eco.capLeft(kind); if (l !== Infinity) return l; } return Math.max(0, cd - (v.got[kind] || 0)); }
    return Infinity;
  }
  function take(kind) { const v = load(), cap = +cfg().caps_count[kind] || 0; if (cap && (v.cnt[kind] || 0) >= cap) { full(kind); return false; } v.cnt[kind] = (v.cnt[kind] || 0) + 1; save(v); return true; }
  function chest(id) {                                                // a chest pays once per id (seed:floor:i) and at most caps_count.chest a day
    const v = load(), key = 'chest:' + (id || ''); if (id && v.once[key]) return 'again';
    const cap = +cfg().caps_count.chest || 0; if (cap && (v.cnt.chest || 0) >= cap) { full('chest'); return 'full'; }
    v.cnt.chest = (v.cnt.chest || 0) + 1; if (id) v.once[key] = Date.now(); save(v); return 'ok';
  }
  function unchest(id) { const v = load(); if (id) delete v.once['chest:' + id]; v.cnt.chest = Math.max(0, (v.cnt.chest || 0) - 1); save(v); }
  function best(id, score) { const v = load(); score = +score || 0; if (v.best[id] != null && score <= v.best[id]) return false; v.best[id] = score; save(v); return true; }
  // the plaque: short, honest, once a day per kind; German big, Russian small (i18n.js translates the Russian line for EN)
  function full(kind) {
    const v = load(); kind = kind || 'all'; if (v.shown[kind]) return false; v.shown[kind] = Date.now(); save(v);
    try {
      let w = document.getElementById('rwFull');
      if (!w) {
        w = document.createElement('div'); w.id = 'rwFull'; w.className = 'ui ui-panel-paper';
        w.style.cssText = 'position:absolute;left:50%;top:64px;transform:translateX(-50%);max-width:86%;z-index:90;padding:8px 14px;text-align:center;color:#2e1e12;font-size:17px;font-weight:700;line-height:1.2;display:none;pointer-events:auto';
        w.onclick = () => { w.style.display = 'none'; };
        (document.getElementById('ui') || document.body).appendChild(w);
      }
      w.innerHTML = MSG.de + '<span style="display:block;font-size:13px;font-weight:400;color:#6b4a2e">' + MSG.ru + '</span>';
      w.style.display = 'block'; clearTimeout(full.t); full.t = setTimeout(() => { w.style.display = 'none'; }, 4200);
    } catch (e) {}
    try { dispatchEvent(new CustomEvent('ds:rewardsFull', { detail: { kind } })); } catch (e) {}
    return true;
  }
  // монеты из приложения (мини-игры, app/src/core/rewards.js: правило «первые 3 игры в день + рекорд, не больше 10») — очередь ds_proto.rewardQueue
  const QK = 'ds_proto.rewardQueue';
  function drain() {
    if (typeof state === 'undefined' || !state || !window.Eco) return 0;
    let q = []; try { q = JSON.parse(localStorage.getItem(QK)) || []; } catch (e) {} if (!q.length) return 0;
    try { localStorage.removeItem(QK); } catch (e) {}
    let s = 0; q.forEach(it => { s += coins(+it.n || 0, it.why || 'app', it.kind || 'minigame'); });
    if (s && window.toast) toast('+' + s + ' Münzen (Spiele)', 1800); return s;
  }
  addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.ds === 'rewards') drain(); });
  (function boot(k) { if ((typeof state === 'undefined' || !window.Eco) && k < 100) return setTimeout(() => boot(k + 1), 300); if (window.Eco) Eco.ready.then(drain); })(0);
  window.Rewards = { day, once, has, decay, coins, xp, left, take, chest, unchest, best, full, cfg, drain,
    msg: () => Object.assign({}, MSG), state: () => load(), _reset() { try { localStorage.removeItem(K); } catch (e) {} } };
})();
