// node shot_furnish.cjs : furnishing mode check -> shots/f1_empty, f2_ghost, f3_placed, f4_invalid, f5_yard_back + a rules report.
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../../app/node_modules/playwright')); } })();
const root = __dirname, out = path.join(root, 'shots'); fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html'); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); });
(async () => {
  await new Promise(r => srv.listen(8096, r));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', e => console.log('pageerror:', e.message)); p.on('console', m => { if (/error/i.test(m.text())) console.log('console:', m.text()); });
  await p.goto('http://localhost:8096/index.html?auto=1'); await p.evaluate(() => localStorage.setItem('ds_proto', JSON.stringify({ done: true, coins: 200 }))); await p.reload(); await p.waitForTimeout(1500);
  await p.click('#bFurn'); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, 'f1_empty.png') });
  await p.click('.fitem[data-k="bett"]'); await p.mouse.move(360, 216); await p.waitForTimeout(400); await p.screenshot({ path: path.join(out, 'f2_ghost.png') });
  const tests = [['bett', 120, 72, null], ['regal', 160, 72, null], ['teppich', 160, 136, null], ['tisch', 160, 120, null], ['stuhl', 136, 120, null], ['pflanze', 192, 136, null], ['truhe', 112, 152, 'floor'], ['schrank', 152, 112, 'wall'], ['tisch', 162, 130, 'overlap'], ['fass', 60, 40, 'floor']];
  const res = [];
  for (const [k, x, y, expect] of tests) { const r = await p.evaluate(([k, x, y]) => window.__furn.place(k, x, y), [k, x, y]); res.push(`${k}@${x},${y}: ${r || 'placed'} (expected ${expect || 'placed'})`); await p.waitForTimeout(150); if (expect === 'wall') await p.screenshot({ path: path.join(out, 'f4_invalid.png') }); }
  await p.waitForTimeout(1700); await p.screenshot({ path: path.join(out, 'f3_placed.png') });
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ds_proto')));
  await p.click('#bFurnDone'); await p.waitForTimeout(1200); await p.screenshot({ path: path.join(out, 'f5_yard_back.png') });
  console.log(res.join('\n')); console.log('saved items:', (saved.furn || []).length, 'coins left:', saved.coins);
  await b.close(); srv.close();
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
