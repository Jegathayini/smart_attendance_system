/** Admin review, verification and corrections (column-indexed + cache invalidation). */
const ATT_REVIEW_HEADERS_ = ['Date', 'Class_ID', 'Verified_By', 'Verified_At', 'Revision'];

function attReviewSheet_() {
  const db = getDatabase();
  let sheet = db.getSheetByName('Attendance_Verifications');
  if (!sheet) {
    sheet = db.insertSheet('Attendance_Verifications');
    sheet.getRange(1, 1, 1, ATT_REVIEW_HEADERS_.length).setValues([ATT_REVIEW_HEADERS_]);
    sheet.setFrozenRows(1);
  }
  attHeaders_(sheet, ATT_REVIEW_HEADERS_);
  return sheet;
}

function attReviewDate_(date) {
  const value = String(date || '').trim();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    attDate_(value) !== value ||
    !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value ||
    value > attToday_()
  ) {
    throw new Error('Select a valid date not in the future.');
  }
  return value;
}

function attReviewData_(date, cls) {
  const sheet = getRequiredSheet('Attendance');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { sheet, headers: [], rows: [] };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const idx = name => headers.indexOf(name);
  const dIdx = idx('Date'), gIdx = idx('Grade'), sIdx = idx('Section');
  const idIdx = idx('Student_ID'), stIdx = idx('Status');
  const nameIdx = idx('Student_Name'), rollIdx = idx('Roll_No'), admIdx = idx('Admission_No');

  [dIdx, gIdx, sIdx, idIdx, stIdx].forEach((col, i) => {
    if (col < 0) throw new Error('Attendance sheet missing required column #' + i);
  });

  // Single-column Date scan first to narrow the sheet range read
  const dateCol = sheet.getRange(2, dIdx + 1, lastRow - 1, 1).getValues();
  let minRow = -1, maxRow = -1;
  for (let i = dateCol.length - 1; i >= 0; i--) {
    if (attDate_(dateCol[i][0]) === date) {
      const sheetRow = i + 2;
      if (maxRow < 0) maxRow = sheetRow;
      minRow = sheetRow;
    }
  }
  if (minRow < 0) return { sheet, headers, rows: [] };

  const block = sheet.getRange(minRow, 1, maxRow - minRow + 1, lastCol).getValues();
  const rows = [];
  for (let i = 0; i < block.length; i++) {
    const v = block[i];
    if (
      attDate_(v[dIdx]) === date &&
      Number(v[gIdx]) === cls.grade &&
      String(v[sIdx] || '').trim().toUpperCase() === cls.section
    ) {
      rows.push({
        rowNumber: minRow + i,
        record: {
          Student_ID: v[idIdx],
          Student_Name: nameIdx >= 0 ? v[nameIdx] : '',
          Status: v[stIdx],
          Roll_No: rollIdx >= 0 ? v[rollIdx] : '',
          Admission_No: admIdx >= 0 ? v[admIdx] : ''
        }
      });
    }
  }
  return { sheet, headers, rows };
}

function attReviewVerificationsByDate_(date) {
  const sheet = attReviewSheet_();
  const values = sheet.getDataRange().getValues();
  const map = new Map();
  if (values.length < 2) return map;
  const h = values[0].map(String);
  const dIdx = h.indexOf('Date'), cIdx = h.indexOf('Class_ID'), vIdx = h.indexOf('Verified_By');
  for (let i = 1; i < values.length; i++) {
    if (attDate_(values[i][dIdx]) === date) {
      const clsName = String(values[i][cIdx] || '').trim().toUpperCase();
      map.set(clsName, { Verified_By: String(values[i][vIdx] || '') });
    }
  }
  return map;
}

function attReviewInfo_(date, cls) {
  return attReviewVerificationsByDate_(date).get(cls.name) || null;
}

function attReviewAudit_(action, actor, date, cls, details, reason, studentId, oldStatus, newStatus) {
  const audit = getRequiredSheet('Audit_Log');
  const headers = attHeaders_(audit, []);
  const data = {
    Audit_ID: Utilities.getUuid(),
    Timestamp: new Date(),
    Date: date,
    Action: action,
    Event: action,
    Actor: actor,
    Username: actor,
    Performed_By: actor,
    Class_ID: cls.name,
    Student_ID: studentId || '',
    Old_Status: oldStatus || '',
    New_Status: newStatus || '',
    Details: details,
    Reason: reason || ''
  };
  audit.getRange(audit.getLastRow() + 1, 1, 1, headers.length).setValues([
    headers.map(h => Object.prototype.hasOwnProperty.call(data, h) ? data[h] : '')
  ]);
}

