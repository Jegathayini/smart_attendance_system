/** Admin review, verification and corrections. Fictional-data testing only. */
const ATT_REVIEW_HEADERS_ = ['Date','Class_ID','Verified_By','Verified_At','Revision'];
function attReviewSheet_() {
  const db = getDatabase();
  let sheet = db.getSheetByName('Attendance_Verifications');
  if (!sheet) {
    sheet = db.insertSheet('Attendance_Verifications');
    sheet.getRange(1,1,1,ATT_REVIEW_HEADERS_.length).setValues([ATT_REVIEW_HEADERS_]);
    sheet.setFrozenRows(1);
  }
  attHeaders_(sheet,ATT_REVIEW_HEADERS_);
  return sheet;
}
function attReviewDate_(date) {
  const value = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || attDate_(value) !== value ||
      !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value ||
      value > attToday_()) throw new Error('Select a valid date not in the future.');
  return value;
}
function attReviewData_(date,cls) {
  const sheet = getRequiredSheet('Attendance');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idx = name => headers.indexOf(name);
  ['Date','Grade','Section','Student_ID','Status'].forEach(h => {
    if (idx(h) < 0) throw new Error('Attendance sheet missing column: ' + h);
  });
  const rows = [];
  for (let i=1;i<values.length;i++) {
    const v = values[i];
    if (attDate_(v[idx('Date')]) === date && Number(v[idx('Grade')]) === cls.grade &&
        String(v[idx('Section')]).trim().toUpperCase() === cls.section) {
      const record = {};
      headers.forEach((h,j) => record[h]=v[j]);
      rows.push({rowNumber:i+1,record});
    }
  }
  return {sheet,headers,rows};
}
function attReviewInfo_(date,cls) {
  const sheet=attReviewSheet_();
  const records=attRecords_(sheet).filter(r=>attDate_(r.Date)===date && String(r.Class_ID)===cls.name);
  return records.length ? records[records.length-1] : null;
}
function attReviewAudit_(action, actor, date, cls, details, reason, studentId, oldStatus, newStatus) {
  const audit = getRequiredSheet('Audit_Log');
  const headers = attHeaders_(audit,[]);
  const data = {
    Audit_ID:Utilities.getUuid(),Timestamp:new Date(),Date:date,
    Action:action,Event:action,Actor:actor,Username:actor,Performed_By:actor,
    Class_ID:cls.name,Student_ID:studentId || '',Old_Status:oldStatus || '',
    New_Status:newStatus || '',Details:details,Reason:reason || ''
  };
  audit.getRange(audit.getLastRow()+1,1,1,headers.length).setValues([
    headers.map(h=>Object.prototype.hasOwnProperty.call(data,h)?data[h]:'')
  ]);
}
function adminGetAttendanceReview(token,date,grade,section) {
  authRequire_(token,'ADMIN');
  date=attReviewDate_(date);
  const cls=attClass_(grade,section);
  const data=attReviewData_(date,cls);
  const verification=attReviewInfo_(date,cls);
  return {
    date,className:cls.name,submitted:data.rows.length>0,
    verified:!!verification,verifiedBy:verification?String(verification.Verified_By):'',
    students:data.rows.map(({record:r})=>({
      studentId:String(r.Student_ID),name:String(r.Student_Name||''),
      status:String(r.Status).toUpperCase(),rollNo:String(r.Roll_No||''),
      admissionNo:String(r.Admission_No||'')
    }))
  };
}
function adminVerifyAttendance(token,date,grade,section) {
  const user=authRequire_(token,'ADMIN');
  date=attReviewDate_(date);
  const cls=attClass_(grade,section);
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy. Retry.');
  try {
    const data=attReviewData_(date,cls);
    if (!data.rows.length) throw new Error('Attendance not submitted for this class/date.');
    if (attReviewInfo_(date,cls)) throw new Error('Already verified.');
    const actor=String(user.username||user.name||'Admin');
    const sheet=attReviewSheet_();
    const headers=attHeaders_(sheet,ATT_REVIEW_HEADERS_);
    const record={Date:date,Class_ID:cls.name,Verified_By:actor,Verified_At:new Date(),Revision:1};
    const rowNumber=sheet.getLastRow()+1;
    sheet.getRange(rowNumber,1,1,headers.length).setValues([headers.map(h=>record[h]||'')]);
    try { attReviewAudit_('ATTENDANCE_VERIFIED',actor,date,cls,'Verified '+data.rows.length+' records',''); }
    catch(e) { sheet.deleteRow(rowNumber); throw e; }
    return {success:true,count:data.rows.length};
  } finally { lock.releaseLock(); }
}
function adminCorrectAttendance(token,date,grade,section,studentId,newStatus,reason) {
  const user=authRequire_(token,'ADMIN');
  date=attReviewDate_(date);
  const cls=attClass_(grade,section);
  studentId=String(studentId||'').trim();
  newStatus=String(newStatus||'').trim().toUpperCase();
  reason=String(reason||'').trim();
  if (!ATT_ALLOWED_.includes(newStatus)) throw new Error('Invalid attendance status.');
  if (reason.length<5 || reason.length>500) throw new Error('Correction reason must be 5–500 characters.');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('System busy. Retry.');
  try {
    const data=attReviewData_(date,cls);
    const matches=data.rows.filter(x=>String(x.record.Student_ID).trim()===studentId);
    if (matches.length!==1) throw new Error('Student attendance record missing or duplicated.');
    const target=matches[0];
    const oldStatus=String(target.record.Status).toUpperCase();
    if (oldStatus===newStatus) throw new Error('New status must differ from current status.');
    const statusColumn=data.headers.indexOf('Status')+1;
    const actor=String(user.username||user.name||'Admin');
    data.sheet.getRange(target.rowNumber,statusColumn).setValue(newStatus);
    try {
      attReviewAudit_('ATTENDANCE_CORRECTED',actor,date,cls,
        'Student '+studentId+': '+oldStatus+' → '+newStatus,reason,studentId,oldStatus,newStatus);
    } catch(e) {
      data.sheet.getRange(target.rowNumber,statusColumn).setValue(oldStatus);
      throw e;
    }
    // A correction after verification requires a new verification.
    const review=attReviewSheet_();
    const all=review.getDataRange().getValues();
    const h=all[0].map(String), d=h.indexOf('Date'), c=h.indexOf('Class_ID');
    for(let i=all.length-1;i>=1;i--) {
      if(attDate_(all[i][d])===date && String(all[i][c])===cls.name) review.deleteRow(i+1);
    }
    return {success:true,oldStatus,newStatus,requiresVerification:true};
  } finally { lock.releaseLock(); }
}
