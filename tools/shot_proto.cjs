// node shot_proto.cjs : serves proto/ and takes a 5-frame flow screenshot (yard -> zoom -> lesson -> spell -> reward -> yard changed) into proto/shots/
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require(path.resolve(__dirname, '../../../app/node_modules/playwright')); } })();
const root = path.resolve(__dirname, '../docs'), out = path.join(root, 'shots'); fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, '') || 'index.html'); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); });
(async () => {
  await new Promise(r => srv.listen(8095, r));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('console', m => { if (/error|missing/i.test(m.text())) console.log('console:', m.text()); }); p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8095/index.html?auto=1'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(out, '1_yard.png') });
  await p.mouse.click(480, 200); await p.waitForTimeout(500); await p.screenshot({ path: path.join(out, '2_zoom.png') });
  await p.waitForTimeout(1800); await p.waitForTimeout(800); await p.screenshot({ path: path.join(out, '3_lesson.png') });
  for (let i = 0; i < 12; i++) { const sp = await p.$('#bSpeak'), vis = sp && await sp.isVisible(); if (vis) { await p.click('#bSpeak'); await p.waitForTimeout(500); if (i < 4) await p.screenshot({ path: path.join(out, '4_spell.png') }); await p.waitForTimeout(1200); } else { await p.click('#bNext'); await p.waitForTimeout(500); } if (await (await p.$('#reward')).isVisible()) break; }
  await p.waitForTimeout(600); await p.screenshot({ path: path.join(out, '5_reward.png') });
  await p.click('#bBack'); await p.waitForTimeout(2800); await p.screenshot({ path: path.join(out, '6_yard_after.png') });
  await b.close(); srv.close(); console.log('shots ok');
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
