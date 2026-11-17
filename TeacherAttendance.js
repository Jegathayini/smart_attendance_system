/**
 * Teacher self-attendance and configurable leave policies.
 * Teacher identity is always taken from the authenticated Staff_Access session.
 * This module never writes to the student Attendance sheet.
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

function taRows_(sheet, keyColumn) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((row, i) => {
    const item = { _rowNumber: i + 2 };
    headers.forEach((h, j) => item[h] = row[j]);
    return item;
  }).filter(item => {
    const key = keyColumn || 'Timestamp';
    return item[key] !== '' && item[key] !== null && item[key] !== undefined;
  });
}

function taDateString_(value) {
  const d = value instanceof Date ? value : new Date(value);
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
  const rows = taRows_(taPolicySheet_(), 'Policy_ID');
  const active = rows.filter(r => r.Active === true || String(r.Active).toLowerCase() === 'true');
  if (!active.length) throw new Error('No active teacher leave policy is configured. Ask an administrator to activate a policy.');
  return active[active.length - 1];
}

function taPolicyWindow_(policy, today) {
  const type = String(policy.Period_Type || 'MONTHLY').toUpperCase();
  if (type === 'MONTHLY') return { start: today.slice(0, 8) + '01', end: today.slice(0, 7) + '-31', label: today.slice(0, 7) };
  if (type === 'YEARLY') return { start: today.slice(0, 4) + '-01-01', end: today.slice(0, 4) + '-12-31', label: today.slice(0, 4) };
  if (type === 'CUSTOM') {
    const start = taDateString_(policy.Custom_Start);
    const end = taDateString_(policy.Custom_End);
    if (!start || !end || start > end) throw new Error('The active custom leave-policy date range is invalid.');
    return { start, end, label: start + ' to ' + end };
  }
  if (type === 'TERM') {
    const terms = attRecords_(getRequiredSheet('Academic_Terms'));
    const match = terms.find(r => {
      const start = attDate_(r.Start_Date), end = attDate_(r.End_Date);
      return start && end && start <= today && today <= end;
    });
    if (!match) throw new Error('No academic term covers today. Update Academic Terms or choose another leave-policy period.');
    return { start: attDate_(match.Start_Date), end: attDate_(match.End_Date), label: String(match.Academic_Year) + ' ' + String(match.Term) };
  }
  throw new Error('Unsupported leave-policy period.');
}

function taPeriodRecords_(teacherId, window) {
  return taRows_(taEnsureSheet_(TA_SHEET_, TA_HEADERS_)).filter(r => {
    const date = taDateString_(r.Timestamp);
    return String(r['Teacher ID']) === String(teacherId) && date >= window.start && date <= window.end;
  });
}

function taCounts_(records, policy) {
  const personal = records.filter(r => String(r['Reason Category']).toUpperCase() === 'PERSONAL');
  const absences = personal.filter(r => String(r.Status).toUpperCase() === 'ABSENT').length;
  const halfDays = personal.filter(r => String(r.Status).toUpperCase() === 'HALF DAY').length;
  const shortRows = personal.filter(r => String(r.Status).toUpperCase() === 'SHORT LEAVE');
  const shortOccurrences = shortRows.length;
  const shortPeriods = shortRows.reduce((sum, r) => {
    const match = String(r['Leave Type'] || '').match(/^PERIODS:([0-9,]+)$/);
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
    officialLeaveRecords: records.filter(r => String(r['Reason Category']).toUpperCase() === 'OFFICIAL').length
  };
}

function taLimitNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!isFinite(n) || n < 0) throw new Error('Leave limits must be zero or a positive number.');
  return n;
}

/** Called by a teacher to submit their own attendance for today. */
function recordTeacherAttendance(token, data) {
  const user = authRequire_(token, 'SESSION');
  if (user.role !== 'TEACHER') throw new Error('Only teacher accounts can submit teacher attendance.');
  if (!data || typeof data !== 'object') throw new Error('Attendance details are required.');

  const status = String(data.status || '').trim().toUpperCase();
  if (['PRESENT', 'ABSENT', 'HALF DAY', 'SHORT LEAVE'].indexOf(status) < 0) throw new Error('Select a valid attendance status.');

  let leaveType = '';
  let reason = '';
  if (status === 'HALF DAY') {
    const half = String(data.halfDay || '').trim().toUpperCase();
    if (!['FIRST HALF', 'SECOND HALF'].includes(half)) throw new Error('Select 1st Half or 2nd Half.');
    leaveType = half;
  } else if (status === 'SHORT LEAVE') {
    const periods = Array.isArray(data.periods) ? [...new Set(data.periods.map(Number))].sort((a, b) => a - b) : [];
    if (!periods.length || periods.some(p => !Number.isInteger(p) || p < 1 || p > 8)) throw new Error('Select one or more valid periods (1–8).');
    leaveType = 'PERIODS:' + periods.join(',');
  } else if (status === 'ABSENT') {
    leaveType = 'FULL_DAY';
  }

  if (status !== 'PRESENT') {
    reason = String(data.reasonCategory || '').trim().toUpperCase();
    if (!['PERSONAL', 'OFFICIAL'].includes(reason)) throw new Error('Select Personal or Official as the reason category.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The system is busy. Please try again.');
  try {
    const sheet = taEnsureSheet_(TA_SHEET_, TA_HEADERS_);
    const today = taToday_();
    const existingToday = taRows_(sheet).filter(r =>
      String(r['Teacher ID']) === String(user.staffId) && taDateString_(r.Timestamp) === today
    );
    if (existingToday.length) throw new Error('You have already submitted your attendance for today. Contact an administrator if a correction is needed.');

    const policy = taActivePolicy_();
    const window = taPolicyWindow_(policy, today);
    const records = taPeriodRecords_(user.staffId, window);
    const counts = taCounts_(records, policy);
    const action = String(policy.Exceed_Action || 'WARN').toUpperCase();
    const absenceLimit = taLimitNumber_(policy.Absence_Limit);
    const shortLimit = taLimitNumber_(policy.Short_Leave_Limit);
    const halfFactor = Number(policy.Half_Day_Absence_Units || 0.5);
    const absenceIncrease = reason === 'PERSONAL' ? (status === 'ABSENT' ? 1 : status === 'HALF DAY' ? halfFactor : 0) : 0;
    const shortIncrease = reason === 'PERSONAL' && status === 'SHORT LEAVE'
      ? (String(policy.Short_Leave_Counting || 'OCCURRENCES').toUpperCase() === 'PERIODS' ? leaveType.slice(8).split(',').length : 1)
      : 0;
    const nextAbsence = counts.absenceUnits + absenceIncrease;
    const nextShort = counts.shortLeaveCount + shortIncrease;
    const violations = [];
    if (absenceLimit !== null && nextAbsence > absenceLimit) violations.push('Personal absence allowance would be exceeded (' + nextAbsence + ' / ' + absenceLimit + ').');
    if (shortLimit !== null && nextShort > shortLimit) violations.push('Personal short-leave allowance would be exceeded (' + nextShort + ' / ' + shortLimit + ').');
    if (violations.length && action === 'BLOCK') throw new Error(violations.join(' '));

    sheet.appendRow([new Date(), String(user.staffId), String(user.name), status, leaveType, reason]);
    try {
      ctAudit_(user, 'TEACHER_ATTENDANCE_SUBMITTED', today + ' | ' + status + ' | ' + (leaveType || '-') + ' | ' + (reason || '-'));
    } catch (auditError) {
      sheet.deleteRow(sheet.getLastRow());
      throw new Error('Attendance could not be saved because the audit entry failed. Please try again.');
    }

    const warningPercent = Number(policy.Warning_Percent || 75);
    const warnings = violations.slice();
    if (absenceLimit !== null && absenceLimit > 0 && nextAbsence >= absenceLimit * warningPercent / 100 && nextAbsence <= absenceLimit) warnings.push('You are approaching your personal absence limit.');
    if (shortLimit !== null && shortLimit > 0 && nextShort >= shortLimit * warningPercent / 100 && nextShort <= shortLimit) warnings.push('You are approaching your personal short-leave limit.');
    return { success: true, message: 'Your attendance has been submitted.', warnings, periodLabel: window.label };
  } finally {
    lock.releaseLock();
  }
}

/** Count school working days in a policy window, applying calendar overrides. */
function taWorkingDays_(start, end) {
  const calendar = attRecords_(getRequiredSheet('School_Calendar'));
  const byDate = new Map();
  calendar.forEach(row => {
    const date = attDate_(row.Date || row.Calendar_Date);
    if (date) byDate.set(date, row);
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
      const type = String(entry.Day_Type || entry.Type || entry.Status || '').toUpperCase();
      const flag = String(entry.Is_School_Day == null ? '' : entry.Is_School_Day).toUpperCase();
      if (['HOLIDAY', 'CLOSED', 'CLOSURE', 'NON_SCHOOL_DAY'].includes(type) || ['FALSE', 'NO', '0'].includes(flag)) isWorkingDay = false;
      else if (type === 'SCHOOL_DAY' || ['TRUE', 'YES', '1'].includes(flag)) isWorkingDay = true;
    }
    if (isWorkingDay) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Teacher receives only their own summary; admins may inspect a selected teacher later. */
function getTeacherAttendanceSummary(token) {
  const user = authRequire_(token, 'SESSION');
  if (user.role !== 'TEACHER') throw new Error('Teacher access required.');
  const policy = taActivePolicy_();
  const today = taToday_();
  const window = taPolicyWindow_(policy, today);
  const records = taPeriodRecords_(user.staffId, window);
  const counts = taCounts_(records, policy);
  const absenceLimit = taLimitNumber_(policy.Absence_Limit);
  const shortLimit = taLimitNumber_(policy.Short_Leave_Limit);
  return {
    teacherId: String(user.staffId), teacherName: String(user.name),
    periodType: String(policy.Period_Type), periodLabel: window.label,
    startDate: window.start, endDate: window.end,
    absenceLimit, shortLeaveLimit: shortLimit,
    shortLeaveCounting: String(policy.Short_Leave_Counting || 'OCCURRENCES'),
    warningPercent: Number(policy.Warning_Percent || 75),
    counts,
    totalWorkingDays: taWorkingDays_(window.start, today),
    presentDays: records.filter(r => String(r.Status).toUpperCase() === 'PRESENT').length,
    leavesTaken: records.filter(r => ['ABSENT', 'HALF DAY', 'SHORT LEAVE'].includes(String(r.Status).toUpperCase())).length,
    personalDeductions: counts.absenceUnits,
    absenceRemaining: absenceLimit === null ? null : Math.max(0, absenceLimit - counts.absenceUnits),
    shortLeaveRemaining: shortLimit === null ? null : Math.max(0, shortLimit - counts.shortLeaveCount),
    todaySubmitted: taRows_(taEnsureSheet_(TA_SHEET_, TA_HEADERS_)).some(r => String(r['Teacher ID']) === String(user.staffId) && taDateString_(r.Timestamp) === today),
    records: records.map(r => ({
      date: taDateString_(r.Timestamp), status: String(r.Status),
      leaveType: String(r['Leave Type'] || ''), reasonCategory: String(r['Reason Category'] || '')
    })).sort((a, b) => b.date.localeCompare(a.date))
  };
}

/** Admin-only: read the active policy configuration. */
function adminGetTeacherLeavePolicy(token) {
  authRequire_(token, 'ADMIN');
  const p = taActivePolicy_();
  return {
    periodType: String(p.Period_Type || 'MONTHLY'),
    customStart: taDateString_(p.Custom_Start), customEnd: taDateString_(p.Custom_End),
    absenceLimit: p.Absence_Limit === '' ? '' : Number(p.Absence_Limit),
    shortLeaveLimit: p.Short_Leave_Limit === '' ? '' : Number(p.Short_Leave_Limit),
    shortLeaveCounting: String(p.Short_Leave_Counting || 'OCCURRENCES'),
    warningPercent: Number(p.Warning_Percent || 75),
    exceedAction: String(p.Exceed_Action || 'WARN'),
    halfDayAbsenceUnits: Number(p.Half_Day_Absence_Units || 0.5)
  };
}

/** Admin-only: update the active policy. Blank limits mean unlimited. */
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
    customStart = String(data.customStart || ''); customEnd = String(data.customEnd || '');
    if (!taIsoValid_(customStart) || !taIsoValid_(customEnd) || customStart > customEnd) throw new Error('Enter a valid custom start and end date.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The system is busy. Please try again.');
  try {
    const sheet = taPolicySheet_();
    const rows = taRows_(sheet, 'Policy_ID');
    let row = rows.find(r => String(r.Policy_ID) === 'DEFAULT');
    const values = [
      'DEFAULT', period, customStart, customEnd,
      absenceLimit === null ? '' : absenceLimit,
      shortLimit === null ? '' : shortLimit,
      counting, warning, action, halfUnits, true,
      String(user.username || user.name), new Date()
    ];
    if (row) sheet.getRange(row._rowNumber, 1, 1, TA_POLICY_HEADERS_.length).setValues([values]);
    else sheet.appendRow(values);
    ctAudit_(user, 'TEACHER_LEAVE_POLICY_UPDATED', JSON.stringify({periodType:period, absenceLimit, shortLimit, counting, warning, action, halfUnits, customStart, customEnd}));
    return { success: true, message: 'Teacher leave policy saved.' };
  } finally {
    lock.releaseLock();
  }
}



/**
 * Admin-only: retrieve teacher attendance for a selected date
 * or all dates.
 */
function adminGetTeacherDailyAttendance(token, filterDate) {
  authRequire_(token, 'ADMIN');

  const today = taToday_();
  const selectedDate = String(filterDate || today).trim();

  if (selectedDate !== 'ALL' && !taIsoValid_(selectedDate)) {
    throw new Error('Invalid attendance date.');
  }

  const sheet = taEnsureSheet_(TA_SHEET_, TA_HEADERS_);

  const records = taRows_(sheet)
    .filter(r => {
      const date = taDateString_(r.Timestamp);

      if (selectedDate === 'ALL') return true;
      return date === selectedDate;
    })
    .map(r => ({
      teacherId: String(r['Teacher ID'] || ''),
      teacherName: String(r['Teacher Name'] || ''),
      status: String(r.Status || ''),
      leaveType: String(r['Leave Type'] || ''),
      reasonCategory: String(r['Reason Category'] || ''),
      date: taDateString_(r.Timestamp),
      timestampMs: r.Timestamp instanceof Date
        ? r.Timestamp.getTime()
        : new Date(r.Timestamp).getTime(),
      submittedAt: r.Timestamp instanceof Date
        ? Utilities.formatDate(r.Timestamp, 'Asia/Colombo', 'hh:mm a')
        : ''
    }))
    .sort((a, b) =>
      b.timestampMs - a.timestampMs ||
      a.teacherName.localeCompare(b.teacherName)
    );

  return {
    date: selectedDate,
    totalSubmitted: records.length,
    records: records
  };
}


