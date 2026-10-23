/* ฟังก์ชันล้วนๆ (ไม่แตะ DOM / เครือข่าย) ใช้ทั้งในเบราว์เซอร์และเทสต์ใน Node */
(function (root, factory) {
  var WN = factory();
  if (typeof module === 'object' && module.exports) module.exports = WN;
  else { root.WN = WN; root.Core = WN.Core; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- วันที่ / POD ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // วันที่ใน sheet เป็นข้อความ d/m/yyyy (ปนทั้ง ค.ศ. / พ.ศ. / ปีเพี้ยน เช่น 1969 หรือ "-") -> Date (UTC เที่ยงคืน) หรือ null
  function parseDate(s) {
    var m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\s*$/.exec(s == null ? '' : String(s));
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3];
    if (y > 2400) y -= 543;
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCDate() === d ? dt : null;
  }
  function toISO(s) {
    var d = parseDate(s);
    return d ? d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) : '';
  }
  // yyyy-mm-dd (จาก <input type=date>) -> d/m/yyyy (ค.ศ.) สำหรับเขียนลง sheet
  function fromISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] : '';
  }
  function todayUTC(now) { now = now || new Date(); return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()); }
  function todayISO(now) { now = now || new Date(); return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }
  // วันผ่าตัด -> { kind: 'pod', n } | { kind: 'soon', n } | null
  function pod(opDateStr, now) {
    var d = parseDate(opDateStr);
    if (!d) return null;
    var diff = Math.round((todayUTC(now) - d.getTime()) / 86400000);
    return diff >= 0 ? { kind: 'pod', n: diff } : { kind: 'soon', n: -diff };
  }
  var Core = { parseDate: parseDate, toISO: toISO, fromISO: fromISO, todayUTC: todayUTC, todayISO: todayISO, pod: pod };

  /* ---------- หัวคอลัมน์ ---------- */
  var HEADER_KEYS = {
    'สถานะ': 'status', 'หมายเหตุ': 'note',
    'วันรับ consult': 'consultDate', 'วันที่รับ consult': 'consultDate', 'วันรับเคส': 'consultDate', 'วันที่รับเคส': 'consultDate',
    'วันที่ผ่า': 'opDate', 'ward ที่อยู่': 'ward', 'hn': 'hn', 'ชื่อ': 'name', 'เพศ': 'sex', 'อายุ': 'age',
    'diagnosis': 'dx', 'operation/management': 'op', 'anes': 'anes', 'staff': 'staff'
  };
  var CONTENT_KEYS = ['hn', 'name', 'dx', 'op', 'note', 'consultDate', 'opDate'];
  var OTHER_WARD = 'Ward อื่นๆ';

  function normHeader(h) {
    return String(h == null ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase().replace(/\s*\/\s*/g, '/');
  }
  // key ต่อคอลัมน์ (index ตรงกับคอลัมน์) หัวซ้ำใช้อันแรก
  function columnKeys(headerRow) {
    var seen = {};
    return headerRow.map(function (h) {
      var key = HEADER_KEYS[normHeader(h)] || null;
      if (!key || seen[key]) return null;
      seen[key] = true;
      return key;
    });
  }

  /* ---------- รายชื่อ ward / staff ---------- */
  function sameName(a, b) {
    return String(a == null ? '' : a).replace(/\s+/g, ' ').trim().toLowerCase() ===
      String(b == null ? '' : b).replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function normalizeNames(input, skip) {
    var arr = Array.isArray(input) ? input : String(input == null ? '' : input).split(/\r?\n/);
    var seen = {}, out = [];
    arr.forEach(function (w) {
      w = String(w == null ? '' : w).replace(/\s+/g, ' ').trim();
      var k = w.toLowerCase();
      if (!w || k === skip || seen[k]) return;
      seen[k] = true;
      out.push(w);
    });
    return out;
  }
  function normalizeWards(input) {
    var out = normalizeNames(input, OTHER_WARD.toLowerCase());
    out.push(OTHER_WARD);
    return out;
  }
  function checkWardName(name, existing, selfName) {
    name = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!name) throw new Error('ใส่ชื่อ ward ก่อน');
    if (sameName(name, OTHER_WARD) && !sameName(selfName, OTHER_WARD)) throw new Error('ชื่อนี้สงวนไว้ (' + OTHER_WARD + ')');
    if (existing.some(function (w) { return sameName(w, name) && !sameName(w, selfName); })) throw new Error('มี ward ชื่อนี้อยู่แล้ว');
    return name;
  }
  // Staffs ไม่มีหัว แต่ถ้าแถวแรกดูเป็นหัว (ขึ้นต้น staff / รายชื่อ) ให้ข้าม
  function dropStaffHeader(list) {
    return list.length && /^(staffs?|รายชื่อ)/i.test(list[0]) ? list.slice(1) : list;
  }
  // คู่ (ward, status) ของแต่ละแถว -> { key: { name, inService, total } }  status ที่ไม่ใช่ "off service" นับว่ายังอยู่
  function wardUsage(rows) {
    var counts = {};
    rows.forEach(function (r) {
      var w = String(r.ward == null ? '' : r.ward).replace(/\s+/g, ' ').trim();
      if (!w) return;
      var k = w.toLowerCase();
      if (!counts[k]) counts[k] = { name: w, inService: 0, total: 0 };
      counts[k].total++;
      if (String(r.status == null ? '' : r.status).trim().toLowerCase() !== 'off service') counts[k].inService++;
    });
    return counts;
  }
  function matchIndexes(values, name) {
    var out = [];
    values.forEach(function (v, i) { if (sameName(v, name)) out.push(i); });
    return out;
  }

  /* ---------- rotation ---------- */
  function extractSheetId(s) {
    s = String(s == null ? '' : s).trim();
    var m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /^([a-zA-Z0-9_-]{20,})$/.exec(s);
    return m ? m[1] : null;
  }
  function setArchived(list, activeId, id, archived) {
    var target = list.filter(function (r) { return r.id === id; })[0];
    if (!target) throw new Error('ไม่พบ rotation นี้');
    archived = !!archived;
    var next = list.map(function (r) {
      if (r.id !== id) return r;
      var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; });
      c.archived = archived;
      return c;
    });
    var open = next.filter(function (r) { return !r.archived; });
    if (!open.length) throw new Error('ต้องเหลือ rotation ที่ใช้งานอยู่อย่างน้อย 1 อัน');
    var active = open.filter(function (r) { return r.id === activeId; })[0] ? activeId : open[0].id;
    return { list: next, activeId: active };
  }
  function rotationSummary(list, activeId) {
    return list.map(function (r) {
      return { id: r.id, name: r.name, sheetId: r.sheetId, archived: !!r.archived, active: r.id === activeId };
    });
  }

  /* ---------- A1 ---------- */
  function a1(col, row) { // (28, 5) -> "AB5"
    var s = '';
    for (var n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s + row;
  }
  function colRuns(cols) { // [0,1,2,5] -> [[0,3],[5,1]]
    var runs = [];
    cols.forEach(function (c) {
      var last = runs[runs.length - 1];
      if (last && last[0] + last[1] === c) last[1]++;
      else runs.push([c, 1]);
    });
    return runs;
  }

  return {
    Core: Core, HEADER_KEYS: HEADER_KEYS, CONTENT_KEYS: CONTENT_KEYS, OTHER_WARD: OTHER_WARD,
    normHeader: normHeader, columnKeys: columnKeys, sameName: sameName, normalizeNames: normalizeNames,
    normalizeWards: normalizeWards, checkWardName: checkWardName, dropStaffHeader: dropStaffHeader,
    wardUsage: wardUsage, matchIndexes: matchIndexes, extractSheetId: extractSheetId,
    setArchived: setArchived, rotationSummary: rotationSummary, a1: a1, colRuns: colRuns
  };
});
