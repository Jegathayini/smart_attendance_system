/**
 * SMART SCHOOL ATTENDANCE MANAGEMENT SYSTEM
 * Fictional School
 *
 * Database: Google Sheets
 * Timezone: Asia/Colombo
 */

const APP_CACHE_TTL_SEC_ = 600;
const APP_SHORT_CACHE_TTL_SEC_ = 180;
const APP_CACHE_CHUNK_SIZE_ = 90000;

// ============================================
// 1. DATABASE CONNECTION
// ============================================

function getDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Database not found. Open Apps Script from the connected spreadsheet.');
  }
  return ss;
}

function getRequiredSheet(sheetName) {
  const sheet = getDatabase().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Missing sheet: ' + sheetName);
  }
  return sheet;
}

// ============================================
// 2. CACHE SERVICE HELPERS (WITH CHUNKING & VERSIONING)
// ============================================

function appCacheVersion_(domain) {
  try {
    const cache = CacheService.getScriptCache();
    const key = 'APP_VER_' + domain;
    let ver = cache.get(key);
    if (!ver) {
      ver = String(Date.now());
      cache.put(key, ver, 21600);
    }
    return ver;
  } catch (e) {
    return '0';
  }
}

function appBumpCacheVersion_(domain) {
  try {
    const cache = CacheService.getScriptCache();
    const ver = Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    cache.put('APP_VER_' + domain, ver, 21600);
  } catch (e) {}
}

function appCacheGet_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(key);
    if (!raw) return null;
    if (raw.charAt(0) === '{' && raw.indexOf('"__chunks":') >= 0) {
      const meta = JSON.parse(raw);
      if (meta && meta.__chunks) {
        const keys = [];
        for (let i = 0; i < meta.__chunks; i++) keys.push(key + '_c' + i);
        const parts = cache.getAll(keys);
        let joined = '';
        for (let i = 0; i < meta.__chunks; i++) {
          if (!parts[key + '_c' + i]) return null;
          joined += parts[key + '_c' + i];
        }
        return JSON.parse(joined);
      }
    }
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function appCachePut_(key, value, ttlSec) {
  try {
    const cache = CacheService.getScriptCache();
    const ttl = ttlSec || APP_CACHE_TTL_SEC_;
    const json = JSON.stringify(value);
    if (json.length <= APP_CACHE_CHUNK_SIZE_) {
      cache.put(key, json, ttl);
      return;
    }
    const count = Math.ceil(json.length / APP_CACHE_CHUNK_SIZE_);
    if (count > 10) return;
    const batch = {};
    batch[key] = JSON.stringify({ __chunks: count });
    for (let i = 0; i < count; i++) {
      batch[key + '_c' + i] = json.slice(i * APP_CACHE_CHUNK_SIZE_, (i + 1) * APP_CACHE_CHUNK_SIZE_);
    }
    cache.putAll(batch, ttl);
  } catch (e) {}
}

function appCacheRemove_(key) {
  try {
    CacheService.getScriptCache().remove(key);
  } catch (e) {}
}

// ============================================
// 3. CACHED SEMI-STATIC SHEET READERS (COLUMN-INDEXED)
// ============================================

function getClassesCached_() {
  const key = 'CLS_ALL_' + appCacheVersion_('CLS');
  const cached = appCacheGet_(key);
  if (cached) return cached;

  const sheet = getRequiredSheet('Classes');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    appCachePut_(key, [], APP_CACHE_TTL_SEC_);
    return [];
  }
  const h = values[0].map(v => String(v).trim());
  const gIdx = h.indexOf('Grade');
  const sIdx = h.indexOf('Section');
  const nIdx = h.indexOf('Class_Name');
  const aIdx = h.indexOf('Active');
  const yIdx = h.indexOf('Academic_Year');
  if (gIdx < 0 || sIdx < 0) throw new Error('Classes sheet missing Grade or Section column.');

  const list = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[gIdx] === '' && r[sIdx] === '') continue;
    const grade = Number(r[gIdx]);
    const section = String(r[sIdx] || '').trim().toUpperCase();
    if (!Number.isInteger(grade) || !section) continue;
    const className = String((nIdx >= 0 && r[nIdx]) ? r[nIdx] : (grade + section)).trim().toUpperCase();
    list.push({
      grade,
      section,
      className,
      active: aIdx >= 0 ? attActive_(r[aIdx]) : true,
      academicYear: yIdx >= 0 ? String(r[yIdx] || '') : ''
    });
  }
  appCachePut_(key, list, APP_CACHE_TTL_SEC_);
  return list;
}

