#!/usr/bin/env node
/*
 * Собирает список файлов оболочки приложения и версию кэша для sw.js.
 *   node tools/build-sw.js          — переписать блок между // <build:assets> и // </build:assets>
 *   node tools/build-sw.js --check  — только проверить (код 1, если sw.js устарел)
 *   node tools/build-sw.js [--check] <каталог>  — для другого корня (используется в тестах)
 * VERSION = первые 10 символов sha256 от путей и содержимого всех файлов оболочки,
 * поэтому любое изменение HTML/CSS/JS/иконок/манифеста меняет версию автоматически.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START = '// <build:assets>';
const END = '// </build:assets>';

function walk(root, rel, filter, out) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs).sort()) {
    const r = rel ? rel + '/' + name : name;
    const st = fs.statSync(path.join(root, r));
    if (st.isDirectory()) walk(root, r, filter, out);
    else if (filter(r)) out.push(r);
  }
  return out;
}

/** Все файлы, которые нужны приложению без сети (относительно корня). */
function collect(root) {
  const files = ['index.html', 'manifest.webmanifest'];
  walk(root, 'css', (f) => f.endsWith('.css'), files);
  walk(root, 'js', (f) => f.endsWith('.js'), files);
  walk(root, 'icons', (f) => /\.(png|svg|ico|webp)$/.test(f), files);
  return files.filter((f) => fs.existsSync(path.join(root, f)) && !/-my-data/.test(f));
}

function version(root, files) {
  const hash = crypto.createHash('sha256');
  for (const f of files) { hash.update(f + '\0'); hash.update(fs.readFileSync(path.join(root, f))); hash.update('\0'); }
  return hash.digest('hex').slice(0, 10);
}

function block(root) {
  const files = collect(root);
  const v = version(root, files);
  const list = ['./'].concat(files).map((f) => "  '" + f + "'").join(',\n');
  return { version: v, files, text: START + ' — сгенерировано tools/build-sw.js, не редактируйте вручную\nvar VERSION = \'' + v + '\';\nvar ASSETS = [\n' + list + '\n];\n' + END };
}

function build(root, check) {
  const swPath = path.join(root, 'sw.js');
  const src = fs.readFileSync(swPath, 'utf8');
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error('В sw.js нет маркеров ' + START + ' … ' + END);
  const res = block(root);
  const next = src.slice(0, a) + res.text + src.slice(b + END.length);
  const stale = next !== src;
  if (!check && stale) fs.writeFileSync(swPath, next);
  return { version: res.version, files: res.files, stale };
}

module.exports = { collect, version, build };

if (require.main === module) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const root = path.resolve(args.find((x) => !x.startsWith('--')) || path.join(__dirname, '..'));
  const r = build(root, check);
  if (check) {
    if (r.stale) { console.error('sw.js устарел: запустите node tools/build-sw.js (версия должна быть ' + r.version + ')'); process.exit(1); }
    console.log('sw.js актуален, версия ' + r.version + ', файлов: ' + (r.files.length + 1));
  } else {
    console.log((r.stale ? 'sw.js обновлён' : 'sw.js без изменений') + ': версия ' + r.version + ', файлов: ' + (r.files.length + 1));
  }
}
