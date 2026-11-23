// Einrichten (furnishing mode): empty Elternhaus shell, buy pack furniture with coins, place it by the rules
// (on the floor, wall pieces against the wall, nothing inside anything). Every item shows its German word with the article,
// and an outline in the article colour (der blue, die red, das green). Uses globals from main.js: $, state, store, setCoins, toast, speakDE.
class Furnish extends Phaser.Scene {
  constructor() { super('Furnish'); }
  preload() { this.load.json('fur', 'assets_v3/furnish/furnish.json'); this.load.image('fur_shell', 'assets_v3/furnish/shell.png'); }
  create() {
    this.d = this.cache.json.get('fur'); this.S = this.d.scale; this.C = this.d.cell;
    this.d.items.forEach(it => { if (!this.textures.exists('fi_' + it.key)) { this.load.image('fi_' + it.key, 'assets_v3/furnish/' + it.key + '.png'); this.load.image('fo_' + it.key, 'assets_v3/furnish/' + it.key + '_ol.png'); } });
    this.load.once('complete', () => this.build()); this.load.start();
  }
  build() {
    window.__furn = this; this.cameras.main.fadeIn(250);
    this.add.image(0, 0, 'fur_shell').setOrigin(0, 0).setDepth(-100);
    state.furn = state.furn || []; this.placed = [];
    state.furn.forEach(p => this.spawn(this.item(p.k), p.x, p.y, false));
    this.sel = null; this.ghost = null; this.makeBar();
    $('dlg').style.display = 'none'; $('goalTxt').textContent = 'Einrichten: tippe ein Möbel';
    this.input.on('pointermove', p => this.move(p)); this.input.on('pointerdown', p => this.tap(p));
    this.events.once('shutdown', () => { const b = $('furnBar'); if (b) b.style.display = 'none'; window.__furn = null; });
  }
  item(k) { return this.d.items.find(i => i.key === k); }
  label(it) { return `<b style="color:${this.d.colors[it.art]}">${it.art}</b> ${it.de}`; }
  makeBar() {
    let b = $('furnBar');
    if (!b) { b = document.createElement('div'); b.id = 'furnBar'; b.className = 'ui ui-panel-wood'; $('ui').appendChild(b); }
    b.style.display = 'flex';
    b.innerHTML = this.d.items.map(it => `<button class="ui ui-btn fitem" data-k="${it.key}"><img src="assets_v3/furnish/${it.key}.png"><span>${this.label(it)}</span><small>${it.price} M</small></button>`).join('') + '<button class="ui ui-btn" id="bFurnDone">Fertig</button>';
    b.querySelectorAll('.fitem').forEach(el => el.onclick = (e) => { e.stopPropagation(); this.pick(el.dataset.k); });
    $('bFurnDone').onclick = () => { this.cameras.main.fadeOut(250, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); };
  }
  pick(k) {
    const it = this.item(k); if (this.ghost) this.ghost.destroy();
    if (state.coins < it.price) { this.sel = null; return toast('Zu wenig Münzen: ' + it.price + ' M', 1600); }
    this.sel = it; this.ghost = this.add.image(-999, -999, 'fo_' + k).setOrigin(0.5, 1).setAlpha(0.85).setDepth(5000);
    toast(it.art + ' ' + it.de + ' — ' + it.ru, 1400); speakDE(it.art + ' ' + it.de);
  }
  snap(px, py) { const C = this.C * this.S; return [Math.round(px / C) * C / this.S, Math.round(py / C) * C / this.S]; }   // logical px, bottom-centre
  foot(it, x, y) {
    if (it.kind === 'decal') return [x - it.w / 2, y - it.h, x + it.w / 2, y];
    const fh = it.kind === 'wall' ? Math.max(8, Math.min(12, Math.round(it.h * 0.3))) : Math.max(8, Math.round(it.h * 0.5)), fw = it.w * 0.9; return [x - fw / 2, y - fh, x + fw / 2, y];   // half the height: things may stand behind each other, never inside
  }
  cellFloor(cx, cy) { if ((cy + 1) * this.C * this.S > this.barTop()) return false; const r = this.d.mask[cy]; return !!r && r[cx] === '1'; }   // cells hidden under the bar count as blocked
  barTop() { const b = $('furnBar'); return b && b.offsetHeight ? 540 - b.offsetHeight - 8 : 540; }
  check(it, x, y, ignore) {
    const [x0, y0, x1, y1] = this.foot(it, x, y), C = this.C;
    for (let cy = Math.floor(y0 / C); cy <= Math.floor((y1 - 1) / C); cy++) for (let cx = Math.floor(x0 / C); cx <= Math.floor((x1 - 1) / C); cx++) if (!this.cellFloor(cx, cy)) return 'Nur auf den Boden!';
    if (it.kind === 'wall') { const ry = Math.floor(y0 / C) - 1; let wall = false; for (let cx = Math.floor(x0 / C); cx <= Math.floor((x1 - 1) / C); cx++) if (!this.cellFloor(cx, ry)) wall = true; if (!wall) return 'Das muss an die Wand!'; }
    for (const p of this.placed) {
      if (p === ignore) continue; const deco = (p.it.kind === 'decal') !== (it.kind === 'decal'); if (deco) continue;
      const [a0, b0, a1, b1] = this.foot(p.it, p.x, p.y); if (x0 < a1 && a0 < x1 && y0 < b1 && b0 < y1) return 'Da steht schon etwas!';
    }
    return null;
  }
  move(p) {
    if (!this.sel || !this.ghost) return; const [x, y] = this.snap(p.x, p.y), bad = this.check(this.sel, x, y);
    this.ghost.setPosition(x * this.S, y * this.S); if (bad) this.ghost.setTexture('fi_' + this.sel.key).setTint(0xff6666); else this.ghost.setTexture('fo_' + this.sel.key).clearTint();
  }
  tap(p) {
    if (!this.sel) { const hit = this.placed.slice().reverse().find(q => q.spr.getBounds().contains(p.x, p.y)); if (hit) this.remove(hit); return; }
    const [x, y] = this.snap(p.x, p.y); this.place(this.sel.key, x, y);
  }
  place(k, x, y) {    // also used by tests: returns null when placed, else the reason
    const it = this.item(k), bad = state.coins < it.price ? 'Zu wenig Münzen' : this.check(it, x, y);
    if (bad) { toast(bad, 1600); return bad; }
    setCoins(state.coins - it.price); this.spawn(it, x, y, true); speakDE(it.art + ' ' + it.de); toast(it.art + ' ' + it.de + ' steht da!', 1400);
    if (this.ghost) { this.ghost.destroy(); this.ghost = null; } this.sel = null; return null;
  }
  spawn(it, x, y, save) {
    const spr = this.add.image(x * this.S, y * this.S, 'fo_' + it.key).setOrigin(0.5, 1).setDepth(it.kind === 'decal' ? -50 : y);
    const sh = it.kind === 'decal' ? null : this.add.ellipse(x * this.S + it.w * 0.5, y * this.S - 2, it.w * this.S * 0.9, 10, 0x0f1c08, 0.3).setDepth(y - 1);
    const q = { it, x, y, spr, sh }; this.placed.push(q);
    if (save) { state.furn.push({ k: it.key, x, y }); store.set(state); }
    return q;
  }
  remove(q) {
    q.spr.destroy(); if (q.sh) q.sh.destroy(); this.placed = this.placed.filter(r => r !== q);
    state.furn = this.placed.map(r => ({ k: r.it.key, x: r.x, y: r.y })); setCoins(state.coins + q.it.price); toast(q.it.art + ' ' + q.it.de + ' weggeräumt', 1400);
  }
}
window.Furnish = Furnish;
