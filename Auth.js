/**
 * Smart School Attendance Management System
 * Authentication Module (Cached Staff Index + Session GC + Audit Log)
 */

const AUTH_SHEET_ = 'Staff_Access';
const AUTH_HEADERS_ = [
  'Staff_ID', 'Name', 'Username', 'Role', 'Active',
  'PasswordSalt', 'PasswordHash', 'MustChangePassword', 'Created_At', 'Updated_At'
];

const AUTH_TTL_MS_ = 30 * 60 * 1000;
const AUTH_MAX_ATTEMPTS_ = 5;
const AUTH_BLOCK_MS_ = 15 * 60 * 1000;
const AUTH_CLEANUP_INTERVAL_MS_ = 5 * 60 * 1000;

// ---------- DATABASE & CACHED STAFF INDEX ----------

function authSheet_() {
  const sheet = getRequiredSheet(AUTH_SHEET_);
  const headers = sheet.getRange(1, 1, 1, AUTH_HEADERS_.length).getDisplayValues()[0];
  if (headers.join('|') !== AUTH_HEADERS_.join('|')) {
    throw new Error('Staff_Access headers do not match.');
  }
  return sheet;
}

function authStaffCached_() {
  const key = 'STAFF_ALL_' + appCacheVersion_('STAFF');
  const cached = appCacheGet_(key);
  if (cached) return cached;

  const rows = authSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const staffId = String(r[0] || '').trim();
    const username = String(r[2] || '').trim().toLowerCase();
    if (!staffId || !username) continue;
    list.push({
      rowNumber: i + 1,
      staffId,
      name: String(r[1] || ''),
      username,
      role: String(r[3] || ''),
      active: r[4] === true,
      salt: String(r[5] || ''),
      hash: String(r[6] || ''),
      mustChangePassword: r[7] === true
    });
  }
  appCachePut_(key, list, APP_CACHE_TTL_SEC_);
  return list;
}

function authInvalidateStaffCache_() {
  appBumpCacheVersion_('STAFF');
}

function authFind_(username) {
  const user = String(username || '').trim().toLowerCase();
  const hit = authStaffCached_().find(s => s.username === user);
  if (!hit) return null;
  return {
    rowNumber: hit.rowNumber,
    values: [
      hit.staffId, hit.name, hit.username, hit.role, hit.active,
      hit.salt, hit.hash, hit.mustChangePassword
    ]
  };
}

// ---------- AUDIT & SESSION CLEANUP ----------

function authAudit_(actor, action, details, targetUser) {
  const sh = getRequiredSheet('Audit_Log');
  const headers = attHeaders_(sh, []);
  const who = String(actor || 'SYSTEM');
  const record = {
    Audit_ID: Utilities.getUuid(),
    Timestamp: new Date(),
    Date: attToday_(),
    Action: action,
    Event: action,
    Actor: who,
    Username: targetUser || who,
    Performed_By: who,
    Details: details,
    Reason: details
  };
  sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setValues([
    headers.map(h => Object.prototype.hasOwnProperty.call(record, h) ? record[h] : '')
  ]);
}

function authCleanupExpiredSessions_(props, force) {
  const now = Date.now();
  const lastRun = Number(props.getProperty('AUTH_LAST_CLEANUP') || 0);
  if (!force && now - lastRun < AUTH_CLEANUP_INTERVAL_MS_) return;

  const all = props.getProperties();
  Object.keys(all).forEach(k => {
    try {
      if (k.indexOf('AUTH_SESSION_') === 0) {
        const parsed = JSON.parse(all[k]);
        if (!parsed || parsed.expires <= now) props.deleteProperty(k);
      } else if (k.indexOf('AUTH_FAIL_') === 0) {
        const parsed = JSON.parse(all[k]);
        if (parsed && parsed.until > 0 && parsed.until <= now) props.deleteProperty(k);
      }
    } catch (e) {
      props.deleteProperty(k);
    }
  });
  props.setProperty('AUTH_LAST_CLEANUP', String(now));
}

// ---------- PASSWORD UTILITIES ----------

function authDigest_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  ).map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join('');
}

function authRandom_() {
  return [0, 1, 2, 3].map(() => Utilities.getUuid()).join('');
}

function authPepper_() {
  const pepper = PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER');
  if (!pepper) throw new Error('Authentication is not initialized.');
  return pepper;
}

