// Три режима (25.11, помощник «Три режима»; правила — tasks\MODES.md). Ключ localStorage 'ds_mode' общий с приложением (app\src\core\mode.js, одна папка сайта):
//   both  — «Учёба + игра»: мир открывают уроки глав (как до 25.11);
//   learn — «Только учёба»: приложение мир не загружает (если игру открыть отдельно — ведёт себя как both);
//   game  — «Только игра»: мир открывает Stufe героя (опыт за бой, задания доски и жителей): Stufe N = главы 1…N пройдены ДЛЯ МИРА.
// Ворота мира (дома и участки town.js, ступень verbessert town_plus.js, задания board.js, карта map.js, огород garden.js, Max main.js maxAge,
// звёзды economy.js) читают DSMode.chapters(): уроки приложения (ds_proto.app) + главы, открытые Stufe в режиме game.
// Stufe, достигнутая в game, запоминается (ds_proto.modeStufe, только растёт): при смене режима открытое не закрывается, прогресс один.
// Слова боя, Zauber, навыки, Sprachniveau, наставник — только настоящие уроки (DSMode.lessons()); в game пул боя = главы 1–2 + уроки + Wortkarten (combat.js pool).
// ?mode=both|learn|game в адресе — режим для проверок (не сохраняется).
(function () {
  const KEY = 'ds_mode', SK = 'ds_proto.modeStufe', MODES = ['both', 'learn', 'game'], DEF_TOTAL = 8;
  function mode() {
    try {
      const q = /[?&]mode=(both|learn|game)\b/.exec(location.search); if (q) return q[1];
      const v = localStorage.getItem(KEY); if (MODES.includes(v)) return v;
    } catch (e) { /* нет localStorage */ }
    return 'both';
  }
  function lessons() { try { const c = JSON.parse(localStorage.getItem('ds_proto.app')).chapters; return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  function stufe() { try { return Math.max(1, Math.min(50, (typeof state !== 'undefined' && state && (state.level || state.lvl)) || 1)); } catch (e) { return 1; } }
  // Stufe, которая открывает мир: в game — текущая (и запоминается), в других режимах — запомненная из game (0, если в game не играли)
  function gameStufe() {
    let s = 0; try { s = +localStorage.getItem(SK) || 0; } catch (e) {}
    if (mode() === 'game') { const n = stufe(); if (n > s) { s = n; try { localStorage.setItem(SK, String(n)); } catch (e) {} } }
    return s;
  }
  // прогресс глав для ворот мира: [{n, title, done, total, game?}] — тот же вид, что ds_proto.app.chapters
  function chapters() {
    const real = lessons(), s = gameStufe(); if (!s) return real;
    const out = real.map(c => Object.assign({}, c));
    for (let n = 1; n <= s; n++) {
      let c = out.find(x => +x.n === n);
      if (!c) { c = { n, title: '', done: 0, total: DEF_TOTAL }; out.push(c); }
      const tot = +c.total || DEF_TOTAL; if ((+c.done || 0) < tot) { c.total = tot; c.done = tot; c.game = 1; }
    }
    return out.sort((a, b) => a.n - b.n);
  }
  // место главы c «открыто» (town.js reach >= c) с Stufe c-1; «целиком» (стадия Gebäude, verbessert) — с Stufe c
  const needOpen = c => Math.max(1, c - 1);
  function lock(c) { return mode() === 'game' ? { de: 'ab Stufe ' + needOpen(c), ru: 'с Stufe ' + needOpen(c) + ' — уровень героя' } : { de: 'ab Kapitel ' + c, ru: 'с главы ' + c }; }
  const unit = c => (mode() === 'game' ? 'Stufe ' + c : 'Kapitel ' + c);   // «целиком» (Baustelle -> Gebäude): глава c пройдена / Stufe c
  function starsWhy(n) { return mode() === 'game' ? { de: 'Noch ' + n + ' ★ — nächste Stufe.', ru: 'нужно ещё ' + n + ' ★: звёзды приходят с новой Stufe героя (бой, задания доски)' } : null; }
  function gameWords() { try { const c = (JSON.parse(localStorage.getItem('ds_proto.inv')) || {}).cards; return Array.isArray(c) ? c : []; } catch (e) { return []; } }
  window.DSMode = { mode, lessons, chapters, stufe, gameStufe, lock, unit, starsWhy, gameWords, MODES };
  // Max растёт и от новой Stufe (в game): раз в 3 с сравнить ступень; maxGrow — main.js (работает, только если листы ступеней уже были применены)
  setInterval(() => {
    try {
      if (mode() !== 'game' || typeof maxGrow !== 'function' || typeof maxAge !== 'function' || !window.__maxAge || !window.game || !game.isBooted) return;
      if (maxAge() !== window.__maxAge) { const sc = game.scene.getScenes(true)[0]; if (sc) maxGrow(sc); }
    } catch (e) { /* сцена ещё не готова */ }
  }, 3000);
})();
