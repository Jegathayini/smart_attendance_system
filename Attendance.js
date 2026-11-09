/** Smart School Attendance — daily submission (fictional-data testing). */
const ATT_TZ_ = 'Asia/Colombo';
const ATT_ALLOWED_ = ['PRESENT', 'ABSENT', 'LATE'];

function attToday_() {
  return Utilities.formatDate(new Date(), ATT_TZ_, 'yyyy-MM-dd');
}
function attDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime()))
    return Utilities.formatDate(value, ATT_TZ_, 'yyyy-MM-dd');
  const str = String(value == null ? '' : value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
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
  required.forEach(h => { if (!headers.includes(h)) throw new Error(sheet.getName() + ' missing column: ' + h); });
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
function attClass_(grade, section) {
  const g = Number(grade);
  const s = String(section || '').trim().toUpperCase();
  if (!Number.isInteger(g) || g < 1 || g > 13 || !/^[A-Z][A-Z0-9]*$/.test(s))
    throw new Error('Invalid class selection.');
  return { grade: g, section: s, name: g + s };
}
function attRoster_(cls, date) {
  const classes = attRecords_(getRequiredSheet('Classes'));
  if (!classes.some(r => Number(r.Grade) === cls.grade &&
      String(r.Section).trim().toUpperCase() === cls.section && attActive_(r.Active)))
    throw new Error('Class is not active.');
  const roster = attRecords_(getRequiredSheet('Students')).filter(r =>
    Number(r.Grade) === cls.grade &&
    String(r.Section).trim().toUpperCase() === cls.section &&
    normalizeClassId(r.Class_ID) === cls.name && attEligible_(r, date));
  if (!roster.length) throw new Error('No eligible students for this class today.');
  const ids = roster.map(r => String(r.Student_ID).trim());
  if (new Set(ids).size !== ids.length || ids.some(id => !id))
    throw new Error('Student register has missing or duplicate IDs.');
  return roster;
}
function attExisting_(date, cls) {
  return attRecords_(getRequiredSheet('Attendance')).filter(r =>
    attDate_(r.Date) === date &&
    Number(r.Grade) === cls.grade &&
    String(r.Section).trim().toUpperCase() === cls.section);
}
function attSchoolDay_(date) {
  // Explicit calendar entries override the default Monday–Friday schedule.
  const rows=attRecords_(getRequiredSheet('School_Calendar'));
  const matching=rows.filter(r=>attDate_(r.Date||r.Calendar_Date)===date);
  if(matching.length>1)throw new Error('Conflicting calendar entries for today. Contact admin.');
  if(matching.length) {
    const r=matching[0];
    const type=String(r.Day_Type||r.Type||r.Status||'').toUpperCase();
    const schoolDay=String(r.Is_School_Day==null?'':r.Is_School_Day).toUpperCase();
    if(['HOLIDAY','CLOSED','CLOSURE','NON_SCHOOL_DAY'].includes(type)||['FALSE','NO','0'].includes(schoolDay))
      throw new Error('Attendance cannot be submitted on a school closure or holiday.');
    if(type==='SCHOOL_DAY'||['TRUE','YES','1'].includes(schoolDay))return;
  }
  const day=new Date(date+'T12:00:00+05:30').getUTCDay();
  if(day===0||day===6)throw new Error('Today is not a regular school day.');
}

/** Read-only check; the server is authoritative. */
function getDailyAttendanceStatus(token, grade, section) {
  authRequire_(token); // Enforces completed password change.
  const cls = attClass_(grade, section);
  const date = attToday_();
  const rows = attExisting_(date, cls);
  return {
    date: date, submitted: rows.length > 0,
    count: rows.length,
    entries: rows.map(r => ({
      studentId: String(r.Student_ID).trim(),
      status: String(r.Status).trim().toUpperCase()
    })),
    counts: {
      PRESENT: rows.filter(r => String(r.Status).toUpperCase() === 'PRESENT').length,
      ABSENT: rows.filter(r => String(r.Status).toUpperCase() === 'ABSENT').length,
      LATE: rows.filter(r => String(r.Status).toUpperCase() === 'LATE').length
    }
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
    if (attExisting_(date, cls).length) throw new Error('Attendance for this class has already been submitted today.');
    const roster = attRoster_(cls, date);
    if (entries.length !== roster.length) throw new Error('Student list changed. Refresh the class and try again.');
    const byId = new Map();
    entries.forEach(item => {
      const id = String(item && item.studentId || '').trim();
      const status = String(item && item.status || '').toUpperCase();
      if (!id || byId.has(id) || !ATT_ALLOWED_.includes(status))
        throw new Error('Invalid or duplicate student status.');
      byId.set(id, status);
    });
    const rosterIds = new Set(roster.map(r => String(r.Student_ID).trim()));
    if (byId.size !== rosterIds.size || [...byId.keys()].some(id => !rosterIds.has(id)))
      throw new Error('Student list mismatch. Refresh and retry.');

    const sheet = getRequiredSheet('Attendance');
    const required = ['Attendance_ID','Date','Academic_Year','Student_ID','Admission_No',
      'Student_Name','Grade','Section','Class_ID','Gender','Status','Submitted_By','Submitted_At'];
    const headers = attHeaders_(sheet, required);
    const audit = getRequiredSheet('Audit_Log');
    const auditHeaders = attHeaders_(audit, []);
    const now = new Date();
    const submitter = String(user.username || user.name || user.staffId || 'Authenticated staff');
    const batch = Utilities.getUuid();
    const rows = roster.map((r, i) => {
      const values = {
        Attendance_ID: batch + '-' + (i + 1), Date: date,
        Academic_Year: Number(date.slice(0,4)), Student_ID: String(r.Student_ID),
        Admission_No: r.Admission_No, Student_Name: r.Student_Name || r.Name || '',
        Grade: cls.grade, Section: cls.section, Class_ID: cls.name,
        Gender: r.Gender || '', Status: byId.get(String(r.Student_ID).trim()),
        Submitted_By: submitter, Submitted_At: now
      };
      return headers.map(h => Object.prototype.hasOwnProperty.call(values,h) ? values[h] : '');
    });
    const auditData = {
      Audit_ID: Utilities.getUuid(), Timestamp: now, Date: date,
      Action: 'ATTENDANCE_SUBMITTED', Event: 'ATTENDANCE_SUBMITTED',
      Actor: submitter, Username: submitter, Performed_By: submitter,
      Class_ID: cls.name, Details: 'Submitted ' + rows.length + ' students for ' + date,
      Reason: 'Daily attendance submission'
    };
    const auditRow = auditHeaders.map(h => Object.prototype.hasOwnProperty.call(auditData,h) ? auditData[h] : '');
    const start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, rows.length, headers.length).setValues(rows);
    try {
      audit.getRange(audit.getLastRow()+1, 1, 1, auditHeaders.length).setValues([auditRow]);
    } catch (error) {
      sheet.deleteRows(start, rows.length); // Roll back if audit writing fails.
      throw new Error('Submission could not be audited; attendance was rolled back. ' + error.message);
    }
    SpreadsheetApp.flush();
    return { success: true, date: date, className: cls.name, count: rows.length };
  } finally {
    lock.releaseLock();
  }
}
