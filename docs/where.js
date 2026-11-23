// Где игрок в мире: сцена (+ строка урока) в localStorage 'ds_proto.where'; после перезапуска Boot продолжает оттуда.
// В приложении: {ds:'pause'} усыпляет игру (вкладка скрыта), {ds:'resume'} будит — состояние в памяти не теряется.
(function () {
  const KEY = 'ds_proto.where';
  window.whereGet = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  window.whereSet = (s, i) => { try { localStorage.setItem(KEY, JSON.stringify({ s, i: i || 0, t: Date.now() })); } catch (e) {} };
  function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    let sent = false; g.scene.scenes.forEach(sc => sc.events.on('create', () => { if (!sent && sc.scene.key !== 'Boot') { sent = true; if (window.parent !== window) window.parent.postMessage({ ds: 'ready' }, location.origin); } }));
    ['Yard', 'Karte', 'Furnish'].forEach(k => { const sc = g.scene.getScene(k); if (sc) sc.events.on('create', () => whereSet(k)); });
  }
  hook();
  // меньше 960x540 — сглаженное уменьшение (пиксельное выкидывает строки пикселей = тонкие линии-«сетка»)
  function smooth() { const k = Math.min(innerWidth / 960, innerHeight / 540), c = document.querySelector('#game canvas, canvas'); document.body.classList.toggle('down', k < 1); if (c) c.style.imageRendering = k < 1 ? 'auto' : 'pixelated'; }
  addEventListener('resize', smooth); setInterval(smooth, 1000); smooth();
  const st = document.createElement('style'); st.textContent = 'body.asleep #ui{visibility:hidden}'; document.head.appendChild(st);
  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || !window.game) return;
    if (e.data.ds === 'progress' && Array.isArray(e.data.chapters)) {
      const ch = e.data.chapters.map(c => ({ n: +c.n, title: String(c.title || ''), done: +c.done || 0, total: +c.total || 0 }));
      try { localStorage.setItem('ds_proto.app', JSON.stringify({ chapters: ch, t: Date.now() })); } catch (x) {}
      const all = ch.reduce((a, c) => a + c.done, 0), paid = +(localStorage.getItem('ds_proto.paid') || 0);
      if (all > paid && typeof setCoins === 'function') { setCoins(state.coins + (all - paid) * 10); try { localStorage.setItem('ds_proto.paid', all); } catch (x) {} if (typeof toast === 'function') toast('+' + (all - paid) * 10 + ' Münzen für Lektionen', 2200); }
      const k = game.scene.getScene('Karte'); if (k && k.sys.isActive()) k.scene.restart();
    }
    if (e.data.ds === 'pause') { try { speechSynthesis.cancel(); } catch (x) {} game.loop.sleep(); document.body.classList.add('asleep'); game.sound && game.sound.pauseAll && game.sound.pauseAll(); }
    if (e.data.ds === 'resume') { game.loop.wake(); document.body.classList.remove('asleep'); game.sound && game.sound.resumeAll && game.sound.resumeAll(); }
  });
})();
