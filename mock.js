/* Google Sheets API จำลองในหน่วยความจำ (ข้อมูลสมมติทั้งหมด) ใช้ทดสอบ api.js ใน Node และเปิดแอปด้วย ?mock=1 โดยไม่ต้องล็อกอิน
 * รองรับเฉพาะ endpoint ที่แอปใช้ */
(function (root, factory) {
  var m = { create: factory };
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.WNMock = m;
})(typeof self !== 'undefined' ? self : this, function create(opts) {
  'use strict';
  opts = opts || {};
  var BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
  var HEADERS = ['สถานะ', 'หมายเหตุ', 'วันรับ consult', 'วันที่ผ่า', 'ward ที่อยู่', 'HN', 'ชื่อ', 'เพศ', 'อายุ', 'Diagnosis', 'Operation/Management', 'Anes', 'staff'];
  var store = {}, counter = 0, calls = [];
  var SEED_ID = 'MOCKSHEET000000000001';

  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function colName(n) { var s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }
  function fmt(d) { return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }
  function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return fmt(d); }

  function newSheet(id, title, tabs) {
    store[id] = { title: title, tabs: tabs.map(function (t, i) { return { title: t.title, sheetId: 100 + i, rows: t.rows || [] }; }) };
    return store[id];
  }

  // ข้อมูลสมมติ
  newSheet(SEED_ID, 'Rotation ทดสอบ (mock)', [
    { title: 'Main', rows: [HEADERS,
      ['in service', 'ติดตามแผล', daysAgo(5), daysAgo(3), 'ENT ชั้น 11', '100001', 'สมชาย ตัวอย่าง', 'ชาย', '45', 'Mandible fracture', 'ORIF mandible', 'GA', 'ทพ.ตัวอย่าง ก'],
      ['in service', '', daysAgo(2), '', 'Trauma ชั้น 8', '100002', 'สมหญิง ทดสอบ', 'หญิง', '32.5', 'Odontogenic infection', '', '', 'ทพ.ตัวอย่าง ข'],
      ['off service', 'จำหน่ายแล้ว', daysAgo(20), daysAgo(18), 'ENT ชั้น 11', '100003', 'ทดลอง สมมติ', 'ชาย', '60', 'Ameloblastoma', 'Segmental mandibulectomy', 'GA', 'ทพ.ตัวอย่าง ก'],
      ['in service', '', '-', '1/1/1969', 'Ward อื่นๆ', '100004', 'ตัวอย่าง วันเพี้ยน', 'หญิง', '0.8', 'Cleft lip', '', '', ''],
      ['in service', 'ผ่านพรุ่งนี้', daysAgo(1), fmt(new Date(Date.now() + 86400000)), 'Trauma ชั้น 8', '100005', 'ใจดี ทดสอบ', 'ชาย', '28', 'Orthognathic', 'Bimax', 'GA', 'ทพ.ตัวอย่าง ข']] },
    { title: 'Staffs', rows: [['ทพ.ตัวอย่าง ก'], ['ทพ.ตัวอย่าง ข']] },
    { title: 'Wards', rows: [['รายชื่อ wards ทั้งหมด'], ['ENT ชั้น 11'], ['Trauma ชั้น 8'], ['Ward อื่นๆ']] }
  ]);

  // sheet โครงเดิม (ข้อมูลสมมติ): แท็บ "ค้าง ward" + "consult" (คอลัมน์ B ไม่มีหัว) + "Wards"
  var LEGACY_ID = 'MOCKLEGACY00000000001';
  newSheet(LEGACY_ID, 'บันทึกคนไข้ (โครงเดิม mock)', [
    { title: 'ค้าง ward', rows: [
      ['สถานะ', 'หมายเหตุ', 'วันรับ consult', 'วันที่ผ่า', 'ward ที่อยู่', 'HN', 'ชื่อ', 'เพศ', 'อายุ', 'Diagnosis', 'Operation/Management', 'Anes', 'staff'],
      ['in service', 'แผลดี', '10/10/2569', '12/10/2569', 'ENT ชั้น 11', '000111', 'ก ตัวอย่าง', 'ชาย', '45', 'Fx mandible', 'ORIF', 'GA', 'ทพ.ก'],
      ['off service', '', '1/9/2026', '-', 'Trauma ชั้น 8', '000222', 'ข ตัวอย่าง', 'หญิง', '5.0', 'Cyst', '', '', 'ทพ.ข'],
      ['', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['in service', '', '5/10/2569', '1/1/1969', 'Ward เก่า', '000333', 'ค ตัวอย่าง', 'ชาย', '0.8', 'Cleft', '', '', 'ทพ.ก']] },
    { title: 'consult', rows: [
      ['สถานะ', '', 'วันรับ consult', 'ward ที่อยู่', 'HN', 'ชื่อ', 'เพศ', 'อายุ', 'Diagnosis', 'Anes', 'staff'],
      ['in service', 'รอ OR', '20/10/2569', 'ENT ชั้น 11', '000111', 'ก ตัวอย่าง', 'ชาย', '45', 'F/U', '', 'ทพ.ค'],
      ['in service', '', '21/10/2569', 'Trauma ชั้น 8', '000444', 'ง ตัวอย่าง', 'หญิง', '30', 'Abscess', '', '']] },
    { title: 'Wards', rows: [['รายชื่อ wards ทั้งหมด'], ['ENT ชั้น 11'], ['Trauma ชั้น 8'], ['Ward อื่นๆ']] }
  ]);

  // ไฟล์โครง 3 แท็บที่จัดเอง: มีแถวชื่อเรื่อง + หัวที่แก้ชื่อ + คอลัมน์เสริม + แท็บที่ไม่ใช่ตาราง (ข้อมูลสมมติ)
  var IRREGULAR_ID = 'MOCKIRREGULAR0000001';
  newSheet(IRREGULAR_ID, 'ตารางคนไข้ (จัดเอง mock)', [
    { title: 'Main', rows: [
      ['ตารางคนไข้ MU ตุลาคม'],
      [],
      ['สถานะ', 'หมายเหตุ/บันทึกเพิ่มเติม', 'วันรับ / วัน consult', 'วันที่ผ่า', 'ward ที่อยู่', 'เลข HN', 'ชื่อ - สกุล', 'เพศ', 'อายุ (ปี)', 'Diagnosis', 'Operation/Management', 'Anes', 'Staff ผู้ดูแล', 'เบอร์ญาติ'],
      ['in service', 'n1', '1/10/2569', '', 'ICU', '000501', 'จ ตัวอย่าง', 'ชาย', '50', 'dx1', '', '', 'ทพ.ง', '081-000-0000'],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['in service', '', '2/10/2569', '', 'ENT ชั้น 11', '000502', 'ฉ ตัวอย่าง', 'หญิง', '33', 'dx2', 'op2', 'GA', 'ทพ.ก', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', 'โทรกลับ']] },
    { title: 'Notes', rows: [['อะไรก็ได้'], ['ไม่ใช่ตารางคนไข้']] },
    { title: 'Staffs', rows: [['ทพ.ก']] },
    { title: 'Wards', rows: [['รายชื่อ wards ทั้งหมด'], ['ENT ชั้น 11'], ['Ward อื่นๆ']] }
  ]);

  function tabOf(id, title) {
    var s = store[id];
    if (!s) return null;
    return s.tabs.filter(function (t) { return t.title === title; })[0] || null;
  }

  function parseRange(r) {
    var m = /^(.+?)!([A-Z]+)?(\d+)?(?::([A-Z]+)?(\d+)?)?$/.exec(r);
    if (!m) return null;
    m[1] = m[1].replace(/^'(.*)'$/, '$1');
    var c1 = m[2] ? colNum(m[2]) : 1, r1 = m[3] ? +m[3] : null;
    var hasEnd = r.indexOf(':') >= 0;
    return { tab: m[1], c1: c1, r1: r1, c2: hasEnd ? (m[4] ? colNum(m[4]) : null) : c1, r2: hasEnd ? (m[5] ? +m[5] : null) : r1 };
  }

  function getValues(id, r) {
    var p = parseRange(r), t = p && tabOf(id, p.tab);
    if (!t) return null;
    var lastRow = t.rows.length;
    var r1 = p.r1 || 1, r2 = p.r2 || lastRow;
    var out = [];
    for (var i = r1; i <= r2; i++) {
      var src = t.rows[i - 1] || [], row = [];
      var c2 = p.c2 || Math.max(src.length, p.c1);
      for (var c = p.c1; c <= c2; c++) row.push(src[c - 1] == null ? '' : src[c - 1]);
      while (row.length && row[row.length - 1] === '') row.pop();
      out.push(row);
    }
    while (out.length && !out[out.length - 1].length) out.pop();
    return out;
  }

  function setValues(id, r, values) {
    var p = parseRange(r), t = p && tabOf(id, p.tab);
    if (!t) return false;
    values.forEach(function (vals, di) {
      var row = (p.r1 || 1) + di;
      while (t.rows.length < row) t.rows.push([]);
      var tgt = t.rows[row - 1];
      vals.forEach(function (v, dj) {
        var col = p.c1 + dj;
        while (tgt.length < col) tgt.push('');
        tgt[col - 1] = String(v);
      });
    });
    return true;
  }

  function reply(status, body) {
    return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: function () { return Promise.resolve(body); } });
  }
  function fail(status, message) { return reply(status, { error: { code: status, message: message } }); }

  function fetchFn(url, init) {
    init = init || {};
    var method = init.method || 'GET';
    var body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: method, url: url, body: body });
    var path = url.slice(BASE.length), qs = '';
    var qi = path.indexOf('?');
    if (qi >= 0) { qs = path.slice(qi + 1); path = path.slice(0, qi); }
    var params = {};
    qs.split('&').filter(Boolean).forEach(function (kv) {
      var i = kv.indexOf('='), k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
      (params[k] = params[k] || []).push(v);
    });
    var m;

    if (method === 'POST' && path === '') { // create
      var id = 'MOCKCREATED' + (++counter) + '000000000';
      var s = newSheet(id, body.properties.title, body.sheets.map(function (x) { return { title: x.properties.title }; }));
      return reply(200, { spreadsheetId: id, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
        sheets: s.tabs.map(function (t) { return { properties: { sheetId: t.sheetId, title: t.title } }; }) });
    }
    if ((m = /^\/([^/:]+)$/.exec(path)) && method === 'GET') {
      var sh = store[m[1]];
      if (!sh) return fail(404, 'Requested entity was not found.');
      return reply(200, { properties: { title: sh.title }, sheets: sh.tabs.map(function (t) { return { properties: { sheetId: t.sheetId, title: t.title } }; }) });
    }
    if ((m = /^\/([^/:]+):batchUpdate$/.exec(path)) && method === 'POST') {
      var sh2 = store[m[1]];
      if (!sh2) return fail(404, 'Requested entity was not found.');
      body.requests.forEach(function (rq) {
        if (rq.updateSpreadsheetProperties) { sh2.title = rq.updateSpreadsheetProperties.properties.title; return; }
        var dim = rq.insertDimension || rq.deleteDimension;
        if (!dim) return; // รูปแบบ/validation ไม่จำลอง
        var t = sh2.tabs.filter(function (x) { return x.sheetId === dim.range.sheetId; })[0];
        if (rq.insertDimension) { for (var k = dim.range.startIndex; k < dim.range.endIndex; k++) t.rows.splice(dim.range.startIndex, 0, []); }
        else t.rows.splice(dim.range.startIndex, dim.range.endIndex - dim.range.startIndex);
      });
      return reply(200, {});
    }
    if ((m = /^\/([^/:]+)\/values:batchGet$/.exec(path)) && method === 'GET') {
      if (!store[m[1]]) return fail(404, 'Requested entity was not found.');
      var out = [];
      for (var i = 0; i < (params.ranges || []).length; i++) {
        var v = getValues(m[1], params.ranges[i]);
        if (!v) return fail(400, 'Unable to parse range: ' + params.ranges[i]);
        out.push({ range: params.ranges[i], values: v });
      }
      return reply(200, { valueRanges: out });
    }
    if ((m = /^\/([^/:]+)\/values:batchUpdate$/.exec(path)) && method === 'POST') {
      if (!store[m[1]]) return fail(404, 'Requested entity was not found.');
      for (var j = 0; j < body.data.length; j++) {
        if (!setValues(m[1], body.data[j].range, body.data[j].values)) return fail(400, 'Unable to parse range: ' + body.data[j].range);
      }
      var resp = { totalUpdatedCells: body.data.length };
      if (body.includeValuesInResponse) resp.responses = body.data.map(function (d) { return { updatedRange: d.range, updatedData: { values: getValues(m[1], d.range) } }; });
      return reply(200, resp);
    }
    if ((m = /^\/([^/:]+)\/values\/(.+):append$/.exec(path)) && method === 'POST') {
      var rangeStr = decodeURIComponent(m[2]), p = parseRange(rangeStr), t2 = p && tabOf(m[1], p.tab);
      if (!t2) return fail(400, 'Unable to parse range: ' + rangeStr);
      var last = 0;
      t2.rows.forEach(function (r, i) { if (r.some(function (c) { return c !== ''; })) last = i + 1; });
      var row = last + 1, vals = body.values[0];
      setValues(m[1], p.tab + '!A' + row, [vals]);
      var up = { updatedRange: p.tab + '!A' + row + ':' + colName(vals.length) + row };
      if (/includeValuesInResponse=true/.test(url)) up.updatedData = { values: getValues(m[1], p.tab + '!A' + row + ':' + colName(vals.length) + row) };
      return reply(200, { updates: up });
    }
    return fail(404, 'mock: ไม่รองรับ ' + method + ' ' + path);
  }

  var mem = {};
  mem.wn_registry = JSON.stringify({ list: [{ id: 'rmock', name: 'Rotation ทดสอบ (mock)', sheetId: SEED_ID, archived: false }], activeId: 'rmock' });
  var storage = {
    getItem: function (k) { return k in mem ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  if (opts.empty) delete mem.wn_registry;
  var auth = { have: function () { return true; }, token: function () { return Promise.resolve('mock-token'); }, expire: function () {} };

  return { fetch: fetchFn, auth: auth, storage: storage, store: store, calls: calls, SEED_ID: SEED_ID, LEGACY_ID: LEGACY_ID, IRREGULAR_ID: IRREGULAR_ID };
});
