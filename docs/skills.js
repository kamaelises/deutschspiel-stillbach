// Rucksack → Held & Talente: три боевые ветки (design-doc/rpg-design.md, разделы 4–5) + ветки мирной жизни (assets_v3/world/skills.json) и die Forschung (research.js).
// Очки навыков — ТОЛЬКО за учёбу: 1 за пройденный урок, +3 за закрытую главу, +2 за побеждённого босса. Опыт боя даёт уровень героя, не навыки.
// Полуоткрытое дерево («туман», 24.11): видно изученное и следующую ступень с условиями (DE + RU мелко, полоска прогресса); дальше — силуэт «???» с намёком.
// Мирная ветка целиком в тумане, пока не выполнено её условие open (первый урожай, первая рыба, 4 урока, первое probieren, первый разговор).
// Условия (AND): очки, уроки/главы (ds_proto.app), слова «твёрдо» (FSRS приложения: IndexedDB deutschspiel/cards, state 2 и stability ≥ 21 — как app/src/core/world.js;
// игра только читает, пустую базу не создаёт), улов/виды (ds:catch + альбом), урожай (ds:harvest), probieren (garden2.tasted), праздник посещён (WorldTime.festivals),
// задания (ds_proto.quests.done), разговоры (Quests.talk), реставрация (Restore.info(id).st === 'done': schild/beet/brunnen/uhrturm), босс, исследование, возраст Max (A1/A2/B1).
// Счётчики мирной жизни — localStorage ds_proto.lifeStats {harvest, fish, sp{}, talk, npc{}, fest{}}.
// API (старое сохранено): Skills.BRANCHES, lvl(id), points(), earned(), learn(id), canLearn(s), open(), close();
//      новое: fx(key) — сумма эффектов навыков (fx × уровень) и исследований (Research.fx), cond(c) -> {ok, cur, need, de, ru}, stage(), stageOk(st),
//      view(s) -> learned|next|fog, branchOpen(b), ready (Promise skills.json), firm(ch?) (кэш FSRS), loadFirm(), stats(). Событие: window 'ds:skill' {id, lv}.
//      Ключи fx: garden.speed/double/fruehbeet, fish.wait/rare/info, restore.speed/variants, cook.taste, quest.reward (читают garden/fishing/restore/quests).
// Тест-хук: localStorage ds_proto.condTest = {firm:{all, 6: n}, lessons, chapter, harvest, fish, species, tasted, festival, quests, talk, npcs, boss, restore:{id:true}, stage:'A2'}.
(function () {
  const KEY = 'ds_proto.skills', LS = 'ds_proto.lifeStats', COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' };
  const STAGES = ['A1', 'A2', 'B1'], STAGE_TXT = { A1: ['das Kind', 'ребёнок'], A2: ['der Jugendliche', 'подросток'], B1: ['der Erwachsene', 'взрослый'] };
  const BRANCHES = [
    { id: 'wort', de: 'Wortmagier', ru: 'маг слов', col: '#3f6fb5', hint: 'урон заклинаний, растёт от выученных слов', skills: [
      { id: 'funke', de: 'Funke', ru: 'Искра', max: 3, cost: 1, txt: 'Удар стихией сильнее на 10 % за уровень.' },
      { id: 'artikelblick', de: 'Artikelblick', ru: 'Взгляд артикля', max: 1, cost: 2, need: 'funke', txt: 'Раз в бой показывает цвет артикля на 3 секунды.' },
      { id: 'kette', de: 'Kettenzauber', ru: 'Цепь', max: 2, cost: 2, need: 'funke', txt: 'Верный артикль задевает ещё одного врага.' },
      { id: 'explosion', de: 'Wortschatz-Explosion', ru: 'Взрыв словаря', max: 1, cost: 3, need: 'kette', txt: 'Урон по всем: чем больше слов темы выучено, тем сильнее.' },
      { id: 'zeitwort', de: 'Zeitwort-Stopp', ru: 'Стоп глагола', max: 1, cost: 3, need: 'artikelblick', txt: 'Назови глагол — враги пропускают ход.' },
      { id: 'krit', de: 'Seltenes Wort', ru: 'Редкое слово', max: 2, cost: 2, need: 'explosion', txt: 'Шанс крита за слова, которые ты учил дольше недели.' }] },
    { id: 'gram', de: 'Grammatikritter', ru: 'рыцарь грамматики', col: '#b5523f', hint: 'броня и комбо, растёт от грамматики', skills: [
      { id: 'schild', de: 'Schild der Fälle', ru: 'Щит падежей', max: 3, cost: 1, txt: 'Броня +1 за уровень.' },
      { id: 'konter', de: 'Konter', ru: 'Контратака', max: 2, cost: 2, need: 'schild', txt: 'После верного ответа — ответный удар врагу.' },
      { id: 'kombo', de: 'Kombo-Meister', ru: 'Мастер комбо', max: 2, cost: 2, need: 'schild', txt: 'Комбо со 2-го верного артикля, а не с 3-го.' },
      { id: 'wall', de: 'Satzbau-Wall', ru: 'Стена из слов', max: 1, cost: 3, need: 'konter', txt: 'Собери фразу — блокируешь следующий удар.' },
      { id: 'perfekt', de: 'Perfekt-Rüstung', ru: 'Броня Perfekt', max: 2, cost: 2, need: 'kombo', txt: 'Броня растёт с каждой верной формой Perfekt.' },
      { id: 'zorn', de: 'Grammatik-Zorn', ru: 'Ярость грамматики', max: 1, cost: 3, need: 'wall', txt: 'Босс-грамматика получает двойной урон.' }] },
    { id: 'sprech', de: 'Sprechbarde', ru: 'бард речи', col: '#4f8f3f', hint: 'лечение и речь, растёт от микрофона', skills: [
      { id: 'heilwort', de: 'Heilwort', ru: 'Целебное слово', max: 3, cost: 1, txt: 'Скажи фразу — лечишь 15 % здоровья за уровень.' },
      { id: 'echo', de: 'Echo-Schrei', ru: 'Крик эха', max: 2, cost: 2, need: 'heilwort', txt: 'Слово в микрофон оглушает всех врагов рядом.' },
      { id: 'ueberreden', de: 'Überreden', ru: 'Уговорить', max: 1, cost: 2, need: 'heilwort', txt: 'Вежливая просьба — слабый враг уходит без боя.' },
      { id: 'flucht', de: 'Flucht', ru: 'Бегство', max: 1, cost: 1, txt: 'Сбежать из боя: 85 % вместо 60 %.' },
      { id: 'haendler', de: 'Händlerlied', ru: 'Песня торговца', max: 2, cost: 2, need: 'ueberreden', txt: 'Скидка 10 % за уровень в лавках деревни.' },
      { id: 'chor', de: 'Chor der Wörter', ru: 'Хор слов', max: 1, cost: 3, need: 'echo', txt: 'Три верно сказанных слова подряд — урон ×3.' },
      { id: 'aussprache', de: 'Klare Aussprache', ru: 'Чистое произношение', max: 2, cost: 2, need: 'chor', txt: 'Микрофон прощает больше ошибок произношения.' }] },
  ];
  BRANCHES.forEach(b => (b.group = 'kampf'));
  const ALL = {}; const index = () => BRANCHES.forEach(b => b.skills.forEach(s => { s.branch = b.id; ALL[s.id] = s; }));
  index();
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const load = () => { const v = ld(KEY, null) || {}; v.lv = v.lv || {}; v.cost = v.cost || {}; return v; };
  const save = v => sv(KEY, v);
  const app = () => ld('ds_proto.app', {}) || {};
  function earned() {
    const ch = app().chapters || []; let p = 0;
    ch.forEach(c => { p += c.done || 0; if (c.total && c.done >= c.total) p += 3; });
    p += 2 * (ld('ds_proto.bosses', []) || []).length;
    return p;
  }
  // цена изученного: из описания навыка; если skills.json ещё не загружен — из записи при изучении (cost[id]), иначе 1
  const spent = st => Object.entries(st.lv).reduce((a, [id, l]) => a + (ALL[id] ? ALL[id].cost : +st.cost[id] || 1) * l, 0);
  const points = () => earned() - spent(load());
  const lvl = id => load().lv[id] || 0;
  const BY = id => BRANCHES.find(b => b.id === id);

  // ---------- skills.json: мирные ветки + доп. условия/намёки для боевых узлов
  let SJ = null;
  const ready = fetch('assets_v3/world/skills.json').then(r => r.json()).then(j => {
    SJ = j;
    (j.branches || []).forEach(b => { if (BY(b.id)) return; b.group = 'leben'; b.skills.forEach(s => { s.req = s.req || []; }); BRANCHES.push(b); });
    index();
    Object.entries(j.combat_req || {}).forEach(([id, r]) => { if (ALL[id]) ALL[id].req = r; });
    Object.entries(j.combat_hint || {}).forEach(([id, h]) => { if (ALL[id]) ALL[id].hint = h; });
    if (p.style.display === 'flex') render();
    return j;
  }).catch(e => { console.warn('Skills json', e); return null; });

  // ---------- счётчики мирной жизни
  const test = () => ld('ds_proto.condTest', null) || {};
  const life = () => { const v = ld(LS, null) || {}; v.harvest = +v.harvest || 0; v.fish = +v.fish || 0; v.sp = v.sp || {}; v.talk = +v.talk || 0; v.npc = v.npc || {}; v.fest = v.fest || {}; return v; };
  const bump = f => { const v = life(); f(v); sv(LS, v); };
  addEventListener('ds:harvest', e => bump(v => { v.harvest += (e.detail && +e.detail.n) || 1; }));
  addEventListener('ds:catch', e => bump(v => { v.fish++; const id = e.detail && e.detail.id; if (id) v.sp[id] = (v.sp[id] || 0) + 1; }));
  function festSeen() {                                              // праздник «посещён» = игра открыта в день праздника (WorldTime)
    try { const w = window.WorldTime && WorldTime.now && WorldTime.now(), fs = (w && w.festivals) || []; if (fs.length && fs.some(id => !life().fest[id])) bump(v => fs.forEach(id => { v.fest[id] = v.fest[id] || Date.now(); })); } catch (e) {}
  }
  function wrapTalk() {                                              // разговор с жителем: board.js зовёт Quests.talk(npc)
    const Q = window.Quests; if (!Q || typeof Q.talk !== 'function' || Q.talk.__sk) return;
    const orig = Q.talk; Q.talk = function (npc) { bump(v => { v.talk++; if (npc && npc !== 'any') v.npc[npc] = (v.npc[npc] || 0) + 1; }); return orig.apply(this, arguments); }; Q.talk.__sk = true;
  }
  function albumCounts() {                                           // старые сохранения: улов и урожай до счётчиков — из альбома
    const it = (ld('ds_proto.album', {}) || {}).items || {}, CR = window.Garden && Garden.CROPS; let fish = 0, sp = 0, crop = 0;
    Object.keys(it).forEach(k => { let sec = it[k].sec; try { if (!sec && window.Album && Album.item) { const m = Album.item(k); sec = m && m.sec; } } catch (e) {}
      const n = +it[k].n || 1, isCrop = CR ? (Array.isArray(CR) ? CR.includes(k) : k in CR) : false;
      if (sec === 'fische') { fish += n; sp++; } else if (isCrop) crop += n; });
    return { fish, sp, crop };
  }
  function stats() {
    const t = test(), L = life(), A = albumCounts(), ch = app().chapters || [], q = ld('ds_proto.quests', {}) || {}, g = ld('ds_proto.garden2', {}) || {};
    const o = { lessons: ch.reduce((s, c) => s + (+c.done || 0), 0), chapter: ch.filter(c => c.total && c.done >= c.total).length,
      harvest: Math.max(L.harvest, A.crop), fish: Math.max(L.fish, A.fish), species: Math.max(Object.keys(L.sp).length, A.sp),
      tasted: Object.keys(g.tasted || {}).length, festival: Object.keys(L.fest).length, quests: (q.done || []).length,
      talk: L.talk, npcs: Object.keys(L.npc).length, boss: (ld('ds_proto.bosses', []) || []).length };
    Object.keys(o).forEach(k => { if (typeof t[k] === 'number') o[k] = t[k]; });
    return o;
  }
  // ---------- слова «твёрдо» из FSRS приложения (только чтение; базы нет — не создаём)
  let FIRM = { all: 0, ch: {}, at: 0 };
  function loadFirm() {
    return new Promise(res => {
      try {
        if (!window.indexedDB) return res(FIRM);
        const rq = indexedDB.open('deutschspiel');
        rq.onupgradeneeded = e => { try { e.target.transaction.abort(); } catch (x) {} };
        rq.onerror = () => res(FIRM); rq.onblocked = () => res(FIRM);
        rq.onsuccess = () => {
          const db = rq.result;
          try {
            if (!db.objectStoreNames.contains('cards')) { db.close(); return res(FIRM); }
            const g = db.transaction('cards', 'readonly').objectStore('cards').getAll();
            g.onsuccess = () => { const f = { all: 0, ch: {}, at: Date.now() };
              (g.result || []).forEach(c => { const s = c && c.fsrs; if (!s || s.state !== 2 || (+s.stability || 0) < 21) return; f.all++; const m = /^ch0*(\d+)/.exec(String(c.id || '')); if (m) f.ch[m[1]] = (f.ch[m[1]] || 0) + 1; });
              FIRM = f; db.close(); res(f); };
            g.onerror = () => { db.close(); res(FIRM); };
          } catch (e) { try { db.close(); } catch (x) {} res(FIRM); }
        };
      } catch (e) { res(FIRM); }
    });
  }
  function firm(ch) { const t = test().firm; if (t && typeof t === 'object') return ch ? +(t[ch] || 0) : +(t.all || 0); return ch ? FIRM.ch[String(+ch)] || 0 : FIRM.all; }

  // ---------- условия и туман
  function stage() { const t = test().stage; if (STAGES.includes(t)) return t; if (window.Eco && Eco.level) return Eco.level(); const a = typeof window.maxAge === 'function' ? window.maxAge() : 'kid'; return a === 'adult' ? 'B1' : a === 'teen' ? 'A2' : 'A1'; }
  const stageOk = st => !st || STAGES.indexOf(st) <= STAGES.indexOf(stage());
  const CT = { lessons: ['Lektionen', 'уроков пройдено'], chapter: ['Kapitel fertig', 'глав закрыто'], harvest: ['Ernte', 'урожай собран'],
    fish: ['Fische gefangen', 'рыб поймано'], species: ['Fischarten', 'разных видов рыб'], tasted: ['probiert', 'урожай попробован (probieren)'],
    festival: ['ein Fest besucht', 'праздник посещён'], quests: ['Aufgaben erledigt', 'заданий выполнено'], talk: ['Gespräche', 'разговоров с жителями'],
    npcs: ['Nachbarn', 'разных жителей'], boss: ['Boss besiegt', 'босс побеждён'] };
  function cond(c) {
    if (!c || !c.t) return { ok: true, cur: 1, need: 1, de: '', ru: '' };
    if (c.t === 'firm') { const cur = firm(c.ch), need = c.n || 1; return { ok: cur >= need, cur, need, de: 'Wörter sicher' + (c.ch ? ' · Kap. ' + c.ch : ''), ru: 'слов выучено «твёрдо»' + (c.ch ? ' в главе ' + c.ch : '') }; }
    if (c.t === 'restore') {
      let ok = !!(test().restore || {})[c.id], de = c.id, ru = 'реставрация: ' + c.id;
      try { if (!ok && window.Restore && Restore.info) { const i = Restore.info(c.id); ok = !!i && i.st === 'done'; } } catch (e) {}
      if (!ok) { const r = ld('ds_proto.restore', {}) || {}; ok = !!(r.t && r.t[c.id] && r.t[c.id].st === 'done'); }
      try { const T = window.Restore && Restore.tasks && (Restore.tasks() || []).find(x => x.id === c.id); if (T) { de = T.de + ' — fertig'; ru = 'реставрация: ' + T.ru; } } catch (e) {}
      return { ok, cur: ok ? 1 : 0, need: 1, de, ru };
    }
    if (c.t === 'research') { const ok = !!(window.Research && Research.done(c.id)), it = window.Research && Research.item(c.id); return { ok, cur: ok ? 1 : 0, need: 1, de: 'Forschung: ' + (it ? it.de : c.id), ru: 'исследование: ' + (it ? it.ru : c.id) }; }
    if (c.t === 'skill') { const ok = lvl(c.id) > 0, s = ALL[c.id]; return { ok, cur: ok ? 1 : 0, need: 1, de: 'Talent: ' + (s ? s.de : c.id), ru: 'навык: ' + (s ? s.ru : c.id) }; }
    const cur = +stats()[c.t] || 0, need = c.n || 1, L = CT[c.t] || [c.t, c.t];
    return { ok: cur >= need, cur, need, de: L[0], ru: L[1] };
  }
  const needOk = s => !s.need || lvl(s.need) > 0;
  const reqOk = s => (s.req || []).every(c => cond(c).ok);
  const branchOpen = b => !b || !b.open || b.open.every(c => cond(c).ok) || b.skills.some(s => lvl(s.id) > 0);
  function view(s) { if (lvl(s.id) > 0) return 'learned'; if (!branchOpen(BY(s.branch))) return 'fog'; return needOk(s) && stageOk(s.stage) ? 'next' : 'fog'; }
  function canLearn(s) { const st = load(); return (st.lv[s.id] || 0) < s.max && points() >= s.cost && needOk(s) && stageOk(s.stage) && branchOpen(BY(s.branch)) && reqOk(s); }
  function learn(id) {
    const s = ALL[id]; if (!s || !canLearn(s)) return false;
    const st = load(); st.lv[id] = (st.lv[id] || 0) + 1; st.cost[id] = s.cost; save(st);
    try { dispatchEvent(new CustomEvent('ds:skill', { detail: { id, lv: st.lv[id] } })); } catch (e) {}
    return true;
  }
  function fx(k) {                                                   // эффект = Σ fx[k] × уровень навыка + исследования
    const lv = load().lv; let v = 0;
    Object.keys(lv).forEach(id => { const s = ALL[id]; if (s && s.fx && typeof s.fx[k] === 'number') v += s.fx[k] * lv[id]; });
    try { if (window.Research && Research.fx) v += +Research.fx(k) || 0; } catch (e) {}
    return v;
  }
  window.Skills = { BRANCHES, lvl, points, earned, learn, canLearn, fx, cond, stage, stageOk, view, branchOpen, ready, firm, loadFirm, stats, life, COL, STAGE_TXT, json: () => SJ };
  loadFirm();

  // ---------- panel (in #ui, scaled with the rest of the interface; German big, Russian small below)
  const css = document.createElement('style');
  css.textContent = `
    #skills{position:absolute;left:10px;right:10px;top:64px;bottom:12px;display:none;flex-direction:column;padding:10px 12px 12px;color:#2e1e12;z-index:60}
    #skills .top{display:flex;align-items:center;justify-content:space-between;gap:8px}
    #skills .ttl{font-size:24px;font-weight:700;line-height:1.05}
    #skills .ttl small,#skills .ru{display:block;font-size:13px;font-weight:400;color:#6b4a2e}
    #skills .stat{font-size:15px;margin:6px 0 4px;line-height:1.3}
    #skills .tabs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
    #skills .tabs .ui-btn{flex:1 1 30%;min-width:0;height:auto;min-height:52px;padding:4px 2px;font-size:14px;overflow-wrap:anywhere;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2e1e12;font-family:inherit}
    #skills .tabs.grp{margin:4px 0 0}
    #skills .tabs.grp .ui-btn{flex:1 1 18%;min-height:44px;font-size:12px;font-weight:700;overflow-wrap:normal;word-break:keep-all;padding:4px 1px}
    #skills .tabs.grp .ui-btn .ru{font-size:10px;font-weight:400}
    #skills .tabs .ui-btn.on{outline:3px solid #ffd23f;outline-offset:-3px}
    #skills .tabs .ui-btn.fogt{color:#7d6b52}
    #skills .list{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:2px}
    #skills .sk{display:flex;gap:10px;align-items:center;border-bottom:2px dashed #c9a877;padding:8px 2px}
    #skills .sk .info{flex:1 1 auto;min-width:0}
    #skills .sk .nm{font-size:19px;font-weight:700;line-height:1.1}
    #skills .sk .tx{font-size:14px;line-height:1.25;margin-top:2px}
    #skills .sk .dots{font-size:16px;letter-spacing:2px;margin-top:2px}
    #skills .sk .ui-btn{flex:0 0 auto;width:96px;height:56px;padding:2px 4px;font-size:17px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2e1e12;font-family:inherit}
    #skills .sk .ui-btn[disabled]{opacity:.45;filter:grayscale(.6)}
    #skills .sk.locked .nm,#skills .sk.locked .tx{opacity:.55}
    #skills .sk.fog .nm{color:#7d6b52;letter-spacing:2px}
    #skills .sk.fog .tx{font-style:italic;color:#5e4a36}
    #skills .sil{flex:0 0 30px;height:30px;border-radius:50%;background:#5e4a36;opacity:.25;filter:blur(1px)}
    #skills .cnd{display:flex;align-items:center;gap:6px;font-size:14px;line-height:1.2;margin-top:4px}
    #skills .cnd .ok{flex:0 0 16px;font-weight:700;color:#2f7a2f}
    #skills .cnd .no{flex:0 0 16px;color:#9b6b3a}
    #skills .cnd .bar{flex:0 0 54px;height:8px;border-radius:4px;background:#e3cfa6;overflow:hidden;box-shadow:inset 0 0 0 1px #c9a877}
    #skills .cnd .bar i{display:block;height:100%;background:#6f9f3a}
    #skills .cnd .ct{flex:1 1 auto;min-width:0}
    #skills .cnd .ct .ru{display:inline;margin-left:4px;font-size:12px}
    #skills .close{width:110px;height:52px;font-size:18px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2e1e12;font-family:inherit;padding:2px 6px}`;
  document.head.appendChild(css);
  const p = document.createElement('div'); p.id = 'skills'; p.className = 'ui ui-panel-paper';
  // 25.11 Epoch-1 (CHECK_epoch_markt_2511 Д1/Д3): касание панели — целиком мимо Phaser (его слушатели на window): пары down+up глушатся на самой панели,
  // иначе тап по вкладке/«Zurück» над домом уводил Max в Elternhaus, а половинка пары (down без up) оставляла палец «нажатым» -> следующие тапы = щипок.
  const SHIELD = ['mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove', 'touchcancel', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'wheel'];
  const shield = el => SHIELD.forEach(t => el.addEventListener(t, e => e.stopPropagation(), { passive: true }));
  shield(p);
  p.innerHTML = `<div class="top"><div class="ttl">Held &amp; Talente<small>герой и навыки</small></div><button class="ui ui-btn close" id="skClose">Zurück<span class="ru">назад</span></button></div>
    <div class="stat" id="skStat"></div><div class="tabs grp" id="skGrp"></div><div class="tabs" id="skTabs"></div><div class="list" id="skList"></div>`;
  let group = 'kampf', tab = 'wort';
  const SPECIAL = ['forsch', 'inv', 'album'];
  const artHTML = (art, w) => (art ? `<b style="color:${COL[art]}">${art}</b> ${w}` : w);
  function condHTML(r) {
    const pc = Math.round(100 * Math.min(1, r.need ? r.cur / r.need : 1));
    return `<div class="cnd"><span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '○'}</span><span class="bar"><i style="width:${pc}%"></i></span><span class="ct">${r.de} ${Math.min(r.cur, r.need)}/${r.need}<span class="ru">${r.ru}</span></span></div>`;
  }
  window.Skills.condHTML = condHTML; window.Skills.artHTML = artHTML;
  function fogHTML(s) {                                              // силуэт: имя скрыто, только намёк; ступень по возрасту — «когда Макс подрастёт»
    const h = s.hint || {}, grow = s.stage && !stageOk(s.stage), st = STAGE_TXT[s.stage] || ['', ''], said = /größer/.test(h.de || '');
    const N = s.need && !lvl(s.need) && ALL[s.need], pre = N ? ` · сначала: ${view(N) === 'fog' ? '???' : N.ru}` : '';   // имя предыдущего узла — только если он сам не в тумане
    return `<div class="sk fog"><span class="sil"></span><div class="info"><div class="nm">???<span class="ru">пока в тумане${pre}</span></div>
      <div class="tx">${h.de || '…'}${grow && !said ? ` · wenn Max größer ist (${s.stage})` : ''}<span class="ru">${h.ru || 'откроется дальше'}${grow && !/подраст/.test(h.ru || '') ? ` · когда Макс подрастёт: ${st[1]}` : ''}</span></div></div>
      <button class="ui ui-btn" data-s="${s.id}" disabled>???<span class="ru">туман</span></button></div>`;
  }
  function skillHTML(s, b) {
    const v = view(s); if (v === 'fog') return fogHTML(s);
    const l = lvl(s.id), full = l >= s.max, ok = canLearn(s), dots = '●'.repeat(l) + '○'.repeat(s.max - l);
    const conds = full ? '' : (s.req || []).map(c => condHTML(cond(c))).join('');
    const label = full ? 'Max<span class="ru">максимум</span>' : `Lernen<span class="ru">выучить · ${s.cost}</span>`;
    const tx = s.txt_de ? `${s.txt_de}<span class="ru">${s.txt}</span>` : s.txt;
    return `<div class="sk ${v}"><div class="info"><div class="nm">${artHTML(s.art, s.de)}<span class="ru">${s.ru}</span></div><div class="tx">${tx}</div><div class="dots" style="color:${b.col}">${dots}</div>${conds}</div>
      <button class="ui ui-btn" data-s="${s.id}" ${ok ? '' : 'disabled'}>${label}</button></div>`;
  }
  function render() {
    const st = (typeof state !== 'undefined' ? state : window.state) || {}, lv = st.level || 1, xp = st.xp || 0, age = STAGE_TXT[stage()] || STAGE_TXT.A1;
    p.querySelector('#skStat').innerHTML = `Stufe <b>${lv}</b> · Erfahrung ${xp} · <b>Punkte: ${points()}</b> · Max: ${age[0]}<span class="ru">уровень героя растёт от боёв · очки навыков — от уроков (1 за урок, +3 за главу, +2 за босса) · Макс сейчас ${age[1]} (${stage()})</span>`;
    const G = [{ g: 'kampf', de: 'Kampf', ru: 'бой', col: '#b5523f' }, { g: 'leben', de: 'Leben', ru: 'мирная жизнь', col: '#5a8f2e' }]
      .concat(window.Research ? [{ b: 'forsch', de: 'Forschung', ru: 'исследования', col: '#6a4fa0' }] : [], window.Loot ? [{ b: 'inv', de: 'Beutel', ru: 'сумка', col: '#8a6a2e' }] : [], window.Album ? [{ b: 'album', de: 'Album', ru: 'альбом', col: '#b0701a' }] : []);
    const special = SPECIAL.includes(tab);
    p.querySelector('#skGrp').innerHTML = G.map(x => { const on = x.b ? x.b === tab : !special && x.g === group;
      return `<button class="ui ui-btn${on ? ' on' : ''}" ${x.b ? `data-b="${x.b}"` : `data-g="${x.g}"`} style="border-bottom:4px solid ${x.col}">${x.de}<span class="ru">${x.ru}</span></button>`; }).join('');
    const tabs = p.querySelector('#skTabs'), list = p.querySelector('#skList');
    tabs.style.display = special ? 'none' : 'flex';
    if (!special) tabs.innerHTML = BRANCHES.filter(b => b.group === group).map(b => { const o = branchOpen(b);
      return `<button class="ui ui-btn${b.id === tab ? ' on' : ''}${o ? '' : ' fogt'}" data-b="${b.id}" style="border-bottom:4px solid ${o ? b.col : '#9c8a70'}"><span>${o ? artHTML(b.art, b.de) : '???'}</span><span class="ru">${o ? b.ru : 'в тумане'}</span></button>`; }).join('');
    if (tab === 'forsch' && window.Research) { Research.render(list); return; }     // die Forschung (research.js): таймер, монеты + материалы + слова
    if (tab === 'album' && window.Album) { Album.render(list); return; }   // альбом находок (album.js): 8 разделов, редкость, бестиарий
    if (tab === 'inv') {                                             // the bag: what chests gave (potions, materials for the village, word cards)
      const v = Loot.inv(), row = (de, ru, n, k) => `<div class="sk"><img class="ico" src="${Loot.ICON(k)}" alt=""><div class="info"><div class="nm">${de}<span class="ru">${ru}</span></div></div><div class="nm" style="min-width:56px;text-align:right">× ${n}</div></div>`;
      const pots = Object.entries(Loot.POTS).map(([k, [de, ru]]) => row(de, ru, v.potions[k] || 0, k)).join('');
      const mats = Object.entries(Loot.MATS).map(([k, [de, ru]]) => row(de, ru, v.mats[k] || 0, k)).join('');
      const cards = v.cards.length ? v.cards.slice(-12).reverse().map(c => `<span style="display:inline-block;margin:3px 6px 3px 0;padding:2px 8px;border:2px solid #c9a877;border-radius:6px;font-size:16px">${c}</span>`).join('') : '<span class="ru">пока пусто — открывай сундуки</span>';
      list.innerHTML = `<div class="stat" style="margin-top:0"><b>Tränke</b><span class="ru">зелья</span></div>${pots}<div class="stat"><b>Baumaterial</b><span class="ru">материалы для зданий деревни</span></div>${mats}<div class="stat" style="display:flex;align-items:center;gap:8px"><img class="ico" src="${Loot.ICON('karte')}" alt=""><span><b>Wortkarten</b> (${v.cards.length})<span class="ru">карточки слов из сундуков</span></span></div><div>${cards}</div>${window.Garden && Garden.bagHTML ? Garden.bagHTML() : ''}`;   // урожай огорода + probieren (garden.js)
      return;
    }
    const b = BY(tab) || BRANCHES[0];
    if (!branchOpen(b)) {                                            // вся ветка в тумане: только как открыть
      list.innerHTML = `<div class="stat" style="margin-top:0">Noch im Nebel …<span class="ru">эта ветка пока в тумане — откроется, когда:</span></div>${(b.open || []).map(c => condHTML(cond(c))).join('')}` + b.skills.map(fogHTML).join('');
      return;
    }
    list.innerHTML = `<div class="stat" style="margin-top:0">${b.hint}</div>` + b.skills.map(s => skillHTML(s, b)).join('');
  }
  p.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'skClose') return close();
    if (t.dataset.g) { group = t.dataset.g; const f = BRANCHES.find(b => b.group === group); tab = f ? f.id : 'wort'; if (!f) group = 'kampf'; render(); return; }
    if (t.dataset.b) { tab = t.dataset.b; const b = BY(tab); if (b) group = b.group; render(); return; }
    if (t.dataset.probe && window.Garden) { Garden.probieren(t.dataset.probe); render(); return; }   // Rucksack: попробовать урожай (+HP)
    if (t.dataset.r && window.Research) { const r = Research.start(t.dataset.r); if (r.ok && window.toast) toast('Die Forschung läuft!', 1400); render(); return; }
    if (t.dataset.s && learn(t.dataset.s)) { if (window.toast) toast('Neues Talent!', 1200); render(); }
  });
  const hide = ['bag', 'bFurn', 'bMap', 'cbHero']; let was = {}, timer = 0, busyOwner = null;
  function open() {
    festSeen(); wrapTalk(); render();
    try { const s = window.game && game.scene.getScenes(true)[0]; if (s && !s.busy) { s.busy = true; busyOwner = s; } } catch (e) {}   // как markt.js: пока панель открыта, сцена не берёт тапы (Д1/Д3)
    hide.forEach(k => { const e = document.getElementById(k); if (e) { was[k] = e.style.display; e.style.display = 'none'; } }); p.style.display = 'flex';
    loadFirm().then(() => { if (p.style.display === 'flex') render(); });
    clearInterval(timer); timer = setInterval(() => {                // таймер исследования: полоска и «noch m:ss» живые
      if (p.style.display !== 'flex') { clearInterval(timer); return; }
      if (window.Research) { const fin = Research.tick(); if (fin || (tab === 'forsch' && Research.active())) render(); }
    }, 1000);
  }
  function close() { clearInterval(timer); p.style.display = 'none'; if (busyOwner) { busyOwner.busy = false; busyOwner = null; } hide.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); }
  window.Skills.open = open; window.Skills.close = close; window.Skills.render = () => { if (p.style.display === 'flex') render(); };
  function hook() {
    const ui = document.getElementById('ui'), bag = document.getElementById('bag');
    if (!ui || !bag) return setTimeout(hook, 100);
    ui.appendChild(p); bag.addEventListener('click', open); shield(bag);   // кнопка Rucksack: тап не уходит в Phaser (на 360x740 под ней стоит друг -> окно друга вместо рюкзака)
    festSeen(); wrapTalk(); setTimeout(wrapTalk, 1500);
    try { if (window.WorldTime && WorldTime.on) WorldTime.on('festival', festSeen); } catch (e) {}
  }
  hook();
})();
