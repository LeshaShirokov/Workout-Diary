const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WD = require('./_load');
const B = require('../tools/build-sw');

const ROOT = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/var ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.slice(0, 8).toString('hex'), '89504e470d0a1a0a', file + ' — не PNG');
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}

test('sw.js собран из актуальных файлов (node tools/build-sw.js --check)', () => {
  const r = B.build(ROOT, true);
  assert.equal(r.stale, false, 'запустите node tools/build-sw.js');
  assert.match(sw, new RegExp("var VERSION = '" + r.version + "'"));
});

test('предзагрузка содержит все локальные файлы index.html и иконки манифеста', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 20);
  for (const r of refs) assert.ok(assets.includes(r), 'нет в ASSETS: ' + r);
  for (const i of manifest.icons) assert.ok(assets.includes(i.src), 'иконка не в ASSETS: ' + i.src);
  for (const s of manifest.shortcuts) for (const i of s.icons) assert.ok(assets.includes(i.src));
  assert.ok(assets.includes('./') && assets.includes('manifest.webmanifest'));
  for (const a of assets) if (a !== './') assert.ok(fs.existsSync(path.join(ROOT, a)), 'нет файла ' + a);
  assert.ok(!assets.some((a) => /-my-data|screenshots\/|tests\/|tools\/|README|sw\.js/.test(a)));
});

test('версия меняется при изменении любого файла оболочки', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sw-'));
  fs.cpSync(ROOT, tmp, { recursive: true, filter: (s) => !/\.git$|node_modules/.test(s) });
  const v1 = B.build(tmp, true).version;
  fs.appendFileSync(path.join(tmp, 'css/styles.css'), '\n/* bump */\n');
  const r = B.build(tmp, false);
  assert.notEqual(r.version, v1);
  assert.equal(B.build(tmp, true).stale, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('манифест: обязательные поля, иконки реальных размеров, ярлыки и скриншоты', () => {
  for (const k of ['id', 'name', 'short_name', 'description', 'start_url', 'scope', 'display', 'theme_color', 'background_color']) assert.ok(manifest[k], k);
  assert.equal(manifest.lang, 'ru');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.display_override, ['standalone', 'minimal-ui']);
  assert.deepEqual(manifest.categories, ['health', 'fitness', 'lifestyle']);
  const need = { 'any 192x192': 0, 'any 512x512': 0, 'maskable 192x192': 0, 'maskable 512x512': 0 };
  for (const i of manifest.icons) {
    if (i.type !== 'image/png') continue;
    assert.equal(pngSize(i.src), i.sizes, i.src);
    need[i.purpose + ' ' + i.sizes] = 1;
  }
  assert.deepEqual(Object.values(need), [1, 1, 1, 1]);
  assert.equal(pngSize('icons/apple-touch-icon-180.png'), '180x180');
  assert.equal(pngSize('icons/favicon-32.png'), '32x32');
  assert.deepEqual(manifest.shortcuts.map((s) => s.url), ['./#/today?start=1', './#/journal', './#/progress']);
  for (const s of manifest.shortcuts) for (const i of s.icons) assert.equal(pngSize(i.src), i.sizes);
  const forms = new Set();
  for (const s of manifest.screenshots) { assert.equal(pngSize(s.src), s.sizes, s.src); forms.add(s.form_factor); }
  assert.deepEqual([...forms].sort(), ['narrow', 'wide']);
});

test('настройка wakeLock: по умолчанию включена, приводится к boolean', () => {
  const S = WD.storage;
  assert.equal(S.defaultSettings().wakeLock, true);
  assert.equal(S.sanitizeSettings({}).wakeLock, true);
  assert.equal(S.sanitizeSettings({ wakeLock: false }).wakeLock, false);
  assert.equal(S.sanitizeSettings({ wakeLock: 'yes' }).wakeLock, false);
  assert.equal(S.sanitizeSettings({ wakeLock: true }).wakeLock, true);
});
