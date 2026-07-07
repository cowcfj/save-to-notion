export function createJsonResponse({ ok, status, body }) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

export function buildNotionPageResponse(body, overrides = {}) {
  return createJsonResponse({
    ok: true,
    status: 200,
    body,
    ...overrides,
  });
}

export function buildOpenPageRequest(url = 'https://notion.so/test-page') {
  return { url };
}

export function mockNotionApiToken(storageSyncGetMock, notionApiToken) {
  storageSyncGetMock.mockImplementation((_keys, mockCb) => {
    mockCb(notionApiToken ? { notionApiToken } : {});
  });
}

export function mockTabCreationResult(tabsCreateMock, tab) {
  tabsCreateMock.mockImplementation((_options, mockCb) => {
    mockCb(tab);
  });
}
