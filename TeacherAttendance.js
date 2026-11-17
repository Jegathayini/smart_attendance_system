/**
 * Teacher self-attendance, configurable leave policies, and admin corrections.
 * Uses CacheService + column-indexed single-pass scans.
 */

const TA_SHEET_ = 'TeacherAttendance';
const TA_HEADERS_ = [
  'Timestamp', 'Teacher ID', 'Teacher Name', 'Status', 'Leave Type', 'Reason Category'
];
const TA_POLICY_SHEET_ = 'Teacher_Leave_Policies';
const TA_POLICY_HEADERS_ = [
  'Policy_ID', 'Period_Type', 'Custom_Start', 'Custom_End',
  'Absence_Limit', 'Short_Leave_Limit', 'Short_Leave_Counting',
  'Warning_Percent', 'Exceed_Action', 'Half_Day_Absence_Units',
  'Active', 'Updated_By', 'Updated_At'
];
const TA_POLICY_CACHE_KEY_ = 'TA_ACTIVE_POLICY_V1';
const TA_POLICY_CACHE_TTL_ = 300;

function taEnsureSheet_(name, headers) {
  const ss = getDatabase();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  headers.forEach(h => {
    if (existing.indexOf(h) < 0) {
      throw new Error(name + ' is missing the required column: ' + h + '. Please do not rename existing columns.');
    }
  });
  return sheet;
}

function taDateString_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Colombo', 'yyyy-MM-dd');
  }
  const str = String(value == null ? '' : value).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Colombo', 'yyyy-MM-dd');
}

function taToday_() {
  return Utilities.formatDate(new Date(), 'Asia/Colombo', 'yyyy-MM-dd');
}

function taIsoValid_(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00+05:30');
  return !isNaN(d.getTime()) && Utilities.formatDate(d, 'Asia/Colombo', 'yyyy-MM-dd') === s;
}

function taRowsCached_() {
  const key = 'TA_ROWS_' + appCacheVersion_('TA');
  const cached = appCacheGet_(key);
  if (cached) return cached;

  const sheet = taEnsureSheet_(TA_SHEET_, TA_HEADERS_);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    appCachePut_(key, [], APP_SHORT_CACHE_TTL_SEC_);
    return [];
  }
  const h = values[0].map(String);
  const tsIdx = h.indexOf('Timestamp');
  const idIdx = h.indexOf('Teacher ID');
  const nameIdx = h.indexOf('Teacher Name');
  const stIdx = h.indexOf('Status');
  const ltIdx = h.indexOf('Leave Type');
  const rcIdx = h.indexOf('Reason Category');

  const list = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[tsIdx] === '' || r[tsIdx] === null || r[tsIdx] === undefined) continue;
    const ts = r[tsIdx];
    const date = taDateString_(ts);
    const ms = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
    const submittedAt = ts instanceof Date
      ? Utilities.formatDate(ts, 'Asia/Colombo', 'hh:mm a')
      : '';
    list.push({
      rowNumber: i + 1,
      date,
      teacherId: String(r[idIdx] || '').trim(),
      teacherName: String(r[nameIdx] || ''),
      status: String(r[stIdx] || '').trim().toUpperCase(),
      leaveType: String(r[ltIdx] || ''),
      reasonCategory: String(r[rcIdx] || '').trim().toUpperCase(),
      timestampMs: isNaN(ms) ? 0 : ms,
      submittedAt
    });
  }
  appCachePut_(key, list, APP_SHORT_CACHE_TTL_SEC_);
  return list;
}

function taPolicySheet_() {
  const sheet = taEnsureSheet_(TA_POLICY_SHEET_, TA_POLICY_HEADERS_);
  if (sheet.getLastRow() < 2) {
    sheet.appendRow([
      'DEFAULT', 'MONTHLY', '', '', '', '', 'OCCURRENCES',
      75, 'WARN', 0.5, true, 'SYSTEM', new Date()
    ]);
  }
  return sheet;
}

