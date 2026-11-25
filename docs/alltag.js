// alltag.js - window.Alltag (Задания в жизни 25.11): «Auftrag im Alltag» из приложения в мире.
// 1) Награда: приложение (app/src/core/alltag.js) кладёт {id, coins} в localStorage 'ds_alltag.pending' и шлёт {ds:'alltag'};
//    мир зачисляет ОДИН раз на id: Rewards.once('alltag:'+id) (Антифарм, rewards.js) -> Rewards.coins(n, why, 'alltag'), без Rewards — Eco.earn;
//    второй замок — 'ds_alltag.claimed'. 2) Доска das Schwarze Brett (board.js) показывает текущее задание: Alltag.boardRow(), кнопка -> Alltag.open().
(function () {
  const P = 'ds_alltag.pending', C = 'ds_alltag.claimed', CUR = 'ds_alltag.cur', WHY = 'Auftrag im Alltag';
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const en = () => { try { return (window.DS_I18N ? DS_I18N.lang : localStorage.getItem('ds_lang')) === 'en'; } catch (e) { return false; } };
  // строки — в tasks\en\game_alltag.tsv (ключ = русская строка, DS_I18N.tr); нет в словаре — запасной английский
  const L = (ru, enS) => { if (!en()) return ru; const t = window.DS_I18N ? DS_I18N.tr(ru) : ru; return t !== ru ? t : enS; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function pay(x) {
    const R = window.Rewards;
    if (R && typeof R.once === 'function') { if (!R.once('alltag:' + x.id)) return 0; return typeof R.coins === 'function' ? R.coins(x.coins, WHY, 'alltag') : (window.Eco ? Eco.earn(x.coins, WHY) : 0); }
    return window.Eco ? Eco.earn(x.coins, WHY) : 0;
  }
  function drain() {
    const q = ld(P, []); if (!Array.isArray(q) || !q.length) return 0;
    if (!window.Eco || typeof state === 'undefined') return 0;            // мир ещё не готов — заберём позже
    const got = ld(C, {}); let sum = 0;
    for (const x of q) {
      if (!x || !x.id || got[x.id]) continue;
      const n = Math.max(0, Math.min(10, Math.round(+x.coins || 0)));    // защита: одно задание — не больше 10 монет
      got[x.id] = Date.now(); sum += pay({ id: x.id, coins: n }) || 0;
    }
    sv(C, got); sv(P, []);
    if (sum && typeof window.toast === 'function') toast('+' + sum + ' Münzen · ' + WHY, 2200);
    return sum;
  }
  function cur() { const c = ld(CUR, null); return c && c.id ? c : null; }
  function boardRow() {
    const c = cur(); if (!c) return '';
    const de = (c.de || [])[0] || '', task = en() ? c.task_en || c.task_ru : c.task_ru;
    const st = c.done ? '✓ erledigt · ' + L('сделано', 'done') : '+5 Münzen · ' + L('в жизни', 'in real life');
    return `<div class="row alltag" data-alltag-row><div class="tx"><div class="de"><span class="tag">Alltag</span>${esc(de)}</div><div class="ru">${esc(String(task || '').slice(0, 120))}</div><div class="rw">${st}</div></div>`
      + `<button class="ui ui-btn" data-alltag="1">Öffnen<span class="ru">${L('открыть', 'open')}</span></button></div>`;
  }
  function open() {
    if (typeof window.dsGo === 'function') return dsGo('#/alltag');
    if (typeof window.toast === 'function') toast(L('Открой в приложении: Уроки → Задания в жизни', 'Open in the app: Lessons → Real-life tasks'), 2400);
  }
  addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.ds === 'alltag') setTimeout(drain, 50); });
  addEventListener('storage', e => { if (e.key === P) setTimeout(drain, 50); });
  addEventListener('load', () => setTimeout(drain, 1500));
  window.Alltag = { drain, cur, boardRow, open };
})();
