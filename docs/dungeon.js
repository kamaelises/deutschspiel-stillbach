// Подземелье «der Keller» (тема A1) — шаг 1 из design-doc/rpg-design.md (раздел 2): каждое посещение новое.
// Генерация на лету по сиду: крупная решётка (клетка = 2x2 тайла пола + линия стены в 1 тайл), BSP-комнаты (6–12),
// коридоры шириной 2 тайла по минимальному дереву + 1–2 петли; 3 этажа: люк с лестницей вниз на 1–2, комната босса на 3-м.
// Стены всегда в один тайл (только на линиях решётки) -> автотайл по 4 соседям без «толстых» кусков и дыр.
// Арт: craftpix 436971 «Free Top-Down Roguelike Game Kit» (16 px, ×3 NEAREST; free license — коммерция ок):
// assets_v3/dungeon/tileset.png, objects.png, anim.png, details.png. Свет один: тени вправо-вниз, факелы на стенах.
// Враги и бой — шаг 2: здесь только места — sc.spawns, сундуки — sc.chests, босс — sc.boss. Выход «Raus» — в деревню.
(function () {
  const T = 16, SC = 3, TS = T * SC, CW = 13, CH = 17, FLOORS = 3, VOID = '#181425';   // верхний ряд решётки пустой: место под плашку HUD
  // автотайл стены: маска соседей-стен N=1 E=2 S=4 W=8 -> тайл (кол, ряд) в tileset.png; лицевая кладка — где снизу не стена
  const WALL = { 0: [[9, 1]], 1: [[7, 2]], 2: [[11, 2]], 3: [[1, 5]], 4: [[7, 1]], 5: [[1, 2], [1, 3], [1, 4], [5, 2], [5, 3], [5, 4]], 6: [[1, 1]], 7: [[8, 8]],
    8: [[13, 2]], 9: [[5, 5]], 10: [[2, 1], [3, 1], [4, 1], [2, 5], [3, 5], [4, 5], [2, 9]], 11: [[12, 2]], 12: [[5, 1]], 13: [[6, 8]], 14: [[12, 4]], 15: [[12, 8]] };
  const FLOOR = [[2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3]];
  // предметы у стен (objects.png, рамки по альфе): top — к лицевой стене, side — у боковых, bottom — у нижней
  const PROPS = {
    pot1: [2, 81, 13, 13], pot2: [18, 81, 13, 13], pot3: [34, 81, 13, 13], sack1: [98, 82, 11, 13], sack2: [119, 82, 17, 13], sack3: [146, 81, 11, 14],
    crate1: [1, 109, 13, 15], crate2: [17, 108, 14, 16], crate3: [49, 108, 13, 15], bucket1: [2, 66, 10, 11], bucket2: [19, 66, 9, 11],
    dresser1: [48, 391, 16, 22], dresser2: [96, 391, 16, 22], cabinet: [96, 359, 16, 16],
  };
  const ROW = { top: ['crate1', 'crate2', 'crate3', 'dresser1', 'dresser2', 'cabinet', 'sack2', 'pot3', 'crate1', 'sack2'], side: ['pot1', 'pot2', 'sack1', 'sack3', 'crate1', 'bucket1', 'bucket2', 'pot3'], bottom: ['pot1', 'pot2', 'bucket1', 'bucket2', 'sack1'] };
  const TALL = { dresser1: 1, dresser2: 1 };
  const CHEST = [1, 162, 13, 14];                                  // anim.png: сундук закрыт (кадры открытия рядом — для шага 2)
  const BONES = [[523, 87, 10, 4], [507, 97, 10, 4], [531, 97, 10, 4], [507, 119, 11, 4], [531, 129, 11, 4]], WEB = [560, 39, 16, 9], STICK = [566, 140, 4, 8];   // details.png

  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function gen(seed, floor) {
    const R = rng((seed * 9973 + floor * 7919 + 17) >>> 0), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
    const want = [ri(6, 8), ri(7, 10), ri(8, 12)][floor], MIN = 4;
    // 1) BSP по крупной решётке
    let leaves = [{ x: 0, y: 1, w: CW, h: CH - 1 }];
    while (leaves.length < want) {
      const cand = leaves.filter(l => l.w >= MIN * 2 || l.h >= MIN * 2).sort((a, b) => b.w * b.h - a.w * a.h); if (!cand.length) break;
      const l = cand[cand.length > 1 && R() < 0.3 ? 1 : 0]; leaves.splice(leaves.indexOf(l), 1);
      const vert = l.w >= MIN * 2 && (l.h < MIN * 2 || l.w > l.h || (l.w === l.h && R() < 0.5));
      if (vert) { const k = ri(MIN, l.w - MIN); leaves.push({ x: l.x, y: l.y, w: k, h: l.h }, { x: l.x + k, y: l.y, w: l.w - k, h: l.h }); }
      else { const k = ri(MIN, l.h - MIN); leaves.push({ x: l.x, y: l.y, w: l.w, h: k }, { x: l.x, y: l.y + k, w: l.w, h: l.h - k }); }
    }
    const cell = [...Array(CH)].map(() => Array(CW).fill(-1)), lH = [...Array(CH)].map(() => Array(CW).fill(false)), lV = [...Array(CH)].map(() => Array(CW).fill(false));
    const rooms = leaves.map((l, i) => {                            // комната внутри листа, с зазором в 1 клетку до соседнего листа
      const rw = ri(2, Math.min(4, l.w - 1)), rh = ri(2, Math.min(4, l.h - 1)), rx = l.x + ri(0, l.w - 1 - rw), ry = l.y + ri(0, l.h - 1 - rh);
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) { cell[y][x] = i; if (x > rx) lH[y][x - 1] = true; if (y > ry) lV[y - 1][x] = true; }
      return { id: i, rx, ry, rw, rh, c: [rx + (rw >> 1), ry + (rh >> 1)], x0: 3 * rx + 1, y0: 3 * ry + 1, x1: 3 * (rx + rw) - 1, y1: 3 * (ry + rh) - 1 };
    });
    // 2) коридоры: минимальное дерево (Прим, манхэттен) + 1–2 петли
    const n = rooms.length, dist = (a, b) => Math.abs(a.c[0] - b.c[0]) + Math.abs(a.c[1] - b.c[1]), inT = [0], edges = [], has = new Set();
    while (inT.length < n) {
      let best = null; for (const a of inT) for (let b = 0; b < n; b++) if (!inT.includes(b)) { const d = dist(rooms[a], rooms[b]); if (!best || d < best[2]) best = [a, b, d]; }
      inT.push(best[1]); edges.push(best); has.add(Math.min(best[0], best[1]) + ',' + Math.max(best[0], best[1]));
    }
    const extra = []; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!has.has(a + ',' + b)) extra.push([a, b, dist(rooms[a], rooms[b])]);
    extra.sort((p, q) => p[2] - q[2]); const loops = ri(1, 2);
    for (let k = 0; k < loops && extra.length; k++) edges.push(extra.splice(Math.floor(R() * Math.min(4, extra.length)), 1)[0]);
    const carve = (a, b) => {
      let x = a[0], y = a[1]; const path = [[x, y]], hFirst = R() < 0.5;
      const goX = () => { while (x !== b[0]) { x += Math.sign(b[0] - x); path.push([x, y]); } }, goY = () => { while (y !== b[1]) { y += Math.sign(b[1] - y); path.push([x, y]); } };
      if (hFirst) { goX(); goY(); } else { goY(); goX(); }
      path.forEach(([px, py], i) => { if (cell[py][px] === -1) cell[py][px] = -2; if (i) { const [qx, qy] = path[i - 1]; if (qx !== px) lH[py][Math.min(px, qx)] = true; else lV[Math.min(py, qy)][px] = true; } });
    };
    edges.forEach(([a, b]) => carve(rooms[a].c, rooms[b].c));
    // 3) тайлы: 0 пусто, 1 пол, 2 стена
    const TW = 3 * CW + 1, TH = 3 * CH + 1, kind = [...Array(TH)].map(() => Array(TW).fill(0)), own = [...Array(TH)].map(() => Array(TW).fill(-1));
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      const mx = tx % 3, my = ty % 3, cx = (tx / 3) | 0, cy = (ty / 3) | 0; let f = false, o = -2;
      if (mx && my) { f = cell[cy] !== undefined && cell[cy][cx] !== undefined && cell[cy][cx] !== -1; o = f ? cell[cy][cx] : -1; }
      else if (!mx && my) { f = cx > 0 && cx < CW && lH[cy][cx - 1]; if (f && cell[cy][cx - 1] === cell[cy][cx] && cell[cy][cx] >= 0) o = cell[cy][cx]; }
      else if (mx && !my) { f = cy > 0 && cy < CH && lV[cy - 1][cx]; if (f && cell[cy - 1][cx] === cell[cy][cx] && cell[cy][cx] >= 0) o = cell[cy][cx]; }
      else { f = cx > 0 && cy > 0 && cx < CW && cy < CH && lH[cy - 1][cx - 1] && lH[cy][cx - 1] && lV[cy - 1][cx - 1] && lV[cy - 1][cx]; if (f && cell[cy][cx] >= 0 && cell[cy - 1][cx - 1] === cell[cy][cx]) o = cell[cy][cx]; }
      if (f) { kind[ty][tx] = 1; own[ty][tx] = o; }
    }
    const at = (x, y) => (y >= 0 && y < TH && x >= 0 && x < TW ? kind[y][x] : 0), isW = (x, y) => at(x, y) === 2;
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) if (!kind[ty][tx]) {
      let nb = false; for (let dy = -1; dy <= 1 && !nb; dy++) for (let dx = -1; dx <= 1; dx++) if (at(tx + dx, ty + dy) === 1) { nb = true; break; }
      if (nb) kind[ty][tx] = 2;
    }
    let thick = 0; for (let y = 0; y < TH - 1; y++) for (let x = 0; x < TW - 1; x++) if (isW(x, y) && isW(x + 1, y) && isW(x, y + 1) && isW(x + 1, y + 1)) thick++;
    const wmask = (x, y) => (isW(x, y - 1) ? 1 : 0) | (isW(x + 1, y) ? 2 : 0) | (isW(x, y + 1) ? 4 : 0) | (isW(x - 1, y) ? 8 : 0);
    const wt = [...Array(TH)].map((_, y) => [...Array(TW)].map((_, x) => { if (!isW(x, y)) return null; const v = WALL[wmask(x, y)]; return v[(x * 7 + y * 13 + seed) % v.length]; }));
    const fv = [...Array(TH)].map(() => [...Array(TW)].map(() => pick(FLOOR)));
    // 4) вход, цель (дальняя комната), лестница вверх, факелы
    const bfs = (sx, sy) => { const D = [...Array(TH)].map(() => Array(TW).fill(-1)), q = [[sx, sy]]; D[sy][sx] = 0; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (at(a, b) === 1 && D[b][a] < 0) { D[b][a] = D[y][x] + 1; q.push([a, b]); } } } return D; };
    const topSlots = r => { const out = []; for (let x = r.x0; x <= r.x1; x++) if (isW(x, r.y0 - 1) && wmask(x, r.y0 - 1) === 10) out.push(x); return out; };
    const order = rooms.map(r => r.id).sort(() => R() - 0.5); let ent = order.find(i => topSlots(rooms[i]).length) ; if (ent === undefined) ent = 0;
    const E = rooms[ent], cxOf = r => (r.x0 + r.x1 + 1) >> 1, cyOf = r => (r.y0 + r.y1 + 1) >> 1;
    const D = bfs(cxOf(E), cyOf(E)); let tgt = -1, far = -1;
    rooms.forEach(r => { const d = D[cyOf(r)][cxOf(r)]; if (r.id !== ent && d > far) { far = d; tgt = r.id; } });
    const G = rooms[tgt], last = floor === FLOORS - 1;
    const slots = topSlots(E).sort((a, b) => Math.abs(a - cxOf(E)) - Math.abs(b - cxOf(E))), lx = slots.length ? slots[0] : cxOf(E);
    const ladder = { tx: lx, ty: E.y0 - 1 };
    const torches = [];
    rooms.forEach(r => { const s = topSlots(r).filter(x => r.id !== ent || Math.abs(x - lx) > 1); const want2 = r.x1 - r.x0 >= 7 ? 2 : 1;
      for (let k = 0; k < want2 && s.length; k++) { const i = Math.floor(R() * s.length), x = s[i]; torches.push({ tx: x, ty: r.y0 - 1, room: r.id }); for (let j = s.length - 1; j >= 0; j--) if (Math.abs(s[j] - x) < 3) s.splice(j, 1); } });
    // 5) люк вниз / печать босса, сундук, предметы у стен, места врагов
    const blocked = [...Array(TH)].map(() => Array(TW).fill(0)), keep = [...Array(TH)].map(() => Array(TW).fill(0));
    const mark = (A, x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (A[y] && A[y][x] !== undefined) A[y][x] = v; };
    let pit = null, boss = null, seal = null;
    const gx = (G.x0 + G.x1) >> 1, gy = Math.max(G.y0 + 1, ((G.y0 + G.y1) >> 1) - 1);
    if (!last) { pit = { tx: gx, ty: gy, at: [(gx + 1) * TS, (gy + 2) * TS + 30] }; mark(blocked, gx, gy, gx + 1, gy + 1, 1); mark(keep, gx - 1, gy - 1, gx + 2, gy + 3, 1); }
    else { const bx = cxOf(G), by = cyOf(G); seal = { tx: bx - 1, ty: by - 1 }; boss = { x: bx * TS, y: by * TS + 24, room: G.id }; mark(keep, bx - 2, by - 2, bx + 1, by + 1, 1); }
    mark(keep, lx - 1, E.y0, lx + 1, E.y0 + 3, 1);
    const nearDoor = (r, x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (at(a, b) === 1 && own[b][a] !== r.id) return true; } return false; };
    const torchAt = new Set(torches.map(t => t.tx + ',' + (t.ty + 1)));
    const ring = r => { const out = []; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if ((x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1) && !nearDoor(r, x, y) && !keep[y][x]) out.push([x, y, y === r.y0 ? 'top' : y === r.y1 ? 'bottom' : 'side']); return out; };
    const chests = [], props = [], spawns = [];
    { const cand = (last ? [G] : []).concat(rooms.filter(r => r.id !== ent && r.id !== tgt).sort(() => R() - 0.5), [G, E]);   // сундук — у стены, в комнате без входа
      let p = null, cr = null; for (const row of ['top', 'side']) { for (const r of cand) { const s = ring(r).filter(q => q[2] === row); if (s.length) { p = s[Math.floor(R() * s.length)]; cr = r; break; } } if (p) break; }
      if (p) { chests.push({ tx: p[0], ty: p[1], x: p[0] * TS + 24, y: p[1] * TS + 40, room: cr.id }); blocked[p[1]][p[0]] = 2; } }
    rooms.forEach(r => {
      const s = ring(r).filter(([x, y]) => !blocked[y][x]), share = r.id === ent ? 0.2 : r.id === tgt ? 0.14 : 0.32;
      let k = Math.round(s.length * share);
      while (k-- > 0 && s.length) { const [x, y, row] = s.splice(Math.floor(R() * s.length), 1)[0]; let t = pick(ROW[row]); if (TALL[t] && torchAt.has(x + ',' + y)) t = 'crate1'; props.push({ t, tx: x, ty: y }); blocked[y][x] = 3; }
      if (r.id === ent || (last && r.id === tgt)) return;
      const inner = []; for (let y = r.y0 + 1; y < r.y1; y++) for (let x = r.x0 + 1; x < r.x1; x++) if (!blocked[y][x] && !keep[y][x]) inner.push([x, y]);
      let m = Math.min(3, 1 + floor + ((r.rw * r.rh >= 9) ? 1 : 0) - (r.id === tgt ? 1 : 0));
      while (m-- > 0 && inner.length) { const [x, y] = inner.splice(Math.floor(R() * inner.length), 1)[0]; spawns.push({ x: x * TS + 24, y: y * TS + 36, room: r.id }); }
    });
    // 6) мелочи на полу (не мешают ходить): кости, паутина в верхних углах
    const decals = [];
    rooms.forEach(r => {
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!blocked[y][x] && !keep[y][x] && R() < (r.id === tgt && last ? 0.12 : 0.035)) decals.push({ k: 'bone', v: pick(BONES), tx: x, ty: y, ox: ri(1, 4), oy: ri(4, 10) });
      [[r.x0, 'l'], [r.x1, 'r']].filter(() => R() < 0.5).slice(0, 1).forEach(([x, side]) => { if (R() < 0.6 && !blocked[r.y0][x] && !nearDoor(r, x, r.y0) && !keep[r.y0][x]) decals.push({ k: 'web', tx: x, ty: r.y0, side }); });
    });
    // 7) маска ходьбы, клетка 24 px (2x2 на тайл): у боковых и нижней стены — отступ, чтобы Max не залезал на стену
    const MW = TW * 2, MH = TH * 2, wk = [...Array(MH)].map(() => new Uint8Array(MW));
    for (let sy = 0; sy < MH; sy++) for (let sx = 0; sx < MW; sx++) {
      const tx = sx >> 1, ty = sy >> 1, qx = sx & 1, qy = sy & 1; let ok = kind[ty][tx] === 1 && !blocked[ty][tx];
      if (ok && qx === 0 && isW(tx - 1, ty)) ok = false;
      if (ok && qx === 1 && isW(tx + 1, ty)) ok = false;
      if (ok && qy === 1 && (isW(tx, ty + 1) || isW(qx ? tx + 1 : tx - 1, ty + 1))) ok = false;
      wk[sy][sx] = ok ? 1 : 0;
    }
    let spawn = [lx * TS + 24, (E.y0 + 3) * TS + 12]; const exit = [lx * TS + 24, E.y0 * TS + 30];
    { let best = null; for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (wk[y][x]) { const dd = Math.hypot(x * 24 + 12 - spawn[0], y * 24 + 12 - spawn[1]); if (!best || dd < best[0]) best = [dd, x, y]; }
      if (best) spawn = [best[1] * 24 + 12, best[2] * 24 + 12]; }        // старт — центр ближайшей проходимой клетки
    { // только клетки, до которых можно дойти от входа (иначе A* «срежет» сквозь стену)
      const seen = [...Array(MH)].map(() => new Uint8Array(MW)), s0 = [spawn[0] / 24 | 0, spawn[1] / 24 | 0], q = [s0]; seen[s0[1]][s0[0]] = 1;
      const ok = (x, y) => y >= 0 && y < MH && x >= 0 && x < MW && wk[y][x] === 1;
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const a = x + dx, b = y + dy; if (!ok(a, b) || seen[b][a] || (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy)))) continue; seen[b][a] = 1; q.push([a, b]); } }
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (!seen[y][x]) wk[y][x] = 0;
    }
    const mask = wk.map(r => Array.from(r).join(''));
    return { seed, floor, TW, TH, kind, own, wt, fv, rooms, ent, tgt, ladder, torches, pit, seal, boss, chests, props, spawns, decals, mask, spawn, exit, thick, edges: edges.length };
  }

  function makeTex(sc, key, img, r, shadow) {                     // кусок листа -> своя текстура (+ тень вправо-вниз на 2/1 px)
    if (sc.textures.exists(key)) return;
    const [x, y, w, h] = r, cv = document.createElement('canvas'); cv.width = w + (shadow ? 2 : 0); cv.height = h + (shadow ? 1 : 0);
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    if (shadow) { const s = document.createElement('canvas'); s.width = w; s.height = h; const sg = s.getContext('2d'); sg.drawImage(img, x, y, w, h, 0, 0, w, h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgba(24,20,37,0.42)'; sg.fillRect(0, 0, w, h); g.drawImage(s, 2, 1); }
    g.drawImage(img, x, y, w, h, 0, 0, w, h); sc.textures.addCanvas(key, cv);
  }
  function ladderCanvas(tiles) {                                   // лестница из тайла (17,1): только дерево и его контур, 2 пролёта
    const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(tiles, 272, 16, 16, 16, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16), p = d.data, wood = i => { const r = p[i], gg = p[i + 1], b = p[i + 2]; return p[i + 3] && r > b && r > 55; };
    const keep = new Uint8Array(256); for (let i = 0; i < 256; i++) if (wood(i * 4)) keep[i] = 2;
    for (let i = 0; i < 256; i++) if (!keep[i]) { const x = i % 16, y = i / 16 | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a >= 0 && a < 16 && b >= 0 && b < 16 && keep[b * 16 + a] === 2) { keep[i] = 1; p[i * 4] = 24; p[i * 4 + 1] = 20; p[i * 4 + 2] = 37; } } }
    for (let i = 0; i < 256; i++) if (!keep[i]) p[i * 4 + 3] = 0; g.putImageData(d, 0, 0);
    const out = document.createElement('canvas'); out.width = 16; out.height = 29; const o = out.getContext('2d'); o.drawImage(c, 0, 0); o.drawImage(c, 0, 3, 16, 13, 0, 16, 16, 13); return out;
  }

  function paint(sc, d) {
    const tiles = sc.textures.get('dun_tiles').getSourceImage(), det = sc.textures.get('dun_det').getSourceImage();
    const cv = document.createElement('canvas'); cv.width = d.TW * T; cv.height = d.TH * T; const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
    const tile = (c, r, tx, ty) => g.drawImage(tiles, c * T, r * T, T, T, tx * T, ty * T, T, T), at = (x, y) => (d.kind[y] && d.kind[y][x]) || 0, isW = (x, y) => at(x, y) === 2;
    g.fillStyle = VOID; g.fillRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < d.TH; y++) for (let x = 0; x < d.TW; x++) if (d.kind[y][x] === 1) tile(d.fv[y][x][0], d.fv[y][x][1], x, y);
    if (d.seal) {                                                      // комната босса: круглая печать пака, линии перекрашены в тёмно-красный
      [[15, 6, 0, 0], [16, 6, 1, 0], [15, 7, 0, 1], [16, 7, 1, 1]].forEach(([c, r, dx, dy]) => tile(c, r, d.seal.tx + dx, d.seal.ty + dy));
      const sx = d.seal.tx * T, sy = d.seal.ty * T, sd = g.getImageData(sx, sy, 2 * T, 2 * T), q = sd.data;
      for (let i = 0; i < q.length; i += 4) { if (q[i] === 38 && q[i + 1] === 43) { q[i] = 104; q[i + 1] = 30; q[i + 2] = 42; } else if (q[i] === 58 && q[i + 1] === 68) { q[i] = 150; q[i + 1] = 48; q[i + 2] = 56; } }
      g.putImageData(sd, sx, sy);
    }
    if (d.pit) [[15, 1, 0, 0], [17, 1, 1, 0], [15, 2, 0, 1], [15, 2, 1, 1]].forEach(([c, r, dx, dy]) => tile(c, r, d.pit.tx + dx, d.pit.ty + dy));
    g.fillStyle = 'rgba(24,20,37,0.34)';                               // тени стен на пол: свет слева сверху -> тень вправо-вниз
    for (let y = 0; y < d.TH; y++) for (let x = 0; x < d.TW; x++) if (d.kind[y][x] === 1) {
      const l = isW(x - 1, y); if (l) g.fillRect(x * T, y * T, 3, T);
      if (isW(x, y - 1)) g.fillRect(x * T + (l ? 3 : 0), y * T, T - (l ? 3 : 0), 2);
      else if (!l && isW(x - 1, y - 1)) g.fillRect(x * T, y * T, 3, 2);
    }
    d.decals.forEach(e => {
      if (e.k === 'bone') g.drawImage(det, e.v[0], e.v[1], e.v[2], e.v[3], e.tx * T + e.ox, e.ty * T + e.oy, e.v[2], e.v[3]);
      else g.drawImage(det, WEB[0], WEB[1], WEB[2], WEB[3], e.tx * T, e.ty * T + 2, WEB[2], WEB[3]);
    });
    for (let y = 0; y < d.TH; y++) for (let x = 0; x < d.TW; x++) if (d.wt[y][x]) tile(d.wt[y][x][0], d.wt[y][x][1], x, y);
    d.torches.forEach(t => g.drawImage(det, STICK[0], STICK[1], STICK[2], STICK[3], t.tx * T + 6, t.ty * T + 7, STICK[2], STICK[3]));
    g.drawImage(ladderCanvas(tiles), d.ladder.tx * T, d.ladder.ty * T);
    // свет: лёгкая темнота подвала, у факелов — тёплые круги ступенями (целые пиксели арта)
    const W = cv.width, H = cv.height, img = g.getImageData(0, 0, W, H), p = img.data, L = new Float32Array(W * H), BANDS = [[22, 1], [36, 0.62], [52, 0.3]];
    d.torches.forEach(t => { const cx = t.tx * T + 8, cy = t.ty * T + 8, R = BANDS[2][0], r = d.rooms[t.room];   // свет только в своей комнате (стены не просвечивают)
      const bx0 = Math.max(0, cx - R, (r.x0 - 1) * T), bx1 = Math.min(W, cx + R, (r.x1 + 2) * T), by0 = Math.max(0, cy - R, (r.y0 - 1) * T), by1 = Math.min(H, cy + R, (r.y1 + 2) * T);
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const dd = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15); let v = 0; for (const [rr, l] of BANDS) if (dd < rr) { v = l; break; } if (v > L[y * W + x]) L[y * W + x] = v; } });
    for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; if (!at((x / T) | 0, (y / T) | 0)) continue;   // пустота остаётся пустотой
      const l = L[i], a = 0.24 * (1 - l), k = i * 4;
      p[k] = p[k] * (1 - a) + 12 * a + 22 * l; p[k + 1] = p[k + 1] * (1 - a) + 10 * a + 12 * l; p[k + 2] = p[k + 2] * (1 - a) + 22 * a; }
    g.putImageData(img, 0, 0);
    return cv;
  }

  class Dungeon extends Phaser.Scene {
    constructor() { super('Dungeon'); }
    preload() {
      [['dun_tiles', 'tileset'], ['dun_obj', 'objects'], ['dun_anim', 'anim'], ['dun_det', 'details']].forEach(([k, f]) => { if (!this.textures.exists(k)) this.load.image(k, 'assets_v3/dungeon/' + f + '.png'); });
    }
    create(data) {
      data = data || {};
      this.seed = data.seed != null ? data.seed >>> 0 : (Math.random() * 0x7fffffff) >>> 0;
      this.floorNo = Math.max(0, Math.min(FLOORS - 1, data.floor | 0));
      this.walker = null; this.heroShadow = null; this.busy = false; this.talking = false; this.walkTween = null;
      const d = this.dun = gen(this.seed, this.floorNo);
      this.worldW = d.TW * TS; this.worldH = d.TH * TS; this.viewW = 960; this.viewH = 780;
      this.townMask = { cell: 24, mask: d.mask };                     // walk.js: townWalkable / grid берут эту маску
      this.spawns = d.spawns; this.chests = d.chests; this.boss = d.boss; this.rooms = d.rooms.map(r => ({ id: r.id, x: r.x0 * TS, y: r.y0 * TS, w: (r.x1 - r.x0 + 1) * TS, h: (r.y1 - r.y0 + 1) * TS }));
      this.stairs = d.pit ? { x: (d.pit.tx + 1) * TS, y: (d.pit.ty + 1) * TS, at: d.pit.at } : null;
      this.o = { exit: d.exit };                                       // walk.js: «Raus» у лестницы входа -> деревня
      this.registry.set('spawnAt', window.KELLER_HATCH ? [window.KELLER_HATCH.x, window.KELLER_HATCH.y + 60] : null);
      this.cameras.main.setBackgroundColor(VOID);
      ['bag', 'bFurn', 'bMap'].forEach(k => { const e = document.getElementById(k); if (e) e.style.display = 'none'; });
      const dlg = document.getElementById('dlg'); if (dlg) dlg.style.display = 'none';
      const gt = document.getElementById('goalTxt'); if (gt) gt.textContent = 'der Keller · Etage ' + (this.floorNo + 1) + '/' + FLOORS;
      const key = 'dun_map'; if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, paint(this, d));
      this.add.image(0, 0, key).setOrigin(0, 0).setScale(SC).setDepth(-10);
      const obj = this.textures.get('dun_obj').getSourceImage(), anim = this.textures.get('dun_anim').getSourceImage();
      Object.entries(PROPS).forEach(([k, r]) => makeTex(this, 'dp_' + k, obj, r, true)); makeTex(this, 'dp_chest', anim, CHEST, true);
      const place = (key, tx, ty) => { const f = this.textures.get(key).getSourceImage(), w = f.width - 2, h = f.height - 1;
        return this.add.image(tx * TS + Math.round((T - w) / 2) * SC, (ty + 1) * TS - SC - h * SC, key).setOrigin(0, 0).setScale(SC).setDepth((ty + 1) * TS - SC); };
      d.props.forEach(p => place('dp_' + p.t, p.tx, p.ty));
      d.chests.forEach(c => { c.img = place('dp_chest', c.tx, c.ty); });
      const at = this.textures.get('dun_anim'); for (let i = 0; i < 4; i++) if (!at.has('fl' + i)) at.add('fl' + i, 0, 400 + i * 16, 192, 16, 16);
      if (!this.anims.exists('dun_flame')) this.anims.create({ key: 'dun_flame', frames: [0, 1, 2, 3].map(i => ({ key: 'dun_anim', frame: 'fl' + i })), frameRate: 8, repeat: -1 });
      d.torches.forEach((t, i) => this.add.sprite(t.tx * TS, (t.ty * T - 7) * SC, 'dun_anim', 'fl0').setOrigin(0, 0).setScale(SC).setDepth((t.ty + 1) * TS).play({ key: 'dun_flame', startFrame: i % 4 }));
      if (d.pit) {                                                     // люк с лестницей вниз: тап -> Max идёт к нему и спускается
        const z = this.add.zone((d.pit.tx + 1) * TS, (d.pit.ty + 1) * TS, 2 * TS, 2 * TS).setInteractive({ useHandCursor: true });
        const g = this.add.container((d.pit.tx + 1) * TS, d.pit.ty * TS - 18).setDepth(5000);
        const arrow = this.add.triangle(0, 0, -16, -10, 16, -10, 0, 12, 0xffd23f).setStrokeStyle(3, 0x3b2314);
        const lbl = this.add.text(0, -40, 'Runter', { fontFamily: 'Roboto, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#ffe9b0', stroke: '#3b2314', strokeThickness: 4 }).setOrigin(0.5, 0.5);
        g.add([lbl, arrow]); this.tweens.add({ targets: arrow, y: 6, duration: 500, yoyo: true, repeat: -1 });
        z.on('pointerup', () => { if (this.__dragged || this.busy) return; if (window.walkToScene) window.walkToScene(this, d.pit.at[0], d.pit.at[1], () => this.down()); else this.down(); });
      }
      this.hero = this.add.image(d.spawn[0], d.spawn[1], 'v3_hero').setVisible(false);
      this.camFocus = [d.spawn[0], d.spawn[1] - 60];
      if (window.walkSetup) window.walkSetup(this);
      this.events.once('shutdown', () => { this.walker = null; this.heroShadow = null; this.busy = false; this.walkTween = null; });
      this.cameras.main.fadeIn(300); if (window.fitCam) window.fitCam(this);
      if (window.toast && this.floorNo) toast('Etage ' + (this.floorNo + 1), 1200);
    }
    down() {
      if (this.busy) return; this.busy = true;
      this.cameras.main.fadeOut(300, 24, 20, 37); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ seed: this.seed, floor: this.floorNo + 1 }));
    }
  }
  window.Dungeon = Dungeon; window.dunGen = gen; window.DUNGEON = { T, SC, TS, FLOORS };
})();
