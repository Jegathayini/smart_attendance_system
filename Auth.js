
/**
 * Smart School Attendance Management System
 * Authentication Module
 *
 * Prototype only: fictional data.
 * Do not use with real student records without a
 * reviewed production authentication system.
 */

const AUTH_SHEET_ = "Staff_Access";

const AUTH_HEADERS_ = [
  "Staff_ID",
  "Name",
  "Username",
  "Role",
  "Active",
  "PasswordSalt",
  "PasswordHash",
  "MustChangePassword",
  "Created_At",
  "Updated_At"
];

const AUTH_TTL_MS_ = 30 * 60 * 1000;
const AUTH_MAX_ATTEMPTS_ = 5;
const AUTH_BLOCK_MS_ = 15 * 60 * 1000;

// ---------- DATABASE ----------

function authSheet_() {
  const sheet = getRequiredSheet(AUTH_SHEET_);
  const headers = sheet
    .getRange(1, 1, 1, AUTH_HEADERS_.length)
    .getDisplayValues()[0];

  if (headers.join("|") !== AUTH_HEADERS_.join("|")) {
    throw new Error("Staff_Access headers do not match.");
  }
  return sheet;
}

function authRows_() {
  return authSheet_().getDataRange().getValues();
}

function authFind_(username) {
  const user = String(username || "").trim().toLowerCase();
  const rows = authRows_();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]).trim().toLowerCase() === user) {
      return { rowNumber: i + 1, values: rows[i] };
    }
  }
  return null;
}

// ---------- PASSWORD UTILITIES ----------

function authDigest_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  ).map(byte =>
    ("0" + (byte & 255).toString(16)).slice(-2)
  ).join("");
}

function authRandom_() {
  return [0, 1, 2, 3]
    .map(() => Utilities.getUuid())
    .join("");
}

function authPepper_() {
  const pepper = PropertiesService
    .getScriptProperties()
    .getProperty("AUTH_PEPPER");

  if (!pepper) {
    throw new Error("Authentication is not initialized.");
  }
  return pepper;
}

function authPasswordHash_(password, salt) {
  let hash = authDigest_(
    String(salt) + ":" +
    String(password) + ":" +
    authPepper_()
  );

  for (let i = 0; i < 3000; i++) {
    hash = authDigest_(hash + ":" + String(salt));
  }
  return hash;
}

function authVersion_(row) {
  return authDigest_(
    String(row[5]) + ":" + String(row[6])
  );
}

function authValidatePassword_(password) {
  const value = String(password || "");
  if (value.length < 14 || value.length > 256) {
    throw new Error("Password must contain 14–256 characters.");
  }
}

function authValidateUsername_(username) {
  const user = String(username || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{3,31}$/.test(user)) {
    throw new Error("Username must contain 4–32 valid characters.");
  }
  return user;
}

function authInitialize() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty("AUTH_PEPPER")) {
    properties.setProperty("AUTH_PEPPER", authRandom_());
  }
  authSheet_();
  Logger.log("Authentication initialized successfully.");
}

// ---------- LOGIN ----------

