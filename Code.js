
/**
 * SMART SCHOOL ATTENDANCE MANAGEMENT SYSTEM
 * J/ Manipay Memorial English School
 *
 * Database: Google Sheets
 * Timezone: Asia/Colombo
 *
 * Phase 1: Database connection and validation
 */

// ============================================
// 1. DATABASE CONNECTION
// ============================================

function getDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      "Database not found. Open Apps Script from the connected spreadsheet."
    );
  }

  return ss;
}

function getRequiredSheet(sheetName) {
  const sheet = getDatabase().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Missing sheet: " + sheetName);
  }

  return sheet;
}

// ============================================
// 2. TEST DATABASE CONNECTION
// ============================================

function testDatabaseConnection() {
  const ss = getDatabase();

  Logger.log("Database connection successful!");
  Logger.log("Connected to: " + ss.getName());
}

// ============================================
// 3. VALIDATE ALL DATABASE SHEETS
// ============================================

function validateDatabaseSheets() {
  const requiredSheets = [
    "Students",
    "Attendance",
    "Staff_Access",
    "Classes",
    "School_Calendar",
    "Academic_Terms",
    "Audit_Log",
    "Settings"
  ];

  const ss = getDatabase();
  const missing = [];

  requiredSheets.forEach(name => {
    if (ss.getSheetByName(name)) {
      Logger.log("PASS: " + name);
    } else {
      Logger.log("MISSING: " + name);
      missing.push(name);
    }
  });

  if (missing.length > 0) {
    throw new Error(
      "Missing database sheets: " + missing.join(", ")
    );
  }

  Logger.log("SUCCESS: All 8 database tabs found!");
}

// ============================================
// 4. READ SHEET DATA USING HEADERS
// ============================================

function readSheetRecords(sheetName) {
  const sheet = getRequiredSheet(sheetName);
  const values = sheet.getDataRange().getValues();

  const headers = values[0].map(
    value => String(value).trim()
  );

  const records = values.slice(1)
    .filter(row =>
      row.some(value => value !== "" && value !== null)
    )
    .map((row, index) => {
      const record = {
        _rowNumber: index + 2
      };

      headers.forEach((header, columnIndex) => {
        record[header] = row[columnIndex];
      });

      return record;
    });

  return { headers, records };
}

// ============================================
// 5. NORMALIZE CLASS IDS
// ============================================

function normalizeClassId(classId) {
  const value = String(classId || "")
    .trim()
    .toUpperCase();

  // Examples:
  // 1A     -> 1A
  // 01A    -> 1A
  // CLS01  -> 1A
  // CLS13  -> 13A

  const classCode = value.match(/^CLS0*(\d+)$/);

  if (classCode) {
    return Number(classCode[1]) + "A";
  }

  const gradeSection = value.match(/^0*(\d+)([A-Z])$/);

  if (gradeSection) {
    return Number(gradeSection[1]) + gradeSection[2];
  }

  return value;
}

// ============================================
// 6. VALIDATE STUDENT DATA
// ============================================

function validateStudentData() {
  const studentsData = readSheetRecords("Students");
  const classesData = readSheetRecords("Classes");

  const requiredStudentHeaders = [
    "Student_ID",
    "Grade",
    "Class_ID"
  ];

  const requiredClassHeaders = [
    "Class_ID",
    "Grade",
    "Section"
  ];

  requiredStudentHeaders.forEach(header => {
    if (!studentsData.headers.includes(header)) {
      throw new Error(
        "Students sheet missing column: " + header
      );
    }
  });

  requiredClassHeaders.forEach(header => {
    if (!classesData.headers.includes(header)) {
      throw new Error(
        "Classes sheet missing column: " + header
      );
    }
  });

  const students = studentsData.records;
  const classes = classesData.records;

  const errors = [];

  Logger.log("Total students: " + students.length);
  Logger.log("Total classes: " + classes.length);

  // Validate class identifiers
  const validClassIds = new Set(
    classes.map(cls =>
      normalizeClassId(
        String(cls.Grade).trim() +
        String(cls.Section).trim()
      )
    )
  );

  // Validate expected student count
  if (students.length !== 390) {
    errors.push(
      "Expected 390 students, found " + students.length
    );
  }

  // Validate each grade
  for (let grade = 1; grade <= 13; grade++) {
    const gradeStudents = students.filter(
      student => Number(student.Grade) === grade
    );

    Logger.log(
      "Grade " + grade + ": " +
      gradeStudents.length + " students"
    );

    if (gradeStudents.length !== 30) {
      errors.push(
        "Grade " + grade +
        ": Expected 30, found " +
        gradeStudents.length
      );
    }
  }

  // Validate student IDs and class assignments
  const studentIds = new Set();

  students.forEach(student => {
    const studentId = String(
      student.Student_ID || ""
    ).trim();

    if (!studentId) {
      errors.push("Student found without Student_ID");
    }

    if (studentIds.has(studentId)) {
      errors.push(
        "Duplicate Student_ID: " + studentId
      );
    }

    studentIds.add(studentId);

    const classId = normalizeClassId(
      student.Class_ID
    );

    if (!validClassIds.has(classId)) {
      errors.push(
        "Invalid class for " +
        studentId + ": " + student.Class_ID
      );
    }
  });

  // Final validation result
  if (errors.length > 0) {
    errors.forEach(error => {
      Logger.log("ERROR: " + error);
    });

    throw new Error(
      "Student validation failed with " +
      errors.length + " error(s)."
    );
  }

  Logger.log(
    "SUCCESS: All 390 student records are valid!"
  );
}

