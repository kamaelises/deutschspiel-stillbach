// economy.js - window.Eco: one economy for Stillbach (Код экономика 24.11). Prices/earnings: assets_v3/world/economy.json.
// A1 = Max is a child: das Taschengeld, small sums. Coins are spent; stars (lessons) are NEVER spent (thresholds only, never go down);
// a defeat costs nothing (author's decisions 23.11). Coins live in main.js state.coins / setCoins (HUD), Eco only wraps them.
// API: Eco.ready (Promise), cfg(), coins(), can(n), earn(n, why, kind) -> given (daily cap caps_day[kind]), spend(n, why) -> true/false,
//      price(section, id, fallback), stars(), level() 'A1'|'A2'|'B1', capLeft(kind), onDefeat() -> {lost: 0}, log(). Event: window 'ds:eco'.
(function () {
  const DEF = { earn: { help: 2 }, caps_day: { help: 6 }, stars: { perLesson: 1 }, restore: {} };
  let C = DEF;
  const ready = fetch('assets_v3/world/economy.json').then(r => r.json()).then(j => { C = j; return j; }).catch(() => C);
  const LK = 'ds_proto.eco';
  const day = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function load() {
    let v = null; try { v = JSON.parse(localStorage.getItem(LK)); } catch (e) {}
    v = v && typeof v === 'object' ? v : {}; if (v.day !== day()) { v.day = day(); v.got = {}; } v.got = v.got || {}; v.log = v.log || []; v.starsMax = +v.starsMax || 0; return v;
  }
  const save = v => { try { localStorage.setItem(LK, JSON.stringify(v)); } catch (e) {} };
  const coins = () => (typeof state !== 'undefined' && state ? +state.coins || 0 : 0);
  const put = n => { if (typeof setCoins === 'function') setCoins(n); else if (typeof state !== 'undefined' && state) state.coins = n; };
  const note = (v, d, why) => { v.log.push([Date.now(), d, why || '']); if (v.log.length > 40) v.log.splice(0, v.log.length - 40); };
  const fire = (t, n, why) => { try { dispatchEvent(new CustomEvent('ds:eco', { detail: { t, n, why, coins: coins() } })); } catch (e) {} };
  function capLeft(kind) { const cap = kind && C.caps_day ? C.caps_day[kind] : 0; if (!cap) return Infinity; return Math.max(0, cap - (load().got[kind] || 0)); }
  function earn(n, why, kind) {
    n = Math.max(0, Math.round(+n || 0)); const v = load();
    if (kind && C.caps_day && C.caps_day[kind]) { n = Math.min(n, Math.max(0, C.caps_day[kind] - (v.got[kind] || 0))); v.got[kind] = (v.got[kind] || 0) + n; }
    if (n) { put(coins() + n); note(v, n, why); } save(v); if (n) fire('earn', n, why); return n;
  }
  function spend(n, why) {
    n = Math.max(0, Math.round(+n || 0)); if (coins() < n) return false;
    if (n) { put(coins() - n); const v = load(); note(v, -n, why); save(v); fire('spend', n, why); } return true;
  }
  function price(sec, id, fb) { const s = C[sec], p = s ? s[id] : undefined; return typeof p === 'number' ? p : fb; }
  function stars() {                                              // lessons of the app = stars; only grow (kept max), never spent
    let n = 0; try { const a = JSON.parse(localStorage.getItem('ds_proto.app')) || {};
      if (window.DSMode) a.chapters = DSMode.chapters();             // Три режима: в «Только игра» звёзды и от Stufe (главы, открытые игрой)
      n = typeof a.stars === 'number' ? a.stars : (a.chapters || []).reduce((s, c) => s + Math.max(0, +c.done || 0), 0) * ((C.stars && C.stars.perLesson) || 1); } catch (e) {}
    const v = load(); if (n > v.starsMax) { v.starsMax = n; save(v); } return Math.max(n, v.starsMax);
  }
  function level() { const a = typeof window.maxAge === 'function' ? window.maxAge() : 'kid'; return a === 'adult' ? 'B1' : a === 'teen' ? 'A2' : 'A1'; }
  window.Eco = { ready, cfg: () => C, coins, can: n => coins() >= n, earn, spend, price, stars, level, capLeft, onDefeat: () => ({ lost: 0 }), log: () => load().log.slice() };
})();
