#!/usr/bin/env node
/*
 * Генерация PNG-иконок из SVG-логотипа (локально, без внешних сервисов).
 * Нужен Chrome/Chromium и puppeteer-core:
 *   CHROME=/usr/bin/google-chrome NODE_PATH=<каталог с puppeteer-core> node tools/make-icons.js
 * icons/icon.svg      — обычная иконка (скруглённый квадрат, purpose "any"), favicon
 * icons/maskable.svg  — на всю площадь, гантель внутри безопасного круга 80 % (purpose "maskable")
 * apple-touch-icon    — на всю площадь (iOS сам скругляет углы), гантель чуть крупнее
 */
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const dir = path.join(__dirname, '..', 'icons');

const apple = () => fs.readFileSync(path.join(dir, 'maskable.svg'), 'utf8').replace('scale(.75)', 'scale(.86)').replace('stroke-width="28"', 'stroke-width="30"');
const JOBS = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'favicon-32.png', 32],
  ['maskable.svg', 'maskable-192.png', 192],
  ['maskable.svg', 'maskable-512.png', 512],
  [apple, 'apple-touch-icon-180.png', 180],
  // иконки ярлыков (shortcuts) — пути из набора иконок приложения (js/dom.js), viewBox 24
  [shortcut('M7 4v16l13-8z', true), 'shortcut-start.png', 96],
  [shortcut('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'), 'shortcut-journal.png', 96],
  [shortcut('M3 3v18h18M7 15l4-4 3 3 5-6'), 'shortcut-progress.png', 96]
];
function shortcut(d, filled) {
  return () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#6366f1"/><stop offset=".55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs>' +
    '<rect width="96" height="96" rx="22" fill="url(#g)"/><g transform="translate(24 24) scale(2)" fill="' + (filled ? '#fff' : 'none') +
    '" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></g></svg>';
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const [src, out, size] of JOBS) {
    const svg = typeof src === 'function' ? src() : fs.readFileSync(path.join(dir, src), 'utf8');
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent('<html><body style="margin:0;background:transparent">' + svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ') + '</body></html>');
    await page.screenshot({ path: path.join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('icons/' + out, size + 'x' + size);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
