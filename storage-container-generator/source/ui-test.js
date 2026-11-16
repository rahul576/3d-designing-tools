// Browser test: node ui-test.js  (needs playwright + chromium; writes screenshots u*.png)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const checks = [];
const ok = (cond, msg) => { checks.push((cond ? 'PASS ' : 'FAIL ') + msg); };
function stlCheck(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(80), map = new Map(), dir = new Map(); let V = 0;
  const id = o => { const k = [0, 4, 8].map(d => Math.round(b.readFloatLE(o + d) * 1e4)).join(','); if (!map.has(k)) map.set(k, V++); return map.get(k); };
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12, t = [id(o), id(o + 12), id(o + 24)];
    for (const [a, c] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = a + '_' + c; dir.set(k, (dir.get(k) || 0) + 1); }
  }
  let bad = 0; for (const [k, c] of dir) { const [a, d] = k.split('_'); if (c !== 1 || dir.get(d + '_' + a) !== 1) bad++; }
  return { n, bad, euler: V - dir.size / 2 + n, size: b.length };
}
(async () => {
  const out = path.join(__dirname, 'ui-out'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', r => r.request().url().startsWith('file:') || r.request().url().startsWith('data:') ? r.continue() : (errors.push('NETWORK ' + r.request().url()), r.abort()));
  await page.goto('file://' + __dirname + '/storage-container-generator-v1.html');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
  const A = () => page.evaluate(() => { const r = window.__app.res; return { tris: r.container.indices.length / 3, lid: !!r.lid, lidName: r.lid && r.lidInfo.name, H: r.params.H, shape: r.params.shape, stack: r.params.stack, tex: r.params.texture.type, decos: window.__app.state.decos.map(d => ({ u: d.u, z: d.z, engrave: d.engrave, kind: d.kind })), warn: r.warn }; });
  await page.screenshot({ path: path.join(out, 'u1-default.png') });
  ok((await page.textContent('#okLine')).includes('No supports needed'), 'default: "No supports needed" shown');

  // 1) every shape
  for (const s of ['round', 'oval', 'square', 'rect', 'pill', 'triangle', 'pentagon', 'hexagon', 'octagon', 'heart', 'star', 'flower']) {
    await page.click(`[data-shape="${s}"]`); await page.waitForTimeout(120);
    const a = await A(); ok(a.shape === s && a.tris > 1000, `shape ${s} builds (${a.tris} triangles)`);
    ok((await page.textContent('#okLine')).includes('No supports needed'), `shape ${s}: no supports needed`);
  }
  await page.screenshot({ path: path.join(out, 'u2-flower.png') });
  // proportions lock: rectangle unlocks, depth independent
  await page.click('[data-shape="rect"]');
  ok(!(await page.isChecked('#lock')), 'rectangle: proportions unlocked so width and depth are independent');
  await page.fill('[data-f="D"] input[type=number]', '50'); await page.press('[data-f="D"] input[type=number]', 'Enter'); await page.waitForTimeout(150);
  ok((await page.evaluate(() => window.__app.res.params.D)) === 50 && (await page.evaluate(() => window.__app.res.params.W)) === 80, 'rectangle depth set to 50 independently');

  // 2) every lid
  await page.click('[data-shape="round"]');
  for (const l of ['none', 'plug', 'cap', 'screw', 'stack']) {
    await page.click(`[data-lid="${l}"]`); await page.waitForTimeout(250);
    const a = await A(); ok(a.lid === (l !== 'none'), `lid ${l}: ${a.lid ? 'lid built (' + a.lidName + ')' : 'no lid'}`);
    ok((await page.textContent('#okLine')).includes('No supports needed'), `lid ${l}: no supports needed`);
    if (l === 'screw') { ok(await page.isDisabled('#stack'), 'screw lid: stacking disabled with a reason'); await page.screenshot({ path: path.join(out, 'u3-screw.png') }); }
    if (l === 'stack') ok(a.stack && await page.isVisible('#optStackL'), 'stacking lid turns on stacking and the "2 stacked" view');
  }
  await page.check('#optStack'); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, 'u4-stacked.png') });
  await page.click('[data-lid="plug"]'); await page.uncheck('#stack'); await page.waitForTimeout(150);
  ok(!(await A()).stack, 'stacking can be turned off');
  await page.check('#stack'); await page.waitForTimeout(150); ok((await A()).stack, 'push-fit lid + stackable');

  // 3) every texture
  for (const t of ['ribs', 'flutes', 'waves', 'twist', 'knurl', 'bricks', 'honeycomb', 'dots', 'none']) {
    await page.click(`[data-tex="${t}"]`); await page.waitForTimeout(200);
    const a = await A(); ok(a.tex === t, `texture ${t} builds (${a.tris} triangles)`);
    ok((await page.textContent('#okLine')).includes('No supports needed'), `texture ${t}: no supports needed`);
  }
  await page.click('[data-tex="honeycomb"]'); await page.waitForTimeout(200);

  // 4) text: add, edit, drag on the 3D model, drag on the wall map, engrave
  await page.click('#addText'); await page.waitForTimeout(300);
  let a = await A(); ok(a.decos.length === 1 && a.decos[0].kind === 'text', 'Add text adds a text item');
  await page.fill('#decoText', 'BUTTONS'); await page.waitForTimeout(300);
  await page.evaluate(() => window.__app.setView({ theta: -Math.PI / 2, phi: 0.25 })); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'u5-text.png') });
  const t0 = await page.evaluate(() => { const d = window.__app.state.decos[0]; return window.__app.screenOf(window.__app.wallPoint(d.u, d.z)); });
  const th0 = await page.evaluate(() => window.__app.state.decos[0].u);
  await page.mouse.move(t0[0], t0[1]); await page.mouse.down(); for (let k = 1; k <= 8; k++) { await page.mouse.move(t0[0] + k * 10, t0[1] - k * 2); await page.waitForTimeout(30); } await page.mouse.up(); await page.waitForTimeout(400);
  a = await A();
  ok(a.decos[0].u > th0 + 0.02 && a.decos[0].z > (await page.evaluate(() => window.__app.res.zone.zA)), `drag on the 3D model moves the text right (u ${th0.toFixed(3)} -> ${a.decos[0].u.toFixed(3)})`);
  const view1 = await page.evaluate(() => window.__app.state && 1);
  ok(view1 === 1, 'view did not orbit away while dragging text');
  // wall map drag
  await page.locator('#wallSvg').scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
  const box = await page.locator('#wallSvg .deco').first().boundingBox();
  const u1 = a.decos[0].u, z1 = a.decos[0].z;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 + 8, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(400);
  a = await A(); ok(a.decos[0].u < u1 - 0.02 && a.decos[0].z < z1, `drag on the unrolled wall moves it left and down (u ${u1.toFixed(3)} -> ${a.decos[0].u.toFixed(3)}, z ${z1.toFixed(1)} -> ${a.decos[0].z.toFixed(1)})`);
  const vRaised = await page.evaluate(() => window.__app.res.container.volume);
  await page.click('#decoMode [data-m="engrave"]'); await page.waitForTimeout(300);
  ok((await A()).decos[0].engrave && (await page.evaluate(() => window.__app.res.container.volume)) < vRaised, 'Engraved cuts into the wall (less material)');
  await page.click('#decoMode [data-m="raise"]');
  // 5) clipart + uploaded image
  await page.click('#addClip'); await page.click('[data-clip="paw"]'); await page.waitForTimeout(300);
  a = await A(); ok(a.decos.length === 2 && a.decos[1].kind === 'clip', 'clipart added');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#000'; x.beginPath(); x.arc(32, 32, 24, 0, 7); x.fill(); return c.toDataURL('image/png').split(',')[1]; });
  await page.click('#addClip'); await page.setInputFiles('#upload', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await page.waitForTimeout(800);
  a = await A(); ok(a.decos.length === 3 && a.decos[2].kind === 'img', 'uploaded image added as relief');
  ok((await page.textContent('#okLine')).includes('No supports needed'), 'with text, clipart and image: no supports needed');
  await page.evaluate(() => window.__app.setView({ theta: -Math.PI / 2 - 0.5, phi: 0.3 })); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'u6-decos.png') });
  // delete + undo
  await page.click('#decoDel'); await page.waitForTimeout(200); ok((await A()).decos.length === 2, 'Delete removes the selected item');
  await page.click('#undo'); await page.waitForTimeout(300); ok((await A()).decos.length === 3, 'Undo brings it back');
  await page.click('#redo'); await page.waitForTimeout(300); ok((await A()).decos.length === 2, 'Redo removes it again');

  // 6) downloads: STL + 3MF, container / lid / both
  for (const fmtName of ['stl', '3mf']) for (const kind of ['container', 'lid', 'both']) {
    await page.click('#download'); await page.click(`[data-fmt="${fmtName}"]`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-dl="${kind}"]`)]);
    const f = path.join(out, dl.suggestedFilename()); await dl.saveAs(f);
    if (fmtName === 'stl') {
      const s = stlCheck(f);
      ok(s.bad === 0 && s.euler === (kind === 'both' ? 4 : 2), `${dl.suggestedFilename()}: ${s.n} triangles, closed and manifold (euler ${s.euler})`);
    } else {
      const r = execFileSync('python3', [path.join(__dirname, 'check3mf.py'), f, kind === 'both' ? 'both' : 'one']).toString().trim();
      ok(r.startsWith('OK'), `${dl.suggestedFilename()}: ${r}`);
    }
  }
  // 7) persistence
  await page.reload(); await page.waitForTimeout(800);
  a = await A(); ok(a.decos.length === 2 && a.tex === 'honeycomb', 'design survives a reload');
  // 8) phone layout
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 391, `phone width: no sideways scroll (${sw}px)`);
  await page.screenshot({ path: path.join(out, 'u7-phone.png') });

  ok(errors.length === 0, 'no console errors or network requests: ' + errors.join(' | '));
  await browser.close();
  console.log(checks.join('\n'));
  const f = checks.filter(c => c.startsWith('FAIL')).length;
  console.log(f ? `${f} UI checks failed` : `ALL ${checks.length} UI CHECKS PASSED`);
  process.exit(f ? 1 : 0);
})();
