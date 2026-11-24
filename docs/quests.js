// Задания (добавка автора 23.11; Код (задания) 24.11): взятые задания — трекер вверху справа, под плашками HUD; не загораживает экран.
// Quests.add({id,title_de,title_ru,goal_de,count,need,reward, kind,sec,item,mat,npc,distinct,giver,giver_de,xp,fest,day}), Quests.progress(id,n), Quests.done(id);
// хранение localStorage ds_proto.quests. Цели (kind): mat — материал из сундуков (Holz, Stein, Mehl, Eisen; legacy goal_de) — счёт сам по сумке (Loot.inv);
// album — находка в альбом (огород, рыбалка, грибы/цветы/камни: sec/item album.json) — счёт по приросту ds_proto.album.items;
// kill — победы в подземелье (сцена Dungeon: der Keller / der Erinnerungskeller) — по приросту ds_proto.album.kills; talk — Quests.talk(npc) (npc 'any' — разные жители);
// board — сдать задание с доски. Без giver (старое «Bring mir 3 Holz»): на need — сразу «Erledigt!». С giver: на need — «✓ … · сдай: <кто>», сдача Quests.turnIn(id)
// у того, кто дал, или у доски (board.js). Награда: монеты reward + опыт xp (звёзды не тратятся; поражение без потерь).
// Трекер: не больше 3 строк — 2 задания + «noch N», DE + мелко RU, полупрозрачный фон, ≤ 8 % высоты экрана; тап — свернуть/развернуть;
// скрыт в диалоге, в пошаговом бою и под окнами; тапы по миру вне плашки не перехватывает (слой #ui без pointer-events).
(function () {
  const KEY = 'ds_proto.quests', $ = id => document.getElementById(id);
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)) || {}; v.active = v.active || []; v.done = v.done || []; return v; } catch (e) { return { active: [], done: [] }; } };
  const save = v => { if (v.done.length > 300) v.done = v.done.slice(-300); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const css = document.createElement('style');
  css.textContent = `
    #qTrack{position:absolute;right:12px;top:var(--qTop,60px);max-width:320px;display:none;flex-direction:column;align-items:stretch;gap:1px;padding:3px 9px 4px;
      background:rgba(46,30,18,.66);border:2px solid rgba(201,164,106,.85);border-radius:7px;color:#fff7e0;font-family:Roboto,'Segoe UI',system-ui,sans-serif;z-index:15;cursor:pointer}
    #qTrack .q{display:flex;align-items:baseline;gap:6px;white-space:nowrap;overflow:hidden;line-height:1.15}
    #qTrack .q b{font-size:18px;font-weight:700;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
    #qTrack .q .n{font-size:17px;font-weight:800;color:#ffd23f;flex:0 0 auto}
    #qTrack .q small{font-size:13px;color:#f3e3c3;opacity:.9;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0}
    #qTrack .q.fin b,#qTrack .q.fin .n,#qTrack .q.ready b,#qTrack .q.ready .n{color:#8fdc5c}
    #qTrack .more{font-size:13px;color:#f3e3c3;opacity:.85;line-height:1.1}
    #qTrack.min .q:not(:first-child),#qTrack.min .more{display:none}`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'qTrack'; box.className = 'ui';
  let collapsed = false, fins = {};
  const hooks = [];
  const ready = q => !!q && q.count >= q.need;
  function add(q) {
    const v = load(); if (!q || !q.id || v.active.some(x => x.id === q.id) || v.done.includes(q.id)) return false;
    const o = { id: q.id, title_de: q.title_de || q.id, title_ru: q.title_ru || '', goal_de: q.goal_de || '', count: Math.max(0, q.count | 0), need: Math.max(1, q.need | 0 || 1), reward: q.reward || 0 };
    ['kind', 'sec', 'item', 'mat', 'npc', 'distinct', 'giver', 'giver_de', 'xp', 'fest', 'day', 'src'].forEach(k => { if (q[k] !== undefined) o[k] = q[k]; });
    if (o.distinct || o.npc === 'any') o.got = [];
    v.active.push(o); save(v); render(); return true;
  }
  function progress(id, n) {
    const v = load(), q = v.active.find(x => x.id === id); if (!q) return false;
    q.count = Math.max(0, Math.min(q.need, n | 0)); save(v); render();
    if (q.count >= q.need && !q.giver && !fins[id]) setTimeout(() => done(id), 700);   // без «кто дал»: 3/3 видно, затем «Erledigt!»
    return true;
  }
  function pay(q) {                                                  // монеты + опыт; уровень как в бою (combat.js: 50 × Stufe, максимум 50)
    let bonus = 0; try { bonus = window.Skills && Skills.fx ? +Skills.fx('quest.reward') || 0 : 0; } catch (e) {}   // die Plaudertasche: награда больше (Код навыки 24.11)
    const coins = Math.round((+q.reward || 0) * (1 + Math.max(0, bonus))), xp = +q.xp || 0;
    if (typeof state === 'undefined') return { coins: 0, xp: 0 };
    if (xp) { state.xp = (state.xp || 0) + xp; const C = window.Combat; if (C && C.lvl && C.xpNeed) { let k = 0; while (C.lvl() < 50 && state.xp >= C.xpNeed(C.lvl()) && k++ < 60) { state.xp -= C.xpNeed(C.lvl()); state.level = C.lvl() + 1; } } }
    if (typeof setCoins === 'function') setCoins(state.coins + coins); else if (typeof store !== 'undefined') store.set(state);
    return { coins, xp };
  }
  function done(id) {
    const v = load(), q = v.active.find(x => x.id === id); if (!q || fins[id]) return false;
    const mk = matKey(q);
    if (mk && window.Loot) { const inv = Loot.inv(); inv.mats[mk] = Math.max(0, (inv.mats[mk] || 0) - q.need); try { localStorage.setItem('ds_proto.inv', JSON.stringify(inv)); } catch (e) {} }   // материал отдан
    const got = pay(q);
    q.count = q.need; fins[id] = Date.now(); save(v); render();
    const fin = () => { const w = load(); w.active = w.active.filter(x => x.id !== id); if (!w.done.includes(id)) w.done.push(id); save(w); delete fins[id]; render(); };
    if (q.giver) fin(); else setTimeout(fin, 1800);                 // сданное у жителя/доски — сразу; старое авто-задание — «Erledigt!» 1,8 с
    hooks.forEach(f => { try { f(q, got); } catch (e) { console.warn('Quests hook', e); } });
    return got;
  }
  function turnIn(id) { const q = load().active.find(x => x.id === id); if (!q || !q.giver || !ready(syncOne(q))) return false; return done(id); }
  function drop(id) { const v = load(); const n = v.active.length; v.active = v.active.filter(x => x.id !== id); save(v); render(); return v.active.length < n; }
  function matKey(q) { if (q.kind && q.kind !== 'mat') return null; const g = String(q.mat || q.goal_de || '').toLowerCase(); return window.Loot && Loot.MATS && Loot.MATS[g] ? g : null; }
  function syncOne(q) { const k = matKey(q); if (k && window.Loot && !fins[q.id]) q.count = Math.min(q.need, Loot.inv().mats[k] || 0); return q; }
  function sync() {                                                  // материал считается сам по сумке
    if (!window.Loot) return; const v = load(), inv = Loot.inv();
    v.active.forEach(q => { const k = matKey(q); if (k && !fins[q.id]) { const n = Math.min(q.need, inv.mats[k] || 0); if (n !== q.count) progress(q.id, n); } });
  }
  // ---- события мира: находки альбома, победы, разговоры
  function bump(test) {
    const v = load(); let ch = false;
    v.active.forEach(q => { if (fins[q.id] || q.count >= q.need) return; const r = test(q); if (!r) return; if (q.got) { if (q.got.includes(r)) return; q.got.push(r); } q.count++; ch = true; });
    if (ch) { save(v); render(); v.active.filter(q => q.count >= q.need && !q.giver).forEach(q => progress(q.id, q.count)); }
    return ch;
  }
  function onAlbum(id, n) {
    const it = window.Album && Album.item ? Album.item(id) : null, sec = it ? it.sec : null;
    for (let i = 0; i < n; i++) bump(q => q.kind === 'album' && (q.item ? q.item === id : !!sec && q.sec === sec) ? (q.distinct ? id : true) : false);
  }
  function onKill(n) {
    const g = window.game, inDun = !!(g && g.scene && g.scene.getScenes(true).some(s => s.scene.key === 'Dungeon'));
    if (!inDun) return; for (let i = 0; i < n; i++) bump(q => q.kind === 'kill');
  }
  function talk(npc) { return bump(q => q.kind === 'talk' && (q.npc === npc || q.npc === 'any') ? (q.npc === 'any' ? npc : true) : false); }
  function boardDone() { return bump(q => q.kind === 'board'); }
  let snap = null;                                                   // снимок альбома: прирост = событие (album.js не трогаем)
  function albumSnap() { try { const a = JSON.parse(localStorage.getItem('ds_proto.album')) || {}; const s = { items: {}, kills: 0 }; Object.entries(a.items || {}).forEach(([k, o]) => { s.items[k] = o.n || 0; }); Object.values(a.kills || {}).forEach(n => { s.kills += n || 0; }); return s; } catch (e) { return { items: {}, kills: 0 }; } }
  function watchAlbum() {
    const s = albumSnap(); if (!snap) { snap = s; return; }
    Object.entries(s.items).forEach(([k, n]) => { const d = n - (snap.items[k] || 0); if (d > 0 && !/^monster_/.test(k)) onAlbum(k, d); });
    if (s.kills > snap.kills) onKill(s.kills - snap.kills);
    snap = s;
  }
  function render() {
    const v = load(), A = v.active.map(syncOne);
    box.innerHTML = A.slice(0, collapsed ? 1 : 2).map(q => fins[q.id] && !q.giver
      ? `<div class="q fin"><b>Erledigt!</b><span class="n">${q.need}/${q.need}</span><small>${q.title_de} · выполнено</small></div>`
      : q.giver && ready(q)
        ? `<div class="q ready"><b>✓ ${q.title_de}</b><span class="n">${q.need}/${q.need}</span><small>сдай: ${q.giver_de || ''}</small></div>`
        : `<div class="q"><b>${q.title_de}</b><span class="n">${q.count}/${q.need}</span><small>${q.title_ru}</small></div>`).join('')
      + (A.length > 2 && !collapsed ? `<div class="more">+ noch ${A.length - 2} · ещё ${A.length - 2}</div>` : '') + (collapsed && A.length > 1 ? `<div class="more" style="display:block">▸ ${A.length} Aufgaben · задания</div>` : '');
    box.classList.toggle('min', collapsed);
  }
  const vis = id => { const e = $(id); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
  function blocked() {
    if (['dlg', 'cb', 'sysWin', 'skills', 'loot', 'reward', 'mapPanel', 'furnBar', 'micHelp', 'qWin', 'lifeCard', 'fishBox', 'gardenBox'].some(vis)) return true;
    const g = window.game; if (!g || !g.scene) return true;
    return g.scene.getScenes(true).some(s => s.talking || (s.__cb && s.__cb.fight) || ['Room', 'Boot', 'Karte', 'Furnish'].includes(s.scene.key));
  }
  function place() {                                                 // под верхними плашками справа (монеты/цель, плашка героя, часы)
    const ui = $('ui'); if (!ui) return;
    const bottoms = ['goal', 'cbHero', 'clock'].filter(vis).map(id => { const e = $(id); return e.offsetTop + e.offsetHeight; });
    box.style.setProperty('--qTop', (Math.max(10, ...bottoms) + 6) + 'px');
  }
  function tick() {
    watchAlbum(); sync(); const show = load().active.length > 0 && !blocked();
    if (show) place();
    box.style.display = show ? 'flex' : 'none';
  }
  box.addEventListener('click', e => { e.stopPropagation(); collapsed = !collapsed; render(); });
  ['pointerdown', 'pointerup', 'touchstart'].forEach(t => box.addEventListener(t, e => e.stopPropagation()));
  const test = {                                                     // тест-хук проверок: выполнить цель без игры
    fill(id) { const v = load(), q = v.active.find(x => x.id === id); if (!q) return false; const k = matKey(q);
      if (k && window.Loot) { const inv = Loot.inv(); inv.mats[k] = Math.max(inv.mats[k] || 0, q.need); localStorage.setItem('ds_proto.inv', JSON.stringify(inv)); }
      q.count = q.need; save(v); render(); if (!q.giver) progress(id, q.need); return true; },
    album: (id, n) => onAlbum(id, n || 1), kill: n => onKill(n || 1), resnap() { snap = albumSnap(); },
  };
  window.Quests = { add, progress, done, turnIn, drop, talk, boardDone, ready: id => { const q = load().active.find(x => x.id === id); return !!q && ready(syncOne(q)); }, get: id => load().active.find(x => x.id === id) || null,
    list: () => load().active, finished: () => load().done, onDone: f => hooks.push(f), render, tick, test, toggle: () => { collapsed = !collapsed; render(); } };
  (function hook() { const ui = $('ui'); if (!ui) return setTimeout(hook, 100); ui.appendChild(box); render(); tick(); setInterval(tick, 250); })();
})();
