// Rucksack → Held & Talente: три ветки развития (design-doc/rpg-design.md, разделы 4–5).
// Очки навыков — ТОЛЬКО за учёбу: 1 за пройденный урок, +3 за закрытую главу, +2 за побеждённого босса.
// Опыт боя даёт уровень героя (здоровье/сила), не навыки. API для боя: Skills.lvl(id) -> 0..max, Skills.points().
(function () {
  const KEY = 'ds_proto.skills';
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
  const ALL = {}; BRANCHES.forEach(b => b.skills.forEach(s => { s.branch = b.id; ALL[s.id] = s; }));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { lv: {} }; } catch (e) { return { lv: {} }; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const app = () => { try { return JSON.parse(localStorage.getItem('ds_proto.app')) || {}; } catch (e) { return {}; } };
  function earned() {
    const ch = app().chapters || []; let p = 0;
    ch.forEach(c => { p += c.done || 0; if (c.total && c.done >= c.total) p += 3; });
    try { p += 2 * (JSON.parse(localStorage.getItem('ds_proto.bosses')) || []).length; } catch (e) {}
    return p;
  }
  const spent = st => Object.entries(st.lv).reduce((a, [id, l]) => a + (ALL[id] ? ALL[id].cost * l : 0), 0);
  const points = () => earned() - spent(load());
  const lvl = id => load().lv[id] || 0;
  function canLearn(s) { const st = load(); return (st.lv[s.id] || 0) < s.max && points() >= s.cost && (!s.need || (st.lv[s.need] || 0) > 0); }
  function learn(id) { const s = ALL[id]; if (!s || !canLearn(s)) return false; const st = load(); st.lv[id] = (st.lv[id] || 0) + 1; save(st); return true; }
  window.Skills = { BRANCHES, lvl, points, earned, learn, canLearn };

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
    #skills .tabs .ui-btn.on{outline:3px solid #ffd23f;outline-offset:-3px}
    #skills .list{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:2px}
    #skills .sk{display:flex;gap:10px;align-items:center;border-bottom:2px dashed #c9a877;padding:8px 2px}
    #skills .sk .info{flex:1 1 auto;min-width:0}
    #skills .sk .nm{font-size:19px;font-weight:700;line-height:1.1}
    #skills .sk .tx{font-size:14px;line-height:1.25;margin-top:2px}
    #skills .sk .dots{font-size:16px;letter-spacing:2px;margin-top:2px}
    #skills .sk .ui-btn{flex:0 0 auto;width:96px;height:56px;padding:2px 4px;font-size:17px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2e1e12;font-family:inherit}
    #skills .sk .ui-btn[disabled]{opacity:.45;filter:grayscale(.6)}
    #skills .sk.locked .nm,#skills .sk.locked .tx{opacity:.55}
    #skills .close{width:110px;height:52px;font-size:18px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2e1e12;font-family:inherit;padding:2px 6px}`;
  document.head.appendChild(css);
  const p = document.createElement('div'); p.id = 'skills'; p.className = 'ui ui-panel-paper';
  p.innerHTML = `<div class="top"><div class="ttl">Held &amp; Talente<small>герой и навыки</small></div><button class="ui ui-btn close" id="skClose">Zurück<span class="ru">назад</span></button></div>
    <div class="stat" id="skStat"></div><div class="tabs" id="skTabs"></div><div class="list" id="skList"></div>`;
  let tab = 'wort';
  function render() {
    const st = (typeof state !== 'undefined' ? state : window.state) || {}, lv = st.level || 1, xp = st.xp || 0;
    p.querySelector('#skStat').innerHTML = `Stufe <b>${lv}</b> · Erfahrung ${xp} · <b>Punkte: ${points()}</b><span class="ru">уровень героя растёт от боёв · очки навыков — от уроков (1 за урок, +3 за главу, +2 за босса)</span>`;
    const TABS = BRANCHES.concat(window.Loot ? [{ id: 'inv', de: 'Beutel', ru: 'сумка', col: '#8a6a2e' }] : [], window.Album ? [{ id: 'album', de: 'Album', ru: 'альбом', col: '#b0701a' }] : []);
    p.querySelector('#skTabs').innerHTML = TABS.map(b => `<button class="ui ui-btn${b.id === tab ? ' on' : ''}" data-b="${b.id}" style="border-bottom:4px solid ${b.col}">${b.de}<span class="ru">${b.ru}</span></button>`).join('');
    if (tab === 'album' && window.Album) { Album.render(p.querySelector('#skList')); return; }   // альбом находок (album.js): 8 разделов, редкость, бестиарий
    if (tab === 'inv') {                                             // the bag: what chests gave (potions, materials for the village, word cards)
      const v = Loot.inv(), row = (de, ru, n, k) => `<div class="sk"><img class="ico" src="${Loot.ICON(k)}" alt=""><div class="info"><div class="nm">${de}<span class="ru">${ru}</span></div></div><div class="nm" style="min-width:56px;text-align:right">× ${n}</div></div>`;
      const pots = Object.entries(Loot.POTS).map(([k, [de, ru]]) => row(de, ru, v.potions[k] || 0, k)).join('');
      const mats = Object.entries(Loot.MATS).map(([k, [de, ru]]) => row(de, ru, v.mats[k] || 0, k)).join('');
      const cards = v.cards.length ? v.cards.slice(-12).reverse().map(c => `<span style="display:inline-block;margin:3px 6px 3px 0;padding:2px 8px;border:2px solid #c9a877;border-radius:6px;font-size:16px">${c}</span>`).join('') : '<span class="ru">пока пусто — открывай сундуки</span>';
      p.querySelector('#skList').innerHTML = `<div class="stat" style="margin-top:0"><b>Tränke</b><span class="ru">зелья</span></div>${pots}<div class="stat"><b>Baumaterial</b><span class="ru">материалы для зданий деревни</span></div>${mats}<div class="stat" style="display:flex;align-items:center;gap:8px"><img class="ico" src="${Loot.ICON('karte')}" alt=""><span><b>Wortkarten</b> (${v.cards.length})<span class="ru">карточки слов из сундуков</span></span></div><div>${cards}</div>${window.Garden && Garden.bagHTML ? Garden.bagHTML() : ''}`;   // урожай огорода + probieren (garden.js)
      return;
    }
    const b = BRANCHES.find(x => x.id === tab);
    p.querySelector('#skList').innerHTML = `<div class="stat" style="margin-top:0">${b.hint}</div>` + b.skills.map(s => {
      const l = lvl(s.id), locked = s.need && !lvl(s.need), full = l >= s.max, ok = canLearn(s);
      const dots = '●'.repeat(l) + '○'.repeat(s.max - l);
      const label = full ? 'Max<span class="ru">максимум</span>' : locked ? 'Gesperrt<span class="ru">закрыто</span>' : `Lernen<span class="ru">выучить · ${s.cost}</span>`;
      return `<div class="sk${locked ? ' locked' : ''}"><div class="info"><div class="nm">${s.de}<span class="ru">${s.ru}${locked ? ' · сначала: ' + ALL[s.need].ru : ''}</span></div><div class="tx">${s.txt}</div><div class="dots" style="color:${b.col}">${dots}</div></div>
        <button class="ui ui-btn" data-s="${s.id}" ${ok ? '' : 'disabled'}>${label}</button></div>`;
    }).join('');
  }
  p.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'skClose') return close();
    if (t.dataset.b) { tab = t.dataset.b; render(); return; }
    if (t.dataset.probe && window.Garden) { Garden.probieren(t.dataset.probe); render(); return; }   // Rucksack: попробовать урожай (+HP)
    if (t.dataset.s && learn(t.dataset.s)) { if (window.toast) toast('Neues Talent!', 1200); render(); }
  });
  const hide = ['bag', 'bFurn', 'bMap', 'cbHero']; let was = {};
  function open() { render(); hide.forEach(k => { const e = document.getElementById(k); if (e) { was[k] = e.style.display; e.style.display = 'none'; } }); p.style.display = 'flex'; }
  function close() { p.style.display = 'none'; hide.forEach(k => { const e = document.getElementById(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); }
  window.Skills.open = open; window.Skills.close = close;
  function hook() {
    const ui = document.getElementById('ui'), bag = document.getElementById('bag');
    if (!ui || !bag) return setTimeout(hook, 100);
    ui.appendChild(p); bag.addEventListener('click', open);
  }
  hook();
})();
