/* "เซิร์ฟเวอร์" ฝั่งเบราว์เซอร์: พอร์ตจาก Code.gs / rotations.gs / wards.gs ให้เรียก Google Sheets API ตรงๆ
 * ชื่อฟังก์ชันและรูปแบบผลลัพธ์เหมือนฝั่ง Apps Script เพื่อให้หน้าจอใช้โค้ดเดิมได้
 * env: { core, fetch, auth, storage, now } (ทดสอบใน Node ด้วย mock.js) */
(function (root, factory) {
  var api = { createServer: factory };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WNApi = api;
})(typeof self !== 'undefined' ? self : this, function createServer(env) {
  'use strict';
  var C = env.core;
  var BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
  var MAIN = 'Main', STAFFS = 'Staffs', WARDS = 'Wards';
  var WARDS_HEADER = 'รายชื่อ wards ทั้งหมด';
  var STATUS_VALUES = ['in service', 'off service'];
  var MAIN_HEADERS = ['สถานะ', 'หมายเหตุ', 'วันรับ consult', 'วันที่ผ่า', 'ward ที่อยู่', 'HN', 'ชื่อ', 'เพศ', 'อายุ', 'Diagnosis', 'Operation/Management', 'Anes', 'staff'];
  var TEXT_HEADERS = ['วันรับ consult', 'วันที่ผ่า', 'HN', 'อายุ'];
  var tabCache = {};

  /* ---------- เครือข่าย ---------- */
  function apiMessage(j, status) {
    var m = j && j.error && j.error.message ? String(j.error.message) : '';
    var t = /Unable to parse range: ([^!]+)!/.exec(m);
    if (t) return 'ไม่พบแท็บ ' + t[1] + ' ใน sheet นี้';
    if (status === 403) return 'ไม่มีสิทธิ์เข้าถึง sheet นี้ (ลงชื่อด้วยบัญชีที่เปิดไฟล์นี้ได้)';
    if (status === 404) return 'ไม่พบ sheet นี้ (ลบแล้วหรือ ID ผิด)';
    if (status === 429) return 'ขอข้อมูลถี่เกินไป รอสักครู่แล้วลองใหม่';
    return 'Google Sheets ตอบผิดพลาด (' + status + ')' + (m ? ': ' + m : '');
  }

  function req(method, url, body, retried) {
    return env.auth.token().then(function (tok) {
      return env.fetch(url, {
        method: method,
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }).then(function (r) {
      if (r.status === 401) {
        env.auth.expire();
        if (!retried) return req(method, url, body, true);
        var e = new Error('ต้องลงชื่อเข้าใช้ Google ใหม่'); e.code = 'AUTH'; throw e;
      }
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(apiMessage(j, r.status)); });
      }
      return r.json();
    });
  }

  function rng(r) { return encodeURIComponent(r); }
  function batchGet(sid, ranges) {
    return req('GET', BASE + '/' + sid + '/values:batchGet?valueRenderOption=FORMATTED_VALUE&' +
      ranges.map(function (r) { return 'ranges=' + rng(r); }).join('&'))
      .then(function (res) { return (res.valueRanges || []).map(function (v) { return v.values || []; }); });
  }
  // verify = true: ขอให้ Google ส่งค่าที่เขียนแล้วกลับมา (ไม่เพิ่มจำนวนคำขอ) ใช้ตรวจว่าตรงกับที่ส่ง
  function valuesBatchUpdate(sid, data, verify) {
    if (!data.length) return Promise.resolve([]);
    var body = { valueInputOption: 'RAW', data: data };
    if (verify) { body.includeValuesInResponse = true; body.responseValueRenderOption = 'FORMATTED_VALUE'; }
    return req('POST', BASE + '/' + sid + '/values:batchUpdate', body).then(function (res) { return (res && res.responses) || []; });
  }
  // ค่าที่ Google ส่งกลับตรงกับที่เราส่งไหม (ไม่มีค่าส่งกลับ = ตรวจไม่ได้ ถือว่าไม่ผิด)
  function sameAsSent(sentRows, gotRows) {
    if (!gotRows) return true;
    return sentRows.every(function (sent, i) {
      var got = gotRows[i] || [];
      return sent.every(function (v, j) { return cell(got[j]) === cell(v); });
    });
  }
  function structBatch(sid, requests) {
    return req('POST', BASE + '/' + sid + ':batchUpdate', { requests: requests });
  }
  function tabId(sid, title) {
    function find(tabs) { var t = tabs.filter(function (x) { return x.title === title; })[0]; return t ? t.sheetId : null; }
    if (tabCache[sid] && find(tabCache[sid]) != null) return Promise.resolve(find(tabCache[sid]));
    return req('GET', BASE + '/' + sid + '?fields=' + rng('sheets.properties(sheetId,title)')).then(function (res) {
      tabCache[sid] = (res.sheets || []).map(function (s) { return s.properties; });
      var id = find(tabCache[sid]);
      if (id == null) throw new Error('ไม่พบแท็บ ' + title + ' ใน sheet นี้');
      return id;
    });
  }
  function cell(v) { return String(v == null ? '' : v).trim(); }
  function firstCol(rows) { return rows.map(function (r) { return cell(r[0]); }); }

  /* ---------- รายการ rotation (เก็บในเครื่อง) ---------- */
  var REG_KEY = 'wn_registry';
  function regRead() {
    try {
      var o = JSON.parse(env.storage.getItem(REG_KEY) || 'null');
      if (o && Array.isArray(o.list)) return o;
    } catch (e) { /* ignore */ }
    return { list: [], activeId: null };
  }
  function regWrite(o) { env.storage.setItem(REG_KEY, JSON.stringify(o)); }
  function activeOf(o) {
    var open = o.list.filter(function (r) { return !r.archived; });
    var hit = open.filter(function (r) { return r.id === o.activeId; })[0];
    return hit ? hit.id : (open[0] ? open[0].id : null);
  }
  function entryOf(reg, id) {
    var hit = reg.list.filter(function (r) { return r.id === (id || activeOf(reg)); })[0];
    if (!hit) throw new Error('ไม่พบ rotation นี้ กรุณารีเฟรช');
    return hit;
  }
  function newId() { return 'r' + env.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function rotationsResult(reg) {
    var a = activeOf(reg);
    return { rotations: C.rotationSummary(reg.list, a), activeId: a };
  }
  function entryFor(rotationId) { return entryOf(regRead(), rotationId); }

  /* ---------- โหลด ---------- */
  function loadAll(rotationId) {
    var t0 = env.now();
    var reg = regRead(), aid = activeOf(reg);
    var out = { patients: [], wards: [], staffs: [], rotationId: aid, rotations: C.rotationSummary(reg.list, aid), ms: 0 };
    if (!aid) { out.rotationId = null; return Promise.resolve(out); }
    var e = entryOf(reg, rotationId || aid);
    out.rotationId = e.id;
    return batchGet(e.sheetId, [MAIN + '!A1:Z', WARDS + '!A:A', STAFFS + '!A:A']).then(function (vr) {
      var vals = vr[0] || [];
      var keys = C.columnKeys(vals[0] || []);
      var width = 0;
      keys.forEach(function (k, i) { if (k) width = i + 1; });
      for (var r = 1; r < vals.length && width; r++) {
        var row = vals[r], p = { row: r + 1 }, any = false;
        for (var c = 0; c < width; c++) {
          var k = keys[c];
          if (!k) continue;
          var v = cell(row[c]);
          if (!v) continue;
          p[k] = v;
          if (C.CONTENT_KEYS.indexOf(k) >= 0) any = true;
        }
        if (any) out.patients.push(p);
      }
      out.wards = firstCol(vr[1] || []).slice(1).filter(Boolean);
      out.staffs = C.dropStaffHeader(firstCol(vr[2] || []).filter(Boolean));
      out.ms = env.now() - t0;
      return out;
    });
  }

  /* ---------- บันทึกคนไข้ ---------- */
  // payload: { rotationId, row (null = เพิ่มใหม่), expectHn, expectName, fields }
  function savePatient(payload) {
    var t0 = env.now();
    payload = payload || {};
    var e = entryFor(payload.rotationId), sid = e.sheetId;
    var fields = payload.fields || {};
    var row = payload.row ? Number(payload.row) : null;
    if (row !== null && (row < 2 || row !== Math.floor(row))) return Promise.reject(new Error('ไม่พบแถวนี้แล้ว กรุณารีเฟรชแล้วลองใหม่'));

    var ranges = [MAIN + '!A1:Z1'];
    if (row !== null) ranges.push(MAIN + '!A' + row + ':Z' + row);
    return batchGet(sid, ranges).then(function (vr) {
      var keys = C.columnKeys(vr[0][0] || []);
      if (!keys.some(Boolean)) throw new Error('ไม่พบหัวคอลัมน์ในแท็บ ' + MAIN);
      if (row !== null) {
        var cur = (vr[1] && vr[1][0]) || [];
        var guards = { hn: payload.expectHn, name: payload.expectName };
        Object.keys(guards).forEach(function (k) {
          var col = keys.indexOf(k);
          if (col < 0 || guards[k] === undefined) return;
          if (cell(cur[col]) !== cell(guards[k])) throw new Error('แถวใน sheet เปลี่ยนไปแล้ว กรุณารีเฟรชแล้วลองใหม่');
        });
        var cols = [];
        keys.forEach(function (k, i) { if (k && Object.prototype.hasOwnProperty.call(fields, k)) cols.push(i); });
        var data = C.colRuns(cols).map(function (run) {
          var vals = [];
          for (var c = run[0]; c < run[0] + run[1]; c++) vals.push(String(fields[keys[c]] == null ? '' : fields[keys[c]]));
          return { range: MAIN + '!' + C.a1(run[0] + 1, row) + ':' + C.a1(run[0] + run[1], row), values: [vals] };
        });
        return valuesBatchUpdate(sid, data, true).then(function (resps) {
          var ok = !resps.length || resps.every(function (r, i) {
            return sameAsSent(data[i].values, r && r.updatedData ? r.updatedData.values || [[]] : null);
          });
          return { row: row, ms: env.now() - t0, mismatch: !ok };
        });
      }
      // แถวใหม่: ต่อท้ายตาราง (Sheets หาแถวว่างถัดไปให้เอง)
      var arr = keys.map(function (k) {
        return k && Object.prototype.hasOwnProperty.call(fields, k) ? String(fields[k] == null ? '' : fields[k]) : '';
      });
      return req('POST', BASE + '/' + sid + '/values/' + rng(MAIN + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=true&responseValueRenderOption=FORMATTED_VALUE',
        { values: [arr] }).then(function (res) {
        var m = /!\$?[A-Z]+\$?(\d+)/.exec((res.updates && res.updates.updatedRange) || '');
        if (!m) throw new Error('บันทึกแล้วแต่ไม่ทราบเลขแถว กรุณารีเฟรช');
        var back = res.updates && res.updates.updatedData && res.updates.updatedData.values;
        return { row: Number(m[1]), ms: env.now() - t0, mismatch: !sameAsSent([arr], back ? [back[0] || []] : null) };
      });
    });
  }

  /* ---------- ward / staff ---------- */
  function addWard(name, rotationId) {
    var sid = entryFor(rotationId).sheetId;
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) return Promise.reject(new Error('ใส่ชื่อ ward ก่อน'));
    return batchGet(sid, [WARDS + '!A:A']).then(function (vr) {
      var col = firstCol(vr[0]);
      var list = col.slice(1).filter(Boolean);
      if (list.some(function (w) { return C.sameName(w, name); })) return list;
      var other = col.indexOf(C.OTHER_WARD);
      if (other > 0) { // แทรกก่อน "Ward อื่นๆ"
        return tabId(sid, WARDS).then(function (id) {
          return structBatch(sid, [{ insertDimension: { range: { sheetId: id, dimension: 'ROWS', startIndex: other, endIndex: other + 1 }, inheritFromBefore: true } }]);
        }).then(function () {
          return valuesBatchUpdate(sid, [{ range: WARDS + '!A' + (other + 1), values: [[name]] }]);
        }).then(function () { var i = list.indexOf(C.OTHER_WARD); list.splice(i < 0 ? list.length : i, 0, name); return list; });
      }
      return req('POST', BASE + '/' + sid + '/values/' + rng(WARDS + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
        { values: [[name]] }).then(function () { list.push(name); return list; });
    });
  }

  function addStaff(name, rotationId) {
    var sid = entryFor(rotationId).sheetId;
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) return Promise.reject(new Error('ใส่ชื่อ staff ก่อน'));
    return batchGet(sid, [STAFFS + '!A:A']).then(function (vr) {
      var list = C.dropStaffHeader(firstCol(vr[0]).filter(Boolean));
      if (list.some(function (n) { return C.sameName(n, name); })) return list;
      return req('POST', BASE + '/' + sid + '/values/' + rng(STAFFS + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
        { values: [[name]] }).then(function () { list.push(name); return list; });
    });
  }

  // อ่านเฉพาะคอลัมน์ ward/status ของ Main (ไม่ใช้ชื่อ/HN)
  function wardColumns(sid) {
    return batchGet(sid, [MAIN + '!A1:Z', WARDS + '!A:A']).then(function (vr) {
      var keys = C.columnKeys((vr[0][0]) || []);
      var wc = keys.indexOf('ward'), sc = keys.indexOf('status');
      var rows = vr[0].slice(1).map(function (r) { return { ward: wc < 0 ? '' : cell(r[wc]), status: sc < 0 ? '' : cell(r[sc]) }; });
      return { wc: wc, rows: rows, listed: firstCol(vr[1]).slice(1).filter(Boolean), wardsCol: firstCol(vr[1]) };
    });
  }
  function usageOf(cols) {
    var counts = C.wardUsage(cols.rows), usage = {};
    cols.listed.forEach(function (w) {
      var c = counts[w.toLowerCase().replace(/\s+/g, ' ')];
      usage[w] = { inService: c ? c.inService : 0, total: c ? c.total : 0 };
    });
    var keys = cols.listed.map(function (w) { return w.toLowerCase().replace(/\s+/g, ' '); });
    var unlisted = Object.keys(counts).filter(function (k) { return keys.indexOf(k) < 0; })
      .map(function (k) { return { name: counts[k].name, inService: counts[k].inService, total: counts[k].total }; });
    return { wards: cols.listed, usage: usage, unlisted: unlisted };
  }

  // ---- staff: อ่านคอลัมน์ staff/status ของ Main + รายชื่อใน Staffs (ไม่มีหัว) ----
  function staffColumns(sid) {
    return batchGet(sid, [MAIN + '!A1:Z', STAFFS + '!A:A']).then(function (vr) {
      var keys = C.columnKeys((vr[0][0]) || []);
      var sc = keys.indexOf('staff'), st = keys.indexOf('status');
      var rows = vr[0].slice(1).map(function (r) { return { ward: sc < 0 ? '' : cell(r[sc]), status: st < 0 ? '' : cell(r[st]) }; });
      var raw = firstCol(vr[1]);
      return { sc: sc, rows: rows, raw: raw, listed: C.dropStaffHeader(raw.filter(Boolean)) };
    });
  }
  function staffResult(cols) {
    var u = usageOf(cols); // usageOf ใช้ rows[].ward เป็นชื่อที่นับ (ที่นี่คือชื่อ staff)
    return { staffs: u.wards, usage: u.usage, unlisted: u.unlisted };
  }
  function getStaffUsage(rotationId) {
    return staffColumns(entryFor(rotationId).sheetId).then(staffResult);
  }
  function renameStaff(oldName, newName, rotationId) {
    var sid = entryFor(rotationId).sheetId;
    return staffColumns(sid).then(function (cols) {
      var name = C.checkStaffName(newName, cols.listed, oldName);
      var at = C.matchIndexes(cols.raw, oldName);
      if (!at.length) throw new Error('ไม่พบ staff "' + oldName + '" แล้ว กรุณารีเฟรช');
      var hits = cols.sc < 0 ? [] : C.matchIndexes(cols.rows.map(function (r) { return r.ward; }), oldName);
      var data = hits.map(function (i) { return { range: MAIN + '!' + C.a1(cols.sc + 1, i + 2), values: [[name]] }; });
      data.push({ range: STAFFS + '!A' + (at[0] + 1), values: [[name]] });
      return valuesBatchUpdate(sid, data).then(function () {
        cols.rows.forEach(function (r, i) { if (hits.indexOf(i) >= 0) r.ward = name; });
        cols.listed = cols.listed.map(function (w) { return C.sameName(w, oldName) ? name : w; });
        var res = staffResult(cols); res.updated = hits.length; return res;
      });
    });
  }
  function deleteStaff(name, force, rotationId) {
    var sid = entryFor(rotationId).sheetId;
    return staffColumns(sid).then(function (cols) {
      var at = C.matchIndexes(cols.raw, name);
      if (!at.length) throw new Error('ไม่พบ staff "' + name + '" แล้ว กรุณารีเฟรช');
      var u = staffResult(cols).usage[cols.raw[at[0]]] || { inService: 0, total: 0 };
      if (u.inService > 0 && !force) return { deleted: false, inService: u.inService, total: u.total };
      return tabId(sid, STAFFS).then(function (id) {
        return structBatch(sid, [{ deleteDimension: { range: { sheetId: id, dimension: 'ROWS', startIndex: at[0], endIndex: at[0] + 1 } } }]);
      }).then(function () {
        cols.listed = cols.listed.filter(function (w) { return !C.sameName(w, name); });
        var res = staffResult(cols); res.deleted = true; return res;
      });
    });
  }

  function getWardUsage(rotationId) {
    return wardColumns(entryFor(rotationId).sheetId).then(usageOf);
  }

  function renameWard(oldName, newName, rotationId) {
    var sid = entryFor(rotationId).sheetId;
    if (C.sameName(oldName, C.OTHER_WARD)) return Promise.reject(new Error('เปลี่ยนชื่อ "' + C.OTHER_WARD + '" ไม่ได้'));
    return wardColumns(sid).then(function (cols) {
      var name = C.checkWardName(newName, cols.listed, oldName);
      var at = C.matchIndexes(cols.wardsCol.slice(1), oldName);
      if (!at.length) throw new Error('ไม่พบ ward "' + oldName + '" แล้ว กรุณารีเฟรช');
      var hits = cols.wc < 0 ? [] : C.matchIndexes(cols.rows.map(function (r) { return r.ward; }), oldName);
      var data = hits.map(function (i) { return { range: MAIN + '!' + C.a1(cols.wc + 1, i + 2), values: [[name]] }; });
      data.push({ range: WARDS + '!A' + (at[0] + 2), values: [[name]] });
      return valuesBatchUpdate(sid, data).then(function () {
        // ผลลัพธ์คำนวณจากข้อมูลที่เพิ่งอ่าน ไม่ต้องอ่านซ้ำ
        cols.rows.forEach(function (r, i) { if (hits.indexOf(i) >= 0) r.ward = name; });
        cols.listed = cols.listed.map(function (w) { return C.sameName(w, oldName) ? name : w; });
        var res = usageOf(cols); res.updated = hits.length; return res;
      });
    });
  }

  function deleteWard(name, force, rotationId) {
    var sid = entryFor(rotationId).sheetId;
    if (C.sameName(name, C.OTHER_WARD)) return Promise.reject(new Error('ลบ "' + C.OTHER_WARD + '" ไม่ได้'));
    return wardColumns(sid).then(function (cols) {
      var at = C.matchIndexes(cols.wardsCol.slice(1), name);
      if (!at.length) throw new Error('ไม่พบ ward "' + name + '" แล้ว กรุณารีเฟรช');
      var u = usageOf(cols).usage[cols.wardsCol[at[0] + 1]] || { inService: 0, total: 0 };
      if (u.inService > 0 && !force) return { deleted: false, inService: u.inService, total: u.total };
      return tabId(sid, WARDS).then(function (id) {
        return structBatch(sid, [{ deleteDimension: { range: { sheetId: id, dimension: 'ROWS', startIndex: at[0] + 1, endIndex: at[0] + 2 } } }]);
      }).then(function () {
        cols.listed = cols.listed.filter(function (w) { return !C.sameName(w, name); });
        var res = usageOf(cols); res.deleted = true; return res;
      });
    });
  }

  /* ---------- rotation ---------- */
  function getRotations() { return Promise.resolve(rotationsResult(regRead())); }

  function switchRotation(id) {
    var reg = regRead();
    var hit = reg.list.filter(function (r) { return r.id === id; })[0];
    if (!hit) return Promise.reject(new Error('ไม่พบ rotation นี้'));
    if (hit.archived) return Promise.reject(new Error('rotation นี้อยู่ในคลัง กดเอากลับมาใช้ก่อน'));
    reg.activeId = id; regWrite(reg);
    return Promise.resolve(rotationsResult(reg));
  }

  function archiveRotation(id, archived) {
    try {
      var reg = regRead();
      var r = C.setArchived(reg.list, activeOf(reg), id, archived);
      reg.list = r.list; reg.activeId = r.activeId; regWrite(reg);
      return Promise.resolve(rotationsResult(reg));
    } catch (e) { return Promise.reject(e); }
  }

  // เปลี่ยนชื่อ rotation ในแอป (เก็บในเครื่อง) และถ้า alsoFile = true พยายามเปลี่ยนชื่อไฟล์ Google Sheets ด้วย
  // เปลี่ยนชื่อไฟล์ไม่สำเร็จ (เช่น ไม่มีสิทธิ์แก้ไฟล์) ไม่ทำให้การเปลี่ยนชื่อในแอปล้มเหลว: คืน fileRenamed = false
  function renameRotation(id, newName, alsoFile) {
    var name = String(newName == null ? '' : newName).replace(/\s+/g, ' ').trim();
    if (!name) return Promise.reject(new Error('ใส่ชื่อ rotation ก่อน'));
    if (name.length > 100) return Promise.reject(new Error('ชื่อยาวเกิน 100 ตัวอักษร'));
    var reg = regRead();
    var hit = reg.list.filter(function (r) { return r.id === id; })[0];
    if (!hit) return Promise.reject(new Error('ไม่พบ rotation นี้ กรุณารีเฟรช'));
    hit.name = name; regWrite(reg);
    var res = rotationsResult(reg);
    if (!alsoFile) return Promise.resolve(res);
    return structBatch(hit.sheetId, [{ updateSpreadsheetProperties: { properties: { title: name }, fields: 'title' } }])
      .then(function () { res.fileRenamed = true; return res; },
        function (e) { if (e && e.code === 'AUTH') throw e; res.fileRenamed = false; res.fileError = e && e.message; return res; });
  }

  function register(name, sheetId) {
    var reg = regRead();
    var entry = { id: newId(), name: name, sheetId: sheetId, archived: false, createdAt: new Date(env.now()).toISOString() };
    reg.list.push(entry); reg.activeId = entry.id; regWrite(reg);
    return rotationsResult(reg);
  }

  // สร้าง Google Sheet ใหม่ (Main + Staffs + Wards) ใส่ข้อมูลตั้งต้น แล้วลงทะเบียนเป็น rotation ที่ใช้อยู่
  // rows = แถวคนไข้ (13 ช่องตามหัว Main) ใส่ได้ตอนย้ายข้อมูล; คืน rotationsResult + url
  function buildRotation(name, wards, staffs, rows) {
    rows = rows || [];
    var url = '';
    return req('POST', BASE, {
      properties: { title: name, locale: 'th_TH', timeZone: 'Asia/Bangkok' },
      sheets: [
        { properties: { title: MAIN, gridProperties: { frozenRowCount: 1, rowCount: Math.max(1000, rows.length + 300) } } },
        { properties: { title: STAFFS } },
        { properties: { title: WARDS } }
      ]
    }).then(function (ss) {
      var sid = ss.spreadsheetId; url = ss.spreadsheetUrl || '';
      var ids = {};
      (ss.sheets || []).forEach(function (s) { ids[s.properties.title] = s.properties.sheetId; });
      var data = [
        { range: MAIN + '!A1:' + C.a1(MAIN_HEADERS.length, 1), values: [MAIN_HEADERS] },
        { range: WARDS + '!A1:A' + (wards.length + 1), values: [[WARDS_HEADER]].concat(wards.map(function (w) { return [w]; })) }
      ];
      if (staffs.length) data.push({ range: STAFFS + '!A1:A' + staffs.length, values: staffs.map(function (s) { return [s]; }) });
      if (rows.length) data.push({ range: MAIN + '!A2:' + C.a1(MAIN_HEADERS.length, rows.length + 1), values: rows });
      var reqs = [
        { repeatCell: { range: { sheetId: ids[MAIN], startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
        { repeatCell: { range: { sheetId: ids[WARDS], startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
        { setDataValidation: { range: { sheetId: ids[MAIN], startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
          rule: { condition: { type: 'ONE_OF_LIST', values: STATUS_VALUES.map(function (v) { return { userEnteredValue: v }; }) }, showCustomUi: true, strict: false } } }
      ];
      MAIN_HEADERS.forEach(function (h, i) {
        if (TEXT_HEADERS.indexOf(h) < 0) return;
        reqs.push({ repeatCell: { range: { sheetId: ids[MAIN], startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } });
      });
      return valuesBatchUpdate(sid, data).then(function () { return structBatch(sid, reqs); }).then(function () {
        var res = register(name, sid); res.url = url; return res;
      });
    }).catch(function (err) {
      var e2 = new Error(err.message + (url ? ' (สร้างไฟล์ไว้แล้วแต่ยังไม่พร้อมใช้: ' + url + ')' : ''));
      e2.code = err.code;
      throw e2;
    });
  }

  // opts: { name, wards, staffs } wards/staffs เป็นข้อความทีละบรรทัด หรือ array
  function createRotation(opts) {
    opts = opts || {};
    var name = String(opts.name || '').trim();
    if (!name) return Promise.reject(new Error('ตั้งชื่อ rotation ก่อน'));
    return buildRotation(name, C.normalizeWards(opts.wards), C.normalizeNames(opts.staffs, ''), []);
  }

  // ย้ายจาก sheet โครงเดิม (แท็บ "ค้าง ward" + "consult" + "Wards") ไปเป็น sheet ใหม่โครง Main/Staffs/Wards
  // อ่านอย่างเดียว ไม่แก้ sheet ต้นฉบับ opts: { url, name }  คืน rotationsResult + url + stats
  function importLegacy(opts) {
    opts = opts || {};
    var sid = C.extractSheetId(opts.url);
    if (!sid) return Promise.reject(new Error('ลิงก์หรือ ID ของ sheet ไม่ถูกต้อง'));
    return req('GET', BASE + '/' + sid + '?fields=' + rng('properties.title,sheets.properties.title')).then(function (ss) {
      var tabs = (ss.sheets || []).map(function (s) { return s.properties.title; });
      if (tabs.indexOf('ค้าง ward') < 0 && tabs.indexOf('consult') < 0) {
        throw new Error('ไม่พบแท็บ "ค้าง ward" หรือ "consult" ใน sheet นี้ (ถ้าเป็นโครงใหม่อยู่แล้ว ให้ใช้ "ผูก sheet ที่มีอยู่")');
      }
      var want = ['ค้าง ward', 'consult', WARDS].filter(function (t) { return tabs.indexOf(t) >= 0; });
      return batchGet(sid, want.map(function (t) { return "'" + t + "'!A1:Z"; })).then(function (vr) {
        var by = {};
        want.forEach(function (t, i) { by[t] = vr[i] || []; });
        var wardsList = firstCol(by[WARDS] || []).slice(1).filter(Boolean);
        var plan = C.migratePlan(by['ค้าง ward'], by.consult, wardsList);
        var name = String(opts.name || '').trim() || ((ss.properties && ss.properties.title) || 'Rotation') + ' (โครงใหม่)';
        return buildRotation(name, C.normalizeWards(wardsList), plan.staffs, plan.rows).then(function (res) {
          res.stats = plan.stats;
          return res;
        });
      });
    });
  }

  // ผูก sheet ที่มีอยู่ opts: { name, url } url = ลิงก์หรือ id
  function addRotation(opts) {
    opts = opts || {};
    var sid = C.extractSheetId(opts.url);
    if (!sid) return Promise.reject(new Error('ลิงก์หรือ ID ของ sheet ไม่ถูกต้อง'));
    var reg = regRead();
    var dup = reg.list.filter(function (r) { return r.sheetId === sid; })[0];
    if (dup) return Promise.reject(new Error('sheet นี้อยู่ในรายการแล้ว (' + dup.name + ')'));
    return req('GET', BASE + '/' + sid + '?fields=' + rng('properties.title,sheets.properties.title')).then(function (ss) {
      var tabs = (ss.sheets || []).map(function (s) { return s.properties.title; });
      if (tabs.indexOf(MAIN) < 0) throw new Error('sheet นี้ไม่มีแท็บ "' + MAIN + '" ไม่ใช่โครงที่แอปใช้');
      return register(String(opts.name || '').trim() || (ss.properties && ss.properties.title) || 'Rotation', sid);
    });
  }

  var fns = {
    loadAll: loadAll, savePatient: savePatient, addWard: addWard, addStaff: addStaff,
    getWardUsage: getWardUsage, renameWard: renameWard, deleteWard: deleteWard,
    getStaffUsage: getStaffUsage, renameStaff: renameStaff, deleteStaff: deleteStaff,
    getRotations: getRotations, switchRotation: switchRotation, archiveRotation: archiveRotation,
    createRotation: createRotation, addRotation: addRotation, importLegacy: importLegacy, renameRotation: renameRotation
  };
  // ทุกฟังก์ชันคืน Promise เสมอ (error ที่โยนทันทีกลายเป็น rejection)
  var out = {};
  Object.keys(fns).forEach(function (k) {
    out[k] = function () {
      try { return Promise.resolve(fns[k].apply(null, arguments)); } catch (e) { return Promise.reject(e); }
    };
  });
  return out;
});
