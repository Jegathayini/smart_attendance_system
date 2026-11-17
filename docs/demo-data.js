/**
 * Smart School Attendance System — Standalone Demo Data
 * Fictional school data for interactive GitHub Pages preview (zero backend required).
 */
(function (global) {
  'use strict';

  function demoColomboToday() {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function shiftIsoDate(isoDate, deltaDays) {
    const d = new Date(isoDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }

  function isWeekend(isoDate) {
    const day = new Date(isoDate + 'T12:00:00Z').getUTCDay();
    return day === 0 || day === 6;
  }

  function recentWeekdays(today, count) {
    const out = [];
    let offset = 1;
    while (out.length < count) {
      const d = shiftIsoDate(today, -offset);
      if (!isWeekend(d)) out.push(d);
      offset++;
    }
    return out.reverse();
  }

  function buildDefaultDemoState() {
    const today = demoColomboToday();
    const year = Number(today.slice(0, 4));
    const pastDays = recentWeekdays(today, 7);

    const classes = [
      { grade: 6, section: 'A', className: '6A', active: true, academicYear: String(year) },
      { grade: 7, section: 'A', className: '7A', active: true, academicYear: String(year) },
      { grade: 7, section: 'B', className: '7B', active: true, academicYear: String(year) },
      { grade: 8, section: 'A', className: '8A', active: true, academicYear: String(year) },
      { grade: 8, section: 'B', className: '8B', active: true, academicYear: String(year) }
    ];

    // Includes bilingual English + Tamil Unicode names to demonstrate report rendering
    const students = [
      // Grade 6A (7 students)
      { id: 'STU-6A01', admission: 'ADM-2024-001', name: 'Kavitha Selvam (கவிதா செல்வம்)', grade: 6, section: 'A', classId: '6A', roll: 1, gender: 'FEMALE', active: true, admitted: (year - 2) + '-01-10', left: '' },
      { id: 'STU-6A02', admission: 'ADM-2024-002', name: 'Arun Kumar (அருண் குமார்)', grade: 6, section: 'A', classId: '6A', roll: 2, gender: 'MALE', active: true, admitted: (year - 2) + '-01-10', left: '' },
      { id: 'STU-6A03', admission: 'ADM-2024-003', name: 'Niroshan Perera', grade: 6, section: 'A', classId: '6A', roll: 3, gender: 'MALE', active: true, admitted: (year - 2) + '-01-12', left: '' },
      { id: 'STU-6A04', admission: 'ADM-2024-004', name: 'Tharushi Silva', grade: 6, section: 'A', classId: '6A', roll: 4, gender: 'FEMALE', active: true, admitted: (year - 2) + '-01-12', left: '' },
      { id: 'STU-6A05', admission: 'ADM-2024-005', name: 'Dinesh Rajendran (தினேஷ் ராஜேந்திரன்)', grade: 6, section: 'A', classId: '6A', roll: 5, gender: 'MALE', active: true, admitted: (year - 2) + '-01-15', left: '' },
      { id: 'STU-6A06', admission: 'ADM-2024-006', name: 'Meera Krishnan', grade: 6, section: 'A', classId: '6A', roll: 6, gender: 'FEMALE', active: true, admitted: (year - 2) + '-01-15', left: '' },
      { id: 'STU-6A07', admission: 'ADM-2024-007', name: 'Sajith Fernando', grade: 6, section: 'A', classId: '6A', roll: 7, gender: 'MALE', active: true, admitted: (year - 1) + '-02-01', left: '' },

      // Grade 7A (8 students)
      { id: 'STU-7A01', admission: 'ADM-2023-011', name: 'Nila Balasubramaniam (நிலா பாலசுப்ரமணியம்)', grade: 7, section: 'A', classId: '7A', roll: 1, gender: 'FEMALE', active: true, admitted: (year - 3) + '-01-08', left: '' },
      { id: 'STU-7A02', admission: 'ADM-2023-012', name: 'Praveen Jayawardena', grade: 7, section: 'A', classId: '7A', roll: 2, gender: 'MALE', active: true, admitted: (year - 3) + '-01-08', left: '' },
      { id: 'STU-7A03', admission: 'ADM-2023-013', name: 'Shalini Mahendran (ஷாலினி மகேந்திரன்)', grade: 7, section: 'A', classId: '7A', roll: 3, gender: 'FEMALE', active: true, admitted: (year - 3) + '-01-09', left: '' },
      { id: 'STU-7A04', admission: 'ADM-2023-014', name: 'Vimalanathan Siva', grade: 7, section: 'A', classId: '7A', roll: 4, gender: 'MALE', active: true, admitted: (year - 3) + '-01-10', left: '' },
      { id: 'STU-7A05', admission: 'ADM-2023-015', name: 'Amaya Wickramasinghe', grade: 7, section: 'A', classId: '7A', roll: 5, gender: 'FEMALE', active: true, admitted: (year - 3) + '-01-11', left: '' },
      { id: 'STU-7A06', admission: 'ADM-2023-016', name: 'Roshan Gunawardena', grade: 7, section: 'A', classId: '7A', roll: 6, gender: 'MALE', active: true, admitted: (year - 3) + '-01-11', left: '' },
      { id: 'STU-7A07', admission: 'ADM-2023-017', name: 'Deepika Senthil', grade: 7, section: 'A', classId: '7A', roll: 7, gender: 'FEMALE', active: true, admitted: (year - 2) + '-05-04', left: '' },
      { id: 'STU-7A08', admission: 'ADM-2023-018', name: 'Harishankar Mohan', grade: 7, section: 'A', classId: '7A', roll: 8, gender: 'MALE', active: true, admitted: (year - 2) + '-05-04', left: '' },

      // Grade 7B (7 students — pending today!)
      { id: 'STU-7B01', admission: 'ADM-2023-021', name: 'Janani Ravindran (ஜனனி ரவீந்திரன்)', grade: 7, section: 'B', classId: '7B', roll: 1, gender: 'FEMALE', active: true, admitted: (year - 3) + '-01-08', left: '' },
      { id: 'STU-7B02', admission: 'ADM-2023-022', name: 'Kishore Thirumal', grade: 7, section: 'B', classId: '7B', roll: 2, gender: 'MALE', active: true, admitted: (year - 3) + '-01-08', left: '' },
      { id: 'STU-7B03', admission: 'ADM-2023-023', name: 'Sanduni Senanayake', grade: 7, section: 'B', classId: '7B', roll: 3, gender: 'FEMALE', active: true, admitted: (year - 3) + '-01-12', left: '' },
      { id: 'STU-7B04', admission: 'ADM-2023-024', name: 'Ashok Ganeshan', grade: 7, section: 'B', classId: '7B', roll: 4, gender: 'MALE', active: true, admitted: (year - 3) + '-01-12', left: '' },
      { id: 'STU-7B05', admission: 'ADM-2023-025', name: 'Nivetha Baskaran (நிவேதா பாஸ்கரன்)', grade: 7, section: 'B', classId: '7B', roll: 5, gender: 'FEMALE', active: true, admitted: (year - 3) + '-01-14', left: '' },
      { id: 'STU-7B06', admission: 'ADM-2023-026', name: 'Chamara Dissanayake', grade: 7, section: 'B', classId: '7B', roll: 6, gender: 'MALE', active: true, admitted: (year - 2) + '-03-01', left: '' },
      { id: 'STU-7B07', admission: 'ADM-2023-027', name: 'Malini Navaratnam', grade: 7, section: 'B', classId: '7B', roll: 7, gender: 'FEMALE', active: true, admitted: (year - 2) + '-03-01', left: '' },

      // Grade 8A (7 students — pending today!)
      { id: 'STU-8A01', admission: 'ADM-2022-031', name: 'Suren Vigneswaran (சுரேன் விக்னேஸ்வரன்)', grade: 8, section: 'A', classId: '8A', roll: 1, gender: 'MALE', active: true, admitted: (year - 4) + '-01-10', left: '' },
      { id: 'STU-8A02', admission: 'ADM-2022-032', name: 'Ishani Jayasuriya', grade: 8, section: 'A', classId: '8A', roll: 2, gender: 'FEMALE', active: true, admitted: (year - 4) + '-01-10', left: '' },
      { id: 'STU-8A03', admission: 'ADM-2022-033', name: 'Gokul Yogendran', grade: 8, section: 'A', classId: '8A', roll: 3, gender: 'MALE', active: true, admitted: (year - 4) + '-01-11', left: '' },
      { id: 'STU-8A04', admission: 'ADM-2022-034', name: 'Priyanka Suresh', grade: 8, section: 'A', classId: '8A', roll: 4, gender: 'FEMALE', active: true, admitted: (year - 4) + '-01-11', left: '' },
      { id: 'STU-8A05', admission: 'ADM-2022-035', name: 'Dilshan Karunaratne', grade: 8, section: 'A', classId: '8A', roll: 5, gender: 'MALE', active: true, admitted: (year - 4) + '-01-12', left: '' },
      { id: 'STU-8A06', admission: 'ADM-2022-036', name: 'Lakshmi Loganathan', grade: 8, section: 'A', classId: '8A', roll: 6, gender: 'FEMALE', active: true, admitted: (year - 3) + '-02-15', left: '' },
      { id: 'STU-8A07', admission: 'ADM-2022-037', name: 'Thilan Wijesinghe', grade: 8, section: 'A', classId: '8A', roll: 7, gender: 'MALE', active: true, admitted: (year - 3) + '-02-15', left: '' },

      // Grade 8B (7 active + 1 left student — pending today!)
      { id: 'STU-8B01', admission: 'ADM-2022-041', name: 'Kavinaya Pathmanathan (கவிநயா பத்மநாதன்)', grade: 8, section: 'B', classId: '8B', roll: 1, gender: 'FEMALE', active: true, admitted: (year - 4) + '-01-10', left: '' },
      { id: 'STU-8B02', admission: 'ADM-2022-042', name: 'Nuwan Rajapaksha', grade: 8, section: 'B', classId: '8B', roll: 2, gender: 'MALE', active: true, admitted: (year - 4) + '-01-10', left: '' },
      { id: 'STU-8B03', admission: 'ADM-2022-043', name: 'Anushika Velautham', grade: 8, section: 'B', classId: '8B', roll: 3, gender: 'FEMALE', active: true, admitted: (year - 4) + '-01-14', left: '' },
      { id: 'STU-8B04', admission: 'ADM-2022-044', name: 'Sanjay Maheswaran', grade: 8, section: 'B', classId: '8B', roll: 4, gender: 'MALE', active: true, admitted: (year - 4) + '-01-14', left: '' },
      { id: 'STU-8B05', admission: 'ADM-2022-045', name: 'Hasini Samaraweera', grade: 8, section: 'B', classId: '8B', roll: 5, gender: 'FEMALE', active: true, admitted: (year - 4) + '-01-18', left: '' },
      { id: 'STU-8B06', admission: 'ADM-2022-046', name: 'Tharindu Ekanayake', grade: 8, section: 'B', classId: '8B', roll: 6, gender: 'MALE', active: true, admitted: (year - 3) + '-04-02', left: '' },
      { id: 'STU-8B07', admission: 'ADM-2022-047', name: 'Mathura Sivakumar', grade: 8, section: 'B', classId: '8B', roll: 7, gender: 'FEMALE', active: true, admitted: (year - 3) + '-04-02', left: '' },
      { id: 'STU-8B08', admission: 'ADM-2022-048', name: 'Rajanathan Kumaran', grade: 8, section: 'B', classId: '8B', roll: 8, gender: 'MALE', active: false, admitted: (year - 4) + '-01-10', left: shiftIsoDate(today, -30) }
    ];

    const staff = [
      { staffId: 'ADMIN001', name: 'Principal S. Vignesh (Demo Admin)', username: 'admin', role: 'ADMIN', active: true, mustChangePassword: false, archived: false },
      { staffId: 'STF-T001', name: 'Ms. Priya Nadarajah (Demo Teacher)', username: 'priya.n', role: 'TEACHER', active: true, mustChangePassword: false, archived: false },
      { staffId: 'STF-T002', name: 'Mr. Kasun Bandara', username: 'kasun.b', role: 'TEACHER', active: true, mustChangePassword: false, archived: false },
      { staffId: 'STF-T003', name: 'Ms. Anitha Rajan', username: 'anitha.r', role: 'TEACHER', active: true, mustChangePassword: false, archived: false }
    ];

    const terms = [
      { year, term: 'Term 1', start: year + '-01-05', end: year + '-04-10' },
      { year, term: 'Term 2', start: year + '-04-20', end: year + '-08-15' },
      { year, term: 'Term 3', start: year + '-09-01', end: year + '-12-10' }
    ];

    const calendar = [
      { date: year + '-01-14', type: 'HOLIDAY', description: 'Thai Pongal Festival', schoolDay: 'FALSE' },
      { date: year + '-02-04', type: 'HOLIDAY', description: 'National Independence Day', schoolDay: 'FALSE' },
      { date: year + '-05-01', type: 'HOLIDAY', description: 'May Day Holiday', schoolDay: 'FALSE' }
    ];

    // If visitor opens the demo on a weekend, automatically enable today as a Demo School Day
    if (isWeekend(today)) {
      calendar.push({
        date: today,
        type: 'SCHOOL_DAY',
        description: 'Weekend Interactive Demo Day',
        schoolDay: 'TRUE'
      });
    }

    const leavePolicy = {
      periodType: 'MONTHLY',
      customStart: '',
      customEnd: '',
      absenceLimit: 3,
      shortLeaveLimit: 4,
      shortLeaveCounting: 'OCCURRENCES',
      warningPercent: 75,
      exceedAction: 'WARN',
      halfDayAbsenceUnits: 0.5
    };

    // Build realistic student attendance history over past 7 weekdays + 2 submitted classes today (6A, 7A)
    const attendance = [];
    const verifications = [];
    const activeStudents = students.filter(s => s.active);

    pastDays.forEach((d, dayIdx) => {
      classes.forEach((cls, clsIdx) => {
        const roster = activeStudents.filter(s => s.classId === cls.className);
        roster.forEach((st, stIdx) => {
          const mod = (dayIdx + clsIdx + stIdx) % 13;
          const status = mod === 3 ? 'ABSENT' : (mod === 7 ? 'LATE' : 'PRESENT');
          attendance.push({
            date: d,
            year: Number(d.slice(0, 4)),
            studentId: st.id,
            studentName: st.name,
            admissionNo: st.admission,
            rollNo: st.roll,
            grade: st.grade,
            section: st.section,
            classId: st.classId,
            gender: st.gender,
            status,
            submittedBy: 'priya.n'
          });
        });
        if (dayIdx < pastDays.length - 1 || clsIdx < 3) {
          verifications.push({ date: d, classId: cls.className, verifiedBy: 'admin' });
        }
      });
    });

    // Today: 6A (verified) and 7A (pending verification) already submitted; 7B, 8A, 8B remain Pending
    ['6A', '7A'].forEach((clsName, cIdx) => {
      activeStudents.filter(s => s.classId === clsName).forEach((st, idx) => {
        const status = idx === 2 ? 'ABSENT' : (idx === 4 && cIdx === 1 ? 'LATE' : 'PRESENT');
        attendance.push({
          date: today,
          year: Number(today.slice(0, 4)),
          studentId: st.id,
          studentName: st.name,
          admissionNo: st.admission,
          rollNo: st.roll,
          grade: st.grade,
          section: st.section,
          classId: st.classId,
          gender: st.gender,
          status,
          submittedBy: 'priya.n'
        });
      });
    });
    verifications.push({ date: today, classId: '6A', verifiedBy: 'admin' });

    // Build TeacherAttendance history (STF-T001 has past records, NOT today yet so visitor can test self-submission!)
    const teacherAttendance = [];
    pastDays.forEach((d, idx) => {
      teacherAttendance.push({
        teacherId: 'STF-T001',
        teacherName: 'Ms. Priya Nadarajah (Demo Teacher)',
        date: d,
        status: idx === 2 ? 'HALF DAY' : (idx === 5 ? 'SHORT LEAVE' : 'PRESENT'),
        leaveType: idx === 2 ? 'FIRST HALF' : (idx === 5 ? 'PERIODS:7,8' : ''),
        reasonCategory: (idx === 2 || idx === 5) ? 'PERSONAL' : '',
        submittedAt: '07:45 AM'
      });
      teacherAttendance.push({
        teacherId: 'STF-T002',
        teacherName: 'Mr. Kasun Bandara',
        date: d,
        status: idx === 4 ? 'ABSENT' : 'PRESENT',
        leaveType: idx === 4 ? 'FULL_DAY' : '',
        reasonCategory: idx === 4 ? 'OFFICIAL' : '',
        submittedAt: '07:50 AM'
      });
    });
    // Today: STF-T002 & STF-T003 already submitted so Admin view has live rows today
    teacherAttendance.push({
      teacherId: 'STF-T002',
      teacherName: 'Mr. Kasun Bandara',
      date: today,
      status: 'PRESENT',
      leaveType: '',
      reasonCategory: '',
      submittedAt: '07:42 AM'
    });
    teacherAttendance.push({
      teacherId: 'STF-T003',
      teacherName: 'Ms. Anitha Rajan',
      date: today,
      status: 'SHORT LEAVE',
      leaveType: 'PERIODS:1,2',
      reasonCategory: 'PERSONAL',
      submittedAt: '08:05 AM'
    });

    return {
      classes,
      students,
      staff,
      terms,
      calendar,
      leavePolicy,
      attendance,
      verifications,
      teacherAttendance,
      auditLog: []
    };
  }

  global.DemoData = {
    demoColomboToday,
    buildDefaultDemoState
  };
})(window);