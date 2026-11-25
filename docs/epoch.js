// epoch.js — Epochen und Grammatik-Forschung (Epoch-1, 25.11; tasks\EPOCH_STUDY.md §2, §3, §5 п.1–3). Данные: assets_v3/world/epochs.json.
// ТОЛЬКО ЗА ФЛАГОМ: ?epoch=1 в адресе или localStorage DS_EPOCH = '1'. Без флага модуль ничего не делает (window.Epoch = {on:false}).
// 1) Эпоха = уровень языка: A1 das Dorf -> A2 das Städtchen -> B1 die Stadt. Ворота (gate): глава мира (DSMode.chapters, в «Только игра» — Stufe),
//    задачи Restore готовы, слова «твёрдо» (Skills.firm) или Wortkarten. Монетами не купить. Ворота открыты и праздник ещё не был ->
//    при входе в деревню (сцена Yard) — «Neue Epoche»: камера проезжает по домам, пыль 4 кадра, флажки над домами, карточка «vorher | nachher»,
//    «что нового» и выбор бонуса 1 из 3. Кнопка «Überspringen»; «меньше анимации» (AnimFX.less) — сразу карточка. Открытая эпоха не закрывается.
// 2) Grammatik-Forschung: узел = тема грамматики (карта глава -> тема из content\chapters.json), открывается пройденной главой, идёт по реальному
//    времени (свой слот), монет не стоит. Вкладка Rucksack -> Forschung: блок эпохи и грамматики над прежней Forschung (Research.render обёрнут).
// 3) Эффекты (бонус эпохи + готовая грамматика) прибавляются к Skills.fx(k) -> их уже читают restore.js, garden.js, quests.js, fishing.js.
// Хранение: localStorage ds_proto.epoch = {seen:{A2:t}, bonus:{A2:'garten'}, gr:{active:{id,t0,end}|null, done:{id:t}}}. Событие window 'ds:epoch' {t, id}.
// API: Epoch.on, ready, cur(), next(), gate(ep), items(), view(id), start(id), tick(), fx(k), choose(ep, bonus), stats(); тест: _play(), _finishNow(), _reset().
(function () {
  let on = false;
  // 25.11 главный: по умолчанию ВКЛ; выключатель ?epoch=0 или localStorage DS_EPOCH = '0'
  // Д2 (CHECK_epoch_markt_2511): ?epoch=0 и в адресе приложения-родителя (игра в рамке получает только ?embed=1) — как markt.js
  const RX0 = /[?&]epoch=0\b/;
  on = true;
  try { if (RX0.test(location.search)) on = false; } catch (e) {}
  try { if (window.parent !== window && RX0.test(window.parent.location.search)) on = false; } catch (e) { /* чужой родитель */ }
  try { if (localStorage.getItem('DS_EPOCH') === '0') on = false; } catch (e) {}
  if (!on) { window.Epoch = { on: false }; return; }
  const KEY = 'ds_proto.epoch';
  let EJ = { epochs: [], grammar: [], slots: 1 };
  const ready = fetch('assets_v3/world/epochs.json').then(r => r.json()).then(j => { EJ = j; EJ.epochs = EJ.epochs || []; EJ.grammar = EJ.grammar || []; FX = {}; return j; }).catch(e => { console.warn('Epoch', e); return EJ; });
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  // состояние в памяти: Skills.fx зовут огород/рыбалка/реставрация часто (по кадрам) — без JSON.parse на каждый вызов (замер FPS 412x860 CPU 4x)
  let ST = null, FX = {};
  const load = () => { if (ST) return ST; const v = ld(KEY, null) || {}; v.seen = v.seen || {}; v.bonus = v.bonus || {}; v.gr = v.gr || {}; v.gr.done = v.gr.done || {}; v.gr.active = v.gr.active && v.gr.active.id ? v.gr.active : null; return (ST = v); };
  const save = v => { ST = v; FX = {}; sv(KEY, v); };
  addEventListener('storage', e => { if (e.key === KEY || e.key === null) { ST = null; FX = {}; } });
  const now = () => { try { if (window.Research && Research.now) return Research.now(); } catch (e) {} return Date.now(); };
  const fire = (t, id) => { try { dispatchEvent(new CustomEvent('ds:epoch', { detail: { t, id } })); } catch (e) {} };
  const less = () => { try { return !!(window.AnimFX && AnimFX.less()); } catch (e) { return false; } };
  const S = () => window.Skills || null;
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

  // ---------- ворота эпохи
  function chapters() { try { return window.DSMode ? DSMode.chapters() : (JSON.parse(localStorage.getItem('ds_proto.app')) || {}).chapters || []; } catch (e) { return []; } }
  function reach() { let r = 1; chapters().forEach(c => { const n = +c.n || 0; if (+c.done > 0) r = Math.max(r, n); if (+c.total > 0 && +c.done >= +c.total) r = Math.max(r, n + 1); }); return r; }
  const chDone = n => chapters().some(c => +c.n === +n && +c.total > 0 && +c.done >= +c.total);
  function restored() {
    let ids = ['schild', 'beet', 'brunnen'];
    try { if (window.Restore && Restore.tasks) { const t = (Restore.tasks() || []).filter(x => x.kind !== 'help').map(x => x.id); if (t.length) ids = t; } } catch (e) {}
    return ids.filter(id => { try { return S() ? S().cond({ t: 'restore', id }).ok : false; } catch (e) { return false; } }).length;
  }
  const words = () => Math.max(S() && S().firm ? +S().firm() || 0 : 0, window.Loot && Loot.inv ? (Loot.inv().cards || []).length : 0);
  const EP = id => EJ.epochs.find(e => e.id === id) || null;
  function gate(ep) {
    const g = (ep && ep.gate) || null; if (!g) return [];
    const out = [];
    if (g.reach) { const r = reach(); out.push({ ok: r >= g.reach, cur: r - 1, need: g.reach - 1, de: 'Kapitel ' + (g.reach - 1) + ' fertig', ru: (window.DSMode && DSMode.mode() === 'game' ? 'Stufe героя ' + g.reach + ' или ' : '') + 'пройдена глава ' + (g.reach - 1) }); }
    if (g.restore) { const cur = restored(); out.push({ ok: cur >= g.restore, cur, need: g.restore, de: 'Restaurierungen fertig', ru: 'реставраций готово' }); }
    if (g.words) { const cur = words(); out.push({ ok: cur >= g.words, cur, need: g.words, de: 'Wörter sicher', ru: 'слов «твёрдо» (FSRS) или Wortkarten — не тратятся' }); }
    return out;
  }
  const gateOk = ep => gate(ep).every(c => c.ok);
  function cur() { const v = load(); let c = EJ.epochs[0] || { id: 'A1', de: 'das Dorf', ru: 'деревня' }; EJ.epochs.forEach(e => { if (!e.gate || v.seen[e.id]) c = e; }); return c; }
  function next() { const i = EJ.epochs.indexOf(cur()); return i >= 0 ? EJ.epochs[i + 1] || null : null; }
  const epIdx = id => EJ.epochs.findIndex(e => e.id === id);
  const pending = () => { const n = next(); return n && gateOk(n) ? n : null; };

  // ---------- Grammatik-Forschung
  const item = id => EJ.grammar.find(x => x.id === id) || null;
  function isDone(id) { const v = load(); return !!v.gr.done[id] || !!(v.gr.active && v.gr.active.id === id && v.gr.active.end <= now()); }
  function tick() {
    const v = load(), a = v.gr.active;
    if (a) {                                                         // Д5: дату/часы перевели назад — осталось не больше длительности темы (не 1266 дней)
      const it0 = item(a.id), dur = (+(it0 && it0.min) || 1) * 60000, t = now();
      if (it0 && (a.end - t > dur || a.t0 > t)) { const left = Math.min(dur, Math.max(0, a.end - a.t0)); a.t0 = t; a.end = t + left; save(v); }
    }
    if (!v.gr.active || v.gr.active.end > now()) return null;
    const id = v.gr.active.id; v.gr.done[id] = v.gr.active.end; v.gr.active = null; save(v); fire('grammar', id);
    const it = item(id); if (it && window.toast) toast('Fertig: ' + ((it.art ? it.art + ' ' : '') + it.de), 2000);
    return id;
  }
  function view(it) {
    if (isDone(it.id)) return 'done'; const a = load().gr.active; if (a && a.id === it.id) return 'work';
    return epIdx(it.epoch) <= epIdx(cur().id) && (it.need || []).every(isDone) ? 'next' : 'fog';
  }
  function checks(it) {
    const out = [{ ok: chDone(it.ch), cur: chDone(it.ch) ? 1 : 0, need: 1, de: 'Kapitel ' + it.ch + ' fertig', ru: 'глава ' + it.ch + ' пройдена (поле: ' + (it.fields || [it.ch]).join(', ') + ')' }];
    if (it.words) { const c = words(); out.push({ ok: c >= it.words, cur: c, need: it.words, de: 'Wörter sicher', ru: 'выученных слов (не тратятся)' }); }
    return out;
  }
  function start(id) {
    const it = item(id); if (!it) return { ok: false, why: 'unknown' };
    tick(); const v = load(); if (v.gr.active) return { ok: false, why: 'busy' };
    if (view(it) !== 'next') return { ok: false, why: 'locked' };
    if (!checks(it).every(c => c.ok)) return { ok: false, why: 'need' };
    const t = now(); v.gr.active = { id, t0: t, end: t + (+it.min || 1) * 60000 }; save(v); fire('start', id);
    return { ok: true };
  }
  function fx(k) {
    const v = load(), a0 = v.gr.active, live = a0 && a0.end <= now();   // исследование только что дошло — считать без кэша (tick допишет)
    if (!live && Object.prototype.hasOwnProperty.call(FX, k)) return FX[k];
    const r = fx0(k, v); if (!live) FX[k] = r; return r;
  }
  function fx0(k, v) {
    let s = 0;
    Object.keys(v.gr.done).forEach(id => { const it = item(id); if (it && it.fx && typeof it.fx[k] === 'number') s += it.fx[k]; });
    const a = v.gr.active; if (a && a.end <= now()) { const it = item(a.id); if (it && it.fx && typeof it.fx[k] === 'number') s += it.fx[k]; }
    Object.entries(v.bonus).forEach(([eid, bid]) => { const e = EP(eid), b = e && (e.bonus || []).find(x => x.id === bid); if (b && b.fx && typeof b.fx[k] === 'number') s += b.fx[k]; });
    return s;
  }
  // Skills.fx(k) = навыки + Research + (новое) эпохи: модули мира читают только Skills.fx — их файлы не меняются
  (function hookFx() { if (!window.Skills || !Skills.fx || Skills.fx.__ep) return setTimeout(hookFx, 200); const f0 = Skills.fx; const f = k => (+f0(k) || 0) + fx(k); f.__ep = 1; Skills.fx = f; })();

  // ---------- вкладка Forschung: блок эпохи + грамматика над прежней Forschung
  const A = (a, w) => (S() && S().artHTML ? S().artHTML(a, w) : (a ? a + ' ' : '') + w);
  const C = r => (S() && S().condHTML ? S().condHTML(r) : '');
  function html() {
    tick();
    const v = load(), c = cur(), n = next(), t = now();
    let h = `<div id="epForsch"><div class="stat" style="margin-top:0"><b>die Epoche</b>: ${A('', c.de)} (${c.id})<span class="ru">эпоха — уровень языка: деревня A1 → городок A2 → город B1. Новая эпоха — праздник в деревне и бонус на выбор; монетами её не купить.</span></div>`;
    if (n) {
      const g = gate(n), ok = g.every(x => x.ok);
      h += `<div class="sk ${ok ? 'next' : 'locked'}" id="epNext"><div class="info"><div class="nm">${A('', n.de)} (${n.id})<span class="ru">следующая эпоха — ${n.ru}${ok ? ': ворота открыты, праздник — в деревне' : ''}</span></div>${g.map(C).join('')}</div>
        <button class="ui ui-btn" data-ep-go="1" ${ok ? '' : 'disabled'}>${ok ? 'Feiern' : 'Noch nicht'}<span class="ru">${ok ? 'в деревню' : 'пока нет'}</span></button></div>`;
    }
    const bon = Object.entries(v.bonus).map(([eid, bid]) => { const e = EP(eid), b = e && (e.bonus || []).find(x => x.id === bid); return b ? `<div class="tx">${eid}: ${A(b.art, b.de)} — ${b.txt_de}<span class="ru">${b.txt}</span></div>` : ''; }).join('');
    if (bon) h += `<div class="stat"><b>Bonus der Epoche</b><span class="ru">выбранные бонусы эпох</span></div>${bon}`;
    EJ.epochs.filter(e => e.gate && v.seen[e.id] && !v.bonus[e.id] && (e.bonus || []).length).forEach(e => {   // праздник прерван (перезагрузка) — выбор не потерян
      h += `<div class="sk next"><div class="info"><div class="nm">Bonus: ${A('', e.de)}<span class="ru">бонус эпохи ещё не выбран</span></div></div><button class="ui ui-btn" data-ep-pick="${e.id}">Wählen<span class="ru">выбрать</span></button></div>`;
    });
    h += `<div class="stat"><b>Grammatik-Forschung</b> · ${EJ.slots || 1} Platz<span class="ru">исследование = тема грамматики. Открывается пройденной главой (поле), идёт по реальному времени, монет не стоит. Эффект — в мире.</span></div>`;
    const a = v.gr.active;
    if (a) {
      const it = item(a.id) || { de: a.id, ru: '' }, len = Math.max(1, a.end - a.t0), pc = Math.round(100 * Math.min(1, (t - a.t0) / len));
      h += `<div class="sk work" data-ep-work="${a.id}"><div class="info"><div class="nm">${A(it.art, it.de)}<span class="ru">${it.ru} · идёт исследование</span></div><div class="tx">noch ${fmt(a.end - t)}<span class="ru">осталось · ${it.txt || ''}</span></div>
        <div class="cnd"><span class="bar" style="flex:1 1 auto"><i style="width:${pc}%;background:#2f6aa0"></i></span><span class="ct" style="flex:0 0 auto">${pc} %</span></div></div><button class="ui ui-btn" disabled>Läuft<span class="ru">идёт</span></button></div>`;
    }
    EJ.epochs.forEach(e => {
      const L = EJ.grammar.filter(it => it.epoch === e.id && !(a && a.id === it.id)); if (!L.length) return;
      h += `<div class="stat" style="margin:8px 0 2px">${e.id} · ${A('', e.de)}<span class="ru">${e.ru}</span></div>`;
      L.forEach(it => {
        const w = view(it), nm = A(it.art, it.de), fl = 'Kap. ' + (it.fields || [it.ch]).join(', ');
        if (w === 'done') { h += `<div class="sk done" data-gr-id="${it.id}"><div class="info"><div class="nm">${nm} ✓<span class="ru">${it.ru} · готово · ${fl}</span></div><div class="tx">${it.txt_de}<span class="ru">${it.txt}</span></div></div><button class="ui ui-btn" disabled>Fertig<span class="ru">готово</span></button></div>`; return; }
        if (w === 'fog') {
          const hi = it.hint || {}, later = epIdx(it.epoch) > epIdx(c.id), N = (it.need || []).map(item).filter(x => x && !isDone(x.id));
          const why = later ? 'эпоха ' + it.epoch : N.length ? 'сначала: ' + N.map(x => view(x) === 'fog' ? '???' : x.de).join(', ') : '';
          h += `<div class="sk fog" data-gr-id="${it.id}"><span class="sil"></span><div class="info"><div class="nm">???<span class="ru">пока в тумане${why ? ' · ' + why : ''}</span></div><div class="tx">${hi.de || '…'}${later ? ' · ab Epoche ' + it.epoch : ''}<span class="ru">${hi.ru || 'откроется дальше'}</span></div></div><button class="ui ui-btn" disabled>???<span class="ru">туман</span></button></div>`;
          return;
        }
        const ch = checks(it), ok = !a && ch.every(x => x.ok);
        h += `<div class="sk next" data-gr-id="${it.id}"><div class="info"><div class="nm">${nm}<span class="ru">${it.ru} · ${it.min} мин · ${fl}</span></div><div class="tx">${it.txt_de}<span class="ru">${it.txt}</span></div>${ch.map(C).join('')}</div>
          <button class="ui ui-btn" data-gr="${it.id}" ${ok ? '' : 'disabled'}>Forschen<span class="ru">${a ? 'слот занят' : it.min + ' мин'}</span></button></div>`;
      });
    });
    return h + `<div class="stat" style="margin-top:10px;border-top:3px solid #c9a877;padding-top:6px"><b>Werkstatt-Forschung</b><span class="ru">чертежи и улучшения (прежняя Forschung)</span></div></div>`;
  }
  let lastEl = null;
  (function hookRender() {
    if (!window.Research || !Research.render) return setTimeout(hookRender, 200);
    if (Research.render.__ep) return;
    const r0 = Research.render; const r = el => { r0(el); if (!el) return; lastEl = el; try { el.insertAdjacentHTML('afterbegin', html()); } catch (e) { console.warn('Epoch render', e); } };
    r.__ep = 1; Research.render = r;
  })();
  const rerender = () => { if (lastEl && lastEl.isConnected && document.getElementById('epForsch')) { const st = lastEl.scrollTop; Research.render(lastEl); lastEl.scrollTop = st; } };
  // Касания окон эпохи — целиком мимо Phaser (его слушатели на window): пары down+up глушатся на самих окнах (#epCard, #epOv), в фазе всплытия.
  // Д1: раньше здесь глушился только up на document (capture) -> touchstart доходил, touchend нет -> палец «залипал», следующие тапы = щипок.
  // Панель Rucksack (#skills, где блок #epForsch) теперь глушит пары сама (skills.js).
  const EVS = ['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove', 'touchcancel', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'wheel'];
  const shield = el => { if (el.__epShield) return; el.__epShield = 1; EVS.forEach(t => el.addEventListener(t, e => e.stopPropagation(), { passive: true })); };
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button[data-gr],button[data-ep-go],button[data-ep-pick]'); if (!b || b.disabled) return;
    e.stopPropagation();
    if (b.dataset.epPick) { const ep = EP(b.dataset.epPick); if (ep) card(null, ep, '', '', () => rerender()); return; }
    if (b.dataset.gr) { const r = start(b.dataset.gr); if (window.toast) toast(r.ok ? 'Die Forschung läuft!' : 'Noch nicht', 1400); rerender(); return; }
    if (b.dataset.epGo) {
      const sc = yard(); if (sc && !playing) { const cl = document.getElementById('skClose'); if (cl) cl.click(); setTimeout(() => play(sc), 300); }
      else if (window.toast) toast('Geh ins Dorf — dort ist das Fest.', 2000);
    }
  }, true);
  setInterval(() => {                                              // живой таймер грамматики (как у Research в skills.js) + завершение
    const fin = tick(); const p = document.getElementById('skills');
    if (p && p.style.display === 'flex' && (fin || load().gr.active)) rerender();
  }, 1000);

  // ---------- Neue Epoche: катсцена в деревне
  const COLS = [0x3a7be0, 0xe24848, 0x2f9a4f, 0xffd23f];
  const snap3 = x => Math.round(x / 3) * 3;
  const yard = () => { try { const s = window.game && game.scene.getScene('Yard'); return s && s.sys.isActive() && s.cache.json.get('town') ? s : null; } catch (e) { return null; } };
  function targets(sc) {
    const T = sc.cache.json.get('town') || {}, out = [];
    Object.entries(T.buildings || {}).forEach(([k, b]) => out.push({ key: k, box: b.box }));
    (T.plots || []).forEach(p => { try { if (window.plotStage && plotStage(p) === 3 && ['uhrturm', 'cafe', 'supermarkt'].includes(p.key)) out.push({ key: p.key, box: p.box }); } catch (e) {} });
    return out;
  }
  function pennants(sc, t) {                                       // гирлянда флажков над домом: верёвка с провисом, флажки 5 рядов по 3 px (пиксель ×3)
    if (sc.__epFlags && sc.__epFlags[t.key]) return sc.__epFlags[t.key];
    // рисуется один раз в текстуру (Graphics перерисовывал бы ~150 прямоугольников каждый кадр — замер FPS CPU 4x), на сцене — одна картинка
    const [x0, y0, x1] = t.box, a = snap3(x0 + 18), b = snap3(x1 - 18), y = snap3(y0 + 21), W = b - a + 3, H = 18 + 3 + 15 + 3, key = 'ep_flags_' + W;
    if (!sc.textures.exists(key)) {
      const g = sc.make.graphics({ x: 0, y: 0, add: false }), sag = x => snap3(Math.sin(Math.PI * x / Math.max(1, W - 3)) * 18);
      g.fillStyle(0x3b2314, 1); for (let x = 0; x < W; x += 3) g.fillRect(x, sag(x), 3, 3);
      const n = Math.max(3, Math.floor((W - 3) / 27));
      for (let i = 0; i < n; i++) {
        const cx = snap3((W - 3) * (i + 0.5) / n), yy = sag(cx) + 3; g.fillStyle(COLS[i % COLS.length], 1);
        [15, 12, 9, 6, 3].forEach((w, r) => g.fillRect(snap3(cx - w / 2), yy + r * 3, w, 3));
      }
      g.generateTexture(key, W, H); g.destroy();
    }
    const img = sc.add.image(a, y, key).setOrigin(0, 0).setDepth(5990); img.epFlag = t.key;
    (sc.__epFlags = sc.__epFlags || {})[t.key] = img; return img;
  }
  function decorate(sc) { if (epIdx(cur().id) < 1) return 0; targets(sc).forEach(t => pennants(sc, t)); return Object.keys(sc.__epFlags || {}).length; }
  function dust(sc, x, y) {                                        // пыльное облачко: 14 квадратиков 6 px, 4 кадра (Stepped)
    for (let k = 0; k < 14; k++) {
      const r = sc.add.rectangle(snap3(x + (Math.random() - 0.5) * 60), snap3(y + (Math.random() - 0.5) * 24), 6, 6, k % 3 ? 0xd9c7a0 : 0xb89b6a).setDepth(5995);
      const an = Math.random() * Math.PI * 2, d = 24 + Math.random() * 30;
      sc.tweens.add({ targets: r, x: snap3(r.x + Math.cos(an) * d), y: snap3(r.y + Math.sin(an) * d * 0.5 - 12), alpha: 0, scale: 2, duration: 480, ease: 'Stepped', easeParams: [4], onComplete: () => r.destroy() });
    }
  }
  const shot = () => new Promise(res => { try { game.renderer.snapshot(img => res(img && img.src || ''), 'image/jpeg', 0.7); } catch (e) { res(''); } });
  const center = t => [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2];
  const roof = t => [(t.box[0] + t.box[2]) / 2, t.box[1] + 90];       // кадр «vorher | nachher»: гирлянда в середине (миниатюра режет края)
  let playing = false, abort = null;
  function panTo(sc, x, y, ms) {
    return new Promise(res => {
      const cam = sc.cameras.main, m = cam.midPoint, x0 = m.x, y0 = m.y;
      if (!ms || less()) { window.camTo ? camTo(sc, x, y) : cam.centerOn(x, y); sc.camFocus = [x, y]; return res(); }
      sc.tweens.addCounter({ from: 0, to: 1, duration: ms, ease: 'Sine.easeInOut',
        onUpdate: tw => { const v = tw.getValue(), cx = snap3(x0 + (x - x0) * v), cy = snap3(y0 + (y - y0) * v); window.camTo ? camTo(sc, cx, cy) : cam.centerOn(cx, cy); },
        onComplete: () => { sc.camFocus = [x, y]; res(); } });
    });
  }
  const wait = (sc, ms) => new Promise(res => sc.time.delayedCall(ms, res));
  const css = document.createElement('style');
  css.textContent = `
    #epOv{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:auto;z-index:65;display:none}
    #epOv .ban{position:absolute;left:50%;top:70px;transform:translateX(-50%);padding:6px 16px;font-size:26px;font-weight:800;color:#2e1e12;text-align:center;white-space:nowrap}
    #epOv .ban small{display:block;font-size:13px;font-weight:400;color:#6b4a2e}
    #epOv #epSkip{position:absolute;right:12px;bottom:12px;height:48px;padding:0 14px;font-size:17px;color:#2e1e12;font-family:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}
    #epOv #epSkip .ru{font-size:11px;font-weight:400}
    #epCard{position:absolute;left:10px;right:10px;top:64px;bottom:10px;display:none;flex-direction:column;padding:10px 12px 12px;color:#2e1e12;z-index:70;overflow-y:auto}
    #epCard .ttl{font-size:24px;font-weight:800;line-height:1.1}
    #epCard .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e}
    #epCard .vs{display:flex;gap:8px;margin:8px 0}
    #epCard .vs figure{flex:1 1 50%;margin:0;text-align:center;font-size:14px;font-weight:700}
    #epCard .vs img{width:100%;height:120px;object-fit:cover;border:3px solid #3b2314;image-rendering:pixelated;display:block;background:#5f8c46}
    #epCard ul{margin:4px 0 6px 18px;padding:0;font-size:15px;line-height:1.3}
    #epCard .pick{font-size:17px;font-weight:700;margin-top:4px}
    #epCard .bon{display:flex;flex-direction:column;gap:6px;margin-top:6px}
    #epCard .bon .ui-btn{height:auto;min-height:64px;padding:6px 10px;text-align:left;display:block;color:#2e1e12;font-family:inherit;font-size:18px;line-height:1.15;width:100%}
    #epCard .bon .ui-btn .tx{display:block;font-size:14px;font-weight:600;margin-top:2px}
    #epForsch .sk .ui-btn{height:auto;min-height:56px;padding:4px 3px;font-size:15px;line-height:1.1;white-space:normal;overflow-wrap:anywhere}
    #epForsch .sk .ui-btn .ru{font-size:11px;line-height:1.1}`;   /* Д6: «Noch nicht / пока нет», «Forschen / 10 мин» целиком в кнопке на 360 и 412 */
  document.head.appendChild(css);
  const ui = () => document.getElementById('ui');
  function overlay(ep) {
    let o = document.getElementById('epOv');
    if (!o) { o = document.createElement('div'); o.id = 'epOv'; ui().appendChild(o); shield(o); }
    o.innerHTML = `<div class="ui ui-panel-paper ban">Neue Epoche!<small>новая эпоха: ${ep.ru}</small></div><button class="ui ui-btn" id="epSkip">Überspringen<span class="ru">пропустить</span></button>`;
    o.style.display = 'block'; o.querySelector('#epSkip').onclick = () => { if (abort) abort(); };
    return o;
  }
  async function play(sc, force) {
    await ready; sc = sc || yard(); if (!sc || playing) return false;
    const ep = force ? (EP(force) || next()) : pending(); if (!ep) return false;
    playing = true; sc.busy = true; const prevFocus = sc.camFocus, o = overlay(ep), T = targets(sc);
    const hide = ['bag', 'bFurn', 'bMap', 'cbHero', 'bMentor']; const was = {}; hide.forEach(k => { const e = document.getElementById(k); if (e) { was[k] = e.style.display; e.style.display = 'none'; } });
    let skipped = false; abort = () => { skipped = true; };
    const main = T.find(t => t.key === 'gildenhaus') || T[0];
    let before = '', after = '';
    try {
      if (main) { await panTo(sc, ...roof(main), 0); await wait(sc, 120); before = await shot(); }
      const v = load(); v.seen[ep.id] = Date.now(); save(v);              // эпоха открыта (флажки = cur() >= A2); бонус — выбор в карточке
      if (!less()) {
        for (const t of T) {
          if (skipped) break;
          await panTo(sc, ...center(t), 650); if (skipped) break;
          const [cx] = center(t); dust(sc, cx, t.box[1] + 30); pennants(sc, t); if (window.speakDE && t === main) speakDE('Neue Epoche!');
          await wait(sc, 420);
        }
      }
      decorate(sc);
      if (main) { await panTo(sc, ...roof(main), skipped || less() ? 0 : 500); await wait(sc, 150); after = await shot(); }
    } catch (e) { console.warn('Epoch play', e); decorate(sc); }
    abort = null; o.style.display = 'none';
    card(sc, ep, before, after, () => {
      hide.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; });
      sc.camFocus = prevFocus || null; const w = sc.walker; if (w && window.camTo) camTo(sc, w.x, w.y - 60);
      sc.busy = false; playing = false; fire('epoch', ep.id);
    });
    return true;
  }
  function card(sc, ep, before, after, done) {
    let c = document.getElementById('epCard');
    if (!c) { c = document.createElement('div'); c.id = 'epCard'; c.className = 'ui ui-panel-paper'; ui().appendChild(c); shield(c); }
    const B = ep.bonus || [], AH = (a, w) => (a ? `<b style="color:${{ der: '#3a7be0', die: '#e24848', das: '#2f9a4f' }[a]}">${a}</b> ` : '') + w;
    c.innerHTML = `<div class="ttl">Neue Epoche: ${ep.de}<span class="ru">новая эпоха: ${ep.ru} (${ep.id}) — открыта навсегда</span></div>
      ${before && after ? `<div class="vs"><figure><img id="epBefore" src="${before}" alt="">vorher<span class="ru">было</span></figure><figure><img id="epAfter" src="${after}" alt="">nachher<span class="ru">стало</span></figure></div>` : ''}
      <div class="pick" style="margin-top:2px">Was ist neu?<span class="ru">что нового</span></div>
      <ul>${(ep.news || []).map(n => `<li>${n.de}<span class="ru">${n.ru}</span></li>`).join('')}</ul>
      <div class="pick">Wähle einen Bonus: 1 aus 3<span class="ru">выбери бонус — один; учебные темы открываются все</span></div>
      <div class="bon">${B.map(b => `<button class="ui ui-btn" data-ep-bonus="${b.id}">${AH(b.art, b.de)} <span class="ru" style="display:inline">${b.ru} · ${b.theme}</span><span class="tx">${b.txt_de} · ${b.theme_de}<span class="ru">${b.txt}</span></span></button>`).join('')}</div>`;
    c.style.display = 'flex';
    c.querySelectorAll('[data-ep-bonus]').forEach(btn => { btn.onclick = () => {
      choose(ep.id, btn.dataset.epBonus); const b = B.find(x => x.id === btn.dataset.epBonus);
      c.style.display = 'none'; if (window.toast && b) toast('Bonus: ' + (b.art ? b.art + ' ' : '') + b.de, 2200); done();
    }; });
    if (!B.length) { const k = document.createElement('button'); k.className = 'ui ui-btn'; k.textContent = 'Weiter'; k.onclick = () => { c.style.display = 'none'; done(); }; c.appendChild(k); }
  }
  function choose(eid, bid) { const e = EP(eid); if (!e || !(e.bonus || []).some(b => b.id === bid)) return false; const v = load(); if (!v.seen[eid]) v.seen[eid] = Date.now(); v.bonus[eid] = bid; save(v); fire('bonus', eid + ':' + bid); return true; }
  function onYard(sc) {
    ready.then(() => {
      tick(); const go = () => { if (!sc.sys.isActive()) return; decorate(sc); if (!playing && pending()) sc.time.delayedCall(1400, () => { if (sc.sys.isActive() && !sc.busy && document.getElementById('dlg').style.display !== 'block') play(sc); }); };
      sc.time.delayedCall(300, go);
    });
    sc.events.once('shutdown', () => { sc.__epFlags = null; });
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 60);
    const y = g.scene.getScene('Yard'); if (!y) return setTimeout(hook, 60);
    y.events.on('create', () => onYard(y)); if (y.sys.isActive()) onYard(y);
  })();
  function stats() { const sc = yard(); return { cur: cur().id, next: (next() || {}).id || null, pending: (pending() || {}).id || null, playing, flags: sc ? Object.keys(sc.__epFlags || {}).length : 0, reach: reach(), restored: restored(), words: words(), state: load() }; }
  window.Epoch = { on: true, ready, cur, next, gate, items: () => EJ.grammar, item, view: id => { const it = item(id); return it ? view(it) : null; }, checks, start, tick, fx, choose, play, stats, html,
    _play: (id) => play(yard(), id || true), _finishNow() { const v = load(); if (v.gr.active) { v.gr.active.end = now() - 1; save(v); } return tick(); }, _reset() { localStorage.removeItem(KEY); ST = null; FX = {}; } };
})();
