// research.js — window.Research: die Forschung (Код навыки 24.11). Чертежи и улучшения мирной жизни: assets_v3/world/research.json.
// Идёт по реальному времени (часы мира WorldTime, иначе устройство), переживает перезагрузку и закрытую игру; один слот (slots). Ускорения нет, звёзды не тратятся.
// Цена: монеты (Eco.price('research', id, cost.coins) — тратятся), материалы из Beutel (ds_proto.inv.mats — тратятся), слова-Baustoffe (Wörter: нужно знать
// столько слов «твёрдо» или Wortkarten — НЕ тратятся). Условия req — как у навыков (Skills.cond), need: 'skill:<id>' / 'research:<id>', stage — возраст Max.
// Вкладка «Forschung» в Rucksack (skills.js): работа — полоска и «noch m:ss»; доступное — условия; дальше — силуэт «???» с намёком.
// API: Research.ready, items(), item(id), done(id), active() -> {id, t0, end}|null, view(it) -> done|work|next|fog, checks(it) -> [{ok,cur,need,de,ru}],
//      start(id) -> {ok, why}, tick() -> id завершённого|null, fx(key) — сумма fx завершённых, render(el). Событие: window 'ds:research' {t: start|done, id}.
// Хранение: localStorage ds_proto.research = {active:{id,t0,end}, done:{id: t}}. Тест-хук: Research._finishNow().
(function () {
  const KEY = 'ds_proto.research';
  let RJ = { slots: 1, items: [] };
  const ready = fetch('assets_v3/world/research.json').then(r => r.json()).then(j => { RJ = j; RJ.items = RJ.items || []; return j; }).catch(e => { console.warn('Research', e); return RJ; });
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const load = () => { const v = ld(KEY, null) || {}; v.done = v.done || {}; v.active = v.active && v.active.id ? v.active : null; return v; };
  const save = v => sv(KEY, v);
  const now = () => { try { if (window.WorldTime && WorldTime.now) { const w = WorldTime.now(); if (w && w.date) return new Date(w.date).getTime(); } } catch (e) {} return Date.now(); };
  const item = id => RJ.items.find(x => x.id === id) || null;
  const fire = (t, id) => { try { dispatchEvent(new CustomEvent('ds:research', { detail: { t, id } })); } catch (e) {} };
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
  const S = () => window.Skills || null;
  function isDone(id) { const v = load(); return !!v.done[id] || !!(v.active && v.active.id === id && v.active.end <= now()); }
  function tick() {
    const v = load(); if (!v.active || v.active.end > now()) return null;
    const id = v.active.id; v.done[id] = v.active.end; v.active = null; save(v); fire('done', id);
    const it = item(id); if (it && window.toast) toast(`Fertig: ${it.art} ${it.de}`, 2000);
    return id;
  }
  function fx(k) { let s = 0; Object.keys(load().done).forEach(id => { const it = item(id); if (it && it.fx && typeof it.fx[k] === 'number') s += it.fx[k]; });
    const a = load().active; if (a && a.end <= now()) { const it = item(a.id); if (it && it.fx && typeof it.fx[k] === 'number') s += it.fx[k]; } return s; }
  const needOk = it => (it.need || []).every(n => { const [k, id] = String(n).split(':'); return k === 'skill' ? !!(S() && S().lvl(id) > 0) : k === 'research' ? isDone(id) : true; });
  const branchOk = it => { const s = S(), b = s && s.BRANCHES.find(x => x.id === it.branch); return !b || s.branchOpen(b); };
  function view(it) {
    if (isDone(it.id)) return 'done'; const a = load().active; if (a && a.id === it.id) return 'work';
    return it.min > 0 && branchOk(it) && needOk(it) && (!S() || S().stageOk(it.stage)) ? 'next' : 'fog';
  }
  const price = it => { const c = it.cost || {}; return { coins: window.Eco ? Eco.price('research', it.id, c.coins || 0) : c.coins || 0, mats: c.mats || {} }; };
  const words = () => Math.max(S() && S().firm ? S().firm() : 0, window.Loot ? (Loot.inv().cards || []).length : 0);
  function checks(it) {
    const pr = price(it), inv = window.Loot ? Loot.inv() : { mats: {} }, out = [];
    (it.req || []).forEach(c => out.push(S() ? S().cond(c) : { ok: true, cur: 1, need: 1, de: '', ru: '' }));
    if (pr.coins) { const cur = window.Eco ? Eco.coins() : 0; out.push({ ok: cur >= pr.coins, cur, need: pr.coins, de: 'Münzen', ru: 'монет (тратятся)' }); }
    Object.entries(pr.mats).forEach(([k, n]) => { const cur = +(inv.mats || {})[k] || 0, M = window.Loot && Loot.MATS && Loot.MATS[k]; out.push({ ok: cur >= n, cur, need: n, de: M ? M[0] : k, ru: (M ? M[1] : k) + ' (тратится)' }); });
    if (it.words) { const cur = words(); out.push({ ok: cur >= it.words, cur, need: it.words, de: 'Wörter als Baustoff', ru: 'выученных слов (не тратятся)' }); }
    return out;
  }
  function start(id) {
    const it = item(id); if (!it) return { ok: false, why: 'unknown' };
    tick(); const v = load(); if (v.active) return { ok: false, why: 'busy' };
    if (view(it) !== 'next') return { ok: false, why: 'locked' };
    if (!checks(it).every(c => c.ok)) return { ok: false, why: 'need' };
    const pr = price(it); if (pr.coins && !(window.Eco && Eco.spend(pr.coins, 'research:' + id))) return { ok: false, why: 'coins' };
    if (Object.keys(pr.mats).length) { const raw = ld('ds_proto.inv', {}) || {}; raw.mats = raw.mats || {}; Object.entries(pr.mats).forEach(([k, n]) => { raw.mats[k] = Math.max(0, (+raw.mats[k] || 0) - n); }); sv('ds_proto.inv', raw); }
    const t = now(); v.active = { id, t0: t, end: t + it.min * 60000 }; save(v); fire('start', id);
    return { ok: true };
  }
  function render(el) {
    if (!el) return; tick();
    const s = S(), A = (a, w) => (s && s.artHTML ? s.artHTML(a, w) : (a ? a + ' ' : '') + w), C = r => (s && s.condHTML ? s.condHTML(r) : ''), v = load(), t = now();
    let h = `<div class="stat" style="margin-top:0"><b>die Forschung</b> · ${RJ.slots || 1} Platz<span class="ru">исследования идут по реальному времени, даже когда игра закрыта; ускорить нельзя. Монеты и материалы тратятся, выученные слова — нет.</span></div>`;
    if (v.active) {
      const it = item(v.active.id) || { de: v.active.id, ru: '' }, len = Math.max(1, v.active.end - v.active.t0), pc = Math.round(100 * Math.min(1, (t - v.active.t0) / len));
      h += `<div class="sk work"><div class="info"><div class="nm">${A(it.art, it.de)}<span class="ru">${it.ru} · идёт исследование</span></div><div class="tx">noch ${fmt(v.active.end - t)}<span class="ru">осталось · ${it.txt || ''}</span></div>
        <div class="cnd"><span class="bar" style="flex:1 1 auto"><i style="width:${pc}%;background:#6a4fa0"></i></span><span class="ct" style="flex:0 0 auto">${pc} %</span></div></div><button class="ui ui-btn" disabled>Läuft<span class="ru">идёт</span></button></div>`;
    }
    const order = s ? s.BRANCHES.filter(b => b.group === 'leben').map(b => b.id) : []; RJ.items.forEach(it => { if (!order.includes(it.branch)) order.push(it.branch); });
    order.forEach(bid => {
      const L = RJ.items.filter(it => it.branch === bid && !(v.active && v.active.id === it.id)); if (!L.length) return;
      const b = s && s.BRANCHES.find(x => x.id === bid), open = !b || s.branchOpen(b);
      h += `<div class="stat">${open && b ? A(b.art, b.de) : '???'}<span class="ru">${open && b ? b.ru : 'ветка в тумане'}</span></div>`;
      L.forEach(it => {
        const w = view(it);
        if (w === 'done') { h += `<div class="sk done"><div class="info"><div class="nm">${A(it.art, it.de)} ✓<span class="ru">${it.ru} · готово</span></div><div class="tx">${it.txt_de}<span class="ru">${it.txt}</span></div></div><button class="ui ui-btn" disabled>Fertig<span class="ru">готово</span></button></div>`; return; }
        if (w === 'fog') {
          const hi = it.hint || {}, grow = it.stage && s && !s.stageOk(it.stage), st = (s && s.STAGE_TXT[it.stage]) || ['', ''];
          h += `<div class="sk fog"><span class="sil"></span><div class="info"><div class="nm">???<span class="ru">пока в тумане</span></div><div class="tx">${hi.de || '…'}${grow && !/größer/.test(hi.de || '') ? ` · wenn Max größer ist (${it.stage})` : ''}<span class="ru">${hi.ru || 'откроется дальше'}${grow && !/подраст/.test(hi.ru || '') ? ' · когда Макс подрастёт: ' + st[1] : ''}</span></div></div><button class="ui ui-btn" data-rf="${it.id}" disabled>???<span class="ru">туман</span></button></div>`;
          return;
        }
        const ch = checks(it), ok = !v.active && ch.every(c => c.ok);
        h += `<div class="sk next"><div class="info"><div class="nm">${A(it.art, it.de)}<span class="ru">${it.ru} · ${it.min} мин</span></div><div class="tx">${it.txt_de}<span class="ru">${it.txt}</span></div>${ch.map(C).join('')}</div>
          <button class="ui ui-btn" data-r="${it.id}" ${ok ? '' : 'disabled'}>Forschen<span class="ru">${v.active ? 'слот занят' : 'начать · ' + it.min + ' мин'}</span></button></div>`;
      });
    });
    el.innerHTML = h;
  }
  window.Research = { ready, items: () => RJ.items, item, done: isDone, active: () => load().active, view, checks, start, tick, fx, render, now,
    _finishNow() { const v = load(); if (v.active) { v.active.end = now() - 1; save(v); } return tick(); } };
})();