// ============================================
// 7. RUN ALL DATABASE TESTS
// ============================================

function runDatabaseTests() {
  Logger.log("================================");
  Logger.log("SMART SCHOOL ATTENDANCE SYSTEM");
  Logger.log("DATABASE VALIDATION");
  Logger.log("================================");

  testDatabaseConnection();
  validateDatabaseSheets();
  validateStudentData();

  Logger.log("================================");
  Logger.log("ALL DATABASE TESTS PASSED!");
  Logger.log("================================");
}

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle("Smart School Attendance System")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}



function attendanceReadRows_(sheetName) {
  const sheet = getRequiredSheet(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0].map(String);

  return values.slice(1)
    .filter(row => row.some(value => value !== ""))
    .map(row => {
      const record = {};

      headers.forEach((header, index) => {
        record[header] = row[index];
      });

      return record;
    });
}

function getAttendanceClasses(token, grade) {
  authRequire_(token, "SESSION");

  const selectedGrade = Number(grade);

  if (
    !Number.isInteger(selectedGrade) ||
    selectedGrade < 1 ||
    selectedGrade > 13
  ) {
    throw new Error("Invalid grade.");
  }

  return attendanceReadRows_("Classes")
    .filter(row =>
      Number(row.Grade) === selectedGrade &&
      String(row.Active).toLowerCase() === "true"
    )
    .map(row => ({
      grade: selectedGrade,
      section: String(row.Section).trim(),
      className: String(row.Class_Name).trim()
    }));
}


function getAttendanceStudents(token, grade, section) {
  authRequire_(token, "SESSION");

  const selectedGrade = Number(grade);
  const selectedSection = String(section || "")
    .trim()
    .toUpperCase();

  if (
    !Number.isInteger(selectedGrade) ||
    selectedGrade < 1 ||
    selectedGrade > 13 ||
    !/^[A-Z][A-Z0-9]*$/.test(selectedSection)
  ) {
    throw new Error("Invalid class selection.");
  }

  const className = selectedGrade + selectedSection;

  const activeClass = getAttendanceClasses(
    token,
    selectedGrade
  ).some(item => item.className === className);

  if (!activeClass) {
    throw new Error("Selected class is not active.");
  }

  // Current date in the school's timezone
  const timezone = "Asia/Colombo";
  const today = Utilities.formatDate(
    new Date(),
    timezone,
    "yyyy-MM-dd"
  );

  // Convert a sheet date into yyyy-MM-dd
  function formatSheetDate(value) {
    if (!value) return "";

    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(
        value,
        timezone,
        "yyyy-MM-dd"
      );
    }

    const parsed = new Date(value);

    if (isNaN(parsed.getTime())) return "";

    return Utilities.formatDate(
      parsed,
      timezone,
      "yyyy-MM-dd"
    );
  }

  function isActiveStudent(row) {
    const activeValue = String(row.Active)
      .trim()
      .toLowerCase();

    const isActive =
      activeValue === "true" ||
      activeValue === "yes" ||
      activeValue === "1" ||
      activeValue === "active";

    const admissionDate = formatSheetDate(
      row.Admission_Date
    );

    const leavingDate = formatSheetDate(
      row.Leaving_Date
    );

    // Exclude students before their admission date.
    if (admissionDate && today < admissionDate) {
      return false;
    }

    // Leaving_Date is the student's FINAL attendance date.
    // They remain eligible on that date.
    // From the following day, they are excluded.
    if (leavingDate) {
      return today <= leavingDate;
    }

    // Students without a leaving date must be Active.
    return isActive;
  }

  return attendanceReadRows_("Students")
    .filter(row =>
      Number(row.Grade) === selectedGrade &&
      normalizeClassId(row.Class_ID) === className &&
      isActiveStudent(row)
    )
    .map(row => ({
      studentId: String(row.Student_ID),
      name: String(
        row.Student_Name || row.Name || ""
      ),
      rollNo: row.Roll_No || "",
      gender: String(row.Gender || "")
    }))
    .sort((a, b) =>
      Number(a.rollNo) - Number(b.rollNo)
    );
}

