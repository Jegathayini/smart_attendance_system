
/** Dashboard statistics: completed attendance only. Fictional-data demo. */
function getAttendanceDashboard(token, academicYear) {
  authRequire_(token);
  const year=Number(academicYear);
  if(!Number.isInteger(year)||year<2000||year>2100)throw new Error('Invalid academic year.');
  const today=attToday_();
  const rows=attRecords_(getRequiredSheet('Attendance')).filter(r=>{
    const d=attDate_(r.Date);return d&&d<=today&&Number(d.slice(0,4))===year;
  });
  const classes=attRecords_(getRequiredSheet('Classes')).filter(r=>attActive_(r.Active));
  const classNames=[...new Set(classes.map(r=>String(r.Class_Name||(String(r.Grade)+String(r.Section))).trim().toUpperCase()))];
  const make=name=>({name,present:0,absent:0,late:0,total:0,completedDays:0,attendancePercent:0});
  const overall=make('Whole School');
  const byGrade=new Map(),byClass=new Map(),byGender=new Map(),byGradeGender=new Map(),byClassGender=new Map();
  const sectionsByGrade=new Map(),completed=new Map();
  classes.forEach(c=>{const grade=String(c.Grade||'').trim(),cls=String(c.Class_Name||(grade+String(c.Section||''))).trim().toUpperCase();if(!grade||!cls)return;if(!sectionsByGrade.has(grade))sectionsByGrade.set(grade,new Set());sectionsByGrade.get(grade).add(cls);});
  const add=(target,status)=>{target.total++;target[status.toLowerCase()]++;};
  const todayStats={present:0,absent:0,late:0};
  rows.forEach(r=>{
    const status=String(r.Status||'').trim().toUpperCase();if(!['PRESENT','ABSENT','LATE'].includes(status))return;
    const grade=String(r.Grade||'').trim(),cls=String(r.Class_ID||(grade+String(r.Section||''))).trim().toUpperCase();
    const raw=String(r.Gender||'').trim().toLowerCase();
    const gender=['m','male','boy','boys'].includes(raw)?'Boys':['f','female','girl','girls'].includes(raw)?'Girls':'Unspecified';
    const date=attDate_(r.Date);if(!grade||!cls||!date)return;
    const key=date+'|'+cls;if(!completed.has(key))completed.set(key,{date,cls,grade});
    add(overall,status);if(date===today)todayStats[status.toLowerCase()]++;
    [[byGrade,grade],[byClass,cls],[byGender,gender],[byGradeGender,grade+'|'+gender],[byClassGender,cls+'|'+gender]].forEach(([map,k])=>{if(!map.has(k))map.set(k,make(k));add(map.get(k),status);});
  });
  completed.forEach(({grade,cls})=>{overall.completedDays++;if(byGrade.has(grade))byGrade.get(grade).completedDays++;if(byClass.has(cls))byClass.get(cls).completedDays++;});
  const finalize=item=>{item.attendancePercent=item.total?Math.round((item.present+item.late)*10000/item.total)/100:0;return item;};
  const toArray=map=>[...map.values()].map(finalize);
  const gradeRows=toArray(byGrade).sort((a,b)=>Number(a.name)-Number(b.name));
  const classRows=toArray(byClass).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  const genderRows=toArray(byGender).filter(x=>x.name!=='Unspecified');
  const gradeGenderRows=toArray(byGradeGender).map(x=>({...x,grade:x.name.split('|')[0],gender:x.name.split('|')[1]}));
  const classGenderRows=toArray(byClassGender).map(x=>({...x,className:x.name.split('|')[0],gender:x.name.split('|')[1]}));
  const multiSectionGrades=[...sectionsByGrade].filter(([g,s])=>s.size>1).map(([g])=>g);
  const multiSectionClasses=classRows.filter(x=>{const c=classes.find(r=>String(r.Class_Name||(String(r.Grade)+String(r.Section))).trim().toUpperCase()===x.name);return c&&multiSectionGrades.includes(String(c.Grade).trim());});
  const todayCompleted=new Set([...completed.values()].filter(x=>x.date===today).map(x=>x.cls));
  const pendingToday=year===Number(today.slice(0,4))?classNames.filter(c=>!todayCompleted.has(c)):[];
  // Student strength counts current enrolled students, not attendance records.
  const students=attRecords_(getRequiredSheet('Students'));
  const strength={total:0,boys:0,girls:0,grades:[]},strengthByGrade=new Map(),seen=new Set();
  students.forEach(r=>{
    const id=String(r.Student_ID||'').trim();if(!id||seen.has(id))return;seen.add(id);
    const admitted=attDate_(r.Admission_Date||r.Admitted_Date||r.Enrollment_Start||'');
    const departed=attDate_(r.Departure_Date||r.Leaving_Date||r.Enrollment_End||'');
    const active=String(r.Active===undefined?'true':r.Active).toLowerCase();
    if(['false','inactive','no','0'].includes(active)||(admitted&&admitted>today)||(departed&&departed<today))return;
    const grade=Number(r.Grade);if(!Number.isInteger(grade)||grade<1||grade>13)return;
    const raw=String(r.Gender||'').trim().toLowerCase();const gender=['m','male','boy','boys'].includes(raw)?'boys':['f','female','girl','girls'].includes(raw)?'girls':null;
    strength.total++;if(gender)strength[gender]++;
    if(!strengthByGrade.has(grade))strengthByGrade.set(grade,{grade,boys:0,girls:0,total:0});
    const item=strengthByGrade.get(grade);item.total++;if(gender)item[gender]++;
  });
  strength.grades=[...strengthByGrade.values()].sort((a,b)=>a.grade-b.grade);
  return {year,today,overall:finalize(overall),grades:gradeRows,classes:classRows,genders:genderRows,
    pendingToday,completedToday:classNames.filter(c=>todayCompleted.has(c)),todayStats,studentStrength:strength,
    gradeGenders:gradeGenderRows,classGenders:classGenderRows,multiSectionGrades,multiSectionClasses,
    note:'Percentages use completed attendance only. Late counts as attended.'};
}
