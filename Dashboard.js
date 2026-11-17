/** Dashboard statistics: single-pass column-indexed scans + CacheService caching. */
function getAttendanceDashboard(token, academicYear) {
  authRequire_(token);
  const year = Number(academicYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Invalid academic year.');

  const today = attToday_();
  const cacheKey = 'DASH_' +
    appCacheVersion_('ATT') + '_' +
    appCacheVersion_('STU') + '_' +
    appCacheVersion_('CLS') + '_' +
    year + '_' + today;
  const cached = appCacheGet_(cacheKey);
  if (cached) return cached;

  const classes = getClassesCached_().filter(c => c.active);
  const classNames = [...new Set(classes.map(c => c.className))];
  const classGradeMap = new Map();
  const sectionsByGrade = new Map();
  classes.forEach(c => {
    const grade = String(c.grade);
    classGradeMap.set(c.className, grade);
    if (!sectionsByGrade.has(grade)) sectionsByGrade.set(grade, new Set());
    sectionsByGrade.get(grade).add(c.className);
  });

  const make = name => ({ name, present: 0, absent: 0, late: 0, total: 0, completedDays: 0, attendancePercent: 0 });
  const overall = make('Whole School');
  const byGrade = new Map(), byClass = new Map(), byGender = new Map();
  const byGradeGender = new Map(), byClassGender = new Map(), completed = new Map();
  const add = (target, status) => { target.total++; target[status.toLowerCase()]++; };
  const todayStats = { present: 0, absent: 0, late: 0 };

  const attSheet = getRequiredSheet('Attendance');
  const attVals = attSheet.getDataRange().getValues();
  if (attVals.length >= 2) {
    const h = attVals[0].map(String);
    const ix = {
      Date: h.indexOf('Date'), Status: h.indexOf('Status'),
      Grade: h.indexOf('Grade'), Section: h.indexOf('Section'),
      Class_ID: h.indexOf('Class_ID'), Gender: h.indexOf('Gender')
    };
    for (let i = 1; i < attVals.length; i++) {
      const r = attVals[i];
      const date = ix.Date >= 0 ? attDate_(r[ix.Date]) : '';
      if (!date || date > today || Number(date.slice(0, 4)) !== year) continue;
      const status = ix.Status >= 0 ? String(r[ix.Status] || '').trim().toUpperCase() : '';
      if (!ATT_ALLOWED_.includes(status)) continue;
      const grade = ix.Grade >= 0 ? String(r[ix.Grade] || '').trim() : '';
      const sec = ix.Section >= 0 ? String(r[ix.Section] || '').trim() : '';
      const cls = ix.Class_ID >= 0 && r[ix.Class_ID]
        ? String(r[ix.Class_ID]).trim().toUpperCase()
        : (grade + sec).toUpperCase();
      if (!grade || !cls) continue;

      const raw = ix.Gender >= 0 ? String(r[ix.Gender] || '').trim().toLowerCase() : '';
      const gender = ['m', 'male', 'boy', 'boys'].includes(raw) ? 'Boys'
        : ['f', 'female', 'girl', 'girls'].includes(raw) ? 'Girls' : 'Unspecified';

      const key = date + '|' + cls;
      if (!completed.has(key)) completed.set(key, { date, cls, grade });
      add(overall, status);
      if (date === today) todayStats[status.toLowerCase()]++;

      [
        [byGrade, grade], [byClass, cls], [byGender, gender],
        [byGradeGender, grade + '|' + gender], [byClassGender, cls + '|' + gender]
      ].forEach(([map, k]) => {
        if (!map.has(k)) map.set(k, make(k));
        add(map.get(k), status);
      });
    }
  }

  completed.forEach(({ grade, cls }) => {
    overall.completedDays++;
    if (byGrade.has(grade)) byGrade.get(grade).completedDays++;
    if (byClass.has(cls)) byClass.get(cls).completedDays++;
  });

  const finalize = item => {
    item.attendancePercent = item.total ? Math.round((item.present + item.late) * 10000 / item.total) / 100 : 0;
    return item;
  };
  const toArray = map => [...map.values()].map(finalize);
  const gradeRows = toArray(byGrade).sort((a, b) => Number(a.name) - Number(b.name));
  const classRows = toArray(byClass).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const genderRows = toArray(byGender).filter(x => x.name !== 'Unspecified');
  const gradeGenderRows = toArray(byGradeGender).map(x => ({ ...x, grade: x.name.split('|')[0], gender: x.name.split('|')[1] }));
  const classGenderRows = toArray(byClassGender).map(x => ({ ...x, className: x.name.split('|')[0], gender: x.name.split('|')[1] }));

  const multiSectionGrades = new Set([...sectionsByGrade].filter(([, s]) => s.size > 1).map(([g]) => g));
  const multiSectionClasses = classRows.filter(x => multiSectionGrades.has(classGradeMap.get(x.name)));
  const todayCompleted = new Set([...completed.values()].filter(x => x.date === today).map(x => x.cls));
  const pendingToday = year === Number(today.slice(0, 4)) ? classNames.filter(c => !todayCompleted.has(c)) : [];

  const students = getStudentsCached_();
  const strength = { total: 0, boys: 0, girls: 0, grades: [] };
  const strengthByGrade = new Map(), seen = new Set();
  students.forEach(s => {
    if (!s.id || seen.has(s.id)) return;
    seen.add(s.id);
    if (!attEligibleObj_(s, today)) return;
    if (!Number.isInteger(s.grade) || s.grade < 1 || s.grade > 13) return;
    const raw = s.gender.trim().toLowerCase();
    const gender = ['m', 'male', 'boy', 'boys'].includes(raw) ? 'boys'
      : ['f', 'female', 'girl', 'girls'].includes(raw) ? 'girls' : null;
    strength.total++;
    if (gender) strength[gender]++;
    if (!strengthByGrade.has(s.grade)) strengthByGrade.set(s.grade, { grade: s.grade, boys: 0, girls: 0, total: 0 });
    const item = strengthByGrade.get(s.grade);
    item.total++;
    if (gender) item[gender]++;
  });
  strength.grades = [...strengthByGrade.values()].sort((a, b) => a.grade - b.grade);

  const result = {
    year,
    today,
    overall: finalize(overall),
    grades: gradeRows,
    classes: classRows,
    genders: genderRows,
    pendingToday,
    completedToday: classNames.filter(c => todayCompleted.has(c)),
    todayStats,
    studentStrength: strength,
    gradeGenders: gradeGenderRows,
    classGenders: classGenderRows,
    multiSectionGrades: [...multiSectionGrades],
    multiSectionClasses,
    note: 'Percentages use completed attendance only. Late counts as attended.'
  };

  appCachePut_(cacheKey, result, APP_SHORT_CACHE_TTL_SEC_);
  return result;
}