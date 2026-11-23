// DeutschSpiel vertical slice: Yard -> tap house (zoom) -> lesson inside the scene -> spell (speech) -> reward visible in yard.
const W = 960, H = 540, HERO = 'Max';
const $ = (id) => document.getElementById(id);
const store = { get() { try { return JSON.parse(localStorage.getItem('ds_proto')) || { done: false, coins: 0 }; } catch (e) { return { done: false, coins: 0 }; } },
  set(v) { try { localStorage.setItem('ds_proto', JSON.stringify(v)); } catch (e) {} } };
let state = store.get(), lesson = null, assetKeys = {};
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); const st = $('stage'); st.style.transform = `scale(${s})`; st.style.left = (innerWidth - W * s) / 2 + 'px'; st.style.top = (innerHeight - H * s) / 2 + 'px'; }
addEventListener('resize', fit); fit();
function setCoins(n) { state.coins = n; store.set(state); $('coins').textContent = n; }
function toast(t, ms = 1500) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', ms); }
function speakDE(text) { try { const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} }
const audioEl = new Audio();
function playLine(l) { if (l.audio) { audioEl.src = 'audio/' + l.audio; audioEl.play().catch(() => speakDE(l.de)); } else speakDE(l.de); }
function norm(s) { return s.toLowerCase().replace(/[.,!?;:"']/g, '').split(/\s+/).filter(Boolean); }
function sceneSprite(sc, key, x, y, h, fallbackColor, label) {
  if (sc.textures.exists(key) && sc.textures.get(key).key !== '__MISSING') { const s = sc.add.image(x, y, key).setOrigin(0.5, 1); s.setScale(h / s.height); s.setDepth(y); return s; }
  const g = sc.add.rectangle(x, y, h * 0.7, h, fallbackColor).setOrigin(0.5, 1).setDepth(y); sc.add.text(x, y - h / 2, label, { fontSize: '14px', color: '#fff' }).setOrigin(0.5).setDepth(y + 1); return g;
}
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const keys = Object.keys(window.__assets);
    keys.forEach(k => this.load.image(k, 'assets/' + k + '.png'));
    ['panel_paper'].forEach(k => this.load.image(k, 'assets/' + k + '.png'));
    this.load.on('loaderror', (f) => console.warn('missing', f.key));
  }
  create() { $('icoCoin').src = 'assets/icon_coin.png'; $('icoCoin').onerror = function () { this.style.display = 'none'; }; setCoins(state.coins); this.scene.start('Yard'); }
}
class Yard extends Phaser.Scene {
  constructor() { super('Yard'); }
  create() {
    this.cameras.main.setBackgroundColor(0x5f8c46); this.cameras.main.setZoom(1).centerOn(W / 2, H / 2); this.cameras.main.fadeIn(300);
    const g = this.add.graphics().setDepth(-10);
    for (let y = 0; y < H; y += 24) for (let x = 0; x < W; x += 24) { g.fillStyle(((x / 24 + y / 24) % 2) ? 0x68964c : 0x5f8c46, 1); g.fillRect(x, y, 24, 24); }
    g.fillStyle(0xc9a56a, 1); g.fillRoundedRect(430, 290, 100, 260, 14); g.fillStyle(0xb08e55, 1); g.fillRect(430, 300, 100, 6);
    sceneSprite(this, 'tree_oak', 70, 330, 280, 0x2f6b2a, 'Eiche'); sceneSprite(this, 'tree_pine', 890, 360, 300, 0x2a5a30, 'Kiefer');
    sceneSprite(this, 'bush', 250, 300, 70, 0x3f8a3a, 'Busch');
    for (let x = 130; x < 830; x += 150) if (x < 380 || x > 560) sceneSprite(this, 'fence', x, 535, 60, 0x9c6a35, 'Zaun');
    this.house = sceneSprite(this, 'house', 480, 300, 290, 0xa35d3b, 'Elternhaus');
    this.hero = sceneSprite(this, 'hero', 340, 450, 150, 0x2d3a6b, HERO);
    this.brezel = sceneSprite(this, 'brezel_sit', 600, 470, 80, 0x222222, 'Brezel');
    this.tweens.add({ targets: this.brezel, scaleY: this.brezel.scaleY * 1.04, duration: 700, yoyo: true, repeat: -1 });
    if (state.done) { this.reward = [sceneSprite(this, 'mailbox', 420, 420, 90, 0xd9b100, 'Briefkasten'), sceneSprite(this, 'flowerbed', 560, 330, 60, 0xc0392b, 'Blumen')]; $('goalTxt').textContent = 'Ziel: Bäckerei (bald)'; }
    else { this.arrow = this.add.triangle(480, 40, 0, 0, 36, 0, 18, 26, 0xffd23f).setDepth(999).setStrokeStyle(3, 0x3b2314); this.tweens.add({ targets: this.arrow, y: 56, duration: 500, yoyo: true, repeat: -1 }); $('goalTxt').textContent = 'Ziel: Elternhaus'; }
    this.house.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.enter());
    this.brezel.setInteractive({ useHandCursor: true }).on('pointerdown', () => { toast('Wuff!'); this.tweens.add({ targets: this.brezel, y: this.brezel.y - 26, duration: 150, yoyo: true }); });
    $('dlg').style.display = 'none';
    if (state.done && this.registry.get('justDone')) { this.registry.set('justDone', false); this.rewardPop(); }
  }
  rewardPop() { (this.reward || []).forEach((r, i) => { const sx = r.scaleX || 1, sy = r.scaleY || 1; r.setScale(0); this.tweens.add({ targets: r, scaleX: sx, scaleY: sy, duration: 500, delay: 300 + i * 250, ease: 'Back.easeOut' }); }); toast('Der Briefkasten ist da!', 2500); this.tweens.add({ targets: this.brezel, y: this.brezel.y - 40, duration: 200, yoyo: true, repeat: 3 }); }
  enter() {
    if (this.busy) return; this.busy = true; if (this.arrow) this.arrow.destroy();
    this.tweens.add({ targets: this.hero, x: 480, y: 310, scale: this.hero.scale * 0.8, duration: 700 });
    const cam = this.cameras.main; cam.pan(480, 230, 800, 'Sine.easeInOut'); cam.zoomTo(2.2, 800, 'Sine.easeInOut');
    this.time.delayedCall(700, () => cam.fadeOut(300, 29, 19, 11));
    cam.once('camerafadeoutcomplete', () => this.scene.start('Room'));
  }
}
class Room extends Phaser.Scene {
  constructor() { super('Room'); }
  create() {
    this.cameras.main.setBackgroundColor(0x2b1a10); this.cameras.main.fadeIn(300);
    if (this.textures.exists('kitchen')) { const k = this.add.image(W / 2, H / 2 - 20, 'kitchen'); k.setScale(500 / k.height); }
    this.hero = sceneSprite(this, 'hero', 250, 470, 250, 0x2d3a6b, HERO); this.npc = sceneSprite(this, 'schmidt', 720, 470, 270, 0x555555, 'Herr Schmidt');
    this.i = 0; this.coinsEarned = 0; $('dlg').style.display = 'block'; this.show();
    $('bHear').onclick = () => playLine(lesson.lines[this.i]);
    $('bNext').onclick = () => this.next(); $('bSpeak').onclick = () => this.speak();
  }
  show() {
    const l = lesson.lines[this.i], mine = l.role === 'A';
    $('who').textContent = mine ? HERO : 'Herr Schmidt'; $('de').textContent = ''; const txt = l.de.replace('{hero_name}', HERO); let n = 0;
    clearInterval(this.tw); this.tw = setInterval(() => { $('de').textContent = txt.slice(0, ++n); if (n >= txt.length) clearInterval(this.tw); }, 28);
    $('ru').textContent = l.ru; $('bSpeak').style.display = mine ? '' : 'none'; $('bNext').style.display = mine ? 'none' : '';
    if (!mine) { this.tweens.add({ targets: this.npc, y: this.npc.y - 10, duration: 160, yoyo: true }); setTimeout(() => playLine(l), 250); }
  }
  speak() {
    const l = lesson.lines[this.i], target = norm(l.de.replace('{hero_name}', HERO)), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const ok = () => { this.spell(); setTimeout(() => this.next(), 900); };
    if (!SR || /[?&]auto/.test(location.search)) { toast('Spracherkennung fehlt: zählt als gesagt', 1800); return ok(); }
    const r = new SR(); r.lang = 'de-DE'; r.maxAlternatives = 3; toast('Sprich jetzt!', 3000);
    r.onresult = (e) => { const heard = norm(e.results[0][0].transcript), hit = target.filter(w => heard.includes(w)).length / target.length; if (hit >= 0.6) ok(); else toast('Fast! Nochmal: ' + e.results[0][0].transcript, 2500); };
    r.onerror = () => { toast('Kein Mikrofon: zählt als gesagt', 1800); ok(); }; r.start();
  }
  spell() {
    const cx = this.hero.x, cy = this.hero.y - 160;
    for (let k = 0; k < 24; k++) { const d = this.add.circle(cx, cy, 5, k % 2 ? 0xffd23f : 0xffffff).setDepth(999), a = k / 24 * Math.PI * 2, r = 80 + Math.random() * 90;
      this.tweens.add({ targets: d, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r - 20, alpha: 0, duration: 800, onComplete: () => d.destroy() }); }
    this.tweens.add({ targets: this.npc, y: this.npc.y - 18, duration: 150, yoyo: true, repeat: 1 }); this.coinsEarned += 5; setCoins(state.coins + 5); toast('Zauber! +5', 1100);
  }
  next() {
    clearInterval(this.tw); this.i++;
    if (this.i >= lesson.lines.length) { $('dlg').style.display = 'none'; return this.finish(); }
    this.show();
  }
  finish() {
    const bonus = 20; setCoins(state.coins + bonus); state.done = true; store.set(state);
    $('rwItems').innerHTML = ['icon_coin', 'icon_bread'].map(k => `<img src="assets/${k}.png" onerror="this.style.display='none'">`).join('');
    $('rwTxt').textContent = `+${this.coinsEarned + bonus} Münzen · Briefkasten für den Hof`; $('reward').style.display = 'block';
    $('bBack').onclick = () => { $('reward').style.display = 'none'; this.registry.set('justDone', true); this.cameras.main.fadeOut(300, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Yard')); };
  }
}
$('reset').onclick = () => { store.set({ done: false, coins: 0 }); location.reload(); };
Promise.all([fetch('lesson.json').then(r => r.json()), fetch('assets.json').then(r => r.json())]).then(([l, a]) => {
  lesson = l; window.__assets = Object.assign({}, a, { icon_coin: 1, icon_bread: 1, mailbox: 1, flowerbed: 1, tree_oak: 1, tree_pine: 1, fence: 1, bush: 1, doghouse: 1 });
  new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#5f8c46', scene: [Boot, Yard, Room], render: { antialias: true, roundPixels: false }, audio: { noAudio: true } });
});