function getStudentsCached_() {
  const key = 'STU_ALL_' + appCacheVersion_('STU');
  const cached = appCacheGet_(key);
  if (cached) return cached;

  const sheet = getRequiredSheet('Students');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    appCachePut_(key, [], APP_CACHE_TTL_SEC_);
    return [];
  }
  const h = values[0].map(v => String(v).trim());
  const ix = {
    Student_ID: h.indexOf('Student_ID'),
    Admission_No: h.indexOf('Admission_No'),
    Name: h.indexOf('Name'),
    Student_Name: h.indexOf('Student_Name'),
    Grade: h.indexOf('Grade'),
    Section: h.indexOf('Section'),
    Class_ID: h.indexOf('Class_ID'),
    Roll_No: h.indexOf('Roll_No'),
    Gender: h.indexOf('Gender'),
    Active: h.indexOf('Active'),
    Admission_Date: h.indexOf('Admission_Date'),
    Leaving_Date: h.indexOf('Leaving_Date')
  };
  if (ix.Student_ID < 0 || ix.Grade < 0) throw new Error('Students sheet missing required columns.');

  const list = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const id = String(r[ix.Student_ID] || '').trim();
    if (!id) continue;
    const grade = Number(r[ix.Grade]);
    const section = ix.Section >= 0 ? String(r[ix.Section] || '').trim().toUpperCase() : '';
    const rawCls = ix.Class_ID >= 0 ? r[ix.Class_ID] : (grade + section);
    const name = String(
      (ix.Student_Name >= 0 && r[ix.Student_Name]) ||
      (ix.Name >= 0 && r[ix.Name]) ||
      ''
    );
    list.push({
      id,
      admission: ix.Admission_No >= 0 ? String(r[ix.Admission_No] || '') : '',
      name,
      grade,
      section,
      classId: normalizeClassId(rawCls),
      roll: ix.Roll_No >= 0 ? (r[ix.Roll_No] || '') : '',
      gender: ix.Gender >= 0 ? String(r[ix.Gender] || '') : '',
      active: ix.Active >= 0 ? attActive_(r[ix.Active]) : true,
      admitted: ix.Admission_Date >= 0 ? attDate_(r[ix.Admission_Date]) : '',
      left: ix.Leaving_Date >= 0 ? attDate_(r[ix.Leaving_Date]) : ''
    });
  }
  appCachePut_(key, list, APP_CACHE_TTL_SEC_);
  return list;
}

function getCalendarCached_() {
  const key = 'CAL_ALL_' + appCacheVersion_('CAL');
  const cached = appCacheGet_(key);
  if (cached) return cached;

  const sheet = getRequiredSheet('School_Calendar');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    appCachePut_(key, [], APP_CACHE_TTL_SEC_);
    return [];
  }
  const h = values[0].map(v => String(v).trim());
  const dIdx = h.indexOf('Date') >= 0 ? h.indexOf('Date') : h.indexOf('Calendar_Date');
  const tIdx = h.indexOf('Day_Type') >= 0 ? h.indexOf('Day_Type') : (h.indexOf('Type') >= 0 ? h.indexOf('Type') : h.indexOf('Status'));
  const descIdx = h.indexOf('Description');
  const sdIdx = h.indexOf('Is_School_Day');

  const list = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const date = dIdx >= 0 ? attDate_(r[dIdx]) : '';
    if (!date) continue;
    list.push({
      date,
      type: tIdx >= 0 ? String(r[tIdx] || '').toUpperCase() : '',
      description: descIdx >= 0 ? String(r[descIdx] || '') : '',
      schoolDay: sdIdx >= 0 ? String(r[sdIdx] == null ? '' : r[sdIdx]).toUpperCase() : ''
    });
  }
  appCachePut_(key, list, APP_CACHE_TTL_SEC_);
  return list;
}