function taActivePolicy_() {
  const cached = appCacheGet_(TA_POLICY_CACHE_KEY_);
  if (cached) return cached;

  const sheet = taPolicySheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('No active teacher leave policy is configured.');
  const h = values[0].map(String);
  const idx = name => h.indexOf(name);
  const aIdx = idx('Active');

  let found = null;
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[idx('Policy_ID')]) continue;
    if (r[aIdx] === true || String(r[aIdx]).toLowerCase() === 'true') {
      found = {
        Policy_ID: String(r[idx('Policy_ID')]),
        Period_Type: String(r[idx('Period_Type')] || 'MONTHLY'),
        Custom_Start: taDateString_(r[idx('Custom_Start')]),
        Custom_End: taDateString_(r[idx('Custom_End')]),
        Absence_Limit: r[idx('Absence_Limit')],
        Short_Leave_Limit: r[idx('Short_Leave_Limit')],
        Short_Leave_Counting: String(r[idx('Short_Leave_Counting')] || 'OCCURRENCES'),
        Warning_Percent: r[idx('Warning_Percent')],
        Exceed_Action: String(r[idx('Exceed_Action')] || 'WARN'),
        Half_Day_Absence_Units: r[idx('Half_Day_Absence_Units')]
      };
    }
  }
  if (!found) {
    throw new Error('No active teacher leave policy is configured. Ask an administrator to activate a policy.');
  }
  appCachePut_(TA_POLICY_CACHE_KEY_, found, TA_POLICY_CACHE_TTL_);
  return found;
}

function taPolicyWindow_(policy, today) {
  const type = String(policy.Period_Type || 'MONTHLY').toUpperCase();
  if (type === 'MONTHLY') {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const lastDay = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0');
    return {
      start: today.slice(0, 8) + '01',
      end: today.slice(0, 7) + '-' + lastDay,
      label: today.slice(0, 7)
    };
  }
  if (type === 'YEARLY') {
    return { start: today.slice(0, 4) + '-01-01', end: today.slice(0, 4) + '-12-31', label: today.slice(0, 4) };
  }
  if (type === 'CUSTOM') {
    const start = taDateString_(policy.Custom_Start);
    const end = taDateString_(policy.Custom_End);
    if (!start || !end || start > end) throw new Error('The active custom leave-policy date range is invalid.');
    return { start, end, label: start + ' to ' + end };
  }
  if (type === 'TERM') {
    const match = getTermsCached_().find(t => t.start <= today && today <= t.end);
    if (!match) {
      throw new Error('No academic term covers today. Update Academic Terms or choose another leave-policy period.');
    }
    return { start: match.start, end: match.end, label: match.year + ' ' + match.term };
  }
  throw new Error('Unsupported leave-policy period.');
}

function taTeacherScan_(teacherId, window, today) {
  const tid = String(teacherId);
  const periodRecords = [];
  let todaySubmitted = false;
  taRowsCached_().forEach(r => {
    if (r.teacherId !== tid) return;
    if (r.date === today) todaySubmitted = true;
    if (r.date >= window.start && r.date <= window.end) {
      periodRecords.push({
        date: r.date,
        status: r.status,
        leaveType: r.leaveType,
        reasonCategory: r.reasonCategory
      });
    }
  });
  return { periodRecords, todaySubmitted };
}

function taCounts_(records, policy) {
  const personal = records.filter(r => r.reasonCategory === 'PERSONAL');
  const absences = personal.filter(r => r.status === 'ABSENT').length;
  const halfDays = personal.filter(r => r.status === 'HALF DAY').length;
  const shortRows = personal.filter(r => r.status === 'SHORT LEAVE');
  const shortOccurrences = shortRows.length;
  const shortPeriods = shortRows.reduce((sum, r) => {
    const match = String(r.leaveType || '').match(/^PERIODS:([0-9,]+)$/);
    return sum + (match ? match[1].split(',').filter(Boolean).length : 0);
  }, 0);
  const shortCount = String(policy.Short_Leave_Counting || 'OCCURRENCES').toUpperCase() === 'PERIODS'
    ? shortPeriods : shortOccurrences;
  const halfFactor = Number(policy.Half_Day_Absence_Units);
  return {
    absenceCount: absences,
    halfDayCount: halfDays,
    absenceUnits: absences + halfDays * (isFinite(halfFactor) && halfFactor >= 0 ? halfFactor : 0.5),
    shortLeaveOccurrences: shortOccurrences,
    shortLeavePeriods: shortPeriods,
    shortLeaveCount: shortCount,
    personalLeaveRecords: personal.length,
    officialLeaveRecords: records.filter(r => r.reasonCategory === 'OFFICIAL').length
  };
}

function taLimitNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!isFinite(n) || n < 0) throw new Error('Leave limits must be zero or a positive number.');
  return n;
}

function taValidateSubmissionPayload_(data) {
  if (!data || typeof data !== 'object') throw new Error('Attendance details are required.');
  const status = String(data.status || '').trim().toUpperCase();
  if (['PRESENT', 'ABSENT', 'HALF DAY', 'SHORT LEAVE'].indexOf(status) < 0) {
    throw new Error('Select a valid attendance status.');
  }
  let leaveType = '';
  let reason = '';
  if (status === 'HALF DAY') {
    const half = String(data.halfDay || '').trim().toUpperCase();
    if (!['FIRST HALF', 'SECOND HALF'].includes(half)) throw new Error('Select 1st Half or 2nd Half.');
    leaveType = half;
  } else if (status === 'SHORT LEAVE') {
    const periods = Array.isArray(data.periods) ? [...new Set(data.periods.map(Number))].sort((a, b) => a - b) : [];
    if (!periods.length || periods.some(p => !Number.isInteger(p) || p < 1 || p > 8)) {
      throw new Error('Select one or more valid periods (1–8).');
    }
    leaveType = 'PERIODS:' + periods.join(',');
  } else if (status === 'ABSENT') {
    leaveType = 'FULL_DAY';
  }
  if (status !== 'PRESENT') {
    reason = String(data.reasonCategory || '').trim().toUpperCase();
    if (!['PERSONAL', 'OFFICIAL'].includes(reason)) {
      throw new Error('Select Personal or Official as the reason category.');
    }
  }
  return { status, leaveType, reason };
}

/** Called by a teacher to submit their own attendance for today. */
function recordTeacherAttendance(token, data) {
  const user = authRequire_(token, 'SESSION');
  if (user.role !== 'TEACHER') throw new Error('Only teacher accounts can submit teacher attendance.');
  const payload = taValidateSubmissionPayload_(data);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The system is busy. Please try again.');
  try {
    const sheet = taEnsureSheet_(TA_SHEET_, TA_HEADERS_);
    appBumpCacheVersion_('TA');
    const today = taToday_();
    const policy = taActivePolicy_();
    const window = taPolicyWindow_(policy, today);
    const scan = taTeacherScan_(user.staffId, window, today);

    if (scan.todaySubmitted) {
      throw new Error('You have already submitted your attendance for today. Contact an administrator if a correction is needed.');
    }

    const counts = taCounts_(scan.periodRecords, policy);
    const action = String(policy.Exceed_Action || 'WARN').toUpperCase();
    const absenceLimit = taLimitNumber_(policy.Absence_Limit);
    const shortLimit = taLimitNumber_(policy.Short_Leave_Limit);
    const halfFactor = Number(policy.Half_Day_Absence_Units || 0.5);
    const absenceIncrease = payload.reason === 'PERSONAL'
      ? (payload.status === 'ABSENT' ? 1 : payload.status === 'HALF DAY' ? halfFactor : 0) : 0;
    const shortIncrease = payload.reason === 'PERSONAL' && payload.status === 'SHORT LEAVE'
      ? (String(policy.Short_Leave_Counting || 'OCCURRENCES').toUpperCase() === 'PERIODS'
          ? payload.leaveType.slice(8).split(',').length : 1)
      : 0;
    const nextAbsence = counts.absenceUnits + absenceIncrease;
    const nextShort = counts.shortLeaveCount + shortIncrease;
    const violations = [];
    if (absenceLimit !== null && nextAbsence > absenceLimit) {
      violations.push('Personal absence allowance would be exceeded (' + nextAbsence + ' / ' + absenceLimit + ').');
    }
    if (shortLimit !== null && nextShort > shortLimit) {
      violations.push('Personal short-leave allowance would be exceeded (' + nextShort + ' / ' + shortLimit + ').');
    }
    if (violations.length && action === 'BLOCK') throw new Error(violations.join(' '));

    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, TA_HEADERS_.length).setValues([[
      new Date(), String(user.staffId), String(user.name),
      payload.status, payload.leaveType, payload.reason
    ]]);
    try {
      ctAudit_(user, 'TEACHER_ATTENDANCE_SUBMITTED', today + ' | ' + payload.status + ' | ' + (payload.leaveType || '-') + ' | ' + (payload.reason || '-'));
    } catch (auditError) {
      sheet.deleteRow(row);
      appBumpCacheVersion_('TA');
      throw new Error('Attendance could not be saved because the audit entry failed. Please try again.');
    }

    appBumpCacheVersion_('TA');
    const warningPercent = Number(policy.Warning_Percent || 75);
    const warnings = violations.slice();
    if (absenceLimit !== null && absenceLimit > 0 && nextAbsence >= absenceLimit * warningPercent / 100 && nextAbsence <= absenceLimit) {
      warnings.push('You are approaching your personal absence limit.');
    }
    if (shortLimit !== null && shortLimit > 0 && nextShort >= shortLimit * warningPercent / 100 && nextShort <= shortLimit) {
      warnings.push('You are approaching your personal short-leave limit.');
    }
    return { success: true, message: 'Your attendance has been submitted.', warnings, periodLabel: window.label };
  } finally {
    lock.releaseLock();
  }
}