/** Fast status strip for Admin Verification: shows submitted/verified state per class for a date. */
function adminGetSubmittedClassesForDate(token, date) {
  authRequire_(token, 'ADMIN');
  const targetDate = attReviewDate_(date);
  const activeClasses = getClassesCached_().filter(c => c.active);
  const dateRows = attReadDateRowsCached_(targetDate);
  const countsByClass = new Map();
  dateRows.forEach(r => {
    countsByClass.set(r.classId, (countsByClass.get(r.classId) || 0) + 1);
  });
  const verifications = attReviewVerificationsByDate_(targetDate);

  const classes = activeClasses.map(c => {
    const count = countsByClass.get(c.className) || 0;
    const ver = verifications.get(c.className);
    return {
      grade: c.grade,
      section: c.section,
      className: c.className,
      submitted: count > 0,
      count,
      verified: Boolean(ver),
      verifiedBy: ver ? ver.Verified_By : ''
    };
  }).sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section));

  return { date: targetDate, classes };
}

function adminGetAttendanceReview(token, date, grade, section) {
  authRequire_(token, 'ADMIN');
  date = attReviewDate_(date);
  const cls = attClass_(grade, section);
  const data = attReviewData_(date, cls);
  const verification = attReviewInfo_(date, cls);
  return {
    date,
    className: cls.name,
    submitted: data.rows.length > 0,
    verified: Boolean(verification),
    verifiedBy: verification ? String(verification.Verified_By) : '',
    students: data.rows.map(({ record: r }) => ({
      studentId: String(r.Student_ID),
      name: String(r.Student_Name || ''),
      status: String(r.Status).toUpperCase(),
      rollNo: String(r.Roll_No || ''),
      admissionNo: String(r.Admission_No || '')
    })).sort((a, b) => Number(a.rollNo) - Number(b.rollNo))
  };
}

function adminVerifyAttendance(token, date, grade, section) {
  const user = authRequire_(token, 'ADMIN');
  date = attReviewDate_(date);
  const cls = attClass_(grade, section);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy. Retry.');
  try {
    const data = attReviewData_(date, cls);
    if (!data.rows.length) throw new Error('Attendance not submitted for this class/date.');
    if (attReviewInfo_(date, cls)) throw new Error('Already verified.');
    const actor = String(user.username || user.name || 'Admin');
    const sheet = attReviewSheet_();
    const headers = attHeaders_(sheet, ATT_REVIEW_HEADERS_);
    const record = { Date: date, Class_ID: cls.name, Verified_By: actor, Verified_At: new Date(), Revision: 1 };
    const rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(h => record[h] || '')]);
    try {
      attReviewAudit_('ATTENDANCE_VERIFIED', actor, date, cls, 'Verified ' + data.rows.length + ' records', '');
    } catch (e) {
      sheet.deleteRow(rowNumber);
      throw e;
    }
    return { success: true, count: data.rows.length };
  } finally {
    lock.releaseLock();
  }
}

function adminCorrectAttendance(token, date, grade, section, studentId, newStatus, reason) {
  const user = authRequire_(token, 'ADMIN');
  date = attReviewDate_(date);
  const cls = attClass_(grade, section);
  studentId = String(studentId || '').trim();
  newStatus = String(newStatus || '').trim().toUpperCase();
  reason = String(reason || '').trim();
  if (!ATT_ALLOWED_.includes(newStatus)) throw new Error('Invalid attendance status.');
  if (reason.length < 5 || reason.length > 500) throw new Error('Correction reason must be 5–500 characters.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy. Retry.');
  try {
    const data = attReviewData_(date, cls);
    const matches = data.rows.filter(x => String(x.record.Student_ID).trim() === studentId);
    if (matches.length !== 1) throw new Error('Student attendance record missing or duplicated.');
    const target = matches[0];
    const oldStatus = String(target.record.Status).toUpperCase();
    if (oldStatus === newStatus) throw new Error('New status must differ from current status.');

    const statusColumn = data.headers.indexOf('Status') + 1;
    const actor = String(user.username || user.name || 'Admin');
    data.sheet.getRange(target.rowNumber, statusColumn).setValue(newStatus);
    try {
      attReviewAudit_(
        'ATTENDANCE_CORRECTED', actor, date, cls,
        'Student ' + studentId + ': ' + oldStatus + ' → ' + newStatus,
        reason, studentId, oldStatus, newStatus
      );
    } catch (e) {
      data.sheet.getRange(target.rowNumber, statusColumn).setValue(oldStatus);
      throw e;
    }

    const review = attReviewSheet_();
    const all = review.getDataRange().getValues();
    const h = all[0].map(String), d = h.indexOf('Date'), c = h.indexOf('Class_ID');
    for (let i = all.length - 1; i >= 1; i--) {
      if (attDate_(all[i][d]) === date && String(all[i][c]).trim().toUpperCase() === cls.name) {
        review.deleteRow(i + 1);
      }
    }

    appBumpCacheVersion_('ATT');
    return { success: true, oldStatus, newStatus, requiresVerification: true };
  } finally {
    lock.releaseLock();
  }
}