const { chromium } = require('playwright');
const fs = require('fs');
const checks = [];
const ok = (cond, msg) => { checks.push((cond ? 'PASS ' : 'FAIL ') + msg); };
function stlCheck(path) {
  const b = fs.readFileSync(path), n = b.readUInt32LE(80), map = new Map(), dir = new Map(); let V = 0, vol = 0;
  const id = o => { const k = [0, 4, 8].map(d => Math.round(b.readFloatLE(o + d) * 1e4)).join(','); if (!map.has(k)) map.set(k, V++); return map.get(k); };
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12, t = [id(o), id(o + 12), id(o + 24)], p = [0, 12, 24].map(d => [0, 4, 8].map(e => b.readFloatLE(o + d + e)));
    vol += (p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])) / 6;
    for (const [a, c] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const k = a + '_' + c; dir.set(k, (dir.get(k) || 0) + 1); }
  }
  let bad = 0; for (const [k, c] of dir) { const [a, d] = k.split('_'); if (c !== 1 || dir.get(d + '_' + a) !== 1) bad++; }
  return { n, bad, euler: V - dir.size / 2 + n, vol: vol / 1000 };
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : (errors.push('NETWORK ' + r.request().url()), r.abort()));
  await page.goto('file://' + __dirname + '/tray-generator-v8.html');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'u1-default.png' });
  const T = () => page.evaluate(() => ({ leaves: window.__tray.mesh.params.leaves.map(l => [l.path, l.r.map(v => Math.round(v * 10) / 10)]), sel: window.__tray.selection, layout: window.__tray.state.layout }));

  // 1) Grid tab: click the back compartment in 3D, split it into 3 columns
  const counts = () => page.evaluate(() => [document.querySelector('#gridBar .stepper[data-g="sc"] output').textContent, document.querySelector('#gridBar .stepper[data-g="sr"] output').textContent, document.querySelector('.stepper[data-g="sc"] output').textContent, document.querySelector('.stepper[data-g="sr"] output').textContent]);
  await page.click('[data-tab="grid"]'); await page.waitForTimeout(200);
  let c = await counts(); ok(c.join() === '1,2,1,2', `nothing selected: whole tray shows 1 column × 2 rows (bar + sidebar: ${c})`);
  const back = await page.evaluate(() => { const q = window.__tray.mesh.params, L = q.leaves[1]; return window.__tray.screenOf([(L.r[0] + L.r[1]) / 2, (L.r[2] + L.r[3]) / 2, q.t]); });
  await page.mouse.click(back[0], back[1]); await page.waitForTimeout(150);
  let s = await T(); ok(s.sel.length === 1 && s.sel[0] === '1', `3D click selects back compartment (sel=${JSON.stringify(s.sel)})`);
  c = await counts(); ok(c[0] === '1' && c[1] === '1', `selected compartment with no partitions shows 1 × 1 (${c[0]},${c[1]})`);
  await page.click('#gridBar .stepper[data-g="sc"] button:last-of-type'); await page.waitForTimeout(150);
  await page.click('#gridBar .stepper[data-g="sc"] button:last-of-type'); await page.waitForTimeout(150);
  s = await T(); ok(s.leaves.length === 4, `Cols + twice on the selection -> 3 columns there, 4 compartments total (got ${s.leaves.length})`);
  ok(s.leaves.filter(l => l[1][2] < 5).length === 1, 'front compartment untouched (still one full-width compartment)');
  c = await counts(); ok(c[0] === '3' && c[1] === '1' && s.sel[0] === '1', `selection stays on the region and now shows 3 × 1 (${c[0]},${c[1]})`);
  await page.screenshot({ path: 'u2-grid-split.png' });

  // 2) 2D editor: select the middle column, add a row there
  await page.click('#laySvg rect.leaf[data-p="1.1"]'); await page.waitForTimeout(100);
  c = await counts(); ok(c[0] === '1' && c[1] === '1', `middle column alone shows 1 × 1 (${c[0]},${c[1]})`);
  await page.click('.stepper[data-g="sr"] button:last-of-type'); await page.waitForTimeout(200);
  s = await T(); ok(s.leaves.length === 5, `sidebar Rows + -> 2 rows in that column, 5 compartments (got ${s.leaves.length})`);
  c = await counts(); ok(c[0] === '1' && c[1] === '2', `it now shows 1 × 2 (${c[0]},${c[1]})`);
  // select group: from one of the new cells up to its column, then to the back row
  await page.click('#laySvg rect.leaf[data-p="1.1.0"]'); await page.click('#groupBtn'); await page.waitForTimeout(100);
  s = await T(); c = await counts(); ok(s.sel[0] === '1.1' && c[0] === '1' && c[1] === '2', `Select group -> the column (sel ${s.sel}, ${c[0]} × ${c[1]})`);
  await page.click('#groupBtn'); await page.waitForTimeout(100);
  s = await T(); c = await counts(); ok(s.sel[0] === '1' && c[0] === '3' && c[1] === '2', `Select group again -> the back row (sel ${s.sel}, ${c[0]} × ${c[1]})`);
  // whole tray
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  c = await counts(); ok(c[0] === '3' && c[1] === '3', `Esc: whole tray shows 3 columns × 3 rows (${c[0]},${c[1]})`);
  await page.click('#gridBar .stepper[data-g="sr"] button:last-of-type'); await page.waitForTimeout(200);
  s = await T(); c = await counts();
  ok(s.leaves.length === 6 && c[1] === '4' && s.leaves.filter(l => l[0].startsWith('1.')).length === 4, `Rows + on whole tray adds a row and keeps the custom back row (${s.leaves.length} compartments, ${c[0]} × ${c[1]})`);
  await page.click('#gridBar .stepper[data-g="sr"] button:first-of-type'); await page.waitForTimeout(200);
  s = await T(); ok(s.leaves.length === 5, `Rows − removes it again (${s.leaves.length} compartments)`);
  // too small is refused
  await page.click('#laySvg rect.leaf[data-p="1.0"]');
  for (let k = 0; k < 12; k++) await page.click('#gridBar .stepper[data-g="sc"] button:last-of-type');
  await page.waitForTimeout(200);
  const minW = (await T()).leaves.reduce((m, l) => Math.min(m, l[1][1] - l[1][0]), 1e9);
  ok(minW >= 3.99, `adding columns stops before compartments go under 4 mm (smallest ${minW.toFixed(1)} mm)`);
  const added = (await T()).leaves.length - 5;
  ok(added > 0 && added < 12, `${added} columns were added before the 4 mm limit stopped it`);
  for (let k = 0; k < added; k++) await page.click('#undo');
  await page.waitForTimeout(200);
  s = await T(); ok(s.leaves.length === 5, `undo back to 5 compartments (${s.leaves.length})`);
  await page.keyboard.press('Escape');

  // 3) drag a divider in the 2D editor
  const before = (await T()).leaves.find(l => l[0] === '0')[1];
  const div = await page.$('#laySvg rect.div-hit.y');
  const bb = await div.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 + 25, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(200);
  const after = (await T()).leaves.find(l => l[0] === '0')[1];
  ok(after[3] < before[3] - 5, `dragging divider resizes front compartment (depth ${(before[3] - before[2]).toFixed(1)} -> ${(after[3] - after[2]).toFixed(1)} mm)`);
  await page.screenshot({ path: 'u3-layout-drag.png' });

  // 4) shift-select two leaves and merge
  await page.click('#laySvg rect.leaf[data-p="1.1.0"]'); await page.click('#laySvg rect.leaf[data-p="1.1.1"]', { modifiers: ['Shift'] });
  s = await T(); ok(s.sel.length === 2, 'shift-click selects 2 compartments');
  await page.click('#mergeBtn'); await page.waitForTimeout(200);
  s = await T(); ok(s.leaves.length === 4, `merge -> 4 compartments (got ${s.leaves.length})`);
  await page.click('#undo'); await page.waitForTimeout(200);
  s = await T(); ok(s.leaves.length === 5, 'undo restores the split');

  // 5) lids
  await page.click('[data-lid="inset"]'); await page.waitForTimeout(150);
  await page.click('[data-tab="preview"]'); await page.check('#optCut'); await page.waitForTimeout(250);
  await page.screenshot({ path: 'u4-lid-inset.png' });
  let L = await page.evaluate(() => ({ style: window.__tray.lid.style, warns: [...document.querySelectorAll('.warn')].map(w => w.textContent) }));
  ok(L.style === 'inset', `inset lid generated (${JSON.stringify(L)})`);
  await page.click('[data-lid="cap"]'); await page.waitForTimeout(250);
  await page.screenshot({ path: 'u5-lid-cap.png' });
  ok(await page.evaluate(() => document.querySelector('[data-lid="stack"]').disabled), 'stacking lid disabled when tray is not stackable');
  await page.click('#stackbtn'); await page.click('[data-lid="stack"]'); await page.waitForTimeout(150);
  await page.check('#optStack'); await page.waitForTimeout(250);
  await page.screenshot({ path: 'u6-lid-stack.png' });
  await page.uncheck('#optLid'); await page.uncheck('#optCut'); await page.waitForTimeout(250);
  await page.screenshot({ path: 'u7-lid-beside.png' });

  // v3-a) long-press on Width arrow keeps increasing
  await page.click('[data-tab="size"]'); await page.waitForTimeout(150);
  const W0 = await page.evaluate(() => window.__tray.state.W);
  const chev = await page.$('#pW .chev[data-d="1"]'); const cb = await chev.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.down(); await page.waitForTimeout(1900); await page.mouse.up();
  const W1 = await page.evaluate(() => window.__tray.state.W);
  ok(W1 - W0 >= 15, `long-press on Width › keeps increasing (${W0} -> ${W1} mm in 1.9 s)`);
  const nUndo = await page.evaluate(() => document.querySelector('#undo').disabled === false);
  await page.click('#undo'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => window.__tray.state.W) === W0, 'one undo reverts the whole long-press');
  // single click = exactly 1 mm
  await page.click('#pD .chev[data-d="-1"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => window.__tray.state.D) === 159, 'single click changes Depth by exactly 1 mm');
  await page.click('#pH input'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => window.__tray.state.H) === 22, 'arrow keys in the Height box step it (20 -> 22)');
  await page.click('#undo'); await page.click('#undo'); await page.waitForTimeout(100);

  // v4) resize the selected compartment from the Size tab
  {
    await page.click('[data-tab="size"]'); await page.waitForTimeout(150);
    const pick = async path => { const s = await page.evaluate(p => { const q = window.__tray.mesh.params, L = q.leaves.find(l => l.path === p); return window.__tray.screenOf([(L.r[0] + L.r[1]) / 2, (L.r[2] + L.r[3]) / 2, q.t]); }, path); await page.mouse.click(s[0], s[1]); await page.waitForTimeout(150); };
    const leaf = p => page.evaluate(p => { const L = window.__tray.mesh.params.leaves.find(l => l.path === p); return L && [L.r[1] - L.r[0], L.r[3] - L.r[2]]; }, p);
    await pick('1.2');
    ok(await page.isVisible('#pCW') && await page.isVisible('#pCD'), 'Size tab: clicking a compartment shows Compartment W / D pills');
    const W0 = await page.evaluate(() => window.__tray.state.W), a0 = await leaf('1.2'), n0 = await leaf('1.0');
    await page.fill('#pCW input', '35'); await page.press('#pCW input', 'Enter'); await page.waitForTimeout(150);
    const a1 = await leaf('1.2'), n1 = await leaf('1.0');
    ok(Math.abs(a1[0] - 35) < 0.01 && await page.evaluate(() => window.__tray.state.W) === W0, `typed 35 → compartment width ${a0[0].toFixed(1)} → ${a1[0].toFixed(2)} mm, tray width unchanged (${W0})`);
    ok(n1[0] < n0[0], `neighbour gave up the space (${n0[0].toFixed(1)} → ${n1[0].toFixed(1)} mm)`);
    const ch = await page.$('#pCW .chev[data-d="1"]'), bb = await ch.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(1300); await page.mouse.up(); await page.waitForTimeout(100);
    const a2 = await leaf('1.2');
    ok(a2[0] - a1[0] >= 8, `long-press on Compartment W › keeps growing (${a1[0].toFixed(1)} → ${a2[0].toFixed(1)} mm)`);
    await page.click('#undo'); await page.waitForTimeout(150);
    ok(Math.abs((await leaf('1.2'))[0] - 35) < 0.01, 'one undo reverts the long-press');
    // min size clamp
    await page.fill('#pCW input', '1'); await page.press('#pCW input', 'Enter'); await page.waitForTimeout(150);
    ok((await leaf('1.2'))[0] >= 3.99, `cannot go below 4 mm (got ${(await leaf('1.2'))[0].toFixed(2)})`);
    await page.click('#undo'); await page.waitForTimeout(150);
    // depth of the front compartment (its depth is set by the root y-split)
    await pick('0');
    const d0 = await leaf('0'), D0 = await page.evaluate(() => window.__tray.state.D);
    await page.fill('#pCD input', String(Math.round(d0[1] + 10))); await page.press('#pCD input', 'Enter'); await page.waitForTimeout(150);
    ok(Math.abs((await leaf('0'))[1] - Math.round(d0[1] + 10)) < 0.01 && await page.evaluate(() => window.__tray.state.D) === D0, 'Compartment D resizes the front compartment, tray depth unchanged');
    // full-width compartment: width change resizes the tray
    const w0 = (await leaf('0'))[0];
    await page.fill('#pCW input', String(Math.round(w0 + 6))); await page.press('#pCW input', 'Enter'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => window.__tray.state.W) === W0 + Math.round(w0 + 6) - w0 || Math.abs(await page.evaluate(() => window.__tray.state.W) - (W0 + Math.round(w0 + 6) - w0)) < 0.01, 'full-width compartment: width change grows the tray');
    await page.screenshot({ path: 'v4-size-comp.png' });
    await page.click('#undo'); await page.click('#undo'); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    ok(!(await page.isVisible('#pCW')), 'Esc deselects and hides the compartment pills');
  }

  // v5) print time estimate
  {
    const pt = () => page.evaluate(() => document.querySelector('#ptime').textContent);
    const mins = txt => { const h = /(\d+) h/.exec(txt), m = /(\d+) min/.exec(txt); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); };
    await page.selectOption('#printer', 'standard'); await page.selectOption('#layerH', '0.2'); await page.waitForTimeout(100);
    const tStd = mins(await pt());
    ok(tStd > 0 && /print time/.test(await pt()), `print time shown: "${(await pt()).trim()}"`);
    await page.selectOption('#printer', 'fast'); await page.waitForTimeout(100); const tFast = mins(await pt());
    await page.selectOption('#printer', 'classic'); await page.waitForTimeout(100); const tSlow = mins(await pt());
    ok(tFast < tStd && tStd < tSlow, `printer presets order: fast ${tFast} < standard ${tStd} < classic ${tSlow} min`);
    await page.selectOption('#printer', 'standard'); await page.selectOption('#layerH', '0.28'); await page.waitForTimeout(100);
    const t28 = mins(await pt());
    ok(t28 < tStd, `thicker layers print faster (0.2 mm: ${tStd} min, 0.28 mm: ${t28} min)`);
    await page.selectOption('#layerH', '0.2'); await page.waitForTimeout(100);
    // calibration: tell it the slicer says 60 min
    await page.click('[data-cal="open"]'); await page.fill('#calMin', '60'); await page.click('[data-cal="apply"]'); await page.waitForTimeout(150);
    const tCal = mins(await pt());
    const lidOn = await page.evaluate(() => !!window.__tray.lid);
    ok(lidOn ? tCal > 60 : Math.abs(tCal - 60) <= 1, `calibrate to slicer = 60 min -> shows ${tCal} min${lidOn ? ' (tray + lid)' : ''}, factor kept`);
    await page.click('[data-cal="reset"]'); await page.waitForTimeout(100);
    ok(Math.abs(mins(await pt()) - tStd) <= 1, 'reset calibration restores the default estimate');
    // bigger tray -> longer
    await page.click('[data-tab="size"]'); await page.fill('#pH input', '40'); await page.press('#pH input', 'Enter'); await page.waitForTimeout(250);
    ok(mins(await pt()) > tStd, `taller tray takes longer (${tStd} -> ${mins(await pt())} min)`);
    await page.click('#undo'); await page.waitForTimeout(150);
    await page.screenshot({ path: 'v5-estimate.png' });
  }

  // v3-b) grid-tab floating bar
  await page.click('[data-tab="grid"]'); await page.waitForTimeout(150);
  ok(await page.isVisible('#gridBar'), 'Grid tab shows the floating split bar');
  const L0 = (await T()).leaves.length;
  const front = await page.evaluate(() => { const q = window.__tray.mesh.params, L = q.leaves.find(l => l.path === '0'); return window.__tray.screenOf([(L.r[0] + L.r[1]) / 2, (L.r[2] + L.r[3]) / 2, q.t]); });
  await page.mouse.click(front[0], front[1]); await page.waitForTimeout(100);
  await page.click('#gridBar .stepper[data-g="sr"] button:first-of-type'); await page.waitForTimeout(150); // rows already 1 -> no change
  ok((await T()).leaves.length === L0, 'Rows − on a 1-row compartment does nothing');
  await page.click('#gridBar .stepper[data-g="sc"] button:last-of-type'); await page.waitForTimeout(200); // cols 1 -> 2
  ok((await T()).leaves.length === L0 + 1, `floating bar Cols + splits only the selected compartment (${L0} -> ${(await T()).leaves.length})`);
  await page.screenshot({ path: 'v3-gridbar.png' });

  // v3-c) wall pattern
  await page.click('[data-tab="size"]');
  await page.click('[data-pat="hex"]'); await page.waitForTimeout(400);
  const pi = await page.evaluate(() => ({ holes: window.__tray.mesh.patternInfo && window.__tray.mesh.patternInfo.holes, info: document.querySelector('#patInfo').textContent, stats: document.querySelector('#stats').textContent }));
  ok(pi.holes > 0 && /saves/.test(pi.info), `hex pattern: ${pi.info}`);
  await page.screenshot({ path: 'v3-hex.png' });
  for (const t of ['circle', 'diamond', 'slots']) { await page.click(`[data-pat="${t}"]`); await page.waitForTimeout(350); await page.screenshot({ path: `v3-${t}.png`, clip: { x: 272, y: 0, width: 1128, height: 860 } }); }
  await page.click('[data-pat="hex"]'); await page.waitForTimeout(300);
  // density slider changes hole count
  const h1 = await page.evaluate(() => window.__tray.mesh.patternInfo.holes);
  await page.evaluate(() => { const r = document.querySelector('.field[data-f="ps"] input[type=range]'); r.value = 10; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(400);
  const h2 = await page.evaluate(() => window.__tray.mesh.patternInfo.holes);
  ok(h2 < h1, `bigger hole size -> fewer holes (${h1} -> ${h2})`);
  // v8) pattern on the inner walls too
  await page.evaluate(() => { const r = document.querySelector('.field[data-f="ps"] input[type=range]'); r.value = 4; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(400);
  const hOut = await page.evaluate(() => window.__tray.mesh.patternInfo.holes);
  await page.check('#patInner'); await page.waitForTimeout(500);
  const pin = await page.evaluate(() => ({ holes: window.__tray.mesh.patternInfo.holes, inner: window.__tray.mesh.patternInfo.innerHoles, info: document.querySelector('#patInfo').textContent }));
  ok(pin.inner > 0 && pin.holes === hOut + pin.inner && /inner walls/.test(pin.info), `"Inner walls too" adds ${pin.inner} holes through the partitions: ${pin.info}`);
  await page.screenshot({ path: 'v8-inner.png' });

  // 6) downloads
  await page.click('[data-lid="cap"]'); await page.waitForTimeout(150);
  const holesNow = await page.evaluate(() => window.__tray.mesh.patternInfo ? window.__tray.mesh.patternInfo.holes : 0);
  for (const fmt of ['stl', '3mf']) for (const kind of ['tray', 'lid', 'both']) {
    await page.click('#download'); await page.click(`[data-fmt="${fmt}"]`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-dl="${kind}"]`)]);
    const path = 'dl-' + dl.suggestedFilename(); await dl.saveAs(path);
    if (fmt === 'stl') {
      const c = stlCheck(path);
      const expectEuler = (kind === 'lid' ? 2 : 2 - 2 * holesNow) + (kind === 'both' ? 2 : 0);
      ok(c.bad === 0 && c.euler === expectEuler && c.vol > 0, `STL ${kind}: ${dl.suggestedFilename()} – ${c.n} tris, bad edges ${c.bad}, euler ${c.euler} (expected ${expectEuler}), ${c.vol.toFixed(2)} cm3`);
    } else {
      const out = require('child_process').execFileSync('python3', [__dirname + '/check3mf.py', path, String(holesNow), kind]).toString().trim();
      ok(out.startsWith('OK'), `3MF ${kind}: ${dl.suggestedFilename()} – ${out}`);
    }
  }
  // 7) dark + mobile
  await page.emulateMedia({ colorScheme: 'dark' }); await page.click('[data-tab="grid"]'); await page.evaluate(() => window.__tray.select(['0'])); await page.waitForTimeout(250);
  await page.screenshot({ path: 'u8-dark-grid.png' });
  await page.setViewportSize({ width: 390, height: 820 }); await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(300); await page.dblclick('#view'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'u9-mobile.png' });
  await page.click('[data-tab="grid"]'); await page.waitForTimeout(250); await page.screenshot({ path: 'v3-mobile-grid.png' });
  ok(errors.length === 0, 'no console errors / no network requests' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(checks.join('\n'));
  console.log(checks.every(c => c.startsWith('PASS')) ? '\nALL UI TESTS PASSED' : '\nSOME UI TESTS FAILED');
  await browser.close();
})();
