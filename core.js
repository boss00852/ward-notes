/* ฟังก์ชันล้วนๆ (ไม่แตะ DOM / เครือข่าย) ใช้ทั้งในเบราว์เซอร์และเทสต์ใน Node */
(function (root, factory) {
  var WN = factory();
  if (typeof module === 'object' && module.exports) module.exports = WN;
  else { root.WN = WN; root.Core = WN.Core; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- วันที่ / POD ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ชื่อเดือนไทย/อังกฤษ (ตัดจุดและพิมพ์เล็กก่อนเทียบ) -> เลขเดือน
  var MONTHS = {};
  [['มค', 'มกราคม', 'jan', 'january'], ['กพ', 'กุมภาพันธ์', 'feb', 'february'], ['มีค', 'มีนาคม', 'mar', 'march'],
   ['เมย', 'เมษายน', 'apr', 'april'], ['พค', 'พฤษภาคม', 'may'], ['มิย', 'มิถุนายน', 'jun', 'june'],
   ['กค', 'กรกฎาคม', 'jul', 'july'], ['สค', 'สิงหาคม', 'aug', 'august'], ['กย', 'กันยายน', 'sep', 'sept', 'september'],
   ['ตค', 'ตุลาคม', 'oct', 'october'], ['พย', 'พฤศจิกายน', 'nov', 'november'], ['ธค', 'ธันวาคม', 'dec', 'december']
  ].forEach(function (names, i) { names.forEach(function (n) { MONTHS[n] = i + 1; }); });

  // ปี 4 หลัก: > 2400 = พ.ศ.; ปี 2 หลัก: 50-99 = พ.ศ. 25xx (69 -> 2026), 00-49 = ค.ศ. 20xx
  function fullYear(str) {
    var y = +str;
    if (str.length === 2) return y >= 50 ? 2500 + y - 543 : 2000 + y;
    return y > 2400 ? y - 543 : y;
  }

  // วันที่ใน sheet เป็นข้อความ (ปนทั้ง ค.ศ. / พ.ศ. / ปีเพี้ยน เช่น 1969 หรือ "-") -> Date (UTC เที่ยงคืน) หรือ null
  // รองรับ d/m/yyyy, d-m-yy, d.m.yyyy, yyyy-mm-dd, "12 ต.ค. 2569", "12 Oct 2026" และตัดเวลาท้ายออก
  function parseDate(s) {
    if (s == null) return null;
    var t = String(s).trim().replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?.*$/, '').trim();
    if (!t) return null;
    var d, mo, y, m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})$/.exec(t))) { d = +m[1]; mo = +m[2]; y = fullYear(m[3]); }
    else if ((m = /^(\d{1,2})[\s\-\/]+([A-Za-zก-๙.]+)[\s\-\/]*(\d{4}|\d{2})$/.exec(t))) {
      d = +m[1]; mo = MONTHS[m[2].replace(/\./g, '').toLowerCase()]; y = fullYear(m[3]);
      if (!mo) return null;
    } else return null;
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
  // Date (UTC) -> "d/m/yyyy" (ค.ศ.) รูปแบบเดียวที่แอปเขียนลง sheet และแสดงในช่องวันที่
  function formatDMY(d) { return d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); }
  function todayDMY(now) { now = now || new Date(); return now.getDate() + '/' + (now.getMonth() + 1) + '/' + now.getFullYear(); }

  // ตัดสินใจว่าต้องเขียนช่องวันที่ไหม: shown = ข้อความที่แสดงตอนเปิดฟอร์ม, cur = ที่อยู่ในช่องตอนกดบันทึก
  //  none = ไม่เปลี่ยน (ไม่แตะค่าเดิมใน sheet) | clear = ตั้งเป็นว่าง | set = เขียน value (d/m/yyyy) | invalid = อ่านเป็นวันที่ไม่ได้
  function dateChange(shown, cur) {
    shown = String(shown == null ? '' : shown).trim();
    cur = String(cur == null ? '' : cur).trim();
    if (cur === shown) return { action: 'none' };
    if (!cur) return { action: 'clear' };
    var d = parseDate(cur);
    return d ? { action: 'set', value: formatDMY(d) } : { action: 'invalid' };
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
  var Core = { parseDate: parseDate, formatDMY: formatDMY, todayDMY: todayDMY, dateChange: dateChange, toISO: toISO, fromISO: fromISO, todayUTC: todayUTC, todayISO: todayISO, pod: pod };

  /* ---------- หัวคอลัมน์ ---------- */
  var HEADER_KEYS = {
    'สถานะ': 'status', 'หมายเหตุ': 'note',
    'วันรับ consult': 'consultDate', 'วันที่รับ consult': 'consultDate', 'วันรับเคส': 'consultDate', 'วันที่รับเคส': 'consultDate',
    'วันที่ผ่า': 'opDate', 'ward ที่อยู่': 'ward', 'hn': 'hn', 'ชื่อ': 'name', 'เพศ': 'sex', 'อายุ': 'age',
    // ชื่อหัวที่พบบ่อยของช่องสั้น (ตรงตัวเท่านั้น ไม่เดา เพื่อไม่ให้ "ชื่อ staff" ไปเป็นชื่อคนไข้)
    'เลข hn': 'hn', 'hn no.': 'hn', 'hn no': 'hn', 'ชื่อ-สกุล': 'name', 'ชื่อ - สกุล': 'name', 'ชื่อ สกุล': 'name', 'ชื่อสกุล': 'name',
    'ชื่อ-นามสกุล': 'name', 'ชื่อ - นามสกุล': 'name', 'ชื่อ นามสกุล': 'name', 'ชื่อ-สกุลคนไข้': 'name', 'name': 'name', 'ชื่อคนไข้': 'name',
    'sex': 'sex', 'gender': 'sex', 'age': 'age', 'อายุ (ปี)': 'age', 'status': 'status',
    'diagnosis': 'dx', 'operation/management': 'op', 'anes': 'anes', 'staff': 'staff'
  };
  var CONTENT_KEYS = ['hn', 'name', 'dx', 'op', 'note', 'consultDate', 'opDate'];
  var OTHER_WARD = 'Ward อื่นๆ';

  function normHeader(h) {
    return String(h == null ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase().replace(/\s*\/\s*/g, '/');
  }
  // ชื่อช่องภาษาไทย ใช้ในข้อความแจ้งเตือน
  var FIELD_LABELS = { status: 'สถานะ', note: 'หมายเหตุ', consultDate: 'วันรับเคส', opDate: 'วันที่ผ่า', ward: 'ward ที่อยู่', hn: 'HN',
    name: 'ชื่อ', sex: 'เพศ', age: 'อายุ', dx: 'Diagnosis', op: 'Operation/Management', anes: 'Anes', staff: 'staff' };

  // หัวคอลัมน์ -> key ของช่อง: ตรงตัวก่อน แล้วค่อยดูคำนำหน้า/คำสำคัญ (ชื่อหัวที่ผู้ใช้แก้เล็กน้อย เช่น
  // "หมายเหตุ/บันทึกเพิ่มเติม", "วันรับ / วัน consult" ยังจับคู่ได้) ช่อง hn/ชื่อ/เพศ/อายุ/สถานะ ต้องตรงตัวเท่านั้น
  function headerKey(h) {
    var n = normHeader(h);
    if (!n) return null;
    if (HEADER_KEYS[n]) return HEADER_KEYS[n];
    if (n.indexOf('หมายเหตุ') === 0 || n.indexOf('note') === 0 || n.indexOf('remark') === 0) return 'note';
    if (n.indexOf('วันที่ผ่า') >= 0 || n.indexOf('วันผ่า') >= 0) return 'opDate';
    if (n.indexOf('วันรับ') >= 0 || n.indexOf('วันที่รับ') >= 0) return 'consultDate';
    if (n.indexOf('ward') === 0) return 'ward';
    if (n.indexOf('diagnosis') === 0 || n === 'dx') return 'dx';
    if (n.indexOf('operation') === 0 || n === 'op') return 'op';
    if (n.indexOf('anes') === 0) return 'anes';
    if (n.indexOf('staff') === 0) return 'staff';
    return null;
  }

  // key ต่อคอลัมน์ (index ตรงกับคอลัมน์) หัวซ้ำใช้อันแรก
  function columnKeys(headerRow) {
    var seen = {};
    return headerRow.map(function (h) {
      var key = headerKey(h);
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
  function checkStaffName(name, existing, selfName) {
    name = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!name) throw new Error('ใส่ชื่อ staff ก่อน');
    if (existing.some(function (w) { return sameName(w, name) && !sameName(w, selfName); })) throw new Error('มี staff ชื่อนี้อยู่แล้ว');
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

  /* ---------- นำเข้าจากไฟล์เดิมทุกรูปแบบ -> โครง Main มาตรฐาน ---------- */
  var MAIN_KEYS = ['status', 'note', 'consultDate', 'opDate', 'ward', 'hn', 'name', 'sex', 'age', 'dx', 'op', 'anes', 'staff'];
  var MAX_EXTRA_COLS = 12; // มาตรฐาน 13 + คอลัมน์เสริมได้ไม่เกิน 12 = 25 (แอปอ่านถึงคอลัมน์ Z)

  function cellStr(v) { return String(v == null ? '' : v).trim(); }

  // แถวหัวตาราง: แถวแรกในช่วง 10 แถวบนที่จับคู่ได้ >= 3 ช่อง และมี hn/ชื่อ/dx อย่างน้อยหนึ่งช่อง (ข้ามแถวชื่อเรื่อง/แถวว่างด้านบน)
  function findHeaderRow(values) {
    values = values || [];
    for (var r = 0; r < Math.min(values.length, 10); r++) {
      var set = {};
      columnKeys(values[r] || []).forEach(function (k) { if (k) set[k] = 1; });
      if (Object.keys(set).length >= 3 && (set.hn || set.name || set.dx)) return r;
    }
    return -1;
  }

  // อ่านแท็บคนไข้หนึ่งแท็บ: ช่องที่รู้จัก -> key; หัวที่ไม่รู้จัก/ซ้ำ -> "คอลัมน์เสริม" (เก็บค่าไว้ ไม่ทิ้ง)
  // โครงเดิม consult: คอลัมน์ B ที่ไม่มีหัว (และไม่มีคอลัมน์หมายเหตุอื่น) = หมายเหตุ
  function readImportTab(values, h) {
    var header = values[h] || [];
    var hasNote = header.some(function (x) { return headerKey(x) === 'note'; });
    var seen = {}, keys = [], extras = [];
    header.forEach(function (x, i) {
      var n = normHeader(x), k = headerKey(x);
      if (!n && i === 1 && !hasNote) k = 'note';
      if (k && !seen[k]) { seen[k] = true; keys[i] = k; }
      else if (n) extras.push({ header: String(x).replace(/\s+/g, ' ').trim(), col: i });
    });
    var rows = [], skipped = 0;
    for (var r = h + 1; r < values.length; r++) {
      var row = values[r] || [], p = {}, any = false, ex = {};
      keys.forEach(function (k, c) {
        if (!k) return;
        var v = cellStr(row[c]);
        if (!v) return;
        p[k] = v;
        if (CONTENT_KEYS.indexOf(k) >= 0) any = true;
      });
      extras.forEach(function (e) {
        var v = cellStr(row[e.col]), key = e.header.toLowerCase();
        if (v && !(key in ex)) ex[key] = v;
      });
      if (any) rows.push({ p: p, ex: ex });
      else if (row.some(function (x) { return cellStr(x); })) skipped++;
    }
    return { rows: rows, skipped: skipped };
  }

  /* tabs = [{ title, values }] แท็บที่อาจเป็นตารางคนไข้ (ตามลำดับแท็บ)  wardsList / staffsList = รายชื่อจากแท็บ Wards / Staffs เดิม (ถ้ามี)
   * คืน { rows: [[13 ช่อง + คอลัมน์เสริม]], extraHeaders, wards, staffs, stats }
   * ไม่แก้ค่า ไม่ตัดแถวซ้ำ แท็บ consult ไปต่อท้าย (ค้าง ward ก่อน) ward/staff ที่คนไข้ใช้แต่ไม่อยู่ในรายการถูกเพิ่มให้ */
  function importPlan(tabs, wardsList, staffsList) {
    var found = [], skippedTabs = [];
    (tabs || []).forEach(function (t, idx) {
      var values = t.values || [], h = findHeaderRow(values);
      if (h < 0) { skippedTabs.push({ title: t.title, reason: values.length ? 'ไม่พบแถวหัวคอลัมน์ที่รู้จัก' : 'แท็บว่าง' }); return; }
      found.push({ title: t.title, h: h, rt: readImportTab(values, h), idx: idx, late: /consult/i.test(t.title) ? 1 : 0 });
    });
    found.sort(function (x, y) { return x.late - y.late || x.idx - y.idx; });

    // คอลัมน์เสริม: รวมจากทุกแท็บตามชื่อหัว เก็บเฉพาะที่มีข้อมูลจริง
    var extraOrder = [], extraSeen = {};
    found.forEach(function (f) {
      f.rt.rows.forEach(function (row) {
        Object.keys(row.ex).forEach(function (key) {
          if (!extraSeen[key]) { extraSeen[key] = true; extraOrder.push(key); }
        });
      });
    });
    var headerOf = {};
    found.forEach(function (f) {
      var header = (tabs.filter(function (t) { return t.title === f.title; })[0] || {}).values[f.h] || [];
      header.forEach(function (x) { var k = String(x).replace(/\s+/g, ' ').trim(); if (k && !(k.toLowerCase() in headerOf)) headerOf[k.toLowerCase()] = k; });
    });
    var kept = extraOrder.slice(0, MAX_EXTRA_COLS), dropped = extraOrder.slice(MAX_EXTRA_COLS);

    var out = [], hnCount = {}, noStatus = 0, badDates = 0, staffSeen = {}, dataStaffs = [], wardSeen = {}, dataWards = [];
    var listedWards = {}, listedStaffs = {};
    (wardsList || []).forEach(function (w) { listedWards[sameKey(w)] = true; });
    (staffsList || []).forEach(function (s) { listedStaffs[sameKey(s)] = true; });
    var perTab = found.map(function (f) {
      f.rt.rows.forEach(function (row) {
        var p = row.p;
        out.push(MAIN_KEYS.map(function (k) { return p[k] || ''; }).concat(kept.map(function (key) { return row.ex[key] || ''; })));
        if (p.hn) hnCount[p.hn] = (hnCount[p.hn] || 0) + 1;
        if (!p.status) noStatus++;
        if (['consultDate', 'opDate'].some(function (k) { return p[k] && p[k] !== '-' && !parseDate(p[k]); })) badDates++;
        if (p.staff) { var sk = sameKey(p.staff); if (!staffSeen[sk]) { staffSeen[sk] = true; dataStaffs.push(p.staff.replace(/\s+/g, ' ')); } }
        if (p.ward) { var wk = sameKey(p.ward); if (!wardSeen[wk]) { wardSeen[wk] = true; dataWards.push(p.ward.replace(/\s+/g, ' ')); } }
      });
      return { title: f.title, headerRow: f.h + 1, rows: f.rt.rows.length, skipped: f.rt.skipped };
    });
    var addedWards = dataWards.filter(function (w) { return !listedWards[sameKey(w)]; });
    var addedStaffs = dataStaffs.filter(function (s) { return !listedStaffs[sameKey(s)]; });
    return {
      rows: out,
      extraHeaders: kept.map(function (key) { return headerOf[key] || key; }),
      wards: normalizeWards((wardsList || []).concat(addedWards)),
      staffs: normalizeNames((staffsList || []).concat(addedStaffs), ''),
      stats: {
        tabs: perTab, skippedTabs: skippedTabs, total: out.length,
        duplicateHn: Object.keys(hnCount).filter(function (hn) { return hnCount[hn] > 1; }).length,
        noStatus: noStatus, badDates: badDates, addedWards: addedWards, addedStaffs: addedStaffs.length,
        extraColumns: kept.map(function (key) { return headerOf[key] || key; }), droppedColumns: dropped.map(function (key) { return headerOf[key] || key; })
      }
    };
  }
  function sameKey(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }

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
    Core: Core, HEADER_KEYS: HEADER_KEYS, FIELD_LABELS: FIELD_LABELS, headerKey: headerKey, CONTENT_KEYS: CONTENT_KEYS, OTHER_WARD: OTHER_WARD,
    normHeader: normHeader, columnKeys: columnKeys, sameName: sameName, normalizeNames: normalizeNames,
    normalizeWards: normalizeWards, checkWardName: checkWardName, checkStaffName: checkStaffName, dropStaffHeader: dropStaffHeader,
    wardUsage: wardUsage, matchIndexes: matchIndexes, extractSheetId: extractSheetId,
    setArchived: setArchived, rotationSummary: rotationSummary, a1: a1, colRuns: colRuns,
    MAIN_KEYS: MAIN_KEYS, findHeaderRow: findHeaderRow, importPlan: importPlan
  };
});
