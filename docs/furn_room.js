// Обустройство видно в сценах: если игрок обставил дом (state.furn), сцена урока в доме (Room) показывает
// его комнату — пустую коробку дома и его мебель там, где он её поставил (без цветной обводки, с тенью).
(function () {
  function furnishRoom(sc) {
    const list = (typeof state !== 'undefined' && state.furn) || [];
    if (!list.length) return;
    const go = () => {
      const d = sc.cache.json.get('fur'); if (!d) return;
      const S = d.scale;
      sc.add.image(0, 0, 'fur_shell').setOrigin(0, 0).setDepth(-9);        // поверх обычной комнаты художника
      list.forEach(p => {
        const it = d.items.find(i => i.key === p.k); if (!it) return;
        const decal = it.kind === 'decal';
        sc.add.image(p.x * S, p.y * S, 'fi_' + it.key).setOrigin(0.5, 1).setDepth(decal ? -8 : p.y * S);
        if (!decal) sc.add.ellipse(p.x * S + it.w * 0.5, p.y * S - 2, it.w * S * 0.9, 10, 0x0f1c08, 0.3).setDepth(p.y * S - 1);
      });
    };
    const need = [];
    if (!sc.cache.json.exists('fur')) need.push(() => sc.load.json('fur', 'assets_v3/furnish/furnish.json'));
    if (!sc.textures.exists('fur_shell')) need.push(() => sc.load.image('fur_shell', 'assets_v3/furnish/shell.png'));
    list.forEach(p => { if (!sc.textures.exists('fi_' + p.k)) need.push(() => sc.load.image('fi_' + p.k, 'assets_v3/furnish/' + p.k + '.png')); });
    if (!need.length) return go();
    need.forEach(f => f()); sc.load.once('complete', go); sc.load.start();
  }
  (function hook() {
    const g = window.game; if (!g || !g.scene || !g.scene.scenes || !g.scene.scenes.length) return setTimeout(hook, 50);
    const room = g.scene.getScene('Room'); if (room) room.events.on('create', () => furnishRoom(room));
  })();
})();
