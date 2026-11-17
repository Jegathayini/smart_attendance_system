/**
 * Printable A4 HTML Reports (Full UTF-8 / Tamil Unicode Support) & CSV Export.
 * Supports Full Year, Academic Term, and Monthly reports for Students & Teachers.
 */

function rptEscapeHtml_(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rptFilename_(s) {
  return String(s || 'report').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
}

function rptValidate_(token, year, periodMode, term, month) {
  authRequire_(token, 'ADMIN');
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('Invalid year.');

  const mode = String(periodMode || 'FULL_YEAR').toUpperCase();
  if (mode === 'MONTHLY') {
    const m = Number(month);
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('Select a valid month (1–12).');
    const mm = String(m).padStart(2, '0');
    const lastDay = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return {
      year: y,
      periodLabel: monthNames[m - 1] + ' ' + y,
      term: monthNames[m - 1],
      start: y + '-' + mm + '-01',
      end: y + '-' + mm + '-' + lastDay
    };
  }

  if (mode === 'TERM') {
    const t = String(term || '').trim();
    const selected = getTermsCached_().find(r => r.year === y && r.term === t);
    if (!selected) throw new Error('Select a valid academic term.');
    return {
      year: y,
      periodLabel: selected.term + ' (' + y + ')',
      term: selected.term,
      start: selected.start,
      end: selected.end
    };
  }

  return {
    year: y,
    periodLabel: 'Full Year ' + y,
    term: 'Full Year',
    start: y + '-01-01',
    end: y + '-12-31'
  };
}

function rptData_(scope) {
  const attSheet = getRequiredSheet('Attendance');
  const vals = attSheet.getDataRange().getValues();
  if (vals.length < 2) return [];

  const h = vals[0].map(String);
  const dIdx = h.indexOf('Date');
  const yIdx = h.indexOf('Academic_Year');
  const stIdx = h.indexOf('Status');
  const idIdx = h.indexOf('Student_ID');
  const nameIdx = h.indexOf('Student_Name');
  const gIdx = h.indexOf('Grade');
  const sIdx = h.indexOf('Section');
  const cIdx = h.indexOf('Class_ID');

  const names = new Map(getStudentsCached_().map(s => [s.id, s.name]));
  const summary = new Map();

  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    const date = dIdx >= 0 ? attDate_(r[dIdx]) : '';
    if (!date || date < scope.start || date > scope.end) continue;
    const recYear = yIdx >= 0 && r[yIdx] ? Number(r[yIdx]) : Number(date.slice(0, 4));
    if (recYear !== scope.year) continue;
    const status = stIdx >= 0 ? String(r[stIdx] || '').trim().toUpperCase() : '';
    if (!ATT_ALLOWED_.includes(status)) continue;
    const id = idIdx >= 0 ? String(r[idIdx] || '').trim() : '';
    if (!id) continue;

    const grade = gIdx >= 0 ? Number(r[gIdx]) : 0;
    const sec = sIdx >= 0 ? String(r[sIdx] || '').trim() : '';
    const cls = cIdx >= 0 && r[cIdx]
      ? String(r[cIdx]).trim().toUpperCase()
      : (String(grade) + sec).toUpperCase();

    if (!summary.has(id)) {
      summary.set(id, {
        id,
        name: names.get(id) || (nameIdx >= 0 ? String(r[nameIdx] || id) : id),
        grade,
        cls,
        present: 0,
        absent: 0,
        late: 0,
        days: new Set(),
        dates: []
      });
    }
    const x = summary.get(id);
    if (x.days.has(date)) {
      throw new Error('Duplicate attendance for student ' + id + ' on ' + date + '. Correct the sheet before exporting.');
    }
    x.days.add(date);
    x[status.toLowerCase()]++;
    x.dates.push({ date, status });
  }

  return [...summary.values()].map(x => ({
    id: x.id,
    name: x.name,
    grade: x.grade,
    cls: x.cls,
    present: x.present,
    absent: x.absent,
    late: x.late,
    total: x.days.size,
    percent: x.days.size ? Math.round(10000 * (x.present + x.late) / x.days.size) / 100 : 0,
    dates: x.dates.sort((a, b) => a.date.localeCompare(b.date))
  })).sort((a, b) =>
    a.grade - b.grade ||
    a.cls.localeCompare(b.cls, undefined, { numeric: true }) ||
    a.name.localeCompare(b.name)
  );
}

