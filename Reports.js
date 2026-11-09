/** Professional A4 attendance reports. Admin-only; fictional-data prototype.
 * Pure Apps Script vector PDF: no Drive scope or external service.
 * Helvetica supports Latin text only; non-ASCII characters are replaced.
 */
function rptValidate_(token, year, term) {
  authRequire_(token, 'ADMIN');
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('Invalid year.');
  const terms = attRecords_(getRequiredSheet('Academic_Terms')).filter(r => Number(r.Academic_Year) === y);
  const t = String(term || 'ALL');
  if (t !== 'ALL' && !terms.some(r => String(r.Term) === t)) throw new Error('Unknown term.');
  const selected = terms.find(r => String(r.Term) === t);
  return {year:y, term:t, start:selected ? attDate_(selected.Start_Date) : y+'-01-01',
    end:selected ? attDate_(selected.End_Date) : y+'-12-31'};
}
function rptData_(scope) {
  const records = attRecords_(getRequiredSheet('Attendance')).filter(r => {
    const date = attDate_(r.Date);
    return date && date >= scope.start && date <= scope.end &&
      Number(r.Academic_Year || date.slice(0,4)) === scope.year &&
      ['PRESENT','ABSENT','LATE'].includes(String(r.Status || '').toUpperCase());
  });
  const students = attRecords_(getRequiredSheet('Students'));
  const names = new Map(students.map(r => [String(r.Student_ID), String(r.Name || r.Student_Name || '')]));
  const summary = new Map();
  records.forEach(r => {
    const id = String(r.Student_ID || '').trim();
    if (!id) return;
    const date = attDate_(r.Date);
    const cls = String(r.Class_ID || (String(r.Grade) + String(r.Section))).trim().toUpperCase();
    const status = String(r.Status).trim().toUpperCase();
    if (!summary.has(id)) summary.set(id, {id, name:names.get(id) || String(r.Student_Name || id),
      grade:Number(r.Grade), cls, present:0, absent:0, late:0, days:new Set(), dates:[]});
    const x = summary.get(id);
    if (x.days.has(date)) throw new Error('Duplicate attendance for student '+id+' on '+date+'. Correct the sheet before exporting.');
    x.days.add(date); x[status.toLowerCase()]++; x.dates.push({date,status});
  });
  return [...summary.values()].map(x => ({id:x.id,name:x.name,grade:x.grade,cls:x.cls,
    present:x.present,absent:x.absent,late:x.late,total:x.days.size,
    percent:x.days.size ? Math.round(10000*(x.present+x.late)/x.days.size)/100 : 0,
    dates:x.dates.sort((a,b)=>a.date.localeCompare(b.date))}))
    .sort((a,b)=>a.grade-b.grade || a.cls.localeCompare(b.cls,undefined,{numeric:true}) || a.name.localeCompare(b.name));
}
function rptEscape_(v) {
  return String(v == null ? '' : v).replace(/[^\x20-\x7E]/g,'?')
    .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function rptFilename_(s) {return String(s).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,60);}

