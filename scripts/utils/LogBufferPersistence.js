/* global chrome */

const STORAGE_KEY = '_logBuffer';
const ALARM_NAME = 'log-buffer-flush';
const ALARM_PERIOD_MINUTES = 1;

let _buffer = null;

async function flush() {
  if (!_buffer?.isDirty()) {
    return;
  }
  const entries = _buffer.getAll();
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: entries });
    _buffer.markClean();
  } catch {
    // quota exceeded 或 session storage 不可用時保留 dirty 狀態，下次重試
  }
}

async function restore() {
  if (!_buffer) {
    return;
  }
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY);
    const entries = result[STORAGE_KEY];
    _buffer.restoreFrom(Array.isArray(entries) ? entries : []);
  } catch {
    _buffer.restoreFrom([]);
  }
}

function handleAlarm(alarm) {
  if (alarm.name === ALARM_NAME) {
    flush();
  }
}

export const LogBufferPersistence = {
  async init(logBuffer) {
    _buffer = logBuffer;
    _buffer.prepareRestore();
    await restore();
    if (!chrome.alarms) {
      return;
    }
    chrome.alarms.onAlarm.addListener(handleAlarm);
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  },

  flush,
  restore,

  _reset() {
    _buffer = null;
    if (chrome.alarms) {
      chrome.alarms.onAlarm.removeListener(handleAlarm);
      chrome.alarms.clear(ALARM_NAME);
    }
  },
};
