/**
 * Smart School Attendance System — Standalone Mock RPC Engine
 * Emulates google.script.run methods using DemoStorage so the full UI runs client-side.
 */
(function (global) {
  'use strict';

  const ALLOWED_STATUS = ['PRESENT', 'ABSENT', 'LATE'];
  const todayStr = () => global.DemoData.demoColomboToday();

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function normalizeClassId(classId) {
    const val = String(classId || '').trim().toUpperCase();
    const cls = val.match(/^CLS0*(\d+)$/);
    if (cls) return Number(cls[1]) + 'A';
    const gs = val.match(/^0*(\d+)([A-Z][A-Z0-9]*)$/);
    if (gs) return Number(gs[1]) + gs[2];
    return val;
  }

  function parseCls(grade, section) {
    const g = Number(grade);
    const s = String(section || '').trim().toUpperCase();
    if (!Number.isInteger(g) || g < 1 || g > 13 || !/^[A-Z][A-Z0-9]*$/.test(s)) {
      throw new Error('Invalid class selection.');
    }
    return { grade: g, section: s, name: g + s };
  }

  function isEligible(st, date) {
    return Boolean(st.active) && (!st.admitted || st.admitted <= date) && (!st.left || st.left >= date);
  }

  function requireUser(token, requiredRole) {
    const sess = global.DemoStorage.getSession();
    if (!sess || !token || sess.token !== token) {
      throw new Error('Demo session expired. Please pick a demo role again.');
    }
    const state = global.DemoStorage.load();
    const user = state.staff.find(s => s.staffId === sess.staffId && !s.archived);
    if (!user || !user.active) throw new Error('Account is inactive or archived.');
    if (requiredRole === 'ADMIN' && user.role !== 'ADMIN') {
      throw new Error('Administrator access required.');
    }
    return user;
  }

  function schoolDayInfo(state, date) {
    const matches = state.calendar.filter(c => c.date === date);
    if (matches.length > 1) {
      return { date, isSchoolDay: false, conflict: true, type: 'CONFLICT', label: 'Conflicting calendar entries' };
    }
    if (matches.length === 1) {
      const c = matches[0];
      if (['HOLIDAY', 'CLOSED', 'CLOSURE', 'NON_SCHOOL_DAY'].includes(c.type) || c.schoolDay === 'FALSE') {
        return { date, isSchoolDay: false, conflict: false, type: c.type, label: c.type + ': ' + c.description };
      }
      if (c.type === 'SCHOOL_DAY' || c.schoolDay === 'TRUE') {
        return { date, isSchoolDay: true, conflict: false, type: 'SPECIAL_SCHOOL_DAY', label: 'School Day (' + c.description + ')' };
      }
    }
    const day = new Date(date + 'T12:00:00Z').getUTCDay();
    if (day === 0 || day === 6) {
      return { date, isSchoolDay: false, conflict: false, type: 'WEEKEND', label: 'Weekend (Non-School Day)' };
    }
    return { date, isSchoolDay: true, conflict: false, type: 'REGULAR', label: 'Regular School Day' };
  }

  function policyWindow(state, policy, today) {
    const type = String(policy.periodType || 'MONTHLY').toUpperCase();
    if (type === 'MONTHLY') {
      const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
      const last = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
      return { start: today.slice(0, 8) + '01', end: today.slice(0, 7) + '-' + last, label: today.slice(0, 7) };
    }
    if (type === 'YEARLY') {
      return { start: today.slice(0, 4) + '-01-01', end: today.slice(0, 4) + '-12-31', label: today.slice(0, 4) };
    }
    if (type === 'CUSTOM') {
      return { start: policy.customStart, end: policy.customEnd, label: policy.customStart + ' to ' + policy.customEnd };
    }
    const term = state.terms.find(t => t.start <= today && today <= t.end);
    if (!term) throw new Error('No academic term covers today.');
    return { start: term.start, end: term.end, label: term.year + ' ' + term.term };
  }

  function workingDaysCount(state, start, end) {
    const byDate = new Map(state.calendar.map(c => [c.date, c]));
    let count = 0;
    const cur = new Date(start + 'T12:00:00Z');
    const fin = new Date(end + 'T12:00:00Z');
    while (cur <= fin) {
      const d = cur.toISOString().slice(0, 10);
      const day = cur.getUTCDay();
      let open = day !== 0 && day !== 6;
      const e = byDate.get(d);
      if (e) {
        if (['HOLIDAY', 'CLOSED', 'CLOSURE', 'NON_SCHOOL_DAY'].includes(e.type) || e.schoolDay === 'FALSE') open = false;
        else if (e.type === 'SCHOOL_DAY' || e.schoolDay === 'TRUE') open = true;
      }
      if (open) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  }

  function buildTeacherSummary(state, teacher) {
    const today = todayStr();
    const policy = state.leavePolicy;
    const win = policyWindow(state, policy, today);
    const mine = state.teacherAttendance.filter(r => r.teacherId === teacher.staffId);
    const records = mine.filter(r => r.date >= win.start && r.date <= win.end);
    const personal = records.filter(r => r.reasonCategory === 'PERSONAL');
    const absences = personal.filter(r => r.status === 'ABSENT').length;
    const halfDays = personal.filter(r => r.status === 'HALF DAY').length;
    const shortRows = personal.filter(r => r.status === 'SHORT LEAVE');
    const shortOccurrences = shortRows.length;
    const shortPeriods = shortRows.reduce((s, r) => {
      const m = String(r.leaveType || '').match(/^PERIODS:([0-9,]+)$/);
      return s + (m ? m[1].split(',').filter(Boolean).length : 0);
    }, 0);
    const halfFactor = Number(policy.halfDayAbsenceUnits ?? 0.5);
    const absenceUnits = absences + halfDays * halfFactor;
    const shortLeaveCount = policy.shortLeaveCounting === 'PERIODS' ? shortPeriods : shortOccurrences;
    const absLim = policy.absenceLimit === '' || policy.absenceLimit == null ? null : Number(policy.absenceLimit);
    const shLim = policy.shortLeaveLimit === '' || policy.shortLeaveLimit == null ? null : Number(policy.shortLeaveLimit);
    const workingEnd = win.end < today ? win.end : today;

    return {
      teacherId: teacher.staffId,
      teacherName: teacher.name,
      periodType: policy.periodType,
      periodLabel: win.label,
      startDate: win.start,
      endDate: win.end,
      absenceLimit: absLim,
      shortLeaveLimit: shLim,
      shortLeaveCounting: policy.shortLeaveCounting,
      warningPercent: Number(policy.warningPercent || 75),
      counts: {
        absenceCount: absences,
        halfDayCount: halfDays,
        absenceUnits,
        shortLeaveOccurrences: shortOccurrences,
        shortLeavePeriods: shortPeriods,
        shortLeaveCount,
        personalLeaveRecords: personal.length,
        officialLeaveRecords: records.filter(r => r.reasonCategory === 'OFFICIAL').length
      },
      totalWorkingDays: workingEnd >= win.start ? workingDaysCount(state, win.start, workingEnd) : 0,
      presentDays: records.filter(r => r.status === 'PRESENT').length,
      leavesTaken: records.filter(r => ['ABSENT', 'HALF DAY', 'SHORT LEAVE'].includes(r.status)).length,
      personalDeductions: absenceUnits,
      absenceRemaining: absLim === null ? null : Math.max(0, absLim - absenceUnits),
      shortLeaveRemaining: shLim === null ? null : Math.max(0, shLim - shortLeaveCount),
      todaySubmitted: mine.some(r => r.date === today),
      records: clone(records).sort((a, b) => b.date.localeCompare(a.date))
    };
  }

  function buildDashboard(state, academicYear) {
    const year = Number(academicYear);
    const today = todayStr();
    const classes = state.classes.filter(c => c.active);
    const classNames = [...new Set(classes.map(c => c.className))];
    const classGradeMap = new Map(classes.map(c => [c.className, String(c.grade)]));
    const sectionsByGrade = new Map();
    classes.forEach(c => {
      const g = String(c.grade);
      if (!sectionsByGrade.has(g)) sectionsByGrade.set(g, new Set());
      sectionsByGrade.get(g).add(c.className);
    });

    const make = name => ({ name, present: 0, absent: 0, late: 0, total: 0, completedDays: 0, attendancePercent: 0 });
    const overall = make('Whole School');
    const byGrade = new Map(), byClass = new Map(), byGender = new Map();
    const byGradeGender = new Map(), byClassGender = new Map(), completed = new Map();
    const todayStats = { present: 0, absent: 0, late: 0 };
    const add = (t, s) => { t.total++; t[s.toLowerCase()]++; };

    state.attendance.forEach(r => {
      if (!r.date || r.date > today || Number(r.date.slice(0, 4)) !== year) return;
      if (!ALLOWED_STATUS.includes(r.status)) return;
      const g = String(r.grade), cls = r.classId;
      const rawG = String(r.gender || '').toLowerCase();
      const gender = rawG === 'male' ? 'Boys' : (rawG === 'female' ? 'Girls' : 'Unspecified');
      const key = r.date + '|' + cls;
      if (!completed.has(key)) completed.set(key, { date: r.date, cls, grade: g });
      add(overall, r.status);
      if (r.date === today) todayStats[r.status.toLowerCase()]++;
      [[byGrade, g], [byClass, cls], [byGender, gender], [byGradeGender, g + '|' + gender], [byClassGender, cls + '|' + gender]].forEach(([m, k]) => {
        if (!m.has(k)) m.set(k, make(k));
        add(m.get(k), r.status);
      });
    });

    completed.forEach(({ grade, cls }) => {
      overall.completedDays++;
      if (byGrade.has(grade)) byGrade.get(grade).completedDays++;
      if (byClass.has(cls)) byClass.get(cls).completedDays++;
    });

    const fin = it => { it.attendancePercent = it.total ? Math.round((it.present + it.late) * 10000 / it.total) / 100 : 0; return it; };
    const toArr = m => [...m.values()].map(fin);
    const gradeRows = toArr(byGrade).sort((a, b) => Number(a.name) - Number(b.name));
    const classRows = toArr(byClass).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const multiSectionGrades = new Set([...sectionsByGrade].filter(([, s]) => s.size > 1).map(([g]) => g));
    const multiSectionClasses = classRows.filter(x => multiSectionGrades.has(classGradeMap.get(x.name)));
    const todayCompleted = new Set([...completed.values()].filter(x => x.date === today).map(x => x.cls));
    const pendingToday = year === Number(today.slice(0, 4)) ? classNames.filter(c => !todayCompleted.has(c)) : [];

    const strength = { total: 0, boys: 0, girls: 0, grades: [] };
    const stByGrade = new Map();
    state.students.forEach(s => {
      if (!isEligible(s, today)) return;
      strength.total++;
      if (s.gender === 'MALE') strength.boys++;
      if (s.gender === 'FEMALE') strength.girls++;
      if (!stByGrade.has(s.grade)) stByGrade.set(s.grade, { grade: s.grade, boys: 0, girls: 0, total: 0 });
      const item = stByGrade.get(s.grade);
      item.total++;
      if (s.gender === 'MALE') item.boys++;
      if (s.gender === 'FEMALE') item.girls++;
    });
    strength.grades = [...stByGrade.values()].sort((a, b) => a.grade - b.grade);

    return {
      year,
      today,
      overall: fin(overall),
      grades: gradeRows,
      classes: classRows,
      genders: toArr(byGender).filter(x => x.name !== 'Unspecified'),
      pendingToday,
      completedToday: classNames.filter(c => todayCompleted.has(c)),
      todayStats,
      studentStrength: strength,
      gradeGenders: toArr(byGradeGender).map(x => ({ ...x, grade: x.name.split('|')[0], gender: x.name.split('|')[1] })),
      classGenders: toArr(byClassGender).map(x => ({ ...x, className: x.name.split('|')[0], gender: x.name.split('|')[1] })),
      multiSectionGrades: [...multiSectionGrades],
      multiSectionClasses,
      note: 'Interactive Demo Data'
    };
  }

  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function buildReportHtmlDoc(title, bodyHtml) {
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + escHtml(title) + '</title><style>' +
      'body{margin:0;padding:16px;background:#eef2f7;color:#0f172a;font-family:"Inter","Noto Sans Tamil",system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.45;}' +
      '.rpt-sheet{max-width:794px;margin:0 auto 24px;background:#fff;padding:28px 34px;border-radius:8px;box-shadow:0 2px 12px rgba(15,23,42,.08);page-break-after:always;break-after:page;}' +
      '.rpt-sheet:last-child{page-break-after:auto;break-after:auto;}' +
      '.rpt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;background:#155eef;color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:16px;}' +
      '.rpt-school{font-size:14px;font-weight:800;}.rpt-sub{font-size:10px;opacity:.9;margin-top:3px;}.rpt-meta{text-align:right;font-size:11px;font-weight:700;}' +
      '.rpt-title{margin:0 0 4px;font-size:17px;}.rpt-range{font-size:11px;color:#64748b;margin-bottom:14px;}' +
      '.rpt-info{background:#f1f6ff;border-left:4px solid #155eef;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:11.5px;}' +
      '.rpt-info .lead{font-weight:700;margin-bottom:4px;font-size:12px;}' +
      '.rpt-table{width:100%;border-collapse:collapse;margin-top:8px;}' +
      '.rpt-table th{background:#e8f0fe;color:#174bb3;text-align:left;padding:8px;font-size:11px;border-bottom:2px solid #cbd5e1;}' +
      '.rpt-table td{padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11.5px;}' +
      '.rpt-table tbody tr:nth-child(even){background:#f8fafc;}.rpt-table .num{text-align:right;}' +
      '.rpt-notes{margin-top:14px;font-size:11px;color:#475569;}.rpt-notes ul{margin:4px 0 0;padding-left:18px;}' +
      '.rpt-foot{display:flex;justify-content:space-between;margin-top:18px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b;}' +
      '</style></head><body>' + bodyHtml + '</body></html>';
  }

  function renderReportSection(title, scope, cols, rows, info, notes) {
    const ths = cols.map(c => '<th class="' + (c.align === 'right' ? 'num' : '') + '">' + escHtml(c.title) + '</th>').join('');
    const trs = rows.length
      ? rows.map(r => '<tr>' + cols.map((c, i) => '<td class="' + (c.align === 'right' ? 'num' : '') + '">' + escHtml(r[i]) + '</td>').join('') + '</tr>').join('')
      : '<tr><td colspan="' + cols.length + '">No records available for this period.</td></tr>';
    const infoHtml = info && info.length ? '<div class="rpt-info">' + info.map((l, i) => '<div class="' + (i === 0 ? 'lead' : '') + '">' + escHtml(l) + '</div>').join('') + '</div>' : '';
    const notesHtml = notes && notes.length ? '<div class="rpt-notes"><strong>REPORT NOTES</strong><ul>' + notes.map(n => '<li>' + escHtml(n) + '</li>').join('') + '</ul></div>' : '';
    return '<article class="rpt-sheet"><header class="rpt-head"><div><div class="rpt-school">Fictional School (DEMO)</div><div class="rpt-sub">SMART SCHOOL ATTENDANCE SYSTEM — OFFICIAL REPORT</div></div><div class="rpt-meta"><div>YEAR: ' + escHtml(scope.year) + '</div><div>PERIOD: ' + escHtml(scope.periodLabel) + '</div></div></header><h2 class="rpt-title">' + escHtml(title) + '</h2><div class="rpt-range">Date Range: ' + escHtml(scope.start) + ' to ' + escHtml(scope.end) + '</div>' + infoHtml + '<table class="rpt-table"><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>' + notesHtml + '<footer class="rpt-foot"><span>Generated in Interactive Demo Mode</span><span>Authorized School Report</span></footer></article>';
  }

  function toCsv(cols, rows) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return '\uFEFF' + [cols.map(c => q(c.title)).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n');
  }

  // ---------- MOCK SERVER METHODS ----------
  const API = {
    authLogin(username) {
      const state = global.DemoStorage.load();
      const uname = String(username || '').trim().toLowerCase();
      const found = state.staff.find(s => !s.archived && s.active && (s.username === uname || (uname === 'teacher' && s.role === 'TEACHER')));
      if (!found) throw new Error('In Demo Mode, use "admin" or "priya.n" (or click a Demo Launch button).');
      const token = 'DEMO_' + found.role + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      global.DemoStorage.setSession({ token, staffId: found.staffId, role: found.role });
      return { success: true, token, name: found.name, username: found.username, role: found.role, staffId: found.staffId, mustChangePassword: false };
    },

    demoQuickLogin(role) {
      const state = global.DemoStorage.load();
      const target = String(role || 'ADMIN').toUpperCase();
      const found = state.staff.find(s => !s.archived && s.active && s.role === target);
      if (!found) throw new Error('Demo account for role ' + target + ' not found.');
      const token = 'DEMO_' + found.role + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      global.DemoStorage.setSession({ token, staffId: found.staffId, role: found.role });
      return { success: true, token, name: found.name, username: found.username, role: found.role, staffId: found.staffId, mustChangePassword: false };
    },

    authLogout() {
      global.DemoStorage.setSession(null);
      return { success: true };
    },

    authSession(token) {
      return clone(requireUser(token, 'SESSION'));
    },

    authChangePassword(token) {
      requireUser(token, 'SESSION');
      return { success: true, message: 'Password change simulated in demo mode.' };
    },

    getAppBootstrap(token, year) {
      const user = requireUser(token, 'SESSION');
      const state = global.DemoStorage.load();
      const today = todayStr();
      const y = Number(year) || Number(today.slice(0, 4));
      const classesByGrade = {};
      state.classes.filter(c => c.active).forEach(c => {
        const g = String(c.grade);
        if (!classesByGrade[g]) classesByGrade[g] = [];
        classesByGrade[g].push({ grade: c.grade, section: c.section, className: c.className });
      });
      const submittedToday = [...new Set(state.attendance.filter(r => r.date === today).map(r => r.classId))];
      return {
        user: clone(user),
        mustChangePassword: false,
        today,
        schoolDayInfo: schoolDayInfo(state, today),
        classesByGrade,
        submittedClassesToday: submittedToday,
        initialData: user.role === 'ADMIN' ? buildDashboard(state, y) : buildTeacherSummary(state, user)
      };
    },

    getAttendanceClasses(token, grade) {
      requireUser(token, 'SESSION');
      const g = Number(grade);
      return global.DemoStorage.load().classes.filter(c => c.grade === g && c.active);
    },

    getAttendanceStudents(token, grade, section) {
      requireUser(token, 'SESSION');
      const cls = parseCls(grade, section);
      const today = todayStr();
      return global.DemoStorage.load().students
        .filter(s => s.grade === cls.grade && s.section === cls.section && isEligible(s, today))
        .map(s => ({ studentId: s.id, name: s.name, rollNo: s.roll, gender: s.gender }))
        .sort((a, b) => Number(a.rollNo) - Number(b.rollNo));
    },

    getDailyAttendanceStatus(token, grade, section) {
      requireUser(token, 'SESSION');
      const cls = parseCls(grade, section);
      const date = todayStr();
      const rows = global.DemoStorage.load().attendance.filter(r => r.date === date && r.classId === cls.name);
      return {
        date,
        submitted: rows.length > 0,
        count: rows.length,
        entries: rows.map(r => ({ studentId: r.studentId, status: r.status })),
        counts: {
          PRESENT: rows.filter(r => r.status === 'PRESENT').length,
          ABSENT: rows.filter(r => r.status === 'ABSENT').length,
          LATE: rows.filter(r => r.status === 'LATE').length
        }
      };
    },

    getClassAttendanceSheet(token, grade, section) {
      requireUser(token, 'SESSION');
      const cls = parseCls(grade, section);
      const state = global.DemoStorage.load();
      const date = todayStr();
      const roster = state.students
        .filter(s => s.grade === cls.grade && s.section === cls.section && isEligible(s, date))
        .map(s => ({ studentId: s.id, name: s.name, rollNo: s.roll, gender: s.gender }))
        .sort((a, b) => Number(a.rollNo) - Number(b.rollNo));
      const rows = state.attendance.filter(r => r.date === date && r.classId === cls.name);
      return {
        date,
        className: cls.name,
        roster,
        submitted: rows.length > 0,
        count: rows.length,
        entries: rows.map(r => ({ studentId: r.studentId, status: r.status })),
        counts: {
          PRESENT: rows.filter(r => r.status === 'PRESENT').length,
          ABSENT: rows.filter(r => r.status === 'ABSENT').length,
          LATE: rows.filter(r => r.status === 'LATE').length
        },
        schoolDayInfo: schoolDayInfo(state, date)
      };
    },

    submitDailyAttendance(token, grade, section, entries, confirmed) {
      const user = requireUser(token, 'SESSION');
      if (confirmed !== true) throw new Error('Please confirm attendance before submitting.');
      const cls = parseCls(grade, section);
      const state = global.DemoStorage.load();
      const date = todayStr();
      const sdi = schoolDayInfo(state, date);
      if (!sdi.isSchoolDay) throw new Error('Attendance cannot be submitted on a holiday or non-school day.');
      if (state.attendance.some(r => r.date === date && r.classId === cls.name)) {
        throw new Error('Attendance for this class has already been submitted today.');
      }
      const roster = state.students.filter(s => s.grade === cls.grade && s.section === cls.section && isEligible(s, date));
      if (!roster.length) throw new Error('No eligible students in this class.');
      const byId = new Map(entries.map(e => [String(e.studentId), String(e.status).toUpperCase()]));
      roster.forEach(s => {
        state.attendance.push({
          date,
          year: Number(date.slice(0, 4)),
          studentId: s.id,
          studentName: s.name,
          admissionNo: s.admission,
          rollNo: s.roll,
          grade: cls.grade,
          section: cls.section,
          classId: cls.name,
          gender: s.gender,
          status: byId.get(s.id) || 'PRESENT',
          submittedBy: user.username
        });
      });
      global.DemoStorage.save(state);
      return { success: true, date, className: cls.name, count: roster.length };
    },

    getAttendanceDashboard(token, academicYear) {
      requireUser(token, 'SESSION');
      return buildDashboard(global.DemoStorage.load(), academicYear);
    },

    adminGetSubmittedClassesForDate(token, date) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      const counts = new Map();
      state.attendance.filter(r => r.date === date).forEach(r => counts.set(r.classId, (counts.get(r.classId) || 0) + 1));
      const vers = new Map(state.verifications.filter(v => v.date === date).map(v => [v.classId, v.verifiedBy]));
      return {
        date,
        classes: state.classes.filter(c => c.active).map(c => ({
          grade: c.grade,
          section: c.section,
          className: c.className,
          submitted: (counts.get(c.className) || 0) > 0,
          count: counts.get(c.className) || 0,
          verified: vers.has(c.className),
          verifiedBy: vers.get(c.className) || ''
        })).sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
      };
    },

    adminGetAttendanceReview(token, date, grade, section) {
      requireUser(token, 'ADMIN');
      const cls = parseCls(grade, section);
      const state = global.DemoStorage.load();
      const rows = state.attendance.filter(r => r.date === date && r.classId === cls.name);
      const ver = state.verifications.find(v => v.date === date && v.classId === cls.name);
      return {
        date,
        className: cls.name,
        submitted: rows.length > 0,
        verified: Boolean(ver),
        verifiedBy: ver ? ver.verifiedBy : '',
        students: rows.map(r => ({
          studentId: r.studentId, name: r.studentName, status: r.status, rollNo: r.rollNo, admissionNo: r.admissionNo
        })).sort((a, b) => Number(a.rollNo) - Number(b.rollNo))
      };
    },

    adminVerifyAttendance(token, date, grade, section) {
      const admin = requireUser(token, 'ADMIN');
      const cls = parseCls(grade, section);
      const state = global.DemoStorage.load();
      const rows = state.attendance.filter(r => r.date === date && r.classId === cls.name);
      if (!rows.length) throw new Error('Attendance not submitted for this class/date.');
      if (state.verifications.some(v => v.date === date && v.classId === cls.name)) throw new Error('Already verified.');
      state.verifications.push({ date, classId: cls.name, verifiedBy: admin.username });
      global.DemoStorage.save(state);
      return { success: true, count: rows.length };
    },

    adminCorrectAttendance(token, date, grade, section, studentId, newStatus, reason) {
      requireUser(token, 'ADMIN');
      const cls = parseCls(grade, section);
      if (String(reason || '').trim().length < 5) throw new Error('Correction reason must be at least 5 characters.');
      const state = global.DemoStorage.load();
      const target = state.attendance.find(r => r.date === date && r.classId === cls.name && r.studentId === studentId);
      if (!target) throw new Error('Attendance record not found.');
      const oldStatus = target.status;
      target.status = newStatus;
      state.verifications = state.verifications.filter(v => !(v.date === date && v.classId === cls.name));
      global.DemoStorage.save(state);
      return { success: true, oldStatus, newStatus, requiresVerification: true };
    },

    authListStaff(token) {
      requireUser(token, 'ADMIN');
      return clone(global.DemoStorage.load().staff.filter(s => !s.archived));
    },

    authCreateStaff(token, name, username, role) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      const u = String(username || '').trim().toLowerCase();
      if (state.staff.some(s => s.username === u)) throw new Error('Username already exists.');
      const staffId = 'STF-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      state.staff.push({ staffId, name: name.trim(), username: u, role, active: true, mustChangePassword: true, archived: false });
      global.DemoStorage.save(state);
      return { success: true, staffId, username: u };
    },

    authSetStaffActive(token, staffId, active) {
      const admin = requireUser(token, 'ADMIN');
      if (admin.staffId === staffId) throw new Error('You cannot deactivate your own account.');
      const state = global.DemoStorage.load();
      const s = state.staff.find(x => x.staffId === staffId);
      if (!s) throw new Error('Staff account not found.');
      s.active = Boolean(active);
      global.DemoStorage.save(state);
      return { success: true };
    },

    authResetStaffPassword(token) {
      requireUser(token, 'ADMIN');
      return { success: true, message: 'Temporary password reset (simulated in demo).' };
    },

    authArchiveStaff(token, staffId) {
      const admin = requireUser(token, 'ADMIN');
      if (admin.staffId === staffId) throw new Error('You cannot archive your own account.');
      const state = global.DemoStorage.load();
      const s = state.staff.find(x => x.staffId === staffId);
      if (!s || s.role !== 'TEACHER') throw new Error('Only teacher accounts can be archived.');
      s.archived = true;
      s.active = false;
      global.DemoStorage.save(state);
      return { success: true, message: 'Teacher archived. Historical records preserved.' };
    },

    adminGetCalendarTerms(token, year) {
      requireUser(token, 'ADMIN');
      const y = Number(year);
      const state = global.DemoStorage.load();
      return {
        calendar: clone(state.calendar.filter(c => c.date.startsWith(String(y)))).sort((a, b) => a.date.localeCompare(b.date)),
        terms: clone(state.terms.filter(t => t.year === y)).sort((a, b) => a.start.localeCompare(b.start))
      };
    },

    adminSaveCalendarDay(token, date, type, description) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      if (state.calendar.some(c => c.date === date)) throw new Error('Date already has a calendar entry.');
      state.calendar.push({ date, type, description: description.trim(), schoolDay: type === 'SCHOOL_DAY' ? 'TRUE' : 'FALSE' });
      global.DemoStorage.save(state);
      return { success: true };
    },

    adminDeleteCalendarDay(token, date) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      state.calendar = state.calendar.filter(c => c.date !== date);
      global.DemoStorage.save(state);
      return { success: true };
    },

    adminSaveAcademicTerm(token, year, term, start, end) {
      requireUser(token, 'ADMIN');
      const y = Number(year), name = String(term || '').trim();
      if (!name || start > end) throw new Error('Invalid term or date range.');
      const state = global.DemoStorage.load();
      if (state.terms.some(t => t.year === y && start <= t.end && end >= t.start)) {
        throw new Error('Term overlaps an existing term.');
      }
      state.terms.push({ year: y, term: name, start, end });
      global.DemoStorage.save(state);
      return { success: true };
    },

    smList(token, grade) {
      requireUser(token, 'ADMIN');
      const g = Number(grade);
      const state = global.DemoStorage.load();
      return {
        classes: state.classes.filter(c => c.grade === g).map(c => ({ name: c.className, section: c.section, active: c.active })),
        students: state.students.filter(s => s.grade === g).map(s => ({ ...s, status: s.active ? 'ACTIVE' : 'LEFT' })).sort((a, b) => a.section.localeCompare(b.section) || Number(a.roll) - Number(b.roll))
      };
    },

    smAddClass(token, grade, section) {
      requireUser(token, 'ADMIN');
      const c = parseCls(grade, section);
      const state = global.DemoStorage.load();
      if (state.classes.some(x => x.grade === c.grade && x.section === c.section)) throw new Error('Section already exists.');
      state.classes.push({ grade: c.grade, section: c.section, className: c.name, active: true, academicYear: todayStr().slice(0, 4) });
      global.DemoStorage.save(state);
      return { success: true };
    },

    smAddStudent(token, student) {
      requireUser(token, 'ADMIN');
      const c = parseCls(student.grade, student.section);
      const state = global.DemoStorage.load();
      if (!state.classes.some(x => x.grade === c.grade && x.section === c.section && x.active)) throw new Error('Class does not exist.');
      if (state.students.some(s => s.admission.toLowerCase() === String(student.admission).trim().toLowerCase())) throw new Error('Admission number already exists.');
      if (state.students.some(s => s.grade === c.grade && s.section === c.section && Number(s.roll) === Number(student.roll) && s.active)) throw new Error('Roll number already used.');
      const id = 'STU-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      state.students.push({
        id, admission: student.admission.trim(), name: student.name.trim(),
        grade: c.grade, section: c.section, classId: c.name, roll: Number(student.roll),
        gender: student.gender, active: true, admitted: student.admitted, left: ''
      });
      global.DemoStorage.save(state);
      return { success: true, id };
    },

    smEditStudent(token, studentId, changes) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      const s = state.students.find(x => x.id === studentId);
      if (!s) throw new Error('Student not found.');
      if (!s.active) throw new Error('Cannot edit a student who has left.');
      s.name = changes.name.trim();
      s.gender = changes.gender;
      s.roll = Number(changes.roll);
      global.DemoStorage.save(state);
      return { success: true };
    },

    smTransferStudent(token, studentId, grade, section) {
      requireUser(token, 'ADMIN');
      const c = parseCls(grade, section);
      const state = global.DemoStorage.load();
      const s = state.students.find(x => x.id === studentId);
      if (!s || !s.active) throw new Error('Active student not found.');
      if (state.attendance.some(a => a.studentId === studentId)) {
        throw new Error('This student has attendance history. Transfer is blocked to preserve historical class reports.');
      }
      if (!state.classes.some(x => x.grade === c.grade && x.section === c.section && x.active)) {
        throw new Error('Destination class is not active.');
      }
      s.grade = c.grade; s.section = c.section; s.classId = c.name;
      global.DemoStorage.save(state);
      return { success: true };
    },

    smMarkStudentLeft(token, id, departureDate) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      const s = state.students.find(x => x.id === id);
      if (!s) throw new Error('Student not found.');
      if (!s.active) throw new Error('Already marked as Left.');
      s.active = false;
      s.left = departureDate;
      global.DemoStorage.save(state);
      return { success: true };
    },

    getTeacherAttendanceSummary(token) {
      const user = requireUser(token, 'SESSION');
      return buildTeacherSummary(global.DemoStorage.load(), user);
    },

    recordTeacherAttendance(token, data) {
      const user = requireUser(token, 'SESSION');
      const state = global.DemoStorage.load();
      const today = todayStr();
      if (state.teacherAttendance.some(r => r.teacherId === user.staffId && r.date === today)) {
        throw new Error('You have already submitted your attendance today.');
      }
      let leaveType = '';
      if (data.status === 'HALF DAY') leaveType = data.halfDay;
      else if (data.status === 'SHORT LEAVE') leaveType = 'PERIODS:' + (data.periods || []).join(',');
      else if (data.status === 'ABSENT') leaveType = 'FULL_DAY';

      state.teacherAttendance.push({
        teacherId: user.staffId,
        teacherName: user.name,
        date: today,
        status: data.status,
        leaveType,
        reasonCategory: data.status === 'PRESENT' ? '' : data.reasonCategory,
        submittedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      global.DemoStorage.save(state);
      return { success: true, message: 'Your attendance has been submitted.', warnings: [] };
    },

    adminGetTeacherLeavePolicy(token) {
      requireUser(token, 'ADMIN');
      return clone(global.DemoStorage.load().leavePolicy);
    },

    adminSaveTeacherLeavePolicy(token, data) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      state.leavePolicy = {
        periodType: data.periodType,
        customStart: data.customStart || '',
        customEnd: data.customEnd || '',
        absenceLimit: data.absenceLimit === '' ? '' : Number(data.absenceLimit),
        shortLeaveLimit: data.shortLeaveLimit === '' ? '' : Number(data.shortLeaveLimit),
        shortLeaveCounting: data.shortLeaveCounting,
        warningPercent: Number(data.warningPercent),
        exceedAction: data.exceedAction,
        halfDayAbsenceUnits: Number(data.halfDayAbsenceUnits)
      };
      global.DemoStorage.save(state);
      return { success: true, message: 'Teacher leave policy saved.' };
    },

    adminGetTeacherDailyAttendance(token, filterDate) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      const records = state.teacherAttendance
        .filter(r => filterDate === 'ALL' || r.date === filterDate)
        .sort((a, b) => b.date.localeCompare(a.date) || a.teacherName.localeCompare(b.teacherName));
      return { date: filterDate, totalSubmitted: records.length, records: clone(records) };
    },

    adminListTeachersForAttendance(token) {
      requireUser(token, 'ADMIN');
      return clone(global.DemoStorage.load().staff.filter(s => s.role === 'TEACHER' && !s.archived));
    },

    adminGetTeacherSummary(token, teacherId) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      const t = state.staff.find(s => s.staffId === teacherId && s.role === 'TEACHER');
      if (!t) throw new Error('Teacher not found.');
      return buildTeacherSummary(state, t);
    },

    adminCorrectTeacherAttendance(token, teacherId, date, data, reason) {
      requireUser(token, 'ADMIN');
      if (String(reason || '').trim().length < 5) throw new Error('Reason must be at least 5 characters.');
      const state = global.DemoStorage.load();
      const rec = state.teacherAttendance.find(r => r.teacherId === teacherId && r.date === date);
      if (!rec) throw new Error('Teacher record not found for ' + date);
      let leaveType = '';
      if (data.status === 'HALF DAY') leaveType = data.halfDay;
      else if (data.status === 'SHORT LEAVE') leaveType = 'PERIODS:' + (data.periods || []).join(',');
      else if (data.status === 'ABSENT') leaveType = 'FULL_DAY';
      rec.status = data.status;
      rec.leaveType = leaveType;
      rec.reasonCategory = data.status === 'PRESENT' ? '' : data.reasonCategory;
      global.DemoStorage.save(state);
      return { success: true, message: 'Teacher attendance corrected for ' + date + '.' };
    },

    getAttendanceReportOptions(token, year) {
      requireUser(token, 'ADMIN');
      const y = Number(year);
      const state = global.DemoStorage.load();
      return {
        terms: state.terms.filter(t => t.year === y).map(t => ({ name: t.term, start: t.start, end: t.end })),
        students: state.students.map(s => ({ id: s.id, name: s.name, grade: s.grade, cls: s.classId })),
        classes: state.classes.filter(c => c.active).map(c => c.className),
        teachers: state.staff.filter(s => s.role === 'TEACHER' && !s.archived).map(s => ({ id: s.staffId, name: s.name, username: s.username }))
      };
    },

    generateAttendanceReportHtml(token, options) {
      requireUser(token, 'ADMIN');
      const state = global.DemoStorage.load();
      const y = Number(options.year);
      const mode = String(options.periodMode || 'FULL_YEAR').toUpperCase();
      let scope = { year: y, periodLabel: 'Full Year ' + y, start: y + '-01-01', end: y + '-12-31' };
      if (mode === 'MONTHLY') {
        const m = Number(options.month);
        const mm = String(m).padStart(2, '0');
        const last = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
        const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        scope = { year: y, periodLabel: names[m - 1] + ' ' + y, start: y + '-' + mm + '-01', end: y + '-' + mm + '-' + last };
      } else if (mode === 'TERM') {
        const t = state.terms.find(x => x.year === y && x.term === options.term);
        if (!t) throw new Error('Select a valid academic term.');
        scope = { year: y, periodLabel: t.term + ' (' + y + ')', start: t.start, end: t.end };
      }

      const kind = String(options.type || '').toUpperCase();
      const f = String(options.filter || '').trim();

      if (kind === 'TEACHER_INDIVIDUAL' || kind === 'TEACHER_SUMMARY') {
        const tRows = state.teacherAttendance.filter(r => r.date >= scope.start && r.date <= scope.end);
        const map = new Map();
        tRows.forEach(r => {
          if (!map.has(r.teacherId)) map.set(r.teacherId, { id: r.teacherId, name: r.teacherName, present: 0, absent: 0, halfDay: 0, shortLeave: 0, total: 0, dates: [] });
          const x = map.get(r.teacherId);
          x.total++;
          if (r.status === 'PRESENT') x.present++;
          else if (r.status === 'ABSENT') x.absent++;
          else if (r.status === 'HALF DAY') x.halfDay++;
          else if (r.status === 'SHORT LEAVE') x.shortLeave++;
          x.dates.push(r);
        });
        const tData = [...map.values()];
        if (kind === 'TEACHER_INDIVIDUAL') {
          const t = tData.find(x => x.id === f);
          if (!t) throw new Error('No teacher records in selected period.');
          const cols = [{ title: 'DATE' }, { title: 'STATUS' }, { title: 'LEAVE DETAILS' }, { title: 'REASON' }];
          const rows = t.dates.map(d => [d.date, d.status, d.leaveType || '—', d.reasonCategory || '—']);
          return {
            title: 'Teacher Report — ' + t.name,
            htmlFilename: 'Teacher_' + t.id + '.html',
            csvFilename: 'Teacher_' + t.id + '.csv',
            html: buildReportHtmlDoc(t.name, renderReportSection('Individual Teacher Report', scope, cols, rows, ['TEACHER: ' + t.name, 'Present: ' + t.present + ' | Absent: ' + t.absent + ' | Half Day: ' + t.halfDay + ' | Short Leave: ' + t.shortLeave], [])),
            csv: toCsv(cols, rows)
          };
        }
        const cols = [{ title: 'ID' }, { title: 'TEACHER NAME' }, { title: 'PRESENT', align: 'right' }, { title: 'ABSENT', align: 'right' }, { title: 'HALF DAY', align: 'right' }, { title: 'SHORT LEAVE', align: 'right' }, { title: 'TOTAL', align: 'right' }];
        const rows = tData.map(x => [x.id, x.name, x.present, x.absent, x.halfDay, x.shortLeave, x.total]);
        return {
          title: 'Teachers Summary',
          htmlFilename: 'Teachers_Summary.html',
          csvFilename: 'Teachers_Summary.csv',
          html: buildReportHtmlDoc('Teachers Summary', renderReportSection('Staff Attendance Summary', scope, cols, rows, ['Teachers: ' + tData.length], [])),
          csv: toCsv(cols, rows)
        };
      }

      const recs = state.attendance.filter(r => r.date >= scope.start && r.date <= scope.end);
      const map = new Map();
      recs.forEach(r => {
        if (!map.has(r.studentId)) map.set(r.studentId, { id: r.studentId, name: r.studentName, grade: r.grade, cls: r.classId, present: 0, absent: 0, late: 0, total: 0, dates: [] });
        const x = map.get(r.studentId);
        x.total++;
        x[r.status.toLowerCase()]++;
        x.dates.push({ date: r.date, status: r.status });
      });
      const data = [...map.values()].map(x => ({ ...x, percent: x.total ? Math.round(10000 * (x.present + x.late) / x.total) / 100 : 0 }));

      if (kind === 'STUDENT') {
        const x = data.find(s => s.id === f);
        if (!x) throw new Error('No attendance records for this student in selected period.');
        const cols = [{ title: 'DATE' }, { title: 'STATUS' }];
        const rows = x.dates.map(d => [d.date, d.status]);
        return {
          title: 'Student Report — ' + x.name,
          htmlFilename: 'Student_' + x.id + '.html',
          csvFilename: 'Student_' + x.id + '.csv',
          html: buildReportHtmlDoc(x.name, renderReportSection('Individual Student Attendance', scope, cols, rows, ['STUDENT: ' + x.name + ' | CLASS: ' + x.cls, 'Present: ' + x.present + ' | Absent: ' + x.absent + ' | Late: ' + x.late + ' | Rate: ' + x.percent + '%'], ['Late counts as attended.'])),
          csv: toCsv(cols, rows)
        };
      }

      if (['CLASS', 'GRADE', 'SCHOOL'].includes(kind)) {
        const sel = data.filter(x => kind === 'SCHOOL' || (kind === 'GRADE' ? x.grade === Number(f) : x.cls === f.toUpperCase()));
        if (!sel.length) throw new Error('No attendance records for this selection.');
        const cols = [{ title: 'ID' }, { title: 'STUDENT NAME' }, { title: 'CLASS' }, { title: 'P', align: 'right' }, { title: 'A', align: 'right' }, { title: 'L', align: 'right' }, { title: 'DAYS', align: 'right' }, { title: 'RATE %', align: 'right' }];
        const rows = sel.map(x => [x.id, x.name, x.cls, x.present, x.absent, x.late, x.total, x.percent + '%']);
        return {
          title: kind + ' Attendance Summary',
          htmlFilename: kind + '_Summary.html',
          csvFilename: kind + '_Summary.csv',
          html: buildReportHtmlDoc(kind + ' Summary', renderReportSection(kind + ' Attendance Summary', scope, cols, rows, ['Students: ' + sel.length], [])),
          csv: toCsv(cols, rows)
        };
      }

      const sel = data.filter(x => kind === 'SCHOOL_BOOKLET' || x.grade === Number(f));
      if (!sel.length) throw new Error('No attendance records for this selection.');
      const cols = [{ title: 'DATE' }, { title: 'STATUS' }];
      const body = sel.map(x => renderReportSection('Student Attendance Report', scope, cols, x.dates.map(d => [d.date, d.status]), ['STUDENT: ' + x.name + ' | CLASS: ' + x.cls, 'Rate: ' + x.percent + '%'], [])).join('');
      const csvCols = [{ title: 'ID' }, { title: 'NAME' }, { title: 'CLASS' }, { title: 'DATE' }, { title: 'STATUS' }];
      const csvRows = [];
      sel.forEach(x => x.dates.forEach(d => csvRows.push([x.id, x.name, x.cls, d.date, d.status])));
      return {
        title: 'Printable Student Booklet',
        htmlFilename: 'Booklet.html',
        csvFilename: 'Booklet.csv',
        html: buildReportHtmlDoc('Printable Booklet', body),
        csv: toCsv(csvCols, csvRows)
      };
    }
  };

  // ---------- GOOGLE.SCRIPT.RUN EMULATOR ----------
  function createRunner() {
    let successHandler = null;
    let failureHandler = null;
    const runner = {
      withSuccessHandler(fn) { successHandler = fn; return runner; },
      withFailureHandler(fn) { failureHandler = fn; return runner; }
    };
    Object.keys(API).forEach(methodName => {
      runner[methodName] = function (...args) {
        setTimeout(() => {
          try {
            const res = API[methodName](...args);
            if (typeof successHandler === 'function') successHandler(res);
          } catch (err) {
            if (typeof failureHandler === 'function') failureHandler(err instanceof Error ? err : new Error(String(err)));
          }
        }, 65);
      };
    });
    return runner;
  }

  global.google = global.google || {};
  global.google.script = global.google.script || {};
  Object.defineProperty(global.google.script, 'run', {
    configurable: true,
    get() { return createRunner(); }
  });

  global.DemoAPI = {
    quickLogin(role) { return API.demoQuickLogin(role); }
  };
})(window);