function rptTeacherData_(scope) {
  const names = new Map(authStaffCached_().map(s => [s.staffId, s.name]));
  const summary = new Map();

  taRowsCached_().forEach(r => {
    if (!r.date || r.date < scope.start || r.date > scope.end) return;
    if (!r.teacherId) return;
    if (!summary.has(r.teacherId)) {
      summary.set(r.teacherId, {
        id: r.teacherId,
        name: names.get(r.teacherId) || r.teacherName || r.teacherId,
        present: 0,
        absent: 0,
        halfDay: 0,
        shortLeave: 0,
        total: 0,
        dates: []
      });
    }
    const x = summary.get(r.teacherId);
    x.total++;
    if (r.status === 'PRESENT') x.present++;
    else if (r.status === 'ABSENT') x.absent++;
    else if (r.status === 'HALF DAY') x.halfDay++;
    else if (r.status === 'SHORT LEAVE') x.shortLeave++;
    x.dates.push({
      date: r.date,
      status: r.status,
      leaveType: r.leaveType,
      reasonCategory: r.reasonCategory
    });
  });

  return [...summary.values()].map(x => ({
    ...x,
    dates: x.dates.sort((a, b) => a.date.localeCompare(b.date))
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function rptSectionHtml_(title, scope, columns, rows, info, notes) {
  const ths = columns.map(c =>
    '<th class="' + (c.align === 'right' ? 'num' : '') + '">' + rptEscapeHtml_(c.title) + '</th>'
  ).join('');
  const trs = rows.length
    ? rows.map(row => '<tr>' + columns.map((c, j) => {
        const v = Array.isArray(row) ? row[j] : row[c.key];
        return '<td class="' + (c.align === 'right' ? 'num' : '') + '">' + rptEscapeHtml_(v) + '</td>';
      }).join('') + '</tr>').join('')
    : '<tr><td colspan="' + columns.length + '" class="muted">No records available for this period.</td></tr>';
  const infoHtml = (info && info.length)
    ? '<div class="rpt-info">' + info.map((line, i) => '<div class="' + (i === 0 ? 'lead' : '') + '">' + rptEscapeHtml_(line) + '</div>').join('') + '</div>'
    : '';
  const notesHtml = (notes && notes.length)
    ? '<div class="rpt-notes"><strong>REPORT NOTES</strong><ul>' + notes.map(n => '<li>' + rptEscapeHtml_(n) + '</li>').join('') + '</ul></div>'
    : '';

  return '<article class="rpt-sheet">' +
    '<header class="rpt-head">' +
      '<div><div class="rpt-school">Fictional School</div><div class="rpt-sub">SMART SCHOOL ATTENDANCE SYSTEM — OFFICIAL REPORT</div></div>' +
      '<div class="rpt-meta"><div>YEAR: ' + rptEscapeHtml_(scope.year) + '</div><div>PERIOD: ' + rptEscapeHtml_(scope.periodLabel) + '</div></div>' +
    '</header>' +
    '<h2 class="rpt-title">' + rptEscapeHtml_(title) + '</h2>' +
    '<div class="rpt-range">Date Range: ' + rptEscapeHtml_(scope.start) + ' to ' + rptEscapeHtml_(scope.end) + '</div>' +
    infoHtml +
    '<table class="rpt-table"><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>' +
    notesHtml +
    '<footer class="rpt-foot"><span>Generated ' + rptEscapeHtml_(Utilities.formatDate(new Date(), ATT_TZ_, 'dd MMM yyyy HH:mm')) + ' (Asia/Colombo)</span><span>Authorized School Report</span></footer>' +
    '</article>';
}

function rptWrapHtmlDocument_(docTitle, bodyHtml) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + rptEscapeHtml_(docTitle) + '</title><style>' +
    'body{margin:0;padding:16px;background:#eef2f7;color:#0f172a;font-family:"Noto Sans Tamil","Latha","Vijaya","Nirmala UI",Inter,system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.45;}' +
    '.rpt-sheet{max-width:794px;margin:0 auto 24px;background:#fff;padding:28px 34px;border-radius:8px;box-shadow:0 2px 12px rgba(15,23,42,.08);page-break-after:always;break-after:page;}' +
    '.rpt-sheet:last-child{page-break-after:auto;break-after:auto;}' +
    '.rpt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;background:#155eef;color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:16px;}' +
    '.rpt-school{font-size:14px;font-weight:800;letter-spacing:.3px;}.rpt-sub{font-size:10px;opacity:.9;margin-top:3px;}' +
    '.rpt-meta{text-align:right;font-size:11px;font-weight:700;white-space:nowrap;}' +
    '.rpt-title{margin:0 0 4px;font-size:17px;color:#0f172a;}.rpt-range{font-size:11px;color:#64748b;margin-bottom:14px;}' +
    '.rpt-info{background:#f1f6ff;border-left:4px solid #155eef;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:11.5px;}' +
    '.rpt-info .lead{font-weight:700;margin-bottom:4px;font-size:12px;}' +
    '.rpt-table{width:100%;border-collapse:collapse;margin-top:8px;}' +
    '.rpt-table th{background:#e8f0fe;color:#174bb3;text-align:left;padding:8px;font-size:11px;border-bottom:2px solid #cbd5e1;}' +
    '.rpt-table td{padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11.5px;}' +
    '.rpt-table tbody tr:nth-child(even){background:#f8fafc;}' +
    '.rpt-table .num{text-align:right;font-variant-numeric:tabular-nums;}' +
    '.rpt-notes{margin-top:14px;font-size:11px;color:#475569;}.rpt-notes ul{margin:4px 0 0;padding-left:18px;}' +
    '.rpt-foot{display:flex;justify-content:space-between;margin-top:18px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b;}' +
    '@media print{body{background:#fff;padding:0;}.rpt-sheet{box-shadow:none;margin:0;padding:14mm 12mm;border-radius:0;max-width:none;}}' +
    '</style></head><body>' + bodyHtml + '</body></html>';
}

function rptToCsv_(columns, rows) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = columns.map(c => esc(c.title)).join(',');
  const lines = rows.map(row => columns.map((c, j) => esc(Array.isArray(row) ? row[j] : row[c.key])).join(','));
  return '\uFEFF' + [head].concat(lines).join('\r\n');
}

function getAttendanceReportOptions(token, year) {
  authRequire_(token, 'ADMIN');
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('Invalid year.');

  const terms = getTermsCached_()
    .filter(t => t.year === y)
    .map(t => ({ name: t.term, start: t.start, end: t.end }))
    .sort((a, b) => a.start.localeCompare(b.start));

  const students = getStudentsCached_()
    .map(s => ({ id: s.id, name: s.name, grade: s.grade, cls: s.classId }))
    .sort((a, b) => a.grade - b.grade || a.cls.localeCompare(b.cls, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  const classes = [...new Set(getClassesCached_().filter(c => c.active).map(c => c.className))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const teachers = authStaffCached_()
    .filter(s => s.role === 'TEACHER')
    .map(s => ({ id: s.staffId, name: s.name, username: s.username }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { terms, students, classes, teachers };
}

function generateAttendanceReportHtml(token, options) {
  if (!options || typeof options !== 'object') throw new Error('Missing report options.');
  const scope = rptValidate_(token, options.year, options.periodMode, options.term, options.month);
  const kind = String(options.type || '').toUpperCase();
  const f = String(options.filter || '').trim();

  if (kind === 'TEACHER_INDIVIDUAL' || kind === 'TEACHER_SUMMARY') {
    const tData = rptTeacherData_(scope);
    if (kind === 'TEACHER_INDIVIDUAL') {
      const t = tData.find(x => x.id === f);
      if (!t) throw new Error('No teacher attendance records found for this teacher in the selected period.');
      const cols = [
        { title: 'DATE' }, { title: 'STATUS' }, { title: 'LEAVE DETAILS' }, { title: 'REASON CATEGORY' }
      ];
      const rows = t.dates.map(d => [d.date, d.status, d.leaveType || '—', d.reasonCategory || '—']);
      const info = [
        'TEACHER: ' + t.name + '  |  ID: ' + t.id,
        'Present: ' + t.present + '  |  Absent: ' + t.absent + '  |  Half Day: ' + t.halfDay + '  |  Short Leave: ' + t.shortLeave + '  |  Total Days: ' + t.total
      ];
      const htmlBody = rptSectionHtml_('Individual Teacher Attendance Report', scope, cols, rows, info, [
        'Data sourced from TeacherAttendance records within the selected date range.'
      ]);
      const base = 'Teacher_' + rptFilename_(t.id) + '_' + rptFilename_(scope.periodLabel);
      return {
        title: 'Teacher Report — ' + t.name,
        filename: base,
        htmlFilename: base + '.html',
        csvFilename: base + '.csv',
        html: rptWrapHtmlDocument_('Teacher Attendance - ' + t.name, htmlBody),
        csv: rptToCsv_(cols, rows)
      };
    }

    if (!tData.length) throw new Error('No teacher attendance records found for the selected period.');
    const cols = [
      { title: 'TEACHER ID' }, { title: 'TEACHER NAME' },
      { title: 'PRESENT', align: 'right' }, { title: 'ABSENT', align: 'right' },
      { title: 'HALF DAY', align: 'right' }, { title: 'SHORT LEAVE', align: 'right' },
      { title: 'RECORDS', align: 'right' }
    ];
    const rows = tData.map(x => [x.id, x.name, x.present, x.absent, x.halfDay, x.shortLeave, x.total]);
    const info = ['TEACHERS WITH RECORDS: ' + tData.length + '  |  PERIOD: ' + scope.periodLabel];
    const htmlBody = rptSectionHtml_('Staff Attendance Summary Report', scope, cols, rows, info, [
      'Includes all submitted teacher self-attendance entries within the selected period.'
    ]);
    const base = 'Teachers_Summary_' + rptFilename_(scope.periodLabel);
    return {
      title: 'Teachers Attendance Summary',
      filename: base,
      htmlFilename: base + '.html',
      csvFilename: base + '.csv',
      html: rptWrapHtmlDocument_('Teachers Attendance Summary', htmlBody),
      csv: rptToCsv_(cols, rows)
    };
  }

  const data = rptData_(scope);
  if (kind === 'STUDENT') {
    const x = data.find(s => s.id === f);
    if (!x) throw new Error('No submitted attendance for this student in the selected period.');
    const cols = [{ title: 'DATE' }, { title: 'ATTENDANCE STATUS' }];
    const rows = x.dates.map(d => [d.date, d.status]);
    const info = [
      'STUDENT: ' + x.name + '  |  ID: ' + x.id + '  |  CLASS: ' + x.cls,
      'Present: ' + x.present + '  |  Absent: ' + x.absent + '  |  Late: ' + x.late + '  |  Completed Days: ' + x.total + '  |  Attendance Rate: ' + x.percent + '%'
    ];
    const htmlBody = rptSectionHtml_('Individual Student Attendance Report', scope, cols, rows, info, [
      'Attendance rate = (Present + Late) / Completed days.',
      'Pending days are excluded. Late is counted as attended.'
    ]);
    const base = 'Student_' + rptFilename_(x.id) + '_' + rptFilename_(scope.periodLabel);
    return {
      title: 'Student Report — ' + x.name,
      filename: base,
      htmlFilename: base + '.html',
      csvFilename: base + '.csv',
      html: rptWrapHtmlDocument_('Student Report - ' + x.name, htmlBody),
      csv: rptToCsv_(cols, rows)
    };
  }

  if (['CLASS', 'GRADE', 'SCHOOL'].includes(kind)) {
    const selected = data.filter(x =>
      kind === 'SCHOOL' || (kind === 'GRADE' ? x.grade === Number(f) : x.cls === f.toUpperCase())
    );
    if (!selected.length) throw new Error('No submitted attendance records for this selection.');
    const cols = [
      { title: 'STUDENT ID' }, { title: 'STUDENT NAME' }, { title: 'CLASS' },
      { title: 'P', align: 'right' }, { title: 'A', align: 'right' },
      { title: 'L', align: 'right' }, { title: 'DAYS', align: 'right' },
      { title: 'RATE %', align: 'right' }
    ];
    const rows = selected.map(x => [x.id, x.name, x.cls, x.present, x.absent, x.late, x.total, x.percent + '%']);
    const attended = selected.reduce((n, x) => n + x.present + x.late, 0);
    const days = selected.reduce((n, x) => n + x.total, 0);
    const rate = days ? Math.round(attended * 10000 / days) / 100 : 0;
    const info = [
      'STUDENTS WITH RECORDS: ' + selected.length + '  |  OVERALL RATE: ' + rate + '%',
      'P = Present  |  A = Absent  |  L = Late  |  Days = Completed attendance days'
    ];
    const htmlBody = rptSectionHtml_(kind + ' Attendance Summary', scope, cols, rows, info, [
      'Attendance rate = (Present + Late) / Completed days.',
      'Only submitted records are included.'
    ]);
    const base = kind + '_' + rptFilename_(f || scope.year) + '_' + rptFilename_(scope.periodLabel);
    return {
      title: kind + ' Attendance Summary',
      filename: base,
      htmlFilename: base + '.html',
      csvFilename: base + '.csv',
      html: rptWrapHtmlDocument_(kind + ' Summary', htmlBody),
      csv: rptToCsv_(cols, rows)
    };
  }

  if (['GRADE_BOOKLET', 'SCHOOL_BOOKLET'].includes(kind)) {
    const selected = data.filter(x => kind === 'SCHOOL_BOOKLET' || x.grade === Number(f));
    if (!selected.length) throw new Error('No submitted attendance records for this selection.');
    if (selected.length > 500) throw new Error('Too many students for one printable booklet; select a single grade.');
    const cols = [{ title: 'DATE' }, { title: 'ATTENDANCE STATUS' }];
    const pages = selected.map(x => {
      const rows = x.dates.map(d => [d.date, d.status]);
      const info = [
        'STUDENT: ' + x.name + '  |  ID: ' + x.id + '  |  CLASS: ' + x.cls,
        'Present: ' + x.present + '  |  Absent: ' + x.absent + '  |  Late: ' + x.late + '  |  Days: ' + x.total + '  |  Rate: ' + x.percent + '%'
      ];
      return rptSectionHtml_('Student Attendance Report', scope, cols, rows, info, [
        'Attendance rate = (Present + Late) / Completed days.'
      ]);
    }).join('');
    const csvCols = [
      { title: 'STUDENT ID' }, { title: 'STUDENT NAME' }, { title: 'CLASS' },
      { title: 'DATE' }, { title: 'STATUS' }
    ];
    const csvRows = [];
    selected.forEach(x => x.dates.forEach(d => csvRows.push([x.id, x.name, x.cls, d.date, d.status])));
    const base = (kind === 'GRADE_BOOKLET' ? 'Grade_' + rptFilename_(f) : 'School') + '_Booklet_' + rptFilename_(scope.periodLabel);
    return {
      title: (kind === 'GRADE_BOOKLET' ? 'Grade ' + f : 'Whole School') + ' Printable Booklet',
      filename: base,
      htmlFilename: base + '.html',
      csvFilename: base + '.csv',
      html: rptWrapHtmlDocument_('Printable Student Reports', pages),
      csv: rptToCsv_(csvCols, csvRows)
    };
  }

  throw new Error('Invalid report type.');
}