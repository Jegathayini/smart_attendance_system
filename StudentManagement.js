/** Smart School Attendance — admin student register management (cached + column-indexed). */

function smSheet_(name, required) {
  const sheet = getRequiredSheet(name);
  const headers = attHeaders_(sheet, required);
  return { sheet, headers };
}

function smWrite_(sheet, headers, data, row) {
  sheet.getRange(row, 1, 1, headers.length).setValues([
    headers.map(h => Object.prototype.hasOwnProperty.call(data, h) ? data[h] : '')
  ]);
}

function smYear_() {
  return Number(Utilities.formatDate(new Date(), 'Asia/Colombo', 'yyyy'));
}

function smClass_(grade, section) {
  return attClass_(grade, section);
}

function smRequired_(value, label, max) {
  const s = String(value == null ? '' : value).trim();
  if (!s || s.length > max) throw new Error(label + ' is required (max ' + max + ' characters).');
  return s;
}

function smDate_(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) !== s) {
    throw new Error('Use a valid YYYY-MM-DD date.');
  }
  return s;
}

function smList(token, grade) {
  authRequire_(token, 'ADMIN');
  const g = Number(grade);
  if (!Number.isInteger(g) || g < 1 || g > 13) throw new Error('Select a grade.');

  const classes = getClassesCached_()
    .filter(c => c.grade === g)
    .map(c => ({ name: c.className, section: c.section, active: c.active }))
    .sort((a, b) => a.section.localeCompare(b.section));

  const students = getStudentsCached_()
    .filter(s => s.grade === g)
    .map(s => ({
      id: s.id,
      admission: s.admission,
      name: s.name,
      grade: g,
      section: s.section,
      roll: s.roll,
      gender: s.gender,
      active: s.active,
      status: s.active ? 'ACTIVE' : 'LEFT',
      admitted: s.admitted,
      left: s.left
    }))
    .sort((a, b) => a.section.localeCompare(b.section) || Number(a.roll) - Number(b.roll));

  return { classes, students };
}