function authPasswordHash_(password, salt) {
  let hash = authDigest_(String(salt) + ':' + String(password) + ':' + authPepper_());
  for (let i = 0; i < 3000; i++) {
    hash = authDigest_(hash + ':' + String(salt));
  }
  return hash;
}

function authVersion_(row) {
  return authDigest_(String(row[5]) + ':' + String(row[6]));
}

function authValidatePassword_(password) {
  const value = String(password || '');
  if (value.length < 14 || value.length > 256) {
    throw new Error('Password must contain 14–256 characters.');
  }
}

function authValidateUsername_(username) {
  const user = String(username || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{3,31}$/.test(user)) {
    throw new Error('Username must contain 4–32 valid characters.');
  }
  return user;
}

function authInitialize(token) {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('AUTH_PEPPER')) {
    authRequire_(token, 'ADMIN');
  } else {
    properties.setProperty('AUTH_PEPPER', authRandom_());
  }
  authSheet_();
  return { success: true };
}

// ---------- LOGIN ----------

function authLogin(username, password) {
  const user = String(username || '').trim().toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const props = PropertiesService.getScriptProperties();
    authCleanupExpiredSessions_(props, false);

    const key = 'AUTH_FAIL_' + authDigest_(user).slice(0, 24);
    const now = Date.now();
    const attempts = JSON.parse(props.getProperty(key) || '{"count":0,"until":0}');
    if (attempts.until > now) {
      throw new Error('Too many login attempts. Try again later.');
    }

    const found = authFind_(user);
    const row = found ? found.values : null;
    const actualHash = authPasswordHash_(
      String(password || ''),
      row ? String(row[5]) : 'dummy'
    );

    const valid = Boolean(
      row &&
      row[4] === true &&
      ['ADMIN', 'TEACHER'].includes(row[3]) &&
      actualHash === String(row[6])
    );

    if (!valid) {
      attempts.count = (attempts.count || 0) + 1;
      if (attempts.count >= AUTH_MAX_ATTEMPTS_) {
        attempts.count = 0;
        attempts.until = now + AUTH_BLOCK_MS_;
      }
      props.setProperty(key, JSON.stringify(attempts));
      throw new Error('Invalid credentials or account temporarily locked.');
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

    const sessionKey = 'AUTH_SESSION_' + authDigest_(token);
    try {
      props.setProperty(sessionKey, JSON.stringify(session));
    } catch (quotaError) {
      authCleanupExpiredSessions_(props, true);
      props.setProperty(sessionKey, JSON.stringify(session));
    }

    return {
      success: true,
      token,
      name: row[1],
      username: user,
      role: row[3],
      staffId: String(row[0]),
      mustChangePassword: row[7] === true,
      expires: session.expires
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------- SESSION VALIDATION ----------

function authRequire_(token, requiredRole) {
  if (typeof token !== 'string' || token.length < 80) {
    throw new Error('Unauthorized. Please sign in.');
  }

  const props = PropertiesService.getScriptProperties();
  const key = 'AUTH_SESSION_' + authDigest_(token);
  const raw = props.getProperty(key);
  if (!raw) throw new Error('Session expired. Sign in again.');

  const session = JSON.parse(raw);
  if (session.expires <= Date.now()) {
    props.deleteProperty(key);
    throw new Error('Session expired. Sign in again.');
  }

  const found = authFind_(session.username);
  if (!found) {
    props.deleteProperty(key);
    throw new Error('Account not found.');
  }

  const row = found.values;
  if (
    row[4] !== true ||
    String(row[0]) !== session.staffId ||
    row[3] !== session.role ||
    authVersion_(row) !== session.version
  ) {
    props.deleteProperty(key);
    throw new Error('Account changed or session invalidated.');
  }

  if (requiredRole === 'ADMIN' && row[3] !== 'ADMIN') {
    throw new Error('Administrator access required.');
  }

  const mustChangePassword = row[7] === true;
  if (
    mustChangePassword &&
    requiredRole !== 'SESSION' &&
    requiredRole !== 'PASSWORD_CHANGE'
  ) {
    throw new Error('Change your temporary password first.');
  }

  return {
    staffId: row[0],
    name: row[1],
    username: session.username,
    role: row[3],
    mustChangePassword,
    expires: session.expires
  };
}

function authSession(token) {
  return authRequire_(token, 'SESSION');
}

function authLogout(token) {
  if (typeof token === 'string' && token.length >= 80) {
    PropertiesService.getScriptProperties().deleteProperty('AUTH_SESSION_' + authDigest_(token));
  }
  return { success: true };
}

// ---------- CHANGE PASSWORD ----------

function authChangePassword(token, currentPassword, newPassword) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const user = authRequire_(token, 'PASSWORD_CHANGE');
    authValidatePassword_(newPassword);
    if (String(currentPassword) === String(newPassword)) {
      throw new Error('Choose a different password.');
    }

    authInvalidateStaffCache_();
    const found = authFind_(user.username);
    if (!found) throw new Error('Account not found.');
    const row = found.values;

    if (authPasswordHash_(String(currentPassword || ''), String(row[5])) !== String(row[6])) {
      throw new Error('Current password is incorrect.');
    }

    const salt = authRandom_();
    const hash = authPasswordHash_(newPassword, salt);
    const sheet = authSheet_();
    const beforeSalt = row[5], beforeHash = row[6], beforeMust = row[7];

    sheet.getRange(found.rowNumber, 6, 1, 3).setValues([[salt, hash, false]]);
    sheet.getRange(found.rowNumber, 10).setValue(new Date());

    try {
      authAudit_(user.username, 'STAFF_PASSWORD_CHANGED', 'User changed own password', user.username);
    } catch (e) {
      sheet.getRange(found.rowNumber, 6, 1, 3).setValues([[beforeSalt, beforeHash, beforeMust]]);
      authInvalidateStaffCache_();
      throw e;
    }

    authInvalidateStaffCache_();
    authLogout(token);
    return { success: true, message: 'Password changed. Please sign in again.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ADMIN: CREATE STAFF ----------

function authCreateStaff(token, name, username, role, temporaryPassword) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const admin = authRequire_(token, 'ADMIN');
    const user = authValidateUsername_(username);
    const displayName = String(name || '').trim();
    const selectedRole = String(role || '').toUpperCase();

    if (!displayName || displayName.length > 120) throw new Error('Enter a valid staff name.');
    if (!['ADMIN', 'TEACHER'].includes(selectedRole)) throw new Error('Invalid staff role.');

    authValidatePassword_(temporaryPassword);
    authInvalidateStaffCache_();
    if (authFind_(user)) throw new Error('Username already exists.');

    const salt = authRandom_();
    const hash = authPasswordHash_(temporaryPassword, salt);
    const staffId = 'STF-' + Utilities.getUuid();
    const now = new Date();
    const sheet = authSheet_();
    const rowNumber = sheet.getLastRow() + 1;

    sheet.getRange(rowNumber, 1, 1, AUTH_HEADERS_.length).setValues([[
      staffId, displayName, user, selectedRole, true, salt, hash, true, now, now
    ]]);

    try {
      authAudit_(admin.username, 'STAFF_CREATED', staffId + ' (' + selectedRole + ') ' + displayName, user);
    } catch (e) {
      sheet.deleteRow(rowNumber);
      authInvalidateStaffCache_();
      throw e;
    }

    authInvalidateStaffCache_();
    return { success: true, staffId, username: user };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ADMIN: LIST STAFF ----------

function authListStaff(token) {
  authRequire_(token, 'ADMIN');
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();

  return authStaffCached_()
    .filter(s => !allProps['AUTH_ARCHIVED_' + authDigest_(s.staffId)])
    .map(s => ({
      staffId: s.staffId,
      name: s.name,
      username: s.username,
      role: s.role,
      active: s.active,
      mustChangePassword: s.mustChangePassword
    }));
}

// ---------- ADMIN: ACTIVATE / DEACTIVATE ----------

function authSetStaffActive(token, staffId, active) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const admin = authRequire_(token, 'ADMIN');
    if (typeof active !== 'boolean') throw new Error('Invalid active status.');
    authInvalidateStaffCache_();

    const staff = authStaffCached_().find(s => s.staffId === String(staffId));
    if (!staff) throw new Error('Staff account not found.');

    if (PropertiesService.getScriptProperties().getProperty('AUTH_ARCHIVED_' + authDigest_(staff.staffId))) {
      throw new Error('Archived accounts cannot be modified.');
    }
    if (staff.staffId === String(admin.staffId)) {
      throw new Error('You cannot deactivate your own account.');
    }

    const sheet = authSheet_();
    const prev = staff.active;
    sheet.getRange(staff.rowNumber, 5).setValue(active);
    sheet.getRange(staff.rowNumber, 10).setValue(new Date());

    try {
      authAudit_(admin.username, active ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED', staff.staffId + ' ' + staff.username, staff.username);
    } catch (e) {
      sheet.getRange(staff.rowNumber, 5).setValue(prev);
      authInvalidateStaffCache_();
      throw e;
    }

    authInvalidateStaffCache_();
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
    const admin = authRequire_(token, 'ADMIN');
    authValidatePassword_(temporaryPassword);
    authInvalidateStaffCache_();

    const staff = authStaffCached_().find(s => s.staffId === String(staffId));
    if (!staff) throw new Error('Staff account not found.');

    if (PropertiesService.getScriptProperties().getProperty('AUTH_ARCHIVED_' + authDigest_(staff.staffId))) {
      throw new Error('Archived accounts cannot be reset.');
    }
    if (staff.staffId === String(admin.staffId)) {
      throw new Error('Use Change Password for your own account.');
    }

    const salt = authRandom_();
    const hash = authPasswordHash_(temporaryPassword, salt);
    const sheet = authSheet_();
    sheet.getRange(staff.rowNumber, 6, 1, 3).setValues([[salt, hash, true]]);
    sheet.getRange(staff.rowNumber, 10).setValue(new Date());

    try {
      authAudit_(admin.username, 'STAFF_PASSWORD_RESET', staff.staffId + ' ' + staff.username, staff.username);
    } catch (e) {
      sheet.getRange(staff.rowNumber, 6, 1, 3).setValues([[staff.salt, staff.hash, staff.mustChangePassword]]);
      authInvalidateStaffCache_();
      throw e;
    }

    authInvalidateStaffCache_();
    return { success: true, message: 'Password reset successfully.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------- ADMIN: ARCHIVE STAFF ----------

function authArchiveStaff(token, staffId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const admin = authRequire_(token, 'ADMIN');
    authInvalidateStaffCache_();

    const staff = authStaffCached_().find(s => s.staffId === String(staffId));
    if (!staff) throw new Error('Staff account not found.');
    if (staff.staffId === String(admin.staffId)) throw new Error('You cannot archive your own account.');
    if (staff.role !== 'TEACHER') throw new Error('Only teacher accounts can be archived.');

    const props = PropertiesService.getScriptProperties();
    const key = 'AUTH_ARCHIVED_' + authDigest_(staff.staffId);
    if (props.getProperty(key)) throw new Error('Account already archived.');

    const sheet = authSheet_();
    sheet.getRange(staff.rowNumber, 5).setValue(false);
    sheet.getRange(staff.rowNumber, 6, 1, 3).setValues([[authRandom_(), authRandom_(), true]]);
    sheet.getRange(staff.rowNumber, 10).setValue(new Date());
    props.setProperty(key, JSON.stringify({ at: new Date().toISOString(), by: admin.username }));

    try {
      authAudit_(admin.username, 'STAFF_ARCHIVED', staff.staffId + ' ' + staff.username, staff.username);
    } catch (e) {
      props.deleteProperty(key);
      sheet.getRange(staff.rowNumber, 5).setValue(staff.active);
      sheet.getRange(staff.rowNumber, 6, 1, 3).setValues([[staff.salt, staff.hash, staff.mustChangePassword]]);
      authInvalidateStaffCache_();
      throw e;
    }

    authInvalidateStaffCache_();
    return { success: true, message: 'Teacher archived. Historical records preserved.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------- INTERNAL SETUP / TEST HELPERS (TRAILING _ LOCKED) ----------

function setupInitialAdmin_() {
  const sheet = authSheet_();
  const props = PropertiesService.getScriptProperties();
  if (sheet.getLastRow() > 1) throw new Error('Staff accounts already exist. Setup stopped.');
  const password = props.getProperty('INITIAL_ADMIN_PASSWORD');
  authValidatePassword_(password);
  const salt = authRandom_();
  const now = new Date();
  sheet.appendRow([
    'ADMIN001', 'Administrator', 'admin', 'ADMIN',
    true, salt, authPasswordHash_(password, salt), true, now, now
  ]);
  props.deleteProperty('INITIAL_ADMIN_PASSWORD');
  authInvalidateStaffCache_();
}

function testAuthSetup_() {
  if (!PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER')) {
    PropertiesService.getScriptProperties().setProperty('AUTH_PEPPER', authRandom_());
  }
  const salt = authRandom_();
  if (authPasswordHash_('TestPassword123!', salt) !== authPasswordHash_('TestPassword123!', salt)) {
    throw new Error('Password hashing test failed.');
  }
  Logger.log('Authentication setup: PASS');
}