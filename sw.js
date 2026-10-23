// เก็บตัวหน้าจอแอปไว้ในเครื่อง (ไม่เก็บข้อมูลคนไข้ ข้อมูลมาจาก Google Sheets โดยตรง)
// ออนไลน์: โหลดจากเครือข่ายก่อนแล้วอัปเดตแคช (ได้เวอร์ชันล่าสุดเสมอ) ออฟไลน์: ใช้ของในแคช
var CACHE = 'wn-shell-v2';
var SHELL = ['./', 'index.html', 'core.js', 'auth.js', 'api.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // Google API/ฟอนต์ ไม่ผ่านแคช
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () {
    return caches.match(req).then(function (r) { return r || caches.match('./'); });
  }));
});
