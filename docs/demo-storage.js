/**
 * Smart School Attendance System — LocalStorage State Engine
 * Persists interactive demo changes across page reloads and provides Reset Demo Data.
 */
(function (global) {
  'use strict';

  const STATE_KEY = 'SMART_ATTENDANCE_DEMO_STATE_V1';
  const SESSION_KEY = 'SMART_ATTENDANCE_DEMO_SESSION_V1';
  let memoryState = null;
  let memorySession = null;

  function safeGet(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      global.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeRemove(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (e) {}
  }

  function load() {
    if (memoryState) return memoryState;
    const raw = safeGet(STATE_KEY);
    if (raw) {
      try {
        memoryState = JSON.parse(raw);
        return memoryState;
      } catch (e) {}
    }
    memoryState = global.DemoData.buildDefaultDemoState();
    save(memoryState);
    return memoryState;
  }

  function save(state) {
    memoryState = state;
    safeSet(STATE_KEY, JSON.stringify(state));
  }

  function reset() {
    memoryState = global.DemoData.buildDefaultDemoState();
    safeSet(STATE_KEY, JSON.stringify(memoryState));
    return memoryState;
  }

  function getSession() {
    if (memorySession) return memorySession;
    const raw = safeGet(SESSION_KEY);
    if (raw) {
      try {
        memorySession = JSON.parse(raw);
        return memorySession;
      } catch (e) {}
    }
    return null;
  }

  function setSession(session) {
    memorySession = session;
    if (session) safeSet(SESSION_KEY, JSON.stringify(session));
    else safeRemove(SESSION_KEY);
  }

  global.DemoStorage = {
    load,
    save,
    reset,
    getSession,
    setSession
  };
})(window);