function getTermsCached_() {
  const key = 'TERM_ALL_' + appCacheVersion_('TERM');
  const cached = appCacheGet_(key);
  if (cached) return cached;

  const sheet = getRequiredSheet('Academic_Terms');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    appCachePut_(key, [], APP_CACHE_TTL_SEC_);
    return [];
  }
  const h = values[0].map(v => String(v).trim());
  const yIdx = h.indexOf('Academic_Year');
  const tIdx = h.indexOf('Term');
  const sIdx = h.indexOf('Start_Date');
  const eIdx = h.indexOf('End_Date');

  const list = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const year = yIdx >= 0 ? Number(r[yIdx]) : 0;
    const term = tIdx >= 0 ? String(r[tIdx] || '').trim() : '';
    const start = sIdx >= 0 ? attDate_(r[sIdx]) : '';
    const end = eIdx >= 0 ? attDate_(r[eIdx]) : '';
    if (!year || !term || !start || !end) continue;
    list.push({ year, term, start, end });
  }
  appCachePut_(key, list, APP_CACHE_TTL_SEC_);
  return list;
}

// ============================================
// 4. INTERNAL VALIDATION HELPERS (TRAILING _ LOCKED)
// ============================================

function testDatabaseConnection_() {
  const ss = getDatabase();
  Logger.log('Database connection successful! Connected to: ' + ss.getName());
}

function validateDatabaseSheets_() {
  const requiredSheets = [
    'Students', 'Attendance', 'Staff_Access', 'Classes',
    'School_Calendar', 'Academic_Terms', 'Audit_Log', 'Settings'
  ];
  const ss = getDatabase();
  const missing = requiredSheets.filter(name => !ss.getSheetByName(name));
  if (missing.length > 0) {
    throw new Error('Missing database sheets: ' + missing.join(', '));
  }
}

function readSheetRecords_(sheetName) {
  const sheet = getRequiredSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { headers: [], records: [] };
  const headers = values[0].map(value => String(value).trim());
  const records = values.slice(1)
    .filter(row => row.some(value => value !== '' && value !== null))
    .map((row, index) => {
      const record = { _rowNumber: index + 2 };
      headers.forEach((header, columnIndex) => { record[header] = row[columnIndex]; });
      return record;
    });
  return { headers, records };
}

function normalizeClassId(classId) {
  const value = String(classId || '').trim().toUpperCase();
  const classCode = value.match(/^CLS0*(\d+)$/);
  if (classCode) return Number(classCode[1]) + 'A';
  const gradeSection = value.match(/^0*(\d+)([A-Z][A-Z0-9]*)$/);
  if (gradeSection) return Number(gradeSection[1]) + gradeSection[2];
  return value;
}

function validateStudentData_() {
  const students = getStudentsCached_();
  const classes = getClassesCached_();
  const validClassIds = new Set(classes.map(c => normalizeClassId(c.grade + c.section)));
  const errors = [];
  const studentIds = new Set();
  students.forEach(s => {
    if (studentIds.has(s.id)) errors.push('Duplicate Student_ID: ' + s.id);
    studentIds.add(s.id);
    if (!validClassIds.has(s.classId)) errors.push('Invalid class for ' + s.id + ': ' + s.classId);
  });
  if (errors.length) throw new Error('Student validation failed: ' + errors.join('; '));
}

function runDatabaseTests_(token) {
  authRequire_(token, 'ADMIN');
  testDatabaseConnection_();
  validateDatabaseSheets_();
  validateStudentData_();
  return { success: true };
}

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Smart School Attendance System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============================================
// 5. FAST BOOTSTRAP & ATTENDANCE ENDPOINTS
// ============================================