function smAddClass(token, grade, section) {
  const user = authRequire_(token, 'ADMIN');
  const c = smClass_(grade, section);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy.');
  try {
    const { sheet, headers } = smSheet_('Classes', ['Grade', 'Section', 'Class_Name']);
    appBumpCacheVersion_('CLS');
    if (getClassesCached_().some(x => x.grade === c.grade && x.section === c.section)) {
      throw new Error('Section already exists.');
    }
    const data = {
      Class_ID: c.name, Grade: c.grade, Section: c.section,
      Class_Name: c.name, Active: true, Academic_Year: smYear_()
    };
    const row = sheet.getLastRow() + 1;
    smWrite_(sheet, headers, data, row);
    try {
      ctAudit_(user, 'CLASS_CREATED', c.name);
    } catch (e) {
      sheet.deleteRow(row);
      appBumpCacheVersion_('CLS');
      throw e;
    }
    appBumpCacheVersion_('CLS');
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function smAddStudent(token, student) {
  const user = authRequire_(token, 'ADMIN');
  if (!student || typeof student !== 'object') throw new Error('Missing student details.');

  const c = smClass_(student.grade, student.section);
  const name = smRequired_(student.name, 'Student name', 120);
  const admission = smRequired_(student.admission, 'Admission number', 60);
  const gender = String(student.gender || '').toUpperCase();
  if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) throw new Error('Select gender.');
  const roll = Number(student.roll);
  if (!Number.isInteger(roll) || roll < 1 || roll > 9999) throw new Error('Invalid roll number.');
  const admitted = smDate_(student.admitted);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy.');
  try {
    if (!getClassesCached_().some(x => x.grade === c.grade && x.section === c.section && x.active)) {
      throw new Error('Class does not exist or is inactive.');
    }
    const { sheet, headers } = smSheet_('Students', ['Student_ID', 'Admission_No', 'Grade', 'Section', 'Class_ID']);
    appBumpCacheVersion_('STU');
    const existing = getStudentsCached_();

    if (existing.some(r => r.admission.trim().toLowerCase() === admission.toLowerCase())) {
      throw new Error('Admission number already exists.');
    }
    if (existing.some(r => r.grade === c.grade && r.section === c.section && Number(r.roll) === roll && r.active)) {
      throw new Error('Roll number already used in this class.');
    }

    const id = 'STU-' + Utilities.getUuid().slice(0, 12).toUpperCase();
    const data = {
      Student_ID: id, Admission_No: admission, Name: name, Student_Name: name,
      Grade: c.grade, Section: c.section, Class_ID: c.name, Roll_No: roll,
      Gender: gender, Admission_Date: admitted, Leaving_Date: '', Active: true, Academic_Year: smYear_()
    };
    const row = sheet.getLastRow() + 1;
    smWrite_(sheet, headers, data, row);
    try {
      ctAudit_(user, 'STUDENT_CREATED', id + ' ' + c.name);
    } catch (e) {
      sheet.deleteRow(row);
      appBumpCacheVersion_('STU');
      throw e;
    }
    appBumpCacheVersion_('STU');
    return { success: true, id };
  } finally {
    lock.releaseLock();
  }
}

function smMarkStudentLeft(token, id, departureDate, reason) {
  const user = authRequire_(token, 'ADMIN');
  const studentId = smRequired_(id, 'Student ID', 100);
  const date = smDate_(departureDate);
  const why = smRequired_(reason, 'Reason', 250);
  if (date > attToday_()) throw new Error('Future leaving dates are not supported yet.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy.');
  try {
    const { sheet, headers } = smSheet_('Students', ['Student_ID', 'Active', 'Leaving_Date', 'Admission_Date']);
    const values = sheet.getDataRange().getValues();
    const idx = headers.indexOf('Student_ID');
    const found = [];
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idx]).trim() === studentId) found.push(i + 1);
    }
    if (found.length !== 1) throw new Error('Student ID not found or duplicated.');

    const row = found[0];
    const before = values[row - 1].slice(0, headers.length);
    const record = {};
    headers.forEach((h, i) => { record[h] = before[i]; });

    if (!attActive_(record.Active)) throw new Error('Student has already been marked as Left.');
    const admission = attDate_(record.Admission_Date);
    if (admission && date < admission) throw new Error('Leaving date cannot be before admission date.');

    const updated = { ...record, Active: false, Leaving_Date: date };
    smWrite_(sheet, headers, updated, row);
    try {
      ctAudit_(user, 'STUDENT_MARKED_LEFT', studentId + ' Leaving date: ' + date + ' Reason: ' + why);
    } catch (e) {
      sheet.getRange(row, 1, 1, headers.length).setValues([before]);
      throw e;
    }
    appBumpCacheVersion_('STU');
    return { success: true, status: 'LEFT', leavingDate: date };
  } finally {
    lock.releaseLock();
  }
}

function smDeactivateStudent(token, id, departureDate, reason) {
  return smMarkStudentLeft(token, id, departureDate, reason);
}

