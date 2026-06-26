export function installBlobPolyfill() {
  if (globalThis.Blob !== undefined) {
    return;
  }

  globalThis.Blob = class Blob {
    constructor(parts = []) {
      const encoder = new TextEncoder();
      const normalizedParts = Array.isArray(parts) ? parts : [parts];
      this._chunks = normalizedParts.map(part => {
        if (part instanceof ArrayBuffer) {
          return new Uint8Array(part);
        }
        if (ArrayBuffer.isView(part)) {
          return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
        }
        return encoder.encode(String(part ?? ''));
      });
      this.size = this._chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    }

    async arrayBuffer() {
      const merged = new Uint8Array(this.size);
      let offset = 0;
      for (const chunk of this._chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return merged.buffer;
    }
  };
}

export function buildStorageManagerTestDom() {
  document.body.innerHTML = `
    <button id="export-data-button"></button>
    <button id="import-data-button"></button>
    <input type="file" id="import-data-file" />
    <div id="data-status"></div>
    <button id="refresh-usage-button"><span class="icon"></span><span class="button-text">刷新統計</span></button>
    <div id="usage-fill"></div>
    <div id="usage-percentage"></div>
    <div id="usage-details"></div>
    <div id="pages-count"></div>
    <div id="highlights-count"></div>
    <div id="config-count"></div>
    <output id="health-status"></output>
    <button id="execute-cleanup-button" class="hidden"></button>
    <div id="cleanup-status" class="status-message mt-sm"></div>
  `;
}

export function buildChromeMock(mockGet, mockSet, mockRemove) {
  return {
    storage: {
      local: {
        get: mockGet ?? jest.fn(),
        set:
          mockSet ??
          jest.fn((_data, cb) => {
            cb?.();
            return Promise.resolve();
          }),
        remove: mockRemove ?? jest.fn(),
      },
    },
    runtime: {
      lastError: null,
      getManifest: jest.fn(() => ({ version: '2.0.0' })),
      sendMessage: jest.fn(),
    },
  };
}

export function buildFileEvent(data) {
  const text = JSON.stringify({ data });
  const fileLike = { text: jest.fn().mockResolvedValue(text) };

  const input = document.querySelector('#import-data-file');
  if (input) {
    Object.defineProperty(input, 'value', {
      configurable: true,
      writable: true,
      value: String.raw`C:\fakepath\backup.json`,
    });
    Object.defineProperty(input, 'files', {
      configurable: true,
      writable: true,
      value: [fileLike],
    });
  }

  return { target: { files: [fileLike] } };
}

export function getModeButton(storageManager, mode) {
  return storageManager.elements.dataStatus.querySelector(`button[data-mode="${mode}"]`);
}
