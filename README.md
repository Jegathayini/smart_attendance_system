# 📋 Smart School Attendance Management System

**A secure and configurable school attendance management system built with Google Apps Script and Google Sheets.**

[![Platform](https://img.shields.io/badge/Platform-Google%20Apps%20Script-4285F4)](https://developers.google.com/apps-script)
[![Database](https://img.shields.io/badge/Database-Google%20Sheets-34A853)](https://www.google.com/sheets/about/)
[![Frontend](https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-orange)](#technology-stack)
[![Authentication](https://img.shields.io/badge/Authentication-Role%20Based-blue)](#authentication-and-security)
[![Reports](https://img.shields.io/badge/Reports-PDF%20%7C%20CSV-purple)](#reports-and-exports)
[![Version](https://img.shields.io/badge/Version-1.0-blue)](#project-status)
[![Visibility](https://img.shields.io/badge/Repository-Public-brightgreen)](https://github.com/Jegathayini/smart_attendance_system)

> **Project status:** Deployed. The system includes student attendance management, teacher self-attendance, administrative corrections, configurable leave policies, attendance analysis, and reporting. If you'd like to evaluate or test the system locally, you can use the included [`Fictional_data.xlsx`](Fictional_data.xlsx) sample database workbook containing 100% fictional school records. 💙

---

## 🌐 Live Demo

**Explore the Smart School Attendance System:** [Open the live demo](https://jegathayini.github.io/smart_attendance_system/).

The repository includes a separate `docs/` directory for the public demonstration interface.

The public demonstration is intended to use fictional student and teacher records only. It must remain separate from the actual Google Apps Script application and must never connect to a real school's attendance database.

> **Demo safety:** Never enter real student details, teacher information, attendance records, or passwords into a public demonstration.

---

## 💙 Welcome to Smart School Attendance Management System!

I developed **Smart School Attendance Management System** to simplify daily attendance recording, teacher attendance monitoring, administrative verification, and school-wide attendance analysis.

The system brings student attendance and teacher self-attendance together in one centralized browser-based application.

**👩‍🏫 Teachers:** Record daily student attendance and submit personal attendance.  
**👨‍💼 Administrators:** Manage students, classes, staff accounts, attendance records, leave policies, and reports.  
**👩‍💻 Developers:** Explore the source code, configure a fictional test database, and contribute improvements.

> 💡 **New here?** Start with [Installation and configuration](#installation-and-configuration), then explore the [Google Sheets data model](#google-sheets-data-model) and [Authentication and security](#authentication-and-security).

---

## 🧭 Table of contents

1. [Live demo](#live-demo)
2. [Overview](#overview)
3. [Main features](#main-features)
4. [User roles](#user-roles)
5. [Technology stack](#technology-stack)
6. [How the system works](#how-the-system-works)
7. [Repository structure](#repository-structure)
8. [Requirements](#requirements)
9. [Installation and configuration](#installation-and-configuration)
10. [Google Sheets data model](#google-sheets-data-model)
11. [Authentication and security](#authentication-and-security)
12. [Student attendance workflow](#student-attendance-workflow)
13. [Teacher attendance and leave policies](#teacher-attendance-and-leave-policies)
14. [Dashboard and analysis](#dashboard-and-analysis)
15. [Reports and exports](#reports-and-exports)
16. [Testing](#testing)
17. [Troubleshooting](#troubleshooting)
18. [Customization](#customization)
19. [Limitations and roadmap](#limitations-and-roadmap)
20. [Contributing](#contributing)
21. [Feedback and bug reports](#feedback-and-bug-reports)
22. [Author](#author)

---

## 🌟 Overview

**Smart School Attendance Management System** aims to reduce the administrative workload involved in recording and monitoring school attendance.

The application provides a centralized system for:

- Daily student attendance.
- Teacher self-attendance.
- Attendance verification and corrections.
- Student and teacher management.
- Configurable teacher leave policies.
- School-wide attendance analysis.
- Academic-term and monthly reporting.

The system uses Google Sheets as its database and Google Apps Script for server-side processing. Its frontend is developed using HTML, CSS, and JavaScript.

It is designed around a single-school deployment and can be configured according to the school's grade structure, class sections, academic calendar, and attendance policies.

### 🎯 Project goals

- Simplify daily student attendance recording.
- Allow teachers to record their own attendance.
- Provide administrators with centralized attendance monitoring.
- Reduce manual calculations and reporting work.
- Support configurable school calendars and leave policies.
- Maintain a record of administrative corrections.
- Generate structured attendance reports.
- Provide a cost-effective solution using Google Workspace services.

---

## ✨ Main features

### 🔐 1. Authentication and staff management

- Username and password-based login.
- Separate `ADMIN` and `TEACHER` roles.
- Administrator-created staff accounts.
- Temporary passwords for newly created accounts.
- Mandatory password change on first login.
- Administrator-controlled account activation and deactivation.
- Password reset functionality.
- Session expiration after 30 minutes.
- Maximum of 5 unsuccessful login attempts.
- Temporary login restriction for 15 minutes after reaching the attempt limit.
- Password hashing using SHA-256 with individual salts and a private application pepper.

### 🎓 2. Student and class management

- Support for Grades 01–13.
- Manage multiple sections within a grade.
- Register new students.
- Edit student information.
- Deactivate students who leave the school.
- Maintain previous student records.
- Record admission and leaving dates.
- Manage admission numbers and student identifiers.
- Gender-based student information.
- Student transfers between classes, subject to attendance-record restrictions.

**Student eligibility:** Admission and leaving dates are considered when determining whether a student should be included in attendance for a particular date.

### 📝 3. Daily student attendance

- Daily class-wise attendance recording.
- Any active teacher can mark attendance for any available class.
- Attendance statuses:
  - `PRESENT`
  - `ABSENT`
  - `LATE`
- Default Everyone Present functionality.
- Individual student status adjustments.
- Attendance totals and summaries before submission.
- Submission confirmation before saving records.
- One-time submission for each class per day.
- Submitted attendance becomes read-only for teachers.
- Teachers can view previously submitted attendance.
- Administrators can review and correct submitted records.
- Corrections require a reason and are recorded in the audit log.

**Important:** Late students are included in the Present attendance category for overall attendance calculations while Late is tracked separately for reporting.

### ✅ 4. Attendance verification and administrative corrections

- Administrators can review submitted class attendance.
- View attendance records by date, grade, and section.
- Verify completed attendance records.
- Maintain attendance verification information.
- Correct incorrectly submitted student attendance.
- Require an administrative reason for corrections.
- Record administrative changes in the audit log.
- Track class submission and verification status.

### 👨‍🏫 5. Teacher self-attendance

Teachers can record their own daily attendance independently of student attendance.

Supported attendance statuses:

| Status | Description |
|---|---|
| PRESENT | Teacher attended school |
| ABSENT | Teacher was absent |
| HALF DAY | Teacher attended part of the day |
| SHORT LEAVE | Teacher requested or recorded a short leave |

Additional features:

- Personal daily attendance submission.
- Half-day selection (first half or second half).
- Short-leave period selection.
- Personal and official reason categories.
- Teacher attendance history.
- Attendance summaries.
- Configurable leave limits.
- Leave policy warnings.
- Admin access to teacher attendance records.
- Administrator corrections with reasons and audit records.

### ⚙️ 6. Configurable teacher leave policies

Administrators can configure leave policies according to the school's requirements.

Supported policy settings include:

| Setting | Purpose |
|---|---|
| Period Type | Defines the policy period |
| Custom Start / End | Configures custom policy dates |
| Absence Limit | Maximum permitted absence units |
| Short Leave Limit | Permitted short-leave limit |
| Short Leave Counting | Defines how short leave contributes to limits |
| Warning Percentage | Determines when warnings should appear |
| Exceed Action | Configures the response when limits are exceeded |
| Half-Day Units | Defines half-day absence counting |

The application uses the configured policy to calculate leave usage and provide warnings to teachers.

### 📅 7. School calendar and academic terms

- Manage school calendar dates.
- Configure school days and holidays.
- Add special school days.
- Record school closures.
- Maintain academic years.
- Configure academic term start and end dates.
- Use school calendar information for attendance planning and reporting.

### 📊 8. Attendance dashboard and analysis

- Whole-school attendance overview.
- Grade-wise attendance statistics.
- Class and section-wise attendance statistics.
- Gender-wise attendance analysis.
- Present, Absent, and Late counts.
- Total attendance records.
- Attendance percentage calculations.
- Daily attendance overview.
- Completed and pending class submissions.
- Academic-year-based attendance analysis.
- Manual dashboard refresh.

### 📄 9. Attendance reports

Administrators can generate attendance reports for school monitoring and record-keeping.

Supported report periods:

- Full academic year.
- Individual academic terms.
- Monthly attendance.

Report coverage:

- Individual student reports.
- Class-wise attendance information.
- Student attendance summaries.
- Teacher attendance reports.
- Attendance statistics.

Export features:

- Printable A4 PDF reports.
- CSV export.
- Tamil Unicode-compatible report layouts.
- Structured report formatting.

---

## 👥 User roles

The application provides two main access roles.

| Capability | Teacher | Administrator |
|---|:---:|:---:|
| Sign in | Yes | Yes |
| Change own password | Yes | Yes |
| View attendance dashboard | Yes | Yes |
| Mark student attendance | Yes | Yes |
| View submitted student attendance | Yes | Yes |
| Correct student attendance | No | Yes |
| Verify student attendance | No | Yes |
| Mark personal attendance | Yes | No | 
| View personal attendance summary | Yes | Yes |
| View teacher attendance records | No | Yes |
| Correct teacher attendance | No | Yes |
| Manage students and classes | No | Yes |
| Configure leave policies | No | Yes |
| Manage school calendar | No | Yes |
| Manage academic terms | No | Yes |
| Manage staff accounts | No | Yes |
| Generate official reports | No | Yes |

Actual access is enforced through server-side authentication and role checks, not only by hiding interface elements.

---

## 🛠️ Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML5 | Application structure |
| Styling | CSS3 | Responsive interface and themes |
| Frontend logic | JavaScript | Interactive application functionality |
| Backend | Google Apps Script | Server-side processing and authorization |
| Database | Google Sheets | Centralized attendance data storage |
| Authentication | Custom SHA-256-based authentication | Staff login and session management |
| Caching | Google Apps Script CacheService | Data caching and performance optimization |
| Communication | `google.script.run` | Frontend-to-backend communication |
| Hosting | Google Apps Script Web App | Application deployment |
| Source control | Git and GitHub | Version management |

No separate paid hosting server or external database is required by the current architecture.

---

## ⚙️ How the system works

```text
             Teacher / Administrator
                       |
                       v
                Browser Interface
                    Index.html
                       |
                       v
                 google.script.run
                       |
                       v
              Google Apps Script
                       |
             Authentication & Roles
                       |
          +------------+------------+
          |            |            |
          v            v            v
       Student       Teacher      Admin
      Attendance   Attendance   Management
          |            |            |
          +------------+------------+
                       |
                       v
                Google Sheets
                   Database
                       |
          +------------+------------+
          |            |            |
          v            v            v
       Dashboard    Verification   Reports
       & Analysis   & Audit Log    & Export
```

### Application workflow

1. The user opens the deployed web application.
2. The user signs in using their assigned credentials.
3. The backend validates the account and creates an authenticated session.
4. The interface loads the relevant workspace according to the user's role.
5. Teachers submit attendance through the application.
6. Administrators manage records, verification, policies, and reports.
7. Data is stored and retrieved from the connected Google Sheets workbook.

> The browser is never treated as the source of truth for user permissions or administrative authorization.

---

## 📁 Repository structure

```text
smart_attendance_system/
│
├── Auth.js                 # Authentication and staff management
├── CalendarTerm.js         # School calendar and academic terms
├── Code.js                 # Core application and database functions
├── Dashboard.js            # Attendance dashboard and analysis
├── Fictional_data.xlsx     # 📥 Sample fictional database workbook
├── Index.html              # Main application interface
├── README.md               # Project documentation
├── Reports.js              # PDF reports and CSV exports
├── StudentManagement.js    # Student and class management
├── TeacherAttendance.js    # Teacher self-attendance and leave policies
├── appsscript.json          # Apps Script manifest
│
├── docs/                   # Public demonstration interface (GitHub Pages)
│   ├── index.html
│   ├── demo-api.js
│   ├── demo-data.js
│   └── demo-storage.js
│
└── .gitignore
```

**Important filename mapping:** The repository uses `.js` files for server-side Apps Script source code. When importing the project into Google Apps Script, create corresponding `.gs` script files and copy the source into them.

The frontend file should be named `Index.html` in Apps Script because the application uses the `Index` template.


---

## 📋 Requirements

- A Google account.
- Google Sheets.
- Google Apps Script access.
- Permission to create and deploy Apps Script web applications.
- A modern web browser.
- A Google Spreadsheet for the application database.

Basic knowledge of Google Sheets and Apps Script is helpful.

---

## 🚀 Installation and configuration

### 🔹 Step 1 — Download the source

```bash
git clone https://github.com/Jegathayini/smart_attendance_system.git
cd smart_attendance_system
```

Alternatively, use **Code → Download ZIP** from GitHub.

### 🔹 Step 2 — Create the Google Sheets database

1. Download the sample workbook [`Fictional_data.xlsx`](Fictional_data.xlsx) from the repository root[cite: 5].
2. Upload it to your **Google Drive** and open it with **Google Sheets** (*File → Save as Google Sheets*).
3. Rename the spreadsheet to `Smart School Attendance Database` and keep it **private**.
4. Verify that all 12 required worksheets (`Students`, `Classes`, `Attendance`, `Attendance_Verifications`, `Staff_Access`, `Teachers`, `TeacherAttendance`, `Teacher_Leave_Policies`, `School_Calendar`, `Academic_Terms`, `Audit_Log`, `Settings`) are present.

Use fictional records during initial setup and testing.

### 🔹 Step 3 — Open Google Apps Script

1. Open the newly created spreadsheet.
2. Navigate to **Extensions → Apps Script**.
3. This creates a spreadsheet-bound Apps Script project.
4. Rename the project appropriately.

### 🔹 Step 4 — Add the server-side files

Create the following script files in the Apps Script editor:

| Repository file | Apps Script filename |
|---|---|
| `Code.js` | `Code.gs` |
| `Auth.js` | `Auth.gs` |
| `Attendance.js` | `Attendance.gs` |
| `AttendanceAdmin.js` | `AttendanceAdmin.gs` |
| `TeacherAttendance.js` | `TeacherAttendance.gs` |
| `StudentManagement.js` | `StudentManagement.gs` |
| `CalendarTerm.js` | `CalendarTerm.gs` |
| `Dashboard.js` | `Dashboard.gs` |
| `Reports.js` | `Reports.gs` |

Copy each file's source code into its corresponding Apps Script file.

All server-side modules must belong to the same Apps Script project because they share functions and database helpers.

### 🔹 Step 5 — Add the frontend

1. Create a new HTML file named `Index`.
2. Copy the contents of the repository's `Index.html`.
3. Save the file.
4. Ensure the filename matches the `doGet()` template reference exactly.

### 🔹 Step 6 — Configure the Apps Script manifest

The repository contains `appsscript.json`.

1. Enable the manifest file in Apps Script project settings.
2. Review the manifest configuration.
3. Check the timezone.
4. Keep only the OAuth scopes required by the application.
5. Save and resolve any manifest errors.

The application uses the `Asia/Colombo` timezone for attendance dates.

### 🔹 Step 7 — Initialize the database

The database relies on the exact sheet names and column headers verified from the application schema:

```text
Students
Teacher_Leave_Policies
Teachers
TeacherAttendance
Attendance_Verifications
Attendance
Classes
Staff_Access
School_Calendar
Audit_Log
Academic_Terms
Settings
```

### 🔹 Step 8 — Initialize authentication

The authentication module provides an initialization function:

```javascript
authInitialize(token)
```

The initial administrator setup uses:

```javascript
setupInitialAdmin_()
```

For the first administrator:

1. Open Apps Script project settings.
2. Add the private Script Property `INITIAL_ADMIN_PASSWORD`.
3. Set a strong, unique initial password.
4. Run `setupInitialAdmin_()` from the Apps Script editor.
5. Complete the required authorization.
6. Sign in through the web application.
7. Change the initial password if prompted.

The setup function consumes and deletes the initial password property after successful account creation.

**Security:** Never commit initial passwords, password hashes, authentication secrets, or session information to GitHub.

### 🔹 Step 9 — Configure fictional test records

Before using real school records:

1. Add fictional student information.
2. Configure Grades 01–13.
3. Add the required class sections.
4. Configure academic years and terms.
5. Add sample school calendar entries.
6. Create fictional teacher accounts.
7. Test student and teacher attendance workflows.

Check that the sheet names and column headers match the source-code requirements.

### 🔹 Step 10 — Deploy the web application

1. Select **Deploy → New deployment**.
2. Choose **Web app**.
3. Configure the execution identity.
4. Restrict access to the appropriate intended users.
5. Deploy and authorize the required Google services.
6. Open the generated web application URL.
7. Test administrator and teacher login separately.

> **Important:** Deployment as the spreadsheet owner gives the application the owner's permissions. Every protected backend operation must validate the authenticated session and role. Do not expose real student records through a public deployment.

---

## 📊 Google Sheets data model
> 📥 **Sample Database:** A ready-to-use sample workbook pre-populated with fictional students, classes, attendance logs, and leave policies is included in this repository as [`Fictional_data.xlsx`](Fictional_data.xlsx)[cite: 5]. Never use real student details or passwords when testing.

The application uses Google Sheets as its centralized database. Below is the exact schema corresponding to the application worksheets and columns:

### 🗂️ Core database sheets & column mappings

#### 1. `Students`
* **Columns:** `Student_ID`, `Admission_No`, `Student_Name`, `Gender`, `Grade`, `Section`, `Class_ID`, `Roll_No`, `Admission_Date`, `Leaving_Date`, `Active`
* **Purpose:** Stores individual student demographic details, roll numbers, admissions, and active status.

#### 2. `Attendance`
* **Columns:** `Attendance_ID`, `Date`, `Academic_Year`, `Student_ID`, `Admission_No`, `Student_Name`, `Grade`, `Section`, `Class_ID`, `Gender`, `Status`, `Submitted_By`, `Submitted_At`
* **Purpose:** Central daily student attendance logs (`PRESENT`, `ABSENT`, `LATE`).

#### 3. `Staff_Access`
* **Columns:** `Staff_ID`, `Name`, `Username`, `Role`, `Active`, `PasswordSalt`, `PasswordHash`, `MustChangePassword`, `Created_At`, `Updated_At`
* **Purpose:** Manages system users (`ADMIN`, `TEACHER`), credentials, and role assignments securely.

#### 4. `Classes`
* **Columns:** `Class_ID`, `Grade`, `Section`, `Class_Name`, `Active`
* **Purpose:** Defines grade-section combinations (e.g., Grade 1 Section A -> `1A`).

#### 5. `TeacherAttendance`
* **Columns:** `Timestamp`, `Teacher ID`, `Teacher Name`, `Status`, `Leave Type`, `Reason Category`
* **Purpose:** Logs personal daily teacher self-attendance, half-days, and short leaves.

#### 6. `Teacher_Leave_Policies`
* **Columns:** `Policy_ID`, `Period_Type`, `Custom_Start`, `Custom_End`, `Absence_Limit`, `Short_Leave_Limit`, `Short_Leave_Counting`, `Warning_Percent`, `Exceed_Action`, `Half_Day_Absence_Units`, `Active`, `Updated_By`, `Updated_At`
* **Purpose:** Governs limits, warnings, and rules for teacher leaves and short-leave policies.

#### 7. `Attendance_Verifications`
* **Columns:** `Date`, `Class_ID`, `Verified_By`, `Verified_At`, `Revision`
* **Purpose:** Tracks administrative approval and verification records for class registers.

#### 8. `School_Calendar`
* **Columns:** `Date`, `Day_Type`, `Description`, `Academic_Year`, `Updated_By`, `Updated_At`, `Is_School_Day`
* **Purpose:** Configures school open days, holidays, and closures.

#### 9. `Academic_Terms`
* **Columns:** `Academic_Year`, `Term`, `Start_Date`, `End_Date`, `Updated_By`, `Updated_At`
* **Purpose:** Defines academic calendar terms and date boundaries.

#### 10. `Audit_Log`
* **Columns:** `Log_ID`, `Timestamp`, `Action`, `Performed_By`, `Target_Type`, `Target_ID`, `Old_Value`, `New_Value`, `Reason`
* **Purpose:** Maintains a secure log of administrative corrections and system modifications.

#### 11. `Settings`
* **Columns:** `Setting_Key`, `Setting_Value`
* **Purpose:** Stores application-wide metadata such as `School_Name` and `School_Address`.

#### 12. `Teachers`
* **Columns:** `Teachers`, `Teacher Name`, `Status`
* **Purpose:** Supplementary staff tracking and registry tab.

---

## 🛡️ Authentication and security

### 🔑 Custom authentication

The application implements username/password authentication with:

- SHA-256-based password hashing.
- Individual password salts.
- A private application authentication pepper.
- Session-based authorization.
- A 30-minute session lifetime.
- Five unsuccessful login attempts before temporary lockout.
- Fifteen-minute login restriction.
- Mandatory first-login password changes.

### 👥 Role-based authorization

All protected server-side operations use authentication and role checks.

Teachers cannot access administrator-only operations simply by changing frontend elements or manually calling protected functions.

### 🔒 Data protection

The application is designed with the following precautions:

- Keep the Google Sheets database private.
- Restrict Apps Script editor access.
- Avoid sharing authentication records.
- Never commit production data to GitHub.
- Keep application secrets in Script Properties.
- Use fictional data for public demonstrations.
- Require administrator reasons for attendance corrections.
- Maintain administrative activity records.

### ⚠️ Security considerations

The application uses custom authentication implemented within Google Apps Script. Although it includes password hashing, session handling, login restrictions, and server-side authorization, it has not been independently security-audited.

Before using real school data, review deployment permissions, authentication, session revocation, data access, backups, and applicable privacy requirements.

---

## 🧑‍🎓 Student attendance workflow

### 👩‍🏫 Teacher workflow

```text
Sign in
   |
   v
Open Daily Attendance
   |
   v
Select Grade and Section
   |
   v
Load Student Register
   |
   v
Default Everyone Present
   |
   v
Adjust Individual Statuses
   |
   v
Review Attendance Summary
   |
   v
Confirm Submission
   |
   v
Submit Attendance
   |
   v
Submitted Records (Read-only)
```

### 🔐 Attendance submission rules

- Attendance can be recorded for the current date.
- Any active teacher can mark attendance for an available class.
- Teachers must confirm their submission.
- A submitted class attendance record cannot be edited by teachers.
- Administrators can correct submitted records.
- Administrative corrections require a reason and are logged.

### 🏫 Administrator workflow

```text
Sign in
   |
   v
Open Attendance Review
   |
   v
Select Date / Grade / Section
   |
   v
Review Submitted Attendance
   |
   +---------------------+
   |                     |
   v                     v
Verify Attendance    Correct Records
                         |
                         v
                   Enter Reason
                         |
                         v
                   Save Correction
                         |
                         v
                    Audit Log
```

---

## 👨‍🏫 Teacher attendance and leave policies

### 📝 Teacher self-attendance

Each teacher can submit their own daily attendance using their authenticated account.

The system records the teacher identity from the authenticated session rather than accepting an arbitrary teacher identity from the browser.

### 📌 Attendance types

- Present.
- Absent.
- Half Day.
- Short Leave.

### ⚙️ Leave policy administration

Administrators can configure the leave policy according to school requirements.

Policy configurations include absence limits, short-leave limits, counting rules, warning percentages, and exceed actions.

### 🛠️ Administrator corrections

Administrators can:

- View teacher attendance for a selected date.
- Load attendance records across all dates.
- Select a teacher's attendance record.
- Correct the attendance information.
- Provide a reason for the correction.
- Save the corrected record with administrative audit information.

This allows accidental submissions and subsequent changes to be handled through administrative review.

---

## 📈 Dashboard and analysis

The dashboard provides an overview of student attendance across the school.

### 📊 Analysis categories

| Analysis | Information |
|---|---|
| Whole School | Overall attendance statistics |
| Grade-wise | Attendance by grade |
| Class-wise | Attendance by class |
| Gender-wise | Boys' and girls' attendance statistics |
| Daily Summary | Today's attendance |
| Submission Status | Completed and pending classes |

### 📌 Attendance calculations

- Present and Late are tracked separately.
- Late is included in the Present category for overall attendance.
- Absent is counted separately.
- Student admission and leaving dates are considered for eligibility.
- Attendance percentages are calculated using eligible attendance records.

The dashboard supports academic-year selection and manual refreshing.

---

## 📄 Reports and exports

Administrators can generate attendance reports using the reporting interface.

### 📅 Report periods

| Report type | Description |
|---|---|
| Full Year | Attendance for the selected academic year |
| Academic Term | Attendance within a selected term |
| Monthly | Attendance within a selected month |

### 👨‍🎓 Student reports

- Individual student attendance reports.
- Attendance summaries.
- Class and grade-related information.
- Attendance statistics for the selected reporting period.

### 👨‍🏫 Teacher reports

- Teacher attendance records.
- Attendance summaries.
- Monthly and term-based reporting where supported by the report configuration.

### 📥 Export formats

- Printable A4 PDF.
- CSV export.

The report templates support UTF-8 content, including Tamil text.

Official reporting access is restricted to administrators.

---

## 🧪 Testing

The application should be tested using fictional school records before deployment.

### Suggested test matrix

| Area | Test |
|---|---|
| Authentication | Valid and invalid login |
| Sessions | Session expiration after 30 minutes |
| Login security | Five failed attempts and temporary lockout |
| Password management | Initial password change |
| Staff management | Create, deactivate, reset, and archive accounts |
| Role access | Teacher denied administrator-only operations |
| Student management | Add, edit, deactivate students |
| Class management | Grade and section selection |
| Attendance | Present, Absent, and Late |
| Default attendance | Everyone Present functionality |
| Submission | Confirmation and duplicate submission prevention |
| Teacher access | Submitted attendance is read-only |
| Admin corrections | Correction with reason and audit record |
| Verification | Verify submitted class attendance |
| Teacher self-attendance | Present, Absent, Half Day, Short Leave |
| Leave policies | Limits, warnings, and configured rules |
| Teacher corrections | Administrator correction of teacher records |
| Calendar | School days, holidays, and special days |
| Academic terms | Academic-year and term configuration |
| Dashboard | Whole-school and grade-wise analysis |
| Reports | Full-year, term, and monthly reports |
| Exports | PDF and CSV |
| Data eligibility | Admission and leaving dates |
| Security | Unauthorized backend access attempts |

Testing should include invalid inputs, restricted access attempts, and administrative correction scenarios, not only successful submissions.

---

## 🔧 Troubleshooting

| Problem | Possible cause | What to check |
|---|---|---|
| Database not found | Apps Script is not connected to the spreadsheet | Open Apps Script through the correct spreadsheet |
| Missing sheet error | Required database tab is unavailable | Verify the exact sheet names (`Students`, `Attendance`, `Staff_Access`, `Classes`, `TeacherAttendance`, `Teacher_Leave_Policies`, `Attendance_Verifications`, `School_Calendar`, `Academic_Terms`, `Audit_Log`, `Settings`, `Teachers`) |
| Staff_Access headers do not match | Incorrect authentication sheet structure | Compare the ten required headers |
| Authentication not working | Incorrect account or authentication initialization | Review setup and Script Properties |
| Session expired | Session reached its expiration time | Sign in again |
| Access denied | Insufficient user permissions | Check account role and active status |
| Students not loading | Student or class schema mismatch | Verify required columns |
| Attendance submission fails | Invalid data or duplicate submission | Check server-side validation |
| Dashboard loading slowly | Large spreadsheet or cache issue | Inspect Apps Script executions |
| Reports not generating | Missing data or export authorization | Review report module and execution logs |
| Latest changes not appearing | Old deployment version | Update the Apps Script deployment |

For backend errors, inspect the **Apps Script → Executions** page.

Do not disable authorization checks to solve access-related errors.

---

## 🎨 Customization

The application can be adapted according to school requirements.

Possible customizations include:

- Grade and section structures.
- Student register fields.
- School calendar.
- Academic years and terms.
- Teacher leave limits.
- Short-leave counting rules.
- Leave warning thresholds.
- Attendance report layouts.
- Application colours and themes.
- Additional school-specific settings.

When changing the database schema, update the related backend validation and frontend functionality together.

---

## 🗺️ Limitations and roadmap

### 🚧 Current limitations

- Designed for a single-school deployment.
- Uses Google Sheets as the primary database.
- Depends on Apps Script execution and quota limits.
- Custom authentication requires independent security review.
- Performance depends on workbook size and Google Apps Script limits.
- No claim is made that the system has passed an independent security or privacy audit.
- The public demonstration and actual school application are separate environments.

### 💡 Possible future improvements

- Enhanced attendance analytics.
- More flexible school-specific policy configurations.
- Additional reporting formats.
- Improved automated testing.
- Stronger session revocation.
- Additional accessibility and multilingual improvements.
- Enhanced backup and recovery procedures.
- Further performance optimization.

---

## 🤝 Contributing

Suggestions, bug reports, and improvements are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test using fictional school data.
5. Submit a Pull Request describing the changes.

Please do not include real student information, passwords, authentication secrets, or private school documents in public contributions.

---

## 💬 Feedback and bug reports

I'm sharing this project to make school attendance administration easier and to provide developers with an opportunity to explore and improve the implementation.

If you discover an issue or have an improvement suggestion:

- Describe the affected feature.
- Include steps to reproduce the issue.
- Provide expected and actual behaviour.
- Include relevant non-sensitive error messages.
- Use fictional data when demonstrating problems.

Please avoid sharing confidential school information in public discussions.

Thank you for exploring **Smart School Attendance Management System**! 🎓✨

---

## 👩‍💻 Author

**Jegathayini Thiruchelvam**

- GitHub: [@Jegathayini](https://github.com/Jegathayini)
- Repository: [Smart School Attendance System](https://github.com/Jegathayini/smart_attendance_system)
- Live Demo: [Open application](https://jegathayini.github.io/smart_attendance_system/)

---

---

🎓 **Smart School Attendance Management System** — Making school attendance management simpler, more organized, and more accessible! 🚀
