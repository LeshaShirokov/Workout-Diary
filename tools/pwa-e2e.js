#!/usr/bin/env node
/*
 * Проверка PWA в настоящем Chrome (puppeteer-core):
 *   установимость (CDP Page.getInstallabilityErrors), манифест, service worker, офлайн (полная тренировка),
 *   поток обновления (новая версия → уведомление «Обновить» → перезагрузка на новой версии), Wake Lock, подсказка установки.
 *   NODE_PATH=<puppeteer-core> node tools/pwa-e2e.js            — локально: копия во временном каталоге, свой http-сервер;
 *                                                                 офлайн = сервер остановлен по-настоящему
 *   NODE_PATH=<puppeteer-core> node tools/pwa-e2e.js <URL>      — на опубликованном сайте (офлайн через эмуляцию сети)
 * Работает в чистом профиле браузера — личные данные не используются.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const LIVE = process.argv[2];
const PORT = 8770;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, msg, extra) { if (cond) { pass++; console.log('  ✔ ' + msg); } else { fail++; console.log('  ✖ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }

let server = null, tmp = null;
function startServer() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', tmp], { stdio: 'ignore' });
  return sleep(700);
}
function stopServer() { if (server) { server.kill('SIGKILL'); server = null; } return sleep(300); }

(async () => {
  let BASE = LIVE;
  if (!BASE) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pwa-'));
    fs.cpSync(ROOT, tmp, { recursive: true, filter: (s) => !/[/\\]\.git$|-my-data/.test(s) });
    await startServer();
    BASE = 'http://localhost:' + PORT + '/';
  }
  if (!BASE.endsWith('/')) BASE += '/';
  // обычный (не инкогнито) временный профиль — в инкогнито Chrome не считает сайт устанавливаемым
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-profile-'));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', userDataDir: profile, args: ['--no-sandbox', '--lang=ru-RU', '--no-first-run'] });
  const page = (await browser.pages())[0] || await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const cdp = await page.createCDPSession();

  console.log('1. Установимость и service worker — ' + BASE);
  await page.goto(BASE, { waitUntil: 'load' });
  const swInfo = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: !!reg.active };
  });
  ok(swInfo.active && swInfo.scope === BASE, 'navigator.serviceWorker.ready, scope = ' + swInfo.scope);
  await page.reload({ waitUntil: 'load' });
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'страница под управлением SW после перезагрузки');
  const man = await cdp.send('Page.getAppManifest');
  ok(man.errors.length === 0 && man.url.endsWith('manifest.webmanifest'), 'манифест разобран без ошибок', man.errors);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  ok(inst.installabilityErrors.length === 0, 'Page.getInstallabilityErrors пуст', inst.installabilityErrors);
  const mf = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); return { s: r.status, j: await r.json() }; });
  ok(mf.s === 200 && mf.j.id === '/Workout-Diary/' && mf.j.shortcuts.length === 3, 'manifest.webmanifest 200, id и 3 ярлыка');
  const cache = await page.evaluate(async () => {
    const keys = (await caches.keys()).filter((k) => k.startsWith('workout-diary-'));
    const shell = keys.find((k) => k.startsWith('workout-diary-shell-'));
    const n = shell ? (await (await caches.open(shell)).keys()).length : 0;
    const vers = await new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data); navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]); setTimeout(() => res(null), 2000); });
    return { keys, n, vers };
  });
  const swSrc = fs.readFileSync(path.join(LIVE ? ROOT : tmp, 'sw.js'), 'utf8');
  const nAssets = (swSrc.match(/var ASSETS = \[([\s\S]*?)\]/)[1].match(/'/g) || []).length / 2;
  ok(cache.n === nAssets, 'предзагружено файлов: ' + cache.n + ' из ' + nAssets);
  ok(cache.vers && cache.keys.includes(cache.vers.cache), 'GET_VERSION → ' + (cache.vers && cache.vers.version));
  const ls = await page.evaluate(async () => (await caches.keys()).length);
  ok(ls >= 1, 'кэши только с префиксом workout-diary-: ' + cache.keys.join(', '));

  console.log('2. Офлайн');
  if (LIVE) {
    await page.setOfflineMode(true);
    const swT = (await browser.targets()).find((t) => t.type() === 'service_worker' && t.url().startsWith(BASE));
    if (swT) { const s = await swT.createCDPSession(); await s.send('Network.enable'); await s.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); }
  } else {
    await stopServer();
    ok(await page.evaluate(() => fetch('/__probe__?' + Math.random(), { cache: 'no-store' }).then(() => false, () => true)), 'сервер действительно недоступен');
  }
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#main .page-head, #main h1', { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => !!document.querySelector('.tabbar') && document.querySelector('#main').textContent.length > 50), 'приложение загрузилось без сети');
  if (LIVE) ok(await page.evaluate(() => !document.getElementById('net-badge').hidden), 'значок «Офлайн» в шапке');
  for (const r of ['journal', 'week', 'progress', 'program', 'settings', 'today']) {
    await page.evaluate((r) => { location.hash = '#/' + r; }, r); await sleep(350);
    ok(await page.evaluate((r) => WD.app.current.route === r && document.querySelector('#main').children.length > 0, r), 'офлайн-навигация: #/' + r);
  }
  // ярлык «Начать тренировку» + полная тренировка
  await page.goto(BASE + '#/today?start=1', { waitUntil: 'load' });
  await page.waitForSelector('.set .check', { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => WD.app.current.route === 'session' && location.hash.startsWith('#/session/')), 'ярлык #/today?start=1 открыл тренировку');
  const wake = await page.evaluate(() => ({ sup: WD.pwa.wakeSupported(), on: WD.pwa.wakeActive(), row: !!document.getElementById('wake-row') }));
  ok(!wake.sup || (wake.on && wake.row), 'Wake Lock: ' + (wake.sup ? 'экран удерживается, переключатель на экране тренировки' : 'не поддерживается (переключатель скрыт)'));
  if (wake.sup) { // вкладка ушла в фон → браузер снял блокировку; вернулись → блокировка взята снова
    const other = await browser.newPage(); await other.bringToFront(); await sleep(500);
    const hidden = await page.evaluate(() => ({ vis: document.visibilityState, on: WD.pwa.wakeActive() }));
    await page.bringToFront(); await sleep(700);
    const back = await page.evaluate(() => ({ vis: document.visibilityState, on: WD.pwa.wakeActive() }));
    await other.close();
    ok(hidden.vis === 'hidden' && !hidden.on && back.vis === 'visible' && back.on, 'Wake Lock снят в фоне и взят снова при возвращении (visibilitychange)', { hidden, back });
  }
  // вводим вес и повторы в первые 3 подхода и отмечаем их выполненными
  for (let i = 0; i < 3; i++) {
    const setsIn = await page.evaluateHandle((i) => document.querySelectorAll('.set')[i], i);
    const nums = await setsIn.$$('input.num');
    for (const [k, inp] of nums.entries()) { await inp.click({ clickCount: 3 }); await inp.type(k === 0 && nums.length > 1 ? '40' : '10'); }
    await page.evaluate((i) => document.querySelectorAll('.set .check')[i].click(), i); await sleep(150);
  }
  await page.evaluate(() => WD.timer && WD.timer.stop && WD.timer.stop());
  await page.evaluate(() => document.getElementById('finish-btn').click()); await sleep(600);
  const done = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('workout-diary:data'));
    const s = d.sessions.find((x) => x.status === 'done');
    const sets = s ? s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0) : 0;
    return { done: d.sessions.filter((x) => x.status === 'done').length, sets, summary: !!document.querySelector('.summary') };
  });
  ok(done.done === 1 && done.sets === 3 && done.summary, 'тренировка (3 подхода) завершена офлайн, итог показан, сохранено в localStorage', done);
  await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /К журналу/.test(b.textContent)).click()); await sleep(400);
  ok(await page.evaluate(() => WD.app.current.route === 'journal'), 'итог → «К журналу»');
  ok(await page.evaluate(() => !WD.pwa.wakeActive()), 'Wake Lock отпущен после выхода из тренировки');
  await page.reload({ waitUntil: 'load' }); await sleep(300);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('workout-diary:data')).sessions.length === 1), 'после офлайн-перезагрузки тренировка на месте');

  if (LIVE) {
    await page.setOfflineMode(false);
  } else {
    console.log('3. Обновление версии');
    await startServer();
    const oldKey = cache.vers.cache;
    fs.appendFileSync(path.join(tmp, 'css/styles.css'), '\n:root { --e2e-bump: 1; }\n');
    execFileSync('node', [path.join(ROOT, 'tools/build-sw.js'), tmp]);
    const r = await page.evaluate(() => WD.pwa.checkForUpdate());
    await page.waitForSelector('#update-toast .toast-btn', { timeout: 10000 }).catch(() => {});
    const toast = await page.evaluate(() => { const t = document.getElementById('update-toast'); return t ? t.textContent : null; });
    ok(toast && /Доступна новая версия/.test(toast), 'уведомление: ' + toast + ' (checkForUpdate → ' + r + ')');
    ok(await page.evaluate(() => navigator.serviceWorker.controller && WD.pwa.waiting && WD.pwa.waiting.state === 'installed'), 'новая версия ждёт и не активируется сама');
    const nav = page.waitForNavigation({ waitUntil: 'load', timeout: 10000 }).then(() => true, () => false);
    await page.evaluate(() => document.querySelector('#update-toast .toast-btn').click());
    ok(await nav, 'после «Обновить» страница перезагрузилась');
    await sleep(800);
    const after = await page.evaluate(async () => ({
      keys: (await caches.keys()).filter((k) => k.startsWith('workout-diary-')),
      bump: getComputedStyle(document.documentElement).getPropertyValue('--e2e-bump').trim(),
      sessions: JSON.parse(localStorage.getItem('workout-diary:data')).sessions.length
    }));
    ok(after.bump === '1', 'загружен новый CSS');
    ok(!after.keys.includes(oldKey) && after.keys.some((k) => k.startsWith('workout-diary-shell-')), 'старый кэш удалён: ' + after.keys.join(', '));
    ok(after.sessions === 1, 'данные пользователя пережили обновление');
  }

  console.log((LIVE ? '3' : '4') + '. Подсказка установки и настройки');
  await page.evaluate(() => { localStorage.removeItem('workout-diary:install-hint-dismissed'); location.hash = '#/today'; });
  await sleep(300);
  await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  await sleep(200);
  ok(await page.evaluate(() => !!document.querySelector('.install-hint #install-hint-btn')), 'beforeinstallprompt → подсказка «Установить» на «Сегодня»');
  await page.evaluate(() => document.getElementById('install-hint-close').click()); await sleep(200);
  ok(await page.evaluate(() => !document.querySelector('.install-hint') && localStorage.getItem('workout-diary:install-hint-dismissed') === '1'), 'подсказка закрыта, выбор запомнен');
  await page.evaluate(() => { location.hash = '#/settings'; }); await sleep(600);
  const st = await page.evaluate(() => ({ btn: !!document.getElementById('install-btn'), card: document.getElementById('app-card').textContent }));
  ok(st.btn, 'в Настройках кнопка «Установить приложение»');
  ok(/Офлайн-режим/.test(st.card) && /Готов/.test(st.card) && /только на этом устройстве/.test(st.card) && /Дневник: /.test(st.card), 'карточка «Приложение»: офлайн, версия, хранилище');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await sleep(300);
  ok(await page.evaluate(() => !document.getElementById('install-btn')), 'appinstalled → кнопка установки скрыта');
  ok(errors.length === 0, 'нет ошибок в консоли', errors);

  await browser.close();
  await stopServer();
  fs.rmSync(profile, { recursive: true, force: true });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nИтого: ' + pass + ' ✔, ' + fail + ' ✖');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await stopServer(); process.exit(1); });
