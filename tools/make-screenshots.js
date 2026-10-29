#!/usr/bin/env node
/*
 * Скриншоты для манифеста (screenshots/) — только на демо-данных (вымышленные тренировки из seed).
 *   python3 -m http.server 8765 &   (из корня репозитория)
 *   CHROME=/usr/bin/google-chrome NODE_PATH=<каталог с puppeteer-core> node tools/make-screenshots.js [http://localhost:8765/]
 */
'use strict';
const path = require('path');
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = path.join(__dirname, '..', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=ru-RU'] });
  async function open(w, h, dpr) {
    const ctx = await browser.createBrowserContext(); // чистый профиль: никаких чужих данных
    const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await p.goto(BASE + '?nosw#/today', { waitUntil: 'load' });
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('workout-diary:install-hint-dismissed', '1'); });
    await p.reload({ waitUntil: 'load' }); await sleep(300);
    await p.evaluate(() => WD.views.loadDemo()); await sleep(3200); // ждём, пока уйдёт уведомление
    return { p, ctx };
  }
  { // узкий экран: 390×844 при DPR 2 → 780×1688
    const { p, ctx } = await open(390, 844, 2);
    await p.evaluate(() => { location.hash = '#/today'; }); await sleep(900);
    await p.screenshot({ path: path.join(OUT, 'today-narrow.png') });
    await p.evaluate(() => document.querySelector('#start-btn').click()); await sleep(600);
    await p.waitForSelector('.set .check');
    for (const i of [0, 1]) { await p.evaluate((i) => document.querySelectorAll('.set .check')[i].click(), i); await sleep(300); }
    await sleep(1500);
    await p.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
    await p.screenshot({ path: path.join(OUT, 'session-narrow.png') });
    await ctx.close();
  }
  { // широкий экран 1366×768
    const { p, ctx } = await open(1366, 768, 1);
    await p.evaluate(() => { location.hash = '#/progress'; }); await sleep(1300);
    await p.screenshot({ path: path.join(OUT, 'progress-wide.png') });
    await ctx.close();
  }
  await browser.close();
  console.log('screenshots/: today-narrow.png, session-narrow.png, progress-wide.png');
})().catch((e) => { console.error(e); process.exit(1); });