/** columns: {title,width,align?}. Widths are proportional and scaled to fit A4. */
function rptDocument_(title, scope, columns, rows, info, notes) {
  const W=595.28,H=841.89,L=42,R=42,WIDTH=W-L-R;
  const DARK=[0.09,0.17,0.30],BLUE=[0.10,0.31,0.66],MUTED=[0.39,0.46,0.55];
  const pages=[];let ops=[],y=0,page=0;
  const rgb=c=>c.map(n=>n.toFixed(3)).join(' ');
  const ascii=v=>String(v==null?'':v).replace(/[^\x20-\x7E]/g,'?');
  function text(t,x,yy,size,bold,color,align,maxWidth) {
    t=ascii(t);const estimate=s=>s.length*size*(bold?0.56:0.51);
    if(maxWidth)while(t.length>1 && estimate(t)>maxWidth)t=t.slice(0,-2)+'…';
    t=t.replace(/…/g,'...');
    const width=estimate(t);
    if(align==='right')x-=width;else if(align==='center')x-=width/2;
    ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+rgb(color||DARK)+' rg 1 0 0 1 '+x.toFixed(2)+' '+yy.toFixed(2)+' Tm ('+rptEscape_(t)+') Tj ET');
  }
  function fill(x,yy,w,h,c){ops.push(rgb(c)+' rg '+[x,yy,w,h].map(n=>n.toFixed(2)).join(' ')+' re f');}
  function line(yy,c){ops.push(rgb(c||[0.85,0.88,0.92])+' RG 0.6 w '+L+' '+yy.toFixed(2)+' m '+(W-R)+' '+yy.toFixed(2)+' l S');}
  function top() {
    ops=[];page++;
    fill(0,H-72,W,72,BLUE);
    text('SMART SCHOOL ATTENDANCE SYSTEM',L,H-33,12,true,[1,1,1]);
    text('OFFICIAL ATTENDANCE SUMMARY',L,H-51,8,false,[0.88,0.94,1]);
    text('ACADEMIC REPORT',W-R,H-34,9,true,[1,1,1],'right');
    text(title.toUpperCase(),L,H-101,16,true,DARK,undefined,WIDTH);
    text('ACADEMIC YEAR  '+scope.year+'     TERM  '+scope.term+'     PERIOD  '+scope.start+'  -  '+scope.end,
      L,H-120,8,false,MUTED,undefined,WIDTH);
    line(H-132);y=H-151;
    if(info&&info.length){
      const h=info.length*17+16;
      fill(L,y-h,WIDTH,h,[0.94,0.97,1]);
      fill(L,y-h,3,h,BLUE);
      info.forEach((v,i)=>text(v,L+14,y-23-i*17,i===0?10:9,i===0,DARK,undefined,WIDTH-28));
      y-=h+20;
    }
  }
  function bottom(){
    line(58);
    text('Generated '+Utilities.formatDate(new Date(),ATT_TZ_,'dd MMM yyyy  HH:mm'),L,43,8,false,MUTED);
    text('Page '+page,W-R,43,8,true,MUTED,'right');
    text('Computer-generated report | For authorized school use',L,29,7,false,MUTED);
    pages.push(ops.join('\n')+'\n');
  }
  const totalWidth=columns.reduce((s,c)=>s+Number(c.width||1),0);
  const widths=columns.map(c=>WIDTH*Number(c.width||1)/totalWidth);
  function tableHead(){
    fill(L,y-29,WIDTH,29,[0.86,0.91,0.98]);
    let x=L;
    columns.forEach((c,i)=>{
      const right=c.align==='right';
      text(c.title,right?x+widths[i]-8:x+8,y-19,8,true,BLUE,right?'right':undefined,widths[i]-16);
      x+=widths[i];
    });
    y-=30;
  }
  top();tableHead();
  rows.forEach((row,i)=>{
    if(y<105){bottom();top();tableHead();}
    const h=25;
    if(i%2===1)fill(L,y-h,WIDTH,h,[0.965,0.975,0.99]);
    let x=L;
    columns.forEach((c,j)=>{
      const v=Array.isArray(row)?row[j]:row[c.key];
      const right=c.align==='right';
      text(v,right?x+widths[j]-8:x+8,y-17,8,false,DARK,right?'right':undefined,widths[j]-16);
      x+=widths[j];
    });
    line(y-h);y-=h;
  });
  if(!rows.length){text('No records available.',L+10,y-20,9,false,MUTED);y-=35;}
  if(notes&&notes.length){
    if(y<105+notes.length*15){bottom();top();}
    y-=20;
    text('REPORT NOTES',L,y,9,true,BLUE);y-=17;
    notes.forEach(n=>{text(n,L,y,8,false,MUTED,undefined,WIDTH);y-=15;});
  }
  bottom();
  // Add consistent total page counts after all pages are known.
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const kids=[];
  pages.forEach(stream=>{
    const id=objects.length,content=id+1;kids.push(id+' 0 R');
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents '+content+' 0 R >>');
    objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
  });
  objects[2]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages.length+' >>';
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets.push(pdf.length);pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=pdf.length;pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return Utilities.newBlob(pdf,'application/pdf','attendance-report.pdf');
}
function rptStudent_(x,scope) {
  const cols=[{title:'DATE',width:170},{title:'ATTENDANCE STATUS',width:340}];
  const rows=x.dates.map(d=>[d.date,d.status]);
  const info=['STUDENT  '+x.name+'     ID  '+x.id+'     CLASS  '+x.cls,
    'Present  '+x.present+'     Absent  '+x.absent+'     Late  '+x.late+'     Completed days  '+x.total,
    'ATTENDANCE RATE  '+x.percent+'%'];
  return rptDocument_('Individual Student Attendance',scope,cols,rows,info,
    ['Attendance rate = (Present + Late) / Completed days.',
      'Pending days are excluded. Late is counted as attended.']);
}
function rptSummary_(kind,selected,scope) {
  const cols=[{title:'STUDENT ID',width:88},{title:'STUDENT NAME',width:168},
    {title:'CLASS',width:52},{title:'P',width:32,align:'right'},
    {title:'A',width:32,align:'right'},{title:'L',width:32,align:'right'},
    {title:'DAYS',width:46,align:'right'},{title:'RATE',width:61,align:'right'}];
  const rows=selected.map(x=>[x.id,x.name,x.cls,x.present,x.absent,x.late,x.total,x.percent+'%']);
  const attended=selected.reduce((n,x)=>n+x.present+x.late,0);
  const days=selected.reduce((n,x)=>n+x.total,0);
  const rate=days?Math.round(attended*10000/days)/100:0;
  const info=['STUDENTS WITH RECORDS  '+selected.length+'     OVERALL ATTENDANCE RATE  '+rate+'%',
    'P = Present     A = Absent     L = Late     Days = Completed attendance days'];
  return rptDocument_(kind+' Attendance Summary',scope,cols,rows,info,
    ['Attendance rate = (Present + Late) / Completed days.',
     'Only submitted records are included; pending days are excluded.']);
}
function getAttendanceReportOptions(token,year) {
  authRequire_(token,'ADMIN');const y=Number(year);
  if(!Number.isInteger(y)||y<2000||y>2100)throw new Error('Invalid year.');
  return {terms:attRecords_(getRequiredSheet('Academic_Terms')).filter(r=>Number(r.Academic_Year)===y)
    .map(r=>String(r.Term)),students:attRecords_(getRequiredSheet('Students'))
    .map(r=>({id:String(r.Student_ID),name:String(r.Name||r.Student_Name||''),grade:Number(r.Grade),cls:String(r.Class_ID||'')}))};
}
function generateAttendanceReport(token,year,term,type,filter) {
  const scope=rptValidate_(token,year,term),data=rptData_(scope);
  const f=String(filter||'').trim(),kind=String(type||'');let blob,filename;
  if(kind==='STUDENT'){
    const x=data.find(s=>s.id===f);
    if(!x)throw new Error('No submitted attendance for this student in the selected period.');
    blob=rptStudent_(x,scope);filename='Student_'+rptFilename_(x.id)+'.pdf';
  }else if(['CLASS','GRADE','SCHOOL'].includes(kind)){
    const selected=data.filter(x=>kind==='SCHOOL'||(kind==='GRADE'?x.grade===Number(f):x.cls===f.toUpperCase()));
    if(!selected.length)throw new Error('No submitted attendance records for this selection.');
    blob=rptSummary_(kind,selected,scope);filename=kind+'_'+rptFilename_(f||scope.year)+'.pdf';
  }else if(['GRADE_ZIP','SCHOOL_ZIP'].includes(kind)){
    const selected=data.filter(x=>kind==='SCHOOL_ZIP'||x.grade===Number(f));
    if(!selected.length)throw new Error('No submitted attendance records for this selection.');
    if(selected.length>500)throw new Error('Too many reports for one export; export grade-wise.');
    const files=selected.map(x=>rptStudent_(x,scope).setName('Student_'+rptFilename_(x.id)+'.pdf'));
    blob=Utilities.zip(files,'attendance-reports.zip');
    filename=(kind==='GRADE_ZIP'?'Grade_'+rptFilename_(f):'School')+'_Reports.zip';
  }else throw new Error('Invalid report type.');
  const bytes=blob.getBytes();
  if(bytes.length>8*1024*1024)throw new Error('Export too large; use a smaller selection.');
  return {filename,mime:blob.getContentType(),base64:Utilities.base64Encode(bytes)};
}
