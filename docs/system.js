// «System» — окно статуса как в исекае (решение автора 23.11): кнопка-свиток в верхней плашке HUD (иконка craftpix 994534),
// окно в стиле игры (бумажная панель), немецкий крупно + мелко по-русски: Max, уровень языка по пройденным главам, Stufe боя, HP, мана,
// слов знаю, 4 атрибута (Hören / Lesen / Sprechen / Schreiben — из заданий пройденных уроков), навыки (= панель skills.js), титулы (пока пусто).
// Первое открытие после главы 1 — тост «System aktiviert». API: SystemWin.open(), SystemWin.close(), SystemWin.data().
(function () {
  const $ = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
    #bSys{height:36px;width:46px;padding:0;display:inline-flex;align-items:center;justify-content:center;pointer-events:auto}
    #bSys img{height:26px;width:auto;image-rendering:pixelated;filter:drop-shadow(1px 1px 0 rgba(59,35,20,.4))}
    #sysWin{position:absolute;left:10px;right:10px;top:var(--sysTop,64px);bottom:12px;display:none;flex-direction:column;padding:10px 12px 12px;color:#2e1e12;z-index:61;font-family:Roboto,'Segoe UI',system-ui,sans-serif}
    body:not(.vert) #sysWin{left:50%;right:auto;width:560px;transform:translateX(-50%)}
    #sysWin .ru{display:block;font-size:12px;font-weight:400;color:#6b4a2e;line-height:1.15}
    #sysWin .top{display:flex;align-items:center;justify-content:space-between;gap:8px}
    #sysWin .ttl{font-size:24px;font-weight:800;line-height:1.05;letter-spacing:.5px}
    #sysWin .ttl em{font-style:normal;color:#3f4fb5}
    #sysWin .close{width:104px;height:50px;font-size:18px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2e1e12;font-family:inherit;padding:2px 6px}
    #sysWin .body{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;margin-top:6px;padding-right:2px}
    #sysWin .sec{font-size:15px;font-weight:800;margin:10px 0 4px;border-bottom:2px dashed #c9a877;padding-bottom:2px}
    #sysWin .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}
    #sysWin .cell{background:rgba(255,248,230,.55);border:2px solid #c9a877;border-radius:6px;padding:4px 8px;min-width:0}
    #sysWin .cell .k{font-size:14px;font-weight:700}#sysWin .cell .v{font-size:20px;font-weight:800;line-height:1.1}
    #sysWin .bar{height:10px;background:#2e1e12;border-radius:3px;padding:2px;margin-top:3px}#sysWin .bar i{display:block;height:100%;border-radius:2px}
    #sysWin .soon{font-size:11px;color:#9b6a2e;font-weight:700}
    #sysWin .btn{width:100%;height:56px;margin-top:4px;font-size:19px;line-height:1.05;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#2e1e12;font-family:inherit}`;
  document.head.appendChild(css);
  const win = document.createElement('div'); win.id = 'sysWin'; win.className = 'ui ui-panel-paper';
  const app = () => { try { return JSON.parse(localStorage.getItem('ds_proto.app')).chapters || []; } catch (e) { return []; } };
  function data() {
    const C = window.Combat, st = (typeof state !== 'undefined' ? state : window.state) || {};
    const ch = app(), full = ch.filter(c => c.total > 0 && c.done >= c.total).length;
    const level = full < 8 ? 'A1.1' : full < 16 ? 'A1.2' : 'A2.1';   // Linie 1 A1: главы 1–8 = A1.1, 9–16 = A1.2
    const P = C && C.passedLessons ? C.passedLessons() : [], sum = k => P.reduce((a, p) => a + ((p.les.tasks || {})[k] || 0), 0);
    return { name: 'Max', level, chapters: full, lessons: P.length, stufe: C ? C.lvl() : st.level || 1, xp: st.xp || 0, xpNeed: C ? C.xpNeed(C.lvl()) : 50,
      hp: C ? C.heroHp() : 0, hpMax: C ? C.hpMax() : 0, mana: C ? C.mana() : 0, manaMax: C ? C.manaMax() : 10, words: C ? C.vocab() : 0,
      attr: { Hören: sum('listen'), Lesen: sum('read'), Sprechen: sum('speak'), Schreiben: sum('write') } };
  }
  const RU = { Hören: 'слушать', Lesen: 'читать', Sprechen: 'говорить', Schreiben: 'писать' };
  function render() {
    const d = data(), bar = (v, m, c) => `<div class="bar"><i style="width:${m ? Math.round(100 * v / m) : 0}%;background:${c}"></i></div>`;
    const cell = (k, ru, v, extra) => `<div class="cell"><div class="k">${k}<span class="ru">${ru}</span></div><div class="v">${v}</div>${extra || ''}</div>`;
    win.innerHTML = `<div class="top"><div class="ttl"><em>System</em> · Status<span class="ru">окно статуса героя</span></div><button class="ui ui-btn close" id="sysClose">Zurück<span class="ru">назад</span></button></div>
      <div class="body">
        <div class="grid">${cell('Name', 'имя', d.name)}${cell('Sprachniveau', 'уровень языка · глав пройдено: ' + d.chapters, d.level)}
          ${cell('Stufe', 'уровень боя · опыт ' + d.xp + '/' + d.xpNeed, d.stufe, bar(d.xp, d.xpNeed, '#e0a400'))}${cell('Wörter', 'слов знаю', d.words)}
          ${cell('HP', 'здоровье', d.hp + '/' + d.hpMax, bar(d.hp, d.hpMax, '#6cc04a'))}${cell('Mana', 'мана: 10 + 1 за 20 слов', d.mana + '/' + d.manaMax, bar(d.mana, d.manaMax, '#4f86e8'))}</div>
        <div class="sec">Attribute<span class="ru">навыки языка — из заданий пройденных уроков (${d.lessons})</span></div>
        <div class="grid">${Object.entries(d.attr).map(([k, v]) => cell(k, RU[k], v, v ? '' : '<div class="soon">скоро — пройди урок</div>')).join('')}</div>
        <div class="sec">Talente<span class="ru">навыки боя — очки за уроки</span></div>
        <button class="ui ui-btn btn" id="sysSkills">Talente öffnen<span class="ru">открыть навыки</span></button>
        <div class="sec">Titel<span class="ru">титулы</span></div>
        <div class="cell"><div class="k">noch keine<span class="ru">пока нет — появятся за главы и боссов</span></div></div>
      </div>`;
    $('sysClose').onclick = close;
    $('sysSkills').onclick = () => { close(); if (window.Skills && Skills.open) Skills.open(); };
  }
  const HIDE = ['bag', 'bFurn', 'bMap', 'cbHero', 'qTrack', 'clock']; let was = {};
  function open() {
    const g = $('goal'); if (g) win.style.setProperty('--sysTop', (g.offsetTop + g.offsetHeight + 8) + 'px');   // окно ниже верхней плашки: HUD не закрыт
    render(); HIDE.forEach(k => { const e = $(k); if (e && was[k] === undefined) { was[k] = e.style.display; e.style.display = 'none'; } }); win.style.display = 'flex';
    const ch1 = app().find(c => +c.n === 1), seen = localStorage.getItem('ds_proto.sysSeen');
    if (!seen && ch1 && ch1.total > 0 && ch1.done >= ch1.total) { try { localStorage.setItem('ds_proto.sysSeen', '1'); } catch (e) {} if (window.toast) toast('System aktiviert', 2200); window.__sysActivated = true; }
  }
  function close() { win.style.display = 'none'; HIDE.forEach(k => { const e = $(k); if (e && was[k] !== undefined) e.style.display = was[k]; }); was = {}; }
  window.SystemWin = { open, close, data, isOpen: () => win.style.display === 'flex' };
  (function hook() {
    const ui = $('ui'), goal = $('goal'); if (!ui || !goal) return setTimeout(hook, 100);
    ui.appendChild(win);
    const b = document.createElement('button'); b.id = 'bSys'; b.className = 'ui ui-btn'; b.title = 'System';
    b.innerHTML = '<img src="assets_v3/items/scroll.png" alt="System">'; b.onclick = () => (win.style.display === 'flex' ? close() : open());
    goal.appendChild(b);
  })();
})();
