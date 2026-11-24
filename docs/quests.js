// Задания (добавка автора 23.11): взятые задания — трекер вверху справа, под плашками HUD; не загораживает экран.
// Quests.add({id,title_de,title_ru,goal_de,count,need}), Quests.progress(id,n), Quests.done(id); хранение localStorage ds_proto.quests.
// goal_de = материал из сундуков (Holz, Stein, Mehl, Eisen) — счёт идёт сам по сумке (Loot.inv), на need: «Erledigt!», материал отдан, +монеты.
// Трекер: одна строка на задание, видно 2 (+ «noch N»), DE + мелко RU, полупрозрачный фон, ≤ 8 % высоты экрана; тап — свернуть/развернуть;
// скрыт в диалоге, в пошаговом бою и под окнами; тапы по миру вне плашки не перехватывает (слой #ui без pointer-events).
(function () {
  const KEY = 'ds_proto.quests', $ = id => document.getElementById(id);
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)) || {}; v.active = v.active || []; v.done = v.done || []; return v; } catch (e) { return { active: [], done: [] }; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const css = document.createElement('style');
  css.textContent = `
    #qTrack{position:absolute;right:12px;top:var(--qTop,60px);max-width:320px;display:none;flex-direction:column;align-items:stretch;gap:1px;padding:3px 9px 4px;
      background:rgba(46,30,18,.66);border:2px solid rgba(201,164,106,.85);border-radius:7px;color:#fff7e0;font-family:Roboto,'Segoe UI',system-ui,sans-serif;z-index:15;cursor:pointer}
    #qTrack .q{display:flex;align-items:baseline;gap:6px;white-space:nowrap;overflow:hidden;line-height:1.15}
    #qTrack .q b{font-size:18px;font-weight:700;flex:0 0 auto}
    #qTrack .q .n{font-size:17px;font-weight:800;color:#ffd23f;flex:0 0 auto}
    #qTrack .q small{font-size:13px;color:#f3e3c3;opacity:.9;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0}
    #qTrack .q.fin b,#qTrack .q.fin .n{color:#8fdc5c}
    #qTrack .more{font-size:13px;color:#f3e3c3;opacity:.85;line-height:1.1}
    #qTrack.min .q:not(:first-child),#qTrack.min .more{display:none}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'qTrack'; box.className = 'ui';
  let collapsed = false, fins = {};
  function add(q) {
    const v = load(); if (!q || !q.id || v.active.some(x => x.id === q.id) || v.done.includes(q.id)) return false;
    v.active.push({ id: q.id, title_de: q.title_de || q.id, title_ru: q.title_ru || '', goal_de: q.goal_de || '', count: Math.max(0, q.count | 0), need: Math.max(1, q.need | 0 || 1), reward: q.reward || 0 });
    save(v); render(); return true;
  }
  function progress(id, n) {
    const v = load(), q = v.active.find(x => x.id === id); if (!q) return false;
    q.count = Math.max(0, Math.min(q.need, n | 0)); save(v); render();
    if (q.count >= q.need && !fins[id]) setTimeout(() => done(id), 700);   // 3/3 видно, затем «Erledigt!»
    return true;
  }
  function done(id) {
    const v = load(), q = v.active.find(x => x.id === id); if (!q || fins[id]) return false;
    const mk = matKey(q);
    if (mk && window.Loot) { const inv = Loot.inv(); inv.mats[mk] = Math.max(0, (inv.mats[mk] || 0) - q.need); try { localStorage.setItem('ds_proto.inv', JSON.stringify(inv)); } catch (e) {} }   // материал отдан жителю
    if (q.reward && typeof setCoins === 'function' && typeof state !== 'undefined') setCoins(state.coins + q.reward);
    q.count = q.need; fins[id] = Date.now(); save(v); render();
    setTimeout(() => { const w = load(); w.active = w.active.filter(x => x.id !== id); if (!w.done.includes(id)) w.done.push(id); save(w); delete fins[id]; render(); }, 1800);
    return true;
  }
  function matKey(q) { const g = String(q.goal_de || '').toLowerCase(); return window.Loot && Loot.MATS && Loot.MATS[g] ? g : null; }
  function sync() {                                                  // материал считается сам по сумке
    if (!window.Loot) return; const v = load(), inv = Loot.inv();
    v.active.forEach(q => { const k = matKey(q); if (k && !fins[q.id]) { const n = Math.min(q.need, inv.mats[k] || 0); if (n !== q.count) progress(q.id, n); } });
  }
  function render() {
    const v = load(), A = v.active;
    box.innerHTML = A.slice(0, collapsed ? 1 : 2).map(q => fins[q.id]
      ? `<div class="q fin"><b>Erledigt!</b><span class="n">${q.need}/${q.need}</span><small>${q.title_de} · выполнено</small></div>`
      : `<div class="q"><b>${q.title_de}</b><span class="n">${q.count}/${q.need}</span><small>${q.title_ru}</small></div>`).join('')
      + (A.length > 2 && !collapsed ? `<div class="more">+ noch ${A.length - 2} · ещё ${A.length - 2}</div>` : '') + (collapsed && A.length > 1 ? `<div class="more" style="display:block">▸ ${A.length} Aufgaben · задания</div>` : '');
    box.classList.toggle('min', collapsed);
  }
  const vis = id => { const e = $(id); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
  function blocked() {
    if (['dlg', 'cb', 'sysWin', 'skills', 'loot', 'reward', 'mapPanel', 'furnBar', 'micHelp'].some(vis)) return true;
    const g = window.game; if (!g || !g.scene) return true;
    return g.scene.getScenes(true).some(s => s.talking || (s.__cb && s.__cb.fight) || ['Room', 'Boot', 'Karte', 'Furnish'].includes(s.scene.key));
  }
  function place() {                                                 // под верхними плашками справа (монеты/цель, плашка героя, часы)
    const ui = $('ui'); if (!ui) return;
    const bottoms = ['goal', 'cbHero', 'clock'].filter(vis).map(id => { const e = $(id); return e.offsetTop + e.offsetHeight; });
    box.style.setProperty('--qTop', (Math.max(10, ...bottoms) + 6) + 'px');
  }
  function tick() {
    sync(); const show = load().active.length > 0 && !blocked();
    if (show) place();
    box.style.display = show ? 'flex' : 'none';
  }
  box.addEventListener('click', e => { e.stopPropagation(); collapsed = !collapsed; render(); });
  ['pointerdown', 'pointerup', 'touchstart'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));
  window.Quests = { add, progress, done, list: () => load().active, finished: () => load().done, render, tick, toggle: () => { collapsed = !collapsed; render(); } };
  (function hook() { const ui = $('ui'); if (!ui) return setTimeout(hook, 100); ui.appendChild(box); render(); tick(); setInterval(tick, 250); })();
})();
