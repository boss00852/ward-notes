/* ลงชื่อเข้าใช้ด้วย Google (Google Identity Services, token model) ได้ access token สำหรับเรียก Sheets API
 * token อยู่ในหน่วยความจำ + localStorage (อยู่รอดการปิด/เปิดแอป จนหมดอายุราว 1 ชม.) ไม่มี refresh token ไม่มีเซิร์ฟเวอร์ */
(function (root) {
  'use strict';
  var SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  var KEY = 'wn_tok';

  function AuthError(msg) { var e = new Error(msg || 'ต้องลงชื่อเข้าใช้ Google'); e.code = 'AUTH'; return e; }

  function create(cfg) {
    var tok = null, exp = 0, client = null, pending = null;
    var store = (function () {
      try { root.localStorage.setItem('wn_t', '1'); root.localStorage.removeItem('wn_t'); return root.localStorage; }
      catch (e) { try { return root.sessionStorage; } catch (e2) { return null; } }
    })();
    try {
      var saved = JSON.parse(store.getItem(KEY) || 'null');
      if (saved && saved.exp > Date.now() + 60000) { tok = saved.tok; exp = saved.exp; }
    } catch (e) { /* ignore */ }

    function have() { return !!tok && Date.now() < exp - 60000; }

    function ready() { // รอสคริปต์ Google โหลดเสร็จ
      return new Promise(function (resolve, reject) {
        var n = 0;
        (function poll() {
          if (root.google && root.google.accounts && root.google.accounts.oauth2) return resolve();
          if (++n > 100) return reject(new Error('โหลดระบบลงชื่อเข้าใช้ของ Google ไม่ได้ (ตรวจอินเทอร์เน็ต)'));
          setTimeout(poll, 100);
        })();
      });
    }

    function request(prompt) {
      if (pending) return pending;
      if (!cfg || !cfg.clientId || /^YOUR_/.test(cfg.clientId)) {
        return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Google Client ID ในไฟล์ config.js'));
      }
      pending = ready().then(function () {
        return new Promise(function (resolve, reject) {
          if (!client) {
            client = root.google.accounts.oauth2.initTokenClient({ client_id: cfg.clientId, scope: SCOPE, callback: function () {} });
          }
          client.callback = function (r) {
            if (r.error) return reject(AuthError());
            tok = r.access_token; exp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
            try { store.setItem(KEY, JSON.stringify({ tok: tok, exp: exp })); } catch (e) { /* ignore */ }
            resolve(tok);
          };
          client.error_callback = function () { reject(AuthError()); };
          client.requestAccessToken({ prompt: prompt });
        });
      }).then(function (t) { pending = null; return t; }, function (e) { pending = null; throw e; });
      return pending;
    }

    return {
      have: have,
      token: function () { return have() ? Promise.resolve(tok) : request(''); },
      expire: function () { tok = null; exp = 0; try { store.removeItem(KEY); } catch (e) { /* ignore */ } },
      AuthError: AuthError
    };
  }

  root.WNAuth = { create: create, AuthError: AuthError };
})(typeof self !== 'undefined' ? self : this);
