// Континент A1 «Wiesenland» — сцена Welt (design-doc/rpg-design.md, раздел 1; шаг 4). Мир по сиду игрока (localStorage ds_proto.worldSeed,
// создаётся один раз): 120x160 тайлов по 16 px, вертикально под телефон. Шум высоты и влажности -> биомы: луг, лес (деревья непроходимы,
// тропы сквозь), озёра и река (вода непроходима, мосты craftpix 668008), скалы (валуны, проходы). Дороги — A* между точками интереса
// (цена поворота -> длинные прямые), рисуются булыжной тропой деревни. Вода задана на вершинах тайлов -> автотайл берега island kit
// по 4 углам (без диагоналей и дыр; углы «вода в одном углу» собраны в build_world_atlas.py из краёв того же пака).
// Арт — те же части, что деревня (assets_v3/world/atlas.png из style_pick/world/build_world_atlas.py), мир рисуется в 1x и показывается x3.
// Как в деревне: всё запечено в одну картинку, деревья/камни/дома/сундуки непроходимы, одна тень вправо-вниз, тёплые лучи.
// Точки: Stillbach (назад в деревню, к WELT_GATE), 3 входа в подземелья (Keller: руина + люк, Dungeon с сидом от позиции), 2 хутора
// (дом, житель sc.npcs, табличка), лагерь врагов (Combat), «die alten Steine» (sc.review), 2 сундука (Loot). Подписи DE, под ними мелко RU.
(function () {
  const T = 16, SC = 3, TS = T * SC, MW = 120, MH = 160, LW = MW * T, LH = MH * T, CELL = 8;   // CELL: клетка маски в px мира 1x (= 24 px экрана)
  const GRASS = [122, 173, 85], GDARK = [91, 146, 82];
  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function vnoise(seed, scale) {
    const R = rng(seed), G = 64, g = new Float32Array(G * G); for (let i = 0; i < g.length; i++) g[i] = R();
    const at = (i, j) => g[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
    return (x, y) => { x /= scale; y /= scale; const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  }
  function heap() { const a = []; return { push(n, p) { a.push([p, n]); let i = a.length - 1; while (i) { const q = (i - 1) >> 1; if (a[q][0] <= a[i][0]) break; [a[q], a[i]] = [a[i], a[q]]; i = q; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; },
    get size() { return a.length; } }; }
  const HAMLETS = [['Birkenhof', 'Берёзовый хутор'], ['Mühlbach', 'Мельничный ручей'], ['Eichenau', 'Дубовый луг'], ['Lindenhof', 'Липовый хутор'], ['Sonnenfeld', 'Солнечное поле']];
  const FOLK = [['Bauer Jonas', 'крестьянин Йонас'], ['Frau Weber', 'фрау Вебер'], ['Herr Taras', 'господин Тарас']];
  const SIGN = [96, 38];                                             // табличка хутора = доска «Bauplatz» деревни (town/plot_sign.png, 288x114 экрана) в px мира 1x

  function gen(seed0, F) {
    for (let attempt = 0; attempt < 10; attempt++) { const w = gen1((seed0 + attempt * 7919) >>> 0, F); if (w) { w.seed = seed0; w.attempt = attempt; return w; } }
    throw new Error('Welt: no valid world for seed ' + seed0);
  }
  function gen1(seed, F) {
    const R = rng(seed), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
    const n1 = vnoise(seed + 1, 22), n2 = vnoise(seed + 2, 9), n3 = vnoise(seed + 3, 4), m1 = vnoise(seed + 4, 26), m2 = vnoise(seed + 5, 10);
    const H = (x, y) => n1(x, y) * 0.6 + n2(x, y) * 0.3 + n3(x, y) * 0.1, Mo = (x, y) => m1(x, y) * 0.7 + m2(x, y) * 0.3;
    const q = (f, p) => { const v = []; for (let y = 0; y < MH; y += 2) for (let x = 0; x < MW; x += 2) v.push(f(x, y)); v.sort((a, b) => a - b); return v[Math.floor(p * (v.length - 1))]; };
    const qLake = q(H, 0.07), qRock = q(H, 0.92), qForest = q(Mo, 0.68);
    // 1) вода на вершинах тайлов: река с запада на восток + сглаженные озёра; маленькие лужи убрать; диагональные стыки (6, 9) залить —
    //    у каждого тайла 4 угла «вода/суша» -> один из 15 тайлов берега island kit, без дыр и швов
    const VW = MW + 1, VH = MH + 1, ph1 = R() * 6.3, ph2 = R() * 6.3, ry = MH * (0.38 + R() * 0.1);
    const riverC = x => ry + 6 * Math.sin(x / 14 + ph1) + 2.5 * Math.sin(x / 6.1 + ph2);
    let L = new Float32Array(VW * VH);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) L[y * VW + x] = (Math.abs(y - riverC(x)) > 9 && x > 5 && y > 5 && x < VW - 6 && y < VH - 6) ? (qLake - H(x, y)) * 40 : -3;
    for (let pass = 0; pass < 2; pass++) { const L2 = new Float32Array(VW * VH); for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { let s = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < VW && b < VH) { s += L[b * VW + a]; c++; } } L2[y * VW + x] = s / c; } L = L2; }
    { const lab = new Int32Array(VW * VH).fill(-1);                    // крошечные лужи (меньше 8 вершин) — убрать
      for (let i = 0; i < VW * VH; i++) if (L[i] > 0 && lab[i] < 0) { const st = [i], comp = []; lab[i] = i; while (st.length) { const j = st.pop(); comp.push(j); const x = j % VW, y = (j / VW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy, k = b * VW + a; if (a >= 0 && b >= 0 && a < VW && b < VH && L[k] > 0 && lab[k] < 0) { lab[k] = i; st.push(k); } } }
        if (comp.length < 8) comp.forEach(j => { L[j] = -1; }); } }
    const wv = new Uint8Array(VW * VH); for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) wv[y * VW + x] = Math.max(L[y * VW + x], 1.7 - Math.abs(y - riverC(x))) > 0 ? 1 : 0;
    const cm = (tx, ty) => { const i = ty * VW + tx; return wv[i] | wv[i + 1] << 1 | wv[i + VW] << 2 | wv[i + VW + 1] << 3; };
    for (let it = 0; it < 40; it++) { let ch = 0;
      for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) { const m = cm(tx, ty); if (m === 6 || m === 9) { const i = ty * VW + tx; wv[i] = wv[i + 1] = wv[i + VW] = wv[i + VW + 1] = 1; ch++; } }
      if (!ch) break; }
    const tm = new Uint8Array(MW * MH); for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) tm[ty * MW + tx] = cm(tx, ty);
    // 2) тайлы: kind 2 = в тайле есть вода (угол); биомы: 0 луг, 1 лес, 2 скалы, 3 песок (1–2 тайла у воды)
    const kind = new Uint8Array(MW * MH), biome = new Uint8Array(MW * MH);
    const nearW = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const a = tx + dx, b = ty + dy; if (a >= 0 && b >= 0 && a < MW && b < MH && tm[b * MW + a]) return true; } return false; };
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const i = ty * MW + tx; if (tm[i]) { kind[i] = 2; biome[i] = 3; continue; }
      const edge = Math.min(tx, ty, MW - 1 - tx, MH - 1 - ty);
      biome[i] = nearW(tx, ty, 1) || (nearW(tx, ty, 2) && n3(tx * 1.7, ty * 1.7) > 0.5) ? 3 : edge < 4 ? 1 : H(tx, ty) > qRock ? 2 : Mo(tx, ty) > qForest ? 1 : 0;
    }
    const land = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && kind[y * MW + x] === 0;
    // 3) мосты: две колонки через реку
    const bridges = [];
    for (const fx of [0.28 + R() * 0.08, 0.64 + R() * 0.08]) {
      const bx = Math.round(MW * fx), c = Math.round(riverC(bx)); let y0 = c, y1 = c;
      while (y0 > 0 && !land(bx, y0 - 1)) y0--; while (y1 < MH - 1 && !land(bx, y1 + 1)) y1++;
      if (!land(bx, y0) && land(bx, y0 - 1) && land(bx, y1 + 1) && y1 - y0 < 12) bridges.push({ tx: bx, y0, y1 });
    }
    const onBridge = (x, y) => bridges.some(b => b.tx === x && y >= b.y0 && y <= b.y1);
    // 4) точки интереса: минимум расстояния, вокруг — чистый луг
    const clear = new Uint8Array(MW * MH), poiBlock = new Uint8Array(MW * MH);
    const KINDS = [['stillbach', 7], ['dungeon', 5], ['dungeon', 5], ['dungeon', 5], ['hamlet', 9], ['hamlet', 9], ['camp', 6], ['stones', 5], ['chest', 3], ['chest', 3]];
    const pois = [], okPoi = (x, y, r) => { if (x < 10 || y < 10 || x > MW - 11 || y > MH - 11) return false;
      for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) { const i = (y + dy) * MW + x + dx; if (kind[i] || biome[i] === 3) return false; } return true; };
    for (const [k, r] of KINDS) {
      let best = null;
      for (let t = 0; t < 900 && !best; t++) {
        const minD = t < 400 ? 26 : t < 700 ? 20 : 15;
        const x = k === 'stillbach' ? Math.round(MW / 2 + (R() - 0.5) * (8 + t / 10)) : ri(10, MW - 11), y = k === 'stillbach' ? Math.round(MH * 0.72 + (R() - 0.5) * (8 + t / 10)) : ri(10, MH - 11);
        if (!okPoi(x, y, r) || pois.some(p => Math.hypot(p.tx - x, p.ty - y) < minD)) continue;
        if (k !== 'stillbach' && Math.hypot(x - pois[0].tx, y - pois[0].ty) < 22) continue;
        best = { k, tx: x, ty: y, r };
      }
      if (!best) return null;
      pois.push(best); for (let dy = -best.r; dy <= best.r; dy++) for (let dx = -best.r; dx <= best.r; dx++) { const i = (best.ty + dy) * MW + best.tx + dx; clear[i] = 1; if (biome[i] !== 3) biome[i] = 0; }
    }
    // 5) спрайты: занятость 4 px, маска (клетка 8 px), рисунок
    const OW = LW / 4, OH = LH / 4, occ = new Uint8Array(OW * OH), CW = LW / CELL, CH = LH / CELL, solid = new Uint8Array(CW * CH), draws = [];
    const fr = k => F.frames[k], SOFT = { flower: 1, mush: 1 };
    const freeRect = (x, y, w, h, p) => { const a = Math.max(0, (x - p) >> 2), b = Math.max(0, (y - p) >> 2), c = Math.min(OW - 1, (x + w + p - 1) >> 2), d = Math.min(OH - 1, (y + h + p - 1) >> 2);
      for (let yy = b; yy <= d; yy++) for (let xx = a; xx <= c; xx++) if (occ[yy * OW + xx]) return false; return true; };
    const markOcc = (x, y, w, h) => { for (let yy = Math.max(0, y >> 2); yy <= Math.min(OH - 1, (y + h - 1) >> 2); yy++) for (let xx = Math.max(0, x >> 2); xx <= Math.min(OW - 1, (x + w - 1) >> 2); xx++) occ[yy * OW + xx] = 1; };
    const markSolid = (x, y, w, h) => { for (let yy = Math.max(0, Math.floor(y / CELL)); yy <= Math.min(CH - 1, Math.floor((y + h - 1) / CELL)); yy++) for (let xx = Math.max(0, Math.floor(x / CELL)); xx <= Math.min(CW - 1, Math.floor((x + w - 1) / CELL)); xx++) solid[yy * CW + xx] = 1; };
    // o.skip: только место, тень и маска (рисует сцена: огонь, сундук); o.occF: в лесу кроны перекрываются (занят только низ)
    const put = (key, x, y, kindName, o = {}) => { const f = fr(key); x = Math.round(x); y = Math.round(y); const oh = o.occF ? Math.max(4, Math.round(f[3] * o.occF)) : f[3]; markOcc(x, y + f[3] - oh, f[2], oh); if (!SOFT[kindName] && !o.soft) markSolid(x, y, f[2], f[3]); draws.push({ key, x, y, w: f[2], h: f[3], shadow: !SOFT[kindName] && o.shadow !== false, skip: !!o.skip, z: o.z != null ? o.z : y + f[3] }); return [x, y, x + f[2], y + f[3]]; };
    const tilesOk = (x, y, w, h, test) => { for (let ty = Math.floor(y / T); ty <= Math.floor((y + h - 1) / T); ty++) for (let tx = Math.floor(x / T); tx <= Math.floor((x + w - 1) / T); tx++) { if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || !test(tx, ty, ty * MW + tx)) return false; } return true; };
    const block = bb => { for (let ty = Math.floor(bb[1] / T); ty <= Math.floor((bb[3] - 1) / T); ty++) for (let tx = Math.floor(bb[0] / T); tx <= Math.floor((bb[2] - 1) / T); tx++) if (tx >= 0 && ty >= 0 && tx < MW && ty < MH) poiBlock[ty * MW + tx] = 1; };
    // точки интереса: постройки
    const npcs = [], spawns = [], chests = [], dungeons = [], labels = [], zones = [], signs = []; let review = null, stillbach = null, camp = null; const H0 = HAMLETS.slice();
    pois.forEach((p, n) => {
      const cx = p.tx * T + 8, cy = p.ty * T + 8; let b, de, ru, art = null, at = null;
      const z = (bb, act, extra) => zones.push(Object.assign({ x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3], act }, extra || {}));
      if (p.k === 'stillbach') { const f = fr('house1'); b = put('house1', cx - 119, cy + 20 - f[3], 'house'); de = 'Stillbach'; ru = 'домой, в деревню'; stillbach = { x: cx, y: b[3] + 14 }; z(b, 'home'); }   // дорога — в арку дома-ворот (x 103..135 рисунка)
      else if (p.k === 'dungeon') { const k = dungeons.length % 2 ? 'ruin2' : 'ruin', f = fr(k); b = put(k, cx - f[2] / 2, cy + 6 - f[3], 'ruin'); art = 'der'; de = 'Keller'; ru = 'подвал · подземелье';
        const hatch = [cx - 8, b[3] + 3]; at = [cx, hatch[1] + 17 + 22];          // люк craftpix 436971 (как у дома героя) перед руиной: туда спускаются
        dungeons.push({ x: at[0], y: at[1], hatch, seed: (seed * 31 + p.tx * 977 + p.ty * 131) >>> 0 }); b = [b[0], b[1], b[2], hatch[1] + 17]; z(b, 'dungeon', { di: dungeons.length - 1 }); }
      else if (p.k === 'hamlet') { const hk = npcs.length ? 'house2r' : 'house2', f = fr(hk); b = put(hk, cx - 81, cy + 16 - f[3], 'house'); const nm = H0.splice(Math.floor(R() * H0.length), 1)[0];   // дом с дверью (x 72..90 рисунка) — дверью к дороге; у второго хутора крыша терракота
        const yard = npcs.length ? [['cart', b[2] + 28, b[3] - 36], ['logs', cx + 20, b[3] + 6], ['axe', cx + 44, b[3] + 10]] : [['well', b[2] + 28, b[3] - 52], ['barrel0', cx + 20, b[3] + 6], ['barrel1', cx + 42, b[3] + 10]];
        yard.forEach(([k, x, y]) => block(put(k, x, y, 'prop')));    // двор: колодец и бочки / телега, дрова и колода с топором (504452) — хутора не копии
        const who = FOLK[npcs.length % FOLK.length], nf = fr('npc' + (npcs.length % 3)), nx = Math.round(b[2] + 6), ny = Math.round(b[3] - nf[3] + 2); markOcc(nx, ny, nf[2], nf[3]); markSolid(nx + 2, ny + nf[3] - 6, nf[2] - 4, 6);
        npcs.push({ key: 'npc' + (npcs.length % 3), x: nx, y: ny, w: nf[2], h: nf[3], name: who[0], ru: who[1], place: nm[0] });
        const sx = cx - 22 - SIGN[0], sy = b[3] + 4; signs.push({ x: sx, y: sy, de: nm[0], ru: 'хутор · ' + nm[1] }); markSolid(sx + 4, sy + SIGN[1] - 10, SIGN[0] - 8, 10); markOcc(sx, sy, SIGN[0], SIGN[1]); block([sx, sy, sx + SIGN[0], sy + SIGN[1]]);
        z(b, 'hamlet', { ni: npcs.length - 1 }); }
      else if (p.k === 'camp') { const f = fr('tent'); b = put('tent', cx - f[2] - 4, cy + 6 - f[3], 'tent'); const ff = fr('fire0'); const fb = put('fire0', cx + 10, cy + 6 - ff[3], 'fire', { skip: true }); camp = { x: fb[0], y: fb[1] };
        const wb = put('wood', cx + 12, cy + 12, 'wood'); art = 'das'; de = 'Lager'; ru = 'лагерь врагов';   // враги — кольцом вокруг палатки и костра, >= 64 px мира друг от друга: подписи не наезжают
        for (const [dx, dy] of [[-88, 0], [-40, 50], [36, 52], [78, 0]]) spawns.push({ x: cx + dx, y: cy + dy }); b = [Math.min(b[0], fb[0], wb[0]), Math.min(b[1], fb[1]), Math.max(b[2], fb[2] + 30, wb[2]), Math.max(b[3], fb[3], wb[3])]; z(b, 'camp'); }
      else if (p.k === 'stones') { for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, key = 'crystal' + (k % 4), f = fr(key); put(key, cx + Math.cos(a) * 30 - f[2] / 2, cy + Math.sin(a) * 20 - f[3], 'crystal'); }
        b = [cx - 44, cy - 50, cx + 44, cy + 22]; art = 'die'; de = 'alten Steine'; ru = 'старые камни · повторение'; review = { x: cx, y: cy + 32 }; z(b, 'stones'); }
      else if (p.k === 'chest') { const f = fr('chest0'); b = put('chest0', cx - f[2] / 2, cy - f[3] + 4, 'chest', { skip: true }); art = 'die'; de = 'Truhe'; ru = 'сундук'; chests.push({ x: cx, y: b[3] + 22, bx: b[0], by: b[1], w: f[2], h: f[3] }); z(b, 'chest', { ci: chests.length - 1 }); }
      at = at || [cx, b[3] + (p.k === 'stillbach' || p.k === 'hamlet' ? 14 : 22)]; p.box = b; p.at = at; zones[zones.length - 1].at = at;   // к двери дорога вплотную; к сундуку, лагерю, камням — конец дороги ниже (предметы не на дорожке)
      if (de) labels.push({ x: Math.round((b[0] + b[2]) / 2), y: b[1] - 4, art, de, ru });
      block(b);
    });
    // 6) дороги: A* по тайлам (цена поворота), минимальное дерево + 2 петли
    // одна дорога на коридор 3 тайла: рядом с готовой дорогой (1–2 тайла) — дорого, по ней — дёшево; поворот дорогой -> мало поворотов
    const road = new Uint8Array(MW * MH), nearR = new Uint8Array(MW * MH), DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], TURN = 7;
    const cost = (x, y) => { const i = y * MW + x; if (poiBlock[i]) return Infinity; if (kind[i]) return onBridge(x, y) ? 1 : Infinity; if (road[i]) return 0.4;
      return [1, 3.5, 6, 4][biome[i]] + (nearR[i] ? 8 : 0) + (Math.min(x, y, MW - 1 - x, MH - 1 - y) < 5 ? 20 : 0); };
    const astar = (s, g) => {
      const N = MW * MH * 4, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), hp = heap(), key = (x, y, d) => (y * MW + x) * 4 + d;
      for (let d = 0; d < 4; d++) { gs[key(s[0], s[1], d)] = 0; hp.push(key(s[0], s[1], d), 0); }
      while (hp.size) {
        const k = hp.pop(), d = k & 3, i = k >> 2, x = i % MW, y = (i / MW) | 0;
        if (x === g[0] && y === g[1]) { const path = []; let c = k; while (c >= 0) { const j = c >> 2; path.unshift([j % MW, (j / MW) | 0]); c = from[c]; } return path; }
        for (let nd = 0; nd < 4; nd++) { const nx = x + DIRS[nd][0], ny = y + DIRS[nd][1]; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
          let c = (nx === g[0] && ny === g[1]) ? 1 : cost(nx, ny); if (!isFinite(c)) continue;
          if ((onBridge(x, y) || onBridge(nx, ny)) && nd < 2) continue;    // на мост и по мосту — только прямо (вдоль колонки)
          const ng = gs[k] + c + (nd !== d ? TURN : 0), nk = key(nx, ny, nd);
          if (ng < gs[nk]) { gs[nk] = ng; from[nk] = k; hp.push(nk, ng + Math.abs(nx - g[0]) + Math.abs(ny - g[1])); } }
      }
      return null;
    };
    const ends = pois.map(p => [Math.floor(p.at[0] / T), Math.floor((p.at[1] + 4) / T)]);
    const n = pois.length, inT = [0], edges = [];
    while (inT.length < n) { let best = null; for (const a of inT) for (let b = 0; b < n; b++) if (!inT.includes(b)) { const dd = Math.hypot(ends[a][0] - ends[b][0], ends[a][1] - ends[b][1]); if (!best || dd < best[2]) best = [a, b, dd]; } inT.push(best[1]); edges.push(best); }
    const extra = []; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) extra.push([a, b, Math.hypot(ends[a][0] - ends[b][0], ends[a][1] - ends[b][1])]);
    extra.sort((p1, p2) => p1[2] - p2[2]); edges.push(...extra.slice(0, 2));
    const paths = [];
    for (const [a, b] of edges) { const pth = astar(ends[a], ends[b]); if (!pth) return null; pth.forEach(([x, y]) => { road[y * MW + x] = 1; }); paths.push(pth);
      pth.forEach(([x, y]) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const a2 = x + dx, b2 = y + dy; if (a2 >= 0 && b2 >= 0 && a2 < MW && b2 < MH) nearR[b2 * MW + a2] = 1; } }); }
    const rd = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && road[y * MW + x] === 1;   // проверка: повороты и «параллели» (прямая дорога в 1–2 тайлах от прямой той же оси)
    let turns = 0, parallel = 0; const hz = (x, y) => rd(x, y) && rd(x - 1, y) && rd(x + 1, y) && !rd(x, y - 1) && !rd(x, y + 1), vt = (x, y) => rd(x, y) && rd(x, y - 1) && rd(x, y + 1) && !rd(x - 1, y) && !rd(x + 1, y);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { if (!rd(x, y)) continue; const h = rd(x - 1, y) || rd(x + 1, y), v = rd(x, y - 1) || rd(x, y + 1); if (h && v && (rd(x - 1, y) + rd(x + 1, y) + rd(x, y - 1) + rd(x, y + 1)) === 2) turns++;
      if ((hz(x, y) && [1, 2, 3].some(k => hz(x, y + k))) || (vt(x, y) && [1, 2, 3].some(k => vt(x + k, y)))) parallel++; }
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (road[y * MW + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * MW + x + dx; if (j >= 0 && j < MW * MH) clear[j] = clear[j] || 2; }
    // дорога на тайлах: полосы между центрами, площадки на поворотах/развилках/концах
    const strips = [], pads = [];
    const deg = (x, y) => DIRS.filter(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < MW && y + dy < MH && road[(y + dy) * MW + x + dx]).length;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (road[y * MW + x] && !onBridge(x, y)) {
      const e = x + 1 < MW && road[y * MW + x + 1] && !onBridge(x + 1, y), s = y + 1 < MH && road[(y + 1) * MW + x] && !onBridge(x, y + 1);
      const cx = x * T + 8, cy = y * T + 8;
      if (e) strips.push(['h', cx, cy - 9, T]); if (s) strips.push(['v', cx - 9, cy, T]);
      const w_ = x > 0 && road[y * MW + x - 1], nn = y > 0 && road[(y - 1) * MW + x] && !onBridge(x, y - 1), d = deg(x, y);
      if (d !== 2 || ((e || w_) && (s || nn))) pads.push([cx, cy]);
      markOcc(cx - 12, cy - 12, 24, 24);
    }
    pads.forEach(([x, y]) => markOcc(x - 24, y - 28, 48, 56));
    const br = bridges.filter(b => road[b.y0 * MW + b.tx]).map(b => ({ tx: b.tx, x: b.tx * T + 8 - 20, y: b.y0 * T - 10, h: (b.y1 - b.y0 + 1) * T + 20 }));
    // 7) лес, скалы, рощи, кусты, цветы (крупное сначала, мелкое в просветы; на дороги и у точек — ничего)
    const notOn = (tx, ty, i) => !kind[i] && biome[i] !== 3 && !clear[i] && !poiBlock[i];
    const tryPut = (key, x, y, k, pad, test, occF) => { const f = fr(key); x = Math.round(x); y = Math.round(y); const oh = occF ? Math.max(4, Math.round(f[3] * occF)) : f[3];
      if (x < 0 || y < 0 || x + f[2] > LW || y + f[3] > LH || !freeRect(x, y + f[3] - oh, f[2], oh, pad) || !tilesOk(x, y, f[2], f[3], test)) return false; put(key, x, y, k, { occF }); return true; };
    const inB = (b) => (tx, ty, i) => notOn(tx, ty, i) && biome[i] === b;
    const trees = [0, 1, 2, 3, 4].map(i => 'tree' + i), bushes = [...Array(11)].map((_, i) => 'bush' + i), rocks = [...Array(11)].map((_, i) => 'rock' + i), boulders = [0, 1, 2, 3].map(i => 'boulder' + i);
    const stumps = [...Array(7)].map((_, i) => 'stump' + i), flowers = [...Array(11)].map((_, i) => 'flower' + i).concat([0, 1, 2, 3].map(i => 'mush' + i));
    let cntF = 0, cntR = 0, cntM = 0; for (let i = 0; i < MW * MH; i++) { if (!kind[i] && biome[i] === 1) cntF++; else if (!kind[i] && biome[i] === 2) cntR++; else if (!kind[i] && biome[i] === 0) cntM++; }
    const rnd = () => [R() * LW, R() * LH];
    for (let k = 0; k < cntF * 6; k++) { const [x, y] = rnd(), t = pick(trees), f = fr(t); tryPut(t, x - f[2] / 2, y - f[3], 'tree', 0, inB(1), 0.34); }
    for (let k = 0; k < cntF * 3; k++) { const [x, y] = rnd(), t = pick(bushes.slice(0, 2).concat(bushes.slice(8))), f = fr(t); tryPut(t, x - f[2] / 2, y - f[3], 'bush', 0, inB(1), 0.5); }
    for (let k = 0; k < cntR * 6; k++) { const [x, y] = rnd(), t = R() < 0.6 ? pick(boulders) : pick(rocks), f = fr(t); tryPut(t, x - f[2] / 2, y - f[3], 'rock', 0, inB(2), 0.5); }
    for (let k = 0; k < cntR * 2; k++) { const [x, y] = rnd(), t = pick(bushes), f = fr(t); tryPut(t, x - f[2] / 2, y - f[3], 'bush', 1, inB(2)); }
    for (let g = 0; g < cntM / 220; g++) { const [gx, gy] = rnd(); for (let k = 0; k < 30; k++) { const t = pick(trees), f = fr(t); tryPut(t, gx + (R() - 0.5) * 130 - f[2] / 2, gy + (R() - 0.5) * 100 - f[3], 'tree', 0, inB(0)); } }
    for (const [lst, k, pad, mul] of [[trees, 'tree', 2, 0.04], [stumps, 'stump', 3, 0.03], [boulders, 'rock', 4, 0.01], [rocks, 'rock', 3, 0.08], [bushes, 'bush', 2, 0.35], [flowers, 'flower', 2, 0.9]])
      for (let c = 0; c < cntM * mul; c++) { const [x, y] = rnd(), t = pick(lst), f = fr(t); tryPut(t, x - f[2] / 2, y - f[3], k, pad, k === 'flower' ? (tx, ty, i) => !kind[i] && biome[i] !== 3 && !road[i] && !poiBlock[i] && clear[i] !== 1 : inB(0)); }   // у точек интереса (под подписью) — чисто
    // 8) маска (клетка 8 px = четверть тайла): угол тайла с водой, спрайты, край карты; мосты — проход по середине настила
    const mask = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const wet = tm[(y >> 1) * MW + (x >> 1)] & (1 << ((x & 1) + 2 * (y & 1)));
      mask[y * CW + x] = wet || solid[y * CW + x] || x < 2 || y < 2 || x >= CW - 2 || y >= CH - 2 ? 0 : 1;
    }
    br.forEach(b => { for (let y = Math.floor((b.y + 6) / CELL); y < Math.ceil((b.y + b.h - 6) / CELL); y++) for (let x = 2 * b.tx; x <= 2 * b.tx + 1; x++) mask[y * CW + x] = 1; });
    const spawn = [stillbach.x, stillbach.y + 26];
    const sc0 = [Math.floor(spawn[0] / CELL), Math.floor(spawn[1] / CELL)]; mask[sc0[1] * CW + sc0[0]] = 1;
    const seen = new Uint8Array(CW * CH), st = [sc0]; seen[sc0[1] * CW + sc0[0]] = 1; const ok = (x, y) => x >= 0 && y >= 0 && x < CW && y < CH && mask[y * CW + x];
    while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const a = x + dx, b = y + dy; if (!ok(a, b) || seen[b * CW + a] || (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy)))) continue; seen[b * CW + a] = 1; st.push([a, b]); } }
    for (let i = 0; i < CW * CH; i++) if (!seen[i]) mask[i] = 0;
    const reach = (x, y) => seen[Math.floor(y / CELL) * CW + Math.floor(x / CELL)] === 1;
    if (!pois.every(p => reach(p.at[0], p.at[1])) || !spawns.every(s => reach(s.x, s.y)) || npcs.some(nn => !reach(nn.x - 10, nn.y + nn.h + 6))) return null;
    const rows = []; for (let y = 0; y < CH; y++) { let s = ''; for (let x = 0; x < CW; x++) s += mask[y * CW + x] ? '1' : '0'; rows.push(s); }
    draws.sort((a, b) => a.z - b.z || a.y - b.y);
    return { tm, kind, biome, road, strips, pads, br, draws, npcs, spawns, chests, dungeons, labels, zones, signs, review, stillbach, camp, pois, spawn, mask: rows, bridges, paths: paths.length, turns, parallel, roadTiles: road.reduce((a, v) => a + v, 0) };
  }

  // ---------------------------------------------------------------- рисунок (1x) -> текстура, показ x3
  function paint(sc, d, F) {
    const A = sc.textures.get('world_atlas').getSourceImage(), fr = k => F.frames[k];
    const cv = document.createElement('canvas'); cv.width = LW; cv.height = LH; const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
    const R = rng(d.seed * 13 + 5), draw = (k, x, y) => { const f = fr(k); g.drawImage(A, f[0], f[1], f[2], f[3], x, y, f[2], f[3]); };
    g.fillStyle = `rgb(${GRASS})`; g.fillRect(0, 0, LW, LH);
    const grassT = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH && !d.kind[ty * MW + tx] && d.biome[ty * MW + tx] !== 3;
    const grassAt = (x, y) => grassT(x >> 4, y >> 4);
    const tufts = Object.keys(F.frames).filter(k => /^tuft\d/.test(k)), spots = Object.keys(F.frames).filter(k => /^spot\d/.test(k));
    for (let y = 0; y < LH; y += 10) for (let x = 0; x < LW; x += 10) { const t = tufts[Math.floor(R() * tufts.length)], f = fr(t), px = x + Math.floor(R() * 10), py = y + Math.floor(R() * 10); if (grassAt(px, py) && grassAt(px + f[2], py + f[3])) draw(t, px, py); }
    for (let k = 0; k < 320; k++) { const s = spots[Math.floor(R() * spots.length)], f = fr(s), px = Math.floor(R() * (LW - 20)), py = Math.floor(R() * (LH - 20)); if (grassAt(px, py) && grassAt(px + f[2], py + f[3])) draw(s, px, py); }
    // вода (полные тайлы, цвет воды пака) и песок попиксельно: край травы рваный ступеньками, тёмная кромка как в деревне
    const img = g.getImageData(0, 0, LW, LH), p = img.data, sf = fr('sand'), sc_ = document.createElement('canvas'); sc_.width = sf[2]; sc_.height = sf[3];
    const sg = sc_.getContext('2d', { willReadFrequently: true }); sg.drawImage(A, sf[0], sf[1], sf[2], sf[3], 0, 0, sf[2], sf[3]); const sd = sg.getImageData(0, 0, sf[2], sf[3]).data;
    const W0 = F.water;
    const dist = new Uint8Array(MW * MH);                              // полная вода: тайлы до берега
    for (let i = 0; i < MW * MH; i++) dist[i] = d.tm[i] === 15 ? 9 : 0;
    for (let it = 0; it < 6; it++) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const i = y * MW + x; if (!dist[i]) continue; let m = 9; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < MW && b < MH) m = Math.min(m, dist[b * MW + a] + 1); } dist[i] = m; }
    const jit = (x, y) => (((x / 3 | 0) * 73856093 ^ (y / 3 | 0) * 19349663 ^ d.seed) >>> 0) % 4;
    const sandPix = new Uint8Array(LW * LH);
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
      const i = ty * MW + tx;
      if (d.tm[i] === 15) { for (let y = ty * T; y < ty * T + T; y++) for (let x = tx * T; x < tx * T + T; x++) { const k = (y * LW + x) * 4; p[k] = W0[0]; p[k + 1] = W0[1]; p[k + 2] = W0[2]; } continue; }   // вода пака ровная (без «глубины» квадратами)
      if (d.tm[i]) { for (let y = ty * T; y < ty * T + T; y++) for (let x = tx * T; x < tx * T + T; x++) sandPix[y * LW + x] = 1; continue; }   // берег: тайл пака ниже
      if (d.biome[i] !== 3) continue;
      const gn = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && grassT(tx + dx, ty + dy)) gn.push([(tx + dx) * T, (ty + dy) * T]);
      for (let y = ty * T; y < ty * T + T; y++) for (let x = tx * T; x < tx * T + T; x++) {
        let dmin = 99; for (const [gx, gy] of gn) { const ddx = Math.max(gx - x, 0, x - (gx + T - 1)), ddy = Math.max(gy - y, 0, y - (gy + T - 1)); dmin = Math.min(dmin, Math.max(ddx, ddy)); }
        if (dmin <= 1 + jit(x, y)) continue;                         // ещё трава (рваный край)
        const k = (y * LW + x) * 4, s = ((y % sf[3]) * sf[2] + (x % sf[2])) * 4; p[k] = sd[s]; p[k + 1] = sd[s + 1]; p[k + 2] = sd[s + 2]; sandPix[y * LW + x] = 1;
      }
    }
    for (let y = 1; y < LH - 1; y++) for (let x = 1; x < LW - 1; x++) { const j = y * LW + x;   // кромка: травяной пиксель рядом с песком -> тёмно-зелёный
      if (sandPix[j] || d.kind[(y >> 4) * MW + (x >> 4)] || !(sandPix[j - 1] || sandPix[j + 1] || sandPix[j - LW] || sandPix[j + LW])) continue;
      const k = j * 4; p[k] = GDARK[0]; p[k + 1] = GDARK[1]; p[k + 2] = GDARK[2]; }
    {   // Полировка (локации) 24.11: пятна тона травы (2 октавы шума + комки 3 px) и мелкие декали (цветы, клевер, камешки) — свои пиксели, 1x, один раз в текстуру карты
      const Rn = rng(d.seed * 31 + 7), sm = t => t * t * (3 - 2 * t), grid = s => { const w = Math.ceil(LW / s) + 2, h = Math.ceil(LH / s) + 2, G = new Float32Array(w * h); for (let i = 0; i < G.length; i++) G[i] = Rn(); return { G, w, s }; };
      const N1 = grid(40), N2 = grid(13), vn = (N, x, y) => { const fx = x / N.s, fy = y / N.s, x0 = fx | 0, y0 = fy | 0, u = sm(fx - x0), v = sm(fy - y0), i = y0 * N.w + x0, G = N.G; const a = G[i] + (G[i + 1] - G[i]) * u, b = G[i + N.w] + (G[i + N.w + 1] - G[i + N.w]) * u; return a + (b - a) * v; };
      const isG = k => p[k + 1] > p[k] + 18 && p[k + 1] > p[k + 2] + 40;
      for (let by = 0; by < LH; by += 2) for (let bx = 0; bx < LW; bx += 2) {   // шум на блок 2x2 (1x) — дёшево; край пятен комками 3 px (хэш)
        const n0 = 0.62 * vn(N1, bx, by) + 0.26 * vn(N2, bx, by);
        for (let y = by; y < by + 2; y++) for (let x = bx; x < bx + 2; x++) { const j = y * LW + x, k = j * 4; if (sandPix[j] || !isG(k)) continue;
          const n = n0 + 0.12 * (((((x / 3) | 0) * 73856093 ^ ((y / 3) | 0) * 19349663 ^ d.seed) >>> 0) % 1000 / 1000) - 0.06;
          if (n > 0.57) { p[k] = Math.min(255, p[k] + 14); p[k + 1] = Math.min(255, p[k + 1] + 12); p[k + 2] = Math.max(0, p[k + 2] - 5); }
          else if (n < 0.43) { p[k] -= 16; p[k + 1] -= 8; p[k + 2] -= 13; } }
      }
      const PC = { w: [250, 248, 236], y: [247, 206, 72], o: [226, 150, 52], b: [112, 146, 232], B: [80, 102, 196], p: [240, 132, 172], P: [196, 86, 128], g: [84, 136, 60], G: [104, 158, 70], l: [150, 196, 96], s: [170, 168, 160], S: [124, 122, 118], h: [214, 212, 202], k: [60, 88, 44] };
      const DEC = [['.w.|wyw|.w.', 9], ['.b.|bBb|.g.', 6], ['p.p|.P.|pgp', 5], ['y.|oy|.g', 7], ['G.G|.gG|Gg.', 10], ['.hs|sSS', 8], ['l.l.l|g.g.g|.ggg.', 10], ['.l.|lgl|gkg', 9], ['.w...b.|wyw.bBb|.w.y.g.|..oy...', 6], ['.G..G.|GgG.gG|.g.Gg.|..GgG.', 5]].map(([s, w]) => [s.split('|'), w]);
      const WS = DEC.reduce((a, q) => a + q[1], 0), used = new Uint8Array(LW * LH);
      for (let gy = 0; gy < LH - 8; gy += 9) for (let gx = 0; gx < LW - 8; gx += 9) {
        if (Rn() < 0.2) continue; const x = gx + Math.floor(Rn() * 9), y = gy + Math.floor(Rn() * 9); let r = Rn() * WS, q = DEC[0]; for (const e of DEC) { if ((r -= e[1]) < 0) { q = e; break; } }
        const pat = q[0], ph = pat.length, pw = pat[0].length; if (x + pw + 1 >= LW || y + ph + 1 >= LH || !grassAt(x - 1, y - 1) || !grassAt(x + pw + 1, y + ph + 1)) continue;
        let ok = true; for (let j = -1; j <= ph && ok; j++) for (let i = -1; i <= pw; i++) { const jj = (y + j) * LW + x + i; if (used[jj] || sandPix[jj] || !isG(jj * 4)) { ok = false; break; } }
        if (!ok) continue;
        pat.forEach((row, j) => { for (let i = 0; i < pw; i++) { const c = PC[row[i]]; if (!c) continue; const k = ((y + j) * LW + x + i) * 4; p[k] = c[0]; p[k + 1] = c[1]; p[k + 2] = c[2]; } });
        for (let j = -1; j <= ph; j++) used.fill(1, (y + j) * LW + x - 1, (y + j) * LW + x + pw + 1);
      }
    }
    g.putImageData(img, 0, 0);
    // берег: тайл island kit по 4 углам (у краёв два варианта — чередуются по месту)
    for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) { const m = d.tm[ty * MW + tx]; if (!m || m === 15) continue;
      const alt = 'sh' + m + 'b', k = fr(alt) && ((tx * 7 + ty * 13 + (tx >> 2)) & 1) ? alt : 'sh' + m; draw(k, tx * T, ty * T); }
    const ripples = Object.keys(F.frames).filter(k => /^ripple\d/.test(k));
    for (let k = 0; k < 900; k++) { const x = Math.floor(R() * LW), y = Math.floor(R() * LH), r = ripples[Math.floor(R() * ripples.length)], f = fr(r);
      const ok = (a, b) => { const tx = a >> 4, ty = b >> 4; if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return false; const i = ty * MW + tx; return d.tm[i] === 15 && dist[i] >= 2; };
      if (ok(x, y) && ok(x + f[2], y + f[3]) && ok(x + f[2], y) && ok(x, y + f[3])) draw(r, x, y); }
    // дороги: булыжная тропа деревни (полосы по сетке 64/48 px, площадки на поворотах)
    const hs = fr('hstrip'), vs = fr('vstrip');
    d.strips.forEach(([o, x, y, len]) => {
      if (o === 'h') { let xx = x; while (xx < x + len) { const off = xx % hs[2], w = Math.min(hs[2] - off, x + len - xx); g.drawImage(A, hs[0] + off, hs[1], w, hs[3], xx, y, w, hs[3]); xx += w; } }
      else { let yy = y; while (yy < y + len) { const off = yy % vs[3], h = Math.min(vs[3] - off, y + len - yy); g.drawImage(A, vs[0], vs[1] + off, vs[2], h, x, yy, vs[2], h); yy += h; } }
    });
    const pd = fr('pad'); d.pads.forEach(([x, y]) => g.drawImage(A, pd[0], pd[1], pd[2], pd[3], x - (pd[2] >> 1), y - (pd[3] >> 1), pd[2], pd[3]));
    // одна тень вправо-вниз (как в деревне): мосты, предметы, жители, сундуки; потом мосты и предметы по глубине
    const sh = document.createElement('canvas'); sh.width = LW; sh.height = LH; const shg = sh.getContext('2d');
    const sil = {}; const silOf = k => { if (sil[k]) return sil[k]; const f = fr(k), c = document.createElement('canvas'); c.width = f[2]; c.height = f[3]; const cg = c.getContext('2d'); cg.drawImage(A, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]); cg.globalCompositeOperation = 'source-in'; cg.fillStyle = 'rgb(30,44,20)'; cg.fillRect(0, 0, f[2], f[3]); return (sil[k] = c); };
    const bt = fr('br_top'), bm = fr('br_mid'), bb = fr('br_bot');
    const bridge = (ctx, b, s) => { const pc = (f, y, h) => s ? ctx.drawImage(silOf(f === bt ? 'br_top' : f === bm ? 'br_mid' : 'br_bot'), 0, 0, f[2], h, b.x + 3, y + 2, f[2], h) : ctx.drawImage(A, f[0], f[1], f[2], h, b.x, y, f[2], h);
      pc(bt, b.y, bt[3]); let y = b.y + bt[3]; const yEnd = b.y + b.h - bb[3]; while (y < yEnd) { const h = Math.min(bm[3], yEnd - y); pc(bm, y, h); y += h; } pc(bb, yEnd, bb[3]); };
    d.br.forEach(b => bridge(shg, b, true));
    d.draws.concat(d.npcs.map(n => ({ key: n.key, x: n.x, y: n.y, h: n.h, shadow: true }))).forEach(o => { if (o.shadow) shg.drawImage(silOf(o.key), o.x + 2 + Math.floor(o.h / 20), o.y + 1 + Math.floor(o.h / 36)); });
    g.globalAlpha = 0.30; g.drawImage(sh, 0, 0); g.globalAlpha = 1;
    d.br.forEach(b => bridge(g, b, false));
    d.draws.forEach(o => { if (!o.skip) draw(o.key, o.x, o.y); });
    // тёплые лучи от верхнего левого угла и лёгкая виньетка по краю (как в деревне)
    g.fillStyle = 'rgba(255,234,170,0.07)';
    for (let c0 = -60; c0 < LW * 0.8 + LH; c0 += 520) for (const [c, w] of [[0, 46], [120, 30], [230, 52], [360, 34]]) {
      const v0 = c0 + c, v1 = v0 + w;                                   // полоса x*0.8 - y*0.6 в [v0, v1)
      g.beginPath(); g.moveTo(v0 / 0.8, 0); g.lineTo(v1 / 0.8, 0); g.lineTo((v1 + 0.6 * LH) / 0.8, LH); g.lineTo((v0 + 0.6 * LH) / 0.8, LH); g.closePath(); g.fill();
    }
    [[8, 0.063], [18, 0.035], [32, 0.016]].forEach(([w, a]) => { g.fillStyle = `rgba(34,24,12,${a})`; g.fillRect(0, 0, LW, w); g.fillRect(0, LH - w, LW, w); g.fillRect(0, 0, w, LH); g.fillRect(LW - w, 0, w, LH); });
    return cv;
  }

  const COL = { der: '#3a7be0', die: '#e24848', das: '#2f9a4f' }, FONT = 'Roboto, sans-serif';
  // чёткая подпись (шрифт телефона, не пиксельный): строки текста с обводкой -> canvas, края без полупрозрачной каймы, цвета — только свои
  // rows: [{ size, bold, sw, segs: [[текст, цвет], ...] }], stroke — цвет обводки; o.maxW / o.maxH — вписать (масштаб шрифта, не картинки)
  function crisp(sc, key, rows, stroke, o = {}) {
    if (sc.textures.exists(key)) return key;
    const c = document.createElement('canvas'), g = c.getContext('2d'), font = (r, k) => `${r.bold === false ? 'normal' : 'bold'} ${Math.round(r.size * k)}px ${FONT}`;
    const rowW = (r, k) => { g.font = font(r, k); return Math.ceil(r.segs.reduce((a, s) => a + g.measureText(s[0]).width, 0) + r.sw * k); }, rowH = (r, k) => Math.ceil(r.size * k * 1.18 + r.sw * k * 0.5);
    let k = 1; if (o.maxW) k = Math.min(k, o.maxW / Math.max(...rows.map(r => rowW(r, 1)))); if (o.maxH) k = Math.min(k, o.maxH / rows.reduce((a, r) => a + rowH(r, 1), 0));
    const W = Math.max(...rows.map(r => rowW(r, k))) + 4, H = rows.reduce((a, r) => a + rowH(r, k), 0) + 4; c.width = W; c.height = H;
    let y = 2; const lay = rows.map(r => { const h = rowH(r, k); y += h; return [r, y - Math.ceil(r.sw * k * 0.35) - 2]; });
    for (const pass of ['stroke', 'fill']) lay.forEach(([r, base]) => { g.font = font(r, k); g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; let x = Math.round((W - rowW(r, k)) / 2 + r.sw * k / 2);
      r.segs.forEach(([t, col]) => { if (pass === 'stroke') { g.lineWidth = r.sw * k; g.strokeStyle = stroke; g.strokeText(t, x, base); } else { g.fillStyle = col; g.fillText(t, x, base); } x += g.measureText(t).width; }); });
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), pal = [stroke, ...rows.flatMap(r => r.segs.map(s => s[1]))].map(hex);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 110) { d[i + 3] = 0; continue; } let best = pal[0], bd = 1e9; for (const p of pal) { const e = (d[i] - p[0]) ** 2 + (d[i + 1] - p[1]) ** 2 + (d[i + 2] - p[2]) ** 2; if (e < bd) { bd = e; best = p; } } d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2]; d[i + 3] = 255; }
    g.putImageData(im, 0, 0); sc.textures.addCanvas(key, c); return key;
  }
  const opened = () => { try { return JSON.parse(localStorage.getItem('ds_proto.opened')) || []; } catch (e) { return []; } };
  class Welt extends Phaser.Scene {
    constructor() { super('Welt'); }
    preload() {
      if (!this.textures.exists('world_atlas')) { this.load.image('world_atlas', 'assets_v3/world/atlas.png'); this.load.json('world_atlas_json', 'assets_v3/world/atlas.json'); }
      if (!this.textures.exists('dun_anim')) this.load.image('dun_anim', 'assets_v3/dungeon/anim.png');      // люк в подвал (как у дома героя)
      if (!this.textures.exists('plot_sign')) this.load.image('plot_sign', 'assets_v3/town/plot_sign.png');  // табличка хутора (доска деревни)
    }
    create(data) {
      data = data || {};
      this.walker = null; this.heroShadow = null; this.busy = false; this.talking = false; this.walkTween = null;
      let seed = data.seed != null ? data.seed : this.registry.get('weltSeed');   // назад из подземелья — тот же мир
      if (seed == null) { try { seed = +localStorage.getItem('ds_proto.worldSeed'); } catch (e) {} if (!seed) { seed = (Math.random() * 0x7fffffff) >>> 0 || 1; try { localStorage.setItem('ds_proto.worldSeed', String(seed)); } catch (e) {} } }
      this.seed = seed >>> 0; this.registry.set('weltSeed', this.seed); const F = this.cache.json.get('world_atlas_json');
      const C = window.__weltCache && window.__weltCache.seed === this.seed ? window.__weltCache : (window.__weltCache = gen(this.seed, F));
      const d = this.world = C; this.worldW = LW * SC; this.worldH = LH * SC; this.viewW = 960; this.viewH = 780;
      this.townMask = { cell: CELL * SC, mask: d.mask };
      const X = v => v * SC;
      this.pois = d.pois.map(p => ({ kind: p.k, x: X(p.at[0]), y: X(p.at[1]) }));
      this.npcs = d.npcs.map(n => ({ x: X(n.x + n.w / 2), y: X(n.y + n.h), name: n.name, place: n.place }));
      this.spawns = d.spawns.map(s => ({ x: X(s.x), y: X(s.y) }));
      this.review = d.review ? { x: X(d.review.x), y: X(d.review.y) } : null; this.dungeons = d.dungeons.map(g => ({ x: X(g.x), y: X(g.y), seed: g.seed }));
      this.home = { x: X(d.stillbach.x), y: X(d.stillbach.y) };
      const key = 'welt_map_' + this.seed; if (!this.textures.exists(key)) { Object.keys(this.textures.list).filter(k => /^welt_map_/.test(k)).forEach(k => this.textures.remove(k)); this.textures.addCanvas(key, paint(this, d, F)); }
      this.add.image(0, 0, key).setOrigin(0, 0).setScale(SC).setDepth(-10);
      this.cameras.main.setBackgroundColor(`rgb(${GRASS})`);
      ['bag', 'bFurn', 'bMap'].forEach(k => { const e = document.getElementById(k); if (e) e.style.display = 'none'; });
      const dlg = document.getElementById('dlg'); if (dlg) dlg.style.display = 'none';
      const gt = document.getElementById('goalTxt'); if (gt) gt.textContent = 'Wiesenland · A1';
      const at = this.textures.get('world_atlas'); Object.entries(F.frames).forEach(([k, f]) => { if (!at.has(k)) at.add(k, 0, f[0], f[1], f[2], f[3]); });
      this.npcImgs = d.npcs.map(n => this.add.image(X(n.x), X(n.y), 'world_atlas', n.key).setOrigin(0, 0).setScale(SC).setDepth(X(n.y + n.h)));
      if (d.camp) { if (!this.anims.exists('welt_fire')) this.anims.create({ key: 'welt_fire', frames: [0, 1, 2, 3, 4].map(i => ({ key: 'world_atlas', frame: 'fire' + i })), frameRate: 7, repeat: -1 });
        this.add.sprite(X(d.camp.x), X(d.camp.y), 'world_atlas', 'fire0').setOrigin(0, 0).setScale(SC).setDepth(X(d.camp.y + 26)).play('welt_fire'); }
      const da = this.textures.get('dun_anim'); if (da && !da.has('hatch')) da.add('hatch', 0, 160, 159, 17, 17);   // craftpix 436971: деревянный люк с кольцом
      d.dungeons.forEach(g => this.add.image(X(g.hatch[0]), X(g.hatch[1]), 'dun_anim', 'hatch').setOrigin(0, 0).setScale(SC).setDepth(X(g.hatch[1])));
      const op = opened();                                             // сундуки: Loot (вопрос по слову), открытые — серые
      this.chests = d.chests.map((c, i) => { const o = { x: X(c.x), y: X(c.y), id: 'welt:' + this.seed + ':' + i, tier: 'normal' };
        o.img = this.add.image(X(c.bx), X(c.by), 'world_atlas', 'chest0').setOrigin(0, 0).setScale(SC).setDepth(X(c.by + c.h));
        if (op.includes(o.id)) { o.opened = true; o.img.setTint(0xb8a890); } return o; });
      d.labels.forEach((l, i) => {                                     // подпись: немецкое слово (артикль в цвете рода), под ним мелко по-русски
        const k = crisp(this, `wl_${this.seed}_${i}`, [{ size: 20, sw: 6, segs: (l.art ? [[l.art + ' ', COL[l.art]]] : []).concat([[l.de, '#fff7e0']]) }, { size: 13, sw: 4, segs: [[l.ru, '#f3e3c3']] }], '#3b2314');
        this.add.image(X(l.x), X(l.y) + 4, k).setOrigin(0.5, 1).setDepth(6000);
      });
      d.signs.forEach(s => this.sign(s));
      d.zones.forEach(z => {
        const zn = this.add.zone(X((z.x0 + z.x1) / 2), X((z.y0 + z.y1) / 2), X(z.x1 - z.x0), X(z.y1 - z.y0)).setInteractive({ useHandCursor: true });
        zn.on('pointerup', () => { if (this.__dragged || this.busy) return; const go = () => this.act(z); if (window.walkToScene) window.walkToScene(this, X(z.at[0]), X(z.at[1]), go); else go(); });
      });
      d.npcs.forEach((n, i) => { const zn = this.add.zone(X(n.x + n.w / 2), X(n.y + n.h / 2), X(n.w + 8), X(n.h + 8)).setInteractive({ useHandCursor: true });
        zn.on('pointerup', () => { if (this.__dragged || this.busy) return; const go = () => this.say(i); if (window.walkToScene) window.walkToScene(this, X(n.x - 10), X(n.y + n.h + 6), go); else go(); }); });
      const sp = this.registry.get('weltSpawn'); this.registry.set('weltSpawn', null);
      const start = sp || [X(d.spawn[0]), X(d.spawn[1])];
      this.hero = this.add.image(start[0], start[1], 'v3_hero').setVisible(false);
      this.camFocus = [start[0], start[1] - 60];
      if (window.walkSetup) window.walkSetup(this);
      if (!sp) {                                                       // вход из деревни: подпись Stillbach (дом-ворота над Max, выше экрана) — плашкой сверху на 2 с
        const k = crisp(this, 'wl_entry', [{ size: 22, sw: 6, segs: [['Stillbach', '#fff7e0']] }, { size: 13, sw: 4, segs: [['↑ назад в деревню', '#f3e3c3']] }], '#3b2314');
        const cam = this.cameras.main, ban = this.add.image(Math.round(cam.width / 2), 132, k).setOrigin(0.5, 1).setScrollFactor(0).setDepth(8000);
        this.time.delayedCall(2000, () => this.tweens.add({ targets: ban, alpha: 0, duration: 400, onComplete: () => ban.destroy() }));
      }
      if (window.Combat && this.spawns.length) {                       // лагерь врагов: бой из combat.js (не трогаем его, только точки)
        try { this.enemies = Combat.spawnEnemies(this, this.spawns.map(s => [s.x, s.y]), { entry: [X(d.spawn[0]), X(d.spawn[1])], types: ['slime1', 'slime2', 'orc1'] }); } catch (e) { console.warn('Combat', e); }
      }
      this.events.once('shutdown', () => { this.walker = null; this.heroShadow = null; this.busy = false; this.walkTween = null; if (this.bubble) this.bubble.destroy(); this.bubble = null; });
      this.cameras.main.fadeIn(300); if (window.fitCam) window.fitCam(this);
    }
    sign(s) {                                                         // табличка хутора: доска деревни, текст строго внутри рамки (как Bauplatz)
      const X = v => v * SC, PS = { w: 288, h: 114, inner: [12, 9, 276, 72] }, sx = X(s.x), sy = X(s.y), dep = sy + PS.h;
      this.add.image(sx, sy, 'plot_sign').setOrigin(0, 0).setDepth(dep);
      const [ix0, iy0, ix1, iy1] = PS.inner, iw = ix1 - ix0 - 8, ih = iy1 - iy0 - 2;
      const k = crisp(this, 'wsign_' + s.de, [{ size: 15, sw: 3, segs: [['der ', COL.der], ['Hof', '#f3d9a4']] }, { size: 21, sw: 3, segs: [[s.de, '#fff4dc']] }, { size: 12, sw: 2, bold: false, segs: [[s.ru, '#f3d9a4']] }], '#2a170c', { maxW: iw, maxH: ih });
      this.add.image(Math.round(sx + (ix0 + ix1) / 2), Math.round(sy + (iy0 + iy1) / 2), k).setOrigin(0.5, 0.5).setDepth(dep + 1);
    }
    say(i) {                                                          // житель хутора здоровается: пузырь над головой, по-немецки + мелко по-русски
      const n = this.world.npcs[i], X = v => v * SC; if (!n) return; if (this.bubble) this.bubble.destroy();
      let de = `Hallo! Ich bin ${n.name}.`, ru = `привет! я ${n.ru} · хутор ${n.place}`; const st = { fontFamily: FONT, fontStyle: 'bold', stroke: '#3b2314', strokeThickness: 5 };
      if (i === 0 && window.Quests) {                                  // первое задание (пробно): житель первого хутора просит 3 Holz из сундуков
        const Q = window.Quests, act = Q.list().find(q => q.id === 'holz3');
        if (Q.finished().includes('holz3')) { de = 'Danke für das Holz!'; ru = 'спасибо за дерево!'; }
        else if (act) { de = `Noch ${act.need - act.count} Holz, bitte!`; ru = `ещё ${act.need - act.count} дерева, пожалуйста · ищи в сундуках`; }
        else { Q.add({ id: 'holz3', title_de: 'Bring mir 3 Holz', title_ru: 'принеси 3 дерева · ' + n.name, goal_de: 'Holz', count: 0, need: 3, reward: 15 }); de = `Hallo! Ich bin ${n.name}. Bring mir 3 Holz!`; ru = `${n.ru}: принеси 3 дерева из сундуков — 15 монет`; }
      }
      const c = this.add.container(Math.round(X(n.x + n.w / 2)), Math.round(X(n.y) - 10)).setDepth(7000);
      const t1 = this.add.text(0, -18, de, { ...st, fontSize: '20px', color: '#fff7e0' }).setOrigin(0.5, 1), t2 = this.add.text(0, -2, ru, { ...st, fontSize: '13px', color: '#f3e3c3', strokeThickness: 4 }).setOrigin(0.5, 1);
      c.add([t1, t2]); this.bubble = c; if (window.speakDE) speakDE(de);
      this.time.delayedCall(3200, () => { if (this.bubble === c) { c.destroy(); this.bubble = null; } });
    }
    leaveTo(key, data, spawnTown) {
      if (this.busy) return; this.busy = true; if (spawnTown) this.registry.set('spawnAt', spawnTown);
      this.cameras.main.fadeOut(260, 29, 19, 11); this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key, data));
    }
    act(z) {
      if (window.speakDE && z.act !== 'hamlet') speakDE({ home: 'Stillbach', dungeon: 'der Keller', camp: 'das Lager', stones: 'die alten Steine', chest: 'die Truhe' }[z.act] || '');
      if (z.act === 'home') { const G = window.WELT_GATE; return this.leaveTo('Yard', {}, G ? [G.x + 40, G.y] : null); }
      if (z.act === 'dungeon') { const g = this.dungeons[z.di]; this.registry.set('weltSpawn', [g.x, g.y + 24]); return this.leaveTo('Dungeon', { seed: g.seed, floor: 0, from: 'Welt' }); }
      if (z.act === 'hamlet') return this.say(z.ni);
      if (z.act === 'camp') return toast('das Lager: Vorsicht!', 1500);
      if (z.act === 'chest') { const c = this.chests[z.ci]; if (c && window.Loot) Loot.open(this, c, { tier: c.tier }); return; }
      if (z.act === 'stones') {                                         // повторение: слова из «Повтора» (Combat.review); в приложении — экран повтора
        const n = window.Combat && Combat.review ? Combat.review().length : 0;
        toast(n ? `Wiederholen: ${n} Wörter` : 'Die Steine schweigen', 1800);
        if (n && /[?&]embed=1/.test(location.search) && window.parent !== window) setTimeout(() => window.parent.postMessage({ ds: 'go', hash: '#/review' }, location.origin), 900);
      }
    }
  }
  window.Welt = Welt; window.weltGen = gen; window.WELT = { T, SC, TS, MW, MH, LW, LH, CELL };
})();
