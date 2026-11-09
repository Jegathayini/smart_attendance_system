/** Smart School Attendance — admin register management (fictional-data testing). */
function smSheet_(name, required) {
  const sheet=getRequiredSheet(name);
  const headers=attHeaders_(sheet,required);
  return {sheet,headers};
}
function smWrite_(sheet,headers,data,row) {
  sheet.getRange(row,1,1,headers.length).setValues([headers.map(h=>Object.prototype.hasOwnProperty.call(data,h)?data[h]:'')]);
}
function smYear_(){return Number(Utilities.formatDate(new Date(),'Asia/Colombo','yyyy'));}
function smClass_(grade,section){return attClass_(grade,section);}
function smRequired_(value,label,max){const s=String(value==null?'':value).trim();if(!s||s.length>max)throw new Error(label+' is required (max '+max+' characters).');return s;}
function smDate_(value){const s=String(value||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Use a valid YYYY-MM-DD date.');return s;}
function smList(token,grade){
  authRequire_(token,'ADMIN');
  const g=Number(grade);if(!Number.isInteger(g)||g<1||g>13)throw new Error('Select a grade.');
  const classes=attRecords_(getRequiredSheet('Classes')).filter(r=>Number(r.Grade)===g).map(r=>({name:String(r.Class_Name||g+String(r.Section).toUpperCase()),section:String(r.Section||'').toUpperCase(),active:attActive_(r.Active)}));
  const students=attRecords_(getRequiredSheet('Students')).filter(r=>Number(r.Grade)===g).map(r=>({id:String(r.Student_ID||''),admission:String(r.Admission_No||''),name:String(r.Name||r.Student_Name||''),grade:g,section:String(r.Section||'').toUpperCase(),roll:String(r.Roll_No||''),gender:String(r.Gender||''),active:attActive_(r.Active),admitted:attDate_(r.Admission_Date),left:attDate_(r.Leaving_Date)}));
  return {classes,students};
}
function smAddClass(token,grade,section){
  const user=authRequire_(token,'ADMIN'),c=smClass_(grade,section);
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy.');
  try{
    const {sheet,headers}=smSheet_('Classes',['Grade','Section','Class_Name']);
    if(attRecords_(sheet).some(r=>Number(r.Grade)===c.grade&&String(r.Section).trim().toUpperCase()===c.section))throw new Error('Section already exists.');
    const data={Class_ID:c.name,Grade:c.grade,Section:c.section,Class_Name:c.name,Active:true,Academic_Year:smYear_()};
    const row=sheet.getLastRow()+1;smWrite_(sheet,headers,data,row);
    try{ctAudit_(user,'CLASS_CREATED',c.name);}catch(e){sheet.deleteRow(row);throw e;}
    return {success:true};
  }finally{lock.releaseLock();}
}
function smAddStudent(token,student){
  const user=authRequire_(token,'ADMIN');if(!student||typeof student!=='object')throw new Error('Missing student details.');
  const c=smClass_(student.grade,student.section);
  const name=smRequired_(student.name,'Student name',120),admission=smRequired_(student.admission,'Admission number',60);
  const gender=String(student.gender||'').toUpperCase();if(!['MALE','FEMALE','OTHER'].includes(gender))throw new Error('Select gender.');
  const roll=Number(student.roll);if(!Number.isInteger(roll)||roll<1||roll>9999)throw new Error('Invalid roll number.');
  const admitted=smDate_(student.admitted);
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy.');
  try{
    const active=attRecords_(getRequiredSheet('Classes')).some(r=>Number(r.Grade)===c.grade&&String(r.Section).toUpperCase()===c.section&&attActive_(r.Active));
    if(!active)throw new Error('Class does not exist or is inactive.');
    const {sheet,headers}=smSheet_('Students',['Student_ID','Admission_No','Grade','Section','Class_ID']);
    const rows=attRecords_(sheet);
    if(rows.some(r=>String(r.Admission_No).trim().toLowerCase()===admission.toLowerCase()))throw new Error('Admission number already exists.');
    if(rows.some(r=>Number(r.Grade)===c.grade&&String(r.Section).toUpperCase()===c.section&&Number(r.Roll_No)===roll&&attActive_(r.Active)))throw new Error('Roll number already used in this class.');
    const id='STU-'+Utilities.getUuid().slice(0,12).toUpperCase();
    const data={Student_ID:id,Admission_No:admission,Name:name,Student_Name:name,Grade:c.grade,Section:c.section,Class_ID:c.name,Roll_No:roll,Gender:gender,Admission_Date:admitted,Active:true,Academic_Year:smYear_()};
    const row=sheet.getLastRow()+1;smWrite_(sheet,headers,data,row);
    try{ctAudit_(user,'STUDENT_CREATED',id+' '+c.name);}catch(e){sheet.deleteRow(row);throw e;}
    return {success:true,id};
  }finally{lock.releaseLock();}
}
function smDeactivateStudent(token,id,departureDate,reason){
  const user=authRequire_(token,'ADMIN');
  const studentId=smRequired_(id,'Student ID',100),date=smDate_(departureDate),why=smRequired_(reason,'Reason',250);
  if(date>attToday_())throw new Error('Future departure dates are not supported yet.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy.');
  try{
    const {sheet,headers}=smSheet_('Students',['Student_ID','Active','Leaving_Date']);
    const values=sheet.getDataRange().getValues(),idx=headers.indexOf('Student_ID');
    const found=[];for(let i=1;i<values.length;i++)if(String(values[i][idx])===studentId)found.push(i+1);
    if(found.length!==1)throw new Error('Student ID not found or duplicated.');
    const row=found[0],before=sheet.getRange(row,1,1,headers.length).getValues()[0];
    const record={};headers.forEach((h,i)=>record[h]=before[i]);
    if(!attActive_(record.Active))throw new Error('Student already inactive.');
    const admission=attDate_(record.Admission_Date);if(admission&&date<admission)throw new Error('Departure is before admission.');
    const updated={...record,Active:false,Leaving_Date:date};
    smWrite_(sheet,headers,updated,row);
    try{ctAudit_(user,'STUDENT_DEACTIVATED',studentId+' '+date+' Reason: '+why);}catch(e){sheet.getRange(row,1,1,headers.length).setValues([before]);throw e;}
    return {success:true};
  }finally{lock.releaseLock();}
}


/** Edit non-enrollment details only; does not change student identity or class. */
function smEditStudent(token,studentId,changes,reason){
  const user=authRequire_(token,'ADMIN');
  const id=smRequired_(studentId,'Student ID',100);
  const why=smRequired_(reason,'Reason',250);
  if(!changes||typeof changes!=='object')throw new Error('Missing changes.');
  const name=smRequired_(changes.name,'Name',120);
  const gender=String(changes.gender||'').trim().toUpperCase();
  if(!['MALE','FEMALE','OTHER'].includes(gender))throw new Error('Invalid gender.');
  const roll=Number(changes.roll);
  if(!Number.isInteger(roll)||roll<1||roll>9999)throw new Error('Invalid roll number.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy.');
  try{
    const {sheet,headers}=smSheet_('Students',['Student_ID','Grade','Section','Roll_No']);
    const rows=sheet.getDataRange().getValues(),ix=headers.indexOf('Student_ID');
    const matches=[];for(let i=1;i<rows.length;i++)if(String(rows[i][ix]).trim()===id)matches.push(i);
    if(matches.length!==1)throw new Error('Student ID not found or duplicated.');
    const i=matches[0],before=rows[i].slice(0,headers.length),r={};headers.forEach((h,j)=>r[h]=before[j]);
    if(!attActive_(r.Active))throw new Error('Cannot edit an inactive student.');
    if(attRecords_(sheet).some(other=>String(other.Student_ID)!==id&&Number(other.Grade)===Number(r.Grade)&&String(other.Section).trim().toUpperCase()===String(r.Section).trim().toUpperCase()&&Number(other.Roll_No)===roll&&attActive_(other.Active)))throw new Error('Roll number already used.');
    const updated={...r,Name:name,Student_Name:name,Gender:gender,Roll_No:roll};
    smWrite_(sheet,headers,updated,i+1);
    try{ctAudit_(user,'STUDENT_EDITED',id+' '+JSON.stringify({before:{name:r.Name||r.Student_Name,gender:r.Gender,roll:r.Roll_No},after:{name,gender,roll},reason:why}));}
    catch(e){sheet.getRange(i+1,1,1,headers.length).setValues([before]);throw e;}
    return {success:true};
  }finally{lock.releaseLock();}
}

/** Safe transfer: prevent changing current class when prior attendance exists.
 * Full historical enrollment model is required for transfers of students with attendance.
 */
function smTransferStudent(token,studentId,grade,section,effectiveDate,reason){
  const user=authRequire_(token,'ADMIN');
  const id=smRequired_(studentId,'Student ID',100),why=smRequired_(reason,'Reason',250);
  const c=smClass_(grade,section),date=smDate_(effectiveDate);
  if(date!==attToday_())throw new Error('This version supports same-day transfers only.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy.');
  try{
    const {sheet,headers}=smSheet_('Students',['Student_ID','Grade','Section','Class_ID','Roll_No']);
    const values=sheet.getDataRange().getValues(),idx=headers.indexOf('Student_ID');
    const matches=[];for(let i=1;i<values.length;i++)if(String(values[i][idx]).trim()===id)matches.push(i);
    if(matches.length!==1)throw new Error('Student ID not found or duplicated.');
    const i=matches[0],before=values[i].slice(0,headers.length),r={};headers.forEach((h,j)=>r[h]=before[j]);
    if(!attActive_(r.Active))throw new Error('Student is inactive.');
    if(Number(r.Grade)===c.grade&&String(r.Section).trim().toUpperCase()===c.section)throw new Error('Already in selected class.');
    if(!attRecords_(getRequiredSheet('Classes')).some(x=>Number(x.Grade)===c.grade&&String(x.Section).trim().toUpperCase()===c.section&&attActive_(x.Active)))throw new Error('Destination class is not active.');
    // Current report and roster implementations use the current Students row.
    // Do not allow a transfer that could change historical report membership.
    if(attRecords_(getRequiredSheet('Attendance')).some(x=>String(x.Student_ID).trim()===id))throw new Error('This student has attendance history. Transfer is blocked until historical enrollment-aware reporting is implemented.');
    const roll=Number(r.Roll_No);
    if(attRecords_(sheet).some(x=>String(x.Student_ID)!==id&&Number(x.Grade)===c.grade&&String(x.Section).trim().toUpperCase()===c.section&&Number(x.Roll_No)===roll&&attActive_(x.Active)))throw new Error('Roll number is occupied in destination class. Edit the roll number first.');
    const updated={...r,Grade:c.grade,Section:c.section,Class_ID:c.name};
    smWrite_(sheet,headers,updated,i+1);
    try{ctAudit_(user,'STUDENT_TRANSFERRED',id+' '+r.Grade+r.Section+' to '+c.name+' '+date+' Reason: '+why);}
    catch(e){sheet.getRange(i+1,1,1,headers.length).setValues([before]);throw e;}
    return {success:true};
  }finally{lock.releaseLock();}
}
