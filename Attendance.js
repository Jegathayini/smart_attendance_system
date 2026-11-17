/** Smart School Attendance — daily submission (Asia/Colombo, cached & column-indexed). */
const ATT_TZ_ = 'Asia/Colombo';
const ATT_ALLOWED_ = ['PRESENT', 'ABSENT', 'LATE'];

function attToday_() {
  return Utilities.formatDate(new Date(), ATT_TZ_, 'yyyy-MM-dd');
}

function attDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, ATT_TZ_, 'yyyy-MM-dd');
  }
  const str = String(value == null ? '' : value).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, ATT_TZ_, 'yyyy-MM-dd');
  }
  return '';
}

function attRecords_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(r => r.some(v => v !== '')).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

function attHeaders_(sheet, required) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  required.forEach(h => {
    if (!headers.includes(h)) throw new Error(sheet.getName() + ' missing column: ' + h);
  });
  return headers;
}

function attActive_(v) {
  return !['NO', 'FALSE', 'INACTIVE', '0'].includes(String(v == null ? '' : v).trim().toUpperCase());
}

function attEligible_(r, date) {
  const admitted = attDate_(r.Admission_Date);
  const left = attDate_(r.Leaving_Date);
  return attActive_(r.Active) && (!admitted || admitted <= date) && (!left || left >= date);
}

function attEligibleObj_(s, date) {
  return Boolean(s && s.active) && (!s.admitted || s.admitted <= date) && (!s.left || s.left >= date);
}

function attClass_(grade, section) {
  const g = Number(grade);
  const s = String(section || '').trim().toUpperCase();
  if (!Number.isInteger(g) || g < 1 || g > 13 || !/^[A-Z][A-Z0-9]*$/.test(s)) {
    throw new Error('Invalid class selection.');
  }
  return { grade: g, section: s, name: g + s };
}

/** Fast cached roster lookup using Classes & Students caches. */
function attRoster_(cls, date) {
  const activeClass = getClassesCached_().some(
    c => c.grade === cls.grade && c.section === cls.section && c.active
  );
  if (!activeClass) throw new Error('Class is not active.');

  const roster = getStudentsCached_().filter(s =>
    s.grade === cls.grade &&
    s.section === cls.section &&
    s.classId === cls.name &&
    attEligibleObj_(s, date)
  );
  if (!roster.length) throw new Error('No eligible students for this class today.');

  const ids = roster.map(s => s.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !id)) {
    throw new Error('Student register has missing or duplicate IDs.');
  }
  return roster;
}

/** Column-indexed, tail-optimized scan of Attendance for a single date (cached). */
function attReadDateRowsFresh_(date) {
  const sheet = getRequiredSheet('Attendance');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const dIdx = headers.indexOf('Date');
  const gIdx = headers.indexOf('Grade');
  const sIdx = headers.indexOf('Section');
  const cIdx = headers.indexOf('Class_ID');
  const idIdx = headers.indexOf('Student_ID');
  const stIdx = headers.indexOf('Status');
  if (dIdx < 0 || gIdx < 0 || sIdx < 0 || idIdx < 0 || stIdx < 0) {
    throw new Error('Attendance sheet missing required columns.');
  }

  // Scan ONLY the Date column first (1/13th the data) to find the exact row span.
  const dateCol = sheet.getRange(2, dIdx + 1, lastRow - 1, 1).getValues();
  let minRow = -1, maxRow = -1;
  for (let i = dateCol.length - 1; i >= 0; i--) {
    if (attDate_(dateCol[i][0]) === date) {
      const sheetRow = i + 2;
      if (maxRow < 0) maxRow = sheetRow;
      minRow = sheetRow;
    }
  }
  if (minRow < 0) return [];

  const block = sheet.getRange(minRow, 1, maxRow - minRow + 1, lastCol).getValues();
  const out = [];
  for (let i = 0; i < block.length; i++) {
    const r = block[i];
    if (attDate_(r[dIdx]) !== date) continue;
    const grade = Number(r[gIdx]);
    const section = String(r[sIdx] || '').trim().toUpperCase();
    const classId = cIdx >= 0 && r[cIdx] ? normalizeClassId(r[cIdx]) : (grade + section);
    out.push({
      studentId: String(r[idIdx] || '').trim(),
      grade,
      section,
      classId,
      status: String(r[stIdx] || '').trim().toUpperCase()
    });
  }
  return out;
}

function attReadDateRowsCached_(date) {
  const key = 'ATT_DAY_' + appCacheVersion_('ATT') + '_' + date;
  const cached = appCacheGet_(key);
  if (cached) return cached;
  const rows = attReadDateRowsFresh_(date);
  appCachePut_(key, rows, APP_SHORT_CACHE_TTL_SEC_);
  return rows;
}

function attExisting_(date, cls) {
  return attReadDateRowsCached_(date).filter(
    r => r.grade === cls.grade && r.section === cls.section
  );
}

function attExistingFresh_(date, cls) {
  return attReadDateRowsFresh_(date).filter(
    r => r.grade === cls.grade && r.section === cls.section
  );
}

