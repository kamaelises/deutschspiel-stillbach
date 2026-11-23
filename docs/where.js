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
  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || !window.game) return;
    if (e.data.ds === 'pause') { try { speechSynthesis.cancel(); } catch (x) {} game.loop.sleep(); game.sound && game.sound.pauseAll && game.sound.pauseAll(); }
    if (e.data.ds === 'resume') { game.loop.wake(); game.sound && game.sound.resumeAll && game.sound.resumeAll(); }
  });
})();
