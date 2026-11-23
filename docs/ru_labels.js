// Перевод на кнопках и плашках: под немецким словом — мелко по-русски (Hören / слушать). Немецкое остаётся главным.
(function () {
  const RU = {
    'Hören': 'слушать', 'Sprechen': 'сказать', 'Weiter': 'дальше', 'Ohne Mikro': 'без микрофона', 'Nochmal': 'ещё раз',
    'Zur Karte': 'к карте', 'Zum Hof': 'во двор', '⟵ Raus': 'выйти', 'Raus': 'выйти', 'Karte': 'карта', 'Einrichten': 'обставить',
    'Rucksack': 'рюкзак', 'Fertig': 'готово', 'Lektionen': 'уроки', 'Wiederholen': 'повтор', 'Spiele': 'игры',
    'Morgen · Sonne': 'утро · солнце', 'Karte von Stillbach': 'карта Штильбаха', 'Geschafft!': 'получилось!',
    'Keller-Übung': 'тренировка',
  };
  const PRE = [['Ziel: ', 'цель: '], ['Sprich mit ', 'поговори с '], ['Einrichten: tippe ein Möbel', 'обустройство: выбери мебель']];
  const WORD = { 'Elternhaus': 'родительский дом', 'Herrn Schmidt': 'господином Шмидтом', 'den Leuten': 'людьми', 'Bäckerei (bald)': 'пекарня (скоро)' };
  function ruFor(t) {
    if (RU[t]) return RU[t];
    for (const [de, ru] of PRE) if (t.startsWith(de)) { const rest = t.slice(de.length); return rest ? ru + (WORD[rest] || '') : ru; }
    return '';
  }
  function mark(el) {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    const t = own || (el.children.length === 0 ? el.textContent.trim() : '');
    if (el.dataset.ruFor === t && (el.querySelector(':scope > small.ru') || !ruFor(t))) return;
    const old = el.querySelector(':scope > small.ru'); if (old) old.remove();
    const ru = t && ruFor(t); el.dataset.ruFor = t; if (!ru) return;
    const s = document.createElement('small'); s.className = 'ru'; s.textContent = ru; el.appendChild(s);
  }
  function run() { document.querySelectorAll('#ui .ui-btn, #ui .ui-nameplate, #mapPanel .mapTitle, #reward > div:first-child').forEach(mark); }
  const st = document.createElement('style');
  st.textContent = '#ui small.ru{display:block;font-size:11px;font-weight:500;line-height:1.05;opacity:.78;margin-top:1px;letter-spacing:0;text-transform:none}'
    + '#ui .ui-btn{line-height:1.1}#ui .ui-btn:has(> small.ru){display:inline-flex;flex-direction:column;align-items:center;justify-content:center}#ui .hud .ui-nameplate:has(> small.ru){flex-direction:column;justify-content:center;line-height:1.05;height:auto;min-height:36px;padding-top:2px;padding-bottom:2px}#ui .hud .ui-nameplate small.ru{font-size:10px}';
  document.head.appendChild(st);
  let t = null; new MutationObserver(() => { clearTimeout(t); t = setTimeout(run, 30); }).observe(document.getElementById('ui'), { childList: true, subtree: true, characterData: true });
  run();
})();
