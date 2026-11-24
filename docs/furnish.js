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
    this.sel = null; this.ghost = null; this.makeBar(); if (window.fitCam) setTimeout(() => window.fitCam(this), 0);
    ['bag', 'bFurn', 'bMap'].forEach(k => $(k).style.display = 'none'); $('dlg').style.display = 'none'; $('goalTxt').textContent = 'Einrichten: tippe ein Möbel';
    // предмет в руках (this.mode): палец двигает ПРЕДМЕТ (комната стоит, responsive.js __noPan), ставит кнопка «Hinstellen»;
    // в руках ничего: палец двигает комнату, тап по мебели берёт её в руки (переставить / Wegräumen)
    this.input.on('pointerdown', p => {
      this.__down = [p.x, p.y]; this.__grab = null;
      if (!this.mode || (this.input.pointer2 && this.input.pointer2.isDown)) return;
      const g = this.ghost; if (!g) return;
      const b = g.getBounds(); b.x -= 14; b.y -= 14; b.width += 28; b.height += 28;   // палец толще пикселя: зона захвата шире предмета
      if (b.contains(p.worldX, p.worldY)) this.__grab = [g.x - p.worldX, g.y - p.worldY];
      else { this.moveTo(p.worldX, p.worldY); this.__grab = [0, 0]; }                 // тап мимо — предмет прыгает под палец
    });
    this.input.on('pointermove', p => { if (this.mode && this.__grab && p.isDown) this.moveTo(p.worldX + this.__grab[0], p.worldY + this.__grab[1]); });
    this.input.on('pointerup', p => { const d = this.__down; this.__down = null; this.__grab = null; if (!this.mode && d && !this.__dragged && Math.hypot(p.x - d[0], p.y - d[1]) < 10) this.tap(p); });
    this.events.once('shutdown', () => { const b = $('furnBar'); if (b) b.style.display = 'none'; window.__furn = null; });
  }
  item(k) { return this.d.items.find(i => i.key === k); }
  label(it) { return `<b style="color:${this.d.colors[it.art]}">${it.art}</b> ${it.de}`; }
  makeBar() {
    let b = $('furnBar');
    if (!b) { b = document.createElement('div'); b.id = 'furnBar'; b.className = 'ui ui-panel-wood'; $('ui').appendChild(b); }
    if (!$('furnCss')) { const st = document.createElement('style'); st.id = 'furnCss';
      st.textContent = '#furnBar .fhint{flex:1 1 100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff7e0;text-shadow:0 2px 0 #2a170c;padding:2px 6px}'
        + '#furnBar .fhint small{font-size:13px;font-weight:600;opacity:.9}#furnBar #bFOk,#furnBar #bFNo,#furnBar #bFDel{flex:1 1 28%;font-size:17px;font-weight:700}'
        + '#furnBar #bFOk{color:#1f5a22}#furnBar #bFOk.off{opacity:.45;filter:grayscale(.7)}#furnBar #bFNo{color:#7a2a1a}';
      document.head.appendChild(st); }
    b.style.display = 'flex'; b.style.flexWrap = 'wrap'; b.style.justifyContent = 'center';
    b.innerHTML = this.d.items.map(it => `<button class="ui ui-btn fitem" data-k="${it.key}"><img src="assets_v3/furnish/${it.key}.png"><span>${this.label(it)}</span><small>${it.price} M</small></button>`).join('') + '<button class="ui ui-btn" id="bFurnDone">Fertig</button>';
    b.querySelectorAll('.fitem').forEach(el => el.onclick = (e) => { e.stopPropagation(); this.pick(el.dataset.k); });
    $('bFurnDone').onclick = () => { this.cameras.main.fadeOut(250, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); };
  }
  pick(k) {
    const it = this.item(k); this.endMode(true);
    if (state.coins < it.price) { this.sel = null; return toast('Zu wenig Münzen: ' + it.price + ' M', 1600); }
    this.sel = it; const m = this.cameras.main.midPoint, at = this.freeNear(it, m.x, m.y);
    this.startMode({ kind: 'new', it, x: at[0], y: at[1] });
    speakDE(it.art + ' ' + it.de);
  }
  freeNear(it, wx, wy) {                                             // ближайшее свободное место к точке (логические px), иначе сама точка
    const [x0, y0] = this.snap(wx, wy), st = 4;
    for (let r = 0; r <= 160; r += st) for (let dy = -r; dy <= r; dy += st) for (const dx of (Math.abs(dy) === r ? Array.from({ length: 2 * r / st + 1 }, (_, i) => -r + i * st) : [-r, r])) {
      if (!this.check(it, x0 + dx, y0 + dy, this.mode && this.mode.q)) return [x0 + dx, y0 + dy];
    }
    return [x0, y0];
  }
  startMode(mode) {                                                  // предмет в руках: призрак + подпись + кнопки внизу
    this.mode = mode; this.__noPan = true;
    this.ghost = this.add.image(0, 0, 'fo_' + mode.it.key).setOrigin(0.5, 1).setAlpha(0.9).setDepth(5000);
    this.why = this.add.text(0, 0, '', { fontFamily: 'Roboto, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#fff7e0', stroke: '#2a170c', strokeThickness: 4, align: 'center' }).setOrigin(0.5, 1).setDepth(5001);
    this.arrows = this.add.text(0, 0, '⇆', { fontFamily: 'Roboto, sans-serif', fontSize: '22px', color: '#ffd23f', stroke: '#2a170c', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(5001);
    this.tweens.add({ targets: this.arrows, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    this.actBar(); this.moveTo(mode.x * this.S, mode.y * this.S);
  }
  moveTo(wx, wy) {
    const M = this.mode; if (!M || !this.ghost) return; const [x, y] = this.snap(wx, wy); M.x = x; M.y = y;
    const bad = this.check(M.it, x, y, M.q); M.bad = bad;
    this.ghost.setPosition(x * this.S, y * this.S); if (bad) this.ghost.setTexture('fi_' + M.it.key).setTint(0xff6666); else this.ghost.setTexture('fo_' + M.it.key).clearTint();
    const RU = { 'Nur auf den Boden!': 'только на пол', 'Das muss an die Wand!': 'это ставят к стене', 'Da steht schon etwas!': 'тут уже что-то стоит' };
    this.why.setText(bad ? bad + '\n' + (RU[bad] || '') : M.it.art + ' ' + M.it.de).setColor(bad ? '#ff9a8a' : this.d.colors[M.it.art] || '#fff7e0');
    const top = this.ghost.getBounds().top; this.why.setPosition(x * this.S, top - 4); this.arrows.setPosition(x * this.S, y * this.S + 2);
    const ok = document.getElementById('bFOk'); if (ok) ok.classList.toggle('off', !!bad);
  }
  actBar() {                                                         // полка мебели -> кнопки действия той же высоты (комната не прыгает)
    const b = $('furnBar'), M = this.mode, h = b.offsetHeight; b.style.minHeight = h + 'px';
    b.innerHTML = `<div class="fhint"><span><b style="color:${this.d.colors[M.it.art]}">${M.it.art}</b> ${M.it.de} <i style="font-style:normal;font-size:13px;opacity:.85">${M.it.ru || ''}</i></span><small>${M.kind === 'move' ? 'Zieh es woandershin · тяни в другое место' : 'Zieh es mit dem Finger · тяни пальцем'}</small></div>`
      + `<button class="ui ui-btn" id="bFOk">✓ Hinstellen<small>поставить${M.kind === 'new' ? ' · ' + M.it.price + ' M' : ''}</small></button>`
      + (M.kind === 'move' ? `<button class="ui ui-btn" id="bFDel">Wegräumen<small>убрать · +${M.it.price} M</small></button>` : '')
      + `<button class="ui ui-btn" id="bFNo">✗ Abbrechen<small>отмена</small></button>`;
    $('bFOk').onclick = e => { e.stopPropagation(); this.confirm(); };
    $('bFNo').onclick = e => { e.stopPropagation(); this.endMode(); };
    if ($('bFDel')) $('bFDel').onclick = e => { e.stopPropagation(); const q = this.mode.q; this.endMode(true); this.remove(q); this.makeBar(); };
  }
  confirm() {
    const M = this.mode; if (!M) return;
    if (M.bad) { toast(M.bad, 1400); return; }
    if (M.kind === 'new') { const k = M.it.key, x = M.x, y = M.y; this.endMode(true); this.place(k, x, y); this.makeBar(); return; }
    const q = M.q; q.x = M.x; q.y = M.y; q.spr.setPosition(q.x * this.S, q.y * this.S).setDepth(q.it.kind === 'decal' ? -50 : q.y);
    if (q.sh) q.sh.setPosition(q.x * this.S + q.it.w * 0.5, q.y * this.S - 2).setDepth(q.y - 1);
    this.save(); toast(q.it.art + ' ' + q.it.de + ' steht jetzt hier', 1400); this.endMode();
  }
  endMode(keepBar) {                                                 // предмет из рук: переставляемая мебель возвращается на своё место
    const M = this.mode; this.mode = null; this.sel = null; this.__noPan = false; this.__grab = null;
    if (M && M.q) { M.q.spr.setVisible(true); if (M.q.sh) M.q.sh.setVisible(true); }
    ['ghost', 'why', 'arrows'].forEach(k => { if (this[k]) { this[k].destroy(); this[k] = null; } });
    if (!keepBar) this.makeBar();
  }
  save() { state.furn = this.placed.map(r => ({ k: r.it.key, x: r.x, y: r.y })); store.set(state); }
  snap(px, py) { const C = 4 * this.S; return [Math.round(px / C) * C / this.S, Math.round(py / C) * C / this.S]; }   // logical px, bottom-centre
  foot(it, x, y) {
    if (it.kind === 'decal') return [x - it.w / 2, y - it.h, x + it.w / 2, y];
    const fh = it.kind === 'wall' ? Math.max(8, Math.min(12, Math.round(it.h * 0.3))) : Math.max(6, Math.round(it.h * 0.25)), fw = it.w * 0.9; return [x - fw / 2, y - fh, x + fw / 2, y];   // half the height: things may stand behind each other, never inside
  }
  cellFloor(cx, cy) { if ((cy + 1) * this.C * this.S > this.barTop()) return false; const r = this.d.mask[cy]; return !!r && r[cx] === '1'; }   // cells hidden under the bar count as blocked
  barTop() { const b = $('furnBar'); if (!b || !b.offsetHeight) return 540; return Math.min(540, this.cameras.main.getWorldPoint(0, b.getBoundingClientRect().top - 8).y); }   // граница полки — по экрану, с учётом камеры
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
  tap(p) {                                                           // в руках ничего: тап по мебели — взять её в руки (переставить бесплатно / убрать)
    const hit = this.placed.slice().reverse().find(q => q.spr.getBounds().contains(p.worldX, p.worldY)); if (!hit) return;
    hit.spr.setVisible(false); if (hit.sh) hit.sh.setVisible(false); speakDE(hit.it.art + ' ' + hit.it.de);
    this.startMode({ kind: 'move', it: hit.it, x: hit.x, y: hit.y, q: hit });
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
    setCoins(state.coins + q.it.price); this.save(); toast(q.it.art + ' ' + q.it.de + ' weggeräumt', 1400);
  }
}
window.Furnish = Furnish;
