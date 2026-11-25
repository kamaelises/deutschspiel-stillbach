// Язык подсказок игры (25.11, English): ru | en — тот же ключ localStorage 'ds_lang', что в приложении (одна папка сайта).
// Ключ перевода = русская строка; словарь — i18n_en.js (window.DS_EN, собирается из tasks\en\game.tsv). Нет строки → русский.
// Переводит: Phaser-тексты (Text.setText), DOM-слой #ui (текст и aria-label/title), JSON игры и контента (*_en рядом с *_ru).
// Немецкий не трогает: переводятся только строки с кириллицей.
(function () {
  const CYR = /[Ѐ-ӿ]/;
  function getLang() {
    try {
      const q = /[?&]lang=(en|ru)\b/.exec(location.search); if (q) return q[1];
      try { const pl = window.parent !== window && window.parent.__i18n && window.parent.__i18n.lang; if (pl === 'en' || pl === 'ru') return pl; } catch (e) { /* чужой родитель */ }
      const v = localStorage.getItem('ds_lang'); if (v === 'en' || v === 'ru') return v;
    } catch (e) { /* нет localStorage */ }
    try { if (window.__DS_LANG_DEFAULT) return window.__DS_LANG_DEFAULT; if (window.parent !== window && window.parent.__DS_LANG_DEFAULT) return window.parent.__DS_LANG_DEFAULT; } catch (e) { /* чужой родитель */ }
    return 'ru';
  }
  const LANG = getLang();
  function makeTr(D) {
    const exact = D.x || {}, cache = new Map(), miss = new Set();
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pats = (D.p || []).map(([ru, en]) => {
      const parts = ru.split(/\{(\d+)\}/); let src = '^'; const order = [];
      const short = parts.filter((p, i) => !(i % 2)).join('').replace(/[^\u0400-\u04FF]/g, '').length < 6 && parts[0].replace(/[^\u0400-\u04FF]/g, '').length < 3;
      parts.forEach((p, i) => {
        if (i % 2) { const adj = parts[i + 1] === '' && i + 2 < parts.length; src += adj ? '(\\d+|\\S+?)' : '([\\s\\S]*?)'; order.push(+p); }
        else src += esc(p).replace(/\s+/g, '\\s*');
      });
      const lab = parts.map((p, i) => (i % 2 ? /[:·—«"(\n]\s*$/.test(parts[i - 1]) || (i === 1 && parts[0] === '') : null));
      return { rx: new RegExp(src + '$'), en, order, short, lab };
    });
    const SEPS = ['\n', ' · ', ' — ', ' | ', ' / '];
    const PRE = /^([^\p{L}«"(\[{]+)([\s\S]+)$/u, SUF = /^([\s\S]+?)([.!?:…;,]+)$/;
    function one(core) {
      if (Object.prototype.hasOwnProperty.call(exact, core)) return exact[core];
      for (const p of pats) {
        const m = p.rx.exec(core); if (!m) continue;
        if (p.short && m.slice(1).some(v => CYR.test(v))) continue;
        if (m.slice(1).some((v, j) => !p.lab[2 * j + 1] && CYR.test(v) && CYR.test(tr(v)))) continue;
        return p.en.replace(/\{(\d+)\}/g, (_, k) => { const i = p.order.indexOf(+k); return i < 0 ? '' : tr(m[i + 1]); }).trim();
      }
      for (const sep of SEPS) {
        if (!core.includes(sep)) continue;
        const parts = core.split(sep), t = parts.map(tr);
        if (t.some((x, i) => x !== parts[i])) return t.join(sep);
      }
      let m = PRE.exec(core); if (m) { const r = one(m[2].trim()); if (r != null) return m[1] + r; }
      m = SUF.exec(core); if (m) { const r = one(m[1].trim()); if (r != null) return r + m[2]; }
      return null;
    }
    function tr(s) {
      if (typeof s !== 'string' || !s || !CYR.test(s)) return s;
      const c = cache.get(s); if (c !== undefined) return c;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
      let r = one(m[2]);
      if (r == null) { miss.add(m[2]); r = s; } else r = m[1] + r + m[3];
      if (cache.size > 5000) cache.clear();
      cache.set(s, r); return r;
    }
    return { tr, miss, size: Object.keys(exact).length + pats.length };
  }
  const CORE = makeTr(window.DS_EN || {});
  const tr = s => (LANG === 'en' ? CORE.tr(s) : s);
  const enKey = k => (k === 'ru' ? 'en' : /_ru$/.test(k) ? k.slice(0, -3) + '_en' : /Ru$/.test(k) ? k.slice(0, -2) + 'En' : k + '_en');
  const hasText = v => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null);
  function localizeDeep(o) {
    if (LANG !== 'en' || !o || typeof o !== 'object') return o;
    if (Array.isArray(o)) { for (const x of o) localizeDeep(x); return o; }
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object') localizeDeep(v);
      if (/_en$|En$|^en$/.test(k)) continue;
      const ek = enKey(k);
      if (ek !== k && hasText(o[ek]) && (typeof v === 'string' ? CYR.test(v) : Array.isArray(v))) o[k] = o[ek];
    }
    return o;
  }
  window.DS_I18N = { lang: LANG, tr, miss: CORE.miss, size: CORE.size, localizeDeep };
  if (LANG !== 'en') return;
  document.documentElement.dataset.lang = 'en';
  // JSON: fetch(...).json() и загрузчик Phaser (кэш json) — подставить *_en
  const rj = Response.prototype.json;
  Response.prototype.json = function () { return rj.call(this).then(j => localizeDeep(j)); };
  // Phaser: все тексты на канве проходят через Text.setText (и конструктор тоже)
  if (window.Phaser) {
    const P = Phaser.GameObjects.Text.prototype, set = P.setText;
    P.setText = function (v) { return set.call(this, Array.isArray(v) ? v.map(x => CORE.tr(String(x))) : (typeof v === 'string' ? CORE.tr(v) : v)); };
    const add = Phaser.Cache.BaseCache.prototype.add;
    Phaser.Cache.BaseCache.prototype.add = function (key, data) { if (data && typeof data === 'object' && !(data instanceof Node) && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) { try { localizeDeep(data); } catch (e) { /* не JSON */ } } return add.call(this, key, data); };
  }
  // DOM-слой игры
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  const SKIP = '[data-i18n-skip],[lang="ru"],script,style,textarea,input';
  const skip = el => !el || (el.closest && el.closest(SKIP));
  function trText(n) { const v = n.data; if (CYR.test(v) && !skip(n.parentElement)) { const x = CORE.tr(v); if (x !== v) n.data = x; } }
  function trAttrs(el) { if (el.closest && el.closest('[data-i18n-skip],[lang="ru"]')) return; for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && CYR.test(v)) { const x = CORE.tr(v); if (x !== v) el.setAttribute(a, x); } } }
  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1) return;
    trAttrs(root); if (skip(root)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
  }
  function start() {
    translateTree(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') trAttrs(m.target);
        else m.addedNodes.forEach(translateTree);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