function attTodaySubmittedClasses_(date) {
  const set = new Set();
  attReadDateRowsCached_(date).forEach(r => {
    if (r.classId) set.add(r.classId);
  });
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function attGetSchoolDayInfo_(date) {
  const matching = getCalendarCached_().filter(r => r.date === date);
  if (matching.length > 1) {
    return {
      date,
      isSchoolDay: false,
      conflict: true,
      type: 'CONFLICT',
      label: 'Conflicting calendar entries'
    };
  }
  if (matching.length === 1) {
    const r = matching[0];
    if (['HOLIDAY', 'CLOSED', 'CLOSURE', 'NON_SCHOOL_DAY'].includes(r.type) ||
        ['FALSE', 'NO', '0'].includes(r.schoolDay)) {
      return {
        date,
        isSchoolDay: false,
        conflict: false,
        type: r.type || 'HOLIDAY',
        label: r.description ? (r.type + ': ' + r.description) : 'School Holiday / Closed'
      };
    }
    if (r.type === 'SCHOOL_DAY' || ['TRUE', 'YES', '1'].includes(r.schoolDay)) {
      return {
        date,
        isSchoolDay: true,
        conflict: false,
        type: 'SPECIAL_SCHOOL_DAY',
        label: r.description ? ('School Day (' + r.description + ')') : 'Special School Day'
      };
    }
  }
  const day = new Date(date + 'T12:00:00+05:30').getUTCDay();
  if (day === 0 || day === 6) {
    return { date, isSchoolDay: false, conflict: false, type: 'WEEKEND', label: 'Weekend (Non-School Day)' };
  }
  return { date, isSchoolDay: true, conflict: false, type: 'REGULAR', label: 'Regular School Day' };
}

function attSchoolDay_(date) {
  const info = attGetSchoolDayInfo_(date);
  if (info.conflict) throw new Error('Conflicting calendar entries for today. Contact admin.');
  if (!info.isSchoolDay) {
    throw new Error(
      info.type === 'WEEKEND'
        ? 'Today is not a regular school day.'
        : 'Attendance cannot be submitted on a school closure or holiday.'
    );
  }
}

/** Read-only check; server is authoritative. */
function getDailyAttendanceStatus(token, grade, section) {
  authRequire_(token);
  const cls = attClass_(grade, section);
  const date = attToday_();
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
    submitted: rows.length > 0,
    count: rows.length,
    entries,
    counts: { PRESENT: present, ABSENT: absent, LATE: late }
  };
}

/** Submits one complete class; revalidates everything under a script lock. */
function submitDailyAttendance(token, grade, section, entries, confirmed) {
  const user = authRequire_(token);
  if (confirmed !== true) throw new Error('Please confirm the attendance before submitting.');
  if (!Array.isArray(entries)) throw new Error('Invalid attendance entries.');
  const cls = attClass_(grade, section);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System is busy. Please retry.');

  try {
    const date = attToday_();
    attSchoolDay_(date);
    if (attExistingFresh_(date, cls).length) {
      throw new Error('Attendance for this class has already been submitted today.');
    }

    const roster = attRoster_(cls, date);
    if (entries.length !== roster.length) {
      throw new Error('Student list changed. Refresh the class and try again.');
    }

    const byId = new Map();
    entries.forEach(item => {
      const id = String(item && item.studentId || '').trim();
      const status = String(item && item.status || '').toUpperCase();
      if (!id || byId.has(id) || !ATT_ALLOWED_.includes(status)) {
        throw new Error('Invalid or duplicate student status.');
      }
      byId.set(id, status);
    });

    const rosterIds = new Set(roster.map(r => r.id));
    if (byId.size !== rosterIds.size || [...byId.keys()].some(id => !rosterIds.has(id))) {
      throw new Error('Student list mismatch. Refresh and retry.');
    }

    const sheet = getRequiredSheet('Attendance');
    const required = [
      'Attendance_ID', 'Date', 'Academic_Year', 'Student_ID', 'Admission_No',
      'Student_Name', 'Grade', 'Section', 'Class_ID', 'Gender', 'Status', 'Submitted_By', 'Submitted_At'
    ];
    const headers = attHeaders_(sheet, required);
    const audit = getRequiredSheet('Audit_Log');
    const auditHeaders = attHeaders_(audit, []);
    const now = new Date();
    const submitter = String(user.username || user.name || user.staffId || 'Authenticated staff');
    const batch = Utilities.getUuid();

    const rows = roster.map((r, i) => {
      const values = {
        Attendance_ID: batch + '-' + (i + 1),
        Date: date,
        Academic_Year: Number(date.slice(0, 4)),
        Student_ID: r.id,
        Admission_No: r.admission,
        Student_Name: r.name,
        Grade: cls.grade,
        Section: cls.section,
        Class_ID: cls.name,
        Gender: r.gender,
        Status: byId.get(r.id),
        Submitted_By: submitter,
        Submitted_At: now
      };
      return headers.map(h => Object.prototype.hasOwnProperty.call(values, h) ? values[h] : '');
    });

    const auditData = {
      Audit_ID: Utilities.getUuid(),
      Timestamp: now,
      Date: date,
      Action: 'ATTENDANCE_SUBMITTED',
      Event: 'ATTENDANCE_SUBMITTED',
      Actor: submitter,
      Username: submitter,
      Performed_By: submitter,
      Class_ID: cls.name,
      Details: 'Submitted ' + rows.length + ' students for ' + date,
      Reason: 'Daily attendance submission'
    };
    const auditRow = auditHeaders.map(h => Object.prototype.hasOwnProperty.call(auditData, h) ? auditData[h] : '');

    const start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
    try {
      audit.getRange(audit.getLastRow() + 1, 1, 1, auditHeaders.length).setValues([auditRow]);
    } catch (error) {
      sheet.deleteRows(start, rows.length);
      throw new Error('Submission could not be audited; attendance was rolled back. ' + error.message);
    }

    SpreadsheetApp.flush();
    appBumpCacheVersion_('ATT');
    return { success: true, date, className: cls.name, count: rows.length };
  } finally {
    lock.releaseLock();
  }
}