/** Count school working days in a policy window, applying cached calendar overrides. */
function taWorkingDays_(start, end) {
  const byDate = new Map();
  getCalendarCached_().forEach(row => {
    if (row.date) byDate.set(row.date, row);
  });
  let count = 0;
  const cursor = new Date(start + 'T12:00:00Z');
  const finish = new Date(end + 'T12:00:00Z');
  while (cursor <= finish) {
    const date = cursor.toISOString().slice(0, 10);
    const day = cursor.getUTCDay();
    const entry = byDate.get(date);
    let isWorkingDay = day !== 0 && day !== 6;
    if (entry) {
      if (['HOLIDAY', 'CLOSED', 'CLOSURE', 'NON_SCHOOL_DAY'].includes(entry.type) ||
          ['FALSE', 'NO', '0'].includes(entry.schoolDay)) isWorkingDay = false;
      else if (entry.type === 'SCHOOL_DAY' || ['TRUE', 'YES', '1'].includes(entry.schoolDay)) isWorkingDay = true;
    }
    if (isWorkingDay) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function taBuildSummary_(teacherId, teacherName) {
  const policy = taActivePolicy_();
  const today = taToday_();
  const window = taPolicyWindow_(policy, today);
  const scan = taTeacherScan_(teacherId, window, today);
  const records = scan.periodRecords;
  const counts = taCounts_(records, policy);
  const absenceLimit = taLimitNumber_(policy.Absence_Limit);
  const shortLimit = taLimitNumber_(policy.Short_Leave_Limit);
  const workingEnd = window.end < today ? window.end : today;

  return {
    teacherId: String(teacherId),
    teacherName: String(teacherName),
    periodType: String(policy.Period_Type),
    periodLabel: window.label,
    startDate: window.start,
    endDate: window.end,
    absenceLimit,
    shortLeaveLimit: shortLimit,
    shortLeaveCounting: String(policy.Short_Leave_Counting || 'OCCURRENCES'),
    warningPercent: Number(policy.Warning_Percent || 75),
    counts,
    totalWorkingDays: workingEnd >= window.start ? taWorkingDays_(window.start, workingEnd) : 0,
    presentDays: records.filter(r => r.status === 'PRESENT').length,
    leavesTaken: records.filter(r => ['ABSENT', 'HALF DAY', 'SHORT LEAVE'].includes(r.status)).length,
    personalDeductions: counts.absenceUnits,
    absenceRemaining: absenceLimit === null ? null : Math.max(0, absenceLimit - counts.absenceUnits),
    shortLeaveRemaining: shortLimit === null ? null : Math.max(0, shortLimit - counts.shortLeaveCount),
    todaySubmitted: scan.todaySubmitted,
    records: records.slice().sort((a, b) => b.date.localeCompare(a.date))
  };
}

/** Teacher receives only their own summary. */
function getTeacherAttendanceSummary(token) {
  const user = authRequire_(token, 'SESSION');
  if (user.role !== 'TEACHER') throw new Error('Teacher access required.');
  return taBuildSummary_(user.staffId, user.name);
}

/** Admin-only: list all non-archived teachers for selection/summaries. */
function adminListTeachersForAttendance(token) {
  authRequire_(token, 'ADMIN');
  const allProps = PropertiesService.getScriptProperties().getProperties();
  return authStaffCached_()
    .filter(s => s.role === 'TEACHER' && !allProps['AUTH_ARCHIVED_' + authDigest_(s.staffId)])
    .map(s => ({
      staffId: s.staffId,
      name: s.name,
      username: s.username,
      active: s.active
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Admin-only: inspect any teacher's summary and recent records. */
function adminGetTeacherSummary(token, teacherId) {
  authRequire_(token, 'ADMIN');
  const tid = String(teacherId || '').trim();
  if (!tid) throw new Error('Select a teacher.');
  const staff = authStaffCached_().find(s => s.staffId === tid && s.role === 'TEACHER');
  if (!staff) throw new Error('Teacher account not found.');
  return taBuildSummary_(staff.staffId, staff.name);
}

/** Admin-only: edit/correct a teacher's daily attendance record with audit log and rollback. */
function adminCorrectTeacherAttendance(token, teacherId, date, data, reason) {
  const admin = authRequire_(token, 'ADMIN');
  const tid = String(teacherId || '').trim();
  const targetDate = String(date || '').trim();
  const why = String(reason || '').trim();
  if (!tid) throw new Error('Teacher ID is required.');
  if (!taIsoValid_(targetDate) || targetDate > taToday_()) {
    throw new Error('Select a valid date not in the future.');
  }
  if (why.length < 5 || why.length > 500) {
    throw new Error('Correction reason must be 5–500 characters.');
  }
  const payload = taValidateSubmissionPayload_(data);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The system is busy. Please try again.');
  try {
    const sheet = taEnsureSheet_(TA_SHEET_, TA_HEADERS_);
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) throw new Error('No teacher attendance records found.');

    const headers = values[0].map(String);
    const tsIdx = headers.indexOf('Timestamp');
    const idIdx = headers.indexOf('Teacher ID');
    const stIdx = headers.indexOf('Status');
    const ltIdx = headers.indexOf('Leave Type');
    const rcIdx = headers.indexOf('Reason Category');

    const matches = [];
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idIdx]).trim() === tid && taDateString_(values[i][tsIdx]) === targetDate) {
        matches.push(i + 1);
      }
    }
    if (matches.length !== 1) {
      throw new Error('Expected exactly one attendance record for this teacher on ' + targetDate + '.');
    }

    const rowNum = matches[0];
    const prevRow = values[rowNum - 1].slice();
    const oldSummary = String(prevRow[stIdx]) + ' / ' + String(prevRow[ltIdx] || '-') + ' / ' + String(prevRow[rcIdx] || '-');
    const newSummary = payload.status + ' / ' + (payload.leaveType || '-') + ' / ' + (payload.reason || '-');
    if (oldSummary === newSummary) {
      throw new Error('New attendance details must differ from the current record.');
    }

    sheet.getRange(rowNum, stIdx + 1).setValue(payload.status);
    sheet.getRange(rowNum, ltIdx + 1).setValue(payload.leaveType);
    sheet.getRange(rowNum, rcIdx + 1).setValue(payload.reason);

    try {
      ctAudit_(admin, 'TEACHER_ATTENDANCE_CORRECTED',
        tid + ' | ' + targetDate + ' | ' + oldSummary + ' -> ' + newSummary + ' | Reason: ' + why);
    } catch (e) {
      sheet.getRange(rowNum, stIdx + 1).setValue(prevRow[stIdx]);
      sheet.getRange(rowNum, ltIdx + 1).setValue(prevRow[ltIdx]);
      sheet.getRange(rowNum, rcIdx + 1).setValue(prevRow[rcIdx]);
      throw e;
    }

    appBumpCacheVersion_('TA');
    return { success: true, message: 'Teacher attendance corrected for ' + targetDate + '.' };
  } finally {
    lock.releaseLock();
  }
}

/** Admin-only: read active policy configuration. */
function adminGetTeacherLeavePolicy(token) {
  authRequire_(token, 'ADMIN');
  const p = taActivePolicy_();
  return {
    periodType: String(p.Period_Type || 'MONTHLY'),
    customStart: taDateString_(p.Custom_Start),
    customEnd: taDateString_(p.Custom_End),
    absenceLimit: p.Absence_Limit === '' ? '' : Number(p.Absence_Limit),
    shortLeaveLimit: p.Short_Leave_Limit === '' ? '' : Number(p.Short_Leave_Limit),
    shortLeaveCounting: String(p.Short_Leave_Counting || 'OCCURRENCES'),
    warningPercent: Number(p.Warning_Percent || 75),
    exceedAction: String(p.Exceed_Action || 'WARN'),
    halfDayAbsenceUnits: Number(p.Half_Day_Absence_Units || 0.5)
  };
}

/** Admin-only: update active policy. */
function adminSaveTeacherLeavePolicy(token, data) {
  const user = authRequire_(token, 'ADMIN');
  if (!data || typeof data !== 'object') throw new Error('Policy settings are required.');
  const period = String(data.periodType || '').toUpperCase();
  if (!['MONTHLY', 'TERM', 'YEARLY', 'CUSTOM'].includes(period)) throw new Error('Select a valid policy period.');
  const absenceLimit = taLimitNumber_(data.absenceLimit);
  const shortLimit = taLimitNumber_(data.shortLeaveLimit);
  const counting = String(data.shortLeaveCounting || '').toUpperCase();
  if (!['OCCURRENCES', 'PERIODS'].includes(counting)) throw new Error('Select how short leaves should be counted.');
  const warning = Number(data.warningPercent);
  if (!Number.isFinite(warning) || warning < 1 || warning > 100) throw new Error('Warning threshold must be between 1 and 100.');
  const action = String(data.exceedAction || '').toUpperCase();
  if (!['WARN', 'BLOCK'].includes(action)) throw new Error('Select Warn or Block.');
  const halfUnits = Number(data.halfDayAbsenceUnits);
  if (!Number.isFinite(halfUnits) || halfUnits < 0 || halfUnits > 1) throw new Error('Half-day absence units must be between 0 and 1.');
  let customStart = '', customEnd = '';
  if (period === 'CUSTOM') {
    customStart = String(data.customStart || '');
    customEnd = String(data.customEnd || '');
    if (!taIsoValid_(customStart) || !taIsoValid_(customEnd) || customStart > customEnd) {
      throw new Error('Enter a valid custom start and end date.');
    }
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The system is busy. Please try again.');
  try {
    const sheet = taPolicySheet_();
    const vals = sheet.getDataRange().getValues();
    const idIdx = vals[0].map(String).indexOf('Policy_ID');
    let rowNum = -1;
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][idIdx]) === 'DEFAULT') { rowNum = i + 1; break; }
    }
    const values = [
      'DEFAULT', period, customStart, customEnd,
      absenceLimit === null ? '' : absenceLimit,
      shortLimit === null ? '' : shortLimit,
      counting, warning, action, halfUnits, true,
      String(user.username || user.name), new Date()
    ];
    if (rowNum > 0) sheet.getRange(rowNum, 1, 1, TA_POLICY_HEADERS_.length).setValues([values]);
    else sheet.appendRow(values);
    ctAudit_(user, 'TEACHER_LEAVE_POLICY_UPDATED', JSON.stringify({
      periodType: period, absenceLimit, shortLimit, counting, warning, action, halfUnits, customStart, customEnd
    }));
    appCacheRemove_(TA_POLICY_CACHE_KEY_);
    return { success: true, message: 'Teacher leave policy saved.' };
  } finally {
    lock.releaseLock();
  }
}

/** Admin-only: retrieve teacher attendance for a selected date or all dates (cached). */
function adminGetTeacherDailyAttendance(token, filterDate) {
  authRequire_(token, 'ADMIN');
  const today = taToday_();
  const selectedDate = String(filterDate || today).trim();
  if (selectedDate !== 'ALL' && !taIsoValid_(selectedDate)) {
    throw new Error('Invalid attendance date.');
  }

  const records = taRowsCached_()
    .filter(r => selectedDate === 'ALL' || r.date === selectedDate)
    .slice()
    .sort((a, b) => b.timestampMs - a.timestampMs || a.teacherName.localeCompare(b.teacherName));

  return {
    date: selectedDate,
    totalSubmitted: records.length,
    records
  };
}