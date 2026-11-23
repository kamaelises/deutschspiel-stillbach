// Игра внутри приложения (?embed=1): кнопки на карте и в награде открывают экраны приложения.
(function () {
  if (!/[?&]embed=1/.test(location.search) || window.parent === window) return;
  document.body.classList.add('embed');
  const go = h => { const sc = window.game && game.scene.getScenes(true)[0], send = () => window.parent.postMessage({ ds: 'go', hash: h }, location.origin);
    if (!sc) return send(); sc.cameras.main.fadeOut(220, 29, 19, 11); setTimeout(() => { send(); setTimeout(() => sc.cameras.main.fadeIn(10), 400); }, 230); };
  window.dsGo = go;
  const LINKS = [['Lektionen', '#/lessons', 'уроки'], ['Wiederholen', '#/review', 'повтор'], ['Hören', '#/listen', 'слушать'], ['Spiele', '#/games', 'игры']];
  function addRow(host, cls) {
    if (!host || host.querySelector('.' + cls)) return;
    const row = document.createElement('div'); row.className = cls;
    row.innerHTML = LINKS.map(([de, h, ru]) => `<button class="ui ui-btn" data-h="${h}">${de}<small>${ru}</small></button>`).join('');
    row.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.h)); host.appendChild(row);
  }
  new MutationObserver(() => { addRow(document.getElementById('mapPanel'), 'appLinks'); addRow(document.getElementById('reward'), 'appLinks'); })
    .observe(document.getElementById('ui'), { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  const st = document.createElement('style');
  st.textContent = 'body.embed #reset{display:none}body.embed #mapPanel{padding:4px 12px 8px}body.embed #mapPanel .mapTitle{font-size:20px;margin-bottom:2px}body.embed #mapPanel .mapGrid{grid-template-columns:150px 150px;gap:2px 12px}body.embed #mapPanel .place img{width:150px;height:120px}body.embed #mapPanel .pl{font-size:16px;margin-top:1px}body.embed #mapPanel .pr{font-size:12px}body.embed #mapPanel>.ui-btn{height:38px;font-size:17px;margin-top:4px}.appLinks .ui-btn{height:38px!important}.appLinks small{display:none}.appLinks{display:flex;gap:6px;justify-content:center;margin-top:6px}.appLinks .ui-btn{font-family:inherit;font-size:15px;height:46px;padding:0 10px;color:#2e1e12;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}.appLinks small{font-family:sans-serif;font-size:10px;opacity:.75;margin-top:2px}';
  document.head.appendChild(st);
})();