function smEditStudent(token, studentId, changes, reason) {
  const user = authRequire_(token, 'ADMIN');
  const id = smRequired_(studentId, 'Student ID', 100);
  const why = smRequired_(reason, 'Reason', 250);
  if (!changes || typeof changes !== 'object') throw new Error('Missing changes.');

  const name = smRequired_(changes.name, 'Name', 120);
  const gender = String(changes.gender || '').trim().toUpperCase();
  if (!['MALE', 'FEMALE', 'OTHER'].includes(gender)) throw new Error('Invalid gender.');
  const roll = Number(changes.roll);
  if (!Number.isInteger(roll) || roll < 1 || roll > 9999) throw new Error('Invalid roll number.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy.');
  try {
    const { sheet, headers } = smSheet_('Students', ['Student_ID', 'Grade', 'Section', 'Roll_No']);
    const rows = sheet.getDataRange().getValues();
    const ix = headers.indexOf('Student_ID');
    const gIx = headers.indexOf('Grade'), sIx = headers.indexOf('Section');
    const rIx = headers.indexOf('Roll_No'), aIx = headers.indexOf('Active');

    const matches = [];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][ix]).trim() === id) matches.push(i);
    }
    if (matches.length !== 1) throw new Error('Student ID not found or duplicated.');

    const i = matches[0];
    const before = rows[i].slice(0, headers.length);
    const r = {};
    headers.forEach((h, j) => { r[h] = before[j]; });
    if (!attActive_(r.Active)) throw new Error('Cannot edit a student who has left.');

    const targetGrade = Number(r.Grade);
    const targetSection = String(r.Section).trim().toUpperCase();
    for (let k = 1; k < rows.length; k++) {
      if (
        String(rows[k][ix]).trim() !== id &&
        Number(rows[k][gIx]) === targetGrade &&
        String(rows[k][sIx]).trim().toUpperCase() === targetSection &&
        Number(rows[k][rIx]) === roll &&
        (aIx < 0 || attActive_(rows[k][aIx]))
      ) {
        throw new Error('Roll number already used.');
      }
    }

    const updated = { ...r, Name: name, Student_Name: name, Gender: gender, Roll_No: roll };
    smWrite_(sheet, headers, updated, i + 1);
    try {
      ctAudit_(user, 'STUDENT_EDITED', id + ' ' + JSON.stringify({
        before: { name: r.Name || r.Student_Name, gender: r.Gender, roll: r.Roll_No },
        after: { name, gender, roll },
        reason: why
      }));
    } catch (e) {
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([before]);
      throw e;
    }
    appBumpCacheVersion_('STU');
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function smTransferStudent(token, studentId, grade, section, effectiveDate, reason) {
  const user = authRequire_(token, 'ADMIN');
  const id = smRequired_(studentId, 'Student ID', 100);
  const why = smRequired_(reason, 'Reason', 250);
  const c = smClass_(grade, section);
  const date = smDate_(effectiveDate);
  if (date !== attToday_()) throw new Error('This version supports same-day transfers only.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy.');
  try {
    const { sheet, headers } = smSheet_('Students', ['Student_ID', 'Grade', 'Section', 'Class_ID', 'Roll_No']);
    const values = sheet.getDataRange().getValues();
    const idx = headers.indexOf('Student_ID');
    const gIx = headers.indexOf('Grade'), sIx = headers.indexOf('Section');
    const rIx = headers.indexOf('Roll_No'), aIx = headers.indexOf('Active');

    const matches = [];
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idx]).trim() === id) matches.push(i);
    }
    if (matches.length !== 1) throw new Error('Student ID not found or duplicated.');

    const i = matches[0];
    const before = values[i].slice(0, headers.length);
    const r = {};
    headers.forEach((h, j) => { r[h] = before[j]; });

    if (!attActive_(r.Active)) throw new Error('Student has already left.');
    if (Number(r.Grade) === c.grade && String(r.Section).trim().toUpperCase() === c.section) {
      throw new Error('Already in selected class.');
    }
    if (!getClassesCached_().some(x => x.grade === c.grade && x.section === c.section && x.active)) {
      throw new Error('Destination class is not active.');
    }

    // Column-indexed single-column scan of Attendance Student_ID
    const attSheet = getRequiredSheet('Attendance');
    const attLast = attSheet.getLastRow();
    if (attLast > 1) {
      const attHeaders = attSheet.getRange(1, 1, 1, attSheet.getLastColumn()).getValues()[0].map(String);
      const attIdIdx = attHeaders.indexOf('Student_ID');
      if (attIdIdx >= 0) {
        const idCol = attSheet.getRange(2, attIdIdx + 1, attLast - 1, 1).getValues();
        for (let k = 0; k < idCol.length; k++) {
          if (String(idCol[k][0]).trim() === id) {
            throw new Error('This student has attendance history. Transfer is blocked until historical enrollment-aware reporting is implemented.');
          }
        }
      }
    }

    const roll = Number(r.Roll_No);
    for (let k = 1; k < values.length; k++) {
      if (
        String(values[k][idx]).trim() !== id &&
        Number(values[k][gIx]) === c.grade &&
        String(values[k][sIx]).trim().toUpperCase() === c.section &&
        Number(values[k][rIx]) === roll &&
        (aIx < 0 || attActive_(values[k][aIx]))
      ) {
        throw new Error('Roll number is occupied in destination class. Edit the roll number first.');
      }
    }

    const updated = { ...r, Grade: c.grade, Section: c.section, Class_ID: c.name };
    smWrite_(sheet, headers, updated, i + 1);
    try {
      ctAudit_(user, 'STUDENT_TRANSFERRED', id + ' ' + r.Grade + r.Section + ' to ' + c.name + ' ' + date + ' Reason: ' + why);
    } catch (e) {
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([before]);
      throw e;
    }
    appBumpCacheVersion_('STU');
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}