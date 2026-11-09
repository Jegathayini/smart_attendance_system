/** Admin-managed school calendar and academic terms. Fictional-data testing only. */
const CT_CAL_HEADERS_ = ['Date','Day_Type','Description','Is_School_Day'];
const CT_TERM_HEADERS_ = ['Academic_Year','Term','Start_Date','End_Date'];
function ctSheet_(name, headers) {
  const sheet = getRequiredSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  const existing = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
  headers.forEach(h => { if (!existing.includes(h)) throw new Error(name+' sheet is missing column '+h+'. Add it to row 1 (existing data was not modified).'); });
  return {sheet, headers:existing};
}
function ctIso_(value) {
  const d=attDate_(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d+'T12:00:00Z')) || new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d) throw new Error('Invalid date: '+value);
  return d;
}
function ctWrite_(sheet,headers,obj) { sheet.getRange(sheet.getLastRow()+1,1,1,headers.length).setValues([headers.map(h=>Object.prototype.hasOwnProperty.call(obj,h)?obj[h]:'')]); }
function ctAudit_(user,action,details) {
  const sh=getRequiredSheet('Audit_Log');
  const headers=attHeaders_(sh,[]);
  const who=String(user.username||user.name||'Admin');
  const record={Audit_ID:Utilities.getUuid(),Timestamp:new Date(),Action:action,Event:action,Actor:who,Username:who,Performed_By:who,Details:details,Reason:details};
  ctWrite_(sh,headers,record);
}
function adminGetCalendarTerms(token, year) {
  authRequire_(token,'ADMIN');
  const y=Number(year);
  if (!Number.isInteger(y)||y<2000||y>2100) throw new Error('Invalid year');
  const calendar=attRecords_(ctSheet_('School_Calendar',CT_CAL_HEADERS_).sheet)
    .filter(r=>attDate_(r.Date||r.Calendar_Date).startsWith(String(y)))
    .map(r=>({date:attDate_(r.Date||r.Calendar_Date),type:String(r.Day_Type||r.Type||r.Status||'').toUpperCase(),description:String(r.Description||''),schoolDay:String(r.Is_School_Day).toUpperCase()}))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const terms=attRecords_(ctSheet_('Academic_Terms',CT_TERM_HEADERS_).sheet)
    .filter(r=>Number(r.Academic_Year)===y)
    .map(r=>({term:String(r.Term),start:attDate_(r.Start_Date),end:attDate_(r.End_Date)}))
    .sort((a,b)=>a.start.localeCompare(b.start));
  return {calendar,terms};
}
function adminSaveCalendarDay(token,date,type,description) {
  const user=authRequire_(token,'ADMIN');
  const d=ctIso_(date), t=String(type||'').toUpperCase();
  if (!['HOLIDAY','CLOSED','SCHOOL_DAY'].includes(t)) throw new Error('Invalid calendar type');
  const desc=String(description||'').trim();
  if (!desc||desc.length>200) throw new Error('Description required (max 200 characters).');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy');
  try {
    const {sheet,headers}=ctSheet_('School_Calendar',CT_CAL_HEADERS_);
    const existing=attRecords_(sheet);
    if(existing.some(r=>attDate_(r.Date||r.Calendar_Date)===d)) throw new Error('This date already has an entry. Delete it first to replace it.');
    const record={Date:d,Calendar_Date:d,Day_Type:t,Type:t,Status:t,Description:desc,Is_School_Day:t==='SCHOOL_DAY'};
    const row=sheet.getLastRow()+1;ctWrite_(sheet,headers,record);
    try {ctAudit_(user,'CALENDAR_CREATED',d+' '+t+' '+desc);}catch(e){sheet.deleteRow(row);throw e;}
    return {success:true};
  } finally {lock.releaseLock();}
}
function adminDeleteCalendarDay(token,date) {
  const user=authRequire_(token,'ADMIN'),d=ctIso_(date);
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy');
  try {
    const {sheet}=ctSheet_('School_Calendar',CT_CAL_HEADERS_);
    const rows=sheet.getDataRange().getValues(),headers=rows[0].map(String);
    const idx=headers.indexOf('Date')>=0?headers.indexOf('Date'):headers.indexOf('Calendar_Date');
    const found=[];for(let i=1;i<rows.length;i++)if(attDate_(rows[i][idx])===d)found.push(i+1);
    if(found.length!==1)throw new Error('Expected exactly one entry for this date.');
    ctAudit_(user,'CALENDAR_DELETED',d);
    sheet.deleteRow(found[0]);return {success:true};
  }finally{lock.releaseLock();}
}
function adminSaveAcademicTerm(token,year,term,start,end) {
  const user=authRequire_(token,'ADMIN'),y=Number(year),name=String(term||'').trim();
  const a=ctIso_(start),b=ctIso_(end);
  if(!Number.isInteger(y)||y<2000||y>2100||!name||name.length>50||a>b||Number(a.slice(0,4))!==y||Number(b.slice(0,4))!==y)throw new Error('Invalid term/year/date range.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw new Error('System busy');
  try {
    const {sheet,headers}=ctSheet_('Academic_Terms',CT_TERM_HEADERS_);
    const terms=attRecords_(sheet).filter(r=>Number(r.Academic_Year)===y);
    if(terms.some(r=>String(r.Term).trim().toLowerCase()===name.toLowerCase()))throw new Error('Term name already exists for this year.');
    if(terms.some(r=>a<=attDate_(r.End_Date)&&b>=attDate_(r.Start_Date)))throw new Error('Term overlaps an existing term.');
    const row=sheet.getLastRow()+1;ctWrite_(sheet,headers,{Academic_Year:y,Term:name,Start_Date:a,End_Date:b});
    try{ctAudit_(user,'TERM_CREATED',y+' '+name+' '+a+' to '+b);}catch(e){sheet.deleteRow(row);throw e;}
    return {success:true};
  }finally{lock.releaseLock();}
}