function getAppBootstrap(token, year) {
  const user = authRequire_(token, 'SESSION');
  if (user.mustChangePassword) {
    return { user, mustChangePassword: true };
  }

  const today = attToday_();
  const targetYear = Number(year) || Number(today.slice(0, 4));
  const schoolDayInfo = attGetSchoolDayInfo_(today);
  const classes = getClassesCached_().filter(c => c.active);

  const classesByGrade = {};
  classes.forEach(c => {
    const g = String(c.grade);
    if (!classesByGrade[g]) classesByGrade[g] = [];
    classesByGrade[g].push({
      grade: c.grade,
      section: c.section,
      className: c.className
    });
  });
  Object.keys(classesByGrade).forEach(g => {
    classesByGrade[g].sort((a, b) => a.section.localeCompare(b.section));
  });

  const submittedClassesToday = attTodaySubmittedClasses_(today);
  let initialData = null;

  if (user.role === 'ADMIN') {
    initialData = getAttendanceDashboard(token, targetYear);
  } else {
    initialData = getTeacherAttendanceSummary(token);
  }

  return {
    user,
    mustChangePassword: false,
    today,
    schoolDayInfo,
    classesByGrade,
    submittedClassesToday,
    initialData
  };
}

function getAttendanceClasses(token, grade) {
  authRequire_(token, 'SESSION');
  const selectedGrade = Number(grade);
  if (!Number.isInteger(selectedGrade) || selectedGrade < 1 || selectedGrade > 13) {
    throw new Error('Invalid grade.');
  }
  return getClassesCached_()
    .filter(c => c.grade === selectedGrade && c.active)
    .map(c => ({
      grade: selectedGrade,
      section: c.section,
      className: c.className
    }))
    .sort((a, b) => a.section.localeCompare(b.section));
}

function getAttendanceStudents(token, grade, section) {
  authRequire_(token, 'SESSION');
  const cls = attClass_(grade, section);
  const activeClass = getClassesCached_().some(
    c => c.grade === cls.grade && c.section === cls.section && c.active
  );
  if (!activeClass) throw new Error('Selected class is not active.');

  const today = attToday_();
  return getStudentsCached_()
    .filter(s =>
      s.grade === cls.grade &&
      s.section === cls.section &&
      s.classId === cls.name &&
      attEligibleObj_(s, today)
    )
    .map(s => ({
      studentId: s.id,
      name: s.name,
      rollNo: s.roll,
      gender: s.gender
    }))
    .sort((a, b) => Number(a.rollNo) - Number(b.rollNo));
}

/** Combined single-RPC loader for Daily Attendance (Roster + Today's Status). */
function getClassAttendanceSheet(token, grade, section) {
  authRequire_(token);
  const cls = attClass_(grade, section);
  const activeClass = getClassesCached_().some(
    c => c.grade === cls.grade && c.section === cls.section && c.active
  );
  if (!activeClass) throw new Error('Selected class is not active.');

  const date = attToday_();
  const roster = getStudentsCached_()
    .filter(s =>
      s.grade === cls.grade &&
      s.section === cls.section &&
      s.classId === cls.name &&
      attEligibleObj_(s, date)
    )
    .map(s => ({
      studentId: s.id,
      name: s.name,
      rollNo: s.roll,
      gender: s.gender
    }))
    .sort((a, b) => Number(a.rollNo) - Number(b.rollNo));

  const rows = attExisting_(date, cls);
  let present = 0, absent = 0, late = 0;
  const entries = rows.map(r => {
    if (r.status === 'PRESENT') present++;
    else if (r.status === 'ABSENT') absent++;
    else if (r.status === 'LATE') late++;
    return { studentId: r.studentId, status: r.status };
  });

  return {
    date,
    className: cls.name,
    roster,
    submitted: rows.length > 0,
    count: rows.length,
    entries,
    counts: { PRESENT: present, ABSENT: absent, LATE: late },
    schoolDayInfo: attGetSchoolDayInfo_(date)
  };
}