function authLogin(username, password) {
  const user = String(username || "").trim().toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const props = PropertiesService.getScriptProperties();
    const key = "AUTH_FAIL_" + authDigest_(user).slice(0, 24);
    const now = Date.now();
    const attempts = JSON.parse(
      props.getProperty(key) || '{"count":0,"until":0}'
    );

    if (attempts.until > now) {
      throw new Error("Too many login attempts. Try again later.");
    }

    const found = authFind_(user);
    const row = found ? found.values : null;
    const actualHash = authPasswordHash_(
      String(password || ""),
      row ? String(row[5]) : "dummy"
    );

    const valid = Boolean(
      row &&
      row[4] === true &&
      ["ADMIN", "TEACHER"].includes(row[3]) &&
      actualHash === String(row[6])
    );

    if (!valid) {
      attempts.count = (attempts.count || 0) + 1;
      if (attempts.count >= AUTH_MAX_ATTEMPTS_) {
        attempts.count = 0;
        attempts.until = now + AUTH_BLOCK_MS_;
      }
      props.setProperty(key, JSON.stringify(attempts));
      throw new Error(
        "Invalid credentials or account temporarily locked."
      );
    }

    props.deleteProperty(key);
    const token = authRandom_();
    const session = {
      staffId: String(row[0]),
      username: user,
      role: row[3],
      version: authVersion_(row),
      expires: now + AUTH_TTL_MS_
    };

    props.setProperty(
      "AUTH_SESSION_" + authDigest_(token),
      JSON.stringify(session)
    );

    return {
      success: true,
      token: token,
      name: row[1],
      username: user,
      role: row[3],
      mustChangePassword: row[7] === true,
      expires: session.expires
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------- SESSION VALIDATION ----------

function authRequire_(token, requiredRole) {
  if (typeof token !== "string" || token.length < 80) {
    throw new Error("Unauthorized. Please sign in.");
  }

  const props = PropertiesService.getScriptProperties();
  const key = "AUTH_SESSION_" + authDigest_(token);
  const raw = props.getProperty(key);

  if (!raw) {
    throw new Error("Session expired. Sign in again.");
  }

  const session = JSON.parse(raw);
  if (session.expires <= Date.now()) {
    props.deleteProperty(key);
    throw new Error("Session expired. Sign in again.");
  }

  const found = authFind_(session.username);
  if (!found) {
    props.deleteProperty(key);
    throw new Error("Account not found.");
  }

  const row = found.values;
  if (
    row[4] !== true ||
    String(row[0]) !== session.staffId ||
    row[3] !== session.role ||
    authVersion_(row) !== session.version
  ) {
    props.deleteProperty(key);
    throw new Error("Account changed or session invalidated.");
  }

  if (requiredRole === "ADMIN" && row[3] !== "ADMIN") {
    throw new Error("Administrator access required.");
  }

  const mustChangePassword = row[7] === true;
  if (
    mustChangePassword &&
    requiredRole !== "SESSION" &&
    requiredRole !== "PASSWORD_CHANGE"
  ) {
    throw new Error("Change your temporary password first.");
  }

  return {
    staffId: row[0],
    name: row[1],
    username: session.username,
    role: row[3],
    mustChangePassword: mustChangePassword,
    expires: session.expires
  };
}

function authSession(token) {
  return authRequire_(token, "SESSION");
}

function authLogout(token) {
  if (typeof token === "string" && token.length >= 80) {
    PropertiesService.getScriptProperties().deleteProperty(
      "AUTH_SESSION_" + authDigest_(token)
    );
  }
  return { success: true };
}

// ---------- CHANGE PASSWORD ----------

function authChangePassword(token, currentPassword, newPassword) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const user = authRequire_(token, "PASSWORD_CHANGE");
    authValidatePassword_(newPassword);

    if (String(currentPassword) === String(newPassword)) {
      throw new Error("Choose a different password.");
    }

    const found = authFind_(user.username);
    if (!found) throw new Error("Account not found.");
    const row = found.values;

    if (
      authPasswordHash_(
        String(currentPassword || ""),
        String(row[5])
      ) !== String(row[6])
    ) {
      throw new Error("Current password is incorrect.");
    }

    const salt = authRandom_();
    const hash = authPasswordHash_(newPassword, salt);
    const sheet = authSheet_();

    sheet.getRange(found.rowNumber, 6, 1, 3)
      .setValues([[salt, hash, false]]);
    sheet.getRange(found.rowNumber, 10)
      .setValue(new Date());

    authLogout(token);
    return {
      success: true,
      message: "Password changed. Please sign in again."
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ADMIN: CREATE STAFF ----------

function authCreateStaff(token, name, username, role, temporaryPassword) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const admin = authRequire_(token, "ADMIN");
    const user = authValidateUsername_(username);
    const displayName = String(name || "").trim();
    const selectedRole = String(role || "").toUpperCase();

    if (!displayName || displayName.length > 120) {
      throw new Error("Enter a valid staff name.");
    }
    if (!["ADMIN", "TEACHER"].includes(selectedRole)) {
      throw new Error("Invalid staff role.");
    }

    authValidatePassword_(temporaryPassword);
    if (authFind_(user)) {
      throw new Error("Username already exists.");
    }

    const salt = authRandom_();
    const hash = authPasswordHash_(temporaryPassword, salt);
    const staffId = "STF-" + Utilities.getUuid();
    const now = new Date();

    authSheet_().appendRow([
      staffId, displayName, user, selectedRole, true,
      salt, hash, true, now, now
    ]);

    Logger.log("Staff account created by " + admin.username);
    return { success: true, staffId, username: user };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ADMIN: LIST STAFF ----------

function authListStaff(token) {
  authRequire_(token, "ADMIN");
  const props = PropertiesService.getScriptProperties();

  return authRows_().slice(1)
    .filter(row => !props.getProperty(
      "AUTH_ARCHIVED_" + authDigest_(String(row[0]))
    ))
    .map(row => ({
      staffId: row[0],
      name: row[1],
      username: row[2],
      role: row[3],
      active: row[4] === true,
      mustChangePassword: row[7] === true
    }));
}

// ---------- ADMIN: ACTIVATE / DEACTIVATE ----------

function authSetStaffActive(token, staffId, active) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const admin = authRequire_(token, "ADMIN");
    const rows = authRows_();
    const index = rows.findIndex(
      (row, i) => i > 0 && String(row[0]) === String(staffId)
    );

    if (index < 1) throw new Error("Staff account not found.");
    const row = rows[index];

    if (PropertiesService.getScriptProperties().getProperty(
      "AUTH_ARCHIVED_" + authDigest_(String(row[0]))
    )) {
      throw new Error("Archived accounts cannot be modified.");
    }

    if (String(row[0]) === String(admin.staffId)) {
      throw new Error("You cannot deactivate your own account.");
    }
    if (typeof active !== "boolean") {
      throw new Error("Invalid active status.");
    }

    const sheet = authSheet_();
    sheet.getRange(index + 1, 5).setValue(active);
    sheet.getRange(index + 1, 10).setValue(new Date());
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ADMIN: RESET PASSWORD ----------

function authResetStaffPassword(token, staffId, temporaryPassword) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const admin = authRequire_(token, "ADMIN");
    authValidatePassword_(temporaryPassword);
    const rows = authRows_();
    const index = rows.findIndex(
      (row, i) => i > 0 && String(row[0]) === String(staffId)
    );

    if (index < 1) throw new Error("Staff account not found.");

    if (PropertiesService.getScriptProperties().getProperty(
      "AUTH_ARCHIVED_" + authDigest_(String(rows[index][0]))
    )) {
      throw new Error("Archived accounts cannot be reset.");
    }

    if (String(rows[index][0]) === String(admin.staffId)) {
      throw new Error("Use Change Password for your own account.");
    }

    const salt = authRandom_();
    const hash = authPasswordHash_(temporaryPassword, salt);
    const sheet = authSheet_();

    sheet.getRange(index + 1, 6, 1, 3)
      .setValues([[salt, hash, true]]);
    sheet.getRange(index + 1, 10)
      .setValue(new Date());

    return {
      success: true,
      message: "Password reset successfully."
    };
  } finally {
    lock.releaseLock();
  }
}


function setupInitialAdmin() {
  const sheet = authSheet_();
  const props = PropertiesService.getScriptProperties();

  if (sheet.getLastRow() > 1) {
    throw new Error("Staff accounts already exist. Setup stopped.");
  }

  const password = props.getProperty("INITIAL_ADMIN_PASSWORD");
  authValidatePassword_(password);

  const salt = authRandom_();
  const now = new Date();

  sheet.appendRow([
    "ADMIN001", "Administrator", "admin", "ADMIN",
    true, salt, authPasswordHash_(password, salt),
    true, now, now
  ]);

  props.deleteProperty("INITIAL_ADMIN_PASSWORD");
  Logger.log("Initial admin account created.");
}

function testAuthSetup() {
  authInitialize();
  const salt = authRandom_();
  const first = authPasswordHash_("TestPassword123!", salt);
  const second = authPasswordHash_("TestPassword123!", salt);

  if (first !== second) {
    throw new Error("Password hashing test failed.");
  }

  Logger.log("Authentication setup: PASS");
  Logger.log("Password hashing: PASS");
}

function testAdminAccountStatus() {
  const found = authFind_("admin");
  if (!found) {
    Logger.log("Admin account: NOT FOUND");
    return;
  }

  const row = found.values;
  Logger.log("Admin account: FOUND");
  Logger.log("Role: " + row[3]);
  Logger.log("Active: " + row[4]);
  Logger.log("Password salt exists: " + Boolean(row[5]));
  Logger.log("Password hash exists: " + Boolean(row[6]));
  Logger.log("Must change password: " + row[7]);

  const props = PropertiesService.getScriptProperties();
  const key = "AUTH_FAIL_" + authDigest_("admin").slice(0, 24);
  const attempts = JSON.parse(
    props.getProperty(key) || '{"count":0,"until":0}'
  );

  Logger.log("Login temporarily locked: " + (attempts.until > Date.now()));
}

function testAdminPasswordCompatibility() {
  const found = authFind_("admin");
  if (!found) throw new Error("Admin account not found.");

  const storedHash = String(found.values[6]);
  Logger.log("Stored hash length: " + storedHash.length);
  Logger.log(
    "Current hash function length: " +
    authPasswordHash_("FormatCheck123!", "test-salt").length
  );
}

function testHashFormat() {
  const hash = authPasswordHash_("TestPassword123!", "test-salt");
  if (hash.length !== 64) {
    throw new Error("Expected 64-character hash.");
  }
  Logger.log("Hash format: PASS");
}

function testExistingAdminPassword() {
  const props = PropertiesService.getScriptProperties();
  const password = props.getProperty("ADMIN_VERIFY_PASSWORD");

  if (!password) {
    throw new Error("Set ADMIN_VERIFY_PASSWORD in Script Properties.");
  }

  try {
    const found = authFind_("admin");
    if (!found) throw new Error("Admin account not found.");

    const row = found.values;
    const calculatedHash = authPasswordHash_(
      password, String(row[5])
    );

    Logger.log(
      calculatedHash === String(row[6])
        ? "Admin password verification: PASS"
        : "Admin password verification: FAILED"
    );
  } finally {
    props.deleteProperty("ADMIN_VERIFY_PASSWORD");
  }
}

// ADMIN: ARCHIVE STAFF
function authArchiveStaff(token, staffId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const admin = authRequire_(token, "ADMIN");
    const rows = authRows_();
    const idx = rows.findIndex(
      (row, i) => i > 0 && String(row[0]) === String(staffId)
    );

    if (idx < 1) throw new Error("Staff account not found.");

    const row = rows[idx];
    if (String(row[0]) === String(admin.staffId)) {
      throw new Error("You cannot archive your own account.");
    }
    if (String(row[3]) !== "TEACHER") {
      throw new Error("Only teacher accounts can be archived.");
    }

    const props = PropertiesService.getScriptProperties();
    const key = "AUTH_ARCHIVED_" + authDigest_(String(staffId));
    if (props.getProperty(key)) {
      throw new Error("Account already archived.");
    }

    const sheet = authSheet_();
    sheet.getRange(idx + 1, 5).setValue(false);
    sheet.getRange(idx + 1, 6, 1, 3)
      .setValues([[authRandom_(), authRandom_(), true]]);
    sheet.getRange(idx + 1, 10).setValue(new Date());

    props.setProperty(key, JSON.stringify({
      at: new Date().toISOString(),
      by: admin.username
    }));

    return {
      success: true,
      message: "Teacher archived. Historical records preserved."
    };
  } finally {
    lock.releaseLock();
  }
}
